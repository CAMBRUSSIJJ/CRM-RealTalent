"""Offline tests at the real engine/CRM boundary, without personal credentials."""
import asyncio
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'garimpo-engine'/'tests'))
from support import Harness, element, GEOCODE
import httpx
from garimpo_v06 import city_and_state, request_for, perform_async, crm_result, ResearchInterrupted
from garimpo_connector import Connector
from garimpo.config import Settings


class Locations(unittest.TestCase):
    def test_explicit_state_is_required_and_state_names_are_supported(self):
        self.assertEqual(city_and_state('Rio Grande, RS'), ('Rio Grande', 'RS'))
        self.assertEqual(city_and_state('Rio Grande / Rio Grande do Sul'), ('Rio Grande', 'RS'))
        self.assertEqual(city_and_state('Canoas RS'), ('Canoas', 'RS'))
        with self.assertRaises(ValueError): city_and_state('Santa Maria')

    def test_available_maps_is_preferred_to_overpass_and_queue_limit_is_honored(self):
        request = request_for({'segment':'barbearias','city':'Rio Grande, RS','limit':100}, Settings(maps_binary=Path('/usr/bin/true')))
        self.assertEqual((request.provider, request.search_mode, request.limit), ('maps','expanded',10))
        self.assertTrue(request.require_phone)
        self.assertFalse(request.qualify)


class Bridge(unittest.IsolatedAsyncioTestCase):
    async def test_actual_engine_exports_published_contacts_and_reuses_completed_job(self):
        h = Harness(provider=lambda request: httpx.Response(200, json=GEOCODE if 'nominatim' in request.url.host else {'elements':[element(name='Barbearia Teste',phone='51999991001',shop='hairdresser')]}))
        try:
            progress = []
            data = {'organizationId':'org','segment':'barbearias','city':'Canoas, RS','limit':1}
            result = await perform_async(data,
                                         settings=h.settings,http=h.http,external_job_id='crm-job',progress=lambda *args:progress.append(args))
            self.assertEqual(result['engineVersion'],'0.6.0')
            self.assertEqual(len(result['leads']),1)
            self.assertTrue(result['leads'][0]['phone'])
            self.assertTrue(result['leads'][0]['aiResearch']['evidence'])
            self.assertFalse(result['leads'][0]['aiResearch']['signals'])
            self.assertEqual(progress[-1],('completed',1))
            from garimpo.network import HTTP
            def unexpected(request): raise AssertionError('A completed CRM job must not query its source again')
            replay = HTTP(h.settings,h.store,provider_transport=httpx.MockTransport(unexpected))
            repeated = await perform_async(data,settings=h.settings,http=replay,external_job_id='crm-job')
            self.assertEqual(repeated['engineJobId'],result['engineJobId'])
        finally:
            h.temporary.cleanup()

    async def test_queue_cancel_stops_collection_without_a_second_complete(self):
        h=Harness()
        try:
            with self.assertRaises(ResearchInterrupted):
                await perform_async({'segment':'barbearias','city':'Canoas, RS'},settings=h.settings,http=h.http,cancelled=lambda:True)
        finally:
            h.temporary.cleanup()

    def test_partial_contacts_and_source_proofs_are_preserved_in_crm_shape(self):
        document={'id':'internal','status':'failed','partial':True,'updated_at':'2026-11-18T00:00:00Z','warnings':[], 'error':'Fonte temporariamente indisponível', 'pending':[{}],
                  'results':[{'company':'Barbearia','phone':'53999991001','city':'Rio Grande','engine':{'version':'0.6.0','providerId':'maps:x','evidence':[{'field':'phone','value':'53999991001','url':'https://maps.google.com/place/example','source':'Google Maps'}]}}]}
        result=crm_result(document)
        self.assertEqual(result['researchStatus'],'partial')
        self.assertEqual(result['leads'][0]['aiResearch']['evidence'][0]['sourceUrl'],'https://maps.google.com/place/example')
        self.assertEqual(result['pendingCount'],1)
        self.assertLess(len(json.dumps(result)),250000)


class Delivery(unittest.TestCase):
    def test_a_blocked_collector_does_not_stop_the_crm_lease_renewal(self):
        import threading
        renewed = threading.Event()
        worker=Connector({'SUPABASE_URL':'https://example.supabase.co','SUPABASE_PUBLISHABLE_KEY':'public',
                          'GARIMPO_CONNECTOR_TOKEN':'a'*64,'GARIMPO_WORKSPACE_ID':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})
        def call(action,**payload):
            if action=='heartbeat':renewed.set()
            return {'accepted':True}
        def collect(*args,**kwargs):
            self.assertTrue(renewed.wait(1),'Heartbeat must continue while the collector is blocked')
            return {'leads':[],'warnings':[]}
        worker.call=call
        with patch('garimpo_connector.LEASE_REFRESH_SECONDS',0.01),patch('garimpo_connector.perform',side_effect=collect):
            self.assertTrue(worker.run_job({'id':'job','leaseId':'lease','input':{'city':'Rio Grande, RS','segment':'barbearias'}}))

    def test_lost_completion_response_is_retried_with_the_same_job_and_lease(self):
        worker=Connector({'SUPABASE_URL':'https://example.supabase.co','SUPABASE_PUBLISHABLE_KEY':'public',
                          'GARIMPO_CONNECTOR_TOKEN':'a'*64,'GARIMPO_WORKSPACE_ID':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})
        attempts=[]
        def call(action,**payload):
            if action=='complete':
                attempts.append(payload)
                if len(attempts)==1: raise TimeoutError()
            return {'accepted':True}
        worker.call=call
        with patch('garimpo_connector.perform',return_value={'leads':[],'warnings':[]}),patch('garimpo_connector.time.sleep'):
            self.assertTrue(worker.run_job({'id':'job','leaseId':'lease','input':{'segment':'barbearia','city':'Rio Grande, RS'}}))
        self.assertEqual(attempts[0],attempts[1])


if __name__=='__main__': unittest.main()
