"""Offline tests for minimal QSA import and authenticated exact-CNPJ API."""
import csv
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import httpx

from garimpo.qsa_import import parse_qsa, prepare_qsa
from garimpo.hosted import create_app
from garimpo.config import Settings

ORG='00000000-0000-4000-8000-000000000001'
OTHER='00000000-0000-4000-8000-000000000002'
USER='00000000-0000-4000-8000-000000000003'
CNPJ='11222333000181'


def zipped(path, rows):
    buffer=io.StringIO(newline='')
    csv.writer(buffer,delimiter=';',quoting=csv.QUOTE_ALL).writerows(rows)
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('K3241.K03200D0',buffer.getvalue().encode('latin-1'))


def partner(root='11222333',person_type='2',name='MARIA DA SILVA',role='49',
            joined='20240102',private_doc='***123456**'):
    return [root,person_type,name,private_doc,role,joined,'105', '***999999**',
            'REPRESENTANTE PRIVADO','05','5']


class QsaImporterTests(unittest.TestCase):
    def test_minimum_fields_privacy_and_role_mapping(self):
        p=parse_qsa(partner(),{'49':'Sócio-Administrador'})
        self.assertEqual(p[0],'11222333')
        self.assertEqual(p[2],'MARIA DA SILVA')
        self.assertEqual(p[3],'Pessoa física')
        self.assertEqual(p[5],'Sócio-Administrador')
        self.assertEqual(p[6],'2024-01-02')
        self.assertNotIn('123456',str(p))
        self.assertNotIn('999999',str(p))
        self.assertNotIn('REPRESENTANTE PRIVADO',str(p))
        self.assertIsNone(parse_qsa(partner(person_type='6'),{}))
        self.assertIsNone(parse_qsa(partner(name='***'),{}))
        self.assertEqual(parse_qsa(partner(role='99'),{})[5],'Qualificação 99')

    def test_selects_only_registered_roots_and_same_month(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            selected=folder/'index.csv'
            with selected.open('w',encoding='utf-8',newline='') as stream:
                writer=csv.DictWriter(stream,fieldnames=['cnpj','source_month'])
                writer.writeheader()
                writer.writerow({'cnpj':CNPJ,'source_month':'2026-10-01'})
                writer.writerow({'cnpj':'11222333000262','source_month':'2026-10-01'})
            socios,quals,destination=(folder/n for n in ['Socios0.zip','Qualificacoes.zip','qsa.csv'])
            zipped(socios,[partner(),partner(),partner(root='87654321'),
                           partner(person_type='1',name='SÓCIA EMPRESARIAL',role='22'),
                           partner(name='')])
            zipped(quals,[['49','Sócio-Administrador'],['22','Sócio']])
            report=prepare_qsa(company_csv=selected,socios=[socios],qualificacoes=[quals],
                               month='2026-10',output=destination)
            self.assertEqual(report['selected_company_roots'],1)
            self.assertEqual(report['exported_people'],2)
            self.assertEqual(report['scanned_qsa_rows'],5)
            rows=list(csv.DictReader(destination.open(encoding='utf-8',newline='')))
            self.assertEqual({x['partner_name'] for x in rows},{'MARIA DA SILVA','SÓCIA EMPRESARIAL'})
            self.assertTrue(all(x['cnpj_basic']=='11222333' for x in rows))
            self.assertTrue(all(x['source_month']=='2026-10-01' for x in rows))
            content=destination.read_text()
            for secret in ['123456','999999','REPRESENTANTE PRIVADO','age','cpf']:
                self.assertNotIn(secret,content.lower())
            with selected.open('w',encoding='utf-8',newline='') as f:
                f.write('cnpj,source_month\n'+CNPJ+',2026-09-01\n')
            with self.assertRaisesRegex(ValueError,'mês do QSA'):
                prepare_qsa(company_csv=selected,socios=[socios],qualificacoes=[quals],
                            month='2026-10',output=folder/'reject.csv')


class QsaApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{
            'SUPABASE_URL':'https://database.test','SUPABASE_PUBLISHABLE_KEY':'public-test-key'})
        self.env.start()
        self.role='member'
        self.calls=[]
        def transport(request):
            if request.headers.get('authorization')!='Bearer valid-test-session-token':
                return httpx.Response(401,json={})
            if request.url.path=='/auth/v1/user':
                return httpx.Response(200,json={'id':USER})
            if request.url.path=='/rest/v1/organization_members':
                allowed=request.url.params.get('organization_id')=='eq.'+ORG
                return httpx.Response(200,json=[{'role':self.role}] if allowed else [])
            if request.url.path=='/rest/v1/rpc/realtalent_qsa_list':
                self.calls.append(('qsa',json.loads(request.content)))
                return httpx.Response(200,json={
                    'people':[{'partner_name':'MARIA DA SILVA','partner_type':'Pessoa física',
                               'role_code':'49','role_label':'Sócia-administradora',
                               'joined_on':'2024-01-02','source_month':'2026-10-01',
                               'source_url':'https://www.gov.br/receitafederal/dados',
                               'cpf':'***123456**','age':'45'}],
                    'source':'Receita Federal / QSA','company_cnpj':CNPJ,
                    'has_records':True,'truncated':False})
            if request.url.path=='/rest/v1/rpc/realtalent_company_index_search_with_qsa':
                self.calls.append(('index',json.loads(request.content)))
                return httpx.Response(200,json={'items':[],'limit':30,'offset':0,'has_more':False})
            if request.url.path=='/rest/v1/rpc/realtalent_company_index_search':
                self.calls.append(('original_index',json.loads(request.content)))
                return httpx.Response(200,json={'items':[],'limit':30,'offset':0,'has_more':False})
            return httpx.Response(404,json={})
        self.app=create_app(Settings(db_path=Path(self.tmp.name)/'cache.sqlite3',maps_binary=Path(__file__)),
                            auth_transport=httpx.MockTransport(transport),preflight=lambda:None)
        self.client=httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app),base_url='http://test',
            headers={'Authorization':'Bearer valid-test-session-token','X-Workspace-Id':ORG})

    async def asyncTearDown(self):
        await self.client.aclose()
        self.env.stop()
        self.tmp.cleanup()

    async def test_single_company_lookup_authorized_and_redacted(self):
        r=await self.client.get('/api/garimpo/companies/qsa',params={'cnpj':CNPJ})
        self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(self.calls[-1][1]['p_org'],ORG)
        self.assertEqual(self.calls[-1][1]['p_cnpj'],CNPJ)
        self.assertEqual(r.json()['people'][0]['partner_name'],'MARIA DA SILVA')
        self.assertNotIn('cpf',json.dumps(r.json()).lower())
        self.assertNotIn('age',json.dumps(r.json()).lower())
        self.assertNotIn('123456',json.dumps(r.json()))
        self.assertNotIn('999999',json.dumps(r.json()))
        self.assertEqual((await self.client.get('/api/garimpo/companies/qsa',
            params={'cnpj':'123'})).status_code,422)

    async def test_no_viewer_access_or_workspace_bypass(self):
        self.role='viewer'
        r=await self.client.get('/api/garimpo/companies/qsa',params={'cnpj':CNPJ})
        self.assertEqual(r.status_code,403)
        self.role='member'
        r=await self.client.get('/api/garimpo/companies/qsa',
            params={'cnpj':CNPJ},headers={'X-Workspace-Id':OTHER})
        self.assertEqual(r.status_code,403)
        self.assertFalse(self.calls)

    async def test_qsa_filter_only_changes_opted_in_queries(self):
        r=await self.client.get('/api/garimpo/index',params={'city':'Rio Grande'})
        self.assertEqual(r.status_code,200)
        self.assertEqual(self.calls[-1][0],'original_index')
        r=await self.client.get('/api/garimpo/index',params={'city':'Rio Grande','has_qsa':'true'})
        self.assertEqual(r.status_code,200)
        self.assertEqual(self.calls[-1][0],'index')
        self.assertEqual(self.calls[-1][1]['p_has_qsa'],True)
        self.role='viewer'
        self.assertEqual((await self.client.get('/api/garimpo/index',
            params={'has_qsa':'true'})).status_code,403)

if __name__=='__main__':
    unittest.main()
