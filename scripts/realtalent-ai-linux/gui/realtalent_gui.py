#!/usr/bin/env python3
"""RealTalent IA Local: graphical controller for the existing Ollama/Agent/bridge.

Runs as the signed-in desktop user, never as root. No private token is sent
to the CRM by this app. Browser pairing happens via the existing localhost bridge.
"""
import glob
import json
import os
import queue
import re
import shutil
import subprocess
import tempfile
import threading
import urllib.request
import urllib.error
import webbrowser
from pathlib import Path
import tkinter as tk
from tkinter import messagebox, scrolledtext

HOME = Path.home()
ROOT = HOME / '.local/share/realtalent-ai'
CRM_URL = 'https://crm-real-talent.vercel.app/'
BRANCH = 'feat/tasks-team-recipient-routing-20261102'
REPOSITORY = 'https://github.com/CAMBRUSSIJJ/CRM-RealTalent.git'
BG, BLUE, INK, PALE = '#f5f7fb', '#1959bb', '#14213a', '#e8effb'
SERVICES = ('realtalent-ai-agent.service', 'realtalent-ai-bridge.service')

def environment():
    env = os.environ.copy()
    extra = []
    for pattern in (
        '~/.nvm/versions/node/v22.*/bin',
        '~/.local/share/fnm/node-versions/v22.*/installation/bin',
        '~/.local/share/mise/installs/node/22.*/bin',
        '~/.asdf/installs/nodejs/22.*/bin'
    ):
        extra += glob.glob(os.path.expanduser(pattern))
    extra.sort(reverse=True)
    env['PATH'] = ':'.join(extra + [str(HOME / '.local/bin'), env.get('PATH',''),
                                  '/usr/local/bin', '/usr/bin', '/bin'])
    return env

def execute(args, timeout=12):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout,
                          check=False, env=environment())

def active(unit):
    try:
        return execute(['systemctl', '--user', 'is-active', '--quiet', unit], 6).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False

