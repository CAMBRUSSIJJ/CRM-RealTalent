import type { WorkspaceSnapshot } from '../domain/types'
import type { DealActionKind } from './deal-intelligence'
import type { CrmCapabilityPlanStep, CrmCapabilityPlanningResult } from './realtalent-crm-capability-planner'
import { universalCrmCapabilityById } from './realtalent-crm-universal-registry'
import { buildSalesAgentContext } from './realtalent-sales-intelligence-agent'

export interface SalesReferenceContext {
  previousLeadIds?: string[]
  currentUserId?: string | null
  now?: Date
}

export type SalesReferenceResolution =
  | { kind: 'plan'; result: CrmCapabilityPlanningResult; leadIds: string[] }
  | { kind: 'clarify'; message: string }
  | null

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9#]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, primeiro: 1, primeira: 1,
  dois: 2, duas: 2, segundo: 2, segunda: 2,
  tres: 3, terceiro: 3, terceira: 3,
  quatro: 4, quarto: 4, quarta: 4,
  cinco: 5, quinto: 5, quinta: 5,
  seis: 6, sexto: 6, sexta: 6,
  sete: 7, setimo: 7, setima: 7,
}

const numberFromToken = (value: string) => {
  const token = value.replace(/^#/, '')
  const numeric = Number(token)
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 7) return numeric
  return NUMBER_WORDS[token] ?? null
}

const hasOperationalVerb = (text: string) => /\b(faca|faz|fazer|execute|executar|rode|rodar|ligue|ligar|telefone|telefonar|abra|abrir|crie|criar|adicione|adicionar|agende|agendar|marque|marcar)\b/.test(text)

const hasReferenceLanguage = (text: string) => {
  if (/\b(primeir[oa]s?|segund[oa]s?|terceir[oa]s?|quart[oa]s?|quint[oa]s?|sext[oa]s?|setim[oa]s?)\b/.test(text)) return true
  if (/\b(?:os|as|esses|essas|estes|estas|todos|todas)\b/.test(text) && /\b(negocios?|oportunidades?|itens?|prioridades?)\b/.test(text)) return true
  if (/\b(?:esses|essas|estes|estas|os|as)\s+(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|[1-7])\b/.test(text)) return true
  return /(?:^|\s)#?[1-7](?=\s|$)/.test(text)
}

const selectedRanks = (text: string, available: number) => {
  if (!available) return []

  const firstCount = text.match(/\b(?:os|as)?\s*(um|uma|dois|duas|tres|quatro|cinco|seis|sete|[1-7])\s+primeir[oa]s\b/)
  if (firstCount) {
    const count = numberFromToken(firstCount[1]) ?? 0
    return Array.from({ length: Math.min(count, available) }, (_, index) => index + 1)
  }

  const demonstrativeCount = text.match(/\b(?:esses|essas|estes|estas)\s+(um|uma|dois|duas|tres|quatro|cinco|seis|sete|[1-7])\b/)
  if (demonstrativeCount) {
    const count = numberFromToken(demonstrativeCount[1]) ?? 0
    return Array.from({ length: Math.min(count, available) }, (_, index) => index + 1)
  }

  if (/\b(?:todos|todas)\s+(?:esses|essas|estes|estas)\b/.test(text) || /\b(?:esses|essas|estes|estas)\s+(?:negocios?|oportunidades?|itens?|prioridades?)\b/.test(text)) {
    return Array.from({ length: available }, (_, index) => index + 1)
  }

  const found = new Set<number>()
  const tokens = text.split(' ')
  for (const token of tokens) {
    const rank = numberFromToken(token)
    if (rank && rank <= available) found.add(rank)
  }
  return [...found]
}

const visibleLeadIds = (snapshot: WorkspaceSnapshot, context: SalesReferenceContext) => {
  if (snapshot.workspace.role === 'owner' || snapshot.workspace.role === 'admin') return new Set(snapshot.leads.map((lead) => lead.id))
  if (!context.currentUserId) return new Set<string>()
  return new Set(snapshot.leads.filter((lead) => lead.ownerId === context.currentUserId).map((lead) => lead.id))
}

