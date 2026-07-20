import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_WORKSPACE } from '../domain/defaults'
import { configureLocalExperience, LocalCrmRepository } from './local-crm-repository'
import { isLocalSetupPending, readLocalProfile } from '../lib/local-experience'

describe('LocalCrmRepository', () => {
  beforeEach(() => { localStorage.clear() })

  it('inicializa os dados de demonstração', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const snapshot = await repository.getSnapshot(DEMO_WORKSPACE.id)
    expect(snapshot.leads.length).toBeGreaterThan(0)
    expect(snapshot.stages).toHaveLength(6)
  })

  it('cria e movimenta um lead', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const lead = await repository.createLead({
      workspaceId: DEMO_WORKSPACE.id,
      name: 'Novo teste', company: '', phone: '', email: '', city: '', source: 'Teste', stageId: 'stage-new',
      status: 'active', temperature: 'warm', priority: 'medium', ownerId: null, ownerName: 'Equipe', value: 1000,
      nextActionAt: null, notes: '', tags: [],
    })
    const moved = await repository.moveLead(lead.id, 'stage-proposal')
    expect(moved.stageId).toBe('stage-proposal')
    expect((await repository.listActivities(DEMO_WORKSPACE.id))[0].type).toBe('stage_change')
  })


  it('move para perda registrando etapa, status e motivo na mesma operação', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const lostStage = await repository.createStage({ workspaceId: DEMO_WORKSPACE.id, name: 'Perdido', color: '#dc2626', probability: 0, isWon: false, isLost: true })
    const moved = await repository.moveLead('lead-alpha', lostStage.id, 'Sem orçamento neste trimestre')
    expect(moved.stageId).toBe(lostStage.id)
    expect(moved.status).toBe('lost')
    expect(moved.notes).toContain('Sem orçamento neste trimestre')
    const history = await repository.listActivities(DEMO_WORKSPACE.id)
    expect(history.some((item) => item.leadId === moved.id && item.description.includes('Sem orçamento neste trimestre'))).toBe(true)
  })
})

