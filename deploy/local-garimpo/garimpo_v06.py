"""Run the tested discovery engine in-process and adapt facts to the CRM queue."""
from __future__ import annotations

import asyncio
from contextlib import suppress
from dataclasses import replace
import hashlib
import re
from typing import Callable

from garimpo.config import Settings
from garimpo.engine import Engine
from garimpo.models import SearchRequest
from garimpo.network import HTTP
from garimpo.store import Store, public_job

FIELDS = ('company', 'phone', 'email', 'city', 'address', 'cnpj', 'instagram', 'website', 'bookingUrl', 'systemName', 'whatsappUrl')
STATES = {
    'acre':'AC','alagoas':'AL','amapa':'AP','amazonas':'AM','bahia':'BA','ceara':'CE','distrito federal':'DF',
    'espirito santo':'ES','goias':'GO','maranhao':'MA','mato grosso':'MT','mato grosso do sul':'MS',
    'minas gerais':'MG','para':'PA','paraiba':'PB','parana':'PR','pernambuco':'PE','piaui':'PI',
    'rio de janeiro':'RJ','rio grande do norte':'RN','rio grande do sul':'RS','rondonia':'RO','roraima':'RR',
    'santa catarina':'SC','sao paulo':'SP','sergipe':'SE','tocantins':'TO',
}


class ResearchInterrupted(RuntimeError):
    pass


def city_and_state(value: str) -> tuple[str, str]:
    from garimpo.models import normalized
    parts = re.split(r'\s*[,/|]\s*|\s+-\s+', value.strip())
    if len(parts) >= 2:
        state = parts[-1].upper()
        state = state if state in STATES.values() else STATES.get(normalized(parts[-1]), '')
        if state and parts[0].strip():
            return parts[0].strip(), state
    suffix = re.match(r'^(.+?)\s+([A-Za-z]{2})$', value.strip())
    if suffix and suffix[2].upper() in STATES.values():
        return suffix[1].strip(), suffix[2].upper()
    raise ValueError('Informe cidade e UF, por exemplo: Rio Grande, RS.')


def request_for(data: dict, settings: Settings) -> SearchRequest:
    city, state = city_and_state(str(data.get('city') or ''))
    provider = 'maps' if settings.maps_binary and settings.maps_binary.is_file() else 'osm'
    # The existing CRM queue accepts at most ten records; the engine itself supports 100.
    return SearchRequest(segment=data.get('segment', ''), city=city, state=state, provider=provider,
                         limit=min(10, max(1, int(data.get('limit') or 5))), search_mode='expanded',
                         require_phone=True, enrich_websites=True, qualify=False)


def crm_result(document: dict, expected_company: str | None = None) -> dict:
    leads = []
    from garimpo.models import normalized
    for item in document.get('results', [])[:10]:
        if expected_company and set(normalized(item.get('company','')).split()) != set(normalized(expected_company).split()):
            continue
        facts = {field: str(item.get(field) or '') for field in FIELDS}
        original_metadata = item.get('engine', {})
        metadata = {key: value for key, value in original_metadata.items() if key in {
            'version','providerId','qualityScore','relevanceScore','relevanceReasons','locationStatus',
            'partialSearch','collectionStatus','jobId','listing',
        }}
        evidence, sources, seen = [], [], set()
        for fact in original_metadata.get('evidence', []):
            field, url = fact.get('field'), fact.get('url', '')
            if len(evidence) >= 24:
                break
            if field in FIELDS and facts[field] and len(url) <= 2048 and url.startswith(('http://', 'https://')):
                evidence.append({'field': field, 'value': str(fact.get('value') or facts[field]), 'sourceUrl': url})
                if url not in seen and len(sources) < 12:
                    sources.append({'url': url, 'title': str(fact.get('source') or facts['company'])[:160]})
                    seen.add(url)
        if not sources:
            continue
        leads.append({**facts, 'engine': metadata,
                      'aiResearch': {'evidence': evidence, 'sources': sources, 'opportunity': '', 'suggestedApproach': '',
                                     'missingFields': [field for field, value in facts.items() if not value],
                                     'researchedAt': document.get('updated_at'), 'signals': []}})
    warnings = list(document.get('warnings', []))
    if expected_company and not leads:
        warnings.append('Nenhum registro confirmou o nome da empresa solicitada; contatos de outras empresas não foram aplicados.')
    if document.get('error'):
        warnings.append(str(document['error']))
    partial = document.get('partial', False) or document.get('status') == 'failed'
    if partial:
        warnings.append('Pesquisa parcial: os contatos com fontes já encontrados foram preservados.')
    if document.get('pending'):
        warnings.append(f"{len(document['pending'])} empresa(s) sem o telefone exigido ficaram pendentes no motor.")
    warnings.append('Contatos publicados nas fontes. Revise os dados antes de transferir ao CRM.')
    return {'leads': leads, 'warnings': list(dict.fromkeys(warnings)), 'researchedAt': document.get('updated_at'),
            'researchMode': 'essential', 'researchStatus': 'partial' if partial else 'completed',
            'extractionEngine': 'python', 'engineVersion': '0.6.0', 'engineJobId': document['id'],
            'metrics': document.get('metrics', {}), 'pendingCount': len(document.get('pending', []))}


