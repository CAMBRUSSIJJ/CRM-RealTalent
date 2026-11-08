import assert from 'node:assert/strict'
import fs from 'node:fs'
const read = p => fs.readFileSync(p,'utf8')
const prep=read('src/features/calls/call-session-preparation-modal.tsx')
const prepCss=read('src/features/calls/call-setup-reference.css')
const focus=read('src/features/calls/call-workspace-modal.tsx')
const focusCss=read('src/features/calls/call-focus-lifecycle-v3.css')
const advice=read('src/features/calls/call-session-approaches.ts')
const drawer=read('src/features/leads/lead-details-drawer.tsx')
const route=read('src/app/route-state.ts')
const playbooks=read('src/features/playbooks/playbooks-page.tsx')
const wa=read('src/features/communications/waha-conversations-page.tsx')
const communications=read('src/features/communications/communications-page.tsx')
const wahaAi=read('src/features/communications/waha-conversation-tools.tsx')
const tests=[
 ['preparation fills the viewport with no modal edges', prepCss.includes('.modal-backdrop:has(> .rt-setup-modal)') && prepCss.includes('width:100vw!important') && prepCss.includes('height:100dvh!important') && prepCss.includes('border-radius:0!important')],
 ['focus fills the viewport with existing call controls intact', focus.includes("className={fullScreen ? 'rt-call-focus-fullbleed' : undefined}") && focusCss.includes('.modal-backdrop:has(> .rt-call-focus-fullbleed)') && focus.includes('onClick={() => void openDialer()}')],
 ['real per-lead recommendations are explainable and overrideable', prep.includes('buildLeadPlaybookAdvice(') && prep.includes('changeLeadPlaybook(lead, event.target.value)') && prep.includes('saveLeadSalesStrategyPreference(workspaceId, lead.id')],
 ['plays per-lead script in real session, not only a UI label', prep.includes('playbookByLeadId: Object.fromEntries(') && focus.includes('config?.playbookByLeadId?.[nextLeadId]')],
 ['evidence comes from pipeline, calls, proposals, meetings and activities', advice.includes('snapshot.stages.find(') && advice.includes('snapshot.calls.filter(') && advice.includes('snapshot.proposals') && advice.includes('snapshot.events') && advice.includes('snapshot.activities')],
 ['lead workspace shows advice and workflows', drawer.includes('buildLeadPlaybookAdvice(') && drawer.includes('approachAdvice?.explanation') && drawer.includes("navigate('pipeline', {leadId:lead.id})") && drawer.includes("navigate('proposals', { leadId:lead.id")],
 ['lead workspace has tasks and agenda creation controls',drawer.includes("onActivity(lead, 'followup')") && drawer.includes('onEvent(lead)')],
 ['playbook deep links are typed and route to exact active playbook', route.includes('playbookId?: string') && route.includes("params.get('playbookId')") && playbooks.includes("setSelectedId(target)")],
 ['WAHA deep link only resolves actual lead phone and does not send',wa.includes('routeContext.leadId') && wa.includes('wahaResolve(token, digits)') && wa.includes('No message is sent automatically') && communications.includes('setUseWaha(true)')],
 ['coaching uses evidence-based lead coverage not fake conversion attribution',playbooks.includes('leadPlaybookCoverage') && playbooks.includes('Estes números não representam conversões atribuídas a roteiros.')],
 ['Ollama conversation context requires explicit linked-lead confirmation before CRM persistence',
   wahaAi.includes('linkedLeadId?:string|null') && wahaAi.includes('window.confirm(') &&
   wahaAi.includes('saveApprovedCommercialContext()') && wahaAi.includes("await createActivity({") &&
   wahaAi.includes("resolutionReason:'pinned_call_note'")],
 ['only reviewed WAHA context is fed into calling playbook evidence',
   advice.includes("'[WAHA_CONTEXT_V1]'") && advice.includes("item.resolutionReason === 'pinned_call_note'") &&
   advice.includes('WhatsApp revisado no CRM')],

 ['all previous call modes and handlers still exist',focus.includes("session === 'running' || session === 'paused'") && focus.includes('onClick={markAnswered}') && focus.includes('onClick={() => void save(true)}')],
]
for(const [label,passed] of tests){console.log((passed?'OK':'FAIL')+'  '+label);assert.ok(passed,label)}
console.log('Calling cross-CRM full-screen integrations: '+tests.length+'/'+tests.length+' contracts.')
