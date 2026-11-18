import asyncio
from io import BytesIO
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import AsyncMock, patch

import httpx

from garimpo.engine import Engine
from garimpo.maps import discover_maps, listing_candidate, run_maps
from garimpo.maps_setup import harden_browsers, setup_maps
from garimpo.models import Candidate, SearchRequest, deduplicate
from garimpo.network import SourceError
from support import Harness, element


LOCATION={"lat":"-32.03","lon":"-52.1","address":{"city":"Rio Grande","state":"Rio Grande do Sul","country_code":"br","ISO3166-2-lvl4":"BR-RS"},"geojson":{"type":"Polygon","coordinates":[[[-52.2,-32.2],[-52,-32.2],[-52,-32],[-52.2,-32],[-52.2,-32.2]]]}}
ROW={"title":"Barbearia de Teste","link":"https://www.google.com/maps/place/teste","place_id":"place-1","category":"Barbearia","phone":"+55 53 99999-1001","web_site":"https://barbearia.test/","address":"Avenida Brasil, 123, Rio Grande, RS","complete_address":{"city":"Rio Grande","state":"RS","country":"BR"},"latitude":-32.03,"longitude":-52.1,"review_rating":4.8,"review_count":42}
REQUEST=SearchRequest(segment="barbearias",city="Rio Grande",state="RS",provider="maps",limit=10,require_phone=True,enrich_websites=False,search_mode="standard")


class ListingTest(unittest.TestCase):
    def test_osm_and_maps_addresses_merge_without_combining_branches(self):
        items=[Candidate(provider_id="osm:1",company="Original Barbearia",city="Rio Grande",state="RS",address="Av. Brasil, 123, Centro",phone="+5553999991001"),
               Candidate(provider_id="maps:1",company="Original Barbearia",city="Rio Grande",state="RS",address="Avenida Brasil, 123 - Centro, Rio Grande, RS",phone="+5553999991001"),
               Candidate(provider_id="maps:2",company="Original Barbearia",city="Rio Grande",state="RS",address="Avenida Brasil, 999 - Centro, Rio Grande, RS",phone="+5553999991001")]
        self.assertEqual(len(deduplicate(items)),2)
    def test_maps_contacts_location_and_aggregates_keep_public_sources(self):
        item=listing_candidate(ROW,REQUEST,LOCATION,"2026-11-17T00:00:00Z")
        self.assertEqual(item.phone,"+5553999991001")
        self.assertEqual(item.listing["review_count"],42)
        self.assertEqual(item.location_status,"observed")
        self.assertTrue(all(e.url.startswith("https://www.google.com/maps/") for e in item.evidence))
        self.assertEqual(item.provider_id,"maps:place-1")

    def test_other_city_state_country_and_points_outside_polygon_are_excluded(self):
        for changed in ({"complete_address":{"city":"Pelotas"}},{"complete_address":{"state":"SP"}},{"complete_address":{"country":"AR"}},{"latitude":-31.0},{"latitude":"NaN"},{"link":"https://unrelated.test/"}):
            self.assertIsNone(listing_candidate({**ROW,**changed},REQUEST,LOCATION,"2026-11-17T00:00:00Z"))

    def test_legacy_longitude_and_invalid_ratings_are_handled(self):
        row={**ROW,"longtitude":ROW["longitude"],"review_rating":"NaN"};del row["longitude"]
        item=listing_candidate(row,REQUEST,LOCATION,"2026-11-17T00:00:00Z")
        self.assertIsNotNone(item)
        self.assertNotIn("rating",item.listing)

    def test_permanent_closure_is_excluded_but_after_hours_closure_is_not(self):
        self.assertIsNone(listing_candidate({**ROW,"status":"Permanently closed"},REQUEST,LOCATION,"2026-11-17T00:00:00Z"))
        self.assertIsNotNone(listing_candidate({**ROW,"status":"Closed"},REQUEST,LOCATION,"2026-11-17T00:00:00Z"))

    def test_installer_never_executes_a_download_with_wrong_checksum(self):
        with TemporaryDirectory() as folder, patch("garimpo.maps_setup.urlopen",return_value=BytesIO(b"wrong binary")),patch("garimpo.maps_setup.subprocess.run") as execute:
            with self.assertRaises(ValueError):setup_maps(Path(folder))
            execute.assert_not_called()
            self.assertEqual(list(Path(folder).iterdir()),[])

    def test_browser_launcher_removes_insecure_and_concealment_flags(self):
        with TemporaryDirectory() as folder:
            browser=Path(folder)/"chromium-123"/"chrome-linux64"/"chrome";browser.parent.mkdir(parents=True)
            browser.write_text("original");harden_browsers(Path(folder));harden_browsers(Path(folder))
            self.assertEqual(browser.with_name("chrome.garimpo-real").read_text(),"original")
            self.assertIn("--ignore-certificate-errors",browser.read_text())
            self.assertIn("not arg.startswith(blocked)",browser.read_text())


