"""RealTalent Garimpo: descoberta real em Python, sem IA ou Node.js.

Fontes: OpenStreetMap (Nominatim + Overpass), com Firecrawl local opcional.
Sem resultados inventados: cada campo vem de um objeto OSM ou resultado de
busca atribuível a uma URL pública. Não é motor de scraping de perfis privados.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from typing import Callable

USER_AGENT = "RealTalent-Garimpo/2.0 (+https://github.com/CAMBRUSSIJJ/CRM-RealTalent)"
FIELDS = ("company", "phone", "email", "city", "address", "cnpj", "instagram", "website",
          "bookingUrl", "systemName", "whatsappUrl")
OSM_TAGS = {
    "barbearia": ('["shop"="hairdresser"]', '["name"~"barbearia|barber|barbershop",i]'),
    "cabeleireiro": ('["shop"="hairdresser"]',),
    "salao": ('["shop"="hairdresser"]',),
    "restaurante": ('["amenity"="restaurant"]',),
    "academia": ('["leisure"="fitness_centre"]',),
    "farmacia": ('["amenity"="pharmacy"]',),
    "escola": ('["amenity"="school"]',),
    "cafe": ('["amenity"="cafe"]',),
    "hotel": ('["tourism"="hotel"]',),
    "padaria": ('["shop"="bakery"]',),
    "loja": ('["shop"="convenience"]',),
}
GENERIC = re.compile(r"^(?:\d+\s+(?:melhores?|principais?)|melhores?|listas?|guia|diret[oó]rio|"
                     r"resultados?|empresas?\s+(?:de|em)|encontre|pesquisa|busca|p[aá]gina|cat[aá]logo)\b", re.I)
EMAIL = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
DATE = lambda: dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def norm(value: object) -> str:
    val = unicodedata.normalize("NFD", str(value or ""))
    val = "".join(ch for ch in val if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", val.lower()).strip()


def clipped(value: object, maxlen: int = 180) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:maxlen]


def safe_url(value: object) -> str:
    try:
        url = urllib.parse.urlsplit(str(value or "").strip())
        host = url.hostname or ""
        if url.scheme not in ("https", "http") or not host or "." not in host or url.username or url.password or url.port not in (None, 80, 443):
            return ""
        if host.lower().endswith((".local", ".internal", ".test", ".invalid")):
            return ""
        return urllib.parse.urlunsplit((url.scheme, url.netloc, url.path or "/", url.query, ""))
    except ValueError:
        return ""


def http_json(url: str, data: dict | None = None, timeout: int = 13) -> dict | list:
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    encoded = None
    if data is not None:
        if url.endswith("/api/interpreter"):
            headers["Content-Type"] = "application/x-www-form-urlencoded"
            encoded = urllib.parse.urlencode(data).encode("utf-8")
        else:
            headers["Content-Type"] = "application/json"
            encoded = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=encoded, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError("response_too_large")
    return json.loads(raw)


def category_filters(segment: str) -> tuple[str, ...]:
    requested = norm(segment)
    for name, filters in OSM_TAGS.items():
        if name in requested or requested in name and len(requested) >= 4:
            return filters
    # Unknown category: avoid unrestricted Overpass scans; web search handles it.
    return ()


def is_matching_osm(segment: str, tags: dict) -> bool:
    requested = norm(segment)
    name = norm(tags.get("name"))
    shop = norm(tags.get("shop"))
    amenity = norm(tags.get("amenity"))
    leisure = norm(tags.get("leisure"))
    tourism = norm(tags.get("tourism"))
    if "barbearia" in requested or "barber" in requested:
        # shop=hairdresser also describes salons; don't silently call them barbers.
        return any(term in name for term in ("barbearia", "barber", "barbershop")) or (
            shop == "hairdresser" and norm(tags.get("hairdresser")) in ("barber", "male")
        )
    if "cabeleireiro" in requested or "salao" in requested:
        return shop == "hairdresser"
    expected = category_filters(segment)
    if not expected:
        return False
    osm_tags = {"shop": shop, "amenity": amenity, "leisure": leisure, "tourism": tourism}
    return any('"' + key + '"="' + str(tags.get(key, "")) + '"' in flt
               for flt in expected for key in osm_tags)


def result_record(facts: dict[str, str], source: str, title: str, observed: str,
                  collected_at: str) -> dict:
    evidence = [{"field": key, "value": val, "sourceUrl": source} for key, val in facts.items() if val]
    return {
        **{key: facts.get(key, "") for key in FIELDS},
        "aiResearch": {
            "evidence": evidence,
            "sources": [{"url": source, "title": clipped(title, 160)}],
            "opportunity": "", "suggestedApproach": "",
            "missingFields": [key for key in FIELDS if not facts.get(key)],
            "researchedAt": collected_at, "signals": [],
        },
    }


def from_osm(element: dict, segment: str, city: str, now: str) -> dict | None:
    tags = element.get("tags") or {}
    name = clipped(tags.get("name"), 140)
    if len(name) < 4 or GENERIC.match(name) or not is_matching_osm(segment, tags):
        return None
    typ = element.get("type")
    idn = element.get("id")
    if typ not in ("node", "way", "relation") or not isinstance(idn, int):
        return None
    point = element.get("center") or element
    if not isinstance(point.get("lat"), (int, float)) or not isinstance(point.get("lon"), (int, float)):
        return None
    if abs(point["lat"]) > 90 or abs(point["lon"]) > 180:
        return None
    source = f"https://www.openstreetmap.org/{typ}/{idn}"
    facts = {"company": name}
    # City in OSM may be absent; geographic inclusion validates the target area.
    declared_city = clipped(tags.get("addr:city"), 100)
    if declared_city:
        if norm(city.split(",")[0]) not in norm(declared_city):
            return None
        facts["city"] = declared_city
    else:
        facts["city"] = city.split(",")[0].strip()
    phone = clipped(tags.get("contact:phone") or tags.get("phone"), 50)
    if 10 <= len(re.sub(r"\D", "", phone)) <= 15:
        facts["phone"] = phone
    email = clipped(tags.get("contact:email") or tags.get("email"), 170)
    if EMAIL.match(email):
        facts["email"] = email
    website = safe_url(tags.get("contact:website") or tags.get("website"))
    if website:
        facts["website"] = website
    instagram = safe_url(tags.get("contact:instagram") or tags.get("instagram"))
    if instagram and urllib.parse.urlsplit(instagram).hostname in ("instagram.com", "www.instagram.com"):
        facts["instagram"] = instagram
    address = ", ".join(x for x in [clipped(tags.get("addr:street"), 120), clipped(tags.get("addr:housenumber"), 20)] if x)
    if address:
        facts["address"] = address
    return result_record(facts, source, name, "osm", now)


def web_records(data: dict | list, segment: str, city: str, now: str, limit: int) -> list[dict]:
    nodes = data.get("data", {}) if isinstance(data, dict) else {}
    nodes = nodes.get("web", []) if isinstance(nodes, dict) else []
    if not isinstance(nodes, list):
        return []
    results = []
    city_key = norm(city.split(",")[0])
    segment_key = norm(segment)
    for hit in nodes[:30]:
        if not isinstance(hit, dict):
            continue
        url = safe_url(hit.get("url"))
        title = clipped(hit.get("title"), 200)
        description = clipped(hit.get("description") or hit.get("markdown") or hit.get("content"), 3000)
        if not url or not title or GENERIC.match(title):
            continue
        if city_key not in norm(" ".join([title, description, url])):
            continue
        if segment_key not in norm(" ".join([title, description])):
            continue
        name = clipped(re.split(r"\s+[|–—]\s+|\s+-\s+|\s+·\s+", title)[0], 130)
        if not name or GENERIC.match(name) or norm(name) == segment_key:
            continue
        facts = {"company": name, "city": city.split(",")[0].strip()}
        results.append(result_record(facts, url, title, description, now))
        if len(results) >= limit:
            break
    return results


def perform(input_data: dict, get: Callable = http_json,
            post: Callable = http_json, progress: Callable | None = None) -> dict:
    now = DATE()
    segment = clipped(input_data.get("segment"), 100)
    city = clipped(input_data.get("city"), 100)
    limit = min(10, max(1, int(input_data.get("limit") or 5)))
    warnings: list[str] = []
    records: list[dict] = []
    attempted = 0
    region = city.split(",")[0].strip()
    if not segment or not region:
        raise ValueError("segment_and_city_required")
    def report(stage: str, count: int = 0):
        if progress:
            progress(stage, count)

    report("discover")
    filters = category_filters(segment)
    if filters:
        attempted += 1
        try:
            params = urllib.parse.urlencode({
                "q": f"{city}, Brasil" if "brasil" not in norm(city) else city,
                "format": "json", "limit": 1, "addressdetails": 1
            })
            places = get("https://nominatim.openstreetmap.org/search?" + params, timeout=12)
            if not isinstance(places, list) or not places:
                raise ValueError("location_not_found")
            # Guard against a homonymous municipality in another state.
            display = norm(places[0].get("display_name"))
            if norm(region) not in display or (", rs" in city.lower() and "rio grande do sul" not in display):
                raise ValueError("geocoder_location_mismatch")
            lat, lon = float(places[0]["lat"]), float(places[0]["lon"])
            radius = max(2000, min(20000, int(input_data.get("radiusKm", 15)) * 1000))
            queries = "".join(f"nwr(around:{radius},{lat:.6f},{lon:.6f}){flt};" for flt in filters)
            overpass = f"[out:json][timeout:24];({queries});out center tags;"
            api = "https://overpass-api.de/api/interpreter"
            osm = post(api, data={"data": overpass}, timeout=27)
            for element in (osm.get("elements", []) if isinstance(osm, dict) else [])[:450]:
                if not isinstance(element, dict):
                    continue
                item = from_osm(element, segment, city, now)
                if item:
                    records.append(item)
            report("web", len(records))
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError, TypeError) as error:
            warnings.append("OSM indisponível ou região não confirmada (" + type(error).__name__ + ").")
    else:
        warnings.append("Categoria não mapeada no OpenStreetMap; buscando fontes web.")
    if len(records) < limit:
        attempted += 1
        try:
            # Firecrawl self-hosted is a secondary source, not a requirement.
            # URL is fixed loopback: no requests to user-supplied endpoints.
            fc = post("http://127.0.0.1:3002/v2/search", data={
                "query": f"{segment} em {city} empresa endereço telefone",
                "limit": min(10, limit * 2), "sources": ["web"],
            }, timeout=16)
            records.extend(web_records(fc, segment, city, now, limit))
        except (urllib.error.URLError, TimeoutError, ValueError, TypeError):
            warnings.append("Firecrawl local indisponível; ele é opcional para buscas OSM.")
    seen: set[str] = set()
    accepted = []
    for record in records:
        identity = norm(record["company"]) + ":" + norm(record["city"])
        if identity not in seen:
            seen.add(identity)
            accepted.append(record)
        if len(accepted) >= limit:
            break
    if not accepted and attempted:
        warnings.append("Nenhuma empresa verificável retornada pelas fontes. Consulte os avisos e amplie os critérios.")
    if accepted and len(accepted) < limit:
        warnings.append("A coleta trouxe menos resultados verificáveis do que o solicitado.")
    warnings.append("Empresas encontradas em fontes públicas. Confirme os dados na revisão antes de transferir ao CRM.")
    report("completed", len(accepted))
    return {"leads": accepted, "warnings": warnings, "researchedAt": now,
            "researchMode": "essential", "extractionEngine": "python"}


if __name__ == "__main__":
    import sys
    data = json.load(sys.stdin)
    print(json.dumps(perform(data), ensure_ascii=False))
