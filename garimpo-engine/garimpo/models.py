from datetime import datetime, timezone
from typing import Literal
import re
import unicodedata
from urllib.parse import parse_qsl, urlencode, urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import __version__


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalized(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return " ".join(re.findall(r"[a-z0-9]+", value))


def address_identity(value: str) -> str:
    parts=value.split(",")
    if len(parts)<2:
        return normalized(value)
    house=re.match(r"\s*(\d+[a-z]?)\b",parts[1],re.I)
    if not house:
        return normalized(value)
    street=normalized(parts[0])
    for short,full in (("av ","avenida "),("r ","rua "),("trav ","travessa ")):
        if street.startswith(short):street=full+street[len(short):];break
    return street+", "+house[1].lower()


def website_url(value: str) -> str:
    value = value.strip()
    if value and "://" not in value:
        value = "https://" + value
    try:
        parts = urlsplit(value)
        if parts.scheme not in {"http", "https"} or not parts.hostname or parts.username or parts.password:
            return ""
        if parts.port not in {None, 80, 443}:
            return ""
        host = parts.hostname.encode("idna").decode().lower()
        host = f"[{host}]" if ":" in host else host
        if parts.port and (parts.scheme, parts.port) not in {("https", 443), ("http", 80)}:
            host += f":{parts.port}"
        query = [(key, val) for key, val in parse_qsl(parts.query, keep_blank_values=True)
                 if not key.lower().startswith("utm_") and key.lower() not in {"gclid", "fbclid", "msclkid"}]
        return parts._replace(netloc=host, query=urlencode(query), fragment="").geturl()
    except ValueError:
        return ""


def phone_number(value: str) -> str:
    value = re.split(r"(?:ramal|ext\.?|;ext=)", value, flags=re.I)[0]
    digits = re.sub(r"\D", "", value)
    if len(digits) in {12, 13} and digits.startswith("55"):
        digits = digits[2:]
    if len(digits) not in {10, 11} or digits[:2] not in DDDS:
        return ""
    if (len(digits) == 11 and digits[2] != "9") or (len(digits) == 10 and digits[2] not in "2345"):
        return ""
    return "+55" + digits


def osm_phone(tags: dict) -> str:
    for key in ("contact:phone", "phone", "contact:mobile", "mobile", "contact:whatsapp", "whatsapp"):
        for value in str(tags.get(key, "")).split(";"):
            value = value.strip()
            if key.endswith("whatsapp") and "://" in value:
                parts = urlsplit(value)
                if parts.hostname not in {"wa.me", "api.whatsapp.com"}:
                    continue
                value = parts.path.strip("/") if parts.hostname == "wa.me" else dict(parse_qsl(parts.query)).get("phone", "")
            number = phone_number(value)
            if number:
                return number
    return ""


DDDS = set("11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99".split())
UFS = set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split())


def valid_cnpj(value: str) -> str:
    if re.search(r"[^\d./\s-]", value):
        return ""
    digits = re.sub(r"\D", "", value)
    if len(digits) != 14 or len(set(digits)) == 1:
        return ""
    for length in (12, 13):
        weights = list(range(length - 7, 1, -1)) + list(range(9, 1, -1))
        remainder = sum(int(n) * w for n, w in zip(digits[:length], weights)) % 11
        if int(digits[length]) != (0 if remainder < 2 else 11 - remainder):
            return ""
    return digits


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    segment: str = Field(min_length=2, max_length=100)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=2)
    provider: Literal["auto", "osm", "brave", "hybrid", "maps", "combined"] = "auto"
    limit: int = Field(default=25, ge=1, le=100, strict=True)
    require_phone: bool = False
    require_email: bool = False
    require_observed_location: bool = False
    minimum_relevance: int = Field(default=0, ge=0, le=100, strict=True)
    enrich_websites: bool = True
    qualify: bool = False
    search_mode: Literal["standard", "expanded"] = "expanded"

    @field_validator("state")
    @classmethod
    def validate_state(cls, value):
        value = value.upper()
        if value not in UFS:
            raise ValueError("Informe uma UF brasileira válida.")
        return value

    @field_validator("segment", "city")
    @classmethod
    def validate_text(cls, value):
        if any(unicodedata.category(c).startswith("C") for c in value):
            raise ValueError("Caracteres de controle não são permitidos.")
        return value


class Evidence(BaseModel):
    field: str
    value: str
    url: str
    source: str
    observed_at: str = Field(default_factory=now)
    status: Literal["published"] = "published"


