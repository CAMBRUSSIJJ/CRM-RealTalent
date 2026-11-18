"""Console privado de preview. A chave da API permanece exclusivamente no servidor."""
from contextlib import asynccontextmanager
from dataclasses import replace
import os
from pathlib import Path
import re
import secrets
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
import httpx

from .api import create_app
from .config import Settings


ASSETS = Path(__file__).parent / "preview_assets"
COOKIE = "garimpo_preview_session"
ALLOWED_PATH = re.compile(r"(?:capabilities|searches(?:/[a-f0-9-]{36}(?:/(?:cancel|export|pending|recover|resume))?)?)\Z")


def create_preview(settings: Settings, access_token: str, *, secure_cookies=True, http=None):
    if len(access_token) < 32 or secrets.compare_digest(access_token, settings.api_token):
        raise ValueError("O acesso do preview deve ter uma chave própria com pelo menos 32 caracteres.")
    api = create_app(settings, http=http)
    sessions = {}
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=api), base_url="http://engine.internal")

    @asynccontextmanager
    async def lifespan(app):
        async with api.router.lifespan_context(api):
            try:
                yield
            finally:
                await client.aclose()

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.api = api

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers.update({
            "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
            "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        })
        return response

    async def body(request):
        result = bytearray()
        async for chunk in request.stream():
            result.extend(chunk)
            if len(result) > 16384:
                raise HTTPException(413, "Requisição muito grande.")
        return bytes(result)

    def authenticated(request):
        session = request.cookies.get(COOKIE, "")
        if not session or sessions.get(session, 0) < time.time():
            raise HTTPException(401, "Abra o preview pelo link privado desta conversa.")
        if request.method != "GET" and request.headers.get("X-Garimpo-Preview") != "1":
            raise HTTPException(403, "Ação não autorizada.")

    @app.get("/")
    def index():
        return FileResponse(ASSETS / "index.html", media_type="text/html")

    @app.get("/assets/{name}")
    def asset(name: str):
        if name not in {"preview.js", "preview.css"}:
            raise HTTPException(404)
        return FileResponse(ASSETS / name, media_type="text/javascript" if name.endswith(".js") else "text/css")

    @app.get("/health")
    async def health():
        response = await client.get("/health")
        return Response(response.content, status_code=response.status_code, media_type="application/json")

    @app.post("/preview-auth")
    async def authenticate(request: Request):
        import json
        if request.headers.get("X-Garimpo-Preview") != "1":
            raise HTTPException(403, "Ação não autorizada.")
        try:
            payload = json.loads(await body(request))
            access = payload.get("access", "")
            valid = isinstance(access, str) and secrets.compare_digest(access.encode(), access_token.encode())
        except (ValueError, AttributeError):
            valid = False
        if not valid:
            raise HTTPException(401, "Link privado ausente ou inválido.")
        for key, expiry in list(sessions.items()):
            if expiry < time.time():
                sessions.pop(key, None)
        if len(sessions) >= 50:
            raise HTTPException(429, "Limite de sessões deste preview atingido.")
        session = secrets.token_urlsafe(32)
        sessions[session] = time.time() + 3600
        response = JSONResponse({"authenticated": True})
        response.set_cookie(COOKIE, session, httponly=True, secure=secure_cookies, samesite="strict", max_age=3600)
        return response

    @app.api_route("/preview-api/{path:path}", methods=["GET", "POST"])
    async def proxy(path: str, request: Request):
        authenticated(request)
        if not ALLOWED_PATH.fullmatch(path):
            raise HTTPException(404)
        headers = {"Authorization": "Bearer " + settings.api_token, "Content-Type": "application/json"}
        if request.headers.get("Idempotency-Key"):
            headers["Idempotency-Key"] = request.headers["Idempotency-Key"][:128]
        response = await client.request(request.method, "/v1/" + path, content=await body(request), headers=headers)
        forwarded = {key: value for key, value in response.headers.items() if key.lower() in {"content-type", "content-disposition", "x-garimpo-status", "retry-after"}}
        return Response(response.content, status_code=response.status_code, headers=forwarded)

    return app


def main():
    import uvicorn
    settings = Settings.from_env()
    if not settings.api_token:
        settings = replace(settings, api_token=secrets.token_urlsafe(40))
    access_token = os.getenv("GARIMPO_PREVIEW_TOKEN", "")
    app = create_preview(settings, access_token, secure_cookies=os.getenv("GARIMPO_PREVIEW_LOCAL_HTTP") != "1")
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")), access_log=False)


if __name__ == "__main__":
    main()
