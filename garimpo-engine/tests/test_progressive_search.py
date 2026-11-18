import asyncio
from dataclasses import replace
import json
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import AsyncMock,patch

import httpx

from garimpo.api import create_app
from garimpo.engine import Engine
from garimpo.maps import MapsBlocked,cache_satisfies,listing_candidate
from garimpo.maps_planner import plan_queries
from garimpo.models import SearchRequest
from garimpo.osm_index import point_in_geometry
from support import Harness
from test_maps import LOCATION,ROW,REQUEST


def row(index):
    return {**ROW,'place_id':f'place-{index}','title':f'Barbearia Teste {index}','phone':f'5399999100{index}','address':f'Avenida Brasil, {123+index}, Rio Grande, RS','web_site':''}


class PlannerTest(unittest.TestCase):
    def test_expansion_is_bounded_inside_city_and_does_not_broaden_barbers_to_salons(self):
        request=REQUEST.model_copy(update={'search_mode':'expanded'})
        plan=plan_queries(request,LOCATION,None,6)
        self.assertGreater(len(plan),2);self.assertLessEqual(len(plan),6)
        self.assertEqual(len({p['id'] for p in plan}),len(plan))
        for step in plan:
            lat,lon=map(float,step['coordinates'].split(','))
            self.assertTrue(point_in_geometry(lon,lat,LOCATION['geojson']))
            self.assertNotIn(step['term'],{'salão','salão de beleza','cabeleireiro'})
        self.assertEqual(len(plan_queries(REQUEST,LOCATION,None,6)),1)

    def test_local_commercial_cluster_is_preferred_to_empty_grid_points(self):
        with TemporaryDirectory() as folder:
            path=Path(folder)/'density.db'
            with sqlite3.connect(path) as db:
                db.execute('create table points(lat real,lon real)')
                db.executemany('insert into points values(?,?)',[(-32.12,-52.16)]*20+[(-32.10,-52.05)]*2)
            request=REQUEST.model_copy(update={'search_mode':'expanded'})
            plan=plan_queries(request,{**LOCATION,'boundingbox':['-32.2','-32','-52.2','-52']},path,6)
            self.assertIn('-32.120000,-52.160000',[step['coordinates'] for step in plan])

    def test_incomplete_cache_must_satisfy_required_contacts_and_deduplicate(self):
        request=REQUEST.model_copy(update={'limit':2})
        self.assertTrue(cache_satisfies([row(1),row(2)],request,LOCATION,'2026-11-17T00:00:00Z'))
        self.assertFalse(cache_satisfies([row(1),{**row(1),'place_id':'duplicate'}],request,LOCATION,'2026-11-17T00:00:00Z'))
        self.assertFalse(cache_satisfies([row(1),row(2)],request.model_copy(update={'require_email':True}),LOCATION,'2026-11-17T00:00:00Z'))


