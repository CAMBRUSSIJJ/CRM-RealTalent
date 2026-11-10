#!/usr/bin/env python3
"""Offline end-to-end smoke test using the same installed Python as the worker."""
import json
import os
from pathlib import Path
import subprocess
import sys

worker = Path(__file__).with_name("worker.py")
fact = "A Escola Horizonte publicou um novo calendário de atividades educacionais para a comunidade."
html = ("<html><head><title>Escola Horizonte</title></head><body>"
        "<h1>Escola Horizonte</h1><article>" +
        "".join("<p>" + fact + " A informação foi divulgada pela própria instituição.</p>"
                for _ in range(6)) +
        "</article></body></html>")
env = dict(os.environ)
env["REALTALENT_GARIMPO_SCRAPEGRAPH"] = "0"
try:
    result = subprocess.run([sys.executable, str(worker)], input=json.dumps({"html": html}),
                            text=True, capture_output=True, env=env, timeout=90, check=True)
    parsed = json.loads(result.stdout)
    if parsed.get("ok") is not True or parsed.get("engine") != "crawl4ai" or \
       "Escola Horizonte" not in parsed.get("text", ""):
        raise RuntimeError("Crawl4AI não devolveu texto utilizável")
    print("✓ Crawl4AI processou HTML local sem acesso a sites externos.")
except Exception as exc:
    print("Falha no smoke test offline:", str(exc), file=sys.stderr)
    if "result" in locals():
        print(result.stderr[-1000:], file=sys.stderr)
    sys.exit(1)