class MapsEngineTest(unittest.IsolatedAsyncioTestCase):
    async def test_combined_sources_merge_the_same_business_and_keep_new_branches(self):
        def provider(request):
            if 'nominatim' in request.url.host:return httpx.Response(200,json=[{**LOCATION,'boundingbox':['-32.2','-32','-52.2','-52']}])
            return httpx.Response(200,json={'elements':[element(1,name=ROW['title'],phone=ROW['phone'],**{'addr:city':'Rio Grande','addr:street':'Av. Brasil','addr:housenumber':'123'}),element(2,name='Outra Barbearia',phone='53999991002',**{'addr:city':'Rio Grande'})]})
        harness=Harness(maps_binary=Path('/usr/bin/true'),provider=provider)
        try:
            request=REQUEST.model_copy(update={'provider':'combined','limit':2})
            with patch('garimpo.maps.run_maps',AsyncMock(return_value=([ROW],False))):
                result=await Engine(harness.http,harness.store).run_one(harness.store.create(request)['id'])
            self.assertEqual(result['status'],'completed')
            self.assertEqual(len(result['results']),2)
            self.assertEqual(result['metrics']['discovery_duplicates'],1)
        finally:await harness.close()

    async def test_combined_source_preserves_osm_when_maps_fails(self):
        def provider(request):
            if 'nominatim' in request.url.host:return httpx.Response(200,json=[{**LOCATION,'boundingbox':['-32.2','-32','-52.2','-52']}])
            return httpx.Response(200,json={'elements':[element(1,name='Barbearia',phone='53999991001',**{'addr:city':'Rio Grande'})]})
        harness=Harness(maps_binary=Path('/usr/bin/true'),provider=provider)
        try:
            request=REQUEST.model_copy(update={'provider':'combined'})
            with patch('garimpo.maps.run_maps',AsyncMock(side_effect=SourceError('Coletor indisponível'))):
                result=await Engine(harness.http,harness.store).run_one(harness.store.create(request)['id'])
            self.assertEqual(result['status'],'completed')
            self.assertEqual(len(result['results']),1)
            self.assertTrue(result['partial'])
        finally:await harness.close()
    async def test_engine_imports_maps_and_rerun_uses_cache_without_new_process(self):
        harness=Harness(maps_binary=Path('/usr/bin/true'),provider=lambda r:httpx.Response(200,json=[LOCATION]))
        runner=AsyncMock(return_value=([ROW],False))
        try:
            with patch("garimpo.maps.run_maps",runner):
                first=await Engine(harness.http,harness.store).run_one(harness.store.create(REQUEST)["id"])
                repeat=await Engine(harness.http,harness.store).run_one(harness.store.create(REQUEST)["id"])
            self.assertEqual(first["status"],"completed")
            self.assertEqual(len(first["results"]),1)
            self.assertEqual(first["results"][0]["sourceDetail"],"Motor Python / maps")
            self.assertEqual(first["results"][0]["engine"]["relevanceScore"],85)
            self.assertEqual(repeat["metrics"]["maps_cache_hits"],1)
            self.assertEqual(repeat["metrics"]["maps_runs"],0)
            self.assertEqual(runner.await_count,1)
        finally:await harness.close()

    async def test_partial_collection_keeps_published_contacts_and_reports_interruption(self):
        harness=Harness(maps_binary=Path('/usr/bin/true'),provider=lambda r:httpx.Response(200,json=[LOCATION]))
        try:
            with patch("garimpo.maps.run_maps",AsyncMock(return_value=([ROW],True))):
                result=await Engine(harness.http,harness.store).run_one(harness.store.create(REQUEST)["id"])
            self.assertEqual(result["status"],"completed")
            self.assertEqual(len(result["results"]),1)
            self.assertTrue(result["partial"])
            self.assertTrue(result["results"][0]["engine"]["partialSearch"])
        finally:await harness.close()

    async def test_malformed_or_wrong_municipality_is_not_sent_to_collector(self):
        for location in ({**LOCATION,"address":[]},{**LOCATION,"address":{**LOCATION["address"],"city":"Pelotas"}},{**LOCATION,"lat":"NaN"}):
            harness=Harness(maps_binary=Path(__file__),provider=lambda r:httpx.Response(200,json=[location]))
            try:
                with patch("garimpo.maps.run_maps",AsyncMock()) as runner:
                    with self.assertRaises(SourceError):_=[batch async for batch in discover_maps(REQUEST,harness.http)]
                    runner.assert_not_awaited()
            finally:await harness.close()

    async def test_actual_subprocess_reads_json_lines_without_inheriting_api_secrets(self):
        with TemporaryDirectory() as folder:
            binary=Path(folder)/"collector"
            binary.write_text('#!/usr/bin/env python3\nimport sys,json,os\nassert "BRAVE_SEARCH_API_KEY" not in os.environ\nassert "GARIMPO_API_TOKEN" not in os.environ\np=sys.argv[sys.argv.index("-results")+1]\nopen(p,"w").write(json.dumps('+repr({**ROW,"owner":{"name":"Pessoa"},"user_reviews":[{"name":"Avaliador"}]})+')+"\\n")\n')
            binary.chmod(0o755)
            harness=Harness(maps_binary=binary)
            try:
                with patch.dict(os.environ,{"BRAVE_SEARCH_API_KEY":"SECRET","GARIMPO_API_TOKEN":"SECRET"}):
                    rows,partial=await run_maps(REQUEST,harness.http,"-32.03,-52.1")
                self.assertEqual(rows,[ROW]);self.assertFalse(partial)
            finally:await harness.close()

    async def test_cancellation_terminates_the_external_collector(self):
        with TemporaryDirectory() as folder:
            root=Path(folder);binary=root/"collector";pidfile=root/"pid"
            binary.write_text('#!/usr/bin/env python3\nimport os,time\nopen('+repr(str(pidfile))+',"w").write(str(os.getpid()))\ntime.sleep(60)\n');binary.chmod(0o755)
            harness=Harness(maps_binary=binary)
            task=asyncio.create_task(run_maps(REQUEST,harness.http,"-32.03,-52.1"))
            try:
                for _ in range(100):
                    if pidfile.exists():break
                    await asyncio.sleep(0.01)
                self.assertTrue(pidfile.exists())
                pid=int(pidfile.read_text());task.cancel()
                with self.assertRaises(asyncio.CancelledError):await task
                with self.assertRaises(ProcessLookupError):os.kill(pid,0)
            finally:
                if not task.done():task.cancel()
                await harness.close()

    async def test_cancellation_also_stops_a_browser_in_its_own_process_group(self):
        with TemporaryDirectory() as folder:
            root=Path(folder);binary=root/'collector';pidfile=root/'child'
            binary.write_text('#!/usr/bin/env python3\nimport subprocess,sys,time\np=subprocess.Popen([sys.executable,"-c","import time;time.sleep(60)"],start_new_session=True)\nopen('+repr(str(pidfile))+',"w").write(str(p.pid))\ntime.sleep(60)\n');binary.chmod(0o755)
            harness=Harness(maps_binary=binary);task=asyncio.create_task(run_maps(REQUEST,harness.http,'-32,-52'))
            try:
                for _ in range(100):
                    if pidfile.exists():break
                    await asyncio.sleep(0.01)
                self.assertTrue(pidfile.exists());pid=int(pidfile.read_text());task.cancel()
                with self.assertRaises(asyncio.CancelledError):await task
                status=Path(f'/proc/{pid}/stat')
                self.assertTrue(not status.exists() or status.read_text().rsplit(')',1)[1].split()[0]=='Z')
            finally:
                if not task.done():task.cancel()
                await harness.close()