class ProgressiveTest(unittest.IsolatedAsyncioTestCase):
    async def test_a_duplicate_listing_with_a_new_phone_updates_the_preserved_candidate(self):
        harness=Harness(maps_binary=Path('/usr/bin/true'),maps_query_limit=2,provider=lambda r:httpx.Response(200,json=[LOCATION]))
        try:
            request=REQUEST.model_copy(update={'limit':1,'search_mode':'expanded'})
            with patch('garimpo.maps.run_maps',AsyncMock(side_effect=[([{**row(1),'phone':''}],False),([row(1)],False)])):
                result=await Engine(harness.http,harness.store).run_one(harness.store.create(request)['id'])
            self.assertEqual(result['status'],'completed')
            self.assertEqual(result['discovered'],1)
            self.assertEqual(len(result['results']),1)
            self.assertEqual(result['results'][0]['phone'],'53999991001')
            self.assertEqual(result['pending'],[])
        finally:await harness.close()
    async def test_requested_limit_stops_real_process_and_reuses_eligible_partial_cache(self):
        with TemporaryDirectory() as folder:
            binary=Path(folder)/'collector'
            binary.write_text('#!/usr/bin/env python3\nimport sys,json,time\np=sys.argv[sys.argv.index("-results")+1]\nf=open(p,"w");f.write(json.dumps('+repr(row(1))+')+"\\n");f.flush()\ntime.sleep(60)\n');binary.chmod(0o755)
            harness=Harness(maps_binary=binary,provider=lambda r:httpx.Response(200,json=[LOCATION]))
            request=REQUEST.model_copy(update={'limit':1})
            try:
                result=await asyncio.wait_for(Engine(harness.http,harness.store).run_one(harness.store.create(request)['id']),4)
                self.assertEqual(len(result['results']),1)
                self.assertEqual(result['metrics']['completion_reason'],'limit_reached')
                with patch('garimpo.maps.run_maps',AsyncMock(side_effect=AssertionError('Cache deveria bastar'))):
                    repeat=await Engine(harness.http,harness.store).run_one(harness.store.create(request)['id'])
                self.assertEqual(len(repeat['results']),1)
                self.assertEqual(repeat['metrics']['maps_cache_hits'],1)
            finally:await harness.close()
    async def test_real_file_stream_publishes_contact_before_process_finishes(self):
        with TemporaryDirectory() as folder:
            root=Path(folder);binary=root/'collector';release=root/'release'
            binary.write_text('#!/usr/bin/env python3\nimport sys,json,time,os\np=sys.argv[sys.argv.index("-results")+1]\nf=open(p,"w")\nf.write(json.dumps('+repr(row(1))+')+"\\n");f.flush()\nwhile not os.path.exists('+repr(str(release))+'):time.sleep(0.01)\nf.write(json.dumps('+repr(row(2))+')+"\\n");f.close()\n');binary.chmod(0o755)
            harness=Harness(maps_binary=binary,provider=lambda r:httpx.Response(200,json=[LOCATION]))
            request=REQUEST.model_copy(update={'limit':2})
            job=harness.store.create(request);task=asyncio.create_task(Engine(harness.http,harness.store).run_one(job['id']))
            try:
                for _ in range(200):
                    current=harness.store.get(job['id'])
                    if current['results']:break
                    await asyncio.sleep(0.01)
                self.assertEqual(len(current['results']),1)
                self.assertEqual(current['status'],'running')
                self.assertFalse(task.done())
                release.touch();result=await asyncio.wait_for(task,4)
                self.assertEqual(len(result['results']),2)
                self.assertLess(result['metrics']['first_result_ms'],result['metrics']['duration_ms'])
                with patch('garimpo.maps.run_maps',AsyncMock(side_effect=AssertionError('Não deveria abrir outro navegador'))):
                    repeat=await Engine(harness.http,harness.store).run_one(harness.store.create(request)['id'])
                self.assertEqual(len(repeat['results']),2)
                self.assertEqual(repeat['metrics']['maps_cache_hits'],1)
            finally:
                release.touch()
                if not task.done():task.cancel()
                await harness.close()

    async def test_phone_is_preserved_during_optional_website_check_and_cancellation(self):
        harness=Harness(maps_binary=Path('/usr/bin/true'),provider=lambda r:httpx.Response(200,json=[LOCATION]))
        started=asyncio.Event();gate=asyncio.Event()
        try:
            request=REQUEST.model_copy(update={'limit':1,'enrich_websites':True})
            job=harness.store.create(request);engine=Engine(harness.http,harness.store)
            async def collect(item,**kwargs):started.set();await gate.wait();return item
            with patch('garimpo.maps.run_maps',AsyncMock(return_value=([ROW],False))),patch.object(engine.collector,'collect',side_effect=collect):
                task=asyncio.create_task(engine.run_one(job['id']))
                await asyncio.wait_for(started.wait(),2)
                current=harness.store.get(job['id'])
                self.assertEqual(len(current['results']),1)
                self.assertEqual(current['results'][0]['engine']['collectionStatus'],'enriching')
                cancelled=harness.store.cancel(job['id']);gate.set();await task
            self.assertEqual(cancelled['status'],'cancelled')
            self.assertEqual(len(cancelled['results']),1)
            self.assertTrue(harness.store.get(job['id'])['pending_enrichment_ids'])
        finally:gate.set();await harness.close()

    async def test_worker_restart_skips_completed_queries_without_global_cache(self):
        harness=Harness(maps_binary=Path('/usr/bin/true'),cache_ttl=0,maps_query_limit=3,provider=lambda r:httpx.Response(200,json=[LOCATION]))
        second=asyncio.Event();calls=[]
        async def collector(request,http,coordinates,**kwargs):
            term=kwargs['term'];calls.append(term)
            if len(calls)==1:return [row(1)],False
            if len(calls)==2:
                second.set();await asyncio.Event().wait()
            return [row(2),row(3)],False
        try:
            request=REQUEST.model_copy(update={'limit':3,'search_mode':'expanded'})
            original=harness.store.create(request);engine=Engine(harness.http,harness.store)
            with patch('garimpo.maps.run_maps',side_effect=collector):
                task=asyncio.create_task(engine.run_one(original['id']))
                await asyncio.wait_for(second.wait(),3)
                self.assertEqual(harness.store.get(original['id'])['discovery_state']['maps']['plan'][0]['status'],'completed')
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):await task
                self.assertEqual(harness.store.get(original['id'])['status'],'queued')
                result=await engine.run_one(original['id'])
            self.assertEqual(calls,['barbearias','barbershop','barbershop'])
            self.assertEqual(len(result['results']),3)
            self.assertEqual(result['metrics']['maps_steps_reused'],1)
        finally:await harness.close()

    async def test_a_block_stops_all_variations_and_regions(self):
        harness=Harness(maps_binary=Path('/usr/bin/true'),provider=lambda r:httpx.Response(200,json=[LOCATION]))
        try:
            request=REQUEST.model_copy(update={'search_mode':'expanded'})
            with patch('garimpo.maps.run_maps',AsyncMock(side_effect=MapsBlocked('Fonte restringiu a coleta'))) as collect:
                result=await Engine(harness.http,harness.store).run_one(harness.store.create(request)['id'])
            self.assertEqual(collect.await_count,1)
            self.assertEqual(result['status'],'failed')
            self.assertEqual(result['discovery_state']['maps']['stop_reason'],'blocked')
        finally:await harness.close()


