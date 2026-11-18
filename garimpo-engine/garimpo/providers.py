"""Fontes de descoberta: OSM, web e coletor Maps externo controlado pelo motor."""
import math
import os
import re
from contextlib import aclosing
from urllib.parse import urlsplit

from .models import Candidate, Evidence, SearchRequest, normalized, osm_phone, valid_cnpj, website_url
from .network import HTTP, SourceError
from .osm_index import lookup_index


# Aliases explícitos evitam interpolar texto do usuário na linguagem Overpass.
SEGMENTS = [
    (("barbearia", "barbearias", "salao de beleza", "saloes de beleza", "cabeleireiro", "cabeleireiros"), [("shop", "hairdresser")]),
    (("dentista", "dentistas", "clinica odontologica", "clinicas odontologicas", "odontologia"), [("amenity", "dentist"), ("healthcare", "dentist")]),
    (("clinica", "clinicas", "clinica medica", "clinicas medicas"), [("amenity", "clinic"), ("healthcare", "clinic")]),
    (("veterinario", "veterinarios", "clinica veterinaria", "clinicas veterinarias"), [("amenity", "veterinary")]),
    (("restaurante", "restaurantes"), [("amenity", "restaurant")]),
    (("pizzaria", "pizzarias"), [("cuisine", "pizza")]),
    (("lanchonete", "lanchonetes"), [("amenity", "fast_food")]),
    (("cafeteria", "cafeterias"), [("amenity", "cafe")]),
    (("padaria", "padarias"), [("shop", "bakery")]),
    (("farmacia", "farmacias"), [("amenity", "pharmacy")]),
    (("academia", "academias"), [("leisure", "fitness_centre")]),
    (("supermercado", "supermercados"), [("shop", "supermarket")]),
    (("pet shop", "pet shops", "petshop"), [("shop", "pet")]),
    (("hotel", "hoteis"), [("tourism", "hotel")]),
    (("pousada", "pousadas"), [("tourism", "guest_house")]),
    (("imobiliaria", "imobiliarias"), [("office", "estate_agent")]),
    (("contabilidade", "contador", "contadores", "escritorio de contabilidade"), [("office", "accountant")]),
    (("advocacia", "advogado", "advogados"), [("office", "lawyer")]),
    (("oficina", "oficinas", "oficina mecanica", "oficinas mecanicas"), [("shop", "car_repair")]),
    (("concessionaria", "concessionarias"), [("shop", "car")]),
    (("roupas", "loja de roupas", "lojas de roupas"), [("shop", "clothes")]),
    (("moveis", "loja de moveis", "lojas de moveis"), [("shop", "furniture")]),
    (("material de construcao", "materiais de construcao"), [("shop", "doityourself"), ("shop", "hardware")]),
    (("floricultura", "floriculturas"), [("shop", "florist")]),
    (("escola", "escolas"), [("amenity", "school")]),
    (("creche", "creches"), [("amenity", "kindergarten")]),
    (("posto de combustivel", "postos de combustivel"), [("amenity", "fuel")]),
]
OSM_TAGS = {alias: tags for aliases, tags in SEGMENTS for alias in aliases}
STATES = dict(zip("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(),
                  ["Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal", "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso", "Mato Grosso do Sul", "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco", "Piauí", "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia", "Roraima", "Santa Catarina", "São Paulo", "Sergipe", "Tocantins"]))
EXCLUDED_HOSTS = {"google.com", "google.com.br", "facebook.com", "instagram.com", "linkedin.com", "youtube.com", "wikipedia.org", "yelp.com", "tripadvisor.com.br", "telelistas.net", "econodata.com.br", "cnpj.biz", "solutudo.com.br", "guiamais.com.br", "apontador.com.br", "brasilapi.com.br", "wa.me", "whatsapp.com", "linktr.ee"}


def eligible_site(url: str) -> bool:
    host = (urlsplit(url).hostname or "").lower().removeprefix("www.")
    return bool(host) and not any(host == entry or host.endswith("." + entry) for entry in EXCLUDED_HOSTS)


def provider_name(request: SearchRequest, http: HTTP) -> str:
    return ("maps" if http.settings.maps_binary else "brave" if http.settings.brave_key else "osm") if request.provider == "auto" else request.provider


