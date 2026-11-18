"""Fila e checkpoints duráveis. Uma instância/volume SQLite, sem Redis obrigatório."""
import hashlib
from contextlib import contextmanager
import json
from pathlib import Path
import sqlite3
import time
from uuid import uuid4

from .models import SearchRequest, now


class QueueFull(Exception):
    pass


class IdempotencyConflict(Exception):
    pass


class LeaseLost(Exception):
    pass


class Store:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.execute("pragma journal_mode=WAL")
            conn.executescript("""
                create table if not exists jobs (
                    id text primary key, request_hash text not null,
                    idempotency_key text unique, status text not null,
                    owner text, lease_until real, attempts integer not null default 0,
                    created_at real not null, document text not null
                );
                create index if not exists jobs_queue on jobs(status, created_at);
                create table if not exists cache (
                    key text primary key, expires_at real not null, value text not null
                );
            """)

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(self.path, timeout=5)
        try:
            conn.row_factory = sqlite3.Row
            conn.execute("pragma busy_timeout=5000")
            with conn:
                yield conn
        finally:
            conn.close()

    def create(self, request: SearchRequest, *, idempotency_key: str | None = None, queue_limit: int = 20,
               seed_candidates: list[dict] | None = None, parent_job_id: str | None = None,
               seed_checkpoint: dict | None = None) -> dict:
        payload = request.model_dump()
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        with self.connect() as conn:
            conn.execute("begin immediate")
            if idempotency_key:
                row = conn.execute("select * from jobs where idempotency_key=?", (idempotency_key,)).fetchone()
                if row:
                    previous = json.loads(row["document"])
                    if row["request_hash"] != digest:
                        # Campos opcionais novos recebem seus padrões em trabalhos
                        # antigos; o mesmo pedido continua idempotente após upgrade.
                        if SearchRequest.model_validate(previous["request"]).model_dump() != payload:
                            raise IdempotencyConflict("A chave de idempotência já foi usada em outra pesquisa.")
                        conn.execute("update jobs set request_hash=? where id=?", (digest, row["id"]))
                    return previous
            count = conn.execute("select count(*) from jobs where status in ('queued','running')").fetchone()[0]
            if count >= queue_limit:
                raise QueueFull("Fila de pesquisas cheia. Aguarde uma busca terminar.")
            job = {"id": str(uuid4()), "status": "queued", "phase": "queued", "request": payload,
                   "created_at": now(), "updated_at": now(), "warnings": [], "error": None, "partial": False,
                   "processed": 0, "discovered": 0, "results": [], "candidates": [],
                   "done_ids": [], "discovery_completed": False}
            if seed_candidates is not None:
                job.update(candidates=seed_candidates, discovery_completed=True, parent_job_id=parent_job_id)
            if seed_checkpoint is not None:
                for field in ('candidates','done_ids','pending_enrichment_ids','discovery_state'):
                    job[field]=json.loads(json.dumps(seed_checkpoint.get(field,{} if field=='discovery_state' else [])))
                job.update(parent_job_id=parent_job_id,discovery_completed=False)
            conn.execute("insert into jobs(id,request_hash,idempotency_key,status,created_at,document) values(?,?,?,?,?,?)",
                         (job["id"], digest, idempotency_key, "queued", time.time(), json.dumps(job)))
            return job

    def get(self, job_id: str) -> dict | None:
        with self.connect() as conn:
            row = conn.execute("select document from jobs where id=?", (job_id,)).fetchone()
            return json.loads(row[0]) if row else None

    def claim(self, owner: str, job_id: str | None = None) -> dict | None:
        with self.connect() as conn:
            conn.execute("begin immediate")
            for row in conn.execute("select * from jobs where status='running' and lease_until<?", (time.time(),)).fetchall():
                document = json.loads(row["document"])
                document["status"] = "failed" if row["attempts"] >= 3 else "queued"
                document["updated_at"] = now()
                if document["status"] == "failed":
                    document["error"] = "A pesquisa foi interrompida repetidamente. Os resultados anteriores foram preservados."
                    document["partial"] = True
                    for result in document["results"]:
                        if isinstance(result.get("engine"), dict):
                            result["engine"]["partialSearch"] = True
                conn.execute("update jobs set status=?, owner=null, lease_until=null, document=? where id=?",
                             (document["status"], json.dumps(document), row["id"]))
            sql = "select * from jobs where status='queued'" + (" and id=?" if job_id else "") + " order by created_at limit 1"
            row = conn.execute(sql, (job_id,) if job_id else ()).fetchone()
            if not row:
                return None
            document = json.loads(row["document"])
            document.update(status="running", updated_at=now())
            conn.execute("update jobs set status='running',owner=?,lease_until=?,attempts=attempts+1,document=? where id=?",
                         (owner, time.time() + 45, json.dumps(document), row["id"]))
            return document

    def save(self, document: dict, owner: str):
        document["updated_at"] = now()
        with self.connect() as conn:
            updated = conn.execute("update jobs set status=?,document=?,lease_until=? where id=? and owner=? and status='running'",
                                   (document["status"], json.dumps(document), time.time() + 45, document["id"], owner)).rowcount
            if not updated:
                raise LeaseLost("A pesquisa foi cancelada ou assumida por outro processo.")

    def heartbeat(self, job_id: str, owner: str):
        with self.connect() as conn:
            updated = conn.execute("update jobs set lease_until=? where id=? and owner=? and status='running'",
                                   (time.time() + 45, job_id, owner)).rowcount
            if not updated:
                raise LeaseLost()

    def cancel(self, job_id: str) -> dict | None:
        with self.connect() as conn:
            conn.execute("begin immediate")
            row = conn.execute("select document,status from jobs where id=?", (job_id,)).fetchone()
            if not row:
                return None
            document = json.loads(row["document"])
            if row["status"] in {"queued", "running"}:
                document.update(status="cancelled", phase="cancelled", updated_at=now(), partial=True)
                document.setdefault("metrics", {})["completion_reason"] = "cancelled"
                for result in document["results"]:
                    if isinstance(result.get("engine"), dict):
                        result["engine"]["partialSearch"] = True
                        if result['engine'].get('collectionStatus')=='enriching':result['engine']['collectionStatus']='pending'
                conn.execute("update jobs set status='cancelled',owner=null,lease_until=null,document=? where id=?", (json.dumps(document), job_id))
            return document

    def release(self, job_id: str, owner: str):
        with self.connect() as conn:
            conn.execute("begin immediate")
            row = conn.execute("select document from jobs where id=? and owner=? and status='running'", (job_id, owner)).fetchone()
            if row:
                document = json.loads(row[0])
                document.update(status="queued", updated_at=now())
                conn.execute("update jobs set status='queued',owner=null,lease_until=null,document=? where id=?", (json.dumps(document), job_id))

    def cache_get(self, key: str):
        with self.connect() as conn:
            row = conn.execute("select value from cache where key=? and expires_at>?", (key, time.time())).fetchone()
            return json.loads(row[0]) if row else None

    def cache_put(self, key: str, value, ttl: int):
        if ttl <= 0:
            return
        with self.connect() as conn:
            conn.execute("delete from cache where expires_at<=?", (time.time(),))
            conn.execute("insert or replace into cache values(?,?,?)", (key, time.time() + ttl, json.dumps(value)))
            conn.execute("delete from cache where key in (select key from cache order by expires_at desc limit -1 offset 2000)")


def public_job(document: dict) -> dict:
    result={key: value for key, value in document.items() if key not in {"candidates", "done_ids", "discovery_completed","discovery_state","pending_enrichment_ids"}}
    result['can_resume']=document['status'] in {'failed','cancelled'} or (document['status']=='completed' and document.get('partial',False) and len(document.get('results',[]))<document['request']['limit'])
    if document['status'] in {'completed','failed','cancelled'} and 'search_progress' in result:
        result['search_progress']={**result['search_progress'],'current':None}
    return result
