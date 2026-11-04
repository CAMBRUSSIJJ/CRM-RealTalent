import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const page = fs.readFileSync('src/features/followups/followups-page.tsx','utf8')
const css = fs.readFileSync('src/features/followups/followups-v3.css','utf8')
const cadence = fs.readFileSync('src/features/followups/cadence-modal.tsx','utf8')
const outcome = fs.readFileSync('src/features/followups/outcome-modal.tsx','utf8')
const activity = fs.readFileSync('src/features/followups/activity-modal.tsx','utf8')

test('Follow-ups V3: TSX da página válido',()=>{
  const parsed = ts.createSourceFile('followups-page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; '))
})
test('Follow-ups V3: um único cabeçalho, resumo, navegação e barra de busca, sem código antigo',()=>{
  for(const fragment of ['followups-v3__header','followups-v3__kpis','followups-v3__toolbar','followups-v3__views','followups-v3__search','followups-v3__workspace','followups-v3__queue-panel','followups-v3__context-panel'])assert.ok(page.includes(fragment),fragment)
  for(const legacy of ['followups-page-v10167','followups-page--professional','followup-summary-strip-v10167','followup-navigation-v10168','followup-view-strip-h20','followup-workspace-layout','followup-list-panel','followup-list-header','followup-focus-toolbar','<WorkspacePageHeader','<WorkspaceSummaryMetric','<WorkspaceViewStrip'])assert.ok(!page.includes(legacy),'Layout antigo: '+legacy)
  assert.equal((page.match(/<header className="followups-v3__header"/g)||[]).length,1)
  assert.equal((page.match(/<section className="followups-v3__kpis"/g)||[]).length,1)
  assert.equal((page.match(/<section className="followups-v3__toolbar"/g)||[]).length,1)
  assert.equal((page.match(/<section className="followups-v3__workspace"/g)||[]).length,1)
})
test('Follow-ups V3: cinco indicadores e cinco áreas usam dados reais',()=>{
  for(const fragment of ["stats.overdue","stats.today","stats.upcoming","stats.completed","stats.withoutNext","id: 'queue'","id: 'board'","id: 'calendar'","id: 'cadences'","id: 'performance'","filteredActivities.map((item)","queue.length","performance.outcomeCounts","cadenceGroups"]) assert.ok(page.includes(fragment),fragment)
  for(const dummy of ['Barbearia Alpha','Carlos Almeida','The Bronx','Rafael Martins','rere','usuario@local.crm'])assert.ok(!page.includes(dummy),'Dado fictício incorporado: '+dummy)
})
test('Follow-ups V3: salvamento e edição permanecem conectados ao CRM',()=>{
  for(const fragment of ['completeActivity(','updateActivity(','updateCadenceState(','<ActivityModal','<OutcomeModal','<CadenceModal','<ExecutionWorkspace','<SalesMessageModal','<LazyCallWorkspaceModal','setOutcomeActivity(','setCallLead(','setMessageLead(','setEditing(','openCadence(','quickReschedule(','bulkPostpone(','bulkComplete('])assert.ok(page.includes(fragment),'Integração ausente: '+fragment)
  assert.ok(page.includes("contactBlockedMessage("),'Bloqueio de contato')
  assert.ok(page.includes('lead.doNotContact'),'Restrição comercial')
  assert.ok(page.includes('resolveLeadCallTarget('),'Resolver telefone real')
  assert.ok(outcome.includes('export function OutcomeModal'))
  assert.ok(activity.includes('export function ActivityModal'))
})
test('Follow-ups V3: vistas e cadências funcionais e reutilizáveis',()=>{
  for(const fragment of ['<FollowupBoard','<FollowupCalendar','<CadenceDashboard','<PerformanceDashboard','DEFAULT_CADENCE_TEMPLATES','createCadence(','screen === \'template\'','screen === \'configure\'','screen === \'leads\'']) {
    assert.ok(page.includes(fragment)||cadence.includes(fragment), 'Ferramenta ausente: '+fragment)
  }
  for(const fragment of ['applySavedView(','saveCurrentView(','renameSavedView(','duplicateSavedView(','deleteSavedView(','localStorage.setItem(','WorkspaceFilterMenu','followups-v3__active-filters','followups-v3__filter-drawer'])assert.ok(page.includes(fragment),'Persistência ou filtro ausente: '+fragment)
})
test('Follow-ups V3: contexto selecionado segue filtros e mantém acessibilidade',()=>{
  assert.ok(page.includes('filteredActivities.find((item) => item.activity.id === selectedActivityId)'), 'Detalhes devem acompanhar recorte atual')
  assert.ok(page.includes("setSelectedActivityId(item.activity.id)"), 'Selecionar registro')
  assert.ok(page.includes('onKeyDown={(event) => { if (isKeyboardActivationKey(event.key))'), 'Seleção por teclado')
  assert.ok(page.includes('onClick={() => onOutcome(item.activity)}'), 'Registrar resultado')
  assert.ok(page.includes("onReschedule(item.activity, 'tomorrow')"),'Reagendar')
  assert.ok(page.includes('onWhatsApp(lead)'),'WhatsApp real')
})
test('Follow-ups V3: as quatro visualizações complementares usam contêineres V3',()=>{
  for(const name of ['followups-v3__board','followups-v3__calendar','followups-v3__cadences','followups-v3__performance']) {
    assert.ok(page.includes('className="'+name+'"'),name+' ausente')
    assert.ok(css.includes('.'+name),name+' sem CSS')
  }
  for(const old of ['className="followup-board"','className="panel followup-calendar"','className="cadence-dashboard"','className="performance-dashboard"']) {
    assert.ok(!page.includes(old),'Contêiner antigo renderizado: '+old)
  }
  assert.ok(page.includes('DEFAULT') || page.includes('cadenceEnrollments'),'Dados de cadência reais')
  assert.ok(page.includes('performance.outcomeCounts'),'Desempenho real')
})
test('Follow-ups V3: CSS próprio com grade e responsividade sem vazamento global',()=>{
  assert.ok(page.includes("import './followups-v3.css'"))
  for(const fragment of ['.followups-v3__kpis','.followups-v3__toolbar','.followups-v3__workspace','.followups-v3__queue-list','.followups-v3__context-panel','@media(max-width:970px)','@media(max-width:660px)','html[data-theme="dark"] .followups-v3']) assert.ok(css.includes(fragment),fragment)
  assert.ok(!/(^|\n)\s*(body\s*\{|html\s*\{|:root\s*\{|\*\s*\{)/m.test(css))
  let n=0
  for(const char of css) { n+=char==='{'?1:char==='}'?-1:0;assert.ok(n>=0) }
  assert.equal(n,0)
})
