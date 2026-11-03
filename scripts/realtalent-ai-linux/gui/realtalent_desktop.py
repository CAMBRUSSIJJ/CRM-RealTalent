#!/usr/bin/env python3
"""RealTalent Desktop — signed-in Linux desktop app with embedded CRM and local AI.

Qt WebEngine presents the real CRM website within the same window. All Ollama
operations are loopback-only and API secrets never enter the WebEngine process.
"""
import ast
import glob
import json
import os
from pathlib import Path
import queue
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.request
import webbrowser

from PyQt5.QtCore import QTimer, Qt, QUrl
from PyQt5.QtGui import QColor, QFont, QIcon
from PyQt5.QtWidgets import (
    QApplication, QFrame, QHBoxLayout, QLabel, QMainWindow, QMessageBox,
    QPushButton, QScrollArea, QSizePolicy, QVBoxLayout, QWidget, QTextEdit
)
from PyQt5.QtWebEngineWidgets import QWebEnginePage, QWebEngineProfile, QWebEngineView, QWebEngineSettings

HOME = Path.home()
ROOT = HOME / '.local/share/realtalent-ai'
APPDIR = HOME / '.local/share/realtalent-ai-app'
SITE = 'https://crm-real-talent.vercel.app/'
BASE = 'https://raw.githubusercontent.com/CAMBRUSSIJJ/CRM-RealTalent/feat/tasks-team-recipient-routing-20261102'
BRANCH = 'feat/tasks-team-recipient-routing-20261102'
REPOSITORY = 'https://github.com/CAMBRUSSIJJ/CRM-RealTalent.git'
SERVICES = ('realtalent-ai-agent.service', 'realtalent-ai-bridge.service')

def environment():
    env = os.environ.copy()
    extra = []
    for pattern in ('~/.nvm/versions/node/v22.*/bin',
                    '~/.local/share/fnm/node-versions/v22.*/installation/bin',
                    '~/.local/share/mise/installs/node/22.*/bin',
                    '~/.asdf/installs/nodejs/22.*/bin'):
        extra += glob.glob(os.path.expanduser(pattern))
    extra.sort(reverse=True)
    env['PATH'] = ':'.join(extra + [str(HOME / '.local/bin'),
                       env.get('PATH', ''), '/usr/local/bin', '/usr/bin', '/bin'])
    return env

def run(args, timeout=12):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout,
                          check=False, env=environment())

def service_active(name):
    try:
        return run(['systemctl', '--user', 'is-active', '--quiet', name], 5).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False

def service_installed(name):
    try:
        result = run(['systemctl', '--user', 'show', name, '--property=LoadState'], 5)
        return result.returncode == 0 and 'LoadState=loaded' in result.stdout
    except (OSError, subprocess.TimeoutExpired):
        return False

def fetch_json(url, payload=None, headers=None, timeout=4):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, headers={
        'Accept': 'application/json', **(headers or {}),
        **({'Content-Type': 'application/json'} if data is not None else {})
    })
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=timeout) as response:
        return json.load(response)

def configured_model():
    try:
        data = (HOME / '.config/realtalent-ai/agent.env').read_text(encoding='utf-8')
        match = re.search(r'^REALTALENT_OLLAMA_MODEL=([\w.:/-]+)$', data, re.M)
        return match.group(1) if match else 'qwen3:8b'
    except OSError:
        return 'qwen3:8b'

def check_status():
    status = { 'agent': service_active(SERVICES[0]), 'bridge': service_active(SERVICES[1]),
               'ollama': False, 'model': False, 'browser': False, 'runtime': False}
    model = configured_model()
    try:
        response = fetch_json('http://127.0.0.1:11434/api/tags')
        status['ollama'] = True
        status['model'] = any(
            str(item.get('name', '')).lower() == model.lower()
            for item in response.get('models', []) if isinstance(item, dict)
        )
    except Exception:
        pass
    try:
        response = fetch_json('http://127.0.0.1:8798/browser/ping', headers={
            'Origin': 'https://crm-real-talent.vercel.app'
        })
        status['browser'] = response.get('ok') is True
    except Exception:
        pass
    try:
        response = fetch_json('http://127.0.0.1:8792/tools/health')
        status['runtime'] = response.get('ok') is True
    except Exception:
        pass
    status['ready'] = all(status[k] for k in ('agent','bridge','ollama','model','browser','runtime'))
    status['model_name'] = model
    return status

