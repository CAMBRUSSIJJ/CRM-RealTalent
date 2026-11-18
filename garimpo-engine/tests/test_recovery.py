import asyncio
import json
import unittest
from unittest.mock import patch

import httpx

from garimpo.api import create_app
from garimpo.engine import Engine
from garimpo.models import Candidate, SearchRequest, osm_phone
from garimpo.recovery import ContactRecovery
from support import GEOCODE, Harness, element, pinned


TOKEN = "test-recovery-token-with-more-than-32-characters"


def business_page(name="Barbearia Matheus", city="Rio Grande", street="Avenida Brasil, 123", **extra):
    data={"@type":"HairSalon","name":name,"telephone":"+55 53 99999-1001","email":"contato@barbeariamatheus.com.br",
          "address":{"addressLocality":city,"addressRegion":"RS","streetAddress":street},**extra}
    return '<script type="application/ld+json">'+json.dumps(data)+'</script>'


def seed(harness, *, count=1, **request_values):
    request=SearchRequest(segment="barbearias",city="Rio Grande",state="RS",require_phone=True,**request_values)
    items=[Candidate(provider_id=f"osm:node:{i}",company="Barbearia Matheus",city="Rio Grande",state="RS",address=f"Avenida Brasil, {123+i}",location_status="observed",category="shop=hairdresser") for i in range(count)]
    return harness.store.create(request,seed_candidates=[c.model_dump() for c in items])


def source(request):
    return httpx.Response(200,json={"web":{"results":[{"url":"https://barbeariamatheus.test/","title":"Barbearia Matheus"}]}})


def website_with(body):
    def website(request):
        if request.url.path=="/robots.txt":
            return httpx.Response(404)
        return httpx.Response(200,text=body,headers={"Content-Type":"text/html"})
    return website


