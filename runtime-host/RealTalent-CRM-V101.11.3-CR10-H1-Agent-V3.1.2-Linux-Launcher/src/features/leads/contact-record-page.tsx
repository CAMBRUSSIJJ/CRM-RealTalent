import {
  Building2, CalendarClock, CalendarDays, CalendarPlus, CircleDollarSign, Edit3, ExternalLink,
  ListTodo, Mail, MessageCircle, Network, NotebookPen, PhoneCall, RefreshCw, Search, Sparkles, StickyNote, Target, UsersRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAppActions, useAppNavigation, useAppUi, useAppWorkspace } from '../../app/app-context'
import {
  CommunicationWidget, FieldsWidget, QuickActionsWidget, RecordPageShell, RecordPageWidgetFrame,
  RelatedRecordsWidget, TimelineWidget,
} from '../../components/record-page'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { formatCurrency, formatDateTime, initials } from '../../domain/formatters'
import type { ActivityType, Lead } from '../../domain/types'
import { buildContactPersonRecordPageModel } from '../../platform/record-page/contact-person-record-adapter'
import { contactPersonRecordPageDefinition } from '../../platform/record-page/record-page-registry'
import { buildAccountIntelligence, decisionRoleLabels } from '../../services/account-intelligence'
import { resolveLeadCallTarget } from '../../services/call-workspace'
import { contactBlockedMessage } from '../../services/contact-policy'
import { buildDealIntelligence } from '../../services/deal-intelligence'
import { leadScoreInsight } from '../../services/lead-scoring'
import { contactsForLead, opportunitiesForLead, relationshipsForLead } from '../../services/lead-relations-v10151'
import { usePreferences } from '../settings/preferences-context'
import { Account360Modal } from './account-360-modal'
import { EditLeadModal } from './edit-lead-modal'
import { ActivityModal } from '../followups/activity-modal'
import { EventModal } from '../agenda/event-modal'
import { LazyCallWorkspaceModal } from '../calls/lazy-call-workspace-modal'
import { buildQuickCallSessionConfig } from '../calls/call-session-config'
import { SalesMessageModal } from '../pipeline/sales-message-modal'
import { canViewSensitiveField } from '../../services/team-access-control'

type RecordTab = 'overview' | 'activities' | 'notes' | 'account'
type TimelineKind = 'task' | 'note' | 'email' | 'whatsapp' | 'call' | 'meeting' | 'stage'
type ActivityFilter = 'all' | TimelineKind

interface Props { lead: Lead; onBack(): void }
interface TimelineEntry { id: string; date: string; kind: string; kindKey: TimelineKind; title: string; description: string }

const outcomeLabel: Record<string, string> = {
  answered: 'Atendeu', no_answer: 'Não atendeu', busy: 'Ocupado', voicemail: 'Caixa postal', callback_requested: 'Pediu retorno',
  interested: 'Demonstrou interesse', meeting_scheduled: 'Reunião marcada', proposal_requested: 'Solicitou proposta', proposal_sent: 'Proposta enviada',
  wrong_person: 'Pessoa errada', invalid_number: 'Número inválido', not_interested: 'Sem interesse', sale_completed: 'Venda concluída', other: 'Outro',
}
const activityKind = (type: ActivityType): { key: TimelineKind; label: string } => {
  if (type === 'note') return { key: 'note', label: 'Nota' }
  if (type === 'email') return { key: 'email', label: 'E-mail' }
  if (type === 'whatsapp') return { key: 'whatsapp', label: 'WhatsApp' }
  if (type === 'meeting') return { key: 'meeting', label: 'Reunião' }
  if (type === 'stage_change') return { key: 'stage', label: 'Etapa' }
  if (type === 'call') return { key: 'call', label: 'Ligação' }
  return { key: 'task', label: 'Tarefa' }
}
const KindIcon = ({ kind }: { kind: TimelineKind }) => kind === 'call' ? <PhoneCall size={14}/> : kind === 'meeting' ? <CalendarDays size={14}/> : kind === 'email' ? <Mail size={14}/> : kind === 'whatsapp' ? <MessageCircle size={14}/> : kind === 'note' ? <StickyNote size={14}/> : kind === 'stage' ? <Target size={14}/> : <ListTodo size={14}/>