def validate_provider(request: SearchRequest, http: HTTP):
    provider = provider_name(request, http)
    if provider in {"maps", "combined"} and (not http.settings.maps_binary or not http.settings.maps_binary.is_file() or not os.access(http.settings.maps_binary,os.X_OK)):
        raise SourceError("Configure GARIMPO_MAPS_BINARY com o coletor gosom instalado para consultar Google Maps.")
    if provider == "brave" and not http.settings.brave_key:
        raise SourceError("Configure BRAVE_SEARCH_API_KEY no motor para usar a pesquisa web.")
    if provider in {"osm", "hybrid"} and normalized(request.segment) not in OSM_TAGS:
        raise SourceError("Segmento sem categoria OpenStreetMap cadastrada. Consulte os segmentos disponíveis ou configure Brave Search para pesquisar esse nicho.")


async def discover(request: SearchRequest, http: HTTP):
    validate_provider(request, http)
    if provider_name(request, http) in {"maps", "combined"}:
        from .maps import discover_maps
        interrupted = None
        try:
            async with aclosing(discover_maps(request,http)) as pages:
                async for batch in pages:yield batch
        except SourceError as exc:
            if request.provider != "combined":
                raise
            interrupted = exc
        if request.provider == "combined" and normalized(request.segment) in OSM_TAGS:
            async for batch in discover_osm(request, http):
                yield batch
        if interrupted:
            raise interrupted
        return
    if provider_name(request, http) == "hybrid":
        interrupted = None
        try:
            async for batch in discover_osm(request, http):
                yield batch
        except SourceError as exc:
            if not http.settings.brave_key:
                raise
            interrupted = exc
        if http.settings.brave_key:
            async for batch in discover_brave(request, http):
                yield batch
        if interrupted:
            raise SourceError("A consulta OpenStreetMap falhou; a busca prosseguiu com a fonte web. " + str(interrupted))
        return
    source = discover_osm if provider_name(request, http) == "osm" else discover_brave
    async for batch in source(request, http):
        yield batch


async def discover_osm(request: SearchRequest, http: HTTP):
    params = {"city": request.city, "state": STATES[request.state], "country": "Brazil",
              "countrycodes": "br", "format": "jsonv2", "addressdetails": 1, "limit": 1}
    if http.settings.contact_email:
        params["email"] = http.settings.contact_email
    if http.settings.osm_index_path:
        params["polygon_geojson"] = 1
    geocoded = await http.json("GET", "https://nominatim.openstreetmap.org/search", params=params)
    if not isinstance(geocoded, list) or not geocoded:
        raise SourceError("Cidade/UF não localizada na fonte geográfica. Confira a grafia e a UF.")
    location = geocoded[0]
    if not isinstance(location, dict):
        raise SourceError("A fonte geográfica retornou uma localidade inválida.")
    address = location.get("address", {})
    if not isinstance(address, dict) or address.get("country_code") != "br":
        raise SourceError("A localidade retornada não corresponde ao Brasil.")
    region = address.get("ISO3166-2-lvl4", "")
    if (region and region != "BR-" + request.state) or (address.get("state") and normalized(address["state"]) != normalized(STATES[request.state])):
        raise SourceError("A fonte retornou uma cidade de outra UF; pesquisa interrompida.")
    locality = next((address[key] for key in ("city", "town", "village", "municipality") if isinstance(address.get(key), str) and address[key]), "")
    if locality and normalized(locality) != normalized(request.city):
        raise SourceError("A fonte geográfica retornou outro município; confira o nome solicitado.")
    try:
        south, north, west, east = (float(value) for value in location["boundingbox"])
        if not all(math.isfinite(n) for n in (south, north, west, east)) or not (-90 <= south < north <= 90 and -180 <= west < east <= 180):
            raise ValueError()
    except (KeyError, TypeError, ValueError) as exc:
        raise SourceError("A fonte retornou limites geográficos inválidos.") from exc
    if north - south > 5 or east - west > 5:
        raise SourceError("A área retornada é ampla demais. Informe um município mais específico.")
    if location.get("osm_type") == "relation" and isinstance(location.get("osm_id"), int):
        prefix = f"area({3600000000 + location['osm_id']})->.searchArea;"
        area = "(area.searchArea)"
    else:
        prefix, area = "", f"({south},{west},{north},{east})"
    tags = OSM_TAGS[normalized(request.segment)]
    selectors = "".join(f'nwr["{key}"="{value}"]["name"]{area};' for key, value in tags)
    budget = min(200, request.limit * 3)
    query = f"[out:json][timeout:25][maxsize:16777216];{prefix}({selectors});out center tags {budget};"
    dataset = None
    if http.settings.osm_index_path:
        elements, dataset = lookup_index(http.settings.osm_index_path, location, OSM_TAGS[normalized(request.segment)], budget, state=request.state)
        payload = {"elements": elements}
        observed_at = dataset["snapshot_at"]
        http.count("local_index_queries")
    else:
        payload = await http.json("POST", "https://overpass-api.de/api/interpreter", data={"data": query})
        observed_at = http.observed_at["https://overpass-api.de/api/interpreter"]
    if not isinstance(payload, dict) or payload.get("remark") or not isinstance(payload.get("elements"), list):
        raise SourceError("OpenStreetMap não concluiu a pesquisa. Tente novamente mais tarde.")
    candidates = []
    for element in payload["elements"][:budget]:
        if not isinstance(element, dict) or not isinstance(element.get("tags"), dict):
            continue
        tags = element["tags"]
        name = str(tags.get("name", "")).strip()
        kind, identifier = element.get("type"), element.get("id")
        if not name or kind not in {"node", "way", "relation"} or not isinstance(identifier, int):
            continue
        url = f"https://www.openstreetmap.org/{kind}/{identifier}"
        item = Candidate(provider_id=f"osm:{kind}:{identifier}", company=name, city=request.city, state=request.state)
        if dataset:
            item.dataset = {key: dataset[key] for key in ("label", "source_url", "snapshot_at", "licence")}
            item.warnings.append("Dados de extração OSM de " + dataset["snapshot_at"][:10] + "; contatos publicados não foram validados por contato direto.")
        item.category = next((f"{key}={value}" for key, value in OSM_TAGS[normalized(request.segment)] if tags.get(key) == value), "")
        item.provider_rank = len(candidates)
        item.evidence.append(Evidence(field="company", value=name, url=url, source="OpenStreetMap", observed_at=observed_at))
        for field, value in {
            "phone": osm_phone(tags),
            "email": str(tags.get("contact:email") or tags.get("email") or "").strip(),
            "website": website_url(str(tags.get("contact:website") or tags.get("website") or "")),
            "cnpj": valid_cnpj(str(tags.get("ref:cnpj") or "")),
            "address": ", ".join(str(tags.get(key, "")) for key in ("addr:street", "addr:housenumber", "addr:suburb", "addr:postcode") if tags.get(key)),
        }.items():
            if field == "email" and not re.fullmatch(r"[^\s@;]+@[^\s@;]+\.[^\s@;]+", value):
                value = ""
            item.observe(field, value, url, "OpenStreetMap", observed_at)
        if tags.get("addr:city"):
            item.city = str(tags["addr:city"])
            item.location_status = "observed"
            item.evidence.append(Evidence(field="city", value=item.city, url=url, source="OpenStreetMap", observed_at=observed_at))
            if normalized(item.city) != normalized(request.city):
                continue
        if normalized(request.segment) in {"barbearia", "barbearias"}:
            item.warnings.append("Categoria OSM hairdresser inclui barbearias e salões; confirmar especialidade.")
        candidates.append(item)
    yield candidates


