"""Localiza sites e recupera contatos sem atribuir dados de empresas homônimas."""
import asyncio
from urllib.parse import urlsplit

from .models import Candidate, normalized, website_url
from .network import SourceError
from .providers import eligible_site


class ContactRecovery:
    def __init__(self, http, collector):
        self.http, self.collector = http, collector

    async def recover(self, item: Candidate, budget: dict) -> Candidate:
        if not self.http.settings.brave_key:
            item.recovery_status = "provider_not_configured"
            return item
        if budget["remaining"] <= 0:
            item.recovery_status = "query_limit"
            return item
        # Reserva antes de qualquer await: tarefas concorrentes respeitam o teto.
        budget["remaining"] -= 1
        self.http.count("recovery_queries")
        query = f'"{normalized(item.company)}" "{normalized(item.city)}" {item.state} {item.address[:150]}'
        endpoint = "https://api.search.brave.com/res/v1/web/search"
        try:
            payload = await self.http.json("GET", endpoint, headers={"X-Subscription-Token": self.http.settings.brave_key},
                                           params={"q": query, "country": "BR", "search_lang": "pt-br", "count": 5, "safesearch": "moderate"})
            results = payload.get("web", {}).get("results", [])
            if not isinstance(results, list):
                raise ValueError()
        except (SourceError, ValueError, AttributeError):
            item.recovery_status = "source_error"
            item.warnings.append("A busca do site não pôde ser concluída; candidato preservado para nova tentativa.")
            return item
        attempted = set()
        for result in results[:5]:
            if not isinstance(result, dict):
                continue
            url = website_url(str(result.get("url", "")))
            host = urlsplit(url).hostname
            if not url or not eligible_site(url) or host in attempted:
                continue
            attempted.add(host)
            probe = item.model_copy(deep=True)
            probe.website, probe.website_matched = url, False
            try:
                probe = await self.collector.collect(probe, require_identity=True)
            except asyncio.CancelledError:
                # Se a identidade já foi corroborada, preserva dados publicados
                # antes de propagar timeout/cancelamento para o motor.
                if probe.website_matched:
                    for field in Candidate.model_fields:
                        setattr(item, field, getattr(probe, field))
                raise
            if probe.website_matched:
                probe.recovery_status = "matched"
                probe.observe("website", probe.website, url, "Brave Search — site corroborado", self.http.observed_at.get(endpoint))
                return probe
            if len(attempted) >= 2:
                break
        item.recovery_status = "identity_unconfirmed" if attempted else "no_site_found"
        item.warnings.append("Nenhum site encontrado corroborou a identidade e a filial da empresa." if attempted else "A busca não encontrou um site elegível para recuperar os contatos.")
        return item
