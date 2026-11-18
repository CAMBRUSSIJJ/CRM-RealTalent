from html.parser import HTMLParser
import json
import re
from urllib.parse import parse_qs, unquote, urljoin, urlsplit
from urllib.robotparser import RobotFileParser

from .models import Candidate, Evidence, normalized, now, phone_number, valid_cnpj, website_url
from .network import HTTP, SourceError, same_site
from .providers import STATES, eligible_site


EMAIL = re.compile(r"(?<![\w.+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}(?![\w.-])", re.I)
PHONE = re.compile(r"(?<!\d)(?:\+?55[\s.-]?)?(?:\(?[1-9]\d\)?[\s.-]?)(?:9[\s.-]?)?[2-9]\d{3}[\s.-]?\d{4}(?!\d)")
CNPJ = re.compile(r"(?<!\d)\d{2}\.?\d{3}\.?\d{3}[/\s]?\d{4}-?\d{2}(?!\d)")
BUSINESS_TYPES = {"organization", "localbusiness", "corporation", "dentist", "medicalbusiness", "medicalclinic", "store", "hairsalon", "beautysalon", "healthandbeautybusiness", "professionalservice", "restaurant", "foodestablishment", "legalservice", "accountingservice", "realestateagent", "automotivebusiness", "hotel", "lodgingbusiness", "veterinarycare", "exercisegym", "sportsactivitylocation", "cafeorcoffeeshop"}
CREDIT = re.compile(r"developer|site.?credit|web.?design|powered.?by|desenvolvido|desenvolvimento.?site", re.I)
CREDIT_TEXT = re.compile(r"(?:desenvolvid[oa]|criado|powered|designed)\s+(?:por|by)\b[^\r\n]*", re.I)
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text: list[str] = []
        self.links: list[tuple[str, str]] = []
        self.jsonld: list[str] = []
        self.frames: list[tuple[str, bool]] = []
        self.script_depth = 0
        self.script_parts: list[str] = []
        self.current_link: tuple[str, list[str]] | None = None
        self.visible_tail = ""
        self.headings: list[str] = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        inherited = bool(self.frames and self.frames[-1][1])
        credit = bool(CREDIT.search(str(attrs.get("id", "")) + " " + str(attrs.get("class", ""))))
        if tag == "a" and re.search(r"(?:desenvolvid[oa]|criado|powered|designed)\s+(?:por|by)\s*[:\-]?\s*$", self.visible_tail, re.I):
            credit = True
        hidden = "hidden" in attrs or attrs.get("aria-hidden") == "true" or bool(re.search(r"display\s*:\s*none", str(attrs.get("style", "")), re.I))
        ignored = inherited or credit or hidden or tag in {"script", "style", "noscript", "svg"}
        if tag not in VOID_TAGS:
            self.frames.append((tag, ignored))
        if tag == "script" and not inherited and attrs.get("type", "").lower() == "application/ld+json":
            self.script_depth = len(self.frames)
            self.script_parts = []
        if tag == "a" and not ignored:
            self.current_link = (attrs.get("href", ""), [])

    def handle_endtag(self, tag):
        if tag == "script" and self.script_depth:
            self.jsonld.append("".join(self.script_parts))
            self.script_depth = 0
        for index in range(len(self.frames) - 1, -1, -1):
            if self.frames[index][0] == tag:
                del self.frames[index:]
                break
        if tag == "a" and self.current_link:
            self.links.append((self.current_link[0], " ".join(self.current_link[1])))
            self.current_link = None
        if tag == "a":
            self.visible_tail = ""

    def handle_data(self, data):
        if self.script_depth:
            self.script_parts.append(data)
        if not self.frames or not self.frames[-1][1]:
            self.visible_tail = (self.visible_tail + data)[-150:]
            data = CREDIT_TEXT.sub("", data)
            self.text.append(data)
            if any(tag in {"title", "h1"} for tag, _ in self.frames):
                self.headings.append(data)
            if self.current_link:
                self.current_link[1].append(data)


def business_objects(value, depth=0):
    if depth > 12:
        return
    if isinstance(value, dict):
        kinds = value.get("@type", [])
        kinds = [kinds] if isinstance(kinds, str) else kinds
        if isinstance(kinds, list) and any(str(kind).lower() in BUSINESS_TYPES for kind in kinds):
            yield value
        for key, child in value.items():
            if key in {"author", "publisher", "creator", "provider", "brand", "review", "employee", "member"}:
                continue
            if isinstance(child, (dict, list)):
                yield from business_objects(child, depth + 1)
    elif isinstance(value, list):
        for child in value[:100]:
            yield from business_objects(child, depth + 1)


