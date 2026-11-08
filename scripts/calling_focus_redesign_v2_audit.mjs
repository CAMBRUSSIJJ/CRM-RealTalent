import assert from 'node:assert/strict'
import fs from 'node:fs'
const focus = fs.readFileSync('src/features/calls/call-workspace-modal.tsx', 'utf8')
const css = fs.readFileSync('src/features/calls/call-focus-redesign.css', 'utf8')
const page = fs.readFileSync('src/features/calls/calls-page.tsx', 'utf8')
const checks = [
  ['the actual React call modal imports the new stylesheet', focus.includes("import './call-focus-redesign.css'")],
  ['the idle workspace is a new semantic hero, not old four-column header', focus.includes('data-realtalent-calling-ui="focus-redesign-v2"') && focus.includes("session === 'idle' ? <section className=\"rt-call-focus-v2__hero\"")],
  ['live call keeps original toolbar, controls and state machine', focus.includes(': <section className="calling-v982__topbar calling-flow__hero"') && focus.includes("session === 'running' || session === 'paused'")],
  ['contact hero uses actual CRM lead and company', focus.includes('rt-call-focus-v2__contact-panel') && focus.includes('{callTargetName ||') && focus.includes('selectedLead?.company')],
  ['main dial button executes the original phone action', focus.includes('className="rt-call-focus-v2__dial-button" loading={voiceBusy} onClick={() => void openDialer()} disabled={!callTargetPhone || !voiceLaunchAvailable}')],
  ['two-column objective and important notes are independent cards', focus.includes('rt-call-focus-v2__context-grid') && focus.includes('rt-call-focus-v2__objective') && focus.includes('rt-call-focus-v2__important')],
  ['history spans full width and uses real CRM timeline', focus.includes('rt-call-focus-v2__history') && focus.includes('recentHistory.slice(0, 2)') && css.includes('grid-column:1/-1')],
  ['no hardcoded demo contacts exist', !focus.includes('Barbearia Alpha') && !focus.includes('Carlos Almeida') && page.includes('buildCallQueue(')],
  ['responsive desktop hero and mobile stacking are explicit', css.includes('.rt-call-focus-v2__contact-panel') && css.includes('@media(max-width:680px)')],
  ['blue RealTalent branding is used throughout new layout', css.includes('var(--accent, #3156c8)') && css.includes('.rt-call-focus-v2__priority')],
  ['old compact styles only apply to non-idle contexts or via explicit classes', css.includes('.calling-v10171--idle .rt-call-focus-v2__context-grid')],
]
for (const [label, pass] of checks) {
 console.log((pass ? 'OK' : 'FAIL') + ' — ' + label)
 assert.ok(pass, label)
}
console.log('RealTalent Focus Redesign v2: ' + checks.length + '/' + checks.length + ' structural contracts passed.')
