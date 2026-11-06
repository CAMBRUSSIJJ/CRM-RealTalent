import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8')
const teams=read('src/features/teams/teams-page.tsx')
const people=read('src/features/teams/team-people-panel.tsx')
const notifications=read('src/features/teams/team-notifications-panel.tsx')
const taskPage=read('src/features/tasks/tasks-page.tsx')
const taskModal=read('src/features/tasks/task-modal.tsx')
const access=read('src/services/team-access-control.ts')

test('Equipes has five operational views, not technical permissions UI',()=>{
  for(const id of ['overview','people','goals','performance','notifications']){
    assert.ok(teams.includes("id:'"+id+"'"),id+' tab must be rendered')
  }
  assert.ok(!teams.includes('<TeamAccessPanel'),'permission matrix is not rendered in Equipes')
  assert.ok(!teams.includes("label:'Perfis e acesso'"),'technical permission tab removed')
  assert.ok(teams.includes('<TeamNotificationsPanel'))
  assert.ok(teams.includes('<TeamPeoplePanel'))
  assert.ok(teams.includes('teamOpenTasks'),'tasks are still linked to teams')
})
test('underlying access controls and explicit WhatsApp consent remain unchanged',()=>{
  assert.ok(access.includes('resolveMemberAccess'),'server-facing access model remains')
  assert.ok(teams.includes("canTeamAccess('create','tasks')"))
  assert.ok(notifications.includes('<LocalMemberWhatsAppEditor'))
  assert.ok(notifications.includes('<TeamNotificationContacts'))
  assert.ok(notifications.includes('Um número salvo não autoriza mensagens automaticamente'))
  assert.ok(notifications.includes('member.whatsappAutoEnabledAt'),'UI does not manufacture opt-in')
})
test('team task drill down filters the current workspace and preselects team only when creating',()=>{
  assert.ok(teams.includes("routeToHash('tasks',{filter:'team:'+selected.id})"))
  assert.ok(teams.includes("routeToHash('tasks',{filter:'team:'+selected.id,action:'new'})"))
  assert.ok(taskPage.includes("routeContextFromHash(window.location.hash)"))
  assert.ok(taskPage.includes("data.teams.some(team=>team.id===requestedId)"),'invalid team ids must be ignored')
  assert.ok(taskPage.includes("setNewTaskTeamId(requestedId)"))
  assert.ok(taskPage.includes('initialTeamId={newTaskTeamId}'))
  assert.ok(taskModal.includes("setTeamId(task?.teamId ?? initialTeamId ?? '')"))
  assert.ok(people.includes("filter(task=>task.assigneeId===member.userId)"))
})