async def discover_brave(request: SearchRequest, http: HTTP):
    budget = min(100, request.limit * 3)
    remaining = budget
    for offset in range(math.ceil(budget / 20)):
        payload = await http.json("GET", "https://api.search.brave.com/res/v1/web/search", headers={"X-Subscription-Token": http.settings.brave_key},
                                  params={"q": f"{request.segment} {request.city} {request.state} Brasil", "country": "BR", "search_lang": "pt-br", "count": 20, "offset": offset, "safesearch": "moderate"})
        observed_at = http.observed_at["https://api.search.brave.com/res/v1/web/search"]
        if not isinstance(payload, dict) or not isinstance(payload.get("web", {}), dict):
            raise SourceError("Brave Search retornou uma resposta inesperada.")
        web = payload.get("web", {})
        results = web.get("results", [])
        if not isinstance(results, list):
            raise SourceError("Brave Search retornou resultados em formato inesperado.")
        batch = []
        for result in results[:remaining]:
            if not isinstance(result, dict):
                continue
            url = website_url(str(result.get("url", "")))
            title = str(result.get("title", "")).strip()
            if not url or not title or not eligible_site(url):
                continue
            # Nome provisório: título do resultado. A página/JSON-LD pode refiná-lo.
            item = Candidate(provider_id="brave:" + url, company=title[:200], website=url,
                             city=request.city, state=request.state, description=str(result.get("description", ""))[:1000])
            item.provider_rank = offset * 20 + len(batch)
            item.evidence = [Evidence(field="company", value=item.company, url=url, source="Brave Search — título do resultado", observed_at=observed_at),
                             Evidence(field="website", value=url, url=url, source="Brave Search", observed_at=observed_at)]
            item.warnings.append("Resultado de busca: confirmar se a página representa a empresa e o segmento solicitado.")
            batch.append(item)
        yield batch
        remaining -= len(results)
        if remaining <= 0 or not results or web.get("more_results_available") is False:
            break