describe('operações V100.1', () => {
  it('cria, atualiza e exclui etapa vazia', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const [workspace] = await repository.listWorkspaces()
    const stage = await repository.createStage({ workspaceId: workspace.id, name: 'Diagnóstico', color: '#123456', probability: 55, isWon: false, isLost: false })
    expect(stage.name).toBe('Diagnóstico')
    const updated = await repository.updateStage(stage.id, { probability: 60 })
    expect(updated.probability).toBe(60)
    await repository.deleteStage(stage.id)
    expect((await repository.listStages(workspace.id)).some((item) => item.id === stage.id)).toBe(false)
  })

  it('adiciona tag em massa sem duplicar e em uma única gravação lógica', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const [workspace] = await repository.listWorkspaces()
    const ids = (await repository.listLeads(workspace.id)).slice(0, 3).map((lead) => lead.id)
    expect(await repository.bulkAddLeadTag(workspace.id, ids, 'prioridade-comercial')).toBe(3)
    expect(await repository.bulkAddLeadTag(workspace.id, ids, 'prioridade-comercial')).toBe(3)
    const leads = (await repository.listLeads(workspace.id)).filter((lead) => ids.includes(lead.id))
    expect(leads.every((lead) => lead.tags.filter((tag) => tag === 'prioridade-comercial').length === 1)).toBe(true)
  })

  it('move vários leads de forma atômica com um único motivo de perda', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const [workspace] = await repository.listWorkspaces()
    const lostStage = await repository.createStage({ workspaceId: workspace.id, name: 'Perdidos em lote', color: '#b91c1c', probability: 0, isWon: false, isLost: true })
    const ids = (await repository.listLeads(workspace.id)).slice(0, 2).map((lead) => lead.id)
    const moved = await repository.bulkMoveLeads(workspace.id, ids, lostStage.id, 'Sem aderência ao momento')
    expect(moved).toHaveLength(2)
    expect(moved.every((lead) => lead.status === 'lost' && lead.notes.includes('Sem aderência ao momento'))).toBe(true)
    const activities = await repository.listActivities(workspace.id)
    expect(ids.every((id) => activities.some((activity) => activity.leadId === id && activity.description.includes('Sem aderência ao momento')))).toBe(true)
  })

  it('não cria parcialmente um lote de atividades inválido', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const [workspace] = await repository.listWorkspaces()
    const before = (await repository.listActivities(workspace.id)).length
    const dueAt = '2026-07-22T12:00:00.000Z'
    await expect(repository.createActivities([
      { workspaceId: workspace.id, leadId: 'lead-alpha', type: 'followup', title: 'Follow-up válido', description: '', dueAt, completedAt: null, assignedTo: null, sourceType: 'system', sourceId: 'batch-test' },
      { workspaceId: workspace.id, leadId: 'lead-inexistente', type: 'followup', title: 'Follow-up inválido', description: '', dueAt, completedAt: null, assignedTo: null, sourceType: 'system', sourceId: 'batch-test' },
    ])).rejects.toThrow('lead inválido')
    expect((await repository.listActivities(workspace.id)).length).toBe(before)
    const created = await repository.createActivities([
      { workspaceId: workspace.id, leadId: 'lead-alpha', type: 'followup', title: 'Follow-up A', description: '', dueAt, completedAt: null, assignedTo: null, sourceType: 'system', sourceId: 'batch-test' },
      { workspaceId: workspace.id, leadId: 'lead-morada', type: 'followup', title: 'Follow-up B', description: '', dueAt, completedAt: null, assignedTo: null, sourceType: 'system', sourceId: 'batch-test' },
    ])
    expect(created).toHaveLength(2)
  })

  it('atualiza e exclui leads em massa', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const [workspace] = await repository.listWorkspaces()
    const leads = await repository.listLeads(workspace.id)
    const ids = leads.slice(0, 2).map((lead) => lead.id)
    const changed = await repository.bulkUpdateLeads(workspace.id, ids, { priority: 'urgent' })
    expect(changed).toBe(ids.length)
    expect((await repository.listLeads(workspace.id)).filter((lead) => ids.includes(lead.id)).every((lead) => lead.priority === 'urgent')).toBe(true)
    const removed = await repository.bulkDeleteLeads(workspace.id, ids)
    expect(removed).toBe(ids.length)
  })
})

describe('operações V100.2', () => {
  beforeEach(() => { localStorage.clear() })
  it('cria, conclui e reabre um follow-up sincronizando o lead', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const dueAt = new Date('2026-07-20T15:00:00.000Z').toISOString()
    const activity = await repository.createActivity({
      workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-morada', type: 'followup', title: 'Contato de teste', description: 'Validar retorno',
      dueAt, completedAt: null, assignedTo: null, sourceType: 'manual', sourceId: null,
    })
    expect((await repository.listLeads(DEMO_WORKSPACE.id)).find((lead) => lead.id === 'lead-morada')?.nextActionAt).toBe(dueAt)
    const completed = await repository.completeActivity(activity.id, true)
    expect(completed.completedAt).not.toBeNull()
    const reopened = await repository.completeActivity(activity.id, false)
    expect(reopened.completedAt).toBeNull()
  })

  it('salva ligação e cria atividade de histórico', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const call = await repository.createCall({
      workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-alpha', userId: null, outcome: 'answered', durationSeconds: 75,
      notes: 'Conversa de teste', transcript: 'Transcrição de teste', recordingPath: null,
      startedAt: '2026-07-16T15:00:00.000Z', endedAt: '2026-07-16T15:01:15.000Z',
    })
    expect(call.durationSeconds).toBe(75)
    const activity = (await repository.listActivities(DEMO_WORKSPACE.id)).find((item) => item.sourceType === 'call' && item.sourceId === call.id)
    expect(activity?.type).toBe('call')
  })

  it('rejeita gravação local sem consentimento registrado', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    await expect(repository.createCall({
      workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-alpha', userId: null, outcome: 'answered', durationSeconds: 30,
      notes: '', transcript: '', recordingPath: null, consentAt: null,
      startedAt: '2026-07-16T15:00:00.000Z', endedAt: '2026-07-16T15:00:30.000Z',
    }, new Blob(['audio'], { type: 'audio/webm' }))).rejects.toThrow('consentimento')
  })

  it('cria, atualiza e exclui evento com atividade vinculada', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const event = await repository.createCalendarEvent({
      workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-bronx', title: 'Reunião de teste', description: '',
      startsAt: '2026-07-22T14:00:00.000Z', endsAt: '2026-07-22T14:30:00.000Z', allDay: false,
      location: 'Meet', status: 'confirmed', assignedTo: null,
    })
    let activity = (await repository.listActivities(DEMO_WORKSPACE.id)).find((item) => item.sourceType === 'calendar' && item.sourceId === event.id)
    expect(activity?.title).toBe('Reunião de teste')
    await repository.updateCalendarEvent(event.id, { title: 'Reunião atualizada', status: 'completed' })
    activity = (await repository.listActivities(DEMO_WORKSPACE.id)).find((item) => item.sourceType === 'calendar' && item.sourceId === event.id)
    expect(activity?.title).toBe('Reunião atualizada')
    expect(activity?.completedAt).not.toBeNull()
    await repository.deleteCalendarEvent(event.id)
    expect((await repository.listCalendarEvents(DEMO_WORKSPACE.id)).some((item) => item.id === event.id)).toBe(false)
    expect((await repository.listActivities(DEMO_WORKSPACE.id)).some((item) => item.sourceId === event.id)).toBe(false)
  })
})

