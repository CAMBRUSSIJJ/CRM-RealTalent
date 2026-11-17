#!/usr/bin/env python3
"""Offline, deterministic business-card extraction for Garimpo Essencial.

No network access, AI model, external dependency, personal CRM data or shell.
Receives public indexed sources on stdin and emits only observed literal facts.
The Node gateway validates every fact against its original source again.
"""
import json
import re
import sys
import unicodedata

MAX_BYTES = 80000
PHONE = re.compile(r"(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*9?\d{4}[\s.-]*\d{4}\b")
EMAIL = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
GENERIC = re.compile(
    r"^(?:\d+\s+(?:melhores?|principais?)|melhores?|listas?|guia|diret[oó]rio|"
    r"resultados?|empresas?\s+(?:de|em)|encontre|pesquisa|busca|p[aá]gina|cat[aá]logo\s+de)\b", re.I)
CATEGORY = re.compile(
    r"^(?:barbearias?|sal[oõ]es?|cl[ií]nicas?|lojas?|restaurantes?|academias?|escolas?|empresas?)"
    r"\s+(?:em|na|no|de|da|do)\b", re.I)


def clean(value, n=200):
    return re.sub(r"\s+", " ", str(value or "")).strip()[:n]


def fold(value):
    normal = unicodedata.normalize("NFD", clean(value, 15000))
    return re.sub(r"[^a-z0-9]+", " ",
                  "".join(ch for ch in normal if unicodedata.category(ch) != "Mn").lower()).strip()


def extract(payload):
    criteria = payload.get("input") or {}
    city = clean(criteria.get("city", "")).split(",")[0].strip()
    segment = clean(criteria.get("segment", ""))
    target = fold(segment)
    category_base = re.sub(r"(?:ias|es|s)$", "", target)
    quantity = min(10, max(1, int(criteria.get("limit", 5))))
    if not city or not segment:
        return {"leads": []}
    rows = []
    seen = set()
    for item in (payload.get("sources") or [])[:30]:
        if not isinstance(item, dict):
            continue
        url = clean(item.get("url"), 1000)
        title = clean(item.get("title"), 200)
        content = clean(item.get("content"), 8000)
        corpus = fold(title + " " + content + " " + url)
        if (not url.startswith(("http://", "https://")) or not title or not content or
                fold(city) not in corpus or (target not in corpus and category_base not in corpus)):
            continue
        name = clean(re.split(r"\s+[|–—]\s+|\s+-\s+|\s+·\s+", title)[0], 90)
        name = re.sub(r"\s+(?:em|na cidade de)\s+.+$", "", name, flags=re.I).strip()
        if (len(name) < 5 or GENERIC.match(name) or CATEGORY.match(name)
                or fold(name) in (target, fold(city)) or fold(name) in seen):
            continue
        facts = [{"field": "company", "value": name, "sourceUrl": url}]
        if fold(city) in fold(title + " " + content):
            facts.append({"field": "city", "value": city, "sourceUrl": url})
        emails = EMAIL.findall(content)
        phones = PHONE.findall(content)
        if len(emails) == 1:
            facts.append({"field": "email", "value": emails[0], "sourceUrl": url})
        if len(phones) == 1:
            facts.append({"field": "phone", "value": phones[0], "sourceUrl": url})
        seen.add(fold(name))
        rows.append({"facts": facts, "opportunity": "", "suggestedApproach": "", "signals": []})
        if len(rows) >= quantity:
            break
    return {"leads": rows}


def main():
    raw = sys.stdin.buffer.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        return 1
    try:
        parsed = json.loads(raw)
        response = extract(parsed)
    except (ValueError, TypeError, KeyError, AttributeError):
        response = {"leads": []}
    sys.stdout.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