def local_json(url, data=None, headers=None, timeout=5):
    method = 'POST' if data is not None else 'GET'
    payload = json.dumps(data).encode() if data is not None else None
    h = {'Accept': 'application/json', **(headers or {})}
    if payload is not None:
        h['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=payload, headers=h, method=method)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req, timeout=timeout) as r:
        return json.load(r)

def configured_model():
    try:
        data = (HOME / '.config/realtalent-ai/agent.env').read_text()
        m = re.search(r'^REALTALENT_OLLAMA_MODEL=([\w.:/-]+)$', data, re.M)
        return m.group(1) if m else 'qwen3:8b'
    except OSError:
        return 'qwen3:8b'

def status():
    result = {'agent':active(SERVICES[0]), 'bridge':active(SERVICES[1]),
              'ollama':False,'model':False,'browser':False,'runtime':False}
    model = configured_model()
    try:
        data=local_json('http://127.0.0.1:11434/api/tags', timeout=3)
        result['ollama']=True
        result['model']=any(x.get('name','').lower()==model.lower()
                            for x in data.get('models',[]) if isinstance(x,dict))
    except Exception: pass
    try:
        data=local_json('http://127.0.0.1:8798/browser/ping',
          headers={'Origin':'https://crm-real-talent.vercel.app'},timeout=3)
        result['browser']=data.get('ok') is True
    except Exception: pass
    try:
        data=local_json('http://127.0.0.1:8792/tools/health',timeout=3)
        result['runtime']=data.get('ok') is True
    except Exception: pass
    result['ready']=all(result[x] for x in ('agent','bridge','ollama','model','browser','runtime'))
    result['model_name']=model
    return result

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title('RealTalent IA Local')
        self.geometry('720x615')
        self.minsize(630,560)
        self.configure(bg=BG)
        self.events=queue.Queue()
        self.busy=False
        self.code=''
        top=tk.Frame(self,bg=BLUE)
        top.pack(fill='x')
        tk.Label(top,text='REALTALENT  /  IA LOCAL',fg='#c4d9ff',bg=BLUE,
                 font=('DejaVu Sans',10,'bold')).pack(anchor='w',padx=26,pady=(14,2))
        tk.Label(top,text='Sua IA, com um clique.',bg=BLUE,fg='white',
                 font=('DejaVu Sans',21,'bold')).pack(anchor='w',padx=26)
        tk.Label(top,text='Ollama + Qwen neste Linux · Sem cobrança por tokens',
                 bg=BLUE,fg='#dceaff').pack(anchor='w',padx=26,pady=(2,15))
        content=tk.Frame(self,bg=BG)
        content.pack(fill='both',expand=True,padx=24,pady=18)
        self.label=tk.Label(content,text='Verificando os serviços...',bg=BG,fg=INK,
                            font=('DejaVu Sans',16,'bold'))
        self.label.pack(anchor='w',pady=(2,4))
        self.details=tk.StringVar(value='Ollama, Agent e ponte do navegador')
        tk.Label(content,textvariable=self.details,wraplength=660,justify='left',bg=BG,
                 fg='#56657a').pack(anchor='w',pady=(0,15))
        primary=tk.Frame(content,bg=BG)
        primary.pack(fill='x')
        self.buttons=[]
        self.button(primary,'ATIVAR IA NO CRM',self.activate,True).pack(side='left',padx=(0,10))
        self.button(primary,'Verificar',self.refresh).pack(side='left')
        actions=tk.Frame(content,bg=BG)
        actions.pack(fill='x',pady=13)
        self.button(actions,'Conectar navegador',self.pair).pack(side='left',padx=(0,8))
        self.button(actions,'Abrir CRM',self.open_crm).pack(side='left',padx=(0,8))
        self.button(actions,'Testar resposta',self.test).pack(side='left',padx=(0,8))
        self.button(actions,'Instalar / Reparar',self.repair).pack(side='left')
        pair=tk.Frame(content,bg=PALE)
        pair.pack(fill='x',pady=(3,15))
        tk.Label(pair,text='PAREAMENTO DO FIREFOX / CRM',bg=PALE,fg=BLUE,
                 font=('DejaVu Sans',10,'bold')).pack(anchor='w',padx=14,pady=(12,3))
        self.pair_info=tk.StringVar(value='Clique em “Conectar navegador” para gerar um código.')
        tk.Label(pair,textvariable=self.pair_info,bg=PALE,fg=INK,
                 font=('DejaVu Sans',11,'bold')).pack(anchor='w',padx=14)
        self.copy=self.button(pair,'Copiar código',self.copy_pair)
        self.copy.pack(anchor='w',padx=14,pady=(6,9))
        self.copy.config(state='disabled')
        tk.Label(content,text='DIAGNÓSTICO',bg=BG,fg='#56657a',
                 font=('DejaVu Sans',10,'bold')).pack(anchor='w',pady=(0,6))
        self.logs=scrolledtext.ScrolledText(content,wrap='word',height=8,
                  font=('DejaVu Sans Mono',9),bg='#101c2f',fg='#edf3ff',
                  insertbackground='white',relief='flat',padx=10,pady=10)
        self.logs.pack(fill='both',expand=True)
        self.logs.configure(state='disabled')
        self.after(100,self.poll)
        self.after(300,self.refresh)
        self.after(30000,self.periodic)

    def button(self,parent,label,command,primary=False):
        btn=tk.Button(parent,text=label,command=command,relief='flat',cursor='hand2',
                      bg=BLUE if primary else '#e5ebf6',fg='white' if primary else INK,
                      font=('DejaVu Sans',10,'bold'),padx=12,pady=11)
        self.buttons.append(btn)
        return btn

    def log(self,line):
        line=re.sub(r'(?i)(TOKEN|API_KEY|SECRET|PASSWORD)=\S+',r'\1=[OCULTO]',str(line))
        line=re.sub(r'(Código de 6 dígitos:\s*)\d{6}',r'\1[OCULTO]',line)
        if not line.strip():return
        self.logs.config(state='normal')
        self.logs.insert('end',line.rstrip()+'\n')
        self.logs.see('end')
        self.logs.config(state='disabled')

    def job(self,name,fn):
        if self.busy:return
        self.busy=True
        self.label.configure(text=name,fg=BLUE)
        for btn in self.buttons:btn.configure(state='disabled')
        def worker():
            try:fn()
            except Exception as e:self.events.put(('error',str(e)))
            finally:self.events.put(('done',None))
        threading.Thread(target=worker,daemon=True).start()

    def poll(self):
        try:
            while True:
                kind,data=self.events.get_nowait()
                if kind=='log':self.log(data)
                elif kind=='pair':
                    self.code=data
                    self.pair_info.set('Código: '+data+'     (válido por 5 minutos)')
                    self.copy.configure(state='normal')
                elif kind=='status':
                    if data['ready']:
                        self.label.config(text='IA local ativa',fg='#127756')
                        self.details.set('Qwen '+data['model_name']+' identificado; ponte e Agent respondendo.')
                    else:
                        self.label.config(text='IA local precisa de atenção',fg='#a0641a')
                        titles={'agent':'Agent','bridge':'Ponte','ollama':'Ollama',
                                'model':'Modelo','browser':'Navegador','runtime':'API'}
                        self.details.set('   '.join(('✓ ' if data[k] else '✕ ')+titles[k] for k in titles))
                elif kind=='error':
                    self.log('ERRO: '+data)
                    self.label.config(text='Falha na operação',fg='#b9324f')
                elif kind=='done':
                    self.busy=False
                    for btn in self.buttons:btn.configure(state='normal')
                    if not self.code:self.copy.config(state='disabled')
        except queue.Empty:pass
        self.after(100,self.poll)

    def stream(self,argv,workdir=None):
        self.events.put(('log','Executando: '+' '.join(argv[:3])))
        p=subprocess.Popen(argv,cwd=workdir,env=environment(),
                           stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
                           text=True,encoding='utf-8',errors='replace')
        for line in p.stdout or []:self.events.put(('log',line.rstrip()))
        rc=p.wait()
        if rc:raise RuntimeError('Processo encerrado com código '+str(rc)+'. Consulte os registros.')

    def refresh(self):
        self.job('Verificando serviços...',lambda:self.events.put(('status',status())))

    def activate(self):
        def start():
            if not (ROOT/'secure-bridge.mjs').exists():
                raise RuntimeError('Agente ainda não instalado. Use “Instalar / Reparar” uma vez.')
            if shutil.which('ollama',path=environment()['PATH']):
                # Supports existing system Ollama and user services.
                try:self.stream(['systemctl','--user','start','realtalent-ollama.service'])
                except RuntimeError:self.events.put(('log','Usando Ollama existente, sem serviço de usuário.'))
            self.stream(['systemctl','--user','start',*SERVICES])
            self.events.put(('log','Serviços iniciados. No mesmo Linux, abra o CRM.'))
            self.events.put(('status',status()))
        self.job('Ativando Qwen local...',start)

    def pair(self):
        def work():
            f=ROOT/'pair-local.mjs'
            if not f.is_file():raise RuntimeError('Falta pareamento. Use “Instalar / Reparar”.')
            result=execute(['node',str(f)],12)
            m=re.search(r'Código de 6 dígitos:\s*(\d{6})',result.stdout)
            if result.returncode or not m:raise RuntimeError('Falha ao gerar código de pareamento.')
            self.events.put(('pair',m.group(1)))
            self.events.put(('log','Código criado. Cole em Configurações → RealTalent IA.'))
        self.job('Gerando código de pareamento...',work)

    def copy_pair(self):
        if self.code:
            self.clipboard_clear()
            self.clipboard_append(self.code)
            self.update_idletasks()

    def open_crm(self):
        webbrowser.open(CRM_URL)
        self.log('Abrindo RealTalent no navegador deste computador.')

    def test(self):
        def work():
            model=configured_model()
            response=local_json('http://127.0.0.1:11434/api/generate',
                     data={'model':model,'prompt':'Responda somente OK','stream':False,
                           'think':False,'options':{'num_predict':48}},timeout=180)
            if response.get('error') or not str(response.get('response','')).strip():
                raise RuntimeError('Modelo não gerou texto. Confira Ollama e Qwen.')
            self.events.put(('log','Teste real OK: Qwen respondeu localmente.'))
            self.events.put(('status',status()))
        self.job('Testando uma resposta real...',work)

    def repair(self):
        if not messagebox.askyesno('Instalar ou reparar',
          'O instalador pode baixar arquivos do GitHub e o Qwen (vários GB). '
          'A cópia anterior é preservada em backup. Continuar?'):
            return
        def work():
            installer=ROOT/'repo/scripts/realtalent-ai-linux/start-linux.sh'
            if not installer.is_file():
                if not shutil.which('git',path=environment()['PATH']):
                    raise RuntimeError('Git não encontrado. Instale git antes de continuar.')
                folder=Path(tempfile.mkdtemp(prefix='realtalent-install-'))
                try:
                    self.stream(['git','clone','--depth','1','--single-branch','--branch',
                                 BRANCH,REPOSITORY,str(folder/'src')])
                    installer=folder/'src/scripts/realtalent-ai-linux/start-linux.sh'
                    self.stream(['bash',str(installer)])
                finally:shutil.rmtree(folder,ignore_errors=True)
            else:self.stream(['bash',str(installer)])
            self.events.put(('status',status()))
        self.job('Instalando / reparando...',work)

    def periodic(self):
        if not self.busy:self.refresh()
        self.after(30000,self.periodic)

if __name__=='__main__':
    try:App().mainloop()
    except tk.TclError as e:print('Não foi possível abrir janela:',e)