class Candidate(BaseModel):
    provider_id: str
    company: str
    city: str = ""
    state: str = ""
    address: str = ""
    phone: str = ""
    email: str = ""
    cnpj: str = ""
    website: str = ""
    instagram: str = ""
    description: str = ""
    location_status: Literal["requested", "observed"] = "requested"
    evidence: list[Evidence] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    quality_score: int = 0
    category: str = ""
    schema_types: list[str] = Field(default_factory=list)
    observed_text: str = ""
    provider_rank: int = 0
    relevance_score: int = 0
    relevance_reasons: list[str] = Field(default_factory=list)
    dataset: dict[str, str] = Field(default_factory=dict)
    website_matched: bool = False
    website_match_reasons: list[str] = Field(default_factory=list)
    recovery_status: str = "not_attempted"
    recovered_fields: list[str] = Field(default_factory=list)
    listing: dict = Field(default_factory=dict)
    qualification: dict = Field(default_factory=dict)
    documents: list[dict] = Field(default_factory=list)

    def observe(self, field: str, value: str, url: str, source: str, observed_at: str | None = None):
        if not value:
            return
        if not getattr(self, field):
            setattr(self, field, value)
        evidence = Evidence(field=field, value=value, url=url, source=source, observed_at=observed_at or now())
        if not any((e.field, e.value, e.url) == (field, value, url) for e in self.evidence):
            self.evidence.append(evidence)

    def capture_draft(self, segment: str) -> dict:
        # "manual" é uma origem aceita pelo importador atual. A fonte real é explícita.
        return {
            "name": self.company, "company": self.company,
            **{key: getattr(self, key) for key in ("email", "cnpj", "website", "instagram", "address", "city", "state", "description")},
            # O CRM existente compara telefones em formato nacional.
            "phone": self.phone[3:] if self.phone.startswith("+55") else self.phone,
            "source": "manual", "sourceDetail": "Motor Python / " + self.provider_id.split(":", 1)[0],
            "segment": segment, "engine": {
                "version": __version__, "providerId": self.provider_id,
                "requestedSegment": segment, "locationStatus": self.location_status,
                "qualityScore": self.quality_score,
                "relevanceScore": self.relevance_score, "relevanceReasons": self.relevance_reasons,
                "dataset": self.dataset,
                "recoveryStatus": self.recovery_status, "recoveredFields": self.recovered_fields,
                "websiteMatchReasons": self.website_match_reasons,
                "listing": self.listing, "qualification": self.qualification,
                "evidence": [e.model_dump() for e in self.evidence], "warnings": self.warnings,
            },
            "notes": "Motor Garimpo: contatos publicados, sem validação de titularidade. "
            + ("Localidade observada na fonte." if self.location_status == "observed" else "Localidade solicitada na busca; confirmar antes do contato."),
        }


def deduplicate(items: list[Candidate]) -> list[Candidate]:
    result: list[Candidate] = []
    keys: dict[tuple, Candidate] = {}

    def merge(target: Candidate, other: Candidate):
        if other.location_status == "observed" and target.location_status != "observed":
            target.city = other.city
            if other.state:
                target.state = other.state
        for field in ("phone", "email", "cnpj", "website", "instagram", "address", "city", "state", "description"):
            if not getattr(target, field):
                setattr(target, field, getattr(other, field))
        for evidence in other.evidence:
            target.observe(evidence.field, evidence.value, evidence.url, evidence.source, evidence.observed_at)
        if other.location_status == "observed":
            target.location_status = "observed"
        target.warnings = list(dict.fromkeys(target.warnings + other.warnings))
        if not target.category:
            target.category = other.category
        target.schema_types = list(dict.fromkeys(target.schema_types + other.schema_types))
        target.observed_text = (target.observed_text + " " + other.observed_text).strip()[:8000]
        target.recovered_fields = list(dict.fromkeys(target.recovered_fields + other.recovered_fields))
        if not target.listing:
            target.listing = other.listing
        if not target.qualification:
            target.qualification = other.qualification

    for item in items:
        name = normalized(item.company)
        locality = (normalized(item.city), item.state)
        identities = [("provider", item.provider_id)]
        if item.cnpj:
            identities.append(("cnpj", item.cnpj))
        if item.phone and name:
            identities.append(("phone-name", item.phone, name, *locality, address_identity(item.address)))
        if name and item.address:
            identities.append(("address", name, *locality, address_identity(item.address)))
        # Mesmo domínio não basta: filiais podem compartilhar site e central telefônica.
        matches = []
        for key in identities:
            match = keys.get(key)
            if match is None or any(match is existing for existing in matches):
                continue
            if item.cnpj and match.cnpj and item.cnpj != match.cnpj:
                warning = "Dados semelhantes com CNPJs diferentes; registros mantidos separados para revisão."
                item.warnings = list(dict.fromkeys(item.warnings + [warning]))
                match.warnings = list(dict.fromkeys(match.warnings + [warning]))
                continue
            matches.append(match)
        if not matches:
            target = item
            result.append(item)
        else:
            target = matches[0]
            merge(target, item)
            for other in matches[1:]:
                if target.cnpj and other.cnpj and target.cnpj != other.cnpj:
                    continue
                merge(target, other)
                result = [existing for existing in result if existing is not other]
                keys = {key: target if value is other else value for key, value in keys.items()}
        for key in identities:
            existing = keys.get(key)
            if not existing or not existing.cnpj or not target.cnpj or existing.cnpj == target.cnpj:
                keys[key] = target
    return result


def score(item: Candidate) -> int:
    # Preenchimento observado; não representa probabilidade de compra ou conversão.
    return sum(weight for field, weight in (("company", 10), ("phone", 25), ("email", 25), ("website", 15), ("address", 10), ("cnpj", 10)) if getattr(item, field)) + (5 if item.location_status == "observed" else 0)