describe('operações V100.3', () => {
  beforeEach(() => { localStorage.clear() })

  it('cria, atualiza e exclui metas com validação de duplicidade', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const goal = await repository.createGoal({
      workspaceId: DEMO_WORKSPACE.id, userId: null, userName: 'Equipe', metric: 'wins', targetValue: 5,
      periodStart: '2026-08-01', periodEnd: '2026-08-31',
    })
    expect(goal.metric).toBe('wins')
    await expect(repository.createGoal({
      workspaceId: DEMO_WORKSPACE.id, userId: null, userName: 'Equipe', metric: 'wins', targetValue: 8,
      periodStart: '2026-08-01', periodEnd: '2026-08-31',
    })).rejects.toThrow('Já existe')
    const updated = await repository.updateGoal(goal.id, { targetValue: 7 })
    expect(updated.targetValue).toBe(7)
    await repository.deleteGoal(goal.id)
    expect((await repository.listGoals(DEMO_WORKSPACE.id)).some((item) => item.id === goal.id)).toBe(false)
  })

  it('registra regras e impede execução duplicada pelo eventKey', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const rule = await repository.createAutomationRule({
      workspaceId: DEMO_WORKSPACE.id, name: 'Regra de teste', enabled: true, triggerType: 'manual', conditions: [],
      actions: [{ id: 'action-test', type: 'create_note', value: 'Nota automática' }], createdBy: 'demo-user',
    })
    const first = await repository.startAutomationRun({ workspaceId: DEMO_WORKSPACE.id, ruleId: rule.id, eventKey: 'test:event:1', input: { leadId: 'lead-alpha' } })
    expect(first?.status).toBe('running')
    const duplicate = await repository.startAutomationRun({ workspaceId: DEMO_WORKSPACE.id, ruleId: rule.id, eventKey: 'test:event:1', input: { leadId: 'lead-alpha' } })
    expect(duplicate).toBeNull()
    const finished = await repository.finishAutomationRun(first!.id, 'success', { message: 'Executada', matchedLeadIds: ['lead-alpha'] })
    expect(finished.status).toBe('success')
    expect((await repository.listAutomationRuns(DEMO_WORKSPACE.id))[0].output.message).toBe('Executada')
  })
})

