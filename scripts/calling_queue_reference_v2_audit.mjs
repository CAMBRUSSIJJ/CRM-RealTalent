import assert from 'node:assert/strict'
import fs from 'node:fs'

const page = fs.readFileSync('src/features/calls/calls-page.tsx', 'utf8')
const css = fs.readFileSync('src/features/calls/calls-queue-reference-v2.css', 'utf8')
const prepare = fs.readFileSync('src/features/calls/call-session-preparation-modal.tsx', 'utf8')
const focus = fs.readFileSync('src/features/calls/call-workspace-modal.tsx', 'utf8')
const checks = [
  ['actual CallsPage imports the operational redesign', page.includes("import './calls-queue-reference-v2.css'")],
  ['new operational view rendered on the real /calls route', page.includes('data-realtalent-calls-queue-ui="reference-v2"')],
  ['large separate Next lead dashboard is no longer rendered', !page.includes('<section className="panel calls-command-center-v10171">')],
  ['duplicate KPI summary removed from operation but available on other tabs', page.includes("view !== 'operation' ? <>") && page.includes('<WorkspaceSummaryStrip className="calls-summary-strip-h20">')],
  ['queue continues using actual CRM data and selected workspace', page.includes('buildCallQueue(snapshot?.leads') && page.includes('currentWorkspace?.id')],
  ['queue preserves search, views, density and advanced filters', page.includes('<WorkspaceCommandBar className="calls-operation-command-h20">') && page.includes('<WorkspaceDisplayMenu') && page.includes('<FilterWorkspaceViewStrip') && page.includes('WorkspaceFilterChips') && page.includes('setMoreFiltersOpen(true)')],
  ['selection preserves actual state rather than a demo checkbox', page.includes('selectedQueueIds.includes(entry.lead.id)') && page.includes('toggleQueueLead(entry.lead.id)') && page.includes('aria-pressed={selected}')],
  ['each call action opens the real preparation workflow', page.includes('requestSession(entry.lead.id, [entry.lead.id])') && page.includes('<CallSessionPreparationModal open={canWrite && preparationOpen}')],
  ['next action and contact navigation remain interactive', page.includes('executeSuggestedAction(entry.lead.id, suggestion.kind)') && page.includes("navigate('leads', { leadId: entry.lead.id })")],
  ['full call records, intelligence and settings tabs remain available', page.includes("<CallsIntelligencePanel") && page.includes("<CallsSettingsPanel") && page.includes("<CallHistoryDetailModal")],
  ['actual four-step wizard remains', prepare.includes("['queue', 'settings', 'strategy', 'review']")],
  ['redesigned pre-call focus remains', focus.includes('data-realtalent-calling-ui="focus-redesign-v2"')],
  ['queue is responsive', css.includes('@media(max-width:1050px)') && css.includes('@media(max-width:690px)')],
  ['no demo company or fixed contact is introduced', !page.includes('Barbearia Alpha') && !page.includes('Carlos Almeida')],
]
for (const [label, ok] of checks) {
  console.log((ok ? 'OK' : 'FAIL') + ' — ' + label)
  assert.ok(ok, label)
}
console.log('RealTalent Calling Operational Queue v2: ' + checks.length + '/' + checks.length + ' contracts.')
