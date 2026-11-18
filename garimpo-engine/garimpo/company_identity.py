"""CNPJ company-name matching: useful suggestions, never identity proof.

The pilot compares official RFB establishment records against a name and city.
An address is NOT corroborated by the public index (no street column), so a
candidate must always be explicitly selected by a CRM user.
"""
from difflib import SequenceMatcher

from .models import normalized, valid_cnpj

STOPWORDS = {
    "de", "da", "do", "das", "dos", "e", "a", "o", "na", "no",
    "empresa", "empresas", "ltda", "mei", "me", "eireli", "sa", "s", "a",
    "comercio", "servicos", "servico", "industria", "grupo", "cia",
    "barbearia", "barbershop", "barber", "salao", "clinica", "escola",
    "loja", "restaurante", "consultoria", "educacao", "profissional",
    "estabelecimento", "filial", "matriz",
}


def distinctive_tokens(value: str) -> list[str]:
    tokens = normalized(value).split()
    return [word for word in tokens if len(word) >= 3 and word not in STOPWORDS][:10]


def search_terms(company: str) -> list[str]:
    full = normalized(company)[:120]
    important = distinctive_tokens(company)
    if not important or len(full) < 3:
        return []
    # Fall back to at most one distinctive term if the complete business
    # name does not appear verbatim in the index. A single generic term is
    # never sent to the database as a broad discovery query.
    terms = [full]
    for token in sorted(important, key=len, reverse=True):
        if len(token) >= 5 and token != full:
            terms.append(token)
            break
    return terms


def score_candidate(company: str, city: str, state: str, entry: dict) -> dict | None:
    """Explainable deterministic ranking, not probability of actual ownership."""
    if normalized(str(entry.get("city", ""))) != normalized(city):
        return None
    if str(entry.get("uf", "")).upper() != state.upper():
        return None
    cnpj = valid_cnpj(str(entry.get("cnpj", "")))
    if not cnpj:
        return None
    expected = normalized(company)
    important = set(distinctive_tokens(company))
    if not important:
        return None
    legal = normalized(str(entry.get("legal_name", "")))
    trade = normalized(str(entry.get("trade_name", "")))
    if not (legal or trade):
        return None
    choices = [name for name in (trade, legal) if name]
    overlaps = [len(important & set(distinctive_tokens(name))) / len(important)
                for name in choices]
    best_overlap = max(overlaps, default=0)
    ratio = max((SequenceMatcher(a=expected, b=name).ratio()
                 for name in choices), default=0)
    exact_trade = expected == trade
    exact_legal = expected == legal
    all_named = any(important <= set(distinctive_tokens(name)) for name in choices)
    # "Barbearia"/"Escola" alone are not identifying attributes.
    if not (exact_trade or exact_legal or
            (best_overlap >= 0.70 and ratio >= 0.50) or
            (all_named and ratio >= 0.45)):
        return None
    if exact_trade:
        score = 96
        match = "Nome fantasia igual ao nome pesquisado."
    elif exact_legal:
        score = 94
        match = "Razão social igual ao nome pesquisado."
    elif all_named and ratio >= 0.72:
        score = 83
        match = "Termos distintivos do nome aparecem no cadastro."
    else:
        score = min(79, round(40 + best_overlap * 24 + ratio * 18))
        match = "Parte do nome corresponde; conferir antes de vincular."
    if str(entry.get("status")) != "02":
        score = max(35, score - 16)
    reasons = [match, "Município e UF coincidem com a pesquisa."]
    if str(entry.get("status")) != "02":
        reasons.append("Situação cadastral não ativa.")
    else:
        reasons.append("Situação cadastral ativa no conjunto importado.")
    reasons.append("Rua, número, domínio e titularidade não verificados pelo índice.")
    return {
        "cnpj": cnpj,
        "legal_name": str(entry.get("legal_name", ""))[:240],
        "trade_name": str(entry.get("trade_name", ""))[:240],
        "city": str(entry.get("city", ""))[:100],
        "uf": str(entry.get("uf", "")),
        "main_cnae": str(entry.get("main_cnae", "")),
        "status": str(entry.get("status", "")),
        "headquarters": bool(entry.get("headquarters", False)),
        "source_month": str(entry.get("source_month", "")),
        "source_url": str(entry.get("source_url", "")),
        "match_score": score,
        "reasons": reasons,
        "identity_confirmed": False,
    }


def rank_candidates(company: str, city: str, state: str, rows: list[dict], limit=7) -> list[dict]:
    distinct: dict[str, dict] = {}
    for row in rows[:150]:
        candidate = score_candidate(company, city, state, row)
        if not candidate:
            continue
        key = candidate["cnpj"]
        if key not in distinct or candidate["match_score"] > distinct[key]["match_score"]:
            distinct[key] = candidate
    return sorted(
        distinct.values(),
        key=lambda row: (-row["match_score"], row["status"] != "02", row["cnpj"]),
    )[:limit]
