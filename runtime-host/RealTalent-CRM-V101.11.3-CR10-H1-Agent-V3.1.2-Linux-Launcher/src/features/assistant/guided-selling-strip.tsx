import { ArrowRight, Bot, CalendarClock, CircleAlert, Lightbulb, PhoneCall, Sparkles, Target, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAppNavigation, useAppWorkspace } from '../../app/app-context'
import type { AppRoute, WorkspaceSnapshot } from '../../domain/types'
import { formatCurrency } from '../../domain/formatters'
import { buildDealPortfolio, type DealIntelligence, type DealPortfolio } from '../../services/deal-intelligence'
import { buildWorkdayQueue, type WorkdayItem, type WorkdayQueue } from '../../services/workday'
import { useAuth } from '../auth/auth-context'
import { usePreferences } from '../settings/preferences-context'

interface GuidedSignal {
  id: string
  eyebrow: string
  title: string
  detail: string
  reason: string
  tone: 'critical' | 'attention' | 'opportunity' | 'neutral'
  metric?: string
  leadId?: string
  actionLabel: string
  actionRoute: AppRoute
  actionContext?: Record<string, string>
  assistantPrompt: string
}

const DAY = 86_400_000

const leadLabel = (deal: DealIntelligence) => deal.lead.company || deal.lead.name
const workdayLabel = (item: WorkdayItem) => item.lead.company || item.lead.name
const daysSince = (value: string | null | undefined, now: Date) => {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? Math.max(0, Math.floor((now.getTime() - time) / DAY)) : 0
}

const actionForWorkday = (item: WorkdayItem): Pick<GuidedSignal, 'actionLabel' | 'actionRoute' | 'actionContext'> => {
  if (item.action === 'call') return { actionLabel: 'Ligar agora', actionRoute: 'calls', actionContext: { leadId: item.lead.id, action: 'start-call' } }
  if (item.action === 'meeting') return { actionLabel: 'Preparar reunião', actionRoute: 'agenda', actionContext: { leadId: item.lead.id, action: 'create-meeting' } }
  if (item.action === 'whatsapp') return { actionLabel: 'Abrir conversa', actionRoute: 'communications', actionContext: { leadId: item.lead.id, action: 'whatsapp' } }
  if (item.action === 'data') return { actionLabel: 'Completar dados', actionRoute: 'leads', actionContext: { leadId: item.lead.id } }
  if (item.action === 'review') return { actionLabel: 'Revisar negócio', actionRoute: 'pipeline', actionContext: { leadId: item.lead.id, action: 'deal-inspector' } }
  return { actionLabel: 'Abrir follow-up', actionRoute: 'followups', actionContext: { leadId: item.lead.id } }
}

const actionForDeal = (deal: DealIntelligence): Pick<GuidedSignal, 'actionLabel' | 'actionRoute' | 'actionContext'> => {
  const route = deal.nextBestAction.route
  const actionContext = route === 'calls'
    ? { leadId: deal.lead.id, action: 'start-call' }
    : route === 'agenda'
      ? { leadId: deal.lead.id, action: 'create-meeting' }
      : route === 'proposals'
        ? { leadId: deal.lead.id, ...(deal.proposal?.id ? { proposalId: deal.proposal.id } : {}), action: 'follow-proposal' }
        : route === 'pipeline'
          ? { leadId: deal.lead.id, action: 'deal-inspector' }
          : { leadId: deal.lead.id }
  return { actionLabel: deal.nextBestAction.title, actionRoute: route, actionContext }
}

