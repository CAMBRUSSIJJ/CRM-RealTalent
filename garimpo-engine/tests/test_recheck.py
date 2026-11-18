import asyncio
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx

from garimpo.config import Settings
from garimpo.hosted import create_app

ORG = '00000000-0000-4000-8000-000000000001'
OTHER = '00000000-0000-4000-8000-000000000002'
USER = '00000000-0000-4000-8000-000000000003'
CNPJ = '11222333000181'


class RecheckContract(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {
            'SUPABASE_URL':'https://database.test',
            'SUPABASE_PUBLISHABLE_KEY':'public-test-key'})
        self.env.start()
        self.role = 'member'
        self.db_requests = []
        def transport(request):
            if request.headers.get('authorization') != 'Bearer valid-test-session-token':
                return httpx.Response(401,json={})
            if request.url.path == '/auth/v1/user':
                return httpx.Response(200,json={'id':USER})
            if request.url.path == '/rest/v1/organization_members':
                allowed = request.url.params.get('organization_id') == 'eq.' + ORG
                return httpx.Response(200,json=[{'role':self.role}] if allowed else [])
            if request.url.path == '/rest/v1/rpc/realtalent_company_index_search':
                self.db_requests.append(request)
                return httpx.Response(200,json={
                    'items':[{'cnpj':CNPJ,'legal_name':'ESCOLA EXEMPLO LTDA',
                              'main_cnae':'8513900','status':'02',
                              'source_month':'2026-10-01',
                              'source_url':'https://www.gov.br/receitafederal/dados'}],
                    'has_more':False,'offset':0,'limit':2})
            return httpx.Response(404,json={})
        self.app = create_app(
            Settings(db_path=Path(self.tmp.name)/'cache.sqlite3',maps_binary=Path(__file__)),
            auth_transport=httpx.MockTransport(transport), preflight=lambda:None)
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=self.app),base_url='http://test',
            headers={'Authorization':'Bearer valid-test-session-token','X-Workspace-Id':ORG})

    async def asyncTearDown(self):
        await self.client.aclose()
        self.env.stop()
        self.tmp.cleanup()

    async def test_extended_register_filters_are_forwarded(self):
        response = await self.client.get('/api/garimpo/index',params={
            'city':'Rio Grande','cnae':'85','headquarters':'true',
            'opened_after':'2020-01-01','opened_before':'2026-10-31',
            'cnae_scope':'secondary'})
        self.assertEqual(response.status_code,200)
        sent = __import__('json').loads(self.db_requests[-1].content)
        self.assertEqual(sent['p_headquarters'],True)
        self.assertEqual(sent['p_opened_after'],'2020-01-01')
        self.assertEqual(sent['p_cnae_scope'],'secondary')
        self.assertEqual(sent['p_cnae'],'85')
        for filters in [
            {'opened_after':'2026-02-30'}, {'opened_before':'wrong'},
            {'opened_after':'2026-10-31','opened_before':'2020-01-01'},
            {'cnae_scope':'invalid'}
        ]:
            self.assertEqual((await self.client.get('/api/garimpo/index',params=filters)).status_code,422)

    async def test_cnpj_recheck_never_mutates_contacts(self):
        r = await self.client.post('/api/garimpo/companies/recheck',json={
            'company':'Escola Exemplo','city':'Rio Grande','state':'RS',
            'cnpj':CNPJ,'website':''})
        self.assertEqual(r.status_code,200)
        data = r.json()
        self.assertTrue(data['no_changes_applied'])
        self.assertEqual(data['sources'],['CNPJ / Receita Federal'])
        self.assertEqual({x['field'] for x in data['observations']},
                         {'legal_name','main_cnae','status'})
        self.assertNotIn('phone',{x['field'] for x in data['observations']})

    async def test_recheck_requires_auth_permission_and_safe_identity(self):
        details = {'company':'Escola Exemplo','city':'Rio Grande','state':'RS',
                   'cnpj':CNPJ,'website':''}
        self.role = 'viewer'
        self.assertEqual((await self.client.post('/api/garimpo/companies/recheck',json=details)).status_code,403)
        self.role = 'member'
        self.assertEqual((await self.client.post('/api/garimpo/companies/recheck',
            headers={'X-Workspace-Id':OTHER},json=details)).status_code,403)
        self.assertEqual((await self.client.post('/api/garimpo/companies/recheck',
            json={**details,'cnpj':'invalid'})).status_code,422)
        self.assertEqual((await self.client.post('/api/garimpo/companies/recheck',
            json={**details,'cnpj':'','website':'http://127.0.0.1:5432'})).status_code,422)
        self.assertEqual((await self.client.post('/api/garimpo/companies/recheck',
            json={**details,'cnpj':'','website':''})).status_code,422)

    async def test_site_needs_confirmed_identity_and_fresh_check(self):
        from garimpo.extraction import WebsiteCollector
        original = WebsiteCollector.collect
        called = []
        async def fake_collect(_self,item,*,require_identity=False,refresh=False):
            called.append((require_identity,refresh))
            item.website_matched = True
            item.observe('phone','+5553999991234',item.website,'Site oficial')
            return item
        with patch.object(WebsiteCollector,'collect',fake_collect):
            r = await self.client.post('/api/garimpo/companies/recheck',json={
                'company':'Escola Exemplo','city':'Rio Grande','state':'RS',
                'cnpj':CNPJ,'website':'https://escola.test'})
        self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(called,[(True,True)])
        self.assertEqual(next(x for x in r.json()['observations'] if x['field']=='phone')['value'],
                         '+5553999991234')


if __name__ == '__main__':
    unittest.main()
