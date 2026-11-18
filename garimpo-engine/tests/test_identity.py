import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx

from garimpo.company_identity import rank_candidates, search_terms
from garimpo.config import Settings
from garimpo.hosted import create_app

ORG='00000000-0000-4000-8000-000000000001'
OTHER='00000000-0000-4000-8000-000000000002'
USER='00000000-0000-4000-8000-000000000003'
CNPJ='11222333000181'
CNPJ_BRANCH='11222333000262'

def company(cnpj=CNPJ, name='CONCEITO BARBER',city='Rio Grande',state='RS',status='02'):
    return {'cnpj':cnpj,'legal_name':'CONCEITO BARBER ESTETICA LTDA',
            'trade_name':name,'city':city,'uf':state,
            'main_cnae':'9602501','status':status,'headquarters':cnpj==CNPJ,
            'source_month':'2026-10-01','source_url':'https://www.gov.br/receitafederal/dados'}

class CompanyRanking(unittest.TestCase):
    def test_exact_name_and_city_rank_without_confirming(self):
        matches=rank_candidates('Conceito Barber','Rio Grande','RS',[
            company(),company(CNPJ_BRANCH,'CONCEITO BARBER'),
            company(name='CONCEITO BARBER',city='Pelotas'),
            company(name='BARBEARIA DO VIZINHO'),
            company(cnpj='11222333000260'),
        ])
        self.assertEqual(len(matches),2)
        self.assertEqual({m['cnpj'] for m in matches},{CNPJ,CNPJ_BRANCH})
        self.assertTrue(all(m['identity_confirmed'] is False for m in matches))
        self.assertTrue(all(m['match_score']>=90 for m in matches))
        self.assertTrue(all('Rua, número' in m['reasons'][-1] for m in matches))

    def test_no_generic_or_wrong_company_guess(self):
        self.assertEqual(search_terms('Barbearia'),[])
        self.assertEqual(search_terms('Escola'),[])
        self.assertEqual(rank_candidates('Conceito Barber','Rio Grande','RS',[
            company(name='CONCEITO ESCOLA',city='Pelotas'),
            company(name='BARBEARIA VIZINHO',city='Rio Grande'),
        ]),[])
        self.assertEqual(search_terms('Conceito Barber')[0],'conceito barber')

class IdentifyApi(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{'SUPABASE_URL':'https://database.test',
                                       'SUPABASE_PUBLISHABLE_KEY':'public-test-key'})
        self.env.start()
        self.role='member'
        self.index_installed=True
        self.rpc_calls=[]
        def transport(request):
            if request.headers.get('authorization')!='Bearer valid-test-session-token':
                return httpx.Response(401,json={})
            if request.url.path=='/auth/v1/user':
                return httpx.Response(200,json={'id':USER})
            if request.url.path=='/rest/v1/organization_members':
                allowed=request.url.params.get('organization_id')=='eq.'+ORG
                return httpx.Response(200,json=[{'role':self.role}] if allowed else [])
            if request.url.path=='/rest/v1/rpc/realtalent_company_index_search':
                body=json.loads(request.content)
                self.rpc_calls.append(body)
                if not self.index_installed:
                    return httpx.Response(404,json={'code':'PGRST202'})
                return httpx.Response(200,json={'items':[
                    company(),company(CNPJ_BRANCH),company(name='BARBEARIA DO VIZINHO'),
                    company(name='CONCEITO BARBER',city='Pelotas')],
                    'limit':80,'offset':0,'has_more':False})
            return httpx.Response(404,json={})
        self.app=create_app(Settings(db_path=Path(self.tmp.name)/'cache.sqlite3',
                                     maps_binary=Path(__file__)),
                            auth_transport=httpx.MockTransport(transport),preflight=lambda:None)
        self.client=httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app),
            base_url='http://test',
            headers={'Authorization':'Bearer valid-test-session-token','X-Workspace-Id':ORG})

    async def asyncTearDown(self):
        await self.client.aclose()
        self.env.stop()
        self.tmp.cleanup()

    async def test_homonyms_require_manual_confirmation(self):
        r=await self.client.post('/api/garimpo/companies/identify',json={
            'company':'Conceito Barber','city':'Rio Grande','state':'RS',
            'address':'Rua Central, 15'})
        self.assertEqual(r.status_code,200,r.text)
        body=r.json()
        self.assertEqual(len(body['candidates']),2)
        self.assertFalse(body['identity_confirmed'])
        self.assertTrue(all(not m['identity_confirmed'] for m in body['candidates']))
        self.assertTrue(all('source_month' in m for m in body['candidates']))
        self.assertTrue(all(row['p_city']=='rio grande' for row in self.rpc_calls))
        self.assertEqual(self.rpc_calls[0]['p_name'],'conceito barber')
        self.assertEqual(self.rpc_calls[0]['p_limit'],80)

    async def test_validation_permission_and_no_data_not_faked(self):
        req={'company':'Conceito Barber','city':'Rio Grande','state':'RS'}
        self.role='viewer'
        self.assertEqual((await self.client.post('/api/garimpo/companies/identify',json=req)).status_code,403)
        self.role='member'
        self.assertEqual((await self.client.post('/api/garimpo/companies/identify',json=req,
            headers={'X-Workspace-Id':OTHER})).status_code,403)
        self.assertEqual((await self.client.post('/api/garimpo/companies/identify',json={
            **req,'state':'SC'})).status_code,422)
        self.assertEqual((await self.client.post('/api/garimpo/companies/identify',json={
            **req,'company':'Barbearia'})).status_code,422)
        self.index_installed=False
        result=await self.client.post('/api/garimpo/companies/identify',json=req)
        self.assertEqual(result.status_code,503)
        self.assertIn('não está instalado',result.json()['detail'])
        self.assertNotIn('candidates',result.json())

if __name__=='__main__':
    unittest.main()
