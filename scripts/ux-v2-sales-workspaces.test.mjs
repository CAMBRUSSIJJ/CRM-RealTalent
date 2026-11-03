// RealTalent sales workspaces V2 — source regression contracts.
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
  { name: 'Contatos', file: 'src/features/leads/leads-page.tsx', css: 'src/features/leads/contacts-layout-v2.css', rootClass: 'contacts-layout-v2', contracts: ['<WorkspaceSummaryMetric', '<WorkspaceFilterMenu', '<WorkspaceSortMenu', '<DataGrid', 'scoreByLead', 'downloadCsv', 'importFile', 'setSelected(', '<SelectionToolbar', 'createSavedView(', 'onDrop='] },
  { name: 'Pipeline', file: 'src/features/pipeline/pipeline-page.tsx', css: 'src/features/pipeline/pipeline-layout-v2.css', rootClass: 'pipeline-layout-v2', contracts: ['<WorkspaceSummaryMetric', '<WorkspaceFilterMenu', '<WorkspaceSortMenu', '<WorkspaceDisplayMenu', 'renderBoard(', 'onDragStart=', 'onDragOver=', 'onDrop=', 'drop(event, stage.id)', 'setViewing(', '<CreateLeadModal', '<SalesMessageModal'] },
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
  test(`${page.name} — mantém os mesmos manipuladores JSX da base V101.11.3`, () => {
    const before = jsxHandlerInventory(oldSource(page.file), page.file)
    const after = jsxHandlerInventory(read(page.file), page.file)
    assert.deepEqual(sorted(after), sorted(before), `Ações perdidas ou adicionadas fora do escopo em ${page.file}`)
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
test('Contatos — visualizações e comandos estão agrupados sem apagar pesquisa', () => {
  const s = read(pages[1].file)
  assert.ok(s.indexOf('contacts-toolbar-cluster-v2') < s.indexOf('<WorkspaceCommandBar'))
  assert.ok(s.indexOf('<section className="lead-view-tabs') < s.indexOf('<WorkspaceCommandBar'))
})
test('Pipeline — visões e filtros são exibidos antes dos KPIs, com etapas dinâmicas', () => {
  const s = read(pages[2].file)
  assert.ok(s.indexOf('<WorkspaceCommandBar') < s.indexOf('<WorkspaceSummaryStrip'))
  assert.ok(s.includes('snapshot?.stages.map((stage)'))
})
test('Dashboard — KPIs vêm antes das atividades sem mudar os modais', () => {
  const s = read(pages[0].file)
  assert.ok(s.indexOf('myday-layout-v2__heading--metrics') < s.indexOf('myday-layout-v2__heading--activities'))
})
