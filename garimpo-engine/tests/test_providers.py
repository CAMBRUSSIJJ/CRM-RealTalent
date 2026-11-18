import unittest
from urllib.parse import parse_qs

import httpx

from garimpo.models import SearchRequest
from garimpo.network import SourceError
from garimpo.providers import discover
from support import GEOCODE, Harness, element


class ProvidersTest(unittest.IsolatedAsyncioTestCase):
    async def test_osm_uses_administrative_area_and_normalizes_observed_contacts(self):
        def provider(request):
            if "nominatim" in request.url.host:
                self.assertEqual(request.url.params["state"], "Rio Grande do Sul")
                return httpx.Response(200, json=GEOCODE)
            query = parse_qs(request.content.decode())["data"][0]
            self.assertIn("area(3600242503)", query)
            self.assertIn('["amenity"="dentist"]', query)
            self.assertIn("out center tags 75", query)
            return httpx.Response(200, json={"elements": [element(phone="(51) 99999-1001", **{"ref:cnpj": "11.222.333/0001-81"})]})
        harness = Harness(provider=provider)
        try:
            batches = [batch async for batch in discover(SearchRequest(segment="dentistas", city="Canoas", state="RS"), harness.http)]
            self.assertEqual(batches[0][0].phone, "+5551999991001")
            self.assertEqual(batches[0][0].cnpj, "11222333000181")
            self.assertEqual(batches[0][0].location_status, "observed")
        finally:
            await harness.close()

    async def test_unsupported_segment_does_not_silently_query_every_business(self):
        harness = Harness()
        try:
            with self.assertRaises(SourceError):
                _ = [batch async for batch in discover(SearchRequest(segment="fábricas de equipamentos", city="Canoas", state="RS"), harness.http)]
            self.assertEqual(len(harness.requests), 0)
        finally:
            await harness.close()

    async def test_wrong_state_and_oversized_geography_are_rejected(self):
        bad_locations = [[], [{**GEOCODE[0], "address": {**GEOCODE[0]["address"], "city": "Esteio"}}], [{**GEOCODE[0], "address": {"country_code": "br", "state": "São Paulo"}}], [{**GEOCODE[0], "boundingbox": ["-90", "90", "-180", "180"]}]]
        for location in bad_locations:
            harness = Harness(provider=lambda _: httpx.Response(200, json=location))
            try:
                with self.assertRaises(SourceError):
                    _ = [batch async for batch in discover(SearchRequest(segment="dentista", city="Canoas", state="RS"), harness.http)]
                self.assertEqual(len(harness.requests), 1)
            finally:
                await harness.close()

    async def test_brave_paginates_and_filters_directories_and_social_networks(self):
        def provider(request):
            offset = int(request.url.params["offset"])
            self.assertEqual(request.headers["X-Subscription-Token"], "SECRET")
            self.assertEqual(request.url.params["country"], "BR")
            if offset == 0:
                return httpx.Response(200, json={"web": {"results": [
                    {"url": "https://empresa.test/", "title": "Empresa"},
                    {"url": "https://instagram.com/empresa", "title": "Instagram"},
                    {"url": "https://cnpj.biz/123", "title": "Diretório"}], "more_results_available": True}})
            return httpx.Response(200, json={"web": {"results": [{"url": "https://segunda.test/", "title": "Segunda"}], "more_results_available": False}})
        harness = Harness(provider=provider, brave_key="SECRET")
        try:
            batches = [batch async for batch in discover(SearchRequest(segment="software industrial", city="Canoas", state="RS"), harness.http)]
            self.assertEqual([item.company for batch in batches for item in batch], ["Empresa", "Segunda"])
            self.assertEqual(len(harness.requests), 2)
            self.assertEqual(batches[0][0].location_status, "requested")
        finally:
            await harness.close()

    async def test_provider_timeout_remark_is_not_accepted_as_complete_data(self):
        def provider(request):
            return httpx.Response(200, json=GEOCODE if "nominatim" in request.url.host else {"elements": [], "remark": "runtime error timeout"})
        harness = Harness(provider=provider)
        try:
            with self.assertRaises(SourceError):
                _ = [batch async for batch in discover(SearchRequest(segment="dentista", city="Canoas", state="RS"), harness.http)]
        finally:
            await harness.close()
