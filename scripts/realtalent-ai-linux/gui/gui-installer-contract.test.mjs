import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
const read=path=>readFileSync(path,'utf8')
const shell='scripts/realtalent-ai-linux/gui/instalar-app-grafico.sh'
const python='scripts/realtalent-ai-linux/gui/realtalent_gui.py'
test('Linux graphical installer is valid and does not require .deb download',()=>{
  execFileSync('bash',['-n',shell])
  const s=read(shell)
  assert.match(s,/raw\.githubusercontent\.com/)
  assert.match(s,/python3-tk/)
  assert.match(s,/realtalent-ai-local\.desktop/)
  assert.match(s,/realtalent-ai-local/)
  assert.doesNotMatch(s,/git reset --hard|git clean -fd|rm -rf "\$HOME\/\.local\/share\/realtalent-ai\/repo"/)
})
test('GUI handles button activation without requiring elevated privileges',()=>{
  execFileSync('python3',['-m','py_compile',python])
  const s=read(python)
  for(const key of ['ATIVAR IA NO CRM','Conectar navegador','Abrir CRM',
    'Testar resposta','Instalar / Reparar','systemctl','--user','qwen3:8b']){
    assert.ok(s.includes(key),key)
  }
  assert.match(s,/127\.0\.0\.1:8798\/browser\/ping/)
  assert.match(s,/127\.0\.0\.1:11434\/api\/generate/)
  assert.doesNotMatch(s,/os\.system\(/)
})

test('embedded CRM desktop is syntactically valid and bundles local AI controls',()=>{
  const desktop='scripts/realtalent-ai-linux/gui/realtalent_desktop.py'
  execFileSync('python3',['-m','py_compile',desktop])
  const code=read(desktop)
  for(const label of ['CRM + IA local','Ativar IA no CRM','Conectar IA ao CRM',
     'Abrir no Firefox','Testar uma resposta','Atualizar aplicativo','Instalar / Reparar IA']){
    assert.ok(code.includes(label),'missing: '+label)
  }
  assert.match(code,/QWebEngineView/)
  assert.match(code,/ForcePersistentCookies/)
  assert.match(code,/setPersistentStoragePath/)
  assert.match(code,/127\.0\.0\.1:8798\/browser\/ping/)
  assert.match(code,/127\.0\.0\.1:11434\/api\/generate/)
  assert.match(code,/service_installed\('realtalent-ollama\.service'\)/)
  assert.doesNotMatch(code,/subprocess\.Popen\([^)]*shell\s*=\s*True/)
})
test('new installer launches Qt desktop when installed, preserves fallback and creates desktop icon',()=>{
  const shell=read('scripts/realtalent-ai-linux/gui/instalar-app-grafico.sh')
  assert.match(shell,/python3-pyqt5\.qtwebengine/)
  assert.match(shell,/realtalent_desktop\.py/)
  assert.match(shell,/realtalent_gui\.py/)
  assert.match(shell,/RealTalent-IA-Local\.desktop/)
  assert.match(shell,/QtWebEngineWidgets/)
  assert.match(shell,/exec \/usr\/bin\/python3/)
})