function resolveGuidedSignal(route: AppRoute, snapshot: WorkspaceSnapshot, queue: WorkdayQueue, portfolio: DealPortfolio, now: Date): GuidedSignal | null {
  const topWorkday = queue.items[0] ?? null
  const topDeal = portfolio.priorities[0] ?? null
  const mostAtRisk = [...portfolio.deals]
    .filter((deal) => deal.healthLevel === 'critical' || deal.healthLevel === 'attention')
    .sort((a, b) => a.healthScore - b.healthScore || b.commercialValue - a.commercialValue)[0] ?? null

  if (route === 'dashboard' && topWorkday) {
    const action = actionForWorkday(topWorkday)
    return {
      id: `dashboard:${topWorkday.id}`,
      eyebrow: 'Próxima melhor ação',
      title: `${topWorkday.title} · ${workdayLabel(topWorkday)}`,
      detail: topWorkday.explanation,
      reason: `Score de prioridade ${topWorkday.score}/100 · ${topWorkday.slaState === 'breached' ? 'prazo vencido' : topWorkday.slaState === 'due_soon' ? 'prazo próximo' : 'prioridade operacional'}`,
      tone: topWorkday.slaState === 'breached' ? 'critical' : topWorkday.score >= 75 ? 'attention' : 'opportunity',
      metric: `${topWorkday.score}/100`,
      leadId: topWorkday.lead.id,
      ...action,
      assistantPrompt: `Por que ${workdayLabel(topWorkday)} é minha prioridade e como devo abordar este contato?`,
    }
  }

  if (route === 'pipeline' && (mostAtRisk || topDeal)) {
    const deal = mostAtRisk ?? topDeal!
    const action = actionForDeal(deal)
    return {
      id: `pipeline:${deal.lead.id}`,
      eyebrow: deal.healthLevel === 'critical' ? 'Risco crítico detectado' : 'Inteligência do pipeline',
      title: `${leadLabel(deal)} · ${deal.healthScore}/100`,
      detail: deal.nextBestAction.explanation,
      reason: deal.risks[0]?.detail ?? `RealTalent estima ${deal.realTalentProbability}% de probabilidade com base nos sinais atuais.`,
      tone: deal.healthLevel === 'critical' ? 'critical' : deal.healthLevel === 'attention' ? 'attention' : 'opportunity',
      metric: formatCurrency(deal.commercialValue),
      leadId: deal.lead.id,
      ...action,
      assistantPrompt: `Explique os riscos de ${leadLabel(deal)} e qual é a melhor próxima ação agora.`,
    }
  }

  if (route === 'leads') {
    const incomplete = snapshot.leads
      .filter((lead) => lead.status === 'active' && (!lead.phone || !lead.email || !lead.nextActionAt))
      .sort((a, b) => Number(Boolean(a.nextActionAt)) - Number(Boolean(b.nextActionAt)) || b.value - a.value)[0]
    if (incomplete) {
      const missing = [!incomplete.phone ? 'telefone' : '', !incomplete.email ? 'e-mail' : '', !incomplete.nextActionAt ? 'próxima ação' : ''].filter(Boolean)
      return {
        id: `lead:${incomplete.id}`,
        eyebrow: 'Qualidade para avançar',
        title: `${incomplete.company || incomplete.name} precisa de contexto`,
        detail: `Faltam ${missing.join(', ')} para o lead entrar em uma execução comercial mais confiável.`,
        reason: incomplete.value > 0 ? `${formatCurrency(incomplete.value)} em potencial sem todos os dados operacionais.` : 'Complete o cadastro antes de aumentar o volume de tentativas.',
        tone: 'attention',
        leadId: incomplete.id,
        actionLabel: 'Completar lead',
        actionRoute: 'leads',
        actionContext: { leadId: incomplete.id },
        assistantPrompt: `O que falta para eu avançar ${incomplete.company || incomplete.name} com segurança?`,
      }
    }
  }

  if (route === 'proposals') {
    const waiting = snapshot.proposals
      .filter((proposal) => proposal.isCurrentVersion && ['sent', 'viewed'].includes(proposal.status))
      .sort((a, b) => daysSince(b.sentAt ?? b.updatedAt, now) - daysSince(a.sentAt ?? a.updatedAt, now))[0]
    if (waiting) {
      const lead = snapshot.leads.find((item) => item.id === waiting.leadId)
      const idle = daysSince(waiting.viewedAt ?? waiting.sentAt ?? waiting.updatedAt, now)
      return {
        id: `proposal:${waiting.id}`,
        eyebrow: waiting.status === 'viewed' ? 'Proposta visualizada' : 'Proposta aguardando resposta',
        title: `${lead?.company || lead?.name || waiting.title} · ${formatCurrency(waiting.total)}`,
        detail: waiting.status === 'viewed' ? `A proposta foi visualizada e está há ${idle} dia(s) sem avanço registrado.` : `A proposta está enviada há ${idle} dia(s) sem retorno registrado.`,
        reason: 'O melhor momento de follow-up é determinado pelo sinal real da proposta, não apenas pela data de criação.',
        tone: idle >= 3 ? 'attention' : 'opportunity',
        metric: waiting.status === 'viewed' ? 'Visualizada' : 'Enviada',
        leadId: waiting.leadId,
        actionLabel: 'Fazer follow-up',
        actionRoute: 'proposals',
        actionContext: { proposalId: waiting.id, leadId: waiting.leadId, action: 'follow-proposal' },
        assistantPrompt: `Prepare um follow-up para a proposta ${waiting.proposalNumber} de ${lead?.company || lead?.name || 'este cliente'}.`,
      }
    }
  }

  if (route === 'communications' && topWorkday) {
    return {
      id: `communications:${topWorkday.id}`,
      eyebrow: 'Conversa que merece atenção',
      title: workdayLabel(topWorkday),
      detail: topWorkday.explanation,
      reason: 'Abra o contato pelo canal adequado e registre somente o que realmente aconteceu.',
      tone: topWorkday.slaState === 'breached' ? 'critical' : 'attention',
      leadId: topWorkday.lead.id,
      actionLabel: 'Abrir contato',
      actionRoute: 'communications',
      actionContext: { leadId: topWorkday.lead.id },
      assistantPrompt: `Qual canal e abordagem devo usar agora com ${workdayLabel(topWorkday)}?`,
    }
  }

  if (route === 'followups') {
    const overdue = snapshot.activities
      .filter((activity) => activity.dueAt && !activity.completedAt && !['cancelled', 'superseded'].includes(activity.resolutionStatus ?? '') && new Date(activity.dueAt).getTime() < now.getTime())
      .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())[0]
    if (overdue) {
      const lead = overdue.leadId ? snapshot.leads.find((item) => item.id === overdue.leadId) : null
      return {
        id: `followup:${overdue.id}`,
        eyebrow: 'Follow-up vencido',
        title: overdue.title,
        detail: lead ? `${lead.company || lead.name} · ${overdue.description || 'Atividade precisa de resolução.'}` : (overdue.description || 'Atividade precisa de resolução.'),
        reason: 'Resolver o vencido primeiro evita que o CRM acumule prioridades artificiais.',
        tone: 'critical',
        leadId: overdue.leadId ?? undefined,
        actionLabel: 'Resolver agora',
        actionRoute: 'followups',
        actionContext: overdue.leadId ? { leadId: overdue.leadId } : undefined,
        assistantPrompt: lead ? `Como devo resolver este follow-up vencido de ${lead.company || lead.name}?` : 'Como devo priorizar meus follow-ups vencidos?',
      }
    }
  }

  if (route === 'calls') {
    const callItem = queue.items.find((item) => item.action === 'call') ?? topWorkday
    if (callItem) {
      return {
        id: `calls:${callItem.id}`,
        eyebrow: 'Melhor ligação agora',
        title: workdayLabel(callItem),
        detail: callItem.explanation,
        reason: 'A recomendação combina SLA, próxima ação, estágio, temperatura e sinais do negócio.',
        tone: callItem.slaState === 'breached' ? 'critical' : 'opportunity',
        metric: `${callItem.score}/100`,
        leadId: callItem.lead.id,
        actionLabel: 'Preparar ligação',
        actionRoute: 'calls',
        actionContext: { leadId: callItem.lead.id, action: 'start-call' },
        assistantPrompt: `Prepare a ligação para ${workdayLabel(callItem)}.`,
      }
    }
  }

  if (route === 'agenda') {
    const upcoming = snapshot.events
      .filter((event) => ['confirmed', 'tentative'].includes(event.status) && new Date(event.startsAt).getTime() >= now.getTime())
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0]
    if (upcoming) {
      const lead = upcoming.leadId ? snapshot.leads.find((item) => item.id === upcoming.leadId) : null
      return {
        id: `agenda:${upcoming.id}`,
        eyebrow: 'Próxima reunião',
        title: upcoming.title,
        detail: `${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(upcoming.startsAt))}${lead ? ` · ${lead.company || lead.name}` : ''}`,
        reason: 'Revise objetivo, contexto, decisores e última interação antes de entrar na reunião.',
        tone: 'opportunity',
        leadId: upcoming.leadId ?? undefined,
        actionLabel: lead ? 'Preparar contexto' : 'Abrir agenda',
        actionRoute: lead ? 'leads' : 'agenda',
        actionContext: lead ? { leadId: lead.id } : undefined,
        assistantPrompt: lead ? `Prepare minha reunião com ${lead.company || lead.name}.` : 'O que devo preparar para minha próxima reunião?',
      }
    }
  }

  if (route === 'metrics' && portfolio.deals.length) {
    return {
      id: 'metrics:pipeline-health',
      eyebrow: 'Leitura executiva',
      title: `${portfolio.critical + portfolio.attention} negócio(s) exigem atenção`,
      detail: `${formatCurrency(portfolio.atRiskValue)} estão em negócios classificados como atenção ou críticos.`,
      reason: `${portfolio.missingDecisionMaker} sem decisor · ${portfolio.noNextStep} sem próxima ação · ${portfolio.cooling} esfriando.`,
      tone: portfolio.critical > 0 ? 'critical' : portfolio.attention > 0 ? 'attention' : 'opportunity',
      metric: `${portfolio.averageHealth}/100`,
      actionLabel: 'Ver no Pipeline',
      actionRoute: 'pipeline',
      assistantPrompt: 'Explique os principais riscos do meu pipeline e o que devo fazer primeiro.',
    }
  }

  if (route === 'commercial-map') {
    const pendingLocation = snapshot.leads.filter((lead) => lead.status === 'active' && (!Number.isFinite(lead.latitude) || !Number.isFinite(lead.longitude)))
    if (pendingLocation.length) return {
      id: 'map:pending-location',
      eyebrow: 'Cobertura geográfica incompleta',
      title: `${pendingLocation.length} conta(s) ainda precisam de localização`,
      detail: 'Sem coordenadas confiáveis o território pode exibir aproximações ou ocultar contas.',
      reason: 'Revise endereço, cidade e estado antes de usar o mapa para cobertura comercial.',
      tone: 'attention',
      metric: String(pendingLocation.length),
      actionLabel: 'Revisar leads',
      actionRoute: 'leads',
      assistantPrompt: 'Quais contas precisam de dados geográficos antes de eu usar o território?',
    }
  }

  if (route === 'prospecting') {
    const newWithoutAction = snapshot.leads.filter((lead) => lead.status === 'active' && !lead.nextActionAt && daysSince(lead.createdAt, now) <= 7)
    return {
      id: 'prospecting:flow',
      eyebrow: 'Disciplina de prospecção',
      title: newWithoutAction.length ? `${newWithoutAction.length} lead(s) novos ainda sem próxima ação` : 'Fluxo de prospecção pronto para revisão',
      detail: 'Capture → valide identidade/contato → elimine duplicidades → aprove → envie ao CRM com responsável e próxima ação.',
      reason: 'Garimpo só gera valor quando o lead sai da captura já preparado para entrar na operação comercial.',
      tone: newWithoutAction.length ? 'attention' : 'neutral',
      actionLabel: 'Abrir Contatos',
      actionRoute: 'leads',
      assistantPrompt: 'Como devo revisar e priorizar os leads vindos do Garimpo?',
    }
  }

  if (topDeal && ['goals', 'playbooks', 'automations'].includes(route)) {
    const action = actionForDeal(topDeal)
    return {
      id: `generic:${route}:${topDeal.lead.id}`,
      eyebrow: 'Sinal comercial ativo',
      title: `${leadLabel(topDeal)} · ${topDeal.healthLabel}`,
      detail: topDeal.nextBestAction.explanation,
      reason: topDeal.risks[0]?.detail ?? 'Use este sinal como contexto para decidir a próxima ação.',
      tone: topDeal.healthLevel === 'critical' ? 'critical' : topDeal.healthLevel === 'attention' ? 'attention' : 'opportunity',
      metric: `${topDeal.healthScore}/100`,
      leadId: topDeal.lead.id,
      ...action,
      assistantPrompt: `O que devo fazer agora com ${leadLabel(topDeal)}?`,
    }
  }

  return null
}

