from pathlib import Path
from playwright.sync_api import sync_playwright
import json, traceback
ROOT=Path(__file__).resolve().parents[1]
pkg=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))
version=pkg['version'].removesuffix('.0'); label='V'+version.replace('.','-')
standalone=ROOT/f'REALTALENT-CRM-{label}-standalone.html'
if not standalone.exists(): standalone=ROOT/f'REALTALENT-CRM-{label}.html'
html=standalone.read_text(encoding='utf-8')
results={'passed':False,'version':version,'checks':[],'console_errors':[],'page_errors':[],'error':None}
shim="""() => { const store={}; const local={getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k],clear:()=>Object.keys(store).forEach(k=>delete store[k]),key:i=>Object.keys(store)[i]||null,get length(){return Object.keys(store).length}};Object.defineProperty(window,'localStorage',{value:local,configurable:true});}"""
def onboard(page):
 page.evaluate(shim); page.set_content(html,wait_until='load'); page.get_by_role('heading',name='Como você quer começar?').wait_for()
 page.get_by_label('Seu nome').fill('Homologação V100.45'); page.get_by_label('Nome da empresa').fill('RealTalent Homologação'); page.get_by_role('button',name='Entrar no CRM').evaluate('el => el.click()'); page.get_by_role('heading',name='Meu Dia').wait_for(); page.wait_for_timeout(700)
def no_overflow(page,label): assert page.locator('body').evaluate('el=>el.scrollWidth<=innerWidth+3'),f'overflow em {label}'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1440,'height':1000}); page.set_default_timeout(25000)
  page.on('console',lambda m:results['console_errors'].append(m.text) if m.type=='error' else None); page.on('pageerror',lambda e:results['page_errors'].append(str(e)))
  onboard(page)
  assert f'V{version}' in page.title(); results['checks'].append('Release correta no standalone')
  for label,heading in [('Leads','Leads'),('Pipeline','Pipeline'),('Automação','Automação'),('Configurações','Configurações')]:
   page.locator('.sidebar__item',has_text=label).click(); page.get_by_role('heading',name=heading).wait_for(); no_overflow(page,label)
  page.get_by_role('button',name='Integrações').click(); page.locator('#rt-v10039-framework').wait_for(); page.locator('#rt-v10040-extension-center').wait_for()
  results['checks'].append('Framework e Central de Extensões preservados')
  mobile=browser.new_page(viewport={'width':390,'height':844}); onboard(mobile); no_overflow(mobile,'mobile'); results['checks'].append('Responsividade móvel')
  errors=[e for e in results['console_errors'] if 'favicon' not in e.lower() and 'failed to load resource' not in e.lower()]
  results['console_errors']=errors
  if errors or results['page_errors']: raise AssertionError(f'console={errors}; page={results["page_errors"]}')
  results['passed']=True; browser.close()
except Exception as exc:
 results['error']=repr(exc)+'\n'+traceback.format_exc()
(ROOT/f'TESTE-SMOKE-{label}.json').write_text(json.dumps(results,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(results,indent=2,ensure_ascii=False))
if not results['passed']: raise SystemExit(1)