export function ContactRecordPage({ lead, onBack }: Props) {
  const { snapshot, canWrite, teamAccess } = useAppWorkspace()
  const { navigate } = useAppNavigation()
  const { notify } = useAppUi()
  const { updateLead } = useAppActions()
  const { preferences } = usePreferences()
  const canViewPhone = canViewSensitiveField(teamAccess,'contact_phone')
  const canViewEmail = canViewSensitiveField(teamAccess,'contact_email')
  const canViewDealValue = canViewSensitiveField(teamAccess,'deal_value')
  const [tab, setTab] = useState<RecordTab>('overview')
  const [editing, setEditing] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [activityType, setActivityType] = useState<ActivityType>('followup')
  const [activityOpen, setActivityOpen] = useState(false)
  const [eventOpen, setEventOpen] = useState(false)
  const [callOpen, setCallOpen] = useState(false)
  const [messageChannel, setMessageChannel] = useState<'email' | 'whatsapp' | null>(null)
  const [noteDraft, setNoteDraft] = useState(lead.notes ?? '')
  const [savingNote, setSavingNote] = useState(false)
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')
  const [activityQuery, setActivityQuery] = useState('')

  const recordPageModel = useMemo(() => snapshot ? buildContactPersonRecordPageModel(lead, snapshot) : null, [lead, snapshot])
  const stage = snapshot?.stages.find((item) => item.id === lead.stageId)
  const score = snapshot ? leadScoreInsight(lead, snapshot, preferences.commercial.leadScoring) : null
  const deal = snapshot && preferences.commercial.dealIntelligence.enabled ? buildDealIntelligence(lead, snapshot, preferences.commercial.dealIntelligence) : null
  const company = snapshot?.companies.find((item) => item.id === lead.companyId) ?? null
  const contacts = snapshot ? contactsForLead(lead, snapshot.contacts) : []
  const relationships = snapshot ? relationshipsForLead(lead, snapshot.contactRelationships) : []
  const opportunities = snapshot ? opportunitiesForLead(lead, snapshot.opportunities) : []
  const account = snapshot ? buildAccountIntelligence(lead, contacts, relationships, snapshot) : null
  const callTarget = snapshot ? resolveLeadCallTarget(lead, snapshot.contacts) : { phone: lead.phone, contact: null }

  const timeline = useMemo<TimelineEntry[]>(() => {
    if (!snapshot) return []
    const activities = snapshot.activities.filter((item) => item.leadId === lead.id).map((item) => {
      const kind = activityKind(item.type)
      return { id: `activity-${item.id}`, date: item.completedAt ?? item.dueAt ?? item.createdAt, kind: kind.label, kindKey: kind.key, title: item.title, description: item.description || (item.completedAt ? 'Atividade concluída.' : 'Atividade registrada.') }
    })
    const calls = snapshot.calls.filter((item) => item.leadId === lead.id).map((item) => ({
      id: `call-${item.id}`, date: item.endedAt ?? item.startedAt, kind: 'Ligação', kindKey: 'call' as const, title: outcomeLabel[item.outcome] ?? item.outcome,
      description: item.notes || `${Math.max(0, Math.round(item.durationSeconds / 60))} min de chamada`,
    }))
    const events = snapshot.events.filter((item) => item.leadId === lead.id).map((item) => ({
      id: `event-${item.id}`, date: item.startsAt, kind: 'Reunião', kindKey: 'meeting' as const, title: item.title, description: item.description || item.location || 'Compromisso comercial.',
    }))
    return [...activities, ...calls, ...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [lead.id, snapshot])

  const filteredTimeline = useMemo(() => {
    const query = activityQuery.trim().toLocaleLowerCase('pt-BR')
    return timeline.filter((entry) => (activityFilter === 'all' || entry.kindKey === activityFilter)
      && (!query || `${entry.kind} ${entry.title} ${entry.description}`.toLocaleLowerCase('pt-BR').includes(query)))
  }, [activityFilter, activityQuery, timeline])

  const toTimelineWidgetEntries = (entries: TimelineEntry[]) => entries.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    description: entry.description,
    dateLabel: formatDateTime(entry.date),
    icon: <KindIcon kind={entry.kindKey}/>,
    kindKey: entry.kindKey,
  }))

  const openCall = () => {
    const blocked = contactBlockedMessage(lead, 'call')
    if (blocked) { notify('info', blocked); return }
    if (!callTarget.phone) { notify('info', 'Nenhum telefone disponível para este contato.'); return }
    setCallOpen(true)
  }
  const openWhatsApp = () => {
    const blocked = contactBlockedMessage(lead, 'whatsapp')
    if (blocked) { notify('info', blocked); return }
    if (!callTarget.phone) { notify('info', 'Nenhum telefone disponível para WhatsApp.'); return }
    setMessageChannel('whatsapp')
  }
  const saveNote = async () => {
    setSavingNote(true)
    try { await updateLead(lead.id, { notes: noteDraft.trim() }); notify('success', 'Notas do contato atualizadas.') }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar as notas.') }
    finally { setSavingNote(false) }
  }
  const openFollowup = () => { setActivityType('followup'); setActivityOpen(true) }

  if (!snapshot || !recordPageModel) return null

  const left = <>
    <RecordPageWidgetFrame className="contact-record-card--identity" widgetId="identity">
      <span className="contact-record-v1016__avatar">{initials(lead.name)}</span>
      <div><h2>{lead.name}</h2><p>{lead.jobTitle || 'Contato comercial'}{lead.company ? ` · ${lead.company}` : ''}</p></div>
      <CommunicationWidget actions={[
        { id: 'note', label: 'Nota', icon: <NotebookPen size={17}/>, onClick: () => setTab('notes') },
        { id: 'email', label: 'E-mail', icon: <Mail size={17}/>, disabled: !canViewEmail || !lead.email, onClick: () => setMessageChannel('email') },
        { id: 'call', label: 'Ligar', icon: <PhoneCall size={17}/>, disabled: !canViewPhone || !callTarget.phone, onClick: openCall },
        { id: 'task', label: 'Tarefa', icon: <RefreshCw size={17}/>, onClick: openFollowup },
        { id: 'meeting', label: 'Reunião', icon: <CalendarPlus size={17}/>, onClick: () => setEventOpen(true) },
      ]}/>
    </RecordPageWidgetFrame>

    <FieldsWidget
      widgetId="key-fields"
      title="Informações-chave"
      onEdit={canWrite ? () => setEditing(true) : undefined}
      fields={[
        { id: 'email', label: 'E-mail', value: canViewEmail?(lead.email || 'Não informado'):'Restrito pelo perfil' },
        { id: 'phone', label: 'Telefone', value: canViewPhone?(callTarget.phone || 'Não informado'):'Restrito pelo perfil' },
        { id: 'owner', label: 'Responsável', value: lead.ownerName || 'Não atribuído' },
        { id: 'company', label: 'Empresa', value: lead.company || 'Não informada' },
        { id: 'stage', label: 'Etapa da oportunidade', value: stage?.name ?? 'Sem etapa' },
        { id: 'score', label: 'Score comercial', value: `${score?.score ?? 0}/100` },
        { id: 'next-action', label: 'Próxima ação', value: formatDateTime(lead.nextActionAt) },
        { id: 'value', label: 'Valor associado', value: canViewDealValue?formatCurrency(opportunities[0]?.value ?? lead.value):'Restrito pelo perfil' },
      ]}
    />
  </>

  const right = <>
    <RelatedRecordsWidget
      widgetId="company"
      title="Empresa"
      listClassName="contact-record-v1016__related"
      actions={<div className="contact-record-v10161__related-actions"><button type="button" onClick={() => setAccountOpen(true)}>{company ? 'Gerenciar' : '+ Associar'}</button></div>}
      items={[{
        id: company?.id ?? 'company-placeholder',
        leading: <Building2 size={19}/>,
        title: company?.name || lead.company || 'Sem empresa associada',
        subtitle: company?.segment || lead.city || 'Adicione dados da conta para enriquecer o contexto.',
      }]}
      renderItem={(item) => <>{item.leading}<div><strong>{item.title}</strong><small>{item.subtitle}</small></div></>}
    />

    <RelatedRecordsWidget
      widgetId="opportunities"
      title={`Oportunidades (${opportunities.length})`}
      actions={<div className="contact-record-v10161__related-actions"><button type="button" onClick={() => navigate('pipeline', { leadId: lead.id })}>Abrir pipeline</button></div>}
      items={opportunities.slice(0,3).map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: snapshot.stages.find((stageItem) => stageItem.id === item.stageId)?.name ?? 'Sem etapa',
        meta: <b>{formatCurrency(item.value)}</b>,
      }))}
      renderItem={(item) => <div key={item.id} className="contact-record-v1016__opportunity"><div><strong>{item.title}</strong><small>{item.subtitle}</small></div>{item.meta}</div>}
      empty={<div className="contact-record-v1016__empty contact-record-v1016__empty--small"><Target size={20}/><span>Nenhuma oportunidade relacionada.</span></div>}
    />

    <RecordPageWidgetFrame
      title="Conta e decisores"
      widgetId="account-health"
      actions={<div className="contact-record-v10161__related-actions"><button type="button" onClick={() => setAccountOpen(true)}>Organograma</button></div>}
    >
      <div className="contact-record-v1016__account-health"><div><small>Cobertura</small><strong>{account?.coverageScore ?? 0}%</strong></div><div><small>Relacionamento</small><strong>{account?.relationshipScore ?? 0}%</strong></div><div><small>Pessoas</small><strong>{contacts.length}</strong></div></div>
      <Button size="sm" variant="secondary" onClick={() => setAccountOpen(true)}><Network size={15}/> Abrir Conta 360</Button>
    </RecordPageWidgetFrame>
  </>

  return <>
    <RecordPageShell
      backLabel="Contatos"
      onBack={onBack}
      definitionId={recordPageModel.definitionId}
      recordObjectKey={recordPageModel.canonical?.objectKey ?? recordPageModel.source.objectKey}
      recordId={recordPageModel.canonical?.id ?? recordPageModel.source.id}
      tabs={contactPersonRecordPageDefinition.tabs}
      activeTab={tab}
      onTabChange={(id) => setTab(id as RecordTab)}
      headerActions={<>
        <Button size="sm" variant="secondary" onClick={() => navigate('pipeline', { leadId: lead.id })}><ExternalLink size={15}/> Abrir oportunidade</Button>
        {canWrite ? <Button size="sm" onClick={() => setEditing(true)}><Edit3 size={15}/> Editar contato</Button> : null}
      </>}
      left={left}
      right={right}
    >
      {tab === 'overview' ? <div className="contact-record-v1016__stack">
        <RecordPageWidgetFrame
          widgetId="sales-intelligence"
          className="contact-record-v1016__insight"
          header={<div><span className="eyebrow"><Sparkles size={13}/> Inteligência comercial</span><h3>{deal?.nextBestAction.title ?? score?.nextBestAction.title ?? 'Próxima ação recomendada'}</h3></div>}
          actions={<StatusPill tone={(deal?.healthScore ?? 70) < 45 ? 'danger' : (deal?.healthScore ?? 70) < 70 ? 'warning' : 'success'}>{deal ? `Saúde da oportunidade ${deal.healthScore}/100` : `Score ${score?.score ?? 0}/100`}</StatusPill>}
        >
          <p>{deal?.nextBestAction.explanation ?? score?.nextBestAction.explanation ?? 'Mantenha o próximo passo explícito e o histórico atualizado.'}</p>
          <div className="contact-record-v1016__insight-actions"><Button size="sm" onClick={deal?.nextBestAction.kind === 'call' ? openCall : openFollowup}>Executar agora</Button><Button size="sm" variant="secondary" onClick={openWhatsApp}><MessageCircle size={15}/> WhatsApp</Button></div>
        </RecordPageWidgetFrame>

        <TimelineWidget
          widgetId="recent-timeline"
          title="Atividade recente"
          actions={<button type="button" onClick={() => setTab('activities')}>Ver todas</button>}
          entries={toTimelineWidgetEntries(timeline.slice(0,5))}
        />

        <QuickActionsWidget widgetId="next-actions" title="Próximos passos" actions={[
          { id: 'followup', title: 'Follow-up', description: lead.nextActionAt ? formatDateTime(lead.nextActionAt) : 'Definir próxima ação', icon: <CalendarClock size={18}/>, onClick: openFollowup },
          { id: 'meeting', title: 'Reunião', description: `${snapshot.events.filter((item) => item.leadId === lead.id && item.status !== 'cancelled' && new Date(item.startsAt) >= new Date()).length} futura(s)`, icon: <CalendarPlus size={18}/>, onClick: () => setEventOpen(true) },
          { id: 'opportunity', title: 'Oportunidade', description: opportunities[0]?.title ?? 'Abrir pipeline comercial', icon: <CircleDollarSign size={18}/>, onClick: () => navigate('pipeline', { leadId: lead.id }) },
        ]}/>
      </div> : null}

      {tab === 'activities' ? <TimelineWidget
        widgetId="full-timeline"
        className="contact-record-v1016__activities"
        header={<div><h3>Histórico de atividades</h3><p>Pesquise e filtre chamadas, notas, mensagens, tarefas, reuniões e mudanças comerciais.</p></div>}
        actions={<Button size="sm" variant="secondary" onClick={openFollowup}><ListTodo size={14}/> Nova tarefa</Button>}
        tools={<div className="contact-record-v10161__activity-tools">
          <label className="contact-record-v10161__activity-search"><Search size={15}/><input value={activityQuery} onChange={(event) => setActivityQuery(event.target.value)} placeholder="Buscar atividade..." /></label>
          <div className="contact-record-v10161__activity-filters">
            {([['all','Todas'],['note','Notas'],['email','E-mails'],['whatsapp','WhatsApp'],['call','Ligações'],['task','Tarefas'],['meeting','Reuniões'],['stage','Etapas']] as const).map(([id,label]) => <button type="button" key={id} className={activityFilter === id ? 'is-active' : ''} onClick={() => setActivityFilter(id)}>{label}</button>)}
            <span className="contact-record-v10161__activity-count">{filteredTimeline.length} {filteredTimeline.length === 1 ? 'atividade' : 'atividades'}</span>
          </div>
        </div>}
        entries={toTimelineWidgetEntries(filteredTimeline)}
      /> : null}

      {tab === 'notes' ? <div className="contact-record-v1016__notes-workspace">
        <RecordPageWidgetFrame
          widgetId="notes-brief"
          className="contact-record-v1016__notes-brief"
          header={<div><span className="eyebrow"><Sparkles size={13}/> Leitura rápida</span><h3>O que o vendedor precisa saber</h3><p>Contexto objetivo para decidir a próxima ação sem reler todo o histórico.</p></div>}
        >
          <div className="contact-record-v1016__brief-grid">
            <div><small>Papel</small><strong>{decisionRoleLabels[lead.decisionRole ?? 'unknown']}</strong></div>
            <div><small>Etapa</small><strong>{stage?.name ?? 'Sem etapa'}</strong></div>
            <div><small>Score</small><strong>{score?.score ?? 0}/100</strong></div>
            <div><small>Próxima ação</small><strong>{lead.nextActionAt ? formatDateTime(lead.nextActionAt) : 'Definir'}</strong></div>
            <div><small>Valor</small><strong>{canViewDealValue?formatCurrency(lead.value):'Restrito pelo perfil'}</strong></div>
            <div><small>Relacionamento</small><strong>{account?.relationshipScore ?? 0}%</strong></div>
          </div>
          <div className="contact-record-v1016__brief-signal"><span>Próximo passo registrado</span><strong>{lead.notes?.trim() || 'Ainda não registrado'}</strong></div>
        </RecordPageWidgetFrame>

        <RecordPageWidgetFrame
          widgetId="notes"
          className="contact-record-v1016__notes"
          header={<div><h3>Notas</h3><p>Registre somente contexto que ajude outra pessoa a vender: objetivo, dor, objeção, decisão e próximo passo.</p></div>}
          actions={canWrite ? <Button size="sm" loading={savingNote} onClick={() => void saveNote()}>Salvar nota</Button> : null}
        >
          <div className="contact-record-v1016__notes-tools">
            <span>Inserir seção</span>
            {(['Objetivo','Dor / problema','Objeção','Decisão','Próximo passo'] as const).map((label) => <button key={label} type="button" disabled={!canWrite} onClick={() => setNoteDraft((current) => current ? `${current.trim()}\n\n${label}: ` : `${label}: `)}>{label}</button>)}
            <button type="button" disabled={!canWrite} onClick={() => setNoteDraft((current) => current.trim() ? current : 'Objetivo:\n\nDor / problema:\n\nObjeção:\n\nDecisão:\n\nPróximo passo: ')}>Modelo rápido</button>
          </div>
          <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Ex.: Objetivo: reduzir horários vazios.\nDor / problema: ...\nObjeção: ...\nDecisão: ...\nPróximo passo: ..." rows={10}/>
          <div className="contact-record-v1016__notes-footer"><small>{noteDraft.trim().length} caracteres · visível para a equipe</small>{canWrite ? <Button loading={savingNote} onClick={() => void saveNote()}>Salvar nota</Button> : null}</div>
        </RecordPageWidgetFrame>
      </div> : null}

      {tab === 'account' ? <RecordPageWidgetFrame
        widgetId="account-stakeholders"
        className="contact-record-v1016__account-main"
        header={<div><span className="eyebrow"><Network size={13}/> Conta 360</span><h3>Conta e mapa de decisores</h3><p>Organograma, papéis, influência e relacionamento preservados como capacidades nativas do RealTalent.</p></div>}
        actions={<Button size="sm" onClick={() => setAccountOpen(true)}><Network size={15}/> Abrir organograma completo</Button>}
      >
        <div className="contact-record-v1016__stakeholders">
          {contacts.map((contact) => <article key={contact.id}><span className="lead-cell__avatar">{initials(contact.name)}</span><div><strong>{contact.name}</strong><small>{contact.jobTitle || decisionRoleLabels[contact.decisionRole]}</small></div><StatusPill tone={contact.isPrimary ? 'info' : 'neutral'}>{contact.isPrimary ? 'Principal' : decisionRoleLabels[contact.decisionRole]}</StatusPill></article>)}
          {!contacts.length ? <div className="contact-record-v1016__empty"><UsersRound size={24}/><strong>Nenhuma pessoa mapeada</strong><span>Abra o organograma para adicionar as pessoas que participam da decisão.</span></div> : null}
        </div>
      </RecordPageWidgetFrame> : null}
    </RecordPageShell>

    <EditLeadModal lead={lead} open={editing} onClose={() => setEditing(false)} />
    <Account360Modal open={accountOpen} lead={lead} readOnly={!canWrite} onClose={() => setAccountOpen(false)} />
    <ActivityModal open={activityOpen} initialLeadId={lead.id} initialType={activityType} initialTitle={`Retomar contato — ${lead.name}`} onClose={() => setActivityOpen(false)} />
    <EventModal open={eventOpen} initialLeadId={lead.id} onClose={() => setEventOpen(false)} />
    <LazyCallWorkspaceModal open={callOpen} config={callOpen ? buildQuickCallSessionConfig({ snapshot, initialLeadId: lead.id }) : null} onClose={() => setCallOpen(false)} />
    <SalesMessageModal lead={messageChannel ? lead : null} initialChannel={messageChannel ?? undefined} stageName={stage?.name ?? 'Contatos'} open={Boolean(messageChannel)} onClose={() => setMessageChannel(null)} />
  </>
}