class CRMPage(QWebEnginePage):
    """Preserve the OAuth/login flow when CRM opens a new window."""
    def __init__(self, profile, parent, popups):
        super().__init__(profile, parent)
        self.popups = popups
    def createWindow(self, kind):
        popup = QWebEngineView()
        popup.setWindowTitle('RealTalent — Autenticação')
        popup.resize(940, 730)
        page = CRMPage(self.profile(), popup, self.popups)
        popup.setPage(page)
        self.popups.append(popup)
        popup.show()
        popup.destroyed.connect(lambda: self.popups.remove(popup) if popup in self.popups else None)
        return page

class Desktop(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('RealTalent — CRM + IA Local')
        self.setMinimumSize(980, 650)
        self.resize(1440, 860)
        self.events = queue.Queue()
        self.busy = False
        self.code = ''
        self.buttons = []
        self.popups = []
        icon = HOME / '.local/share/icons/hicolor/scalable/apps/realtalent-ai-local.svg'
        if icon.exists():
            self.setWindowIcon(QIcon(str(icon)))
        body = QWidget()
        body.setObjectName('root')
        self.setCentralWidget(body)
        layout = QHBoxLayout(body)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        left = QScrollArea()
        left.setObjectName('leftScroll')
        left.setFrameShape(QFrame.NoFrame)
        left.setWidgetResizable(True)
        left.setFixedWidth(350)
        left_inner = QWidget()
        left_inner.setObjectName('leftPane')
        left.setWidget(left_inner)
        side = QVBoxLayout(left_inner)
        side.setContentsMargins(20, 25, 20, 16)
        side.setSpacing(12)
        side.addWidget(self.label('REALTALENT  /  DESKTOP', 'kicker'))
        side.addWidget(self.label('CRM + IA local', 'headline'))
        side.addWidget(self.label('Trabalhe no CRM sem sair deste aplicativo.', 'muted'))
        self.status_title = self.label('Verificando a IA...', 'status')
        side.addWidget(self.status_title)
        self.status_detail = self.label('Ollama · Qwen · Agent · Ponte', 'muted')
        self.status_detail.setWordWrap(True)
        side.addWidget(self.status_detail)
        side.addWidget(self.button('Ativar IA no CRM', self.activate, primary=True))
        side.addWidget(self.button('Conectar IA ao CRM', self.pair))
        self.pair_label = self.label('Primeiro acesso: conecte a IA com o código de 6 dígitos.', 'hint')
        self.pair_label.setWordWrap(True)
        side.addWidget(self.pair_label)
        self.copy_button = self.button('Copiar código', self.copy_pair)
        self.copy_button.setEnabled(False)
        side.addWidget(self.copy_button)
        side.addSpacing(8)
        side.addWidget(self.button('Testar uma resposta', self.test_model))
        side.addWidget(self.button('Verificar serviços', self.refresh))
        side.addWidget(self.button('Atualizar aplicativo', self.update_app))
        side.addWidget(self.button('Instalar / Reparar IA', self.repair))
        side.addStretch()
        side.addWidget(self.label('DIAGNÓSTICO', 'kicker'))
        self.log_view = QTextEdit()
        self.log_view.setObjectName('logs')
        self.log_view.setReadOnly(True)
        self.log_view.setFixedHeight(140)
        side.addWidget(self.log_view)
        side.addWidget(self.label('IA gratuita no computador; outras funções do CRM podem usar serviços em nuvem.', 'foot'))
        layout.addWidget(left)

        center = QWidget()
        center.setObjectName('crmPane')
        section = QVBoxLayout(center)
        section.setContentsMargins(0, 0, 0, 0)
        section.setSpacing(0)
        toolbar = QWidget()
        toolbar.setObjectName('toolbar')
        row = QHBoxLayout(toolbar)
        row.setContentsMargins(13, 8, 13, 8)
        row.setSpacing(9)
        self.back = self.button('‹', lambda: self.browser.back())
        self.forward = self.button('›', lambda: self.browser.forward())
        self.reload = self.button('↻', lambda: self.browser.reload())
        for item in (self.back, self.forward, self.reload):
            item.setFixedWidth(38)
            row.addWidget(item)
        self.url_label = self.label('🔒  CRM RealTalent', 'crumb')
        row.addWidget(self.url_label)
        row.addStretch()
        row.addWidget(self.button('Abrir no Firefox', self.external_browser))
        section.addWidget(toolbar)

        # Separate persistent profile: login/cookies/pairing stay in this app,
        # never copied from Firefox or written to log files.
        profile_dir = APPDIR / 'browser-profile'
        cache_dir = APPDIR / 'web-cache'
        profile_dir.mkdir(parents=True, exist_ok=True)
        cache_dir.mkdir(parents=True, exist_ok=True)
        os.chmod(profile_dir, 0o700)
        os.chmod(cache_dir, 0o700)
        self.profile = QWebEngineProfile('realtalent-desktop', self)
        self.profile.setPersistentStoragePath(str(profile_dir))
        self.profile.setCachePath(str(cache_dir))
        self.profile.setPersistentCookiesPolicy(QWebEngineProfile.ForcePersistentCookies)
        self.browser = QWebEngineView()
        self.browser.setPage(CRMPage(self.profile, self.browser, self.popups))
        self.browser.settings().setAttribute(QWebEngineSettings.JavascriptEnabled, True)
        self.browser.settings().setAttribute(QWebEngineSettings.LocalStorageEnabled, True)
        self.browser.settings().setAttribute(QWebEngineSettings.JavascriptCanOpenWindows, True)
        self.browser.loadFinished.connect(self.loaded)
        self.browser.urlChanged.connect(lambda url: self.url_label.setText(
            '🔒  CRM RealTalent' if url.host().endswith('vercel.app') else '🌐  '+url.host()
        ))
        self.browser.load(QUrl(SITE))
        section.addWidget(self.browser, 1)
        layout.addWidget(center, 1)
        self.setStyleSheet("""
            #root {background: #fff;}
            #leftScroll, #leftPane {background: #f6f8fc;border:0;}
            #crmPane {background: white;}
            #toolbar {background:#fff;border-bottom:1px solid #e0e7f0;}
            QLabel#kicker {font-weight:700; font-size:11px; color:#41609a; letter-spacing:1px;}
            QLabel#headline {font-size:23px; font-weight:700;color:#162948;}
            QLabel#muted {font-size:12px;color:#50617a;}
            QLabel#status {font-size:16px;font-weight:700;color:#1758ad;margin-top:10px;}
            QLabel#hint {color:#415579;background:#e8effb;border-radius:8px;padding:10px;}
            QLabel#foot {font-size:10px;color:#687a96;}
            QLabel#crumb {font-size:12px;font-weight:700;color:#233f6d;}
            QPushButton {background:#e6edf7;color:#203653;border:0;border-radius:7px;
                padding:11px 13px;font-weight:600;text-align:left;}
            QPushButton:hover {background:#d3e2f6;}
            QPushButton:disabled {color:#8b95a7;}
            QPushButton#primary {background:#1959bb;color:white;font-size:13px;}
            QPushButton#primary:hover {background:#114895;}
            QTextEdit#logs {background:#13233b;color:#dceaff;border:0;border-radius:7px;
                font-family:monospace;font-size:11px;padding:6px;}
        """)
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.poll)
        self.timer.start(120)
        self.health_timer = QTimer(self)
        self.health_timer.timeout.connect(self.periodic)
        self.health_timer.start(30000)
        QTimer.singleShot(350, self.refresh)

    @staticmethod
    def label(text, kind):
        w = QLabel(text)
        w.setObjectName(kind)
        w.setWordWrap(kind in ('muted','hint','foot'))
        return w

    def button(self, title, action, primary=False):
        b = QPushButton(title)
        if primary: b.setObjectName('primary')
        b.clicked.connect(action)
        self.buttons.append(b)
        return b

    def log(self, message):
        text = str(message).strip()
        text = re.sub(r'(?i)(TOKEN|API_KEY|SECRET|PASSWORD)=\S+', r'\1=[OCULTO]', text)
        text = re.sub(r'(Código de 6 dígitos:\s*)\d{6}', r'\1[OCULTO]', text)
        if text:
            self.log_view.append(text)
            bar = self.log_view.verticalScrollBar()
            bar.setValue(bar.maximum())

    def job(self, title, handler):
        if self.busy:
            return
        self.busy = True
        self.status_title.setText(title)
        self.status_title.setStyleSheet('color:#1959bb')
        for btn in self.buttons:
            btn.setEnabled(False)
        def run_job():
            try: handler()
            except Exception as e: self.events.put(('error', str(e)))
            finally: self.events.put(('done', None))
        threading.Thread(target=run_job, daemon=True).start()

    def poll(self):
        while True:
            try: event, data = self.events.get_nowait()
            except queue.Empty: break
            if event == 'log':
                self.log(data)
            elif event == 'pair':
                self.code = data
                self.pair_label.setText('Código:  '+data+'   (válido por 5 minutos)\n'
                                       'No CRM à direita, entre em Configurações → RealTalent IA.')
            elif event == 'status':
                if data['ready']:
                    self.status_title.setText('● IA local ativa')
                    self.status_title.setStyleSheet('color:#148054')
                    self.status_detail.setText(
                        'Qwen '+data['model_name']+' · Agent e ponte disponíveis')
                else:
                    self.status_title.setText('● IA precisa de atenção')
                    self.status_title.setStyleSheet('color:#b26b19')
                    names={'agent':'Agent','bridge':'Ponte','ollama':'Ollama',
                           'model':'Qwen','browser':'Conexão do navegador','runtime':'Roteador'}
                    self.status_detail.setText('  ·  '.join(
                        ('✓ ' if data[k] else '✕ ')+name
                        for k,name in names.items()))
            elif event == 'error':
                self.log('Erro: '+data)
                self.status_title.setText('Falha na operação')
                self.status_title.setStyleSheet('color:#ad2544')
            elif event == 'done':
                self.busy = False
                for btn in self.buttons: btn.setEnabled(True)
                self.copy_button.setEnabled(bool(self.code))

    def stream(self, args):
        self.events.put(('log', 'Executando '+args[0]+' '+args[1]+'…'))
        result = subprocess.Popen(args,env=environment(),
            stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
            text=True,encoding='utf-8',errors='replace')
        for line in result.stdout or []:
            self.events.put(('log', line.rstrip()))
        if result.wait() != 0:
            raise RuntimeError('A operação falhou. Consulte o diagnóstico acima.')

    def refresh(self):
        self.job('Verificando serviços…',
                 lambda:self.events.put(('status', check_status())))

    def activate(self):
        def work():
            if not (ROOT/'secure-bridge.mjs').exists():
                raise RuntimeError('Instalação anterior não encontrada. Clique em Instalar / Reparar IA.')
            # Ollama may run as a system service rather than systemd --user.
            # Do not start a non-existent user unit or show a misleading failure.
            try:
                fetch_json('http://127.0.0.1:11434/api/tags', timeout=2)
                self.events.put(('log', 'Ollama já responde; não precisa reiniciá-lo.'))
            except Exception:
                if service_installed('realtalent-ollama.service'):
                    self.stream(['systemctl','--user','start','realtalent-ollama.service'])
                else:
                    self.events.put(('log',
                         'Ollama não responde. Não existe serviço de usuário; verifique o serviço de sistema.'))
            self.stream(['systemctl','--user','start', *SERVICES])
            self.events.put(('log', 'IA iniciada. O CRM está aberto nesta janela.'))
            self.events.put(('status', check_status()))
        self.job('Ativando IA local…', work)

    def pair(self):
        def work():
            target = ROOT/'pair-local.mjs'
            if not target.is_file():
                raise RuntimeError('Componente de pareamento ausente. Use Instalar / Reparar IA.')
            result = run(['node', str(target)], 12)
            matched = re.search(r'Código de 6 dígitos:\s*(\d{6})', result.stdout)
            if result.returncode or not matched:
                raise RuntimeError('Não foi possível gerar o código de pareamento.')
            self.events.put(('pair', matched.group(1)))
            self.events.put(('log', 'Código gerado. Digite no CRM aberto à direita.'))
        self.job('Preparando pareamento…', work)

    def copy_pair(self):
        if self.code:
            QApplication.clipboard().setText(self.code)
            self.log('Código copiado. Cole no CRM à direita.')

    def external_browser(self):
        webbrowser.open(SITE)

    def loaded(self, ok):
        if ok:
            self.log('CRM carregado dentro do aplicativo.')
        else:
            self.log('Não foi possível abrir o CRM. Verifique internet ou use Abrir no Firefox.')

    def test_model(self):
        def work():
            model = configured_model()
            result = fetch_json('http://127.0.0.1:11434/api/generate',
                payload={'model':model,'prompt':'Responda somente OK','stream':False,
                         'think':False,'options':{'num_predict':48}},timeout=180)
            if result.get('error') or not str(result.get('response','')).strip():
                raise RuntimeError('O modelo não gerou texto; confira Qwen e Ollama.')
            self.events.put(('log', 'Teste de geração local: OK. Nenhum token pago utilizado.'))
            self.events.put(('status', check_status()))
        self.job('Testando o Qwen…', work)

    def update_app(self):
        if QMessageBox.question(self, 'Atualizar aplicativo',
                'Baixar nova versão do aplicativo do repositório oficial?'
                '\nA sessão do CRM e os dados do Ollama serão preservados.',
                QMessageBox.Yes|QMessageBox.No) != QMessageBox.Yes:
            return
        def work():
            url = BASE+'/scripts/realtalent-ai-linux/gui/realtalent_desktop.py'
            request = urllib.request.Request(url, headers={'User-Agent':'RealTalent-Desktop-Update/1'})
            with urllib.request.urlopen(request, timeout=35) as response:
                content = response.read(1024*1024)
            if not content or len(content) >= 1024*1024:
                raise RuntimeError('Atualização inválida ou grande demais.')
            text = content.decode('utf-8')
            ast.parse(text)
            APPDIR.mkdir(parents=True,exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=APPDIR,delete=False,mode='w',
                                             encoding='utf-8',prefix='.desktop-update-') as f:
                temp = Path(f.name)
                f.write(text)
            try:
                os.chmod(temp, 0o600)
                os.replace(temp, APPDIR/'realtalent_desktop.py')
            finally:
                if temp.exists(): temp.unlink()
            self.events.put(('log', 'Atualização concluída. Feche e reabra o aplicativo pelo ícone.'))
        self.job('Atualizando interface…',work)

    def repair(self):
        if QMessageBox.question(self,'Instalar / Reparar',
            'Esta opção pode baixar dependências e um modelo de vários GB. '
            'A instalação anterior será preservada em backup quando houver alterações. Continuar?',
            QMessageBox.Yes|QMessageBox.No) != QMessageBox.Yes:
            return
        def work():
            installer = ROOT/'repo/scripts/realtalent-ai-linux/start-linux.sh'
            if installer.is_file():
                self.stream(['bash',str(installer)])
            else:
                folder = Path(tempfile.mkdtemp(prefix='realtalent-ai-repair-'))
                try:
                    self.stream(['git','clone','--depth','1','--single-branch',
                        '--branch',BRANCH,REPOSITORY,str(folder/'crm')])
                    self.stream(['bash',str(folder/'crm/scripts/realtalent-ai-linux/start-linux.sh')])
                finally: shutil.rmtree(folder,ignore_errors=True)
            self.events.put(('status',check_status()))
        self.job('Reparando IA…',work)

    def periodic(self):
        if not self.busy:
            self.refresh()

def main():
    # Do not force-disable the Qt WebEngine sandbox globally. Linux distributions
    # may need system WebEngine packages; the installer handles their presence.
    app = QApplication(sys.argv)
    app.setApplicationName('RealTalent Desktop')
    desktop = Desktop()
    desktop.show()
    return app.exec_()

if __name__ == '__main__':
    sys.exit(main())
