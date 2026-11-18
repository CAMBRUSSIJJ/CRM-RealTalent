"""Authenticated hosted Garimpo. Every execution stays inside an active HTTP request.

Containers may scale to zero: jobs, leases and checkpoints are stored in Supabase.
No local connector, service-role key, global engine token, or LLM is required.
"""
import asyncio
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from datetime import date
import hashlib
import json
import os
from pathlib import Path
from uuid import UUID

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from . import __version__
from .config import Settings
from .engine import Engine
from .hosted_store import RemoteStore
from .maps_setup import verify_browser
from .models import Candidate, SearchRequest, normalized, now, valid_cnpj, phone_number, website_url
from .providers import eligible_site
from .network import HTTP, SourceError
from .store import IdempotencyConflict, QueueFull, Store, public_job


class CompanyRecheckRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    company: str = Field(min_length=2, max_length=200)
    city: str = Field(default='', max_length=100)
    state: str = Field(default='RS', min_length=2, max_length=2)
    cnpj: str = Field(default='', max_length=18)
    website: str = Field(default='', max_length=500)
    phone: str = Field(default='', max_length=35)
    address: str = Field(default='', max_length=300)


@dataclass
class Scope:
    organization_id: str
    user_id: str
    role: str
    token: str


def create_app(settings=None, *, auth_transport=None, store_factory=None, preflight=verify_browser):
    settings = settings or Settings.from_env()
    supabase_url = os.environ.get('SUPABASE_URL', '').rstrip('/')
    public_key = os.environ.get('SUPABASE_PUBLISHABLE_KEY', '')
    if not supabase_url.startswith('https://') or not public_key:
        raise ValueError('Configure a URL e a chave pública do Supabase no serviço hospedado.')
    cache = Store(settings.db_path)

    @asynccontextmanager
    async def lifespan(app):
        # Fail readiness before accepting research when the image cannot run its browser.
        if not settings.maps_binary or not settings.maps_binary.is_file():
            raise RuntimeError('Coletor Maps ausente na imagem do motor.')
        await asyncio.to_thread(preflight)
        app.state.ready = True
        yield
        app.state.ready = False

    app = FastAPI(title='Garimpo hospedado', version=__version__, lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url=None)
    app.state.ready = False

    async def authorize(authorization: str = Header(default='', max_length=8192),
                        x_workspace_id: UUID = Header()):
        if not authorization.startswith('Bearer ') or len(authorization) < 20:
            raise HTTPException(401, 'Entre novamente no CRM para pesquisar.')
        token = authorization[7:]
        try:
            async with httpx.AsyncClient(base_url=supabase_url, timeout=12, transport=auth_transport,
                headers={'apikey': public_key, 'Authorization': authorization}, follow_redirects=False) as client:
                user = await client.get('/auth/v1/user')
                if user.status_code != 200:
                    raise HTTPException(401, 'Sessão inválida ou expirada. Entre novamente no CRM.')
                uid = str(UUID(user.json()['id']))
                membership = await client.get('/rest/v1/organization_members', params={
                    'organization_id': 'eq.' + str(x_workspace_id), 'user_id': 'eq.' + uid, 'select': 'role', 'limit': '1'})
                if membership.is_error:
                    raise HTTPException(503, 'Não foi possível verificar o acesso ao workspace.')
                rows = membership.json()
                if not rows:
                    raise HTTPException(403, 'Você não tem acesso a este workspace.')
                return Scope(str(x_workspace_id), uid, rows[0]['role'], token)
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise HTTPException(503, 'Não foi possível verificar a sessão. Tente novamente.') from exc

    def writable(scope):
        if scope.role not in {'owner', 'admin', 'member'}:
            raise HTTPException(403, 'Seu acesso permite apenas consultar os resultados.')

    @asynccontextmanager
    async def resources(scope):
        with httpx.Client(base_url=supabase_url, timeout=12, headers={
            'apikey': public_key, 'Authorization': 'Bearer ' + scope.token}, follow_redirects=False) as db:
            store = store_factory(scope) if store_factory else RemoteStore(db, scope.organization_id, cache)
            http = HTTP(settings, store)
            try:
                yield store, Engine(http, store)
            finally:
                await http.close()

    def found(store, job_id):
        job = store.get(str(job_id))
        if job is None:
            raise HTTPException(404, 'Pesquisa não encontrada neste workspace.')
        return job

    def key_for(scope, key, parent=''):
        return hashlib.sha256(f'{scope.organization_id}:{parent}:{key}'.encode()).hexdigest()

    @app.get('/api/garimpo/health')
    async def health():
        return JSONResponse({'status': 'ready' if app.state.ready else 'unavailable', 'version': __version__},
                            status_code=200 if app.state.ready else 503)

    @app.get('/api/garimpo/capabilities')
    async def capabilities(scope=Depends(authorize)):
        return {'ready': app.state.ready, 'version': __version__, 'hosted': True,
                'max_results': 100, 'provider': 'maps', 'can_write': scope.role in {'owner','admin','member'}}

    @app.get('/api/garimpo/index')
    async def company_index(
        scope=Depends(authorize),
        state: str = Query(default='RS', min_length=2, max_length=2),
        city: str = Query(default='', max_length=100),
        cnae: str = Query(default='', max_length=7),
        name: str = Query(default='', max_length=120),
        active_only: bool = Query(default=True),
        headquarters: bool | None = Query(default=None),
        opened_after: str = Query(default='', max_length=10),
        opened_before: str = Query(default='', max_length=10),
        cnae_scope: str = Query(default='any', pattern='^(any|main|secondary)
        offset: int = Query(default=0, ge=0, le=10000),
    ):
        """Read-only official RFB register, scoped to an authenticated CRM workspace.

        This does not collect or imply verified working contacts, and never
        joins third-party profiles or personal data.
        """
        if state.upper() != 'RS':
            raise HTTPException(422, 'O piloto do índice CNPJ cobre somente o Rio Grande do Sul.')
        if cnae and (not cnae.isascii() or not cnae.isdigit() or len(cnae) < 2):
            raise HTTPException(422, 'Digite um CNAE com 2 a 7 números.')
        try:
            start_date = date.fromisoformat(opened_after) if opened_after else None
            end_date = date.fromisoformat(opened_before) if opened_before else None
        except ValueError:
            raise HTTPException(422, 'Informe datas válidas no formato AAAA-MM-DD.') from None
        if start_date and end_date and start_date > end_date:
            raise HTTPException(422, 'A data inicial deve ser anterior à final.')
        cnpj = ''.join(ch for ch in name if ch.isascii() and ch.isdigit())
        name_query = cnpj if len(cnpj) == 14 and all(ch.isdigit() or ch in './- ' for ch in name) else normalized(name)
        params = {'p_org': scope.organization_id, 'p_uf': 'RS',
                  'p_city': normalized(city), 'p_cnae': cnae or None,
                  'p_name': name_query, 'p_only_active': active_only,
                  'p_headquarters': headquarters, 'p_opened_after': opened_after or None,
                  'p_opened_before': opened_before or None, 'p_cnae_scope': cnae_scope,
                  'p_limit': limit, 'p_offset': offset}
        try:
            async with httpx.AsyncClient(
                base_url=supabase_url, timeout=15, transport=auth_transport,
                headers={'apikey': public_key, 'Authorization': 'Bearer ' + scope.token},
                follow_redirects=False
            ) as client:
                result = await client.post(
                    '/rest/v1/rpc/realtalent_company_index_search', json=params)
        except httpx.HTTPError as exc:
            raise HTTPException(503, 'A base empresarial não respondeu. Tente novamente.') from exc
        if result.status_code in {404, 406} or 'PGRST202' in result.text:
            raise HTTPException(503, 'O índice CNPJ ainda não está instalado neste ambiente.')
        if result.status_code in {401, 403}:
            raise HTTPException(403, 'Você não tem acesso ao índice neste workspace.')
        if result.is_error:
            raise HTTPException(503, 'A consulta ao índice empresarial falhou.')
        return result.json()

    @app.post('/api/garimpo/companies/recheck')
    async def recheck_company(data: CompanyRecheckRequest, scope=Depends(authorize)):
        """Recheck one known company; return *proposals*, never mutate CRM records.

        Official CNPJ observations and third-party website evidence remain distinct.
        Always fetch website pages fresh while respecting robots, SSRF controls,
        same-site redirects, and identity checks before attributing contacts.
        """
        writable(scope)
        if data.state.upper() not in {'RS', 'SC', 'SP', 'PR', 'MG', 'RJ', 'BA', 'ES', 'GO', 'DF',
                                      'MT', 'MS', 'TO', 'AM', 'PA', 'AC', 'AP', 'RO', 'RR',
                                      'MA', 'PI', 'CE', 'RN', 'PB', 'PE', 'AL', 'SE'}:
            raise HTTPException(422, 'Informe uma UF válida.')
        cnpj = valid_cnpj(data.cnpj) if data.cnpj else ''
        if data.cnpj and not cnpj:
            raise HTTPException(422, 'O CNPJ informado é inválido.')
        url = website_url(data.website) if data.website else ''
        if data.website and (not url or not eligible_site(url)):
            raise HTTPException(422, 'Informe o site público oficial da empresa, não uma rede social ou diretório.')
        if not cnpj and not url:
            raise HTTPException(422, 'Informe CNPJ ou site oficial para revisar a empresa.')

        checked_at = now()
        observations, warnings, sources = [], [], []
        if cnpj and data.state.upper() == 'RS':
            # This source covers registered corporate details, not published contacts.
            try:
                async with httpx.AsyncClient(
                    base_url=supabase_url, timeout=12, transport=auth_transport,
                    headers={'apikey': public_key, 'Authorization': 'Bearer ' + scope.token},
                    follow_redirects=False
                ) as client:
                    result = await client.post('/rest/v1/rpc/realtalent_company_index_search',
                        json={'p_org': scope.organization_id, 'p_uf': 'RS', 'p_city': '',
                              'p_cnae': None, 'p_name': cnpj, 'p_only_active': False,
                              'p_limit': 2, 'p_offset': 0})
                if result.status_code == 200:
                    matches = [row for row in result.json().get('items', [])
                               if row.get('cnpj') == cnpj]
                    if matches:
                        source = matches[0]
                        sources.append('CNPJ / Receita Federal')
                        for field, value in (('legal_name', source.get('legal_name')),
                                             ('trade_name', source.get('trade_name')),
                                             ('main_cnae', source.get('main_cnae')),
                                             ('status', source.get('status')),
                                             ('opened_on', source.get('opened_on'))):
                            if value:
                                observations.append({'field': field, 'value': str(value),
                                    'source': 'Cadastro CNPJ / Receita Federal',
                                    'url': source.get('source_url',''),
                                    'observed_at': source.get('source_month',''),
                                    'kind': 'register'})
                    else:
                        warnings.append('CNPJ não encontrado no recorte disponível do índice empresarial.')
                else:
                    warnings.append('Índice cadastral ainda não disponível para nova consulta.')
            except (httpx.HTTPError, ValueError, TypeError, KeyError):
                warnings.append('Não foi possível consultar o índice cadastral nesta tentativa.')
        elif cnpj:
            warnings.append('O índice cadastral de revisão cobre RS neste piloto.')

        if url:
            item = Candidate(provider_id='recheck:' + hashlib.sha256((scope.organization_id + ':' + data.company).encode()).hexdigest()[:24],
                             company=data.company, city=data.city, state=data.state.upper(),
                             cnpj=cnpj, phone=phone_number(data.phone), address=data.address,
                             website=url)
            try:
                async with resources(scope) as (_store, engine):
                    async with asyncio.timeout(32):
                        item = await engine.collector.collect(item, require_identity=True, refresh=True)
                if item.website_matched:
                    sources.append('Site institucional')
                    for evidence in item.evidence:
                        if evidence.field in {'phone','email','instagram','address','website','city','cnpj'}:
                            observations.append({**evidence.model_dump(), 'kind': 'website'})
                else:
                    warnings.append('Identidade da empresa/filial não corroborada no site; contatos não atribuídos.')
                warnings.extend(item.warnings)
            except TimeoutError:
                warnings.append('O site excedeu o tempo de verificação. Nenhum dado foi alterado.')
            except SourceError:
                warnings.append('O site não pôde ser consultado com segurança.')
        else:
            warnings.append('Site oficial ausente. A revisão cobriu somente informações cadastrais.')
        unique = {(o['field'], o['value'], o['url']): o for o in observations}
        return {'checked_at': checked_at, 'company': data.company, 'cnpj': cnpj,
                'sources': sources, 'observations': list(unique.values())[:40],
                'warnings': list(dict.fromkeys(warnings))[:15],
                'no_changes_applied': True}

    @app.get('/api/garimpo/searches')
    async def history(scope=Depends(authorize)):
        async with resources(scope) as (store, _):
            return [public_job(job) for job in store.list()]

    @app.post('/api/garimpo/searches', status_code=202)
    async def create(request: SearchRequest, scope=Depends(authorize),
                     idempotency_key: str = Header(min_length=8, max_length=128)):
        writable(scope)
        # One supported operational path. Do not silently switch to another source.
        if request.provider != 'maps' or request.qualify:
            raise HTTPException(422, 'Esta versão pesquisa no Google Maps e nos sites publicados, sem IA.')
        async with resources(scope) as (store, _):
            return public_job(store.create(request, idempotency_key=key_for(scope, idempotency_key)))

    @app.get('/api/garimpo/searches/{job_id}')
    async def get(job_id: UUID, scope=Depends(authorize)):
        async with resources(scope) as (store, _):
            return public_job(found(store, job_id))

    @app.post('/api/garimpo/searches/{job_id}/cancel')
    async def cancel(job_id: UUID, scope=Depends(authorize)):
        writable(scope)
        async with resources(scope) as (store, _):
            found(store, job_id)
            return public_job(store.cancel(str(job_id)))

    @app.post('/api/garimpo/searches/{job_id}/resume', status_code=202)
    async def resume(job_id: UUID, scope=Depends(authorize),
                     idempotency_key: str = Header(min_length=8, max_length=128)):
        writable(scope)
        async with resources(scope) as (store, engine):
            original = found(store, job_id)
            if not public_job(original)['can_resume']:
                raise HTTPException(409, 'Esta pesquisa ainda está ativa ou já foi concluída.')
            job = store.create(SearchRequest.model_validate(original['request']), seed_checkpoint=original,
                               parent_job_id=str(job_id), idempotency_key=key_for(scope, idempotency_key, str(job_id)))
            # Results are rebuilt and saved when execution claims the new checkpoint.
            engine.review(job)
            return public_job(job)

    @app.post('/api/garimpo/searches/{job_id}/run')
    async def run(job_id: UUID, scope=Depends(authorize)):
        writable(scope)
        # Validate scope before returning a streaming response with a 200 status.
        async with resources(scope) as (store, _):
            found(store, job_id)

        async def stream():
            async with resources(scope) as (store, engine):
                task = asyncio.create_task(engine.run_one(str(job_id)))
                try:
                    async with asyncio.timeout(240):
                        while not task.done():
                            yield json.dumps({'event': 'progress', 'job': public_job(found(store, job_id))}) + '\n'
                            await asyncio.wait({task}, timeout=3)
                        await task
                        yield json.dumps({'event': 'finished', 'job': public_job(found(store, job_id))}) + '\n'
                except (RuntimeError, SourceError, TimeoutError, httpx.HTTPError):
                    yield json.dumps({'event':'error','message':'A execução foi interrompida. Os dados salvos continuam disponíveis; verifique e retome a pesquisa.'}) + '\n'
                finally:
                    task.cancel()
                    with suppress(asyncio.CancelledError, Exception):
                        await task
        return StreamingResponse(stream(), media_type='application/x-ndjson', headers={'X-Accel-Buffering': 'no'})

    @app.exception_handler(QueueFull)
    async def queue_error(_request, _error):
        return JSONResponse({'detail':'Você já tem três pesquisas ativas. Conclua ou cancele uma delas.'}, status_code=429)

    @app.exception_handler(IdempotencyConflict)
    async def idem_error(_request, _error):
        return JSONResponse({'detail':'Este identificador já foi usado em outra pesquisa.'}, status_code=409)

    @app.exception_handler(RuntimeError)
    async def persistence_error(_request, _error):
        return JSONResponse({'detail':'O armazenamento da pesquisa está indisponível. Tente novamente.'}, status_code=503)

    @app.middleware('http')
    async def private_response(request, call_next):
        if request.method == 'POST':
            length = request.headers.get('content-length', '0')
            if not length.isascii() or not length.isdecimal() or len(length) > 6 or int(length) > 16384:
                return JSONResponse({'detail':'A pesquisa excedeu o limite de tamanho.'}, status_code=413)
            total = 0
            chunks = []
            async for chunk in request.stream():
                total += len(chunk)
                if total > 16384:
                    return JSONResponse({'detail':'A pesquisa excedeu o limite de tamanho.'}, status_code=413)
                chunks.append(chunk)
            request._body = b''.join(chunks)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    return app


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(create_app(), host='0.0.0.0', port=int(os.getenv('PORT', '80')), access_log=False)
),
        limit: int = Query(default=30, ge=1, le=100),
        offset: int = Query(default=0, ge=0, le=10000),
    ):
        """Read-only official RFB register, scoped to an authenticated CRM workspace.

        This does not collect or imply verified working contacts, and never
        joins third-party profiles or personal data.
        """
        if state.upper() != 'RS':
            raise HTTPException(422, 'O piloto do índice CNPJ cobre somente o Rio Grande do Sul.')
        if cnae and (not cnae.isascii() or not cnae.isdigit() or len(cnae) < 2):
            raise HTTPException(422, 'Digite um CNAE com 2 a 7 números.')
        cnpj = ''.join(ch for ch in name if ch.isascii() and ch.isdigit())
        name_query = cnpj if len(cnpj) == 14 and all(ch.isdigit() or ch in './- ' for ch in name) else normalized(name)
        params = {'p_org': scope.organization_id, 'p_uf': 'RS',
                  'p_city': normalized(city), 'p_cnae': cnae or None,
                  'p_name': name_query, 'p_only_active': active_only,
                  'p_limit': limit, 'p_offset': offset}
        try:
            async with httpx.AsyncClient(
                base_url=supabase_url, timeout=15, transport=auth_transport,
                headers={'apikey': public_key, 'Authorization': 'Bearer ' + scope.token},
                follow_redirects=False
            ) as client:
                result = await client.post(
                    '/rest/v1/rpc/realtalent_company_index_search', json=params)
        except httpx.HTTPError as exc:
            raise HTTPException(503, 'A base empresarial não respondeu. Tente novamente.') from exc
        if result.status_code in {404, 406} or 'PGRST202' in result.text:
            raise HTTPException(503, 'O índice CNPJ ainda não está instalado neste ambiente.')
        if result.status_code in {401, 403}:
            raise HTTPException(403, 'Você não tem acesso ao índice neste workspace.')
        if result.is_error:
            raise HTTPException(503, 'A consulta ao índice empresarial falhou.')
        return result.json()

    @app.get('/api/garimpo/searches')
    async def history(scope=Depends(authorize)):
        async with resources(scope) as (store, _):
            return [public_job(job) for job in store.list()]

    @app.post('/api/garimpo/searches', status_code=202)
    async def create(request: SearchRequest, scope=Depends(authorize),
                     idempotency_key: str = Header(min_length=8, max_length=128)):
        writable(scope)
        # One supported operational path. Do not silently switch to another source.
        if request.provider != 'maps' or request.qualify:
            raise HTTPException(422, 'Esta versão pesquisa no Google Maps e nos sites publicados, sem IA.')
        async with resources(scope) as (store, _):
            return public_job(store.create(request, idempotency_key=key_for(scope, idempotency_key)))

    @app.get('/api/garimpo/searches/{job_id}')
    async def get(job_id: UUID, scope=Depends(authorize)):
        async with resources(scope) as (store, _):
            return public_job(found(store, job_id))

    @app.post('/api/garimpo/searches/{job_id}/cancel')
    async def cancel(job_id: UUID, scope=Depends(authorize)):
        writable(scope)
        async with resources(scope) as (store, _):
            found(store, job_id)
            return public_job(store.cancel(str(job_id)))

    @app.post('/api/garimpo/searches/{job_id}/resume', status_code=202)
    async def resume(job_id: UUID, scope=Depends(authorize),
                     idempotency_key: str = Header(min_length=8, max_length=128)):
        writable(scope)
        async with resources(scope) as (store, engine):
            original = found(store, job_id)
            if not public_job(original)['can_resume']:
                raise HTTPException(409, 'Esta pesquisa ainda está ativa ou já foi concluída.')
            job = store.create(SearchRequest.model_validate(original['request']), seed_checkpoint=original,
                               parent_job_id=str(job_id), idempotency_key=key_for(scope, idempotency_key, str(job_id)))
            # Results are rebuilt and saved when execution claims the new checkpoint.
            engine.review(job)
            return public_job(job)

    @app.post('/api/garimpo/searches/{job_id}/run')
    async def run(job_id: UUID, scope=Depends(authorize)):
        writable(scope)
        # Validate scope before returning a streaming response with a 200 status.
        async with resources(scope) as (store, _):
            found(store, job_id)

        async def stream():
            async with resources(scope) as (store, engine):
                task = asyncio.create_task(engine.run_one(str(job_id)))
                try:
                    async with asyncio.timeout(240):
                        while not task.done():
                            yield json.dumps({'event': 'progress', 'job': public_job(found(store, job_id))}) + '\n'
                            await asyncio.wait({task}, timeout=3)
                        await task
                        yield json.dumps({'event': 'finished', 'job': public_job(found(store, job_id))}) + '\n'
                except (RuntimeError, SourceError, TimeoutError, httpx.HTTPError):
                    yield json.dumps({'event':'error','message':'A execução foi interrompida. Os dados salvos continuam disponíveis; verifique e retome a pesquisa.'}) + '\n'
                finally:
                    task.cancel()
                    with suppress(asyncio.CancelledError, Exception):
                        await task
        return StreamingResponse(stream(), media_type='application/x-ndjson', headers={'X-Accel-Buffering': 'no'})

    @app.exception_handler(QueueFull)
    async def queue_error(_request, _error):
        return JSONResponse({'detail':'Você já tem três pesquisas ativas. Conclua ou cancele uma delas.'}, status_code=429)

    @app.exception_handler(IdempotencyConflict)
    async def idem_error(_request, _error):
        return JSONResponse({'detail':'Este identificador já foi usado em outra pesquisa.'}, status_code=409)

    @app.exception_handler(RuntimeError)
    async def persistence_error(_request, _error):
        return JSONResponse({'detail':'O armazenamento da pesquisa está indisponível. Tente novamente.'}, status_code=503)

    @app.middleware('http')
    async def private_response(request, call_next):
        if request.method == 'POST':
            length = request.headers.get('content-length', '0')
            if not length.isascii() or not length.isdecimal() or len(length) > 6 or int(length) > 16384:
                return JSONResponse({'detail':'A pesquisa excedeu o limite de tamanho.'}, status_code=413)
            total = 0
            chunks = []
            async for chunk in request.stream():
                total += len(chunk)
                if total > 16384:
                    return JSONResponse({'detail':'A pesquisa excedeu o limite de tamanho.'}, status_code=413)
                chunks.append(chunk)
            request._body = b''.join(chunks)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    return app


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(create_app(), host='0.0.0.0', port=int(os.getenv('PORT', '80')), access_log=False)
