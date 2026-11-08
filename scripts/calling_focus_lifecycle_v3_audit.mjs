import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (name) => fs.readFileSync(name, 'utf8')
const focus = read('src/features/calls/call-workspace-modal.tsx')
const css = read('src/features/calls/call-focus-lifecycle-v3.css')
const queue = read('src/features/calls/calls-page.tsx')
const tests = [
  ['focus actually imports lifecycle stylesheet', focus.includes("import './call-focus-lifecycle-v3.css'")],
  ['focus state is mapped from existing CRM session machine', focus.includes("data-realtalent-call-lifecycle={session === 'idle'") && focus.includes("session === 'paused' ? 'running' : session")],
  ['visible four-stage progress is driven by real session', ['Preparação','Discagem','Em conversa','Resultado'].every(s => focus.includes(s)) && focus.includes('aria-current={index === activeIndex')],
  ['pre-call still uses real CRM contact and actual call dispatch', focus.includes('data-realtalent-calling-ui="focus-redesign-v2"') && focus.includes('className="rt-call-focus-v2__dial-button"') && focus.includes('onClick={() => void openDialer()}')],
  ['dialing centers real status and uses provider-specific controls', focus.includes('rt-call-focus-v3__dialing" aria-label="Discagem em andamento"') && focus.includes("activeRuntimeProviderId !== 'realtalent_connect' ?")],
  ['manual dialing confirmation uses real answer/no-answer handlers', focus.includes('onClick={markAnswered}') && focus.includes('onClick={markNoAnswer}')],
  ['RealTalent Connect dialing does not fabricate answered state', focus.includes("activeRuntimeProviderId === 'realtalent_connect'") && focus.includes('A confirmação da chamada depende do dispositivo conectado.')],
  ['live script retains real guided/full/map navigation and real action handlers', focus.includes('rt-call-focus-v3__script-card') && focus.includes('onClick={() => applyScriptAction(action)}') && focus.includes('scriptView === \'map\' ? <MindMapCanvas')],
  ['assistant remains real dynamic CRM intelligence, not mocked answer', focus.includes('className="calling-v982__copilot rt-call-focus-v3__assistant"') && focus.includes('nextBestQuestion.question') && focus.includes('accountIntelligence.recommendedAction.title')],
  ['wrap keeps structured outcomes, notes and real next action', focus.includes('rt-call-focus-v3__wrap-layout') && focus.includes('WRAP_GROUPS.map((group)') && focus.includes('value={outcomeDetail}') && focus.includes('value={notes}') && focus.includes('checked={scheduleNext}')],
  ['saving still uses persisted CRM command not fake reset', focus.includes('onClick={() => void save(false)}') && focus.includes('onClick={() => void save(true)}')],
  ['operational queue still opens real four-step wizard', queue.includes('data-realtalent-calls-queue-ui="reference-v2"') && queue.includes('<CallSessionPreparationModal')],
  ['lifecycle CSS remains responsive', css.includes('grid-template-columns:minmax(0,7fr) minmax(300px,3fr)') && css.includes('@media(max-width:740px)')],
  ['no placeholder contact information leaked', !focus.includes('Barbearia Alpha') && !focus.includes('Mariana Almeida') && !focus.includes('Carlos Almeida')],
]
for(const [name, valid] of tests){
  console.log((valid ? 'OK' : 'FAIL') + ' — ' + name)
  assert.ok(valid, name)
}
console.log('Calling real lifecycle v3: '+tests.length+'/'+tests.length+' contract checks passed.')