const nextBusinessTime = (now: Date, urgency: 'now' | 'today' | 'planned') => {
  const due = new Date(now)
  const withinWorkday = due.getDay() >= 1 && due.getDay() <= 5 && due.getHours() < 17
  if (urgency === 'now' && withinWorkday) due.setTime(now.getTime() + 60 * 60_000)
  else if (urgency === 'today' && withinWorkday) due.setTime(now.getTime() + 2 * 60 * 60_000)
  else {
    due.setDate(due.getDate() + 1)
    while (due.getDay() === 0 || due.getDay() === 6) due.setDate(due.getDate() + 1)
    due.setHours(9, 0, 0, 0)
  }
  due.setSeconds(0, 0)
  return due.toISOString()
}

const explicitCapability = (text: string) => {
  if (/\b(ligue|ligar|telefone|telefonar)\b/.test(text)) return 'calls.open'
  if (/\b(follow ?up|retorno|acompanhamento)\b/.test(text) && /\b(crie|criar|adicione|adicionar|faca|faz|fazer|agende|agendar)\b/.test(text)) return 'activities.create_followup'
  if (/\btarefas?\b/.test(text) && /\b(crie|criar|adicione|adicionar|faca|faz|fazer)\b/.test(text)) return 'tasks.create'
  if (/\b(reuniao|reunioes)\b/.test(text) && /\b(agende|agendar|marque|marcar|crie|criar)\b/.test(text)) return 'calendar.create'
  if (/\bpropostas?\b/.test(text) && /\b(crie|criar|faca|faz|fazer)\b/.test(text)) return 'proposals.create'
  if (/\b(abra|abrir)\b/.test(text)) return 'navigation.open'
  return null
}

const recommendedCapability = (action: DealActionKind) => {
  const map: Record<DealActionKind, string> = {
    call: 'calls.open',
    followup: 'activities.create_followup',
    meeting: 'calendar.create',
    map_stakeholder: 'tasks.create',
    proposal: 'proposals.create',
    review_proposal: 'navigation.open',
    update_close_date: 'tasks.create',
    review: 'navigation.open',
  }
  return map[action]
}

const routeForRecommendation = (action: DealActionKind) => {
  if (action === 'review_proposal' || action === 'proposal') return 'proposals'
  if (action === 'call') return 'calls'
  if (action === 'meeting') return 'agenda'
  if (action === 'map_stakeholder') return 'leads'
  return 'pipeline'
}

const buildArgs = (
  capabilityId: string,
  leadId: string,
  label: string,
  recommendation: ReturnType<typeof buildSalesAgentContext>['nextBestAction'],
  now: Date,
) => {
  const dueAt = nextBusinessTime(now, recommendation.urgency)
  if (capabilityId === 'calls.open') return [{ name: 'record_query', value: leadId }]
  if (capabilityId === 'activities.create_followup') return [
    { name: 'record_query', value: leadId },
    { name: 'title', value: recommendation.title || `Follow-up comercial — ${label}` },
    { name: 'description', value: recommendation.explanation },
    { name: 'due_at', value: dueAt },
  ]
  if (capabilityId === 'tasks.create') return [
    { name: 'record_query', value: leadId },
    { name: 'title', value: recommendation.title || `Próxima ação — ${label}` },
    { name: 'description', value: recommendation.explanation },
    { name: 'due_at', value: dueAt },
    { name: 'priority', value: recommendation.urgency === 'now' ? 'urgent' : 'high' },
    { name: 'sync_to_agenda', value: 'true' },
  ]
  if (capabilityId === 'calendar.create') return [
    { name: 'record_query', value: leadId },
    { name: 'title', value: recommendation.title || `Reunião — ${label}` },
    { name: 'description', value: recommendation.explanation },
  ]
  if (capabilityId === 'proposals.create') return [{ name: 'record_query', value: leadId }]
  if (capabilityId === 'navigation.open') return [
    { name: 'route', value: routeForRecommendation(recommendation.kind) },
    { name: 'record_query', value: leadId },
  ]
  return [{ name: 'record_query', value: leadId }]
}