class RecoveryTest(unittest.IsolatedAsyncioTestCase):
    async def test_missing_key_preserves_pending_and_export_stays_filtered(self):
        harness=Harness()
        try:
            original=seed(harness,require_email=True)
            result=await Engine(harness.http,harness.store).run_one(original["id"])
            self.assertEqual(result["status"],"completed")
            self.assertEqual(result["results"],[])
            self.assertEqual(len(result["pending"]),1)
            self.assertEqual(result["pending"][0]["engine"]["pendingReasons"],["missing_phone","missing_email"])
            self.assertEqual(result["pending"][0]["engine"]["recoveryStatus"],"provider_not_configured")
            self.assertIn("BRAVE_SEARCH_API_KEY"," ".join(result["warnings"]))
            self.assertEqual(len(harness.requests),0)
        finally:
            await harness.close()

    async def test_recovers_only_after_matching_identity_and_reuses_cache(self):
        harness=Harness(provider=source,website=website_with(business_page()),brave_key="SECRET")
        try:
            with patch("garimpo.network.public_target",side_effect=pinned):
                result=await Engine(harness.http,harness.store).run_one(seed(harness,require_email=True)["id"])
                calls=len(harness.requests)
                repeat=await Engine(harness.http,harness.store).run_one(seed(harness,require_email=True)["id"])
            self.assertEqual(result["status"],"completed")
            self.assertEqual(result["results"][0]["phone"],"53999991001")
            self.assertEqual(result["results"][0]["engine"]["recoveryStatus"],"matched")
            self.assertEqual(result["pending"],[])
            self.assertTrue(result["results"][0]["engine"]["websiteMatchReasons"])
            self.assertEqual(result["metrics"]["recovered_with_phone"],1)
            self.assertEqual(result["metrics"]["recovered_with_email"],1)
            self.assertEqual(result["metrics"]["recovery_queries"],1)
            self.assertEqual(len(harness.requests),calls)
            self.assertEqual(repeat["metrics"]["discovery_requests"],0)
            self.assertEqual(repeat["metrics"]["website_requests"],0)
        finally:
            await harness.close()

    async def test_wrong_business_city_or_branch_never_donates_contacts(self):
        for body in (business_page(name="Agência Matheus"),business_page(city="Pelotas"),business_page(street="Avenida Brasil, 999"),business_page(name="Barbearia Matheus",address={"addressLocality":"Rio Grande","addressRegion":"SP","streetAddress":"Avenida Brasil, 123"})):
            with self.subTest(body=body):
                harness=Harness(provider=source,website=website_with(body),brave_key="SECRET")
                try:
                    with patch("garimpo.network.public_target",side_effect=pinned):
                        result=await Engine(harness.http,harness.store).run_one(seed(harness)["id"])
                    self.assertEqual(result["results"],[])
                    self.assertEqual(result["pending"][0]["phone"],"")
                    self.assertEqual(result["pending"][0]["website"],"")
                    self.assertEqual(result["pending"][0]["engine"]["recoveryStatus"],"identity_unconfirmed")
                    self.assertFalse(any(e["field"] in {"phone","email"} for e in result["pending"][0]["engine"]["evidence"]))
                finally:
                    await harness.close()

    async def test_contact_page_can_corroborate_identity_after_unknown_homepage(self):
        def website(request):
            if request.url.path=="/robots.txt": return httpx.Response(404)
            body=business_page() if request.url.path=="/contato" else '<h1>Bem-vindo</h1><a href="/contato">Contato</a><a href="tel:51999998888">Telefone não atribuído</a>'
            return httpx.Response(200,text=body,headers={"Content-Type":"text/html"})
        harness=Harness(provider=source,website=website,brave_key="SECRET")
        try:
            with patch("garimpo.network.public_target",side_effect=pinned):
                result=await Engine(harness.http,harness.store).run_one(seed(harness)["id"])
            self.assertEqual(result["results"][0]["phone"],"53999991001")
        finally:
            await harness.close()

    async def test_plain_page_requires_name_city_and_address(self):
        body='<h1>Barbearia Matheus</h1><p>Avenida Brasil, 123, Rio Grande, RS</p><a href="tel:53999991001">Telefone</a>'
        harness=Harness(provider=source,website=website_with(body),brave_key="SECRET")
        try:
            with patch("garimpo.network.public_target",side_effect=pinned):
                result=await Engine(harness.http,harness.store).run_one(seed(harness)["id"])
            self.assertEqual(result["results"][0]["phone"],"53999991001")
        finally:
            await harness.close()

    async def test_number_in_street_name_does_not_match_another_house_number(self):
        harness=Harness(provider=source,website=website_with(business_page(street="Rua 25 de Julho, 999")),brave_key="SECRET")
        try:
            job=seed(harness)
            running=harness.store.claim("seed",job["id"])
            running["candidates"][0]["address"]="Rua 25 de Julho, 123"
            harness.store.save(running,"seed");harness.store.release(job["id"],"seed")
            with patch("garimpo.network.public_target",side_effect=pinned):
                result=await Engine(harness.http,harness.store).run_one(job["id"])
            self.assertEqual(result["results"],[])
            self.assertEqual(result["pending"][0]["engine"]["recoveryStatus"],"identity_unconfirmed")
        finally:
            await harness.close()

    async def test_budget_is_shared_between_concurrent_candidates(self):
        harness=Harness(provider=lambda r:httpx.Response(200,json={"web":{"results":[]}}),brave_key="SECRET",recovery_query_limit=1)
        try:
            result=await Engine(harness.http,harness.store).run_one(seed(harness,count=3)["id"])
            self.assertEqual(result["metrics"]["recovery_queries"],1)
            self.assertEqual(len(harness.requests),1)
            self.assertEqual(result["metrics"]["recovery_statuses"],{"no_site_found":1,"query_limit":2})
        finally:
            await harness.close()

    async def test_source_failure_preserves_pending_without_leaking_key(self):
        harness=Harness(provider=lambda r:httpx.Response(403),brave_key="VERY-SECRET-KEY")
        try:
            result=await Engine(harness.http,harness.store).run_one(seed(harness)["id"])
            self.assertEqual(result["status"],"completed")
            self.assertEqual(result["pending"][0]["engine"]["recoveryStatus"],"source_error")
            self.assertNotIn("VERY-SECRET-KEY",json.dumps(result))
        finally:
            await harness.close()

    async def test_directories_and_social_links_are_not_crawled_for_identity(self):
        payload={"web":{"results":[{"url":"https://instagram.com/matheus"},{"url":"https://cnpj.biz/123"}]}}
        harness=Harness(provider=lambda r:httpx.Response(200,json=payload),brave_key="SECRET")
        try:
            result=await Engine(harness.http,harness.store).run_one(seed(harness)["id"])
            self.assertEqual(result["metrics"]["website_requests"],0)
            self.assertEqual(result["pending"][0]["engine"]["recoveryStatus"],"no_site_found")
        finally:
            await harness.close()

    async def test_timeout_preserves_contact_only_after_identity_was_corroborated(self):
        harness=Harness(provider=source,brave_key="SECRET")
        try:
            engine=Engine(harness.http,harness.store)
            item=Candidate(provider_id="osm:node:1",company="Barbearia Matheus",city="Rio Grande",state="RS")
            async def stalled(probe, **kwargs):
                probe.website_matched=True
                probe.phone="+5553999991001"
                await asyncio.Event().wait()
            with patch.object(engine.collector,"collect",side_effect=stalled):
                with self.assertRaises(TimeoutError):
                    async with asyncio.timeout(0.03):
                        await engine.recovery.recover(item,{"remaining":1})
            self.assertEqual(item.phone,"+5553999991001")
        finally:
            await harness.close()

    async def test_pending_list_excludes_wrong_city_and_below_relevance(self):
        harness=Harness()
        try:
            request=SearchRequest(segment="barbearias",city="Rio Grande",state="RS",require_phone=True,minimum_relevance=60,enrich_websites=False)
            candidates=[Candidate(provider_id="a",company="Barbearia Matheus",city="Rio Grande",state="RS"),
                        Candidate(provider_id="b",company="Barbearia Outra",city="Pelotas",state="RS",location_status="observed"),
                        Candidate(provider_id="c",company="Salão de Beleza",city="Rio Grande",state="RS",category="shop=hairdresser")]
            job=harness.store.create(request,seed_candidates=[c.model_dump() for c in candidates])
            result=await Engine(harness.http,harness.store).run_one(job["id"])
            self.assertEqual([x["company"] for x in result["pending"]],["Barbearia Matheus"])
        finally:
            await harness.close()

    async def test_hybrid_keeps_web_results_when_osm_is_unavailable(self):
        def provider(request):
            if "nominatim" in request.url.host: return httpx.Response(403)
            return httpx.Response(200,json={"web":{"results":[{"url":"https://dentista.test/","title":"Dentista web"}],"more_results_available":False}})
        harness=Harness(provider=provider,brave_key="SECRET")
        try:
            result=await Engine(harness.http,harness.store).run_one(harness.store.create(SearchRequest(segment="dentista",city="Canoas",state="RS",provider="hybrid",limit=2,enrich_websites=False))["id"])
            self.assertEqual(result["status"],"completed")
            self.assertEqual(len(result["results"]),1)
            self.assertTrue(result["partial"])
            self.assertEqual(result["metrics"]["completion_reason"],"source_interrupted")
        finally:
            await harness.close()

    async def test_hybrid_adds_web_only_after_processing_osm_batch(self):
        def provider(request):
            if "nominatim" in request.url.host: return httpx.Response(200,json=GEOCODE)
            if "overpass" in request.url.host: return httpx.Response(200,json={"elements":[element(name="Dentista OSM",phone="51999991001")]})
            return httpx.Response(200,json={"web":{"results":[{"url":"https://dentista.test/","title":"Dentista web"}],"more_results_available":False}})
        harness=Harness(provider=provider,brave_key="SECRET")
        try:
            result=await Engine(harness.http,harness.store).run_one(harness.store.create(SearchRequest(segment="dentista",city="Canoas",state="RS",provider="hybrid",limit=2,enrich_websites=False))["id"])
            self.assertEqual(len(result["results"]),2)
            self.assertEqual(len(harness.requests),3)
        finally:
            await harness.close()

    def test_mobile_whatsapp_and_invalid_primary_phone_fall_back(self):
        for tags in ({"mobile":"53999991001"},{"contact:phone":"inválido","phone":"53999991001"},{"contact:whatsapp":"https://wa.me/5553999991001"}):
            self.assertEqual(osm_phone(tags),"+5553999991001")
        self.assertEqual(osm_phone({"whatsapp":"https://unrelated.test/5553999991001"}),"")


