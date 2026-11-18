"""Bounded public CNPJ lookup when the local Receita index is not installed.

Provider: Consulta Data Stone, documented free public API with commercial use
allowed subject to source attribution:
https://www.datastone.com.br/consulta/api-publica

This integration sends only the public business name to the provider. Never send
workspace IDs, tokens, leads, phone numbers, addresses or personal details.
It is NOT suitable for bulk enumeration and does not replace local indexing.
"""
from urllib.parse import urlsplit

import httpx

from .company_identity import clean_company, rank_candidates
from .models import normalized, valid_cnpj

BASE_URL = "https://www.datastone.com.br"
ATTRIBUTION_URL = "https://www.datastone.com.br/consulta"
API_DOCS_URL = "https://www.datastone.com.br/consulta/api-publica"
SOURCE_LABEL = "Consulta Data Stone (dados abertos da Receita Federal)"


class PublicLookupUnavailable(Exception):
    """Upstream service missing, throttled, invalid or unavailable."""


def safe_company_page(url: object) -> str:
    if not isinstance(url, str):
        return ATTRIBUTION_URL
    try:
        parsed = urlsplit(url)
        if (parsed.scheme == "https" and parsed.hostname in
                {"www.datastone.com.br", "datastone.com.br"} and
                parsed.path.startswith("/consulta/empresa/") and
                not parsed.username and not parsed.password):
            return parsed._replace(query="", fragment="").geturl()
    except ValueError:
        pass
    return ATTRIBUTION_URL


def parse_search_response(payload: object) -> tuple[list[dict], bool]:
    if not isinstance(payload, dict) or not isinstance(payload.get("resultados"), list):
        raise PublicLookupUnavailable("A consulta pública retornou dados inesperados.")
    candidates = []
    source = payload["resultados"][:10]
    for item in source:
        if not isinstance(item, dict):
            continue
        cnpj = valid_cnpj(str(item.get("cnpj") or ""))
        if not cnpj:
            continue
        status = normalized(str(item.get("situacao") or ""))
        link = item.get("_links") or {}
        link = link if isinstance(link, dict) else {}
        candidates.append({
            "cnpj": cnpj,
            "legal_name": str(item.get("razao_social") or "")[:240],
            "trade_name": str(item.get("nome_fantasia") or "")[:240],
            "city": str(item.get("cidade") or "")[:100],
            "uf": str(item.get("uf") or "")[:2].upper(),
            "main_cnae": "",
            "status": "02" if status == "ativa" else "08" if status == "baixada" else "",
            "headquarters": None,  # The public name-search API does not document it.
            "source_month": "",   # Do not fabricate the supplier's monthly revision.
            "source_url": safe_company_page(link.get("pagina")),
            "source_provider": SOURCE_LABEL,
        })
    try:
        total = int(payload.get("total", len(source)))
    except (ValueError, TypeError):
        total = len(source)
    return candidates, total > len(source) or len(source) >= 10


async def search_public_company(company: str, city: str, state: str, *,
                                transport=None) -> tuple[list[dict], bool]:
    """At most one query; strict timeout, bounded result count, no redirects."""
    term = clean_company(company, city)[:120]
    if len(term) < 3:
        raise PublicLookupUnavailable("Informe um nome empresarial mais específico.")
    try:
        async with httpx.AsyncClient(base_url=BASE_URL, timeout=7,
                                     transport=transport, follow_redirects=False) as client:
            response = await client.get("/consulta/api/v1/busca", params={"q": term},
                                        headers={"Accept": "application/json"})
        if response.status_code == 429:
            raise PublicLookupUnavailable(
                "A consulta gratuita atingiu seu limite; tente mais tarde ou use o índice próprio.")
        if response.status_code != 200:
            raise PublicLookupUnavailable(
                "A fonte cadastral pública está indisponível nesta tentativa.")
        if len(response.content) > 512_000:
            raise PublicLookupUnavailable("A resposta da fonte cadastral excedeu o limite.")
        raw, incomplete = parse_search_response(response.json())
    except httpx.HTTPError as exc:
        raise PublicLookupUnavailable(
            "A consulta pública de CNPJ não respondeu. Tente novamente mais tarde.") from exc
    except ValueError as exc:
        raise PublicLookupUnavailable(
            "A consulta pública retornou uma resposta inválida.") from exc
    return rank_candidates(company, city, state, raw), incomplete


def parse_public_people(payload: object, cnpj: str) -> dict:
    """Whitelisted QSA only: strip CPF, age, documents and private contacts."""
    if not isinstance(payload, dict):
        raise PublicLookupUnavailable("A fonte societária retornou dados inesperados.")
    if valid_cnpj(str(payload.get("cnpj") or "")) != cnpj:
        raise PublicLookupUnavailable("A fonte não corroborou o CNPJ solicitado.")
    link = payload.get("_links") or {}
    link = link if isinstance(link, dict) else {}
    page = safe_company_page(link.get("pagina"))
    names = payload.get("quadro_societario") or []
    if not isinstance(names, list):
        raise PublicLookupUnavailable("O QSA externo retornou dados inesperados.")
    people = []
    for entry in names[:50]:
        if not isinstance(entry, dict):
            continue
        name = " ".join(str(entry.get("nome") or "").split())[:180]
        if not name or not any(char.isalpha() for char in name):
            continue
        # The public example documents nome/localizacao only; do not fabricate
        # classification, qualification, role, age or date of joining.
        role = " ".join(str(entry.get("qualificacao") or "").split())[:140]
        people.append({
            "partner_name": name,
            "partner_type": "Não informado",
            "role_code": "",
            "role_label": role or "Vínculo societário publicado; qualificação não informada",
            "joined_on": None,
            "source_month": "",
            "source_url": page,
        })
    return {
        "company_cnpj": cnpj,
        "source": SOURCE_LABEL,
        "people": people,
        "has_records": bool(people),
        "truncated": len(names) > 50,
        "note": "Consulta pública secundária. Identificadores privados, contatos e idade omitidos.",
    }


async def public_qsa_lookup(cnpj: str, *, transport=None) -> dict:
    if not valid_cnpj(cnpj):
        raise PublicLookupUnavailable("Informe um CNPJ válido.")
    try:
        async with httpx.AsyncClient(base_url=BASE_URL, timeout=7,
                                     transport=transport, follow_redirects=False) as client:
            response = await client.get(f"/consulta/api/v1/empresa/{cnpj}",
                                        headers={"Accept": "application/json"})
        if response.status_code == 429:
            raise PublicLookupUnavailable("A consulta pública de QSA atingiu o limite gratuito.")
        if response.status_code != 200:
            raise PublicLookupUnavailable("A consulta pública de QSA está indisponível.")
        if len(response.content) > 1_000_000:
            raise PublicLookupUnavailable("A resposta de QSA excedeu o limite permitido.")
        return parse_public_people(response.json(), cnpj)
    except httpx.HTTPError as exc:
        raise PublicLookupUnavailable("A fonte pública do QSA não respondeu.") from exc
    except ValueError as exc:
        raise PublicLookupUnavailable("A resposta pública do QSA não é válida.") from exc
