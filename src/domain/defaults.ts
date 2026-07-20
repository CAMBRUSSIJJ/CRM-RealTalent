import type { ActivityItem, AutomationRule, AutomationRun, CalendarEvent, CallRecord, Goal, Lead, PipelineStage, Playbook, UserProfile, Workspace } from './types'

export const DEMO_USER: UserProfile = {
  id: 'demo-user',
  email: 'demo@realtalent.local',
  displayName: 'Camila',
}

export const DEMO_WORKSPACE: Workspace = {
  id: 'demo-workspace',
  name: 'RealTalent',
  slug: 'realtalent',
  role: 'owner',
  createdAt: '2026-07-16T12:00:00.000Z',
}

export const DEFAULT_STAGES: PipelineStage[] = [
  { id: 'stage-new', workspaceId: DEMO_WORKSPACE.id, name: 'Novo lead', order: 1, color: '#4361ee', probability: 10, isWon: false, isLost: false },
  { id: 'stage-contact', workspaceId: DEMO_WORKSPACE.id, name: 'Primeiro contato', order: 2, color: '#3a86ff', probability: 25, isWon: false, isLost: false },
  { id: 'stage-followup', workspaceId: DEMO_WORKSPACE.id, name: 'Follow-up', order: 3, color: '#8b5cf6', probability: 40, isWon: false, isLost: false },
  { id: 'stage-proposal', workspaceId: DEMO_WORKSPACE.id, name: 'Proposta', order: 4, color: '#f59e0b', probability: 65, isWon: false, isLost: false },
  { id: 'stage-negotiation', workspaceId: DEMO_WORKSPACE.id, name: 'Negociação', order: 5, color: '#f97316', probability: 80, isWon: false, isLost: false },
  { id: 'stage-won', workspaceId: DEMO_WORKSPACE.id, name: 'Fechado', order: 6, color: '#16a34a', probability: 100, isWon: true, isLost: false },
]

const now = new Date('2026-07-16T15:00:00.000Z')
const isoInDays = (days: number, hour = 14, minutes = 0) => {
  const date = new Date(now)
  date.setUTCDate(date.getUTCDate() + days)
  date.setUTCHours(hour, minutes, 0, 0)
  return date.toISOString()
}

export const DEMO_LEADS: Lead[] = [
  {
    id: 'lead-alpha', workspaceId: DEMO_WORKSPACE.id, name: 'Barbearia Alpha', company: 'Barbearia Alpha',
    phone: '(51) 99999-1001', email: 'contato@alpha.com.br', city: 'Canoas', source: 'Instagram',
    stageId: 'stage-proposal', status: 'active', temperature: 'hot', priority: 'high', ownerId: DEMO_USER.id,
    ownerName: 'Camila', value: 5000, nextActionAt: isoInDays(0, 13), expectedCloseAt: isoInDays(12).slice(0, 10), notes: 'Apresentar automação de agenda.',
    tags: ['barbearia', 'reunião'], createdAt: isoInDays(-12), updatedAt: isoInDays(-1),
  },
  {
    id: 'lead-bronx', workspaceId: DEMO_WORKSPACE.id, name: 'The Bronx Barber Shop', company: 'The Bronx',
    phone: '(51) 99826-6560', email: 'contato@thebronx.com.br', city: 'Porto Alegre', source: 'Garimpo',
    stageId: 'stage-contact', status: 'active', temperature: 'warm', priority: 'medium', ownerId: DEMO_USER.id,
    ownerName: 'Camila', value: 3200, nextActionAt: isoInDays(0, 16), expectedCloseAt: isoInDays(24).slice(0, 10), notes: 'Retomar contato pelo WhatsApp.',
    tags: ['barbearia'], createdAt: isoInDays(-8), updatedAt: isoInDays(-2),
  },
  {
    id: 'lead-diamond', workspaceId: DEMO_WORKSPACE.id, name: 'Diamond Barbearia', company: 'Diamond Barbearia',
    phone: '(51) 98454-6144', email: 'leo@diamond.com.br', city: 'Canoas', source: 'Indicação',
    stageId: 'stage-followup', status: 'active', temperature: 'hot', priority: 'urgent', ownerId: DEMO_USER.id,
    ownerName: 'Camila', value: 4200, nextActionAt: isoInDays(1, 12), expectedCloseAt: isoInDays(8).slice(0, 10), notes: 'Enviar proposta revisada.',
    tags: ['barbearia', 'quente'], createdAt: isoInDays(-18), updatedAt: isoInDays(-1),
  },
  {
    id: 'lead-morada', workspaceId: DEMO_WORKSPACE.id, name: 'Morada Barbearia', company: 'Morada Barbearia',
    phone: '(51) 99700-3311', email: '', city: 'Canoas', source: 'Instagram',
    stageId: 'stage-new', status: 'active', temperature: 'cold', priority: 'low', ownerId: DEMO_USER.id,
    ownerName: 'Camila', value: 2500, nextActionAt: isoInDays(2, 11), notes: '',
    tags: ['barbearia'], createdAt: isoInDays(-2), updatedAt: isoInDays(-2),
  },
]

