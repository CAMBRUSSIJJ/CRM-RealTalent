#!/usr/bin/env python3
"""Migra apenas o Firecrawl do conector RealTalent para um gateway Railway autenticado."""
from __future__ import annotations

from datetime import datetime
import getpass
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
from urllib.parse import urlsplit

def fail(message: str) -> None:
    print(f"ERRO: {message}", file=sys.stderr)
    raise SystemExit(1)

def gateway(raw: str) -> str:
    raw = raw.strip().rstrip("/")
    parsed = urlsplit(raw)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or not parsed.hostname.endswith(".up.railway.app")
        or parsed.port not in (None, 443)
        or parsed.username or parsed.password
        or parsed.path or parsed.query or parsed.fragment
    ):
        fail("Informe somente o HTTPS do gateway Railway (*.up.railway.app), sem caminho, senha ou parâmetros.")
    return raw

def connector_config() -> Path:
    home = Path.home()
    exact = home / "Downloads" / "RealTalent-Garimpo-Conexao-991bf14" / "deploy" / "local-garimpo" / "garimpo.env"
    candidates = [exact] if exact.is_file() else list((home / "Downloads").glob("RealTalent-Garimpo-Conexao-*/deploy/local-garimpo/garimpo.env"))
    candidates = [p for p in candidates if p.is_file()]
    if not candidates:
        fail("Conector não encontrado em ~/Downloads/RealTalent-Garimpo-Conexao-*/deploy/local-garimpo/garimpo.env")
    if len(candidates) > 1:
        fail("Vários conectores encontrados. Preserve as pastas e selecione apenas a instalação ativa.")
    return candidates[0]

def request_json(base: str, key: str, path: str, payload: dict, timeout: int = 70) -> dict:
    req = urllib.request.Request(
        base + path, data=json.dumps(payload).encode("utf-8"), method="POST",
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            body = response.read(1024 * 1024)
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        fail(f"Railway respondeu HTTP {exc.code} no teste {path}; a configuração local foi preservada.")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        fail(f"Não foi possível acessar o gateway Railway ({type(exc).__name__}); configuração preservada.")

def run() -> None:
    config = connector_config()
    old = config.read_text(encoding="utf-8")
    if not re.search(r"(?m)^GARIMPO_CONNECTOR_TOKEN=[a-f0-9]{64}$", old):
        fail("O conector existente não possui token válido. Não foi modificado.")
    if not re.search(r"(?m)^PROSPECTING_AI_BASE_URL=http://127\.0\.0\.1:11434/v1$", old):
        fail("O Ollama local não foi identificado na configuração. Pare para revisar antes de migrar.")

    value = sys.argv[1] if len(sys.argv) == 2 else input("Endereço HTTPS do Firecrawl no Railway: ")
    base = gateway(value)
    print("Informe a chave FIRECRAWL_API_KEY do serviço Firecrawl no Railway.")
    print("Ela não será exibida nem enviada ao ChatGPT.")
    key = getpass.getpass("Chave privada: ").strip()
    if not re.fullmatch(r"[A-Za-z0-9_.-]{20,256}", key):
        fail("Chave inválida ou vazia. Nenhuma alteração feita.")

    print("Testando autorização e coleta remota...")
    scrape = request_json(base, key, "/v2/scrape", {"url": "https://example.com", "formats": ["markdown"]})
    if scrape.get("success") is not True:
        fail("O gateway respondeu, mas a coleta não funcionou. Conector local preservado.")
    print("Coleta autenticada: OK. Verificando pesquisa web...")
    search = request_json(base, key, "/v2/search", {"query": "barbearia Rio Grande RS", "limit": 1, "sources": ["web"]})
    if search.get("success") is not True or not isinstance((search.get("data") or {}).get("web"), list):
        fail("A busca /v2/search não está disponível. Não migrei a configuração.")
    print(f"Pesquisa web: OK ({len(search['data']['web'])} fonte(s) no teste).")

    additions = {"FIRECRAWL_API_URL": base, "FIRECRAWL_API_KEY": key}
    kept = [line for line in old.splitlines() if not any(line.startswith(k + "=") for k in additions)]
    updated = "\n".join(kept + [f"{k}={v}" for k, v in additions.items()]) + "\n"
    backups = Path.home() / "Downloads" / "Backups-Garimpo"
    backups.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(backups, 0o700)
    backup = backups / f"garimpo-antes-railway-{datetime.now():%Y%m%d-%H%M%S}.env"
    shutil.copy2(config, backup)
    os.chmod(backup, 0o600)
    fd, tmp_name = tempfile.mkstemp(prefix=".garimpo-env-", dir=config.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(updated)
        os.chmod(tmp_name, 0o600)
        os.replace(tmp_name, config)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
    print("\nConfiguração migrada com sucesso; credencial salva com acesso restrito.")
    print(f"Backup seguro: {backup}")
    print("Agora encerre o terminal do conector antigo (Ctrl+C), mantendo o Ollama ativo.")
    print("Inicie SOMENTE o conector com este comando (sem recompilar o Firecrawl local):")
    print(f"cd {config.parent} && node bridge.mjs garimpo.env")
    print("Somente após uma busca remota concluída você poderá parar os contêineres locais do Firecrawl.")

if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        fail("Operação cancelada. Configuração preservada.")
