import asyncio
from contextvars import ContextVar
from email.utils import parsedate_to_datetime
import hashlib
import ipaddress
import json
import math
import socket
import time
from urllib.parse import urlsplit, urlunsplit

import httpx

from .config import Settings
from .models import now
from .store import Store


class SourceError(Exception):
    """Mensagem pública: nunca incluir chave de API, cabeçalhos ou resposta bruta."""


class UnsafeURL(SourceError):
    pass


def same_site(left: str, right: str) -> bool:
    def host(value):
        return (urlsplit(value).hostname or "").lower().removeprefix("www.")
    return host(left) == host(right)


async def public_target(url: str) -> tuple[str, dict, dict]:
    """Resolve uma vez e conecta ao IP validado, preservando Host e TLS/SNI.

    Impede DNS rebinding entre validação e conexão e rejeita redes locais/metadados.
    O cliente usado aqui não pode usar proxies de ambiente.
    """
    try:
        parts = urlsplit(url)
        if parts.scheme not in {"http", "https"} or not parts.hostname or parts.username or parts.password or parts.port not in {None, 80, 443}:
            raise UnsafeURL("Endereço de site não permitido.")
        host = parts.hostname.encode("idna").decode()
        addresses = await asyncio.wait_for(asyncio.get_running_loop().getaddrinfo(host, parts.port or (443 if parts.scheme == "https" else 80), type=socket.SOCK_STREAM), timeout=5)
        ips = [ipaddress.ip_address(address[4][0]) for address in addresses]
        if not ips or any(not ip.is_global or ip.is_multicast or ip.is_unspecified for ip in ips):
            raise UnsafeURL("O site aponta para um endereço de rede não permitido.")
        ip = str(sorted(ips, key=lambda value: value.version)[0])
        authority = f"[{ip}]" if ":" in ip else ip
        if parts.port:
            authority += f":{parts.port}"
        pinned = urlunsplit((parts.scheme, authority, parts.path or "/", parts.query, ""))
        original_host = host + (f":{parts.port}" if parts.port else "")
        return pinned, {"Host": original_host}, {"sni_hostname": host}
    except (ValueError, UnicodeError, socket.gaierror, TimeoutError) as exc:
        raise SourceError("Não foi possível resolver o endereço público do site.") from exc


