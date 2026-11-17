"""Conector Python nativo para a fila existente do RealTalent CRM.

Não precisa de Docker, Node, Ollama nem APIs comerciais. Usa a mesma
autorização por workspace do conector atual. Somente campos públicos
e validação humana: nenhuma mensagem é enviada automaticamente.
"""
from __future__ import annotations
import json
import os
import re
import signal
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from garimpo_engine import perform

stopping = False
def stop(*_):
    global stopping
    stopping = True


def read_env(filepath: Path) -> dict:
    if not filepath.is_file():
        raise ValueError("garimpo.env nao encontrado. Gere a conexao pelo CRM.")
    values = {}
    for row in filepath.read_text(encoding="utf-8").splitlines():
        if not row or row.lstrip().startswith("#") or "=" not in row:
            continue
        key, value = row.split("=", 1)
        if re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            values[key] = value.strip().strip('"').strip("'")
    return values


class Connector:
    def __init__(self, settings: dict):
        base = urllib.parse.urlsplit(settings.get("SUPABASE_URL", ""))
        if base.scheme != "https" or not base.hostname or base.path not in ("", "/") or base.query or base.fragment or base.username or base.password:
            raise ValueError("SUPABASE_URL invalida")
        token = settings.get("GARIMPO_CONNECTOR_TOKEN", "")
        workspace = settings.get("GARIMPO_WORKSPACE_ID", "")
        publishable = settings.get("SUPABASE_PUBLISHABLE_KEY", "")
        if not re.fullmatch(r"[a-f0-9]{64}", token):
            raise ValueError("Token do conector invalido")
        if not re.fullmatch(r"[a-f0-9-]{36}", workspace, flags=re.I):
            raise ValueError("Workspace invalido")
        if not publishable:
            raise ValueError("Chave publica do Supabase ausente")
        self.url = urllib.parse.urlunsplit((base.scheme, base.netloc, "/functions/v1/prospecting-local-connector-staged", "", ""))
        self.token, self.workspace, self.publishable = token, workspace, publishable

    def call(self, action: str, **payload):
        body = json.dumps({"organizationId": self.workspace, "action": action, **payload}, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(self.url, data=body, method="POST",
            headers={"content-type": "application/json", "accept": "application/json",
                     "apikey": self.publishable, "x-connector-token": self.token})
        with urllib.request.urlopen(req, timeout=24) as response:
            value = response.read(260_000)
        return json.loads(value)

    def run_job(self, job: dict):
        job_id, lease_id = job["id"], job["leaseId"]
        input_data = dict(job["input"])
        # Older Supabase Edge Functions strip unknown input fields. Keep
        # input mode compatible with the existing queue without changing DB schema.
        mode_marker = re.search(r"\\bGARIMPO_MODE_(ESSENTIAL|INTELLIGENT)\\b", input_data.get("query") or "")
        input_data["query"] = re.sub(r"\\bGARIMPO_MODE_(?:ESSENTIAL|INTELLIGENT)\\b", "", input_data.get("query") or "").strip()
        input_data["mode"] = "essential"
        if mode_marker and mode_marker.group(1) == "INTELLIGENT":
            print("IA opcional nao habilitada no motor Python: coleta factual preservada.")
        last = {"stage": "discover", "leadCount": 0, "sourceCount": 0}

        def progress(stage: str, count: int = 0):
            last.update({"stage": stage, "phaseStatus": "running" if stage != "completed" else "completed",
                         "leadCount": count, "sourceCount": count})
            ack = self.call("progress", jobId=job_id, leaseId=lease_id, **last)
            if not ack.get("accepted"):
                raise RuntimeError("lease_revoked")
        try:
            result = perform(input_data, progress=progress)
            answer = self.call("complete", jobId=job_id, leaseId=lease_id, result=result)
            return bool(answer.get("accepted"))
        except Exception as error:
            # No raw HTTP responses, private tokens or third-party page content in logs.
            print("Falha na pesquisa: " + type(error).__name__ + ".")
            try:
                self.call("complete", jobId=job_id, leaseId=lease_id, failed=True,
                          errorCode="local_research_failed")
            except Exception:
                print("Nao foi possivel informar a falha ao CRM.")
            return False

    def loop(self):
        self.call("verify")
        print("Garimpo Python conectado ao CRM. Pesquisas: OSM + Firecrawl opcional; sem IA.")
        last_heartbeat = 0.0
        while not stopping:
            try:
                if time.monotonic() - last_heartbeat >= 15:
                    self.call("heartbeat")
                    last_heartbeat = time.monotonic()
                response = self.call("poll")
                job = response.get("job")
                if job:
                    info = job.get("input") or {}
                    print("Pesquisa recebida: " + str(info.get("segment", ""))[:70] + " / " + str(info.get("city", ""))[:70])
                    success = self.run_job(job)
                    print("Concluida e entregue ao CRM." if success else "Pesquisa nao confirmada; confira a conexao.")
            except urllib.error.HTTPError as error:
                if error.code in (401, 403):
                    print("Conexao nao autorizada. Gere um novo comando no CRM e reinicie o worker.")
                    return 1
                print("Fila temporariamente indisponivel: HTTP " + str(error.code))
            except Exception as error:
                print("Falha de conexao: " + type(error).__name__ + ". Tentando novamente.")
            for _ in range(5):
                if stopping:
                    break
                time.sleep(1)
        return 0


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--self-test":
        from unittest import main as run_tests
        run_tests(module="test_garimpo_python", exit=False)
        return 0
    file = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("garimpo.env")
    try:
        config = read_env(file)
        worker = Connector(config)
    except (ValueError, OSError) as error:
        print("Configuracao invalida: " + str(error))
        return 1
    for name in (signal.SIGINT, signal.SIGTERM):
        signal.signal(name, stop)
    try:
        return worker.loop()
    except (urllib.error.HTTPError, urllib.error.URLError):
        print("Nao foi possivel verificar a fila. Confira internet e token do CRM.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