export const DEMO_ACTIVITIES: ActivityItem[] = [
  {
    id: 'activity-1', workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-alpha', type: 'meeting',
    title: 'Reunião com Barbearia Alpha', description: 'Demonstração do CRM e automação de agenda.',
    dueAt: isoInDays(0, 13), completedAt: null, assignedTo: DEMO_USER.id, sourceType: 'calendar', sourceId: 'event-1', createdAt: isoInDays(-2), updatedAt: isoInDays(-2),
  },
  {
    id: 'activity-2', workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-bronx', type: 'followup',
    title: 'Segundo contato com The Bronx', description: 'Retomar a dor de agendamentos perdidos.',
    dueAt: isoInDays(0, 16), completedAt: null, assignedTo: DEMO_USER.id, sourceType: 'manual', sourceId: null, createdAt: isoInDays(-1), updatedAt: isoInDays(-1),
  },
  {
    id: 'activity-3', workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-diamond', type: 'note',
    title: 'Proposta solicitada', description: 'Ajustar valor para duas unidades.', dueAt: null,
    completedAt: isoInDays(-1), assignedTo: DEMO_USER.id, sourceType: 'manual', sourceId: null, createdAt: isoInDays(-1), updatedAt: isoInDays(-1),
  },
]

export const DEMO_CALLS: CallRecord[] = [
  {
    id: 'call-1', workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-diamond', userId: DEMO_USER.id,
    outcome: 'answered', durationSeconds: 184, notes: 'Solicitou proposta para duas unidades.',
    transcript: 'Lead demonstrou interesse e pediu uma proposta revisada.', recordingPath: null,
    startedAt: isoInDays(-1, 14), endedAt: isoInDays(-1, 14, 3), createdAt: isoInDays(-1, 14, 3),
  },
]

export const DEMO_EVENTS: CalendarEvent[] = [
  {
    id: 'event-1', workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-alpha', title: 'Demonstração — Barbearia Alpha',
    description: 'Apresentar Pipeline, Ligações e Agenda.', startsAt: isoInDays(0, 13), endsAt: isoInDays(0, 13, 45),
    allDay: false, location: 'Google Meet', status: 'confirmed', assignedTo: DEMO_USER.id,
    createdAt: isoInDays(-2), updatedAt: isoInDays(-2),
  },
  {
    id: 'event-2', workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-diamond', title: 'Revisar proposta Diamond',
    description: 'Conferir escopo antes do envio.', startsAt: isoInDays(1, 11), endsAt: isoInDays(1, 11, 30),
    allDay: false, location: '', status: 'tentative', assignedTo: DEMO_USER.id,
    createdAt: isoInDays(-1), updatedAt: isoInDays(-1),
  },
]


const monthStart = new Date(now); monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0)
const monthEnd = new Date(monthStart); monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1); monthEnd.setUTCDate(0); monthEnd.setUTCHours(23,59,59,999)
const dateOnly = (date: Date) => date.toISOString().slice(0, 10)

