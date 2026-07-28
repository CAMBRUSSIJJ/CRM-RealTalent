from pathlib import Path
import json, os, time, urllib.request, urllib.parse, urllib.error, uuid, traceback

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version'].removesuffix('.0')
LABEL = 'V' + VERSION.replace('.', '-')
URL = os.environ.get('VITE_SUPABASE_URL', os.environ.get('SUPABASE_URL', '')).rstrip('/')
KEY = os.environ.get('VITE_SUPABASE_PUBLISHABLE_KEY', os.environ.get('SUPABASE_ANON_KEY', ''))
EMAIL_A = os.environ.get('STAGING_TEST_EMAIL_A', '')
PASS_A = os.environ.get('STAGING_TEST_PASSWORD_A', '')
EMAIL_B = os.environ.get('STAGING_TEST_EMAIL_B', '')
PASS_B = os.environ.get('STAGING_TEST_PASSWORD_B', '')
REPORT = ROOT / f'TENANT-ISOLATION-{LABEL}.json'
result = {'passed': False, 'version': VERSION, 'checks': [], 'error': None}

def request(method, endpoint, token=None, body=None, extra=None):
    headers = {'apikey': KEY, 'Content-Type': 'application/json'}
    if token: headers['Authorization'] = f'Bearer {token}'
    if extra: headers.update(extra)
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(URL + endpoint, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read().decode()
            return res.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try: payload = json.loads(raw) if raw else None
        except Exception: payload = raw
        return exc.code, payload

def login(email, password):
    status, data = request('POST', '/auth/v1/token?grant_type=password', body={'email': email, 'password': password})
    if status != 200 or not isinstance(data, dict) or not data.get('access_token'):
        raise RuntimeError(f'Falha no login de {email}: HTTP {status} {data}')
    return data['access_token']

def rest(method, path, token, body=None, return_rep=False):
    headers = {'Accept-Profile': 'public', 'Content-Profile': 'public'}
    if return_rep: headers['Prefer'] = 'return=representation'
    return request(method, '/rest/v1/' + path, token, body, headers)

def add(name, detail): result['checks'].append({'name': name, 'detail': detail})

lead_id = None
try:
    required = [URL, KEY, EMAIL_A, PASS_A, EMAIL_B, PASS_B]
    if not all(required): raise RuntimeError('Defina URL/chave Supabase e as duas contas de teste A/B.')
    token_a, token_b = login(EMAIL_A, PASS_A), login(EMAIL_B, PASS_B)
    status, members_a = rest('GET', 'organization_members?select=organization_id,role&limit=1', token_a)
    status_b, members_b = rest('GET', 'organization_members?select=organization_id,role&limit=1', token_b)
    if status != 200 or not members_a or status_b != 200 or not members_b: raise RuntimeError('As contas precisam pertencer a organizações de homologação.')
    org_a, org_b = members_a[0]['organization_id'], members_b[0]['organization_id']
    if org_a == org_b: raise RuntimeError('As contas A e B devem estar em organizações diferentes.')
    add('Organizações distintas', f'{org_a} != {org_b}')

    status, stages = rest('GET', f'pipeline_stages?select=id&organization_id=eq.{org_a}&order=stage_order.asc&limit=1', token_a)
    if status != 200 or not stages: raise RuntimeError('Organização A não possui etapa de pipeline.')
    external = f'V10041-RLS-{uuid.uuid4()}'
    status, inserted = rest('POST', 'leads', token_a, {'organization_id': org_a, 'stage_id': stages[0]['id'], 'name': external, 'company': 'Homologação RLS', 'notes': 'original'}, True)
    if status not in (200, 201) or not inserted: raise RuntimeError(f'Conta A não conseguiu criar lead de teste: {status} {inserted}')
    lead_id = inserted[0]['id']
    add('Escrita autorizada A', lead_id)

    status, foreign_org = rest('GET', f'organizations?select=id&id=eq.{org_a}', token_b)
    if status != 200 or foreign_org != []: raise AssertionError(f'B visualizou organização A: {status} {foreign_org}')
    add('Organização isolada', 'B não visualiza A')

    status, foreign_lead = rest('GET', f'leads?select=id,notes&id=eq.{lead_id}', token_b)
    if status != 200 or foreign_lead != []: raise AssertionError(f'B visualizou lead A: {status} {foreign_lead}')
    add('Lead isolado', 'B não visualiza lead A')

    status, patched = rest('PATCH', f'leads?id=eq.{lead_id}', token_b, {'notes': 'tentativa indevida'}, True)
    if status not in (200, 204, 401, 403) or (isinstance(patched, list) and patched):
        raise AssertionError(f'B alterou lead A: {status} {patched}')
    status, verify = rest('GET', f'leads?select=id,notes&id=eq.{lead_id}', token_a)
    if status != 200 or not verify or verify[0]['notes'] != 'original': raise AssertionError(f'Lead A foi alterado por B: {verify}')
    add('Atualização cruzada bloqueada', 'conteúdo original preservado')

    status, deleted = rest('DELETE', f'leads?id=eq.{lead_id}', token_a, None, True)
    if status not in (200, 204): raise RuntimeError(f'Falha na limpeza: {status} {deleted}')
    lead_id = None
    result['passed'] = True
except Exception as exc:
    result['error'] = repr(exc) + '\n' + traceback.format_exc()
finally:
    if lead_id:
        try: rest('DELETE', f'leads?id=eq.{lead_id}', token_a, None, True)
        except Exception: pass

REPORT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(json.dumps(result, indent=2, ensure_ascii=False))
if not result['passed']: raise SystemExit(1)