describe('operações V100.4', () => {
  beforeEach(() => { localStorage.clear() })

  it('cria e revoga convite com token e expiração', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const invite = await repository.createWorkspaceInvite(DEMO_WORKSPACE.id, 'vendedor@empresa.com', 'member')
    expect(invite.email).toBe('vendedor@empresa.com')
    expect(invite.token.length).toBeGreaterThan(10)
    expect(new Date(invite.expiresAt).getTime()).toBeGreaterThan(Date.now())
    await repository.revokeWorkspaceInvite(invite.id)
    expect((await repository.listWorkspaceInvites(DEMO_WORKSPACE.id))[0].revokedAt).not.toBeNull()
  })

  it('protege o proprietário e gerencia um membro comum', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const key = 'realtalent-crm-v100-local'
    const db = JSON.parse(localStorage.getItem(key)!)
    db.members.push({ workspaceId: DEMO_WORKSPACE.id, userId: 'seller-1', displayName: 'Vendedor', email: 'seller@empresa.com', avatarUrl: null, role: 'member', joinedAt: new Date().toISOString() })
    localStorage.setItem(key, JSON.stringify(db))
    await repository.updateWorkspaceMemberRole(DEMO_WORKSPACE.id, 'seller-1', 'viewer')
    expect((await repository.listWorkspaceMembers(DEMO_WORKSPACE.id)).find((item) => item.userId === 'seller-1')?.role).toBe('viewer')
    await repository.removeWorkspaceMember(DEMO_WORKSPACE.id, 'seller-1')
    expect((await repository.listWorkspaceMembers(DEMO_WORKSPACE.id)).some((item) => item.userId === 'seller-1')).toBe(false)
    await expect(repository.removeWorkspaceMember(DEMO_WORKSPACE.id, 'demo-user')).rejects.toThrow('proprietário')
  })

  it('exporta snapshot completo do workspace', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const backup = await repository.exportWorkspace(DEMO_WORKSPACE.id)
    expect(backup.version).toBe('100.27')
    expect((backup.snapshot as { leads: unknown[] }).leads.length).toBeGreaterThan(0)
    expect(Array.isArray(backup.members)).toBe(true)
  })
})

describe('playbooks V100.4', () => {
  beforeEach(() => { localStorage.clear() })

  it('cria, atualiza e remove um playbook', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const playbook = await repository.createPlaybook({ workspaceId: DEMO_WORKSPACE.id, kind: 'script', title: 'Script de teste', category: 'Teste', content: 'Conteúdo do script', tags: ['teste'], active: true })
    expect(playbook.kind).toBe('script')
    const updated = await repository.updatePlaybook(playbook.id, { kind: 'objection', active: false })
    expect(updated.kind).toBe('objection')
    expect(updated.active).toBe(false)
    await repository.deletePlaybook(playbook.id)
    expect((await repository.listPlaybooks(DEMO_WORKSPACE.id)).some((item) => item.id === playbook.id)).toBe(false)
  })
})

describe('resiliência consolidada V100.21', () => {
  beforeEach(() => { localStorage.clear() })

  it('preserva uma cópia da base corrompida e recupera dados válidos', async () => {
    localStorage.setItem('realtalent-crm-v100-local', '{base-corrompida')
    const repository = new LocalCrmRepository()
    const snapshot = await repository.getSnapshot(DEMO_WORKSPACE.id)
    expect(snapshot.leads.length).toBeGreaterThan(0)
    expect(() => JSON.parse(localStorage.getItem('realtalent-crm-v100-local')!)).not.toThrow()
    expect(Object.keys(localStorage).some((key) => key.startsWith('realtalent-crm-v100-corrupt-backup:'))).toBe(true)
  })

  it('gera slugs únicos para workspaces com o mesmo nome', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const first = await repository.createWorkspace('Equipe Comercial')
    const second = await repository.createWorkspace('Equipe Comercial')
    expect(first.slug).toBe('equipe-comercial')
    expect(second.slug).toBe('equipe-comercial-2')
  })

  it('não conta como vitória do mês um fechamento do mesmo mês em outro ano', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const key = 'realtalent-crm-v100-local'
    const db = JSON.parse(localStorage.getItem(key)!)
    const now = new Date()
    db.leads.push({ ...db.leads[0], id: 'won-old-year', status: 'won', updatedAt: new Date(now.getFullYear() - 1, now.getMonth(), 10).toISOString() })
    localStorage.setItem(key, JSON.stringify(db))
    const stats = await repository.getDashboardStats(DEMO_WORKSPACE.id)
    const expected = db.leads.filter((lead: { status: string; updatedAt: string }) => {
      const date = new Date(lead.updatedAt)
      return lead.status === 'won' && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
    }).length
    expect(stats.wonThisMonth).toBe(expected)
  })
})