class HTTP:
    def __init__(self, settings: Settings, store: Store, *, provider_transport=None, website_transport=None):
        self.service_transport = provider_transport
        self.settings, self.store = settings, store
        self.headers = {"User-Agent": settings.user_agent, "Accept": "application/json"}
        self.provider = httpx.AsyncClient(timeout=httpx.Timeout(25, connect=8), headers=self.headers,
                                          transport=provider_transport, follow_redirects=False)
        # Não encaminhar destinos fixados para um proxy que possa resolver outro IP.
        self.website = httpx.AsyncClient(timeout=httpx.Timeout(12, connect=5), headers=self.headers,
                                         transport=website_transport, trust_env=False, follow_redirects=False,
                                         # Hosts virtuais podem compartilhar IP. Cada acesso
                                         # precisa de uma nova verificação TLS do hostname.
                                         limits=httpx.Limits(max_connections=settings.concurrency, max_keepalive_connections=0))
        self.semaphore = asyncio.Semaphore(settings.concurrency)
        self.locks: dict[str, asyncio.Lock] = {}
        self.last_request: dict[str, float] = {}
        self.observed_at: dict[str, str] = {}
        self.statistics = ContextVar("garimpo_http_statistics", default=None)
        self.discovery_context = ContextVar("garimpo_discovery_context", default=None)

    def count(self, metric: str, amount=1):
        statistics = self.statistics.get()
        if statistics is not None:
            statistics[metric] += amount

    async def close(self):
        await self.provider.aclose()
        await self.website.aclose()

    async def throttle(self, host: str, interval: float):
        lock = self.locks.setdefault(host, asyncio.Lock())
        async with lock:
            delay = self.last_request.get(host, 0) + interval - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            self.last_request[host] = time.monotonic()

    async def json(self, method: str, url: str, *, params=None, data=None, headers=None, ttl=None):
        key = hashlib.sha256(json.dumps([method, url, params, data], sort_keys=True).encode()).hexdigest()
        cached = self.store.cache_get("provider-v2:" + key)
        if cached is not None:
            self.count("provider_cache_hits")
            self.observed_at[url] = cached["fetched_at"]
            return cached["payload"]
        host = urlsplit(url).hostname or ""
        for attempt in range(3):
            if attempt:
                self.count("retries")
            await self.throttle(host, 1.1)
            try:
                async with self.semaphore:
                    self.count("discovery_requests")
                    async with self.provider.stream(method, url, params=params, data=data, headers=headers) as response:
                        if response.status_code in {429, 502, 503, 504}:
                            self.count("http_errors")
                            delay = retry_delay(response.headers.get("Retry-After"), attempt)
                            if attempt == 2 or delay > 20:
                                if response.status_code == 429:
                                    raise SourceError(f"A fonte {host} limitou as consultas (HTTP 429). Aguarde o intervalo solicitado antes de tentar novamente.")
                                raise SourceError(f"O servidor da fonte {host} está temporariamente indisponível (HTTP {response.status_code}). A pesquisa não foi concluída.")
                        elif response.is_error or response.is_redirect:
                            self.count("http_errors")
                            raise SourceError(f"A fonte {host} recusou a consulta (HTTP {response.status_code}).")
                        else:
                            body = bytearray()
                            async for chunk in response.aiter_bytes():
                                body.extend(chunk)
                                if len(body) > 8_000_000:
                                    raise SourceError(f"A fonte {host} retornou uma resposta grande demais.")
                            try:
                                payload = json.loads(body)
                            except (ValueError, UnicodeError) as exc:
                                raise SourceError(f"A fonte {host} retornou um formato inesperado.") from exc
                            self.observed_at[url] = now()
                            self.store.cache_put("provider-v2:" + key, {"payload": payload, "fetched_at": self.observed_at[url]}, self.settings.cache_ttl if ttl is None else ttl)
                            return payload
                await asyncio.sleep(delay)
            except httpx.HTTPError as exc:
                self.count("connection_errors")
                if attempt == 2:
                    raise SourceError(f"Falha de conexão com a fonte {host}.") from exc
                await asyncio.sleep(2 ** attempt)
        raise SourceError(f"Não foi possível consultar {host}.")

    async def page(self, url: str, *, max_bytes=1_000_000, before_redirect=None) -> tuple[str, str, int]:
        original = url
        for _ in range(4):
            if not same_site(original, url):
                raise UnsafeURL("Redirecionamento para outro site não permitido.")
            pinned, headers, extensions = await public_target(url)
            host = urlsplit(url).hostname or ""
            await self.throttle(host.removeprefix("www."), 1.1)
            try:
                async with self.semaphore:
                    request = self.website.build_request("GET", pinned, headers={**headers, "Accept": "text/html,text/plain;q=0.9"}, extensions=extensions)
                    # A URL de transporte contém o IP. Cookies desse IP nunca devem
                    # atravessar sites virtuais distintos que compartilhem o servidor.
                    request.headers.pop("cookie", None)
                    self.count("website_requests")
                    response = await self.website.send(request, stream=True)
                    try:
                        if response.is_redirect:
                            location = response.headers.get("Location", "")
                            if not location:
                                raise SourceError("O site retornou um redirecionamento inválido.")
                            from urllib.parse import urljoin
                            destination = urljoin(url, location)
                            if not same_site(original, destination):
                                raise UnsafeURL("Redirecionamento para outro site não permitido.")
                            if before_redirect is not None and not await before_redirect(destination):
                                raise SourceError("A página de destino restringe a coleta em robots.txt.")
                            url = destination
                            continue
                        if response.status_code in {401, 403, 429}:
                            self.count("http_errors")
                            raise SourceError(f"O site restringiu a coleta (HTTP {response.status_code}).")
                        if response.status_code >= 400:
                            self.count("http_errors")
                            return "", url, response.status_code
                        content_type = response.headers.get("Content-Type", "").lower()
                        if not any(kind in content_type for kind in ("text/html", "text/plain", "application/xhtml")):
                            raise SourceError("O site não retornou uma página de texto.")
                        body = bytearray()
                        async for chunk in response.aiter_bytes():
                            body.extend(chunk)
                            if len(body) > max_bytes:
                                raise SourceError("A página excedeu o limite de coleta.")
                        return body.decode(response.encoding or "utf-8", errors="replace"), url, response.status_code
                    finally:
                        await response.aclose()
            except httpx.HTTPError as exc:
                self.count("connection_errors")
                raise SourceError("Não foi possível carregar o site da empresa.") from exc
        raise SourceError("O site excedeu o limite de redirecionamentos.")


def retry_delay(value: str | None, attempt: int) -> float:
    try:
        if value:
            delay = float(value)
            return max(0, delay) if math.isfinite(delay) else 60
    except ValueError:
        try:
            return max(0, parsedate_to_datetime(value).timestamp() - time.time())
        except (ValueError, TypeError, OverflowError):
            pass
    return float(2 ** attempt)
