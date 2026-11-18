"""Authenticated hosted Garimpo. Every execution stays inside an active HTTP request.

Containers may scale to zero: jobs, leases and checkpoints are stored in Supabase.
No local connector, service-role key, global engine token, or LLM is required.
"""
import asyncio
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
from uuid import UUID

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from . import __version__
from .config import Settings
from .engine import Engine
from .hosted_store import RemoteStore
from .maps_setup import verify_browser
from .models import SearchRequest
from .network import HTTP, SourceError
from .store import IdempotencyConflict, QueueFull, Store, public_job


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
