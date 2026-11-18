#!/usr/bin/env python3
"""Verificação estática sem dependências externas das Skills do RealTalent."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / ".agents" / "skills"
EXPECTED = {"marketing-strategy", "market-research-icp", "content-copywriting", "campaign-measurement", "prospecting-sales-intelligence", "decision-maker-mapping", "lead-qualification", "consultative-selling", "sales-outreach", "buyer-psychology", "objection-negotiation", "conversation-intelligence", "proposal-deal-strategy", "revenue-intelligence"}
def validate():
    errors = []
    actual = {p.name for p in DIR.iterdir() if p.is_dir()} if DIR.exists() else set()
    if actual != EXPECTED:
        errors.append(f"Conjunto de Skills divergente: faltam={sorted(EXPECTED-actual)}, extras={sorted(actual-EXPECTED)}")
    for name in sorted(EXPECTED):
        path = DIR / name / "SKILL.md"
        if not path.is_file():
            errors.append(f"{name}: sem SKILL.md")
            continue
        data = path.read_text(encoding="utf-8")
        m = re.match(r"\A---\n(.*?)\n---\n", data, re.S)
        if not m:
            errors.append(f"{name}: YAML frontmatter ausente")
            continue
        fields = {}
        for ln in m.group(1).splitlines():
            if ":" not in ln:
                errors.append(f"{name}: linha inválida no frontmatter: {ln}")
                continue
            key,value=ln.split(":",1)
            fields[key.strip()] = value.strip()
        if fields.get("name") != name: errors.append(f"{name}: campo name incorreto")
        desc = fields.get("description", "")
        if not desc or len(desc) > 1024: errors.append(f"{name}: descrição ausente/excessiva")
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*",name) or len(name)>64: errors.append(f"{name}: slug inválido")
        for header in ("## Entradas mínimas","## Procedimento","## Entrega obrigatória","## Critérios de aceite","## Regras obrigatórias"):
            if header not in data: errors.append(f"{name}: falta seção {header}")
        if len(data) < 1200: errors.append(f"{name}: conteúdo insuficiente")
    return errors
if __name__ == "__main__":
    problems=validate()
    if problems:
        print("\n".join("ERRO: " + p for p in problems))
        sys.exit(1)
    print(f"OK: {len(EXPECTED)} Skills verificadas (estrutura e conteúdo mínimos).")