export const resolveSalesReferenceContinuation = (
  prompt: string,
  snapshot: WorkspaceSnapshot,
  context: SalesReferenceContext = {},
): SalesReferenceResolution => {
  const text = normalize(prompt)
  if (!hasOperationalVerb(text) || !hasReferenceLanguage(text)) return null

  const orderedIds = [...new Set(context.previousLeadIds ?? [])].slice(0, 7)
  if (!orderedIds.length) {
    return { kind: 'clarify', message: 'Não tenho uma lista numerada ativa nesta conversa. Peça primeiro as prioridades da carteira ou quem você deve ligar hoje; depois posso executar “a primeira”, “o segundo” ou um grupo.' }
  }

  const ranks = selectedRanks(text, orderedIds.length)
  if (!ranks.length) return { kind: 'clarify', message: 'Entendi que você se refere à lista anterior, mas não consegui identificar quais posições quer usar. Diga, por exemplo, “faça a primeira”, “ligue para o segundo” ou “crie follow-up para os três primeiros”.' }

  const allowed = visibleLeadIds(snapshot, context)
  const selected = ranks.map((rank) => ({ rank, leadId: orderedIds[rank - 1] })).filter((item): item is { rank: number; leadId: string } => Boolean(item.leadId))
  const unavailable = selected.filter((item) => !allowed.has(item.leadId) || !snapshot.leads.some((lead) => lead.id === item.leadId))
  if (unavailable.length) {
    return { kind: 'clarify', message: `A referência ${unavailable.map((item) => `#${item.rank}`).join(', ')} não está mais disponível no seu escopo atual. Atualize as prioridades antes de executar a ação.` }
  }

  const now = context.now ?? new Date()
  const forcedCapability = explicitCapability(text)
  const batch = selected.length > 1
  const steps: CrmCapabilityPlanStep[] = selected.map(({ rank, leadId }) => {
    const lead = snapshot.leads.find((item) => item.id === leadId)!
    const sales = buildSalesAgentContext(lead, snapshot, now)
    const capabilityId = forcedCapability || recommendedCapability(sales.nextBestAction.kind)
    const definition = universalCrmCapabilityById(capabilityId)
    if (!definition || definition.execution !== 'native') throw new Error(`Capacidade indisponível para a referência #${rank}: ${capabilityId}.`)
    const label = lead.company || lead.name
    return {
      id: `sales-ref:${rank}:${leadId}:${capabilityId}`,
      capabilityId,
      title: `${definition.title} · #${rank} ${label}`,
      reason: forcedCapability
        ? `Ação solicitada sobre a referência #${rank} da última lista comercial.`
        : `Executar a próxima melhor ação recalculada agora: ${sales.nextBestAction.title}.`,
      // Uma ação individual pode ser low/read, mas um lote é elevado a high para
      // acionar o checkpoint humano já existente no executor do drawer.
      risk: batch && definition.risk !== 'read' ? 'high' : definition.risk,
      args: buildArgs(capabilityId, leadId, label, sales.nextBestAction, now),
    }
  })

  return {
    kind: 'plan',
    leadIds: selected.map((item) => item.leadId),
    result: {
      decision: 'execute',
      provider: 'local',
      model: 'sales-reference-resolver-v1',
      plan: {
        version: '3.9',
        goal: selected.length === 1
          ? `Executar a ação sobre a referência #${selected[0].rank} da última lista comercial.`
          : `Executar a ação sobre ${selected.length} referências da última lista comercial com confirmação em lote.`,
        confidence: 1,
        needsClarification: false,
        clarification: '',
        pendingCapabilityId: '',
        missingSlots: [],
        knownArgs: [],
        steps,
      },
    },
  }
}