def primary_business(page: Page, item: Candidate, url: str):
    """Seleciona uma entidade do próprio site; empate ambíguo exige revisão."""
    entities = {}
    for raw in page.jsonld[:20]:
        try:
            objects = business_objects(json.loads(raw))
            for company in objects:
                declared = company.get("url") or company.get("@id")
                declared = urljoin(url, declared) if isinstance(declared, str) else ""
                if declared and not same_site(url, declared):
                    continue
                name = company.get("name", "")
                if not isinstance(name, str):
                    continue
                key = (normalized(name), str(company.get("address", "")))
                kinds = company.get("@type", [])
                kinds = [kinds] if isinstance(kinds, str) else kinds
                specific = isinstance(kinds, list) and any(str(kind).lower() not in {"organization", "corporation"} for kind in kinds)
                name_match = len(normalized(name)) >= 4 and (normalized(name) in normalized(item.company) or normalized(item.company) in normalized(name))
                strength = (4 if declared else 0) + (4 if name_match else 0) + (2 if specific else 0)
                if strength:
                    previous = entities.get(key)
                    if previous is None or strength > previous[0]:
                        entities[key] = (strength, company)
        except (ValueError, RecursionError):
            continue
    choices = sorted(entities.values(), key=lambda pair: pair[0], reverse=True)
    ambiguous = len(choices) > 1 and choices[0][0] == choices[1][0]
    return (None if not choices or ambiguous else choices[0][1]), ambiguous


def email_address(value: str) -> str:
    value = value.strip().lower()
    if not EMAIL.fullmatch(value) or len(value) > 254:
        return ""
    host = value.rsplit("@", 1)[1]
    if host in {"example.com", "example.org", "dominio.com", "seusite.com.br", "email.com"} or host.endswith((".png", ".jpg", ".webp", ".svg")):
        return ""
    return value


def identity_reasons(page: Page, item: Candidate, url: str) -> list[str]:
    """Um site descoberto precisa corroborar a empresa e a filial procuradas."""
    company, ambiguous = primary_business(page, item, url)
    if ambiguous:
        return []
    text = normalized(" ".join(page.text))
    expected = normalized(item.company)
    generic = {"barbearia", "barber", "barbershop", "salao", "de", "da", "do", "e", "beleza", "clinica", "empresa", "ltda", "me"}
    distinctive = set(expected.split()) - generic
    def same_name(name):
        name = normalized(name)
        return bool(expected and name and (expected == name or (distinctive and distinctive <= set(name.split()) and (expected in name or name in expected))))
    def address_matches(observed):
        parts = item.address.split(",")
        number = re.match(r"\s*(\d+[a-z]?)\b", parts[1], re.I) if len(parts) > 1 else None
        street = re.sub(r"^(?:rua|avenida|travessa|estrada|av|r)\s+", "", normalized(parts[0]))
        if not street or not number:
            return False
        pattern = r"\b" + re.escape(street) + r"\s+(?:(?:n|numero)\s+)?" + re.escape(number[1].lower()) + r"\b"
        return bool(re.search(pattern, normalized(observed)))
    city = normalized(item.city)
    if company is not None:
        address = company.get("address", {})
        address = address if isinstance(address, dict) else {}
        observed_city = normalized(str(address.get("addressLocality", "")))
        region = str(address.get("addressRegion", "")).strip().upper()
        region = region if region in STATES else next((uf for uf, name in STATES.items() if normalized(name) == normalized(region)), "")
        if (observed_city and observed_city != city) or (region and item.state and region != item.state):
            return []
        observed_cnpj = valid_cnpj(str(company.get("taxID", "")))
        if item.cnpj and observed_cnpj and item.cnpj != observed_cnpj:
            return []
        same_identifier = bool((item.cnpj and observed_cnpj == item.cnpj) or (item.phone and phone_number(str(company.get("telephone", ""))) == item.phone))
        street = str(address.get("streetAddress", ""))
        if same_name(str(company.get("name", ""))) and (same_identifier or (city and city == observed_city and (distinctive or address_matches(street)))):
            # Se já conhecemos o endereço, não aceitamos outra filial da mesma cidade.
            if item.address and not address_matches(street) and not same_identifier:
                return []
            return ["Nome da empresa corresponde ao cadastro de origem.", "Identidade corroborada por localidade/endereço ou identificador publicado."]
    # Texto sem dados estruturados exige nome no título e endereço corroborado;
    # menção solta da cidade em um rodapé não identifica uma filial.
    if same_name(" ".join(page.headings)) and city and re.search(r"\b" + re.escape(city) + r"\b", text) and address_matches(text):
        return ["Nome observado no título da página.", "Município e endereço correspondem ao cadastro de origem."]
    return []


