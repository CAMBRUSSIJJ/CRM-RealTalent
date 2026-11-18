"""Correspondência explicável com o segmento. Não representa intenção de compra."""
from .models import Candidate, SearchRequest, normalized
from .providers import OSM_TAGS


FAMILIES = [
    ("barbearia barbearias barbeiro barbeiros barber barbershop".split(), ["barbear", "barber"]),
    (["salao de beleza", "saloes de beleza", "cabeleireiro", "cabeleireiros"], ["salao de beleza", "saloes de beleza", "cabeleireir", "beauty salon", "hairsalon", "beautysalon"]),
    (["dentista", "dentistas", "odontologia", "clinica odontologica", "clinicas odontologicas"], ["dentist", "odontolog"]),
    (["clinica", "clinicas", "clinica medica", "clinicas medicas"], ["clinica", "medicalclinic", "medicalbusiness"]),
    (["veterinario", "veterinarios", "clinica veterinaria", "clinicas veterinarias"], ["veterinar"]),
    (["contabilidade", "contador", "contadores", "escritorio de contabilidade"], ["contab", "contador", "accounting"]),
    (["advocacia", "advogado", "advogados"], ["advoca", "advogad", "legalservice"]),
    (["imobiliaria", "imobiliarias"], ["imobiliari", "realestateagent"]),
    (["academia", "academias"], ["academia", "fitness", "exercisegym"]),
    (["restaurante", "restaurantes"], ["restauran", "foodestablishment"]),
    (["pizzaria", "pizzarias"], ["pizzaria", "pizza"]),
    (["hotel", "hoteis"], ["hotel", "hoteis"]),
    (["padaria", "padarias"], ["padaria", "panific", "bakery"]),
]
STOPWORDS = {"de", "da", "do", "das", "dos", "e", "em", "para", "com"}


def matches(segment: str, text: str) -> bool:
    query, text = normalized(segment), normalized(text)
    if not text:
        return False
    for aliases, terms in FAMILIES:
        if query in aliases:
            # Prefixos são aplicados por palavra, nunca dentro de outro nome.
            return any(any(word.startswith(term) for word in text.split()) if " " not in term else term in text for term in terms)
    tokens = [token.rstrip("s") for token in query.split() if token not in STOPWORDS]
    return bool(tokens) and all(any(word.rstrip("s") == token for word in text.split()) for token in tokens)


def assess(item: Candidate, request: SearchRequest) -> tuple[int, list[str]]:
    strength = 0
    reasons = []
    if matches(request.segment, str(item.listing.get("category", ""))):
        strength = 70
        reasons.append("Categoria publicada no Google Maps corresponde ao segmento solicitado.")
    if item.category and item.category in {f"{key}={value}" for key, value in OSM_TAGS.get(normalized(request.segment), [])}:
        # Hairdresser é amplo demais para afirmar que o estabelecimento é barbearia.
        approximate = normalized(request.segment) in {"barbearia", "barbearias"}
        strength = 25 if approximate else 70
        reasons.append("Categoria OSM aproximada: hairdresser." if approximate else "Categoria OSM corresponde ao segmento solicitado.")
    for text, value, reason in (
        (item.company, 70, "Nome/título contém termos do segmento."),
        (" ".join(item.schema_types), 75, "Tipo de negócio publicado no site corresponde ao segmento."),
        (item.description, 50, "Descrição da fonte contém termos do segmento."),
        (item.observed_text, 35, "Texto consultado no site contém termos do segmento."),
    ):
        if matches(request.segment, text):
            strength = max(strength, value)
            reasons.append(reason)
    # Localidade só aumenta a nota quando também há correspondência de segmento.
    if strength and item.location_status == "observed" and normalized(item.city) == normalized(request.city) and (not item.state or item.state == request.state):
        strength += 15
        reasons.append("Município observado corresponde ao solicitado.")
    if not reasons:
        reasons.append("Sem correspondência observada com o segmento; revisão necessária.")
    return min(100, strength), reasons
