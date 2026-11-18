import asyncio
from contextlib import asynccontextmanager, suppress
import hashlib
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import JSONResponse

from .config import Settings
from . import __version__
from .engine import Engine
from .models import Candidate, SearchRequest, deduplicate
from .network import HTTP, SourceError
from .providers import SEGMENTS, validate_provider
from .store import IdempotencyConflict, QueueFull, Store, public_job
from .osm_index import index_info


def create_app(settings: Settings | None = None, *, http: HTTP | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    if len(settings.api_token) < 32:
        raise ValueError("Defina GARIMPO_API_TOKEN com pelo menos 32 caracteres antes de iniciar a API.")
    store = http.store if http is not None else Store(settings.db_path)
    http = http or HTTP(settings, store)
    engine = Engine(http, store)

    @asynccontextmanager
    async def lifespan(app):
        worker = asyncio.create_task(engine.worker())
        app.state.worker = worker
        try:
            yield
        finally:
            worker.cancel()
            try:
                with suppress(asyncio.CancelledError):
                    await worker
            finally:
                await http.close()

    app = FastAPI(title="Motor Garimpo", version=__version__, lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store, app.state.engine = store, engine
    app.state.worker = None
    bearer = HTTPBearer(auto_error=False)

    def authorize(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
        if not credentials or not secrets.compare_digest(credentials.credentials.encode(), settings.api_token.encode()):
            raise HTTPException(401, "Token do motor ausente ou inválido.", headers={"WWW-Authenticate": "Bearer"})

    @app.get("/health")
    def health():
        if app.state.worker is None or app.state.worker.done():
            return JSONResponse({"status": "unavailable", "version": __version__}, status_code=503)
        return {"status": "ok", "version": __version__}

    @app.get("/v1/capabilities", dependencies=[Depends(authorize)])
    def capabilities():
        local_source = None
        if settings.osm_index_path:
            try:
                info = index_info(settings.osm_index_path)
                local_source = {"status": "ready", **{key: info[key] for key in ("label", "snapshot_at", "bounds", "points")}}
            except SourceError as exc:
                local_source = {"status": "unavailable", "message": str(exc)}
        return {"providers": {"osm": True, "brave": bool(settings.brave_key), "maps": bool(settings.maps_binary and settings.maps_binary.is_file())}, "max_results": 100,
                'search':{'modes':['standard','expanded'],'max_queries':settings.maps_query_limit,'progressive':True,'resume':True},
                "qualification": {"available": bool(settings.ollama_url), "model": settings.ollama_model if settings.ollama_url else None},
                "recovery": {"website_search": bool(settings.brave_key), "query_limit": settings.recovery_query_limit, "identity_check": True},
                "osm_source": local_source or {"status": "external_not_checked", "label": "Consulta pública OpenStreetMap"},
                "ranking": {"relevance": "observed_segment_match", "minimum_relevance": True},
                "osm_segments": [aliases[0] for aliases, _ in SEGMENTS],
                "contact_status": "published", "export": "RealTalent CaptureDraft[]"}

    @app.post("/v1/searches", status_code=202, dependencies=[Depends(authorize)])
    def create(request: SearchRequest, idempotency_key: str | None = Header(default=None, max_length=128)):
        try:
            validate_provider(request, http)
            # Armazena o hash, não o identificador fornecido pelo cliente.
            key = hashlib.sha256(idempotency_key.encode()).hexdigest() if idempotency_key else None
            job = store.create(request, idempotency_key=key, queue_limit=settings.queue_limit)
            return public_job(job)
        except SourceError as exc:
            raise HTTPException(422, str(exc)) from exc
        except QueueFull as exc:
            raise HTTPException(429, str(exc), headers={"Retry-After": "10"}) from exc
        except IdempotencyConflict as exc:
            raise HTTPException(409, str(exc)) from exc

    def get_job(job_id):
        job = store.get(job_id)
        if not job:
            raise HTTPException(404, "Pesquisa não encontrada.")
        # Trabalhos anteriores à lista de pendentes continuam consultáveis.
        if "pending" not in job:
            engine.review(job)
        return job

    @app.get("/v1/searches/{job_id}", dependencies=[Depends(authorize)])
    def get(job_id: str):
        return public_job(get_job(job_id))

    @app.post("/v1/searches/{job_id}/cancel", dependencies=[Depends(authorize)])
    def cancel(job_id: str):
        job = store.cancel(job_id)
        if job is None:
            raise HTTPException(404, "Pesquisa não encontrada.")
        return public_job(job)

    @app.get("/v1/searches/{job_id}/export", dependencies=[Depends(authorize)])
    def export(job_id: str):
        job = get_job(job_id)
        return JSONResponse(job["results"], headers={"Content-Disposition": 'attachment; filename="garimpo-resultados.json"',
                                                    "X-Garimpo-Status": job["status"], "Cache-Control": "no-store"})

    @app.get("/v1/searches/{job_id}/pending", dependencies=[Depends(authorize)])
    def pending(job_id: str):
        job = get_job(job_id)
        return JSONResponse(job.get("pending", []), headers={"Content-Disposition": 'attachment; filename="garimpo-pendentes.json"', "Cache-Control": "no-store"})

    @app.post("/v1/searches/{job_id}/recover", status_code=202, dependencies=[Depends(authorize)])
    def recover(job_id: str, idempotency_key: str | None = Header(default=None, max_length=128)):
        original = get_job(job_id)
        if original["status"] not in {"completed", "failed", "cancelled"}:
            raise HTTPException(409, "Aguarde o término da pesquisa antes de recuperar os pendentes.")
        ids = {item["engine"]["providerId"] for item in original.get("pending", [])}
        if not ids:
            raise HTTPException(422, "Esta pesquisa não tem contatos pendentes de recuperação.")
        candidates = [item for item in deduplicate([Candidate.model_validate(raw) for raw in original["candidates"] if raw["provider_id"] in original["done_ids"]]) if item.provider_id in ids]
        if not settings.brave_key and not any(item.website for item in candidates):
            raise HTTPException(422, "Configure BRAVE_SEARCH_API_KEY no servidor para buscar os sites dos candidatos pendentes.")
        for item in candidates:
            item.recovery_status = "not_attempted"
            item.recovered_fields = []
        request = SearchRequest.model_validate(original["request"]).model_copy(update={"enrich_websites": True})
        key = hashlib.sha256((job_id + ":recover:" + idempotency_key).encode()).hexdigest() if idempotency_key else None
        try:
            return public_job(store.create(request, idempotency_key=key, queue_limit=settings.queue_limit,
                                          seed_candidates=[item.model_dump() for item in candidates], parent_job_id=job_id))
        except QueueFull as exc:
            raise HTTPException(429, str(exc), headers={"Retry-After": "10"}) from exc
        except IdempotencyConflict as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.post('/v1/searches/{job_id}/resume',status_code=202,dependencies=[Depends(authorize)])
    def resume(job_id: str,idempotency_key: str | None = Header(default=None,max_length=128)):
        original=get_job(job_id)
        if not public_job(original)['can_resume']:
            raise HTTPException(409,'Esta pesquisa não tem uma interrupção pendente de retomada.')
        request=SearchRequest.model_validate(original['request'])
        key=hashlib.sha256((job_id+':resume:'+idempotency_key).encode()).hexdigest() if idempotency_key else None
        try:
            validate_provider(request,http)
            job=store.create(request,idempotency_key=key,queue_limit=settings.queue_limit,parent_job_id=job_id,seed_checkpoint=original)
            engine.review(job)
            return public_job(job)
        except SourceError as exc:
            raise HTTPException(422,str(exc)) from exc
        except QueueFull as exc:
            raise HTTPException(429,str(exc),headers={'Retry-After':'10'}) from exc
        except IdempotencyConflict as exc:
            raise HTTPException(409,str(exc)) from exc

    @app.middleware("http")
    async def private_response(request, call_next):
        if request.method == "POST":
            length = request.headers.get("content-length")
            if length is None:
                return JSONResponse({"detail": "Envie Content-Length na requisição."}, status_code=411)
            if not length.isascii() or not length.isdecimal() or len(length) > 8 or int(length) > 16384:
                return JSONResponse({"detail": "Corpo da requisição excede o limite de 16 KiB."}, status_code=413)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    return app
