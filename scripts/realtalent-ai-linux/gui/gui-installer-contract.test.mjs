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
