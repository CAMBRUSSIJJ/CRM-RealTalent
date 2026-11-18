import json
import unittest
from unittest.mock import patch

import httpx

from garimpo.models import Candidate
from garimpo.models import SearchRequest
from garimpo.engine import Engine
from garimpo.qualification import Qualifier
from support import Harness


URL="https://barbearia.test/contato"
TEXT="Oferecemos corte masculino e barba. Agende seu horário pelo nosso site."


def candidate():
    return Candidate(provider_id="maps:1",company="Barbearia",phone="+5553999991001",documents=[{"url":URL,"text":TEXT}])


class QualificationTest(unittest.IsolatedAsyncioTestCase):
    async def test_job_timeout_during_optional_qualification_keeps_collected_phone(self):
        harness=Harness()
        try:
            item=candidate()
            request=SearchRequest(segment="barbearias",city="Rio Grande",state="RS",qualify=True,enrich_websites=False,require_phone=True)
            job=harness.store.create(request,seed_candidates=[item.model_dump()])
            engine=Engine(harness.http,harness.store)
            with patch.object(engine.qualifier,"qualify",side_effect=TimeoutError()):
                result=await engine.run_one(job["id"])
            self.assertEqual(len(result["results"]),1)
            self.assertEqual(result["results"][0]["phone"],"53999991001")
            self.assertTrue(result["partial"])
        finally:await harness.close()
    async def test_only_literal_evidence_is_accepted_and_contacts_never_change(self):
        signals=[{"kind":"services","value":"corte masculino","quote":"Oferecemos corte masculino e barba.","url":URL},
                 {"kind":"online_booking","value":"Agende","quote":"Agende seu horário pelo nosso site.","url":URL},
                 {"kind":"audience","value":"milionários","quote":"Atendemos somente milionários.","url":URL},
                 {"kind":"services","value":"massagem","quote":"Oferecemos corte masculino e barba.","url":URL}]
        def provider(request):
            self.assertEqual(request.url.host,"127.0.0.1")
            return httpx.Response(200,json={"message":{"content":json.dumps({"signals":signals})}})
        harness=Harness(ollama_url="http://127.0.0.1:11434",provider=provider)
        try:
            item=candidate();await Qualifier(harness.http).qualify(item)
            self.assertEqual(len(item.qualification["signals"]),2)
            self.assertEqual(item.qualification["buying_intent"],"unknown")
            self.assertEqual(item.phone,"+5553999991001")
            again=candidate();await Qualifier(harness.http).qualify(again)
            self.assertEqual(len(harness.requests),1)
            self.assertEqual(again.qualification,item.qualification)
        finally:await harness.close()

    async def test_unavailable_ollama_does_not_discard_contacts(self):
        harness=Harness(ollama_url="http://127.0.0.1:11434",provider=lambda r:httpx.Response(503))
        try:
            item=candidate();await Qualifier(harness.http).qualify(item)
            self.assertEqual(item.qualification["status"],"unavailable")
            self.assertEqual(item.phone,"+5553999991001")
        finally:await harness.close()

    async def test_unconfigured_and_empty_content_skip_all_llm_requests(self):
        harness=Harness()
        try:
            item=candidate();await Qualifier(harness.http).qualify(item)
            self.assertEqual(item.qualification["status"],"not_configured")
            self.assertEqual(harness.requests,[])
        finally:await harness.close()