def extract(item: Candidate, body: str, url: str, observed_at: str | None = None, *, require_identity=False) -> list[str]:
    evidence_start = len(item.evidence)
    page = Page()
    page.feed(body)
    page.close()
    if require_identity and not item.website_matched:
        reasons = identity_reasons(page, item, url)
        if not reasons:
            item.warnings.append("O site encontrado ainda não corroborou a identidade da empresa e da filial; contatos não atribuídos.")
            links = []
            for href, label in page.links:
                target = website_url(urljoin(url, href))
                if target and same_site(url, target) and re.search(r"contato|contact|fale.?conosco", normalized(urlsplit(target).path + " " + label)):
                    if target != website_url(url) and target not in links:
                        links.append(target)
            return links[:2]
        item.website_matched = True
        item.website_match_reasons = reasons
    company, ambiguous = primary_business(page, item, url)
    if ambiguous:
        item.warnings.append("A página descreve várias empresas sem identificação principal; contatos dessa página não foram atribuídos.")
    text = " ".join(page.text)
    if not ambiguous:
        item.documents = [doc for doc in item.documents if doc.get("url") != url]
        item.documents.append({"url":url,"text":text[:6000],"observed_at":observed_at or now()})
        item.documents = item.documents[-3:]
    item.observed_text = (item.observed_text + " " + text).strip()[:8000]
    if company is not None:
        # Identidade principal observada tem prioridade sobre contatos soltos no rodapé.
        for field, value in {
            "phone": phone_number(str(company.get("telephone", ""))),
            "email": email_address(str(company.get("email", "")).removeprefix("mailto:")),
            "cnpj": valid_cnpj(str(company.get("taxID", ""))),
        }.items():
            item.observe(field, value, url, "Site da empresa — dados estruturados")
    contacts = []
    for href, label in page.links:
        href = unquote(href).strip()
        if not ambiguous and href.lower().startswith("tel:"):
            item.observe("phone", phone_number(href[4:]), url, "Site da empresa — link de telefone")
        elif not ambiguous and href.lower().startswith("mailto:"):
            item.observe("email", email_address(href[7:].split("?", 1)[0]), url, "Site da empresa — link de e-mail")
        else:
            target = urljoin(url, href)
            parts = urlsplit(target)
            host = (parts.hostname or "").lower().removeprefix("www.")
            if not ambiguous and host in {"wa.me", "api.whatsapp.com", "web.whatsapp.com"}:
                number = parts.path.strip("/") if host == "wa.me" else parse_qs(parts.query).get("phone", [""])[0]
                item.observe("phone", phone_number(number), url, "Site da empresa — link WhatsApp")
            elif not ambiguous and host == "instagram.com":
                profile = parts.path.strip("/").split("/")[0]
                if re.fullmatch(r"[a-zA-Z0-9._]{1,30}", profile) and profile not in {"p", "reel", "reels", "stories", "explore", "accounts"}:
                    item.observe("instagram", "https://www.instagram.com/" + profile, url, "Site da empresa")
            canonical = website_url(target)
            if canonical and same_site(url, canonical) and re.search(r"contato|contact|fale.?conosco|atendimento", normalized(parts.path + " " + label)):
                if canonical != website_url(url) and canonical not in contacts:
                    contacts.append(canonical)

    if company is not None:
        kinds = company.get("@type", [])
        kinds = [kinds] if isinstance(kinds, str) else kinds
        item.schema_types = list(dict.fromkeys(item.schema_types + [kind for kind in kinds if isinstance(kind, str)]))
        name = company.get("name")
        if isinstance(name, str) and name.strip() and item.provider_id.startswith("brave:"):
            item.company = name.strip()[:200]
            item.evidence.append(Evidence(field="company", value=item.company, url=url, source="Site da empresa — dados estruturados"))
        address = company.get("address")
        if isinstance(address, dict):
            city = address.get("addressLocality")
            if isinstance(city, str) and city.strip():
                item.city = city.strip()
                item.location_status = "observed"
                item.evidence.append(Evidence(field="city", value=item.city, url=url, source="Site da empresa — endereço estruturado"))
            region = address.get("addressRegion")
            if isinstance(region, str):
                state = region.strip().upper()
                if state not in STATES:
                    state = next((uf for uf, name in STATES.items() if normalized(region) == normalized(name)), "")
                if state:
                    item.state = state
                    item.evidence.append(Evidence(field="state", value=state, url=url, source="Site da empresa — endereço estruturado"))
            item.observe("address", ", ".join(str(address[key]) for key in ("streetAddress", "postalCode") if isinstance(address.get(key), str)), url, "Site da empresa — endereço estruturado")

    if not ambiguous:
        for field, pattern, cleaner in (("email", EMAIL, email_address), ("phone", PHONE, phone_number), ("cnpj", CNPJ, valid_cnpj)):
            for match in list(pattern.finditer(text))[:30]:
                item.observe(field, cleaner(match.group()), url, "Site da empresa — texto publicado")
    if observed_at:
        for evidence in item.evidence[evidence_start:]:
            evidence.observed_at = observed_at
    return contacts[:2]


