"""Deterministic offline regression tests: no external HTTP or personal data."""
import json
import unittest
from unittest.mock import patch
from garimpo_engine import perform, http_json
from garimpo_connector import Connector

OSM_ELEMENTS = {
    "elements": [
        {"type": "node", "id": 101, "lat": -32.03, "lon": -52.10,
         "tags": {"name": "Barbearia Atlântico", "shop": "hairdresser",
                  "contact:phone": "(53) 99123-4567", "addr:city": "Rio Grande",
                  "website": "https://barbearia-atlantico.com.br/"}},
        {"type": "node", "id": 102, "lat": -32.03, "lon": -52.11,
         "tags": {"name": "Salão Bella", "shop": "hairdresser", "addr:city": "Rio Grande"}},
        {"type": "node", "id": 103, "lat": -32.03, "lon": -52.12,
         "tags": {"name": "Barber Sul", "shop": "hairdresser", "addr:city": "Pelotas"}},
        {"type": "node", "id": 104, "lat": -32.03, "lon": -52.13,
         "tags": {"name": "Barbearia Beira-Mar", "shop": "hairdresser", "addr:city": "Rio Grande"}},
    ],
}
GEO = [{"lat": "-32.03", "lon": "-52.10",
        "display_name": "Rio Grande, Região Sul, Rio Grande do Sul, Brasil"}]
INPUT = {"segment": "Barbearia", "city": "Rio Grande, RS", "limit": 5}


class EngineTest(unittest.TestCase):
    def setUp(self):
        self.requests = []

    def get(self, url, timeout=13):
        self.requests.append(("GET", url))
        return GEO

    def post(self, url, data=None, timeout=13):
        self.requests.append(("POST", url, data))
        if "overpass" in url:
            return OSM_ELEMENTS
        if "/v2/search" in url:
            return {"success": True, "data": {"web": [
                {"url": "https://barbearia-marina.com.br/", "title": "Barbearia Marina | Rio Grande, RS",
                 "description": "Barbearia Marina em Rio Grande, RS."},
                {"url": "https://guia.com.br/rio-grande", "title": "10 melhores barbearias em Rio Grande",
                 "description": "Lista de barbearias em Rio Grande, RS."}]}}
        raise ValueError("unmocked_url")

    def test_osm_exact_category_city_and_web_fallback(self):
        results = perform(INPUT, get=self.get, post=self.post)
        self.assertEqual(results["researchMode"], "essential")
        self.assertEqual(results["extractionEngine"], "python")
        self.assertEqual([x["company"] for x in results["leads"]],
                         ["Barbearia Atlântico", "Barbearia Beira-Mar", "Barbearia Marina"])
        self.assertTrue(all(item["aiResearch"]["sources"] for item in results["leads"]))
        self.assertEqual(results["leads"][0]["phone"], "(53) 99123-4567")
        self.assertEqual(results["leads"][0]["aiResearch"]["sources"][0]["url"],
                         "https://www.openstreetmap.org/node/101")
        self.assertFalse(any("Bella" in item["company"] or item["city"] == "Pelotas"
                             for item in results["leads"]))
        overpass = next(x for x in self.requests if "overpass" in x[1])
        self.assertIn("around:15000", overpass[2]["data"])

    def test_no_osm_does_not_prevent_web(self):
        def bad_get(url, timeout=13):
            raise TimeoutError("OSM offline")
        results = perform(INPUT, get=bad_get, post=self.post)
        self.assertEqual([x["company"] for x in results["leads"]], ["Barbearia Marina"])
        self.assertTrue(any("OSM indisponível" in warning for warning in results["warnings"]))

    def test_no_sources_returns_transparent_zero_not_fabricated_companies(self):
        def no_sources(url, data=None, timeout=13):
            raise TimeoutError("offline")
        result = perform(INPUT, get=self.get, post=no_sources)
        self.assertEqual(result["leads"], [])
        self.assertTrue(any("indisponível" in x for x in result["warnings"]))

    def test_intelligent_mode_does_not_fake_ai_analysis(self):
        result = perform({**INPUT, "mode": "intelligent"}, get=self.get, post=self.post)
        self.assertTrue(all(not x["aiResearch"]["opportunity"] for x in result["leads"]))
        self.assertTrue(all(x["aiResearch"]["signals"] == [] for x in result["leads"]))

    def test_overpass_http_is_form_encoded_not_json(self):
        seen = []
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, count): return b'{"elements":[]}'
        def capture(req, timeout=10):
            seen.append(req)
            return Response()
        with patch("urllib.request.urlopen", side_effect=capture):
            http_json("https://overpass-api.de/api/interpreter", {"data": "[out:json];node(0,0,1,1);out;"})
        self.assertEqual(seen[0].get_header("Content-type"), "application/x-www-form-urlencoded")
        self.assertIn(b"data=", seen[0].data)

    def test_queue_result_and_progress(self):
        settings = {"SUPABASE_URL": "https://example.supabase.co",
                    "GARIMPO_CONNECTOR_TOKEN": "a" * 64,
                    "GARIMPO_WORKSPACE_ID": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    "SUPABASE_PUBLISHABLE_KEY": "public"}
        worker = Connector(settings)
        calls = []
        def mock_call(action, **kwargs):
            calls.append((action, kwargs))
            return {"accepted": True}
        worker.call = mock_call
        job = {"id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
               "leaseId": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
               "input": {**INPUT, "query": "GARIMPO_MODE_ESSENTIAL"}}
        with patch("garimpo_connector.perform", side_effect=lambda inputs, progress: (
                progress("discover"), progress("completed", 2),
                {"leads": [{"company": "Barbearia Atlântico"}],
                 "warnings": [], "researchedAt": "2026-11-17T20:00:00Z"})[-1]):
            self.assertTrue(worker.run_job(job))
        self.assertEqual([x[0] for x in calls], ["progress", "progress", "complete"])
        self.assertEqual(len(calls[-1][1]["result"]["leads"]), 1)
        self.assertEqual(calls[0][1]["stage"], "discover")


if __name__ == "__main__":
    unittest.main()
