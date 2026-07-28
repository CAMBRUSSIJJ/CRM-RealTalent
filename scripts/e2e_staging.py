from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os, traceback

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version'].removesuffix('.0')
LABEL = 'V' + VERSION.replace('.', '-')
BASE_URL = os.environ.get('STAGING_URL', '').rstrip('/')
EMAIL = os.environ.get('STAGING_TEST_EMAIL', '')
PASSWORD = os.environ.get('STAGING_TEST_PASSWORD', '')
RESULT_DIR = ROOT / 'test-results'
RESULT_DIR.mkdir(exist_ok=True)
REPORT_PATH = ROOT / f'E2E-STAGING-{LABEL}.json'
results = {'passed': False, 'version': VERSION, 'baseUrl': BASE_URL, 'checks': [], 'consoleErrors': [], 'pageErrors': [], 'error': None}

def check(name, condition, detail=''):
    if not condition:
        raise AssertionError(f'{name}: {detail}')
    results['checks'].append({'name': name, 'detail': detail})

def open_and_login(page):
    page.goto(BASE_URL, wait_until='networkidle')
    check('Título da release', f'V{VERSION}' in page.title(), page.title())
    page.get_by_role('heading', name='Entrar no CRM').wait_for()
    page.get_by_label('E-mail').fill(EMAIL)
    page.get_by_label('Senha').fill(PASSWORD)
    page.get_by_role('button', name='Entrar', exact=True).click()
    page.get_by_role('heading', name='Meu Dia').wait_for(timeout=30000)
    check('Login de homologação', True, EMAIL)

def open_sidebar(page, label, heading=None):
    page.locator('.sidebar__item', has_text=label).click()
    if heading:
        page.get_by_role('heading', name=heading).wait_for()
    page.wait_for_timeout(350)
    check(f'Navegação {label}', page.locator('body').evaluate('el => el.scrollWidth <= innerWidth + 3'), 'sem overflow')

try:
    if not BASE_URL or not EMAIL or not PASSWORD:
        raise RuntimeError('Defina STAGING_URL, STAGING_TEST_EMAIL e STAGING_TEST_PASSWORD.')
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        page.set_default_timeout(20000)
        page.on('console', lambda m: results['consoleErrors'].append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: results['pageErrors'].append(str(e)))
        open_and_login(page)
        open_sidebar(page, 'Leads', 'Leads')
        check('Tabela de Leads', page.locator('.leads-table, .lead-card').count() >= 1, 'view comercial renderizada')
        open_sidebar(page, 'Pipeline', 'Pipeline')
        check('Pipeline renderizado', page.locator('.pipeline-board, .kanban-board, [data-testid="pipeline-board"]').count() >= 1 or page.get_by_text('Novo lead').count() >= 1, 'etapas disponíveis')
        open_sidebar(page, 'Automação', 'Automação')
        open_sidebar(page, 'Configurações', 'Configurações')
        page.get_by_role('button', name='Integrações').click()
        page.locator('#rt-v10039-framework').wait_for()
        page.locator('#rt-v10040-extension-center').wait_for()
        check('Framework de Integrações', True, 'painel disponível')
        check('Central de Extensões', True, 'painel disponível')
        check('Sem erros de página', not results['pageErrors'], '; '.join(results['pageErrors']))
        relevant = [e for e in results['consoleErrors'] if 'favicon' not in e.lower() and 'failed to load resource' not in e.lower()]
        results['consoleErrors'] = relevant
        check('Sem erros de console', not relevant, '; '.join(relevant))

        mobile = browser.new_page(viewport={'width': 390, 'height': 844})
        mobile.set_default_timeout(20000)
        open_and_login(mobile)
        check('Responsividade móvel', mobile.locator('body').evaluate('el => el.scrollWidth <= innerWidth + 3'), '390x844')
        results['passed'] = True
        browser.close()
except Exception as exc:
    results['error'] = repr(exc) + '\n' + traceback.format_exc()
    try:
        page.screenshot(path=str(RESULT_DIR / f'e2e-failure-{LABEL}.png'), full_page=True)
    except Exception:
        pass

REPORT_PATH.write_text(json.dumps(results, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(json.dumps(results, indent=2, ensure_ascii=False))
if not results['passed']:
    raise SystemExit(1)