describe('base confiável V100.21', () => {
  beforeEach(() => { localStorage.clear() })

  it('mescla duplicados preservando todo o histórico vinculado', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const duplicate = await repository.createLead({
      workspaceId: DEMO_WORKSPACE.id, name: 'Alpha duplicada', company: '', phone: '(51) 99999-1001', email: 'duplicado@alpha.com', city: '', source: '', stageId: 'stage-new', status: 'active', temperature: 'hot', priority: 'urgent', ownerId: null, ownerName: '', value: 9000, nextActionAt: null, notes: 'Informação do cadastro repetido', tags: ['duplicado'],
    })
    const activity = await repository.createActivity({ workspaceId: DEMO_WORKSPACE.id, leadId: duplicate.id, type: 'followup', title: 'Histórico duplicado', description: '', dueAt: '2026-07-21T12:00:00.000Z', completedAt: null, assignedTo: null, sourceType: 'manual', sourceId: null })
    const call = await repository.createCall({ workspaceId: DEMO_WORKSPACE.id, leadId: duplicate.id, userId: null, outcome: 'answered', durationSeconds: 30, notes: '', transcript: '', recordingPath: null, startedAt: '2026-07-19T12:00:00.000Z', endedAt: '2026-07-19T12:00:30.000Z' })
    const merged = await repository.mergeLeads(DEMO_WORKSPACE.id, 'lead-alpha', duplicate.id)
    expect(merged.value).toBe(9000)
    expect(merged.tags).toContain('duplicado')
    expect((await repository.listActivities(DEMO_WORKSPACE.id)).find((item) => item.id === activity.id)?.leadId).toBe('lead-alpha')
    expect((await repository.listCalls(DEMO_WORKSPACE.id)).find((item) => item.id === call.id)?.leadId).toBe('lead-alpha')
    expect((await repository.listLeads(DEMO_WORKSPACE.id)).some((item) => item.id === duplicate.id)).toBe(false)
    expect((await repository.listAuditLogs(DEMO_WORKSPACE.id)).some((item) => item.action === 'lead_merged')).toBe(true)
  })
})


describe('primeiro acesso e utilização por terceiros V100.21', () => {
  beforeEach(() => { localStorage.clear() })

  it('marca o primeiro acesso como pendente sem apagar uma instalação existente', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    expect(isLocalSetupPending()).toBe(true)
    const raw = localStorage.getItem('realtalent-crm-v100-local')
    await repository.initialize()
    expect(localStorage.getItem('realtalent-crm-v100-local')).toBe(raw)
  })

  it('prepara uma demonstração personalizada e atualiza datas para o período atual', async () => {
    configureLocalExperience({ displayName: 'Pessoa Teste', companyName: 'Empresa Teste', email: 'pessoa@teste.com', mode: 'demo' })
    const repository = new LocalCrmRepository()
    const [workspace] = await repository.listWorkspaces()
    const snapshot = await repository.getSnapshot(workspace.id)
    const profile = readLocalProfile()
    expect(workspace.name).toBe('Empresa Teste')
    expect(profile.displayName).toBe('Pessoa Teste')
    expect(snapshot.leads.every((lead) => lead.ownerName === 'Pessoa Teste')).toBe(true)
    expect(snapshot.goals.every((goal) => new Date(`${goal.periodStart}T12:00:00`).getMonth() === new Date().getMonth())).toBe(true)
    expect(isLocalSetupPending()).toBe(false)
  })

  it('cria uma base vazia sem deixar o workspace demonstrativo visível', async () => {
    configureLocalExperience({ displayName: 'Novo Usuário', companyName: 'Nova Empresa', email: '', mode: 'clean' })
    const repository = new LocalCrmRepository()
    const workspaces = await repository.listWorkspaces()
    const snapshot = await repository.getSnapshot(workspaces[0].id)
    expect(workspaces).toHaveLength(1)
    expect(workspaces[0].name).toBe('Nova Empresa')
    expect(snapshot.leads).toHaveLength(0)
    expect(snapshot.activities).toHaveLength(0)
    expect(snapshot.stages).toHaveLength(6)
  })
})
