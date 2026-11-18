import asyncio
from collections import Counter
from contextlib import aclosing, suppress
import logging
import time
from uuid import uuid4

from .extraction import WebsiteCollector
from .models import Candidate, SearchRequest, deduplicate, normalized, score
from .network import HTTP, SourceError
from .providers import discover, eligible_site
from .recovery import ContactRecovery
from .qualification import Qualifier
from .ranking import assess
from .store import LeaseLost, Store


logger = logging.getLogger("garimpo")
NETWORK_METRICS = ("discovery_requests", "website_requests", "provider_cache_hits", "website_cache_hits", "robots_cache_hits", "local_index_queries", "retries", "http_errors", "connection_errors", "recovery_queries", "maps_runs", "maps_cache_hits", "maps_partial", "maps_batches", "maps_duplicates", "maps_steps_reused", "qualification_requests", "qualification_cache_hits")


class Engine:
    def __init__(self, http: HTTP, store: Store):
        self.http, self.store = http, store
        self.collector = WebsiteCollector(http)
        self.recovery = ContactRecovery(http, self.collector)
        self.qualifier = Qualifier(http)
        self.attempts = {}
        self.recovery_budgets = {}

    def review(self, job: dict):
        request = SearchRequest.model_validate(job["request"])
        candidates = [Candidate.model_validate(candidate) for candidate in job["candidates"]]
        ready, pending, rejected = [], [], Counter()
        processed = [c for c in candidates if c.provider_id in job["done_ids"]]
        unique = deduplicate(processed)
        for item in unique:
            item.relevance_score, item.relevance_reasons = assess(item, request)
            reason = self.rejection_reason(item, request)
            if reason:
                rejected[reason] += 1
                # Contato ausente não torna uma empresa irrelevante. A lista
                # pendente só contém candidatos que passam pelos outros filtros.
                if reason in {"missing_phone", "missing_email"} and item.relevance_score >= request.minimum_relevance and (not request.require_observed_location or item.location_status == "observed"):
                    item.quality_score = score(item)
                    draft = item.capture_draft(request.segment)
                    draft["engine"].update(jobId=job["id"], pendingReasons=[key for key, missing in (("missing_phone", request.require_phone and not item.phone), ("missing_email", request.require_email and not item.email)) if missing])
                    pending.append(draft)
                continue
            item.quality_score = score(item)
            ready.append(item)
        ready.sort(key=lambda item: (-item.relevance_score, -item.quality_score, item.provider_rank, normalized(item.company)))
        job["results"] = [item.capture_draft(request.segment) for item in ready[:request.limit]]
        for result in job["results"]:
            result["engine"].update(jobId=job["id"], partialSearch=job.get("partial", False))
            result['engine']['collectionStatus']=('enriching' if job['status']=='running' else 'pending') if result['engine']['providerId'] in job.get('pending_enrichment_ids',[]) else 'complete'
        job["pending"] = sorted(pending, key=lambda item: (-item["engine"]["relevanceScore"], normalized(item["company"])))
        job["processed"] = len(set(job["done_ids"]))
        job["discovered"] = len(candidates)
        metrics = job.setdefault("metrics", {})
        metrics.update(eligible=len(ready), returned=len(job["results"]), rejected=dict(rejected),
                       merged_after_collection=len(processed) - len(unique), pending_contacts=len(pending),
                       processed_with_phone=sum(bool(c.phone) for c in unique),
                       processed_with_email=sum(bool(c.email) for c in unique),
                       without_website=sum(not c.website for c in unique),
                       recovered_with_phone=sum("phone" in c.recovered_fields for c in unique),
                       recovered_with_email=sum("email" in c.recovered_fields for c in unique),
                       recovery_statuses=dict(Counter(c.recovery_status for c in unique)))
        metrics["with_phone"] = sum(bool(item["phone"]) for item in job["results"])
        metrics["with_email"] = sum(bool(item["email"]) for item in job["results"])

    def checkpoint(self, job: dict, owner: str):
        if self.attempts.get(job["id"], ({},))[0].get("maps_partial"):
            job["partial"] = True
        self.review(job)
        metrics = job["metrics"]
        state=job.get('discovery_state',{}).get('maps',{})
        plan=state.get('plan',[])
        job['search_progress']={'queries_planned':len(plan),'queries_started':sum(step['status']!='queued' for step in plan),'queries_completed':sum(step['status']=='completed' for step in plan),
                                'areas_searched':len({step['coordinates'] for step in plan if step['status'] in {'completed','limit_reached'}}),
                                'current':next(({key:step[key] for key in ('term','label','status')} for step in plan if step['id']==state.get('current')),None),
                                'stop_reason':state.get('stop_reason')}
        if job["id"] in self.attempts:
            statistics, baseline, started = self.attempts[job["id"]]
            for metric in NETWORK_METRICS:
                metrics[metric] = baseline.get(metric, 0) + statistics[metric]
            metrics["duration_ms"] = baseline.get("duration_ms", 0) + int((time.monotonic() - started) * 1000)
            if job['results'] and 'first_result_ms' not in metrics:metrics['first_result_ms']=metrics['duration_ms']
        self.store.save(job, owner)

    @staticmethod
    def wrong_location(item: Candidate, request: SearchRequest):
        return ((item.location_status == "observed" and normalized(item.city) != normalized(request.city))
                or bool(item.state and item.state != request.state))

    @classmethod
    def rejection_reason(cls, item: Candidate, request: SearchRequest):
        if cls.wrong_location(item, request):
            return "wrong_location"
        if request.require_phone and not item.phone:
            return "missing_phone"
        if request.require_email and not item.email:
            return "missing_email"
        if request.require_observed_location and item.location_status != "observed":
            return "unobserved_location"
        if item.relevance_score < request.minimum_relevance:
            return "below_minimum_relevance"
        return ""

    async def heartbeat(self, job_id: str, owner: str, processing: asyncio.Task):
        while True:
            await asyncio.sleep(2)
            try:
                self.store.heartbeat(job_id, owner)
            except LeaseLost:
                processing.cancel()
                return

    async def execute(self, job: dict, owner: str):
        task = asyncio.current_task()
        heartbeat = asyncio.create_task(self.heartbeat(job["id"], owner, task))
        request = SearchRequest.model_validate(job["request"])
        statistics = Counter()
        token = self.http.statistics.set(statistics)
        discovery_token=self.http.discovery_context.set({'state':job.setdefault('discovery_state',{}),'job':job,'save':lambda:self.checkpoint(job,owner)})
        self.attempts[job["id"]] = (statistics, dict(job.get("metrics", {})), time.monotonic())
        self.recovery_budgets[job["id"]] = {"remaining": max(0, self.http.settings.recovery_query_limit - job.get("metrics", {}).get("recovery_queries", 0))}
        try:
            async with asyncio.timeout(self.http.settings.job_timeout):
                await self.process(job, request, owner)
            job.update(status="completed", phase="completed")
            if not job["results"]:
                job["warnings"].append("Nenhum resultado atendeu aos critérios. Isso não comprova ausência de empresas na região; a cobertura depende da fonte.")
            self.review(job)
            unavailable = job["metrics"]["recovery_statuses"].get("provider_not_configured", 0)
            if unavailable:
                job["warnings"].append(f"{unavailable} candidatos precisam de busca do site. Configure BRAVE_SEARCH_API_KEY no servidor para recuperar contatos; os candidatos foram preservados.")
            if request.provider == "hybrid" and not self.http.settings.brave_key:
                job["warnings"].append("A segunda fonte de descoberta não está configurada. Esta busca usou apenas OpenStreetMap.")
            self.checkpoint(job, owner)
        except TimeoutError:
            job.update(status="failed", phase="timeout", partial=True, error="A pesquisa atingiu o tempo máximo. Os resultados já coletados foram preservados.")
            job.setdefault("metrics", {})["completion_reason"] = "time_limit"
            with suppress(LeaseLost):
                self.checkpoint(job, owner)
        except SourceError as exc:
            job.update(status="failed", phase="failed", partial=True, error=str(exc))
            job.setdefault("metrics", {})["completion_reason"] = "source_error"
            with suppress(LeaseLost):
                self.checkpoint(job, owner)
        except LeaseLost:
            pass
        except asyncio.CancelledError:
            # Shutdown ou lease perdida: cancelamento persistido nunca é sobrescrito.
            self.store.release(job["id"], owner)
            raise
        except Exception as exc:
            # Sem traceback/resposta bruta: exceções de transporte podem conter credenciais.
            logger.error("Pesquisa %s interrompida (%s)", job["id"], type(exc).__name__)
            job.update(status="failed", phase="failed", partial=True, error="Falha interna ao processar a pesquisa. Os resultados anteriores foram preservados.")
            job.setdefault("metrics", {})["completion_reason"] = "internal_error"
            with suppress(LeaseLost):
                self.checkpoint(job, owner)
        finally:
            self.http.statistics.reset(token)
            self.http.discovery_context.reset(discovery_token)
            self.attempts.pop(job["id"], None)
            self.recovery_budgets.pop(job["id"], None)
            heartbeat.cancel()
            with suppress(asyncio.CancelledError):
                await heartbeat

    async def process(self, job: dict, request: SearchRequest, owner: str):
        # Primeiro aproveita checkpoints de uma execução anterior.
        await self.process_pending(job, request, owner)
        if len(job["results"]) >= request.limit:
            job["discovery_completed"] = True
            job.setdefault("metrics", {})["completion_reason"] = "limit_reached"
            return
        if not job["discovery_completed"]:
            job["phase"] = "discovery"
            self.checkpoint(job, owner)
            try:
                async with aclosing(discover(request, self.http)) as pages:
                    async for batch in pages:
                        previous = [Candidate.model_validate(c) for c in job["candidates"]]
                        if request.enrich_websites:
                            old={item.provider_id:item for item in previous}
                            pending=job.setdefault('pending_enrichment_ids',[])
                            for item in batch:
                                if item.provider_id in old and item.provider_id in job['done_ids'] and item.website and not old[item.provider_id].website and item.provider_id not in pending:pending.append(item.provider_id)
                        candidates = deduplicate(previous + batch)
                        metrics = job.setdefault("metrics", {})
                        metrics["source_pages"] = metrics.get("source_pages", 0) + 1
                        metrics["discovery_duplicates"] = metrics.get("discovery_duplicates", 0) + len(previous) + len(batch) - len(candidates)
                        job["candidates"] = [c.model_dump() for c in candidates]
                        self.checkpoint(job, owner)
                        # Não pede outra página paga antes de aproveitar esta.
                        await self.process_pending(job, request, owner)
                        if len(job["results"]) >= request.limit:
                            metrics["completion_reason"] = "limit_reached"
                            break
                        job["phase"] = "discovery"
            except SourceError as exc:
                if not job["candidates"]:
                    raise
                job["warnings"].append("Descoberta parcial: " + str(exc))
                job["partial"] = True
                job.setdefault("metrics", {})["completion_reason"] = "source_interrupted"
            job["discovery_completed"] = True
            self.checkpoint(job, owner)
        job.setdefault("metrics", {}).setdefault("completion_reason", "source_exhausted")

    async def process_pending(self, job: dict, request: SearchRequest, owner: str):
        job["phase"] = "collecting"
        self.checkpoint(job, owner)
        # Cria somente um pequeno grupo por vez, limitando tarefas e requisições.
        pending_enrichment=job.setdefault('pending_enrichment_ids',[])
        remaining = [Candidate.model_validate(c) for c in job["candidates"] if c["provider_id"] not in job["done_ids"] or c['provider_id'] in pending_enrichment]
        remaining.sort(key=lambda item: (-assess(item, request)[0], -score(item), item.provider_rank))
        for start in range(0, len(remaining), self.http.settings.concurrency):
            self.store.heartbeat(job["id"], owner)
            group = remaining[start:start + self.http.settings.concurrency]
            async def collect_and_save(item: Candidate):
                before = {field: bool(getattr(item, field)) for field in ("phone", "email")}
                item.relevance_score,item.relevance_reasons=assess(item,request)
                if request.enrich_websites and (item.phone or item.email) and item.provider_id.startswith(('maps:','osm:')) and not self.rejection_reason(item,request):
                    if item.provider_id not in pending_enrichment:pending_enrichment.append(item.provider_id)
                    if item.provider_id not in job['done_ids']:job['done_ids'].append(item.provider_id)
                    # Contatos já publicados pela fonte podem aparecer antes
                    # da consulta opcional ao site. A conferência fica pendente
                    # no checkpoint, para continuar corretamente na retomada.
                    self.checkpoint(job,owner)
                if request.enrich_websites and not self.wrong_location(item, request):
                    try:
                        async with asyncio.timeout(35):
                            if item.provider_id.startswith("maps:"):
                                item = await self.collector.collect(item,require_identity=True)
                            else:
                                item = await self.collector.collect(item)
                            needs_contact = not item.phone or (request.require_email and not item.email)
                            if needs_contact and (not item.website or not eligible_site(item.website)):
                                item = await self.recovery.recover(item, self.recovery_budgets[job["id"]])
                    except TimeoutError:
                        item.recovery_status = "timeout"
                        item.warnings.append("O site atingiu o tempo máximo de coleta; dados da fonte de descoberta preservados.")
                elif not request.enrich_websites:
                    item.recovery_status = "disabled"
                item.recovered_fields = list(dict.fromkeys(item.recovered_fields + [field for field, present in before.items() if not present and getattr(item, field)]))
                # Checkpoint imediatamente após cada empresa, inclusive em grupos concorrentes.
                job["candidates"] = [item.model_dump() if c["provider_id"] == item.provider_id else c for c in job["candidates"]]
                if item.provider_id not in job['done_ids']:job["done_ids"].append(item.provider_id)
                if item.provider_id in pending_enrichment:pending_enrichment.remove(item.provider_id)
                self.checkpoint(job, owner)
                if request.qualify and not self.wrong_location(item,request):
                    # Publica o contato antes da etapa opcional. Timeout do
                    # modelo ou cancelamento nunca apaga dados já coletados.
                    await self.qualifier.qualify(item)
                    job["candidates"] = [item.model_dump() if c["provider_id"] == item.provider_id else c for c in job["candidates"]]
                    self.checkpoint(job,owner)
            try:
                async with asyncio.TaskGroup() as tasks:
                    for item in group:
                        tasks.create_task(collect_and_save(item))
            except* LeaseLost:
                # O TaskGroup agrupa exceções; cancelamento continua sendo esperado.
                raise LeaseLost() from None
            # Não gasta chamadas além da quantidade solicitada de resultados úteis.
            if len(job["results"]) >= request.limit:
                break

    async def run_one(self, job_id: str):
        owner = str(uuid4())
        job = self.store.claim(owner, job_id)
        if job:
            await self.execute_isolated(job, owner)
        return self.store.get(job_id)

    async def execute_isolated(self, job: dict, owner: str):
        # O heartbeat pode cancelar a tarefa de uma pesquisa. O worker que
        # atende a fila continua vivo para processar as pesquisas seguintes.
        try:
            await asyncio.create_task(self.execute(job, owner))
        except asyncio.CancelledError:
            if asyncio.current_task().cancelling():
                raise

    async def worker(self):
        owner = str(uuid4())
        while True:
            job = self.store.claim(owner)
            if job is None:
                await asyncio.sleep(0.5)
                continue
            await self.execute_isolated(job, owner)