class WebsiteCollector:
    def __init__(self, http: HTTP):
        self.http = http
        self.robot_locks = {}

    async def allowed(self, url: str) -> bool:
        from asyncio import Lock
        parts = urlsplit(url)
        robots_url = f"{parts.scheme}://{parts.netloc}/robots.txt"
        # Chaves contêm só URL pública, nunca tokens.
        async with self.robot_locks.setdefault(robots_url, Lock()):
            cached = self.http.store.cache_get("robots:" + robots_url)
            if cached is None:
                body, _, status = await self.http.page(robots_url, max_bytes=250_000)
                if status in {404, 410}:
                    body = "User-agent: *\nAllow: /"
                elif status >= 400:
                    raise SourceError("Não foi possível verificar as regras de coleta do site.")
                cached = body
                self.http.store.cache_put("robots:" + robots_url, cached, 3600)
            else:
                self.http.count("robots_cache_hits")
        parser = RobotFileParser()
        parser.parse(cached.splitlines())
        if not parser.can_fetch("RealTalentGarimpo", url):
            return False
        delay = parser.crawl_delay("RealTalentGarimpo")
        if delay:
            if delay > 20:
                raise SourceError("O intervalo de coleta solicitado pelo site excede o orçamento desta busca.")
            await self.http.throttle((parts.hostname or "").removeprefix("www."), float(delay))
        return True

    async def collect(self, candidate: Candidate, *, require_identity=False) -> Candidate:
        # Progresso é mantido no objeto mesmo se o orçamento de tempo se esgotar.
        item = candidate
        if not item.website or not eligible_site(item.website):
            return item
        visited: set[str] = set()
        item.website = website_url(item.website)
        if not item.website:
            return item
        pending = [item.website]
        fallbacks = set()
        while pending and len(visited) < 3:
            url = pending.pop(0)
            if url in visited or not same_site(item.website, url):
                continue
            visited.add(url)
            try:
                if not await self.allowed(url):
                    item.warnings.append("O site restringe a coleta em robots.txt; página não consultada.")
                    continue
                cache_key = "page-v2:" + website_url(url)
                cached = self.http.store.cache_get(cache_key)
                if cached is None:
                    body, final_url, status = await self.http.page(url, before_redirect=self.allowed)
                    if status >= 400:
                        # Um resultado profundo pode ter saído do ar enquanto o site continua ativo.
                        root = urlsplit(url)._replace(path="/", query="", fragment="").geturl()
                        if status in {404, 410} and root not in visited and root not in pending:
                            pending.append(root)
                            fallbacks.add(root)
                        raise SourceError(f"A página de contato não está disponível (HTTP {status}).")
                    cached = {"body": body, "url": final_url, "fetched_at": now()}
                    self.http.store.cache_put(cache_key, cached, min(3600, self.http.settings.cache_ttl))
                else:
                    self.http.count("website_cache_hits")
                # Redirecionamentos permanecem no mesmo site e também respeitam robots.
                if cached["url"] != url and not await self.allowed(cached["url"]):
                    item.warnings.append("A página de destino restringe a coleta em robots.txt.")
                    continue
                if url in fallbacks:
                    item.website = website_url(cached["url"])
                    item.observe("website", item.website, cached["url"], "Site da empresa — página inicial disponível", cached["fetched_at"])
                links = extract(item, cached["body"], cached["url"], cached["fetched_at"], require_identity=require_identity)
                pending.extend(link for link in links if link not in visited and link not in pending)
                if item.phone and item.email:
                    break
            except (SourceError, ValueError) as exc:
                item.warnings.append(str(exc) if isinstance(exc, SourceError) else "O site retornou conteúdo que não pôde ser interpretado.")
        item.warnings = list(dict.fromkeys(item.warnings))[:20]
        return item
