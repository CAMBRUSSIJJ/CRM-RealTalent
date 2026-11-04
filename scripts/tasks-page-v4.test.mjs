import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import ts from 'typescript'

const page = fs.readFileSync('src/features/tasks/tasks-page.tsx', 'utf8')
const css = fs.readFileSync('src/features/tasks/tasks-page-v4.css', 'utf8')
const form = fs.readFileSync('src/features/tasks/task-modal.tsx', 'utf8')

test('Tarefas V4 — JSX sintaticamente válido', () => {
  const source = ts.createSourceFile('tasks-page.tsx', page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  assert.equal(source.parseDiagnostics.length, 0, source.parseDiagnostics.map(error => ts.flattenDiagnosticMessageText(error.messageText, ' ')).join('; '))
})
test('Tarefas V4 — quadro é a visualização inicial, com um único cabeçalho', () => {
  assert.ok(page.includes("const [view, setView] = useState<ViewMode>('board')"))
  assert.ok(page.includes("const [layout, setLayout] = useState<TaskLayout>('board')"))
  for (const feature of ['tasks-page-v4__header','tasks-page-v4__new','tasks-page-v4__toolbar','tasks-page-v4__board','tasks-page-v4__column','tasks-page-v4__search']) {
    assert.ok(page.includes(feature), 'Elemento visual ausente: ' + feature)
  }
  for (const previous of ['tasks-summary-strip-h223h1','tasks-view-strip-h223h1','tasks-page-v101112','className="work-toolbar','className="work-task-board"']) {
    assert.ok(!page.includes(previous), 'Layout antigo ainda ativo: ' + previous)
  }
})
test('Tarefas V4 — barra única mantém filtros reais e visualização em lista', () => {
  for (const key of ['setQuery(event.target.value)','setOwner(event.target.value)','setTeamId(event.target.value)','setPriority(event.target.value)','switchLayout(\'list\')','switchLayout(\'board\')','toggleTaskFilter(\'today\')','toggleTaskFilter(\'overdue\')','toggleTaskFilter(\'blocked\')','toggleTaskFilter(\'completed\')']) {
    assert.ok(page.includes(key), 'Controle sem ação: '+key)
  }
  assert.ok(page.includes("view === 'today' && !(OPEN_STATUSES.includes"))
  assert.ok(page.includes("view === 'overdue' && !("))
  assert.ok(page.includes("view === 'blocked' && task.status !== 'blocked'"))
  assert.ok(page.includes("view === 'completed' && task.status !== 'completed'"))
  assert.ok(page.includes('tasks-page-v4__list'))
})
test('Tarefas V4 — quadro usa tarefas reais com drag/drop e alteração persistida', () => {
  for (const key of ['loadWorkManagement(repositoryMode, workspaceId)','saveTask(repositoryMode,workspaceId','updateTaskStatus(repositoryMode,workspaceId','deleteTask(repositoryMode,workspaceId','tasks.filter((task)=>task.status===column.status)','dataTransfer.setData(\'application/x-realtalent-task-id\'','onDrop={(event)=>moveTask(event,column.status)','setDropTarget(null)','onStatus(task, target)','<TaskCommunicationState','<NativeSelectionSelect value={task.status}']) {
    assert.ok(page.includes(key), 'Função operacional ausente: '+key)
  }
})
test('Tarefas V4 — preserva permissões, notificações e formulário único', () => {
  for (const key of ["canTeamAccess('create','tasks')","canTeamAccess('edit','tasks')","canTeamAccess('delete','tasks')","canTeamAccessRecord('tasks'","flushTaskNotificationIntents(","reconcileTaskNotificationWorkspace(","<CommunicationAutomationCenter","<TaskModal","onSubmit={save}"]) {
    assert.ok(page.includes(key), 'Integração ou autorização ausente: '+key)
  }
  assert.ok(form.includes('task-board-v3__layout'), 'Formulário de tarefa regressou')
})
test('Tarefas V4 — enquadramento responsivo, Kanban e CSS isolado', () => {
  assert.ok(page.includes("import './tasks-page-v4.css'"))
  for (const key of ['.tasks-page-v4__toolbar','.tasks-page-v4__board','.tasks-page-v4__column','.tasks-page-v4__row','.tasks-page-v4__filter-panel','@media (max-width: 780px)','html[data-theme="dark"] .tasks-page-v4']) {
    assert.ok(css.includes(key), 'Classe de estilo ausente: '+key)
  }
  assert.ok(!/(^|\n)\s*(body\s*\{|html\s*\{|:root\s*\{|\*\s*\{)/m.test(css), 'CSS altera estilos globais')
  let level = 0
  for (const char of css) { level += char === '{' ? 1 : char === '}' ? -1 : 0; assert.ok(level >= 0) }
  assert.equal(level, 0, 'CSS desbalanceado')
})
