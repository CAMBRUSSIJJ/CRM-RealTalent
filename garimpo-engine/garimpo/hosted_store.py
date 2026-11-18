"""Durable jobs in Supabase; public-source caches remain disposable per container."""
import hashlib
import json
from uuid import uuid4

import httpx

from .models import SearchRequest, now
from .store import IdempotencyConflict, LeaseLost, QueueFull, Store


class RemoteStore:
    def __init__(self, client: httpx.Client, organization_id: str, cache: Store):
        self.client, self.organization_id, self.cache = client, organization_id, cache

    def operation(self, action, job_id=None, **kwargs):
        response = self.client.post('/rest/v1/rpc/garimpo_hosted_operation', json={
            'p_org': self.organization_id, 'p_action': action, 'p_job': job_id, **kwargs})
        if response.is_error:
            message = response.text
            for code, error in [('lease_lost', LeaseLost), ('queue_full', QueueFull), ('idempotency_conflict', IdempotencyConflict)]:
                if code in message:
                    raise error(code)
            # Never include responses containing auth tokens or raw data in the browser error.
            raise RuntimeError('Não foi possível persistir a pesquisa. Tente novamente; o checkpoint foi preservado.')
        return response.json()

    def create(self, request: SearchRequest, *, idempotency_key=None, seed_checkpoint=None,
               parent_job_id=None, queue_limit=20):
        payload = request.model_dump()
        job = {'id': str(uuid4()), 'status': 'queued', 'phase': 'queued', 'request': payload,
               'created_at': now(), 'updated_at': now(), 'warnings': [], 'error': None, 'partial': False,
               'processed': 0, 'discovered': 0, 'results': [], 'candidates': [], 'done_ids': [], 'discovery_completed': False}
        if seed_checkpoint:
            for field in ('candidates', 'done_ids', 'pending_enrichment_ids', 'discovery_state'):
                job[field] = json.loads(json.dumps(seed_checkpoint.get(field, {} if field == 'discovery_state' else [])))
            job['parent_job_id'] = parent_job_id
        return self.operation('create', job['id'], p_document=job, p_key=idempotency_key,
                              p_hash=hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest())

    def get(self, job_id):
        return self.operation('get', job_id)

    def list(self):
        return self.operation('list')

    def claim(self, owner, job_id=None):
        if job_id is None:
            raise ValueError('Hosted execution must claim an explicit organization-scoped job.')
        return self.operation('claim', job_id, p_owner=owner)

    def save(self, document, owner):
        document['updated_at'] = now()
        self.operation('save', document['id'], p_owner=owner, p_document=document)

    def heartbeat(self, job_id, owner):
        self.operation('heartbeat', job_id, p_owner=owner)

    def cancel(self, job_id):
        return self.operation('cancel', job_id)

    def release(self, job_id, owner):
        self.operation('release', job_id, p_owner=owner)

    def cache_get(self, key):
        return self.cache.cache_get(key)

    def cache_put(self, key, value, ttl):
        return self.cache.cache_put(key, value, ttl)
