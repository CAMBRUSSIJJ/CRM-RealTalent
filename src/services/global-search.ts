import type { AppRoute, WorkspaceSnapshot } from '../domain/types'
import type { RouteContext } from '../app/route-state'

export type GlobalSearchKind = 'module' | 'lead' | 'company' | 'contact' | 'proposal' | 'activity' | 'event' | 'playbook' | 'goal' | 'automation'

export interface GlobalSearchResult {
  id: string
  kind: GlobalSearchKind
  title: string
  subtitle: string
  route: AppRoute
  context?: RouteContext
  score: number
}

interface SearchDocument extends Omit<GlobalSearchResult, 'score'> {
  searchText: string
  priority?: number
}

const MODULES: Array<{ route: AppRoute; title: string; keywords: string }> = [
  { route: 'dashboard', title: 'Meu Dia', keywords: 'dashboard prioridades tarefas hoje operação' },
  { route: 'leads', title: 'Leads', keywords: 'lead contatos contas empresas carteira crm' },
  { route: 'commercial-map', title: 'Território', keywords: 'mapa território região cidade cobertura geográfico' },
  { route: 'pipeline', title: 'Pipeline', keywords: 'pipeline kanban oportunidades negócios etapas funil' },
  { route: 'followups', title: 'Follow-ups', keywords: 'follow up retorno cadência tarefas próximos contatos' },
  { route: 'calls', title: 'Ligações', keywords: 'ligação chamadas telefone modo foco discagem' },
  { route: 'communications', title: 'Central de Comunicação', keywords: 'comunicação whatsapp email ligação reunião histórico' },
  { route: 'proposals', title: 'Propostas e Forecast', keywords: 'proposta forecast receita orçamento negociação' },
  { route: 'agenda', title: 'Agenda', keywords: 'agenda calendário reunião evento tarefa compromisso' },
  { route: 'playbooks', title: 'Playbooks', keywords: 'playbook script objeção roteiro atendimento' },
  { route: 'goals', title: 'Metas', keywords: 'metas objetivo resultado equipe vendedor' },
  { route: 'automations', title: 'Automações', keywords: 'automação regra gatilho ação workflow' },
  { route: 'prospecting', title: 'Garimpo', keywords: 'garimpo prospecção captura enriquecimento novos leads' },
  { route: 'metrics', title: 'Métricas', keywords: 'métricas desempenho conversão analytics relatório indicadores' },
  { route: 'settings', title: 'Configurações', keywords: 'configurações integração equipe segurança backup preferências' },
]

const normalize = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR')
  .replace(/[^a-z0-9@.+-]+/g, ' ')
  .trim()

const scoreText = (query: string, title: string, haystack: string, priority = 0) => {
  const q = normalize(query)
  if (!q) return 0
  const normalizedTitle = normalize(title)
  const normalizedHaystack = normalize(haystack)
  const terms = q.split(/\s+/).filter(Boolean)
  let score = priority
  if (normalizedTitle === q) score += 80
  else if (normalizedTitle.startsWith(q)) score += 48
  else if (normalizedTitle.includes(q)) score += 32
  if (normalizedHaystack.includes(q)) score += 18
  for (const term of terms) {
    if (normalizedTitle.startsWith(term)) score += 10
    else if (normalizedTitle.includes(term)) score += 7
    else if (normalizedHaystack.includes(term)) score += 3
    else return 0
  }
  return score
}

const add = (documents: SearchDocument[], document: SearchDocument) => documents.push(document)

