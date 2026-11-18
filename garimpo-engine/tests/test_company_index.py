"""Contract tests for the RS official-data pilot (no network and no live Supabase)."""
import asyncio
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

from garimpo.company_index_import import normal, process_establishment, prepare
from garimpo.config import Settings
from garimpo.hosted import create_app

ORG = '00000000-0000-4000-8000-000000000001'
USER = '00000000-0000-4000-8000-000000000003'


def zipped_csv(path, records):
    buffer = io.StringIO(newline='')
    writer = csv.writer(buffer, delimiter=';', quoting=csv.QUOTE_ALL)
    writer.writerows(records)
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('K3241.K03200D0', buffer.getvalue().encode('latin-1'))


def establishment(*, root='12345678', uf='RS', city='8801', main='9602501',
                  second='8513900', active='02'):
    row = [''] * 30
    row[0], row[1], row[2], row[3] = root, '0001', '95', '1'
    row[4], row[5], row[10] = 'Academia; Sul', active, '20240601'
    row[11], row[12] = main, second
    row[19], row[20] = uf, city
    # Contact data must not be exported to the indexed business table.
    row[21], row[22], row[28] = '53', '999999999', 'pessoal@example.test'
    return row


class CompanyIndexImportTests(unittest.TestCase):
    def test_normalization_and_secondary_cnae(self):
        self.assertEqual(normal('Educação & Serviços LTDA'), 'educacao servicos ltda')
        item = process_establishment(establishment(), {'8801':'RIO GRANDE'}, cnae_prefix='85')
        self.assertEqual(item[0], '12345678000195')
        self.assertEqual(item[8], '{8513900}')
        self.assertEqual(item[5], 'RIO GRANDE')
        self.assertIsNone(process_establishment(establishment(uf='SC'), {'8801':'RIO GRANDE'}))
        self.assertIsNone(process_establishment(establishment(active='08'), {'8801':'RIO GRANDE'}))
        self.assertIsNone(process_establishment(establishment(), {'8801':'RIO GRANDE'}, cnae_prefix='47'))

    def test_streaming_join_minimization_and_partial_flag(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            est, ent, mun, dest = (folder / n for n in
                ('Estabelecimentos0.zip','Empresas0.zip','Municipios.zip','rs.csv'))
            zipped_csv(est, [establishment(), establishment(root='87654321', uf='SC')])
            zipped_csv(ent, [['12345678','EMPRESA TESTE LTDA','2062','49','1000','01',''],
                             ['87654321','OUTRA EMPRESA','2062','49','1000','01','']])
            zipped_csv(mun, [['8801','RIO GRANDE'],['8105','PORTO ALEGRE']])
            result = prepare(establishments=[est], companies=[ent], municipalities=[mun],
                month='2026-10', output=dest, cnae_prefix='85', max_records=1)
            self.assertEqual(result['exported'], 1)
            self.assertTrue(result['partial_sample'])
            with dest.open(encoding='utf-8',newline='') as stream:
                rows = list(csv.DictReader(stream))
            self.assertEqual(rows[0]['trade_name'], 'Academia; Sul')
            self.assertEqual(rows[0]['legal_name'], 'EMPRESA TESTE LTDA')
            self.assertEqual(rows[0]['secondary_cnaes'], '{8513900}')
            self.assertEqual(rows[0]['source_month'], '2026-10-01')
            self.assertNotIn('phone', rows[0])
            self.assertNotIn('email', rows[0])

    def test_rejects_unknown_municipality_and_invalid_month(self):
        self.assertIsNone(process_establishment(establishment(city='9999'), {'8801':'RIO GRANDE'}))
        with self.assertRaisesRegex(ValueError,'--month'):
            prepare(establishments=[], companies=[], municipalities=[], month='2026-99',
                    output='ignore.csv')


class HostedCompanyIndexTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {
          'SUPABASE_URL':'https://database.test',
          'SUPABASE_PUBLISHABLE_KEY':'public-test-key'})
        self.env.start()
        self.requests = []
        def transport(request):
            if request.headers.get('authorization') != 'Bearer valid-test-session-token':
                return httpx.Response(401,json={})
            if request.url.path == '/auth/v1/user':
                return httpx.Response(200,json={'id':USER})
            if request.url.path == '/rest/v1/organization_members':
                allowed = request.url.params.get('organization_id') == 'eq.' + ORG
                return httpx.Response(200,json=[{'role':'viewer'}] if allowed else [])
            if request.url.path == '/rest/v1/rpc/realtalent_company_index_search':
                self.requests.append(json.loads(request.content))
                return httpx.Response(200,json={
                    'items':[{'cnpj':'12345678000195','city':'RIO GRANDE','main_cnae':'8513900'}],
                    'has_more':False,'offset':0,'limit':30})
            return httpx.Response(404,json={})
        self.app = create_app(Settings(db_path=Path(self.tmp.name)/'cache.sqlite3',maps_binary=Path(__file__)),
              auth_transport=httpx.MockTransport(transport),preflight=lambda:None)
        self.client = httpx.AsyncClient(
          transport=httpx.ASGITransport(app=self.app),base_url='http://test',
          headers={'Authorization':'Bearer valid-test-session-token','X-Workspace-Id':ORG})

    async def asyncTearDown(self):
        await self.client.aclose()
        self.env.stop()
        self.tmp.cleanup()

    async def test_authenticated_index_query_and_filters(self):
        result = await self.client.get('/api/garimpo/index',
                 params={'city':'Rio Grande','cnae':'85','name':'Educação'})
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json()['items'][0]['cnpj'],'12345678000195')
        self.assertEqual(self.requests[-1]['p_city'],'rio grande')
        self.assertEqual(self.requests[-1]['p_name'],'educacao')
        self.assertEqual(self.requests[-1]['p_org'],ORG)
        self.assertEqual(self.requests[-1]['p_cnae'],'85')

    async def test_index_requires_workspace_and_valid_filters(self):
        self.assertEqual((await self.client.get('/api/garimpo/index',headers={
            'X-Workspace-Id':'00000000-0000-4000-8000-000000000002'})).status_code,403)
        self.assertEqual((await self.client.get('/api/garimpo/index',params={'state':'SP'})).status_code,422)
        self.assertEqual((await self.client.get('/api/garimpo/index',params={'cnae':'abc'})).status_code,422)
        self.assertEqual((await self.client.get('/api/garimpo/index',params={'limit':500})).status_code,422)
        self.assertEqual((await self.client.get('/api/garimpo/index',headers={
            'Authorization':'Bearer invalid-test-session-token'})).status_code,401)
        self.assertEqual(len(self.requests),0)


if __name__ == '__main__':
    unittest.main()
