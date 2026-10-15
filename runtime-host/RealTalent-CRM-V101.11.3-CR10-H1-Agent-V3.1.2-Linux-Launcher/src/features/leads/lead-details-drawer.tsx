import {
  AlertTriangle, Archive, ArrowUpRight, BriefcaseBusiness, Building2, CalendarClock, CalendarPlus, CheckCircle2, ChevronRight,
  ChevronDown, ChevronUp, Clock3, Edit3, ExternalLink, FileText, Globe2, History, Mail, MapPin, MessageCircle, Network, NotebookPen, PhoneCall,
  RefreshCw, RotateCcw, Save, ShieldCheck, Sparkles, Tag, Target, UserRound, UsersRound, X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAppActions, useAppNavigation, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { OwnerPicker, SelectionSelect } from '../../components/selection'
import { StatusPill } from '../../components/ui/status-pill'
import { formatCurrency, formatDateTime, initials } from '../../domain/formatters'
import type { ActivityType, Lead, WorkspaceMember } from '../../domain/types'
import { leadDataIssues, type DuplicateMatch } from '../../services/lead-intelligence'
import { contactBlockedMessage } from '../../services/contact-policy'
import { resolveLeadCallTarget } from '../../services/call-workspace'
import { leadScoreInsight } from '../../services/lead-scoring'
import { buildDealIntelligence, type DealIntelligence } from '../../services/deal-intelligence'
import { usePreferences } from '../settings/preferences-context'
import { Account360Modal } from './account-360-modal'
import { SalesMessageModal } from '../pipeline/sales-message-modal'
import { buildAccountIntelligence, decisionRoleLabels } from '../../services/account-intelligence'
import { useOverlayDialog } from '../../app/use-overlay-dialog'
import { normalizeExternalUrl } from '../../lib/browser-actions'
import { CALL_SESSION_OBJECTIVES, callSessionObjective, type CallSessionObjective } from '../../services/call-session-intelligence'
import { recommendPlaybooks } from '../../services/coaching-engine'
import {
  buildUnifiedSalesWorkspace,
  clearLeadSalesStrategyPreference,
  readLeadSalesStrategyPreference,
  saveLeadSalesStrategyPreference,
} from '../../services/unified-sales-workspace'
import { readLeadWorkspacePreferences, saveLeadWorkspacePreferences, type LeadWorkspaceMode } from '../../services/lead-workspace-preferences-v1015'
import { contactsForLead, relationshipsForLead } from '../../services/lead-relations-v10151'
import { nextRovingIndex } from '../../lib/keyboard-navigation'
import { canEditSensitiveField, canViewSensitiveField } from '../../services/team-access-control'

const callOutcomeLabel: Record<string, string> = {
  answered: 'Atendeu', no_answer: 'Não atendeu', busy: 'Ocupado', voicemail: 'Caixa postal', callback_requested: 'Pediu retorno', interested: 'Demonstrou interesse',
  meeting_scheduled: 'Reunião marcada', proposal_requested: 'Solicitou proposta', proposal_sent: 'Proposta enviada', wrong_person: 'Pessoa errada', invalid_number: 'Número inválido',
  not_interested: 'Sem interesse', sale_completed: 'Venda concluída', other: 'Outro',
}

type HistoryFilter = 'all' | 'activities' | 'calls' | 'events'
type WorkspaceTab = 'context' | 'history' | 'notes'
type MessageChannel = 'whatsapp' | 'email'

export interface LeadCallLaunchOptions {
  playbookId?: string
  sessionObjective?: CallSessionObjective
}

interface Props {
  readOnly?: boolean
  openAccountOnMount?: boolean
  lead: Lead | null
  duplicateMatches: DuplicateMatch[]
  onClose(): void
  onEdit(lead: Lead): void
  onActivity(lead: Lead, type?: ActivityType): void
  onEvent(lead: Lead): void
  onCall(lead: Lead, options?: LeadCallLaunchOptions): void
  onOpenDuplicate(lead: Lead): void
}

export function LeadDetailsDrawer({ readOnly = false, openAccountOnMount = false, lead, duplicateMatches, onClose, onEdit, onActivity, onEvent, onCall, onOpenDuplicate }: Props) {
  const { snapshot, teamAccess } = useAppWorkspace()
  const { setRoute, navigate } = useAppNavigation()
  const { notify, confirmAction } = useAppUi()
  const { moveLead, updateLead, listWorkspaceMembers } = useAppActions()
  const { preferences } = usePreferences()
  const canViewPhone = canViewSensitiveField(teamAccess,'contact_phone')
  const canEditPhone = canEditSensitiveField(teamAccess,'contact_phone')
  const canViewEmail = canViewSensitiveField(teamAccess,'contact_email')
  const canEditEmail = canEditSensitiveField(teamAccess,'contact_email')
  const canViewDealValue = canViewSensitiveField(teamAccess,'deal_value')
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all')
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('context')
  const [busy, setBusy] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [messageChannel, setMessageChannel] = useState<MessageChannel | null>(null)
  const [inlineEditing, setInlineEditing] = useState(false)
  const [inlineDraft, setInlineDraft] = useState({ name: '', company: '', phone: '', email: '', city: '', ownerId: '', nextActionAt: '' })
  const [ownerOptions, setOwnerOptions] = useState<WorkspaceMember[]>([])
  const [noteDraft, setNoteDraft] = useState('')
  const [strategyObjective, setStrategyObjective] = useState<CallSessionObjective>('first_meeting')
  const [selectedPlaybookId, setSelectedPlaybookId] = useState('')
  const [workspaceMode, setWorkspaceMode] = useState<LeadWorkspaceMode>('focus')
  const [strategyExpanded, setStrategyExpanded] = useState(false)
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const overlayId = `lead-drawer:${lead?.id ?? 'closed'}`
  useOverlayDialog(Boolean(lead), overlayId, onClose, '[data-lead-drawer-close], [role="tab"][aria-selected="true"], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]')

  useEffect(() => {
    if (!lead) return
    document.body.classList.add('drawer-open')
    return () => document.body.classList.remove('drawer-open')
  }, [lead?.id])
  useEffect(() => { if (lead && openAccountOnMount) setAccountOpen(true) }, [lead?.id, openAccountOnMount])
  useEffect(() => {
    if (!lead || !snapshot) return
    setInlineDraft({
      name: lead.name, company: lead.company, phone: lead.phone, email: lead.email, city: lead.city, ownerId: lead.ownerId ?? '',
      nextActionAt: lead.nextActionAt ? lead.nextActionAt.slice(0, 16) : '',
    })
    setNoteDraft(lead.notes ?? '')
    const stored = readLeadSalesStrategyPreference(snapshot.workspace.id, lead, snapshot)
    setStrategyObjective(stored.objective)
    setSelectedPlaybookId(stored.playbookId)
    const workspacePreferences = readLeadWorkspacePreferences(snapshot.workspace.id)
    setWorkspaceMode(workspacePreferences.mode)
    setStrategyExpanded(workspacePreferences.strategyExpanded)
    setDetailsExpanded(workspacePreferences.detailsExpanded)
    setInlineEditing(false)
    setWorkspaceTab('context')
  }, [lead?.id, snapshot?.workspace.id])

  useEffect(() => {
    if (!lead) return
    void listWorkspaceMembers()
      .then(setOwnerOptions)
      .catch(() => setOwnerOptions([]))
  }, [lead?.id, listWorkspaceMembers])

  const dealInsight = useMemo(() => lead && snapshot && preferences.commercial.dealIntelligence.enabled
    ? buildDealIntelligence(lead, snapshot, preferences.commercial.dealIntelligence)
    : null, [lead, preferences.commercial.dealIntelligence, snapshot])

  const salesWorkspace = useMemo(() => lead && snapshot ? buildUnifiedSalesWorkspace(snapshot, lead) : null, [lead, snapshot])

  const routeRecommendations = useMemo(() => {
    if (!lead || !snapshot) return []
    return recommendPlaybooks(snapshot.playbooks, {
      objective: strategyObjective,
      stageId: lead.stageId,
      outcome: salesWorkspace?.lastCall?.outcome ?? null,
      decisionRole: lead.decisionRole ?? null,
      temperature: lead.temperature,
      kind: 'script',
    })
  }, [lead, salesWorkspace?.lastCall?.outcome, snapshot, strategyObjective])

  const activeScripts = useMemo(() => snapshot?.playbooks.filter((item) => item.active && item.kind === 'script') ?? [], [snapshot?.playbooks])
  const selectedPlaybook = activeScripts.find((item) => item.id === selectedPlaybookId) ?? routeRecommendations[0]?.playbook ?? activeScripts[0] ?? null
  const selectedRecommendation = routeRecommendations.find((item) => item.playbook.id === selectedPlaybook?.id) ?? null

  const timeline = useMemo(() => {
    if (!lead || !snapshot) return []
    const activities = snapshot.activities.filter((item) => item.leadId === lead.id).map((item) => ({
      id: `activity-${item.id}`, kind: 'activities' as const, date: item.completedAt ?? item.dueAt ?? item.createdAt,
      title: item.title, description: item.description || (item.completedAt ? 'Atividade concluída.' : 'Atividade pendente.'),
      detail: item.completedAt ? 'Concluída' : item.dueAt ? 'Programada' : 'Registrada', tone: item.completedAt ? 'success' : 'warning',
    }))
    const calls = snapshot.calls.filter((item) => item.leadId === lead.id).map((item) => ({
      id: `call-${item.id}`, kind: 'calls' as const, date: item.endedAt ?? item.startedAt,
      title: `Ligação — ${callOutcomeLabel[item.outcome] ?? item.outcome}`, description: item.notes || 'Ligação registrada sem observações.',
      detail: `${Math.max(0, Math.round(item.durationSeconds / 60))} min`, tone: item.outcome === 'not_interested' || item.outcome === 'invalid_number' ? 'danger' : 'success',
    }))
    const events = snapshot.events.filter((item) => item.leadId === lead.id).map((item) => ({
      id: `event-${item.id}`, kind: 'events' as const, date: item.startsAt, title: item.title,
      description: item.description || item.location || 'Compromisso comercial.', detail: item.status === 'cancelled' ? 'Cancelado' : item.status === 'completed' ? 'Concluído' : 'Agenda',
      tone: item.status === 'cancelled' ? 'danger' : item.status === 'completed' ? 'success' : 'info',
    }))
    return [...calls, ...events, ...activities]
      .filter((entry) => historyFilter === 'all' || entry.kind === historyFilter)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [historyFilter, lead, snapshot])

  const workspaceTabs: WorkspaceTab[] = ['context', 'history', 'notes']
  const handleWorkspaceTabKey = (event: ReactKeyboardEvent<HTMLButtonElement>, current: WorkspaceTab) => {
    const nextIndex = nextRovingIndex(event.key, workspaceTabs.indexOf(current), workspaceTabs.length)
    if (nextIndex === null) return
    event.preventDefault()
    const next = workspaceTabs[nextIndex]
    setWorkspaceTab(next)
    window.requestAnimationFrame(() => document.getElementById(`lead-workspace-tab-${next}`)?.focus())
  }

  if (!lead || !snapshot || !salesWorkspace) return null
  const stage = snapshot.stages.find((item) => item.id === lead.stageId)
  const issues = leadDataIssues(lead)
  const priority = leadScoreInsight(lead, snapshot, preferences.commercial.leadScoring)
  const duplicates = duplicateMatches.filter((item) => item.leadId === lead.id).map((item) => ({ ...item, lead: snapshot.leads.find((candidate) => candidate.id === item.matchId) })).filter((item) => item.lead)
  const resolvedContactTarget = resolveLeadCallTarget(lead, snapshot.contacts)
  const companyContacts = contactsForLead(lead, snapshot.contacts)
  const companyRelationships = relationshipsForLead(lead, snapshot.contactRelationships)
  const accountIntelligence = buildAccountIntelligence(lead, companyContacts, companyRelationships, snapshot)
  const pinnedNotes = snapshot.activities.filter((item) => item.leadId === lead.id && item.type === 'note' && item.resolutionReason === 'pinned_call_note').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const socialLinks = {
    instagram: normalizeExternalUrl(lead.instagramUrl), linkedin: normalizeExternalUrl(lead.linkedinUrl),
    facebook: normalizeExternalUrl(lead.facebookUrl), website: normalizeExternalUrl(lead.website),
  }
  const objectiveDefinition = callSessionObjective(strategyObjective)
  const primaryAction = dealInsight?.nextBestAction ?? priority.nextBestAction

  const openMessage = (channel: MessageChannel) => {
    const blocked = contactBlockedMessage(lead, channel)
    if (blocked) { notify('info', blocked); return }
    if (channel === 'whatsapp' && (!canViewPhone || !resolvedContactTarget.phone)) { notify('info', 'Nenhum telefone disponível para WhatsApp.'); return }
    if (channel === 'email' && (!canViewEmail || !lead.email)) { notify('info', 'Nenhum e-mail disponível para este lead.'); return }
    setMessageChannel(channel)
  }

  const launchPreparedCall = () => {
    const blocked = contactBlockedMessage(lead, 'call')
    if (blocked) { notify('info', blocked); return }
    if (!canViewPhone || !resolvedContactTarget.phone) { notify('info', 'Telefone indisponível ou restrito pelo perfil.'); return }
    onCall(lead, { playbookId: selectedPlaybook?.id, sessionObjective: strategyObjective })
  }

  const saveStrategy = (objective: CallSessionObjective, playbookId: string) => {
    saveLeadSalesStrategyPreference(snapshot.workspace.id, lead.id, { objective, playbookId })
  }

  const setWorkspacePresentation = (mode: LeadWorkspaceMode) => {
    const expanded = mode === 'complete'
    setWorkspaceMode(mode)
    setStrategyExpanded(expanded)
    setDetailsExpanded(expanded)
    saveLeadWorkspacePreferences(snapshot.workspace.id, { mode, strategyExpanded: expanded, detailsExpanded: expanded })
  }

  const toggleStrategy = () => {
    const next = !strategyExpanded
    setStrategyExpanded(next)
    saveLeadWorkspacePreferences(snapshot.workspace.id, { strategyExpanded: next })
  }

  const toggleDetails = () => {
    const next = !detailsExpanded
    setDetailsExpanded(next)
    saveLeadWorkspacePreferences(snapshot.workspace.id, { detailsExpanded: next })
  }

  const changeStage = async (stageId: string) => {
    if (!stageId || stageId === lead.stageId) return
    setBusy(true)
    try { await moveLead(lead.id, stageId) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível mover o lead.') }
    finally { setBusy(false) }
  }

  const archive = async () => {
    if (!await confirmAction({ title: `Arquivar ${lead.name}?`, description: 'O contato sairá das filas ativas, mas todo o histórico será preservado.', confirmLabel: 'Arquivar contato', tone: 'warning' })) return
    const previousStatus = lead.status
    setBusy(true)
    try {
      await updateLead(lead.id, { status: 'archived' }); onClose()
      notify('info', `${lead.name} foi arquivado.`, { action: { label: 'Desfazer', run: async () => { await updateLead(lead.id, { status: previousStatus }) } } })
    }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível arquivar.') }
    finally { setBusy(false) }
  }

  const saveInlineSummary = async () => {
    if (!inlineDraft.name.trim()) { notify('error', 'Informe o nome do contato.'); return }
    setBusy(true)
    try {
      await updateLead(lead.id, {
        name: inlineDraft.name.trim(), company: inlineDraft.company.trim() || inlineDraft.name.trim(),
        ...(canEditPhone ? { phone:inlineDraft.phone.trim() } : {}),
        ...(canEditEmail ? { email:inlineDraft.email.trim() } : {}),
        city: inlineDraft.city.trim(), ownerId: inlineDraft.ownerId || null,
        ownerName: ownerOptions.find((member) => member.userId === inlineDraft.ownerId)?.displayName ?? 'Equipe',
        nextActionAt: inlineDraft.nextActionAt ? new Date(inlineDraft.nextActionAt).toISOString() : null,
      })
      setInlineEditing(false)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível atualizar a ficha.') }
    finally { setBusy(false) }
  }

  const saveNotes = async () => {
    setBusy(true)
    try { await updateLead(lead.id, { notes: noteDraft.trim() }); notify('success', 'Anotações comerciais atualizadas.') }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar as anotações.') }
    finally { setBusy(false) }
  }

  const runDealAction = (insight: DealIntelligence) => {
    const action = insight.nextBestAction
    if (action.kind === 'call') { launchPreparedCall(); return }
    if (action.kind === 'followup') { onActivity(lead, 'followup'); return }
    if (action.kind === 'meeting') { onEvent(lead); return }
    if (action.kind === 'map_stakeholder') { setAccountOpen(true); return }
    if (action.kind === 'proposal') { navigate('proposals', { leadId: lead.id, action: 'create-proposal' }); onClose(); return }
    if (action.kind === 'review_proposal' && insight.proposal) { navigate('proposals', { leadId: lead.id, proposalId: insight.proposal.id }); onClose(); return }
    setRoute(action.route)
    onClose()
  }

  const runLeadAction = () => {
    const action = priority.nextBestAction
    if (action.kind === 'call') { launchPreparedCall(); return }
    if (action.kind === 'whatsapp') { openMessage('whatsapp'); return }
    if (action.kind === 'meeting') { onEvent(lead); return }
    if (action.kind === 'followup') { onActivity(lead, 'followup'); return }
    if (action.kind === 'data') { onEdit(lead); return }
    setRoute(action.route)
    onClose()
  }

  const runPrimaryAction = () => dealInsight ? runDealAction(dealInsight) : runLeadAction()

  const drawer = <div className="lead-drawer-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside className={`lead-drawer lead-drawer--sales-workspace sales-workspace-v1015 sales-workspace-v1015--${workspaceMode}`} data-overlay-id={overlayId} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Workspace comercial de ${lead.name}`}>
      <header className="lead-drawer__header sales-workspace-v1013__header">
        <div className="lead-drawer__identity">
          <span className="lead-avatar">{initials(lead.name)}</span>
          <div><span className="eyebrow">Contato Workspace · V101.6.5</span><h2>{lead.name}</h2><p>{lead.company || 'Empresa não informada'} · {stage?.name ?? 'Sem etapa'} · {lead.ownerName || 'Sem responsável'}</p></div>
        </div>
        <div className="lead-drawer__header-actions sales-workspace-v1015__header-actions">
          <div className="sales-workspace-v1015__mode-switch" role="group" aria-label="Densidade do workspace">
            <button type="button" className={workspaceMode === 'focus' ? 'is-active' : ''} aria-pressed={workspaceMode === 'focus'} onClick={() => setWorkspacePresentation('focus')}>Foco</button>
            <button type="button" className={workspaceMode === 'complete' ? 'is-active' : ''} aria-pressed={workspaceMode === 'complete'} onClick={() => setWorkspacePresentation('complete')}>Completo</button>
          </div>
          <StatusPill tone={lead.status === 'won' ? 'success' : lead.status === 'lost' ? 'danger' : lead.status === 'archived' ? 'neutral' : 'info'}>{lead.status === 'active' ? 'Ativo' : lead.status === 'won' ? 'Ganho' : lead.status === 'lost' ? 'Perdido' : 'Arquivado'}</StatusPill>
          {!readOnly ? <Button size="sm" variant="secondary" onClick={() => onEdit(lead)}><Edit3 size={16} /> Editar</Button> : null}
          <button className="icon-button" type="button" data-lead-drawer-close onClick={onClose} aria-label="Fechar ficha"><X size={19} /></button>
        </div>
      </header>

      {!readOnly ? <div className="lead-drawer__quick-actions sales-workspace-v1013__quick-actions sales-workspace-v1015__command-bar">
        <Button size="sm" disabled={!resolvedContactTarget.phone || lead.doNotContact} onClick={launchPreparedCall}><PhoneCall size={16} /> Ligar</Button>
        <Button size="sm" variant="secondary" disabled={!resolvedContactTarget.phone || lead.doNotContact} onClick={() => openMessage('whatsapp')}><MessageCircle size={16} /> WhatsApp</Button>
        <Button size="sm" variant="secondary" disabled={!canViewEmail || !lead.email || lead.doNotContact} onClick={() => openMessage('email')}><Mail size={16} /> E-mail</Button>
        <Button size="sm" variant="secondary" onClick={() => onActivity(lead, 'followup')}><RefreshCw size={16} /> Follow-up</Button>
        <Button size="sm" variant="secondary" onClick={() => onEvent(lead)}><CalendarPlus size={16} /> Reunião</Button>
      </div> : null}

      <div className="lead-drawer__body sales-workspace-v1013__body">
        <main className="sales-workspace-v1013__main">
          <section className={`sales-workspace-v1013__primary sales-workspace-v1013__primary--${salesWorkspace.nextActionState}`}>
            <div className="sales-workspace-v1013__primary-copy"><span className="eyebrow"><Sparkles size={14}/> Próxima ação comercial</span><h3>{primaryAction.title}</h3><p>{primaryAction.explanation}</p><div className="sales-workspace-v1013__signal-row"><span className={`sales-workspace-v1013__next-chip is-${salesWorkspace.nextActionState}`}><CalendarClock size={13}/>{salesWorkspace.nextActionLabel}</span><span><Target size={13}/> Score {priority.score}/100</span>{dealInsight ? <span><BriefcaseBusiness size={13}/> Deal Health {dealInsight.healthScore}/100</span> : null}</div></div>
            {!readOnly ? <Button onClick={runPrimaryAction}>Executar agora <ArrowUpRight size={16}/></Button> : null}
          </section>

          <section className="lead-drawer__section sales-workspace-v1013__strategy sales-workspace-v1015__strategy-card">
            <div className="sales-workspace-v1015__strategy-summary">
              <div>
                <span className="eyebrow">Preparação da abordagem</span>
                <strong>{selectedPlaybook?.title ?? 'Sem roteiro configurado'}</strong>
                <p>{objectiveDefinition.label} · {selectedRecommendation ? `${selectedRecommendation.score}% aderência` : 'seleção manual'}</p>
              </div>
              <div className="sales-workspace-v1015__strategy-summary-actions">
                {!readOnly ? <Button size="sm" disabled={!resolvedContactTarget.phone || lead.doNotContact} onClick={launchPreparedCall}><PhoneCall size={15}/> Ligar com roteiro</Button> : null}
                <button className="sales-workspace-v1015__disclosure" type="button" aria-expanded={strategyExpanded} onClick={toggleStrategy}>{strategyExpanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>} {strategyExpanded ? 'Recolher' : 'Ajustar'}</button>
              </div>
            </div>
            {strategyExpanded ? <div className="sales-workspace-v1015__strategy-expanded">
              <div className="sales-workspace-v1013__strategy-grid">
                <label className="field"><span>Objetivo da conversa</span><SelectionSelect value={strategyObjective} disabled={readOnly} onValueChange={(next) => { const value = next as CallSessionObjective; setStrategyObjective(value); setSelectedPlaybookId(''); saveStrategy(value, '') }} options={CALL_SESSION_OBJECTIVES.map((item) => ({ value: item.id, label: item.label }))} /><small>{objectiveDefinition.successSignal}</small></label>
                <label className="field"><span>Roteiro / Playbook</span><SelectionSelect value={selectedPlaybook?.id ?? ''} disabled={readOnly || !activeScripts.length} onValueChange={(next) => { setSelectedPlaybookId(next); saveStrategy(strategyObjective, next) }} searchable options={[...routeRecommendations.map((item) => ({ value: item.playbook.id, label: item.playbook.title, description: `${item.score}% aderência` })), ...activeScripts.filter((item) => !routeRecommendations.some((recommendation) => recommendation.playbook.id === item.id)).map((item) => ({ value: item.id, label: item.title }))]} /><small>{selectedRecommendation ? `Recomendado por ${selectedRecommendation.reasons.join(', ') || 'uso geral'}.` : activeScripts.length ? 'Roteiro selecionado manualmente.' : 'Crie um roteiro ativo em Estratégia.'}</small></label>
              </div>
              <div className="sales-workspace-v1013__strategy-preview">
                <div><strong>{selectedPlaybook?.title ?? 'Nenhum roteiro disponível'}</strong><p>{selectedPlaybook?.guidance?.coachingFocus || selectedPlaybook?.content.slice(0, 220) || 'Configure um roteiro para padronizar a preparação da equipe.'}</p></div>
                {!readOnly ? <div className="sales-workspace-v1013__strategy-actions"><Button variant="ghost" size="sm" onClick={() => { clearLeadSalesStrategyPreference(snapshot.workspace.id, lead.id); const inferred = salesWorkspace.objective; setStrategyObjective(inferred); setSelectedPlaybookId('') }}><RotateCcw size={14}/> Usar recomendação</Button></div> : null}
              </div>
            </div> : null}
          </section>

          <section className="lead-drawer__section sales-workspace-v1013__summary">
            <div className="lead-drawer__section-title sales-workspace-v1015__section-title"><div><span className="eyebrow">Essencial</span><h3>Contexto do lead</h3></div><div className="lead-section-title-actions">{!readOnly ? <button type="button" className="lead-inline-edit-trigger" onClick={() => setInlineEditing((current) => !current)}><Edit3 size={14}/>{inlineEditing ? 'Cancelar edição' : 'Editar dados'}</button> : null}<button className="sales-workspace-v1015__disclosure" type="button" aria-expanded={detailsExpanded} onClick={toggleDetails}>{detailsExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} {detailsExpanded ? 'Menos detalhes' : 'Mais detalhes'}</button></div></div>
            {inlineEditing ? <div className="lead-inline-editor">
              <label><span>Nome</span><input value={inlineDraft.name} onChange={(event) => setInlineDraft((current) => ({ ...current, name: event.target.value }))}/></label>
              <label><span>Empresa</span><input value={inlineDraft.company} onChange={(event) => setInlineDraft((current) => ({ ...current, company: event.target.value }))}/></label>
              <label><span>Telefone</span>{canViewPhone?<input disabled={!canEditPhone} value={inlineDraft.phone} onChange={(event) => setInlineDraft((current) => ({ ...current, phone: event.target.value }))}/>:<strong className="field-restricted-h223">Restrito pelo perfil</strong>}</label>
              <label><span>E-mail</span>{canViewEmail?<input type="email" disabled={!canEditEmail} value={inlineDraft.email} onChange={(event) => setInlineDraft((current) => ({ ...current, email: event.target.value }))}/>:<strong className="field-restricted-h223">Restrito pelo perfil</strong>}</label>
              <label><span>Cidade</span><input value={inlineDraft.city} onChange={(event) => setInlineDraft((current) => ({ ...current, city: event.target.value }))}/></label>
              <label><span>Responsável</span><OwnerPicker value={inlineDraft.ownerId} members={ownerOptions} onValueChange={(ownerId) => setInlineDraft((current) => ({ ...current, ownerId }))} /></label>
              <label className="lead-inline-editor__wide"><span>Próxima ação</span><input type="datetime-local" value={inlineDraft.nextActionAt} onChange={(event) => setInlineDraft((current) => ({ ...current, nextActionAt: event.target.value }))}/></label>
              <div className="lead-inline-editor__actions"><Button size="sm" variant="secondary" onClick={() => setInlineEditing(false)}>Cancelar</Button><Button size="sm" loading={busy} onClick={() => void saveInlineSummary()}><Save size={15}/> Salvar alterações</Button></div>
            </div> : null}
            <div className="sales-workspace-v1013__facts">
              <div><Building2 size={16}/><span>Empresa</span><strong>{lead.company || 'Não informada'}</strong></div>
              <div><UserRound size={16}/><span>Responsável</span><strong>{lead.ownerName || 'Não atribuído'}</strong></div>
              <div><FileText size={16}/><span>Valor</span><strong>{canViewDealValue?formatCurrency(salesWorkspace.opportunity?.value ?? lead.value):'Restrito pelo perfil'}</strong></div>
              <div><CalendarClock size={16}/><span>Próxima ação</span><strong>{formatDateTime(lead.nextActionAt)}</strong></div>
            </div>
            {detailsExpanded ? <div className="sales-workspace-v1015__details-expanded">
              <div className="sales-workspace-v1013__stage-row"><label className="field"><span>Etapa do Pipeline</span><SelectionSelect value={lead.stageId} disabled={busy || readOnly} onValueChange={(next) => void changeStage(next)} options={snapshot.stages.map((item) => ({ value: item.id, label: item.name, description: `${item.probability}% de probabilidade` }))} /></label><Button size="sm" variant="secondary" onClick={() => { navigate('pipeline', { leadId: lead.id }); onClose() }}>Abrir oportunidade <ChevronRight size={15}/></Button></div>
              <div className="sales-workspace-v1013__contact-line"><span><PhoneCall size={14}/>{canViewPhone?(resolvedContactTarget.phone || 'Telefone não informado'):'Telefone restrito'}</span><span><Mail size={14}/>{canViewEmail?(lead.email || 'E-mail não informado'):'E-mail restrito'}</span><span><MapPin size={14}/>{lead.city || 'Cidade não informada'}</span><span><Tag size={14}/>{lead.source || 'Origem não informada'}</span></div>
              {Object.values(socialLinks).some(Boolean) ? <div className="lead-social-links">{socialLinks.instagram ? <a href={socialLinks.instagram} target="_blank" rel="noreferrer">Instagram <ExternalLink size={13}/></a> : null}{socialLinks.linkedin ? <a href={socialLinks.linkedin} target="_blank" rel="noreferrer">LinkedIn <ExternalLink size={13}/></a> : null}{socialLinks.facebook ? <a href={socialLinks.facebook} target="_blank" rel="noreferrer">Facebook <ExternalLink size={13}/></a> : null}{socialLinks.website ? <a href={socialLinks.website} target="_blank" rel="noreferrer">Site <ExternalLink size={13}/></a> : null}</div> : null}
            </div> : null}
          </section>

          {dealInsight && detailsExpanded ? <section className={`sales-workspace-v1013__deal sales-workspace-v1013__deal--${dealInsight.healthLevel}`}>
            <div><span className="eyebrow">Deal Intelligence</span><strong>{dealInsight.healthLabel} · {dealInsight.healthScore}/100</strong><p>{dealInsight.risks[0]?.detail || dealInsight.positiveSignals[0]?.detail || 'Negócio sem risco crítico detectado neste momento.'}</p></div><div><span>Probabilidade RealTalent</span><strong>{dealInsight.realTalentProbability}%</strong><small>{dealInsight.momentum === 'accelerating' ? 'Acelerando' : dealInsight.momentum === 'cooling' ? 'Esfriando' : 'Estável'}</small></div>
          </section> : null}

          {issues.length || duplicates.length ? detailsExpanded ? <section className="lead-drawer__section sales-workspace-v1013__quality">
            <div className="lead-drawer__section-title"><div><span className="eyebrow">Exceções</span><h3>Dados que precisam de atenção</h3></div><AlertTriangle size={20}/></div>
            {issues.length ? <div className="lead-issue-list">{issues.map((issue) => <span key={issue.key}><AlertTriangle size={14}/> {issue.label}</span>)}</div> : <div className="lead-quality-ok"><CheckCircle2 size={16}/> Cadastro com os principais dados preenchidos.</div>}
            {duplicates.length ? <div className="duplicate-list"><strong>Possíveis duplicados</strong>{duplicates.map((duplicate) => <button key={duplicate.matchId} type="button" onClick={() => onOpenDuplicate(duplicate.lead!)}><span><b>{duplicate.lead!.name}</b><small>{duplicate.reasons.join(' e ')}</small></span><ChevronRight size={16}/></button>)}</div> : null}
          </section> : <section className="sales-workspace-v1015__attention"><AlertTriangle size={16}/><div><strong>{issues.length + duplicates.length} {issues.length + duplicates.length === 1 ? 'ponto requer' : 'pontos requerem'} atenção</strong><span>Abra os detalhes para revisar qualidade de dados e possíveis duplicidades.</span></div><button type="button" onClick={toggleDetails}>Revisar</button></section> : null}
        </main>

        <aside className="sales-workspace-v1013__context-panel">
          <div className="sales-workspace-v1013__tabs" role="tablist" aria-label="Contexto do lead">
            {workspaceTabs.map((tab) => {
              const label = tab === 'context' ? 'Contexto' : tab === 'history' ? 'Histórico' : 'Notas'
              const active = workspaceTab === tab
              return <button id={`lead-workspace-tab-${tab}`} key={tab} type="button" role="tab" aria-selected={active} aria-controls={`lead-workspace-panel-${tab}`} tabIndex={active ? 0 : -1} className={active ? 'is-active' : ''} onKeyDown={(event) => handleWorkspaceTabKey(event, tab)} onClick={() => setWorkspaceTab(tab)}>{label}</button>
            })}
          </div>

          {workspaceTab === 'context' ? <div id="lead-workspace-panel-context" role="tabpanel" aria-labelledby="lead-workspace-tab-context" tabIndex={0} className="sales-workspace-v1013__context-content">
            <section><span className="eyebrow">Agora</span><div className="sales-workspace-v1013__context-list"><div><CalendarClock size={15}/><span><small>{salesWorkspace.nextActionLabel}</small><strong>{formatDateTime(lead.nextActionAt)}</strong></span></div><div><Clock3 size={15}/><span><small>Última interação</small><strong>{formatDateTime(salesWorkspace.lastInteractionAt)}</strong></span></div><div><BriefcaseBusiness size={15}/><span><small>Oportunidade</small><strong>{salesWorkspace.opportunity?.title || stage?.name || 'Sem oportunidade vinculada'}</strong></span></div><div><UsersRound size={15}/><span><small>Buying committee</small><strong>{accountIntelligence.coverageScore}% de cobertura</strong></span></div></div></section>
            <section><div className="sales-workspace-v1013__side-heading"><span><small>Pendências</small><strong>{salesWorkspace.pendingActivities.length}</strong></span>{!readOnly ? <button type="button" onClick={() => onActivity(lead, 'followup')}>Adicionar</button> : null}</div>{salesWorkspace.pendingActivities.length ? <div className="sales-workspace-v1013__mini-list">{salesWorkspace.pendingActivities.slice(0, 4).map((item) => <article key={item.id}><span>{item.type}</span><strong>{item.title}</strong><small>{formatDateTime(item.dueAt)}</small></article>)}</div> : <p className="sales-workspace-v1013__empty-copy">Nenhuma atividade pendente.</p>}</section>
            <section><div className="sales-workspace-v1013__side-heading"><span><small>Próximas reuniões</small><strong>{salesWorkspace.upcomingEvents.length}</strong></span>{!readOnly ? <button type="button" onClick={() => onEvent(lead)}>Agendar</button> : null}</div>{salesWorkspace.upcomingEvents.length ? <div className="sales-workspace-v1013__mini-list">{salesWorkspace.upcomingEvents.slice(0, 3).map((item) => <article key={item.id}><span>agenda</span><strong>{item.title}</strong><small>{formatDateTime(item.startsAt)}</small></article>)}</div> : <p className="sales-workspace-v1013__empty-copy">Nenhuma reunião futura.</p>}</section>
            <section className="sales-workspace-v1013__account-card"><div><Network size={18}/><span><small>Conta e decisores</small><strong>{companyContacts.length ? `${companyContacts.length} ${companyContacts.length === 1 ? 'pessoa' : 'pessoas'}` : 'Ainda não mapeado'}</strong><p>{decisionRoleLabels[lead.decisionRole ?? 'unknown']} · risco {accountIntelligence.riskLabel.toLowerCase()}</p></span></div><Button size="sm" variant="secondary" onClick={() => setAccountOpen(true)}>Abrir Conta 360</Button></section>
          </div> : null}

          {workspaceTab === 'history' ? <div id="lead-workspace-panel-history" role="tabpanel" aria-labelledby="lead-workspace-tab-history" tabIndex={0} className="sales-workspace-v1013__history-content">
            <div className="lead-history-filters">{([['all', 'Tudo'], ['calls', 'Ligações'], ['events', 'Agenda'], ['activities', 'Atividades']] as const).map(([value, label]) => <button key={value} type="button" className={historyFilter === value ? 'is-active' : ''} onClick={() => setHistoryFilter(value)}>{label}</button>)}</div>
            {timeline.length ? <div className="lead-timeline sales-workspace-v1013__timeline">{timeline.slice(0, 30).map((entry) => <article key={entry.id}><span className={`lead-timeline__dot lead-timeline__dot--${entry.tone}`}/><div><span>{formatDateTime(entry.date)}</span><strong>{entry.title}</strong><p>{entry.description}</p><small>{entry.detail}</small></div></article>)}</div> : <div className="lead-history-empty"><History size={20}/><strong>Nenhuma interação encontrada</strong><span>O histórico aparecerá conforme as ações forem registradas.</span></div>}
          </div> : null}

          {workspaceTab === 'notes' ? <div id="lead-workspace-panel-notes" role="tabpanel" aria-labelledby="lead-workspace-tab-notes" tabIndex={0} className="sales-workspace-v1013__notes-content">
            <label className="field"><span>Anotações permanentes do contato</span><textarea rows={9} value={noteDraft} readOnly={readOnly} placeholder="Contexto importante, preferências, dores, restrições e observações para a próxima conversa." onChange={(event) => setNoteDraft(event.target.value)}/><small>Essas notas permanecem na ficha. Notas de chamada continuam registradas no histórico.</small></label>
            {!readOnly ? <Button size="sm" loading={busy} onClick={() => void saveNotes()}><Save size={15}/> Salvar notas</Button> : null}
            <section><div className="sales-workspace-v1013__side-heading"><span><small>Informações fixadas</small><strong>{pinnedNotes.length}</strong></span></div>{pinnedNotes.length ? <div className="sales-workspace-v1013__mini-list">{pinnedNotes.slice(0, 5).map((item) => <article key={item.id}><span><NotebookPen size={12}/> fixada</span><strong>{item.description || item.title}</strong><small>{formatDateTime(item.createdAt)}</small></article>)}</div> : <p className="sales-workspace-v1013__empty-copy">Durante uma ligação, use “Fixar informação” para trazer fatos importantes para cá.</p>}</section>
          </div> : null}
        </aside>
      </div>

      <footer className="lead-drawer__footer sales-workspace-v1013__footer">
        <div><Button variant="secondary" onClick={() => { navigate('leads', { leadId: lead.id, action: 'contact-record' }); onClose() }}><ExternalLink size={16}/> Abrir registro completo</Button><Button variant="ghost" onClick={() => { navigate('pipeline', { leadId: lead.id }); onClose() }}><ExternalLink size={16}/> Pipeline</Button><Button variant="ghost" onClick={() => { navigate('playbooks', { filter: 'strategy' }); onClose() }}><Target size={16}/> Strategy Hub</Button></div>
        {!readOnly ? <Button variant="danger" disabled={busy || lead.status === 'archived'} onClick={() => void archive()}><Archive size={16}/> Arquivar</Button> : null}
      </footer>
    </aside>
    <Account360Modal open={accountOpen} lead={lead} readOnly={readOnly} onClose={() => setAccountOpen(false)}/>
    <SalesMessageModal lead={lead} stageName={stage?.name ?? 'Ficha comercial'} initialChannel={messageChannel ?? undefined} open={!readOnly && Boolean(messageChannel)} onClose={() => setMessageChannel(null)}/>
  </div>
  return typeof document === 'undefined' ? drawer : createPortal(drawer, document.body)
}
