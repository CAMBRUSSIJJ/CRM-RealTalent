#!/usr/bin/env python3
import argparse
import base64
import json
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
BUNDLE = ROOT.parent
CRM = BUNDLE / 'RealTalent-CRM-V101.11.3-CR10-H1-Agent-V2.7-Linux-Launcher'

class OllamaFixtureHandler(BaseHTTPRequestHandler):
    server_version = 'RealTalentOllamaFixture/2.5'
    def log_message(self, *_args):
        return
    def _read(self):
        n = int(self.headers.get('content-length', '0') or '0')
        raw = self.rfile.read(n) if n else b'{}'
        try: return json.loads(raw.decode('utf-8'))
        except Exception: return {}
    def _json(self, obj, status=200, content_type='application/json'):
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status); self.send_header('content-type', content_type); self.send_header('content-length', str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        if self.path == '/api/tags':
            return self._json({'models':[{'name':'qwen3:4b'},{'name':'qwen2.5-coder:3b'},{'name':'gemma3:4b'},{'name':'nomic-embed-text'}]})
        return self._json({'error':'not found'},404)
    def do_POST(self):
        body = self._read()
        if self.path == '/api/embed':
            raw_input = body.get('input')
            items = raw_input if isinstance(raw_input, list) else [raw_input or '']
            embeddings=[]
            for item in items:
                text=str(item or '')
                # Deterministic fixture vector; enough to exercise the embedding contract quickly.
                vec=[0.0]*16
                for i,ch in enumerate(text.lower().encode('utf-8')):
                    vec[(i + ch) % len(vec)] += ((ch % 17) + 1) / 17.0
                norm=sum(v*v for v in vec) ** 0.5 or 1.0
                embeddings.append([v/norm for v in vec])
            return self._json({'model':body.get('model') or 'nomic-embed-text','embeddings':embeddings})
        if self.path == '/api/generate':
            return self._json({'response':'','done':True})
        if self.path != '/api/chat':
            return self._json({'error':'not found'},404)
        messages = body.get('messages') or []
        last = messages[-1] if messages else {}
        raw = str(last.get('content') or '')
        low = raw.lower()
        has_images = bool(last.get('images'))
        props = (body.get('format') or {}).get('properties') or {}
        if 'findings' in props:
            perception = {'summary':'Imagem recebida e inspecionada pela fixture visual.','images':[{'image_id':'image_1','summary':'Imagem anexada','scene_type':'ui_screenshot','quality':'clear'}],'findings':[{'image_id':'image_1','category':'visual','severity':'info','description':'O anexo atual está disponível para análise visual.','evidence':'pixels recebidos no Perception Pass','confidence':0.99,'region':{'x':0.0,'y':0.0,'w':1.0,'h':1.0}}],'visibleText':[],'uncertainties':[],'comparison':{'applicable':False,'summary':'','differences':[]}}
            return self._json({'message':{'content':json.dumps(perception,ensure_ascii=False)},'done':True,'created_at':'fixture-v2.5-vision'})
        if has_images:
            answer = 'Analisei o anexo atual. A imagem participou da intenção deste turno e não foi tratada como saudação.'
        elif 'multimodal' in low and ('image_1' in low or 'perception' in low):
            answer = 'Analisei o anexo atual com percepção visual estruturada. A imagem participou da intenção deste turno e não foi tratada como saudação.'
        elif 'como posso me amar' in low:
            answer = 'Você pode desenvolver amor próprio praticando autocuidado, reduzindo a autocrítica e criando limites saudáveis. Comece por uma ação pequena e concreta hoje.'
        elif 'o que é crm' in low or 'o que e crm' in low:
            answer = 'CRM é um sistema para organizar relacionamentos comerciais, contatos, oportunidades, atividades e o acompanhamento do funil de vendas.'
        elif 'melhore isso' in low and '/contacts' in low:
            answer = 'Estou usando o App Context Bridge da tela /contacts. Posso propor melhorias para esta tela com base no contexto atual; qualquer escrita continua exigindo confirmação.'
        elif 'oi' in low:
            answer = 'Olá! Como posso ajudar?'
        else:
            answer = 'Resposta da fixture local para o turno atual.'
        if body.get('stream'):
            payload = (json.dumps({'message':{'content':answer},'done':False}, ensure_ascii=False)+'\n'+json.dumps({'message':{'content':''},'done':True}, ensure_ascii=False)+'\n').encode('utf-8')
            self.send_response(200); self.send_header('content-type','application/x-ndjson'); self.send_header('content-length',str(len(payload))); self.end_headers(); self.wfile.write(payload); return
        if 'verdict' in props:
            structured={'verdict':'pass','confidence':0.97,'issues':[],'repaired_answer':answer}
        else:
            structured = {'mode':'ASK','target_product':'shared','message':answer,'summary':answer,'action':None,'suggested_prompts':[]}
        return self._json({'message':{'content':json.dumps(structured,ensure_ascii=False)},'done':True,'created_at':'fixture-v2.5'})


def free_port():
    s=socket.socket(); s.bind(('127.0.0.1',0)); p=s.getsockname()[1]; s.close(); return p

def wait_http(url, timeout=12):
    end=time.time()+timeout; last=None
    while time.time()<end:
        try:
            with urlopen(url, timeout=0.5) as r:
                if r.status < 500: return
        except Exception as e: last=e
        time.sleep(0.08)
    raise RuntimeError(f'endpoint não iniciou: {url}: {last}')

def run_self_test(headless=True):
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:
        raise RuntimeError(f'Playwright Python indisponível: {e}')
    temp=Path(tempfile.mkdtemp(prefix='rt-browser-chat-v25-'))
    cfg=temp/'config'/'realtalent-agent'; cfg.mkdir(parents=True)
    (cfg/'workspaces.json').write_text(json.dumps({'crm':str(CRM)},ensure_ascii=False,indent=2))
    img=temp/'attachment.png'
    img.write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl0sAAAAASUVORK5CYII='))
    ollama_port=free_port(); agent_port=free_port()
    fixture=ThreadingHTTPServer(('127.0.0.1',ollama_port),OllamaFixtureHandler); th=threading.Thread(target=fixture.serve_forever,daemon=True); th.start()
    env=os.environ.copy(); env.update({
        'HOME':str(temp),'XDG_CONFIG_HOME':str(temp/'config'),'XDG_STATE_HOME':str(temp/'state'),'XDG_CACHE_HOME':str(temp/'cache'),
        'REALTALENT_AGENT_HOST':'127.0.0.1','REALTALENT_AGENT_PORT':str(agent_port),'REALTALENT_AI_PROVIDER':'ollama',
        'OLLAMA_URL':f'http://127.0.0.1:{ollama_port}','OLLAMA_MODEL':'qwen2.5-coder:3b','OLLAMA_GENERAL_MODEL':'qwen3:4b',
        'OLLAMA_FAST_MODEL':'qwen3:4b','OLLAMA_CODER_MODEL':'qwen2.5-coder:3b','OLLAMA_REASONING_MODEL':'qwen3:4b','OLLAMA_VISION_MODEL':'gemma3:4b','OLLAMA_EMBED_MODEL':'nomic-embed-text',
        'OPENAI_API_KEY':''})
    proc=subprocess.Popen(['node',str(ROOT/'gateway.mjs')],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    checks=[]
    def ck(name, cond, detail=''):
        ok=bool(cond); checks.append((name,ok,detail)); print(('OK  ' if ok else 'FAIL')+name+(f' — {detail}' if detail and not ok else '')); return ok
    base=f'http://localhost:{agent_port}'
    try:
        wait_http(base+'/platform')
        with sync_playwright() as pw:
            # Prefer the Playwright-managed Chromium because a system Chromium may inherit enterprise URL blocklists.
            try:
                browser=pw.chromium.launch(headless=headless, args=['--no-sandbox'])
            except Exception:
                executable=shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
                if not executable:
                    raise
                browser=pw.chromium.launch(headless=headless, executable_path=executable, args=['--no-sandbox'])
            page=browser.new_page(viewport={'width':1440,'height':1000})
            page.goto(base+'/chat',wait_until='domcontentloaded')
            page.wait_for_selector('#prompt')
            ck('Chat V2.6 renderiza no navegador real', 'V2.6' in page.locator('.brand').inner_text())

            def send(text, timeout=25000):
                before=page.locator('article.message.assistant').count()
                page.locator('#prompt').fill(text)
                page.locator('#sendBtn').click()
                page.wait_for_function("([before]) => document.querySelectorAll('article.message.assistant').length > before && !document.querySelector('#sendBtn').disabled", arg=[before], timeout=timeout)
                return page.locator('article.message.assistant .msg-body').last.inner_text().strip()

            a=send('oi'); ck('saudação continua conversa normal', a.lower().startswith('olá') or a.lower().startswith('ola') or a.lower().startswith('oi'), a[:120])
            a=send('o que é CRM?'); ck('pergunta conceitual responde como CRM, sem análise forçada', 'sistema' in a.lower() and 'relacion' in a.lower(), a[:160])
            a=send('Analise o CRM inteiro e priorize o que impede a comercialização', timeout=45000)
            ck('Commercial Readiness é renderizado, não resposta genérica', 'prontidão comercial' in a.lower() and 'bloqueadores' in a.lower(), a[:220])
            page.wait_for_function("() => document.querySelectorAll('.protocol-item').length===16", timeout=5000)
            ck('cards estruturados mostram 16 checks', page.locator('.protocol-item').count()==16, str(page.locator('.protocol-item').count()))
            a=send('como posso me amar?'); ck('perspectiva pessoal não é confundida com capacidade da IA', 'você' in a.lower() and 'amor próprio' in a.lower() and 'não posso' not in a.lower(), a[:180])

            # App Context Bridge in the real chat surface.
            sync=page.evaluate("""async () => (await fetch('/app-context/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({product:'crm',source:'browser-e2e',context:{workspace:'RealTalent',route:'/contacts',selected:{contactId:'c1'},data:{contacts:[{id:'c1',name:'Ana Lima'}]}}})})).json()""")
            ck('App Context foi sincronizado pelo browser', sync.get('ok') and sync.get('context',{}).get('route')=='/contacts')
            page.locator('#scope').select_option('crm')
            a=send('melhore isso'); ck('“isso” resolve para a tela atual', '/contacts' in a and 'App Context Bridge' in a, a[:180])
            ck('resposta de referência exibe card de contexto', page.locator('.answer-card-title').filter(has_text='Contexto do aplicativo').count()>=1)

            # Real attachment path via <input type=file>.
            page.locator('#fileInput').set_input_files(str(img))
            page.wait_for_function("() => document.querySelector('#attached').innerText.includes('attachment.png')")
            a=send('analise')
            ck('anexo muda a intenção no chat real', 'anexo atual' in a.lower() and not a.lower().startswith('olá'), a[:180])
            latest=page.evaluate("""async () => {const x=await (await fetch('/chat/conversations')).json(); const id=x.conversations[0]?.id; return id ? (await (await fetch('/chat/conversations/'+encodeURIComponent(id))).json()).conversation : null} """)
            last_user=[m for m in (latest or {}).get('messages',[]) if m.get('role')=='user'][-1]
            ci=last_user.get('metadata',{}).get('conversationIntelligence',{})
            ck('backend registrou attachment_analysis no histórico real', ci.get('intent')=='attachment_analysis' and ci.get('reference',{}).get('source')=='attachment', json.dumps(ci,ensure_ascii=False)[:250])

            # Hard reset/new conversation.
            page.locator('#newChat').click()
            page.wait_for_function("() => document.querySelectorAll('article.message').length===0 && document.querySelector('.welcome')")
            newest=page.evaluate("""async () => {const x=await (await fetch('/chat/conversations')).json(); const c=x.conversations[0]; if(!c)return null; return (await (await fetch('/chat/conversations/'+encodeURIComponent(c.id))).json()).conversation} """)
            ck('Novo chat faz hard reset', newest and newest.get('messages')==[] and newest.get('summary') is None and newest.get('activeTopic') is None)

            # Real menu interactions: rename + archive.
            page.locator('.conversation.active .conversation-menu-btn').click()
            page.once('dialog', lambda d: d.accept('Browser E2E Renomeada'))
            page.locator('.conversation.active [data-conv-action="rename"]').click()
            page.wait_for_function("() => [...document.querySelectorAll('.conversation-title')].some(x=>x.textContent.includes('Browser E2E Renomeada'))")
            ck('menu ⋮ renomeia conversa no browser', page.locator('.conversation-title',has_text='Browser E2E Renomeada').count()>=1)
            current_id=page.evaluate("""async()=>{const x=await (await fetch('/chat/conversations')).json();return x.conversations.find(c=>c.title==='Browser E2E Renomeada')?.id||null}""")
            page.locator('.conversation',has_text='Browser E2E Renomeada').locator('.conversation-menu-btn').click()
            page.locator('.conversation',has_text='Browser E2E Renomeada').locator('[data-conv-action="archive"]').click()
            page.wait_for_function("() => ![...document.querySelectorAll('.conversation-title')].some(x=>x.textContent.includes('Browser E2E Renomeada'))")
            archived=page.evaluate("""async id=>{const x=await (await fetch('/chat/conversations?archived=1')).json();return x.conversations.find(c=>c.id===id)||null}""", current_id)
            ck('menu ⋮ arquiva sem excluir', archived and archived.get('archivedAt'))

            page.locator('#openSettings').click(); page.wait_for_selector('#settingsModal.open')
            settings=page.locator('#settingsModal').inner_text()
            ck('Configurações separam histórico e memórias', all(x in settings for x in ['Apagar todas as conversas','Limpar memória operacional','Limpar memória do projeto atual']))
            browser.close()
    finally:
        try: proc.terminate(); proc.wait(timeout=3)
        except Exception:
            try: proc.kill()
            except Exception: pass
        fixture.shutdown(); fixture.server_close(); shutil.rmtree(temp,ignore_errors=True)
    ok=sum(1 for _,v,_ in checks if v); total=len(checks)
    print(f'\nBrowser Conversation E2E V2.6: {ok}/{total} PASS')
    if ok!=total: raise SystemExit(1)

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--self-test',action='store_true');ap.add_argument('--headed',action='store_true');args=ap.parse_args()
    run_self_test(headless=not args.headed)
