import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundle = path.resolve(here, '..')
const crmDir = fs.readdirSync(bundle).find((name) => name.startsWith('RealTalent-CRM-') && fs.existsSync(path.join(bundle, name, 'src/features/assistant/assistant-drawer.tsx')))
const checks = []
const test = (name, fn) => {
  try { fn(); checks.push(1); console.log('PASS', name) }
  catch (error) { checks.push(0); console.error('FAIL', name, error instanceof Error ? error.message : String(error)) }
}

test('runtime core V3.1.2 preserved', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'))
  assert.equal(pkg.version, '3.1.2')
})
test('CRM source package found', () => assert.ok(crmDir))

const crm = path.join(bundle, crmDir ?? '')
const drawer = crmDir ? fs.readFileSync(path.join(crm, 'src/features/assistant/assistant-drawer.tsx'), 'utf8') : ''
const css = crmDir ? fs.readFileSync(path.join(crm, 'src/styles/realtalent-assistant-v10067.css'), 'utf8') : ''
const launcher = fs.readFileSync(path.join(bundle, 'abrir-crm-com-agent.sh'), 'utf8')

test('embedded Agent generation preserved', () => { assert.ok(drawer.includes('RealTalent Agent')); assert.ok(drawer.includes('V3.1.4')) })
test('standalone chat removed from CRM primary flow', () => {
  assert.ok(!drawer.includes("window.open('http://127.0.0.1:8791/chat"))
  assert.ok(!drawer.includes('chat?product=crm'))
})
test('drawer is docked non modal', () => {
  assert.ok(drawer.includes('role="complementary"'))
  assert.ok(!drawer.includes('useOverlayDialog'))
  assert.ok(css.includes('pointer-events:none'))
  assert.ok(css.includes('.assistant-drawer{pointer-events:auto}'))
})
test('expand and collapse stay inside CRM', () => {
  assert.ok(drawer.includes('setExpanded'))
  assert.ok(drawer.includes("'Expandir'"))
  assert.ok(drawer.includes("'Recolher'"))
})
test('explain current screen is embedded', () => {
  assert.ok(drawer.includes('explainCurrentScreen'))
  assert.ok(drawer.includes('window.location.pathname'))
  assert.ok(drawer.includes('componentes principais'))
})
test('route aware suggestions', () => {
  assert.ok(drawer.includes('routePrompts'))
  assert.ok(drawer.includes("leads: ['Quais contatos"))
  assert.ok(drawer.includes("pipeline: ['Quais oportunidades"))
  assert.ok(drawer.includes("tasks: ['Quais tarefas"))
  assert.ok(drawer.includes("followups: ['Quais follow-ups"))
})
test('conversation state scoped by workspace', () => {
  assert.ok(drawer.includes('sessionStorage'))
  assert.ok(drawer.includes('sessionKey'))
  assert.ok(drawer.includes('currentWorkspace?.id'))
})
test('route context continues to Native Tools bridge', () => {
  assert.ok(drawer.includes('syncCrmAppContext'))
  assert.ok(drawer.includes('currentRoute: route'))
  assert.ok(drawer.includes('canTeamAccessRecord'))
})
test('technical surfaces remain hidden from normal header', () => {
  assert.ok(drawer.includes('technicalMode'))
  assert.ok(drawer.includes('agentDebug'))
  assert.ok(drawer.includes('<details className="assistant-technical">'))
})
test('normal UI communicates grounded CRM connection', () => {
  assert.ok(drawer.includes('CRM conectado'))
  assert.ok(drawer.includes('ações seguras com confirmação'))
})
test('Chromium optional for normal CRM launch', () => {
  assert.ok(launcher.includes('REALTALENT_MANAGED_BROWSER'))
  assert.ok(launcher.includes('xdg-open'))
  assert.ok(launcher.includes('Chromium não é necessário para uso normal'))
})
test('managed browser still available for Browser QA', () => assert.ok(launcher.includes('launch-managed-browser-linux.sh')))

test('Native Read bridge remains present under V3.1.4', () => {
  assert.ok(drawer.includes('syncCrmAppContext'))
  assert.ok(drawer.includes('canTeamAccessRecord'))
})

const ok = checks.reduce((a, b) => a + b, 0)
console.log(`RESULT ${ok}/${checks.length}`)
if (ok !== checks.length) process.exit(1)