async def perform_async(data: dict, progress: Callable | None = None, *, settings: Settings | None = None,
                        http: HTTP | None = None, external_job_id: str = '', cancelled: Callable | None = None) -> dict:
    settings = settings or Settings.from_env()
    settings = replace(settings, job_timeout=min(480, settings.job_timeout))
    request = request_for(data, settings)
    expected_company = str(data.get('segment') or '') if data.get('prospectId') or str(data.get('query') or '').startswith('Somente esta empresa:') else None
    store = http.store if http else Store(settings.db_path)
    http = http or HTTP(settings, store)
    engine = Engine(http, store)
    identity = external_job_id or str(__import__('uuid').uuid4())
    scope = str(data.get('organizationId') or '')
    key = hashlib.sha256(('crm-v06:' + scope + ':' + identity).encode()).hexdigest()
    document = store.create(request, idempotency_key=key)
    if document['status'] == 'completed':
        await http.close()
        return crm_result(document, expected_company)
    owner = 'crm-v06-' + identity
    task = None
    try:
        # A process that died may leave a short local lease. CRM progress keeps its own lease alive.
        for _ in range(50):
            if cancelled and cancelled():
                store.cancel(document['id'])
                raise ResearchInterrupted('Pesquisa cancelada pelo CRM.')
            claimed = store.claim(owner, document['id'])
            if claimed:
                document = claimed
                break
            current = store.get(document['id'])
            if current and current['status'] == 'completed':
                return crm_result(current, expected_company)
            if current and current['status'] in ('failed', 'cancelled'):
                resume_key = hashlib.sha256((key + ':resume:' + current['id']).encode()).hexdigest()
                document = store.create(request, idempotency_key=resume_key, seed_checkpoint=current, parent_job_id=current['id'])
            else:
                await asyncio.sleep(1)
        else:
            raise ResearchInterrupted('A pesquisa anterior ainda está reservada. Tente novamente após um minuto.')
        task = asyncio.create_task(engine.execute(document, owner))
        while not task.done():
            if cancelled and cancelled():
                store.cancel(document['id'])
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
                raise ResearchInterrupted('Pesquisa cancelada pelo CRM.')
            current = store.get(document['id']) or document
            if progress:
                stage = 'facts' if current.get('results') else 'discover'
                await asyncio.to_thread(progress, stage, len(current.get('results', [])))
            await asyncio.sleep(1)
        await task
        current = public_job(store.get(document['id']) or document)
        if current['status'] == 'failed' and not current.get('results'):
            raise ResearchInterrupted(str(current.get('error') or 'A fonte não concluiu a pesquisa.'))
        result = crm_result(current, expected_company)
        if progress:
            await asyncio.to_thread(progress, 'completed', len(result['leads']))
        return result
    finally:
        if task and not task.done():
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
        await http.close()


def perform(data: dict, progress: Callable | None = None, **kwargs) -> dict:
    return asyncio.run(perform_async(data, progress, **kwargs))
