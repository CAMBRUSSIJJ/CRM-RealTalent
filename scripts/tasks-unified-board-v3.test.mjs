import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import ts from 'typescript'

const formPath = 'src/features/tasks/task-modal.tsx'
const boardPath = 'src/features/tasks/task-board-v3.css'
const form = fs.readFileSync(formPath, 'utf8')
const css = fs.readFileSync(boardPath, 'utf8')

test('Tarefas V3: JSX e TypeScript válidos sintaticamente', () => {
  const parsed = ts.createSourceFile(formPath, form, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  assert.equal(parsed.parseDiagnostics.length, 0, parsed.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; '))
})
test('Tarefas V3: criação e edição num só quadro sem abas ou disclosures', () => {
  for (const fragment of [
    'task-board-v3__layout', 'task-board-v3__title', 'task-board-v3__fields',
    'task-board-v3__relation', 'task-board-v3__checklist', 'task-board-v3__reminders',
    '<TaskReminderEditor', 'onClick={addChecklistItem}'
  ]) assert.ok(form.includes(fragment), fragment)
  for (const fragment of [
    'taskTab', 'setTaskTab', "taskTab === 'geral'", "taskTab === 'contexto'",
    'work-task-reminder-disclosure', 'work-task-modal--collaborative',
    'work-checklist-card', 'work-checklist-add'
  ]) assert.ok(!form.includes(fragment), 'Estrutura antiga ainda ativa: ' + fragment)
})
test('Tarefas V3: mantém todos os controles de criação com valores reais', () => {
  for (const fragment of [
    'setTitle(event.target.value)', 'setDescription(event.target.value)',
    'setStatus(event.target.value as TaskStatus)', 'setPriority(event.target.value as TaskPriority)',
    'setDueAt(event.target.value)', 'chooseAssignee(event.target.value)', 'chooseTeam(event.target.value)',
    'setTags(event.target.value)', 'setRelationType(event.target.value as TaskRelationEntity)',
    'setRelationId(event.target.value)', 'relationOptions.map((item)',
    'availableMembers.map((member)', 'activeTeams.map((team)',
    'snapshot.opportunities.map', 'snapshot.contacts.map', 'snapshot.companies.map'
  ]) assert.ok(form.includes(fragment), fragment)
})
test('Tarefas V3: checklist completo, sem virar aba', () => {
  for (const fragment of [
    'checklistDraft.map((item, index)', 'onDragStart={() =>',
    'moveChecklistItem(dragIndex.current, index)', 'updateChecklistItem(index, { completed: !item.completed })',
    'updateChecklistItem(index, { title: event.target.value })',
    'removeChecklistItem(index)', 'addChecklistItem()', 'setHideCompleted(',
    "checklist: checklistDraft.filter((item) => item.title.trim())"
  ]) assert.ok(form.includes(fragment), fragment)
})
test('Tarefas V3: envio WhatsApp e lembretes continuam funcionais e visíveis', () => {
  for (const fragment of [
    '<TaskReminderEditor', 'value={reminders}', 'onChange={setReminders}',
    'assigneeId={assigneeId}', 'dueAt={dueAt}', 'status={status}',
    '<LocalTeamTaskWhatsAppAction',
    'reminderEnabled: reminders.enabled', 'reminderOnAssignment: reminders.onAssignment',
    'reminderChannels: reminders.channels', 'reminderOffsetsMinutes: reminders.offsets',
    'reminderCustomMinutes: reminders.customMinutes'
  ]) assert.ok(form.includes(fragment), fragment)
  assert.ok(!form.includes('<details'), 'Lembretes não devem depender de clique para revelar opções')
})
test('Tarefas V3: persistência usa TaskInput real sem alterar cadastro e edição', () => {
  for (const fragment of [
    "id: task?.id, title, description, status, priority, dueAt: toIso(dueAt)",
    "await onSubmit({", 'teamId: teamId || null', 'assigneeId: assigneeId || null',
    "relation: relationId && relationOption ?", 'checklist: checklistDraft.filter'
  ]) assert.ok(form.includes(fragment), fragment)
})
test('Tarefas V3: CSS isolado, responsivo e sem modificações globais', () => {
  assert.ok(form.includes("import './task-board-v3.css'"))
  for (const fragment of [
    '.task-board-v3__layout', '.task-board-v3__checklist-items',
    '.task-board-v3__reminders .task-reminders', '.task-board-v3__footer',
    '@media (max-width: 860px)', '@media (max-width: 435px)',
    '.modal:has(.task-board-v3)'
  ]) assert.ok(css.includes(fragment), fragment)
  assert.ok(!/(^|\n)\s*(body\s*\{|html\s*\{|:root\s*\{|\*\s*\{)/.test(css))
  let braces = 0
  for (const char of css) {
    braces += char === '{' ? 1 : char === '}' ? -1 : 0
    assert.ok(braces >= 0)
  }
  assert.equal(braces, 0)
})