class ResumeAPITest(unittest.IsolatedAsyncioTestCase):
    async def test_resume_copies_completed_steps_and_contacts_without_requerying_them(self):
        token='test-resume-token-with-at-least-32-characters'
        harness=Harness(api_token=token,maps_binary=Path('/usr/bin/true'),maps_query_limit=2,cache_ttl=0,provider=lambda r:httpx.Response(200,json=[LOCATION]))
        try:
            request=REQUEST.model_copy(update={'limit':2,'search_mode':'expanded'})
            original=harness.store.create(request);running=harness.store.claim('seed',original['id'])
            item=listing_candidate(row(1),request,LOCATION,'2026-11-17T00:00:00Z')
            plan=plan_queries(request,LOCATION,None,2);plan[0]['status']='completed'
            running.update(candidates=[item.model_dump()],done_ids=[item.provider_id],discovery_state={'maps':{'version':1,'plan':plan,'seen':[item.provider_id]}})
            engine=Engine(harness.http,harness.store);engine.checkpoint(running,'seed');harness.store.cancel(original['id'])
            app=create_app(harness.settings,http=harness.http)
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test',headers={'Authorization':'Bearer '+token}) as client:
                created=await client.post(f'/v1/searches/{original["id"]}/resume',json={})
                self.assertEqual(len(created.json()['results']),1)
                self.assertNotIn('discovery_state',created.json())
                with patch('garimpo.maps.run_maps',AsyncMock(return_value=([row(2)],False))) as collect:
                    result=await engine.run_one(created.json()['id'])
                self.assertEqual(len(result['results']),2)
                self.assertEqual(collect.await_count,1)
                self.assertEqual(collect.call_args.kwargs['term'],'barbershop')
                self.assertEqual(result['metrics']['maps_steps_reused'],1)
            self.assertEqual(harness.store.get(original['id'])['status'],'cancelled')
        finally:await harness.close()
    async def test_resume_is_private_idempotent_and_preserves_parent_checkpoint(self):
        token='test-resume-token-with-at-least-32-characters'
        harness=Harness(api_token=token,maps_binary=Path('/usr/bin/true'),provider=lambda r:httpx.Response(200,json=[LOCATION]))
        try:
            request=REQUEST.model_copy(update={'limit':1})
            original=harness.store.create(request);harness.store.cancel(original['id'])
            app=create_app(harness.settings,http=harness.http)
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
                path=f'/v1/searches/{original["id"]}/resume'
                self.assertEqual((await client.post(path,json={})).status_code,401)
                headers={'Authorization':'Bearer '+token,'Idempotency-Key':'resume-once'}
                first=await client.post(path,json={},headers=headers)
                second=await client.post(path,json={},headers=headers)
                self.assertEqual(first.status_code,202);self.assertEqual(first.json()['id'],second.json()['id'])
                self.assertEqual(first.json()['parent_job_id'],original['id'])
                with patch('garimpo.maps.run_maps',AsyncMock(return_value=([ROW],False))):
                    result=await app.state.engine.run_one(first.json()['id'])
                self.assertEqual(len(result['results']),1)
                self.assertEqual(harness.store.get(original['id'])['status'],'cancelled')
                conflict=await client.post(f'/v1/searches/{result["id"]}/resume',json={},headers=headers)
                self.assertEqual(conflict.status_code,409)
        finally:await harness.close()
