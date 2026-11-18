import asyncio
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx

from garimpo.config import Settings
from garimpo.hosted import create_app
from garimpo.store import Store

ORG = '00000000-0000-4000-8000-000000000001'
OTHER = '00000000-0000-4000-8000-000000000002'
USER = '00000000-0000-4000-8000-000000000003'
QUERY = {'provider':'maps','segment':'barbearias','city':'Rio Grande','state':'RS','limit':5}


class TestHosted(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'SUPABASE_URL':'https://database.test','SUPABASE_PUBLISHABLE_KEY':'public-test-key'})
        self.env.start()
        self.role = 'owner'
        self.stores = {org: Store(Path(self.tmp.name) / f'{org}.sqlite3') for org in (ORG, OTHER)}
        for org, store in self.stores.items():
            # Test-only wrapper provides hosted scope while exercising the real local lease engine.
            original = store.create
            def create(request, _org=org, _original=original, **kwargs):
                job = _original(request, **kwargs)
                job['organization_id'] = _org
                return job
            store.create = create
        def auth(request):
            if request.headers.get('authorization') != 'Bearer valid-test-session-token':
                return httpx.Response(401, json={'message':'invalid'})
            if request.url.path == '/auth/v1/user': return httpx.Response(200,json={'id':USER})
            allowed = request.url.params.get('organization_id') != 'eq.' + OTHER
            return httpx.Response(200,json=[{'role':self.role}] if allowed else [])
        self.app = create_app(Settings(db_path=Path(self.tmp.name)/'cache.sqlite3',maps_binary=Path(__file__)),
            auth_transport=httpx.MockTransport(auth), store_factory=lambda scope:self.stores[scope.organization_id], preflight=lambda:None)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app),base_url='http://test',
            headers={'Authorization':'Bearer valid-test-session-token','X-Workspace-Id':ORG,'Idempotency-Key':'test-key-123'})

    async def asyncTearDown(self):
        await self.client.aclose()
        self.env.stop()
        self.tmp.cleanup()

    async def test_auth_and_scope_before_data_access(self):
        self.assertEqual((await self.client.get('/api/garimpo/capabilities',headers={'Authorization':'Bearer invalid-test-session-token'})).status_code,401)
        self.assertEqual((await self.client.get('/api/garimpo/capabilities',headers={'X-Workspace-Id':OTHER})).status_code,403)
        self.assertEqual((await self.client.get('/api/garimpo/searches/not-a-uuid')).status_code,422)
        self.assertEqual((await self.client.get('/api/garimpo/searches/'+OTHER)).status_code,404)

    async def test_viewer_cannot_start_cancel_or_run(self):
        self.role = 'viewer'
        self.assertEqual((await self.client.get('/api/garimpo/capabilities')).status_code,200)
        self.assertEqual((await self.client.post('/api/garimpo/searches',json=QUERY)).status_code,403)
        self.assertEqual((await self.client.post('/api/garimpo/searches/'+OTHER+'/run')).status_code,403)
        self.assertEqual((await self.client.post('/api/garimpo/searches/'+OTHER+'/cancel')).status_code,403)

    async def test_create_requires_one_source_and_idempotency(self):
        self.assertEqual((await self.client.post('/api/garimpo/searches',json={**QUERY,'provider':'osm'})).status_code,422)
        a = await self.client.post('/api/garimpo/searches',json=QUERY)
        b = await self.client.post('/api/garimpo/searches',json=QUERY)
        self.assertEqual(a.status_code,202)
        self.assertEqual(a.json()['id'],b.json()['id'])
        self.assertNotIn('candidates',a.json())
        self.assertEqual(a.headers['cache-control'],'no-store')
        self.assertEqual((await self.client.post('/api/garimpo/searches',json={**QUERY,'city':'Canoas'})).status_code,409)

    async def test_readiness_checks_browser_in_lifespan(self):
        self.assertEqual((await self.client.get('/api/garimpo/health')).status_code,503)
        async with self.app.router.lifespan_context(self.app):
            self.assertEqual((await self.client.get('/api/garimpo/health')).status_code,200)

    async def test_stream_completion_and_cancel_resume_contract(self):
        response = await self.client.post('/api/garimpo/searches',json=QUERY)
        job_id = response.json()['id']
        # Scope is normally assigned atomically by Postgres; persist the fixture metadata.
        store = self.stores[ORG]
        with store.connect() as conn:
            conn.execute('update jobs set document=? where id=?',(json.dumps(response.json()),job_id))
        async def run(engine, job_id):
            owner = 'test-owner'
            job = engine.store.claim(owner,job_id)
            job.update(status='completed',results=[{'company':'Barbearia de teste','phone':'53999991234'}])
            engine.store.save(job,owner)
            return job
        with patch('garimpo.hosted.Engine.run_one',new=run):
            streamed = await self.client.post('/api/garimpo/searches/'+job_id+'/run')
        events = [json.loads(line) for line in streamed.text.splitlines()]
        self.assertEqual(events[-1]['event'],'finished')
        self.assertEqual(events[-1]['job']['results'][0]['phone'],'53999991234')
        self.assertEqual((await self.client.post('/api/garimpo/searches/'+job_id+'/resume')).status_code,409)
        self.assertEqual((await self.client.post('/api/garimpo/searches/'+job_id+'/cancel')).json()['status'],'completed')

    async def test_request_body_is_bounded(self):
        self.assertEqual((await self.client.post('/api/garimpo/searches',content='x'*17000)).status_code,413)


if __name__ == '__main__': unittest.main()
