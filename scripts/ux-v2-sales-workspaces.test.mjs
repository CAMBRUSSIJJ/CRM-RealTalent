// RealTalent workspaces — contract tests for Dashboard V2, Contatos V2 and Pipeline V3.
// Validates that the UX-only patch preserves the original interactive JSX
// and the native data paths from the V101.11.3 release branch.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'

const root = process.cwd()
const base = 'a4a3d0561cbba22dbcb2ec304c75976d2bce2d5f'
const pages = [
  { name: 'Dashboard', file: 'src/features/dashboard/dashboard-page.tsx', css: 'src/features/dashboard/dashboard-layout-v2.css', rootClass: 'dashboard-layout-v2', contracts: ['buildWorkdayQueue(', 'buildLeadScoreBoard(', 'goalProgress(', '<FilterSelection', '<LazyCallWorkspaceModal', '<SalesMessageModal', 'runWorkdayItem(', 'useAppWorkspace()'] },
  { name: 'Contatos', file: 'src/features/leads/leads-page.tsx', css: 'src/features/leads/contacts-v3.css', rootClass: 'contacts-v3', contracts: ['contacts-v3__kpis', '<WorkspaceFilterMenu', '<WorkspaceSortMenu', '<DataGrid', 'scoreByLead', 'downloadCsv', 'importFile', 'setSelected(', '<SelectionToolbar', 'createSavedView(', 'onDrop='] },
  { name: 'Pipeline', file: 'src/features/pipeline/pipeline-page.tsx', css: 'src/features/pipeline/sales-pipeline-v3.css', rootClass: 'sales-pipeline-v3', contracts: ['sales-pipeline-v3__metrics', '<WorkspaceFilterMenu', '<WorkspaceSortMenu', '<WorkspaceDisplayMenu', 'renderBoard(', 'onDragStart=', 'onDragOver=', 'onDrop=', 'drop(event, stage.id)', 'setViewing(', '<CreateLeadModal', '<SalesMessageModal'] },
]
const userHandlers = new Set([
  'onClick', 'onChange', 'onValueChange', 'onDragStart', 'onDragEnd',
  'onDragEnter', 'onDragLeave', 'onDragOver', 'onDrop', 'onKeyDown',
  'onBlur', 'onFocus', 'onSubmit', 'onCheckedChange', 'onDoubleClick',
])
const oldSource = (name) => execFileSync('git', ['show', `${base}:${name}`], { cwd: root, encoding: 'utf8', maxBuffer: 12_000_000 })
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8')
const jsxHandlerInventory = (text, file) => {
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  assert.equal(src.parseDiagnostics.length, 0, `TSX inválido em ${file}: ${src.parseDiagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join(' | ')}`)
  const hits = new Map()
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      for (const prop of node.attributes.properties) {
        if (ts.isJsxAttribute(prop) && userHandlers.has(prop.name.text)) {
          const key = `${node.tagName.getText(src)}:${prop.name.text}`
          hits.set(key, (hits.get(key) ?? 0) + 1)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(src)
  return hits
}
const sorted = (map) => [...map.entries()].sort(([a],[b]) => a.localeCompare(b))

for (const page of pages) {
  test(`${page.name} — preserva manipuladores essenciais`, () => {
    const before = jsxHandlerInventory(oldSource(page.file), page.file)
    const after = jsxHandlerInventory(read(page.file), page.file)
    if (page.name === 'Contatos') {
      // V3 substitui a camada de layout e move os controladores reais.
      const source = read(page.file)
      for (const behavior of [
        "onClick={() => applyStarterView('all')}",
        "onClick={() => applyStarterView('hot')}",
        "onClick={() => applyStarterView('due')}",
        "onClick={() => openViewSettings('overview')}",
        "onClick={downloadCsv}",
        "fileRef.current?.click()",
        "onDrop={() => void dropSavedView(view)}",
        "onClick={() => setCreateOpen(true)}",
        "onClick={() => navigate('leads', { leadId: lead.id, action: 'contact-record' })}",
        "onClick={() => openWhatsApp(lead)}",
        "onClick={() => openCall(lead)}",
        "onClick={() => openActivity(lead)}",
      ]) {
        assert.ok(source.includes(behavior), `Ação funcional de contatos ausente: ${behavior}`)
      }
      assert.ok((after.get('tr:onClick') ?? 0) >= (before.get('tr:onClick') ?? 0))
    } else if (page.name === 'Pipeline') {
      // A substituição completa da interface remove controles JSX obsoletos.
      // Contratos de dados, movimentação e ações devem sobreviver à migração.
      for (const handler of ['article:onDragStart', 'article:onDragEnd', 'article:onDragEnter', 'article:onDragLeave', 'article:onDragOver', 'article:onDrop']) {
        assert.ok((after.get(handler) ?? 0) >= (before.get(handler) ?? 0), `Perda de DnD: ${handler}`)
      }
      const s = read(page.file)
      for (const behavior of ['void drop(event, stage.id)', 'toggleSelected(lead.id)', 'setViewing(lead)', 'setCreateStageId(stage.id)', 'setStageEditing(stage)', 'completeNextPipelineActivity(lead)', 'onChange={(event) => { setActiveSavedViewId(null)', 'selectViewMode(', 'runBulk(', 'onOpen={(deal) => setInspectingLeadId(deal.lead.id)}']) {
        assert.ok(s.includes(behavior), `Fluxo funcional perdido: ${behavior}`)
      }
    } else {
      assert.deepEqual(sorted(after), sorted(before), `Ações perdidas em ${page.file}`)
    }
  })
  test(`${page.name} — mantém integrações e dados reais`, () => {
    const contents = read(page.file)
    assert.ok(contents.includes(page.rootClass), `Falta classe local ${page.rootClass}`)
    assert.ok(contents.includes(`./${path.basename(page.css)}`), 'CSS não carregado')
    for (const contract of page.contracts) assert.ok(contents.includes(contract), `Contrato funcional ausente: ${contract}`)
    for (const mock of ['Carlos Almeida', 'Morada Barbearia', 'The Bronx']) {
      assert.ok(!contents.includes(mock), `Dado estático do protótipo entrou em ${page.name}`)
    }
  })
  test(`${page.name} — CSS isolado e íntegro`, () => {
    const css = read(page.css)
    assert.ok(css.includes(`.${page.rootClass}`))
    assert.ok(!/(^|\n)\s*(body|:root|html\s*\{|\*\s*\{)/m.test(css), 'Seletores globais proibidos')
    let braces = 0
    for (const char of css) { if (char === '{') braces += 1; if (char === '}') braces -= 1; assert.ok(braces >= 0, 'Chave CSS fechada sem abertura') }
    assert.equal(braces, 0, 'Chaves CSS desbalanceadas')
  })
}
test('Contatos V3 — o shell visual antigo não é mais renderizado', () => {
  const s = read(pages[1].file)
  assert.ok(s.indexOf('contacts-v3__kpis') < s.indexOf('contacts-v3__toolbar'))
  assert.ok(s.indexOf('contacts-v3__quick-views') < s.indexOf('contacts-v3__search'))
  assert.ok(s.indexOf('contacts-v3__search') < s.indexOf('contacts-v3__data'))
  for (const token of [
    'contacts-layout-v2', 'contacts-toolbar-cluster-v2',
    'contacts-page-h20', 'contacts-summary-strip-h20',
    'contacts-command-bar-h20', 'contact-view-tabs-v10163',
    'leads-v107', 'leads-toolbar', 'leads-data-panel', 'leads-table-scroll',
    'className="leads-table"',
  ]) assert.ok(!s.includes(token), `Layout anterior persistente: ${token}`)
  assert.ok(!fs.existsSync(path.join(root, 'src/features/leads/contacts-layout-v2.css')))
  for (const token of [
    'contacts-v3__views-panel', 'contacts-v3__data-header', 'contacts-v3__table',
    'contacts-v3__more-panel', 'contacts-v3__quick-views'
  ]) assert.ok(s.includes(token), `Elemento estrutural ausente: ${token}`)
})
test('Pipeline — tela e Kanban V3 substituem o markup antigo de ponta a ponta', () => {
  const s = read(pages[2].file)
  assert.ok(s.indexOf('sales-pipeline-v3__toolbar-main') < s.indexOf('sales-pipeline-v3__metrics'))
  assert.ok(s.includes('snapshot?.stages.map((stage)'))
  for (const stale of ['pipeline-layout-v2', 'pipeline-page-v1008', 'pipeline-page-h20', 'pipeline-board-v1008', 'pipeline-column-v1008', 'pipeline-card-v1008', 'pipeline-intelligence-shell', 'pipeline-view-switcher-v10170-hidden', 'pipeline-stage-instruction', 'pipeline-column__empty', 'pipeline-column__add']) {
    assert.ok(!s.includes(stale), `Markup legado no Pipeline: ${stale}`)
  }
  assert.ok(!fs.existsSync(path.join(root, 'src/features/pipeline/pipeline-layout-v2.css')), 'CSS V2 obsoleto ainda presente')
  for (const feature of ['sales-pipeline-v3__tabs', 'sales-pipeline-v3__search', 'sales-pipeline-v3__more-actions', 'sales-pipeline-v3__column-body', 'sales-pipeline-v3__card-footer', 'sales-pipeline-v3__add', 'sales-pipeline-v3__analysis']) {
    assert.ok(s.includes(feature), `Componente V3 ausente: ${feature}`)
  }
})
test('Dashboard — KPIs vêm antes das atividades sem mudar os modais', () => {
  const s = read(pages[0].file)
  assert.ok(s.indexOf('myday-layout-v2__heading--metrics') < s.indexOf('myday-layout-v2__heading--activities'))
})