export const DEMO_GOALS: Goal[] = [
  { id: 'goal-calls', workspaceId: DEMO_WORKSPACE.id, userId: null, userName: 'Equipe', metric: 'calls', targetValue: 30, periodStart: dateOnly(monthStart), periodEnd: dateOnly(monthEnd), createdAt: isoInDays(-10), updatedAt: isoInDays(-1) },
  { id: 'goal-new-leads', workspaceId: DEMO_WORKSPACE.id, userId: null, userName: 'Equipe', metric: 'new_leads', targetValue: 20, periodStart: dateOnly(monthStart), periodEnd: dateOnly(monthEnd), createdAt: isoInDays(-10), updatedAt: isoInDays(-1) },
  { id: 'goal-revenue', workspaceId: DEMO_WORKSPACE.id, userId: null, userName: 'Equipe', metric: 'revenue', targetValue: 18000, periodStart: dateOnly(monthStart), periodEnd: dateOnly(monthEnd), createdAt: isoInDays(-10), updatedAt: isoInDays(-1) },
]

export const DEMO_PLAYBOOKS: Playbook[] = [
  {
    id: 'playbook-first-contact', workspaceId: DEMO_WORKSPACE.id, kind: 'script', title: 'Primeiro contato — dor invisível', category: 'Prospecção',
    content: 'Vou ser bem direto: analisando a operação de vocês, percebi um ponto na forma como os clientes chegam e garantem horário que pode estar fazendo a barbearia perder agendamentos sem perceber.',
    tags: ['barbearia','primeiro contato'], active: true, createdAt: isoInDays(-8), updatedAt: isoInDays(-2),
  },
  {
    id: 'playbook-no-time', workspaceId: DEMO_WORKSPACE.id, kind: 'objection', title: '“Agora não tenho tempo”', category: 'Objeções',
    content: 'Perfeito, por isso mesmo proponho algo objetivo: dez minutos para eu te mostrar onde os agendamentos estão escapando. Se não fizer sentido, encerramos ali.',
    tags: ['tempo','reunião'], active: true, createdAt: isoInDays(-7), updatedAt: isoInDays(-2),
  },
  {
    id: 'playbook-already-system', workspaceId: DEMO_WORKSPACE.id, kind: 'objection', title: '“Já tenho sistema”', category: 'Objeções',
    content: 'Ter sistema é comum. A pergunta é se ele está ajudando a vender mais e reduzir desistências ou apenas registrando horários. É justamente essa diferença que quero te mostrar.',
    tags: ['sistema','valor'], active: true, createdAt: isoInDays(-6), updatedAt: isoInDays(-2),
  },
]

export const DEMO_AUTOMATION_RULES: AutomationRule[] = [
  {
    id: 'rule-hot-lead', workspaceId: DEMO_WORKSPACE.id, name: 'Priorizar lead quente', enabled: true,
    triggerType: 'lead_created',
    conditions: [{ id: 'condition-hot', field: 'temperature', operator: 'equals', value: 'hot' }],
    actions: [
      { id: 'action-priority', type: 'set_priority', value: 'urgent' },
      { id: 'action-followup', type: 'create_followup', value: 'Contato prioritário com lead quente', delayDays: 0 },
    ],
    createdBy: DEMO_USER.id, createdAt: isoInDays(-6), updatedAt: isoInDays(-2),
  },
  {
    id: 'rule-no-answer', workspaceId: DEMO_WORKSPACE.id, name: 'Retorno após não atender', enabled: true,
    triggerType: 'call_outcome',
    conditions: [{ id: 'condition-no-answer', field: 'call_outcome', operator: 'equals', value: 'no_answer' }],
    actions: [{ id: 'action-return', type: 'create_followup', value: 'Retornar ligação sem atendimento', delayDays: 1 }],
    createdBy: DEMO_USER.id, createdAt: isoInDays(-5), updatedAt: isoInDays(-2),
  },
]

export const DEMO_AUTOMATION_RUNS: AutomationRun[] = [
  {
    id: 'run-demo-1', workspaceId: DEMO_WORKSPACE.id, ruleId: 'rule-no-answer',
    eventKey: 'demo:rule-no-answer:call-demo', status: 'success',
    input: { triggerType: 'call_outcome', leadId: 'lead-bronx', callOutcome: 'no_answer' },
    output: { message: '1 ação executada.', matchedLeadIds: ['lead-bronx'], mutations: [] },
    errorMessage: null, startedAt: isoInDays(-2, 10), finishedAt: isoInDays(-2, 10, 1),
  },
]
