from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import AsyncMock
from urllib.parse import urlsplit

import httpx

from garimpo.config import Settings
from garimpo.network import HTTP
from garimpo.store import Store


GEOCODE = [{"osm_type": "relation", "osm_id": 242503, "boundingbox": ["-30", "-29", "-52", "-51"],
            "address": {"country_code": "br", "state": "Rio Grande do Sul", "ISO3166-2-lvl4": "BR-RS"}}]


def element(identifier=1, **tags):
    return {"type": "node", "id": identifier, "tags": {"name": "Empresa Teste", "addr:city": "Canoas", **tags}}


async def pinned(url):
    parts = urlsplit(url)
    return parts._replace(netloc="93.184.216.34").geturl(), {"Host": parts.netloc}, {"sni_hostname": parts.hostname}


class Harness:
    def __init__(self, provider=None, website=None, **settings):
        self.temporary = TemporaryDirectory()
        self.settings = Settings(db_path=Path(self.temporary.name) / "test.sqlite3", **settings)
        self.store = Store(self.settings.db_path)
        self.requests = []
        def provider_handler(request):
            self.requests.append(request)
            if provider:
                return provider(request)
            if "nominatim" in request.url.host:
                return httpx.Response(200, json=GEOCODE)
            return httpx.Response(200, json={"elements": [element(website="https://empresa.test/")]})
        def website_handler(request):
            self.requests.append(request)
            if website:
                return website(request)
            if request.url.path == "/robots.txt":
                return httpx.Response(200, text="User-agent: *\nAllow: /", headers={"Content-Type": "text/plain"})
            return httpx.Response(200, text='<a href="tel:+5551999991001">Telefone</a><a href="/contato">Contato</a>', headers={"Content-Type": "text/html"})
        self.http = HTTP(self.settings, self.store, provider_transport=httpx.MockTransport(provider_handler), website_transport=httpx.MockTransport(website_handler))
        self.http.throttle = AsyncMock()

    async def close(self):
        await self.http.close()
        self.temporary.cleanup()