export function buildGlobalSearchDocuments(snapshot: WorkspaceSnapshot): SearchDocument[] {
  const documents: SearchDocument[] = MODULES.map((module) => ({
    id: `module:${module.route}`,
    kind: 'module',
    title: module.title,
    subtitle: 'Abrir módulo',
    route: module.route,
    searchText: `${module.title} ${module.keywords}`,
    priority: 6,
  }))

  snapshot.leads.forEach((lead) => add(documents, {
    id: `lead:${lead.id}`, kind: 'lead', title: lead.name || lead.company || 'Lead sem nome',
    subtitle: [lead.company, lead.city, lead.phone].filter(Boolean).join(' · ') || 'Lead', route: 'leads',
    context: { leadId: lead.id }, searchText: `${lead.name} ${lead.company} ${lead.phone} ${lead.email} ${lead.city} ${lead.tags.join(' ')}`, priority: 10,
  }))
  snapshot.companies.forEach((company) => add(documents, {
    id: `company:${company.id}`, kind: 'company', title: company.name,
    subtitle: [company.segment, company.city, company.cnpj].filter(Boolean).join(' · ') || 'Conta', route: 'leads',
    context: company.leadIds[0] ? { leadId: company.leadIds[0] } : undefined,
    searchText: `${company.name} ${company.legalName} ${company.cnpj} ${company.domain} ${company.website} ${company.segment} ${company.city} ${company.state}`,
  }))
  snapshot.contacts.forEach((contact) => add(documents, {
    id: `contact:${contact.id}`, kind: 'contact', title: contact.name,
    subtitle: [contact.jobTitle, contact.email || contact.phone].filter(Boolean).join(' · ') || 'Contato', route: 'leads',
    context: contact.leadIds[0] ? { leadId: contact.leadIds[0] } : undefined,
    searchText: `${contact.name} ${contact.jobTitle} ${contact.email} ${contact.phone} ${contact.notes ?? ''}`,
  }))
  snapshot.proposals.forEach((proposal) => add(documents, {
    id: `proposal:${proposal.id}`, kind: 'proposal', title: proposal.title,
    subtitle: `${proposal.proposalNumber} · ${proposal.status} · R$ ${proposal.total.toLocaleString('pt-BR')}`, route: 'proposals',
    context: { proposalId: proposal.id, leadId: proposal.leadId }, searchText: `${proposal.title} ${proposal.proposalNumber} ${proposal.status} ${proposal.notes} ${proposal.terms}`,
    priority: 3,
  }))
  snapshot.activities.forEach((activity) => add(documents, {
    id: `activity:${activity.id}`, kind: 'activity', title: activity.title,
    subtitle: `${activity.type} · ${activity.completedAt ? 'Concluída' : 'Pendente'}`, route: activity.type === 'call' ? 'followups' : 'agenda',
    context: { activityId: activity.id, leadId: activity.leadId ?? undefined }, searchText: `${activity.title} ${activity.description} ${activity.purpose ?? ''} ${activity.type}`,
  }))
  snapshot.events.forEach((event) => add(documents, {
    id: `event:${event.id}`, kind: 'event', title: event.title,
    subtitle: [event.location, event.status].filter(Boolean).join(' · ') || 'Evento', route: 'agenda',
    context: { eventId: event.id, leadId: event.leadId ?? undefined }, searchText: `${event.title} ${event.description} ${event.location} ${event.status}`,
  }))
  snapshot.playbooks.forEach((playbook) => add(documents, {
    id: `playbook:${playbook.id}`, kind: 'playbook', title: playbook.title,
    subtitle: playbook.category || 'Playbook', route: 'playbooks', searchText: `${playbook.title} ${playbook.category} ${playbook.tags.join(' ')} ${playbook.content}`,
  }))
  snapshot.goals.forEach((goal) => add(documents, {
    id: `goal:${goal.id}`, kind: 'goal', title: `Meta · ${goal.userName || 'Equipe'}`,
    subtitle: `${goal.metric} · ${goal.targetValue}`, route: 'goals', searchText: `${goal.userName} ${goal.metric} ${goal.targetValue}`,
  }))
  snapshot.automationRules.forEach((rule) => add(documents, {
    id: `automation:${rule.id}`, kind: 'automation', title: rule.name,
    subtitle: `${rule.triggerType} · ${rule.enabled ? 'Ativa' : 'Pausada'}`, route: 'automations', searchText: `${rule.name} ${rule.triggerType} ${rule.enabled ? 'ativa' : 'pausada'}`,
  }))
  return documents
}

export function searchWorkspace(query: string, snapshot: WorkspaceSnapshot | null | undefined, limit = 10): GlobalSearchResult[] {
  if (!snapshot || !normalize(query)) return []
  return buildGlobalSearchDocuments(snapshot)
    .map((document) => ({ document, score: scoreText(query, document.title, document.searchText, document.priority) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.document.title.localeCompare(b.document.title, 'pt-BR'))
    .slice(0, Math.max(1, limit))
    .map(({ document, score }) => ({ id: document.id, kind: document.kind, title: document.title, subtitle: document.subtitle, route: document.route, context: document.context, score }))
}

export const globalSearchKindLabel: Record<GlobalSearchKind, string> = {
  module: 'Módulo', lead: 'Contato', company: 'Conta', contact: 'Contato', proposal: 'Proposta', activity: 'Atividade', event: 'Agenda', playbook: 'Playbook', goal: 'Meta', automation: 'Automação',
}
