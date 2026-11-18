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
    return {'cnpj':cnpj,'legal_name':name+' ESTETICA LTDA',
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
        self.assertEqual(search_terms('Alpha Barbearia em Rio Grande','Rio Grande')[0],
                         'alpha barbearia')
        matches = rank_candidates('Alpha Barbearia em Rio Grande','Rio Grande','RS',
            [company(name='ALPHA BARBEARIA')])
        self.assertEqual(len(matches),1)
        self.assertFalse(matches[0]['identity_confirmed'])

class IdentifyApi(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{'SUPABASE_URL':'https://database.test',
                                       'SUPABASE_PUBLISHABLE_KEY':'public-test-key'})
        self.env.start()
        self.role='member'
        self.index_installed=True
        self.public_status=200
        self.rpc_calls=[]
        self.public_calls=[]
        def public_transport(request):
            self.public_calls.append(request)
            if self.public_status != 200:
                return httpx.Response(self.public_status, json={'error':'limite'})
            if request.url.path == '/consulta/api/v1/busca':
                return httpx.Response(200, json={'total':1,'resultados':[{
                    'cnpj':CNPJ,'razao_social':'CONCEITO BARBER ESTETICA LTDA',
                    'nome_fantasia':'CONCEITO BARBER', 'cidade':'Rio Grande','uf':'RS',
                    'situacao':'Ativa','_links':{'pagina':'https://www.datastone.com.br/consulta/empresa/exemplo'}
                }]})
            if request.url.path.startswith('/consulta/api/v1/empresa/'):
                return httpx.Response(200,json={
                    'cnpj':CNPJ, 'quadro_societario':[{
                        'nome':'MARIA EXEMPLO','localizacao':'Rio Grande',
                        'cpf':'***123456**', 'email':'privado@example.invalid'
                    }], '_links':{'pagina':'https://www.datastone.com.br/consulta/empresa/exemplo'}
                })
            return httpx.Response(404,json={})

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
                            auth_transport=httpx.MockTransport(transport),
                            public_transport=httpx.MockTransport(public_transport),preflight=lambda:None)
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
        self.assertFalse(self.public_calls)
        self.index_installed=False
        result=await self.client.post('/api/garimpo/companies/identify',json=req)
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(result.json()['candidates'][0]['cnpj'],CNPJ)
        self.assertEqual(result.json()['provider'],'Consulta Data Stone (dados abertos da Receita Federal)')
        self.assertFalse(result.json()['identity_confirmed'])
        self.assertTrue(self.public_calls)
        self.public_status=429
        result=await self.client.post('/api/garimpo/companies/identify',json=req)
        self.assertEqual(result.status_code,503)
        self.assertIn('limite',result.json()['detail'])
        self.assertNotIn('candidates',result.json())

    async def test_qsa_public_fallback_omits_private_details(self):
        req=await self.client.get('/api/garimpo/companies/qsa',params={'cnpj':CNPJ})
        self.assertEqual(req.status_code,200,req.text)
        self.assertEqual(req.json()['source'],'Consulta Data Stone (dados abertos da Receita Federal)')
        self.assertEqual(req.json()['people'][0]['partner_name'],'MARIA EXEMPLO')
        self.assertEqual(req.json()['people'][0]['partner_type'],'Não informado')
        self.assertNotIn('cpf',str(req.json()).lower())
        self.assertNotIn('123456',str(req.json()))
        self.assertNotIn('privado@',str(req.json()))

if __name__=='__main__':
    unittest.main()
