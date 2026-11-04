import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import ts from 'typescript'

const page = fs.readFileSync('src/features/metrics/metrics-page.tsx','utf8')
const style = fs.readFileSync('src/features/metrics/metrics-v3.css','utf8')
const service = fs.readFileSync('src/services/metrics.ts','utf8')

test('Métricas V3 — JSX parseia e importa a única folha principal', () => {
  const parsed = ts.createSourceFile('metrics-page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '))
  assert.ok(page.includes("import './metrics-v3.css'"))
})
test('Métricas V3 — cabeçalho, navegação e seleção de período substituem o antigo layout', () => {
  for(const token of ['metrics-v3__header','metrics-v3__navigation','metrics-v3__tabs','metrics-v3__period','metrics-v3__body','metrics-v3__scope']){
    assert.ok(page.includes(token),'Elemento de apresentação não encontrado: '+token)
  }
  for(const token of ['metrics-page-v10167','metrics-page--intelligence','metrics-section-nav-v10171','metrics-toolbar-v10171','metrics-current-scope-v10167','workspace-page-header-v10167','metrics-kpi-strip']){
    assert.ok(!page.includes(token),'Apresentação obsoleta sobreposta: '+token)
  }
  assert.equal((page.match(/<header className="metrics-v3__header"/g)||[]).length,1)
  assert.ok(page.includes("onChange={(event) => setDays(Number(event.target.value))}"))
  for(const label of ['Visão executiva','Funil','Perdas','Atividades','Previsão']){
    assert.ok(page.includes(label),'Navegação ausente: '+label)
  }
})
test('Métricas V3 — cinco KPIs são calculados a partir do CRM, nunca de dados do protótipo', () => {
  assert.equal((page.match(/<article className="metrics-v3__kpi"/g)||[]).length,5)
  for(const token of ['current.leads.length','current.revenue','current.contactRate','current.conversion','current.proposals','ComparisonBadge comparison={comparisons.proposals}']){
    assert.ok(page.includes(token),'KPI real ausente: '+token)
  }
  assert.ok(!page.includes('Pipeline Ativo: R$ 14.900'))
  assert.ok(!page.includes('Segunda-feira</p>'))
  assert.ok(!page.includes('19:00</p>'))
  assert.ok(service.includes('calculateCommercialMetrics'))
})
test('Métricas V3 — não remove análises, comparações, exportação e integrações existentes', () => {
  for(const token of ['calculateCommercialMetrics(','calculateForecast(','calculateFunnelIntelligence(','calculateLossAnalysis(','calculateActivityIntelligence(','calculateOwnerPerformance(','calculateSourcePerformance(','generateMetricsAlerts(','calculateTrend(','compareMetric(','<VisualFunnel','<StageModal','onOpenLead={(leadId) => navigate(\'pipeline\'','onClick={downloadReport}','onClick={() => window.print()}','<WorkspaceFilterMenu','<WorkspaceAdvancedFilterDrawer','<WorkspaceFilterChips','<NativeSelectionSelect','activeGoals.map(','outcomes.map(','losses.map(','sources.slice(','owners.slice(','trend.map(']){
    assert.ok(page.includes(token),'Função ou relatório perdido: '+token)
  }
})
test('Métricas V3 — UI do CRM é responsiva e CSS não vaza para outras abas', () => {
  for(const token of ['.metrics-v3__executive-cards','.metrics-v3__navigation','.metrics-v3__kpi','.metrics-v3__body','@media(max-width:850px)','@media print','html[data-theme="dark"] .metrics-v3']){
    assert.ok(style.includes(token),'Estilo ausente: '+token)
  }
  assert.ok(!/(^|\n)\s*(body\s*\{|html\s*\{|:root\s*\{|\*\s*\{)/m.test(style))
  let level=0
  for(const ch of style){level+=ch==='{'?1:ch==='}'?-1:0;assert.ok(level>=0)}
  assert.equal(level,0)
})