const toneIcon = {
  critical: CircleAlert,
  attention: Target,
  opportunity: Sparkles,
  neutral: Lightbulb,
}

export function GuidedSellingStrip() {
  const { snapshot } = useAppWorkspace()
  const { route, navigate } = useAppNavigation()
  const { preferences } = usePreferences()
  const { user } = useAuth()
  const [expanded, setExpanded] = useState(false)

  const signal = useMemo(() => {
    if (!snapshot || route === 'settings') return null
    const now = new Date()
    const ownerId = user?.id ?? undefined
    const queue = buildWorkdayQueue(snapshot, preferences.commercial, now, ownerId)
    const portfolio = buildDealPortfolio(snapshot, preferences.commercial.dealIntelligence, now, ownerId)
    return resolveGuidedSignal(route, snapshot, queue, portfolio, now)
  }, [preferences.commercial, route, snapshot, user?.id])

  if (!signal) return null
  const Icon = toneIcon[signal.tone]

  const askAssistant = () => window.dispatchEvent(new CustomEvent('crm:assistant-open', { detail: { prompt: signal.assistantPrompt } }))
  const execute = () => navigate(signal.actionRoute, signal.actionContext)

  return <section className={`guided-selling-v10096 is-${signal.tone} ${expanded ? 'is-expanded' : ''}`} aria-label="Orientação comercial do RealTalent">
    <div className="guided-selling-v10096__signal">
      <span className="guided-selling-v10096__icon"><Icon size={17}/></span>
      <div className="guided-selling-v10096__copy">
        <span>{signal.eyebrow}</span>
        <strong>{signal.title}</strong>
        <p>{signal.detail}</p>
      </div>
      {signal.metric ? <b className="guided-selling-v10096__metric">{signal.metric}</b> : null}
    </div>
    <div className="guided-selling-v10096__actions">
      <button type="button" className="guided-selling-v10096__why" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}><Lightbulb size={15}/> Por quê?</button>
      <button type="button" className="guided-selling-v10096__assistant" onClick={askAssistant}><Bot size={15}/> Perguntar</button>
      <button type="button" className="guided-selling-v10096__primary" onClick={execute}>{signal.actionLabel} <ArrowRight size={15}/></button>
    </div>
    {expanded ? <div className="guided-selling-v10096__reason"><UsersRound size={15}/><span>{signal.reason}</span>{signal.actionRoute === 'calls' ? <PhoneCall size={15}/> : signal.actionRoute === 'agenda' ? <CalendarClock size={15}/> : <Target size={15}/>}</div> : null}
  </section>
}
