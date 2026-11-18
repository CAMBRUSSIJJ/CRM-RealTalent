import asyncio
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import httpx

from garimpo.engine import Engine
from garimpo.models import Candidate, SearchRequest
from garimpo.network import SourceError
from support import GEOCODE, Harness, element, pinned


class EngineTest(unittest.IsolatedAsyncioTestCase):
    async def test_brave_stops_pagination_once_first_page_produces_enough_results(self):
        def provider(request):
            self.assertEqual(request.url.params["offset"], "0", "Não deveria pedir outra página antes de aproveitar a primeira")
            return httpx.Response(200, json={"web": {"results": [{"url": f"https://clinica{i}.test/", "title": f"Dentista {i}"} for i in range(20)], "more_results_available": True}})
        harness = Harness(provider=provider, brave_key="SECRET")
        try:
            request = SearchRequest(segment="dentistas", city="Canoas", state="RS", limit=10, enrich_websites=False)
            result = await Engine(harness.http, harness.store).run_one(harness.store.create(request)["id"])
            self.assertEqual(result["status"], "completed")
            self.assertEqual(len(result["results"]), 10)
            self.assertEqual(len(harness.requests), 1)
            self.assertEqual(result["metrics"]["completion_reason"], "limit_reached")
            self.assertEqual(result["metrics"]["discovery_requests"], 1)
        finally:
            await harness.close()

    async def test_empty_contact_page_is_exhausted_before_requesting_more_results(self):
        fetched = []
        def provider(request):
            offset = int(request.url.params["offset"])
            fetched.append(offset)
            return httpx.Response(200, json={"web": {"results": [{"url": f"https://clinica{offset}.test/", "title": f"Dentista {offset}"}], "more_results_available": offset == 0}})
        harness = Harness(provider=provider, brave_key="SECRET")
        try:
            request = SearchRequest(segment="dentista", city="Canoas", state="RS", limit=10, require_phone=True)
            engine = Engine(harness.http, harness.store)
            async def collect(item):
                self.assertEqual(len(fetched), 1 if item.provider_id.endswith("clinica0.test/") else 2)
                if "clinica1" in item.provider_id:
                    item.phone = "+5551999991001"
                return item
            with patch.object(engine.collector, "collect", side_effect=collect):
                result = await engine.run_one(harness.store.create(request)["id"])
            self.assertEqual(fetched, [0, 1])
            self.assertEqual(len(result["results"]), 1)
            self.assertEqual(result["metrics"]["rejected"], {"missing_phone": 1})
            self.assertEqual(result["metrics"]["completion_reason"], "source_exhausted")
        finally:
            await harness.close()

    async def test_minimum_relevance_filters_and_reports_reason(self):
        harness = Harness()
        try:
            request = SearchRequest(segment="dentistas", city="Canoas", state="RS", minimum_relevance=50, enrich_websites=False)
            original = harness.store.create(request)
            seed = harness.store.claim("seed")
            items = [Candidate(provider_id="a", company="Oficina", phone="+5551999991001"), Candidate(provider_id="b", company="Dentista", city="Canoas", location_status="observed")]
            seed.update(discovery_completed=True, candidates=[c.model_dump() for c in items])
            harness.store.save(seed, "seed")
            harness.store.release(seed["id"], "seed")
            result = await Engine(harness.http, harness.store).run_one(original["id"])
            self.assertEqual([item["company"] for item in result["results"]], ["Dentista"])
            self.assertEqual(result["metrics"]["rejected"], {"below_minimum_relevance": 1})
            self.assertGreaterEqual(result["results"][0]["engine"]["relevanceScore"], 50)
        finally:
            await harness.close()

    async def test_known_wrong_location_is_discarded_without_visiting_site(self):
        harness = Harness()
        try:
            request = SearchRequest(segment="dentista", city="Canoas", state="RS")
            original = harness.store.create(request)
            seed = harness.store.claim("seed")
            wrong = Candidate(provider_id="a", company="Dentista", city="Esteio", location_status="observed", website="https://empresa.test/")
            seed.update(discovery_completed=True, candidates=[wrong.model_dump()])
            harness.store.save(seed, "seed")
            harness.store.release(seed["id"], "seed")
            result = await Engine(harness.http, harness.store).run_one(original["id"])
            self.assertEqual(len(harness.requests), 0)
            self.assertEqual(result["metrics"]["rejected"], {"wrong_location": 1})
        finally:
            await harness.close()

    async def test_full_discovery_website_contact_export_and_rerun_cache(self):
        def website(request):
            if request.url.path == "/robots.txt":
                return httpx.Response(404)
            body = '<a href="mailto:comercial@empresa.com.br">Email</a>' if request.url.path == "/contato" else '<a href="/contato">Contato</a><a href="tel:51999991001">Telefone</a>'
            return httpx.Response(200, text=body, headers={"Content-Type": "text/html"})
        harness = Harness(website=website)
        try:
            engine = Engine(harness.http, harness.store)
            request = SearchRequest(segment="dentista", city="Canoas", state="RS", require_phone=True, require_email=True)
            with patch("garimpo.network.public_target", side_effect=pinned):
                job = await engine.run_one(harness.store.create(request)["id"])
                calls = len(harness.requests)
                repeat = await engine.run_one(harness.store.create(request)["id"])
            self.assertEqual(job["status"], "completed")
            self.assertEqual(len(job["results"]), 1)
            self.assertEqual(job["results"][0]["phone"], "51999991001")
            self.assertEqual(job["results"][0]["email"], "comercial@empresa.com.br")
            self.assertGreater(len(job["results"][0]["engine"]["evidence"]), 2)
            self.assertEqual(len(harness.requests), calls)
            self.assertEqual(len(repeat["results"]), 1)
            self.assertEqual(job["results"][0]["engine"]["evidence"], repeat["results"][0]["engine"]["evidence"])
            self.assertEqual(job["metrics"]["discovery_requests"], 2)
            self.assertEqual(repeat["metrics"]["discovery_requests"], 0)
            self.assertEqual(repeat["metrics"]["provider_cache_hits"], 2)
            self.assertEqual(repeat["metrics"]["website_requests"], 0)
            self.assertGreater(repeat["metrics"]["website_cache_hits"], 0)
            # Contrato de exportação compartilhado com o teste TypeScript do importador.
            fixture = json.loads((Path(__file__).parent / "fixtures/export.json").read_text())
            self.assertEqual(set(fixture[0]), set(job["results"][0]))
        finally:
            await harness.close()

    async def test_restart_reuses_completed_candidates_and_processes_only_pending(self):
        harness = Harness()
        try:
            request = SearchRequest(segment="dentista", city="Canoas", state="RS", enrich_websites=False)
            original = harness.store.create(request)
            job = harness.store.claim("crashed")
            first = Candidate(provider_id="osm:1", company="Primeira", phone="+5551999991001")
            second = Candidate(provider_id="osm:2", company="Segunda", phone="+5551999991002")
            job.update(discovery_completed=True, candidates=[first.model_dump(), second.model_dump()], done_ids=[first.provider_id])
            harness.store.save(job, "crashed")
            with harness.store.connect() as conn:
                conn.execute("update jobs set lease_until=0")
            restored = await Engine(harness.http, harness.store).run_one(original["id"])
            self.assertEqual(restored["status"], "completed")
            self.assertEqual(restored["processed"], 2)
            self.assertEqual(len(restored["results"]), 2)
            self.assertEqual(len(harness.requests), 0)
        finally:
            await harness.close()

    async def test_partial_discovery_failure_preserves_earlier_page(self):
        async def failing_discovery(request, http):
            yield [Candidate(provider_id="brave:1", company="Preservada")]
            raise SourceError("Fonte temporariamente indisponível")
        harness = Harness()
        try:
            request = SearchRequest(segment="dentista", city="Canoas", state="RS", enrich_websites=False)
            with patch("garimpo.engine.discover", side_effect=failing_discovery):
                result = await Engine(harness.http, harness.store).run_one(harness.store.create(request)["id"])
            self.assertEqual(result["status"], "completed")
            self.assertEqual(len(result["results"]), 1)
            self.assertIn("Descoberta parcial", result["warnings"][0])
            self.assertTrue(result["partial"])
            self.assertTrue(result["results"][0]["engine"]["partialSearch"])
        finally:
            await harness.close()

    async def test_require_contact_filters_without_inventing_it(self):
        harness = Harness(provider=lambda request: httpx.Response(200, json=GEOCODE if "nominatim" in request.url.host else {"elements": [element()]}))
        try:
            request = SearchRequest(segment="dentista", city="Canoas", state="RS", require_email=True)
            result = await Engine(harness.http, harness.store).run_one(harness.store.create(request)["id"])
            self.assertEqual(result["results"], [])
            self.assertEqual(result["status"], "completed")
            self.assertTrue(result["warnings"])
        finally:
            await harness.close()

    async def test_verified_different_city_is_filtered_and_unknown_city_can_be_required(self):
        harness = Harness()
        try:
            for observed_only in (False, True):
                request = SearchRequest(segment="dentista", city="Canoas", state="RS", require_observed_location=observed_only, enrich_websites=False)
                original = harness.store.create(request)
                job = harness.store.claim("seed", original["id"])
                candidates = [Candidate(provider_id="osm:1", company="Outra cidade", city="Esteio", location_status="observed"),
                              Candidate(provider_id="osm:3", company="Outra UF", city="Canoas", state="SP", location_status="observed"),
                              Candidate(provider_id="brave:2", company="Ainda não confirmado", city="Canoas")]
                job.update(candidates=[c.model_dump() for c in candidates], discovery_completed=True)
                harness.store.save(job, "seed")
                harness.store.release(job["id"], "seed")
                result = await Engine(harness.http, harness.store).run_one(job["id"])
                self.assertEqual(len(result["results"]), 0 if observed_only else 1)
        finally:
            await harness.close()

    async def test_cancel_during_collection_preserves_results_and_never_resurrects(self):
        harness = Harness(concurrency=1)
        started = asyncio.Event()
        gate = asyncio.Event()
        try:
            request = SearchRequest(segment="dentista", city="Canoas", state="RS")
            original = harness.store.create(request)
            job = harness.store.claim("seed")
            candidates = [Candidate(provider_id="osm:1", company="Primeira"), Candidate(provider_id="osm:2", company="Segunda")]
            job.update(candidates=[c.model_dump() for c in candidates], discovery_completed=True)
            harness.store.save(job, "seed")
            harness.store.release(job["id"], "seed")
            engine = Engine(harness.http, harness.store)
            async def collector(item):
                if item.provider_id == "osm:2":
                    started.set()
                    await gate.wait()
                return item
            with patch.object(engine.collector, "collect", side_effect=collector):
                worker = asyncio.create_task(engine.run_one(original["id"]))
                await asyncio.wait_for(started.wait(), 2)
                cancelled = harness.store.cancel(original["id"])
                self.assertEqual(len(cancelled["results"]), 1)
                gate.set()
                await worker
            result = harness.store.get(original["id"])
            self.assertEqual(result["status"], "cancelled")
            self.assertEqual(len(result["results"]), 1)
            self.assertTrue(result["results"][0]["engine"]["partialSearch"])
        finally:
            gate.set()
            await harness.close()

    async def test_concurrency_is_bounded_and_stops_when_enough_useful_results_exist(self):
        harness = Harness(concurrency=3)
        peak, active, calls = 0, 0, 0
        try:
            engine = Engine(harness.http, harness.store)
            request = SearchRequest(segment="dentista", city="Canoas", state="RS", limit=5)
            original = harness.store.create(request)
            job = harness.store.claim("seed")
            job.update(discovery_completed=True, candidates=[Candidate(provider_id=f"osm:{i}", company=f"Empresa {i}").model_dump() for i in range(30)])
            harness.store.save(job, "seed")
            harness.store.release(job["id"], "seed")
            async def collect(item):
                nonlocal peak, active, calls
                active += 1
                calls += 1
                peak = max(peak, active)
                await asyncio.sleep(0.01)
                active -= 1
                return item
            with patch.object(engine.collector, "collect", side_effect=collect):
                result = await engine.run_one(original["id"])
            self.assertEqual(result["status"], "completed")
            self.assertEqual(len(result["results"]), 5)
            self.assertEqual(peak, 3)
            self.assertEqual(calls, 6)
        finally:
            await harness.close()

    async def test_website_timeout_preserves_contact_already_extracted(self):
        harness = Harness()
        try:
            engine = Engine(harness.http, harness.store)
            request = SearchRequest(segment="dentista", city="Canoas", state="RS")
            async def interrupted(item):
                item.observe("email", "comercial@empresa.com.br", "https://empresa.test/", "site")
                raise TimeoutError()
            with patch.object(engine.collector, "collect", side_effect=interrupted):
                result = await engine.run_one(harness.store.create(request)["id"])
            self.assertEqual(result["status"], "completed")
            self.assertEqual(result["results"][0]["email"], "comercial@empresa.com.br")
            self.assertTrue(result["results"][0]["engine"]["warnings"])
        finally:
            await harness.close()

    async def test_job_timeout_preserves_finished_company(self):
        harness = Harness()
        try:
            request = SearchRequest(segment="dentista", city="Canoas", state="RS")
            job = harness.store.create(request)
            running = harness.store.claim("seed")
            first = Candidate(provider_id="osm:1", company="Preservada")
            running.update(discovery_completed=True, candidates=[first.model_dump()], done_ids=[first.provider_id])
            harness.store.save(running, "seed")
            harness.store.release(job["id"], "seed")
            engine = Engine(harness.http, harness.store)
            with patch.object(engine, "process", side_effect=TimeoutError()):
                result = await engine.run_one(job["id"])
            self.assertEqual(result["status"], "failed")
            self.assertTrue(result["partial"])
            self.assertEqual(len(result["results"]), 1)
        finally:
            await harness.close()

    async def test_cancel_via_heartbeat_keeps_worker_alive_for_next_search(self):
        harness = Harness()
        started = asyncio.Event()
        worker = None
        try:
            engine = Engine(harness.http, harness.store)
            first = harness.store.create(SearchRequest(segment="dentista", city="Canoas", state="RS"))
            async def heartbeat(job_id, owner, task):
                while harness.store.get(job_id)["status"] != "cancelled":
                    await asyncio.sleep(0.005)
                task.cancel()
            async def stalled(item):
                started.set()
                await asyncio.Event().wait()
            with patch.object(engine, "heartbeat", side_effect=heartbeat), patch.object(engine.collector, "collect", side_effect=stalled):
                worker = asyncio.create_task(engine.worker())
                await asyncio.wait_for(started.wait(), 2)
                harness.store.cancel(first["id"])
                second = harness.store.create(SearchRequest(segment="dentista", city="Canoas", state="RS", enrich_websites=False))
                for _ in range(100):
                    if harness.store.get(second["id"])["status"] == "completed":
                        break
                    await asyncio.sleep(0.01)
                self.assertFalse(worker.done())
                self.assertEqual(harness.store.get(first["id"])["status"], "cancelled")
                self.assertEqual(harness.store.get(second["id"])["status"], "completed")
        finally:
            if worker:
                worker.cancel()
                try:
                    await worker
                except asyncio.CancelledError:
                    pass
            await harness.close()
