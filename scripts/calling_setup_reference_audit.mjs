import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (file) => fs.readFileSync(file, 'utf8')
const wizard = read('src/features/calls/call-session-preparation-modal.tsx')
const wizardCss = read('src/features/calls/call-setup-reference.css')
const display = read('src/features/calls/call-display-preferences-modal.tsx')
const displayCss = read('src/features/calls/call-display-reference.css')
const approach = read('src/features/calls/call-session-approaches.ts')
const runtime = read('src/features/calls/call-workspace-modal.tsx')
const config = read('src/features/calls/call-session-config.ts')
const preferences = read('src/services/call-display-preferences.ts')

const checks = [
  ['uploaded wizard layout integrated into real modal',wizard.includes('data-realtalent-setup-ui="reference-exact-v1"') && wizard.includes('className="rt-setup-modal"')],
  ['stepper contains exact four stages and functional navigation', ['Quem ligar','Como ligar','Roteiro e objetivo','Revisar'].every(x=>wizard.includes(x)) && wizard.includes('onClick={nextStep}') && wizard.includes('onClick={previousStep}')],
  ['real search and filters remain interactive', wizard.includes('value={query}') && wizard.includes('onChange={(event) => setQuery(event.target.value)}') && wizard.includes('<WorkspaceFilterMenu')],
  ['selectable leads are real CRM candidates', wizard.includes('visibleLeads.map((lead)') && wizard.includes('selectedIds.includes(lead.id)') && wizard.includes('onChange={() => toggleLead(lead.id)}')],
  ['automatic approach classification can be overridden per contact', wizard.includes('classifyCallApproach(') && wizard.includes('setLeadApproach(lead.id') && approach.includes('classifyCallApproach(')],
  ['each selected contact gets a real CRM playbook', wizard.includes('playbookFor(lead)') && wizard.includes('playbookByLeadId: Object.fromEntries(') && approach.includes('recommendPlaybooks(active')],
  ['runtime changes script by contact without replacing session state machine', runtime.includes('config?.playbookByLeadId?.[nextLeadId]') && runtime.includes('config.playbookByLeadId?.[startingId]') && config.includes('playbookByLeadId?: Record<string, string>')],
  ['reference-style automation switches update real state', wizard.includes('setSmartWrap(!smartWrap)') && wizard.includes('setFastDial(!fastDial)') && wizard.includes("startsWith('connect:phone:')")],
  ['focus personalization opens real overlay',wizard.includes('onClick={() => setDisplayOpen(true)}') && wizard.includes('<CallDisplayPreferencesModal open={displayOpen}')],
  ['personalization has six toggles and a live preview',display.includes('data-realtalent-display-preview="live-v1"') && ['showScriptProgress','showObjections','showHistory','showNotes','showTimer','showRecording'].every(x=>display.includes(x)) && display.includes('checked={draft[item.key]}')],
  ['save/restore are real preference operations', display.includes('onSave(normalizeCallDisplayPreferences(draft))') && display.includes('DEFAULT_CALL_DISPLAY_PREFERENCES')],
  ['timer visibility is persisted and reflected in real UI', preferences.includes('showTimer: boolean') && preferences.includes('showTimer: true') && runtime.includes('rt-call-timer-hidden')],
  ['strategy goal and Focus/Power buttons have real state',wizard.includes('value={sessionObjective}') && wizard.includes("setSessionMode('focus')") && wizard.includes("setSessionMode('power')")],
  ['commercial goal and queue sorting are real controls',wizard.includes('setGoal(Math.max(') && wizard.includes('setOrder(event.target.value as QueueOrder)')],
  ['review uses actual selected leads and assigned scripts',wizard.includes('orderedSessionLeads.map((lead)') && wizard.includes('playbookFor(lead)?.title') && wizard.includes('providerLabel(voiceSettings.defaultProviderId)')],
  ['review phone readiness and blockers are not fabricated',wizard.includes('voiceReadiness') && wizard.includes('rowFlags(lead).duplicate') && wizard.includes('rowFlags(lead).contactedToday')],
  ['final CTA still starts actual CRM calling session', wizard.includes('onClick={start}') && wizard.includes('onStart({') && wizard.includes('saveCallDisplayPreferences(workspaceId, display)')],
  ['visuals match reference geometry and responsive',wizardCss.includes('grid-template-columns:2fr 1fr') && wizardCss.includes('grid-template-columns:minmax(0,2fr) minmax(265px,1fr)') && displayCss.includes('grid-template-columns:1fr 1fr') && wizardCss.includes('@media(max-width:820px)')],
  ['no hardcoded mock customers copied',!wizard.includes('Barbearia Alpha') && !wizard.includes('Carlos Almeida')],
]
for (const [name,ok] of checks) {
  console.log((ok ? 'OK' : 'FAIL') + ' — ' + name)
  assert.ok(ok,name)
}
console.log('RealTalent Setup Wizard reference: '+checks.length+'/'+checks.length+' contracts passed.')