class RecoveryAPITest(unittest.IsolatedAsyncioTestCase):
    async def test_old_job_pending_export_and_seeded_recovery_are_private_and_idempotent(self):
        harness=Harness(api_token=TOKEN,provider=source,website=website_with(business_page()),brave_key="SECRET")
        try:
            original=seed(harness,enrich_websites=False)
            engine=Engine(harness.http,harness.store)
            parent=await engine.run_one(original["id"])
            app=create_app(harness.settings,http=harness.http)
            headers={"Authorization":"Bearer "+TOKEN,"Idempotency-Key":"recovery-test"}
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url="http://test",headers=headers) as client:
                path=f'/v1/searches/{parent["id"]}'
                self.assertEqual((await client.get(path+"/pending",headers={"Authorization":""})).status_code,401)
                pending=await client.get(path+"/pending")
                self.assertEqual(len(pending.json()),1)
                self.assertIn("garimpo-pendentes.json",pending.headers["Content-Disposition"])
                self.assertEqual((await client.get(path+"/export")).json(),[])
                child=(await client.post(path+"/recover")).json()
                replay=(await client.post(path+"/recover")).json()
                self.assertEqual(child["id"],replay["id"])
                self.assertEqual(child["parent_job_id"],parent["id"])
                self.assertTrue(harness.store.get(child["id"])["discovery_completed"])
                with patch("garimpo.network.public_target",side_effect=pinned):
                    result=await engine.run_one(child["id"])
                self.assertEqual(result["status"],"completed")
                self.assertEqual(result["results"][0]["phone"],"53999991001")
                self.assertFalse(any("nominatim" in r.url.host or "overpass" in r.url.host for r in harness.requests))
        finally:
            await harness.close()

    async def test_recovery_without_key_explains_configuration_and_creates_no_job(self):
        harness=Harness(api_token=TOKEN)
        try:
            parent=await Engine(harness.http,harness.store).run_one(seed(harness)["id"])
            app=create_app(harness.settings,http=harness.http)
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url="http://test",headers={"Authorization":"Bearer "+TOKEN}) as client:
                r=await client.post(f'/v1/searches/{parent["id"]}/recover')
                self.assertEqual(r.status_code,422)
                self.assertIn("BRAVE_SEARCH_API_KEY",r.json()["detail"])
        finally:
            await harness.close()
