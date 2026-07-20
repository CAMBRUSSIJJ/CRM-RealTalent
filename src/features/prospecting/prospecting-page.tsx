import {
  AlertTriangle, ArrowRight, BadgeCheck, Ban, Building2, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed,
  ClipboardList, Database, Download, ExternalLink, FileJson, Filter, History, Inbox, AtSign, KanbanSquare, Link2,
  ListFilter, LoaderCircle, MapPinned, Merge, MoreHorizontal, Phone, Plus, RefreshCw, Search, Send, ShieldCheck,
  Sparkles, Trash2, Upload, UserRoundCheck, UsersRound, X, Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { Modal } from '../../components/ui/modal'
import { StatusPill } from '../../components/ui/status-pill'
import type { ActivityType, LeadPriority, LeadTemperature } from '../../domain/types'
import { formatDateTime } from '../../domain/formatters'
import { APP_VERSION, APP_VERSION_LABEL } from '../../lib/app-version'
import {
  EXTENSION_MESSAGE_TYPE, appendHistory, buildProspectingSearchUrl, clearExtensionInbox, createProspect, parseProspectFile,
  parseQuickCaptureLines, prospectCompleteness, prospectSourceLabels, prospectStatusLabels, readExtensionInbox,
  readProspectingState, readRemoteProspectingState, refreshProspectAnalysis, writeProspectingState,
  type CaptureDraft, type ProspectRecord, type ProspectSource, type ProspectStatus, type ProspectingState,
} from '../../services/prospecting-workspace'
import { recordLocalIntegrationEvent } from '../../services/integration-workspace'
import { usePreferences } from '../settings/preferences-context'

 type ProspectingTab = 'search' | 'processing' | 'results' | 'kanban' | 'history'
 type DuplicateBehavior = 'skip' | 'update' | 'create'

const sourceIcons: Record<ProspectSource, typeof MapPinned> = {
  maps: MapPinned, instagram: AtSign, cnpj: Building2, extension: Zap, manual: ClipboardList,
}
const statusTones: Record<ProspectStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  new: 'neutral', analyzing: 'info', review: 'warning', approved: 'success', discarded: 'danger', sent: 'info',
}
const duplicateTone = (level: ProspectRecord['duplicateLevel']) => level === 'confirmed' ? 'danger' : level === 'possible' ? 'warning' : 'success'
const duplicateLabel = (level: ProspectRecord['duplicateLevel']) => level === 'confirmed' ? 'Duplicidade confirmada' : level === 'possible' ? 'Possível duplicidade' : 'Sem duplicidade'
const normalize = (value: string) => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const prospectKey = (prospect: ProspectRecord) => [prospect.phone.replace(/\D/g, ''), prospect.cnpj.replace(/\D/g, ''), prospect.instagram.toLowerCase().replace(/^@/, ''), `${normalize(prospect.company)}:${normalize(prospect.city)}`].filter(Boolean)

interface SendOptions {
  stageId: string
  ownerName: string
  priority: LeadPriority
  temperature: LeadTemperature
  tags: string
  nextActionAt: string
  activityType: Extract<ActivityType, 'call' | 'followup'>
  duplicateBehavior: DuplicateBehavior
}

const initialState: ProspectingState = { prospects: [], history: [], lastExtensionSyncAt: null }

export function ProspectingPage() {
  const { snapshot, currentWorkspace, createLead, updateLead, createActivity, notify, setRoute, canWrite } = useApp()
  const { preferences } = usePreferences()
  const workspaceId = currentWorkspace?.id ?? ''
  const [state, setState] = useState<ProspectingState>(initialState)
  const [tab, setTab] = useState<ProspectingTab>('search')
  const [source, setSource] = useState<ProspectSource>('maps')
  const [segment, setSegment] = useState('Barbearias')
  const [city, setCity] = useState('Canoas')
  const [query, setQuery] = useState('')
  const [quantity, setQuantity] = useState(25)
  const [quickCapture, setQuickCapture] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ProspectStatus>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | ProspectSource>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [sendIds, setSendIds] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!workspaceId) { setState(initialState); return }
    const local = readProspectingState(workspaceId)
    setState(local)
    let cancelled = false
    void readRemoteProspectingState(workspaceId).then((remote) => {
      if (cancelled || !remote || (!remote.prospects.length && !remote.history.length)) return
      setState({ ...remote, lastExtensionSyncAt: local.lastExtensionSyncAt })
      if (canWrite) writeProspectingState(workspaceId, { ...remote, lastExtensionSyncAt: local.lastExtensionSyncAt })
    })
    setSelectedIds(new Set())
    return () => { cancelled = true }
  }, [canWrite, workspaceId])

  const commit = useCallback((updater: (current: ProspectingState) => ProspectingState) => {
    setState((current) => {
      if (!canWrite) return current
      const next = updater(current)
      if (workspaceId) writeProspectingState(workspaceId, next)
      return next
    })
  }, [canWrite, workspaceId])

  const importDrafts = useCallback((drafts: CaptureDraft[], fallbackSource: ProspectSource, action: 'capture' | 'import', detail: string, limit = Math.max(1, quantity)) => {
    if (!canWrite || !workspaceId || !drafts.length) return 0
    const leads = snapshot?.leads ?? []
    let skipped = 0
    const existingKeys = new Set(state.prospects.flatMap(prospectKey))
    const newProspects: ProspectRecord[] = []
    for (const draft of drafts.slice(0, Math.max(1, limit))) {
      const prospect = createProspect(workspaceId, draft, fallbackSource, leads)
      const keys = prospectKey(prospect)
      if (keys.some((key) => existingKeys.has(key))) { skipped += 1; continue }
      keys.forEach((key) => existingKeys.add(key)); newProspects.push(prospect)
    }
    if (!newProspects.length) return 0
    commit((current) => {
      let next = { ...current, prospects: [...newProspects, ...current.prospects] }
      next = appendHistory(next, workspaceId, { action, title: action === 'import' ? 'Arquivo importado' : 'Leads capturados', description: `${detail}${skipped ? ` · ${skipped} repetido(s) ignorado(s)` : ''}`, count: newProspects.length })
      return next
    })
    return newProspects.length
  }, [canWrite, commit, quantity, snapshot?.leads, state.prospects, workspaceId])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; key?: string; payload?: unknown }
      if (!canWrite || !preferences.integrations.extensionEnabled || event.source !== window || data?.type !== EXTENSION_MESSAGE_TYPE || data.key !== preferences.integrations.inboxKey || !Array.isArray(data.payload)) return
      const added = importDrafts(data.payload as CaptureDraft[], 'extension', 'import', 'Recebido em tempo real pela extensão')
      if (workspaceId) recordLocalIntegrationEvent(workspaceId, data.payload.length, 'extension_realtime_capture')
      if (added) notify('success', `${added} lead(s) recebido(s) da extensão.`)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [canWrite, importDrafts, notify, preferences.integrations.extensionEnabled, preferences.integrations.inboxKey, workspaceId])

  const metrics = useMemo(() => ({
    total: state.prospects.length,
    review: state.prospects.filter((item) => item.status === 'new' || item.status === 'analyzing' || item.status === 'review').length,
    approved: state.prospects.filter((item) => item.status === 'approved').length,
    duplicates: state.prospects.filter((item) => item.duplicateLevel !== 'none' && item.status !== 'discarded' && item.status !== 'sent').length,
    sent: state.prospects.filter((item) => item.status === 'sent').length,
  }), [state.prospects])

  const filtered = useMemo(() => {
    const term = normalize(search.trim())
    return state.prospects.filter((prospect) => {
      if (statusFilter !== 'all' && prospect.status !== statusFilter) return false
      if (sourceFilter !== 'all' && prospect.source !== sourceFilter) return false
      if (term && !normalize(`${prospect.name} ${prospect.company} ${prospect.phone} ${prospect.city} ${prospect.instagram} ${prospect.cnpj}`).includes(term)) return false
      return true
    })
  }, [search, sourceFilter, state.prospects, statusFilter])

  const processingQueue = useMemo(() => state.prospects.filter((item) => ['new', 'analyzing', 'review', 'approved'].includes(item.status)), [state.prospects])
  const activeProspect = processingQueue.find((item) => item.id === processingId) ?? processingQueue[0] ?? null

  useEffect(() => {
    if (!processingId && processingQueue[0]) setProcessingId(processingQueue[0].id)
    if (processingId && !processingQueue.some((item) => item.id === processingId)) setProcessingId(processingQueue[0]?.id ?? null)
  }, [processingId, processingQueue])

  const openSearch = () => {
    const url = buildProspectingSearchUrl(source, segment, city, query)
    window.open(url, '_blank', 'noopener,noreferrer')
    if (canWrite) commit((current) => appendHistory(current, workspaceId, { action: 'search', title: `Busca no ${prospectSourceLabels[source]}`, description: [query || segment, city].filter(Boolean).join(' · '), count: 0 }))
  }

  const captureQuick = () => {
    const drafts = parseQuickCaptureLines(quickCapture)
    if (!drafts.length) { notify('error', 'Cole pelo menos um resultado para capturar.'); return }
    const added = importDrafts(drafts, source, 'capture', `${prospectSourceLabels[source]} · ${city || 'sem cidade'}`)
    setQuickCapture('')
    notify(added ? 'success' : 'info', added ? `${added} lead(s) adicionado(s) ao processamento.` : 'Nenhum lead novo foi encontrado.')
    if (added) setTab('processing')
  }

  const syncExtension = () => {
    if (!preferences.integrations.extensionEnabled) { notify('info', 'A entrada da extensão está desativada nas Configurações.'); return }
    const drafts = readExtensionInbox(preferences.integrations.inboxKey)
    if (!drafts.length) { notify('info', 'A caixa de entrada da extensão está vazia.'); return }
    const added = importDrafts(drafts, 'extension', 'import', 'Sincronização da caixa de entrada da extensão')
    if (workspaceId) recordLocalIntegrationEvent(workspaceId, drafts.length, 'extension_inbox_sync')
    clearExtensionInbox(preferences.integrations.inboxKey)
    commit((current) => ({ ...current, lastExtensionSyncAt: new Date().toISOString() }))
    notify(added ? 'success' : 'info', added ? `${added} lead(s) sincronizado(s).` : 'Os registros recebidos já estavam no Garimpo.')
    if (added) setTab('processing')
  }

  const importFile = async (file: File) => {
    try {
      const raw = await file.text()
      const drafts = parseProspectFile(file.name, raw)
      if (!drafts.length) throw new Error('O arquivo não possui leads reconhecíveis.')
      const added = importDrafts(drafts, 'manual', 'import', `${file.name} · ${drafts.length} registro(s) lido(s)`, drafts.length)
      notify('success', `${added} lead(s) importado(s) sem duplicar registros do Garimpo.`)
      if (added) setTab('processing')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível importar o arquivo.') }
    finally { if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  const updateProspect = (id: string, patch: Partial<ProspectRecord>) => {
    commit((current) => ({ ...current, prospects: current.prospects.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item) }))
  }

  const analyze = (ids: string[]) => {
    const idSet = new Set(ids); let count = 0
    commit((current) => {
      const prospects = current.prospects.map((item) => {
        if (!idSet.has(item.id)) return item
        count += 1; return refreshProspectAnalysis(item, snapshot?.leads ?? [])
      })
      return appendHistory({ ...current, prospects }, workspaceId, { action: 'analyze', title: 'Análise comercial concluída', description: 'Confiança, completude e duplicidades recalculadas.', count })
    })
    notify('success', `${count} lead(s) analisado(s).`)
  }

  const setStatus = (ids: string[], status: ProspectStatus) => {
    const idSet = new Set(ids); const now = new Date().toISOString()
    commit((current) => {
      const prospects = current.prospects.map((item) => idSet.has(item.id) ? { ...item, status, updatedAt: now } : item)
      const action = status === 'approved' ? 'approve' : status === 'discarded' ? 'discard' : 'analyze'
      return appendHistory({ ...current, prospects }, workspaceId, { action, title: status === 'approved' ? 'Leads aprovados' : status === 'discarded' ? 'Leads descartados' : 'Status atualizado', description: `${ids.length} registro(s) alterado(s).`, count: ids.length })
    })
    setSelectedIds(new Set())
  }

  const removeProspects = (ids: string[]) => {
    if (!window.confirm(`Remover ${ids.length} registro(s) do Garimpo?`)) return
    const idSet = new Set(ids)
    commit((current) => appendHistory({ ...current, prospects: current.prospects.filter((item) => !idSet.has(item.id)) }, workspaceId, { action: 'delete', title: 'Registros removidos', description: 'Exclusão manual da base de processamento.', count: ids.length }))
    setSelectedIds(new Set())
  }

  const exportResults = () => {
    const payload = { version: APP_VERSION, exportedAt: new Date().toISOString(), prospects: filtered }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `garimpo-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url)
  }

  const openSend = (ids: string[]) => {
    const validIds = ids.filter((id) => state.prospects.some((item) => item.id === id && item.status !== 'sent' && item.status !== 'discarded'))
    if (!validIds.length) { notify('info', 'Selecione leads aprovados ou em revisão.'); return }
    setSendIds(validIds)
  }

  const sendToCrm = async (options: SendOptions) => {
    if (!snapshot) return
    const prospects = state.prospects.filter((item) => sendIds.includes(item.id))
    setSending(true)
    let created = 0; let updated = 0; let skipped = 0
    const sentIds: string[] = []
    try {
      for (const prospect of prospects) {
        const duplicateLead = prospect.duplicateLeadId ? snapshot.leads.find((lead) => lead.id === prospect.duplicateLeadId) : null
        if (duplicateLead && options.duplicateBehavior === 'skip') { skipped += 1; continue }
        const details = [
          prospect.instagram ? `Instagram: ${prospect.instagram}` : '', prospect.website ? `Site: ${prospect.website}` : '',
          prospect.bookingUrl ? `Agendamento: ${prospect.bookingUrl}` : '', prospect.cnpj ? `CNPJ: ${prospect.cnpj}` : '',
          prospect.address ? `Endereço: ${prospect.address}` : '', prospect.systemName ? `Sistema identificado: ${prospect.systemName}` : '',
          prospect.description, prospect.notes,
        ].filter(Boolean).join('\n')
        let leadId: string
        if (duplicateLead && options.duplicateBehavior === 'update') {
          const tags = Array.from(new Set([...duplicateLead.tags, ...options.tags.split(',').map((tag) => tag.trim()).filter(Boolean), 'garimpo']))
          const lead = await updateLead(duplicateLead.id, {
            phone: prospect.phone || duplicateLead.phone, email: prospect.email || duplicateLead.email, city: prospect.city || duplicateLead.city,
            source: `Garimpo · ${prospectSourceLabels[prospect.source]}`, priority: options.priority, temperature: options.temperature,
            ownerName: options.ownerName || duplicateLead.ownerName, tags, nextActionAt: options.nextActionAt ? new Date(options.nextActionAt).toISOString() : duplicateLead.nextActionAt,
            notes: [duplicateLead.notes, details].filter(Boolean).join('\n\n'),
          })
          leadId = lead.id; updated += 1
        } else {
          const ownerReference = snapshot.leads.find((lead) => lead.ownerName === options.ownerName && lead.ownerId)
          const lead = await createLead({
            name: prospect.name, company: prospect.company || prospect.name, phone: prospect.phone, email: prospect.email, city: prospect.city,
            source: `Garimpo · ${prospectSourceLabels[prospect.source]}`, stageId: options.stageId, status: 'active', temperature: options.temperature,
            priority: options.priority, ownerId: ownerReference?.ownerId ?? null, ownerName: options.ownerName || currentWorkspace?.name || 'Sem responsável',
            value: 0, nextActionAt: options.nextActionAt ? new Date(options.nextActionAt).toISOString() : null, notes: details,
            tags: Array.from(new Set([...options.tags.split(',').map((tag) => tag.trim()).filter(Boolean), 'garimpo', prospect.source])),
          })
          leadId = lead.id; created += 1
        }
        if (options.nextActionAt) {
          await createActivity({ leadId, type: options.activityType, title: options.activityType === 'call' ? `Primeira ligação — ${prospect.company}` : `Primeiro follow-up — ${prospect.company}`, description: 'Atividade criada pelo Garimpo.', dueAt: new Date(options.nextActionAt).toISOString(), completedAt: null, assignedTo: null })
        }
        sentIds.push(prospect.id)
      }
      const now = new Date().toISOString()
      commit((current) => {
        const prospectsNext = current.prospects.map((item) => sentIds.includes(item.id) ? { ...item, status: 'sent' as const, sentAt: now, updatedAt: now } : item)
        return appendHistory({ ...current, prospects: prospectsNext }, workspaceId, { action: updated ? 'merge' : 'send', title: 'Leads enviados ao CRM', description: `${created} criado(s) · ${updated} atualizado(s) · ${skipped} ignorado(s)`, count: sentIds.length })
      })
      setSendIds([]); setSelectedIds(new Set())
      notify('success', `${sentIds.length} lead(s) processado(s) no CRM.`)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível enviar os leads.') }
    finally { setSending(false) }
  }

  if (!snapshot || !currentWorkspace) return null

  return (
    <div className="page-stack prospecting-page">
      <section className="toolbar-card prospecting-command">
        <div><span className="eyebrow"><Sparkles size={14} /> Aquisição comercial organizada</span><h2>Garimpo de leads</h2><p>Busque, capture, valide e envie oportunidades ao CRM com controle de confiança e duplicidade.</p></div>
        <div className="toolbar-card__actions">
          <input ref={fileInputRef} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file) }} />
          {canWrite ? <><Button variant="secondary" onClick={() => fileInputRef.current?.click()}><Upload size={17} /> Importar</Button>
          <Button onClick={() => setTab('search')}><Plus size={17} /> Nova captura</Button></> : null}
        </div>
      </section>

      <section className="prospecting-metrics">
        <Metric icon={Database} label="Base capturada" value={metrics.total} detail="registros no Garimpo" />
        <Metric icon={CircleDashed} label="Aguardando revisão" value={metrics.review} detail="novos ou incompletos" tone="blue" />
        <Metric icon={BadgeCheck} label="Aprovados" value={metrics.approved} detail="prontos para envio" tone="green" />
        <Metric icon={AlertTriangle} label="Duplicidades" value={metrics.duplicates} detail="exigem decisão" tone="orange" />
        <Metric icon={Send} label="Enviados ao CRM" value={metrics.sent} detail="histórico consolidado" tone="purple" />
      </section>

      <nav className="prospecting-tabs" aria-label="Etapas do Garimpo">
        <button className={tab === 'search' ? 'is-active' : ''} onClick={() => setTab('search')}><Search size={16} /> Busca</button>
        <button className={tab === 'processing' ? 'is-active' : ''} onClick={() => setTab('processing')}><Sparkles size={16} /> Processamento <span>{metrics.review}</span></button>
        <button className={tab === 'results' ? 'is-active' : ''} onClick={() => setTab('results')}><ClipboardList size={16} /> Resultados <span>{metrics.total}</span></button>
        <button className={tab === 'kanban' ? 'is-active' : ''} onClick={() => setTab('kanban')}><KanbanSquare size={16} /> Kanban</button>
        <button className={tab === 'history' ? 'is-active' : ''} onClick={() => setTab('history')}><History size={16} /> Histórico</button>
      </nav>

      {tab === 'search' ? <SearchWorkspace
        readOnly={!canWrite}
        source={source} segment={segment} city={city} query={query} quantity={quantity} quickCapture={quickCapture} lastSync={state.lastExtensionSyncAt}
        onSource={setSource} onSegment={setSegment} onCity={setCity} onQuery={setQuery} onQuantity={setQuantity} onQuickCapture={setQuickCapture}
        onOpenSearch={openSearch} onCapture={captureQuick} onSyncExtension={syncExtension}
      /> : null}

      {tab === 'processing' ? <ProcessingWorkspace
        readOnly={!canWrite}
        queue={processingQueue} active={activeProspect} leads={snapshot.leads} onSelect={setProcessingId} onChange={updateProspect}
        onAnalyze={(id) => analyze([id])} onApprove={(id) => setStatus([id], 'approved')} onDiscard={(id) => setStatus([id], 'discarded')}
        onSend={(id) => openSend([id])} onAnalyzeAll={() => analyze(processingQueue.filter((item) => item.status !== 'sent').map((item) => item.id))}
      /> : null}

      {tab === 'results' ? <ResultsWorkspace
        readOnly={!canWrite}
        prospects={filtered} selectedIds={selectedIds} search={search} statusFilter={statusFilter} sourceFilter={sourceFilter}
        onSearch={setSearch} onStatusFilter={setStatusFilter} onSourceFilter={setSourceFilter} onSelected={setSelectedIds}
        onAnalyze={(ids) => analyze(ids)} onApprove={(ids) => setStatus(ids, 'approved')} onDiscard={(ids) => setStatus(ids, 'discarded')}
        onSend={openSend} onDelete={removeProspects} onExport={exportResults}
      /> : null}

      {tab === 'kanban' ? <KanbanWorkspace readOnly={!canWrite} prospects={state.prospects} onStatus={(id, status) => setStatus([id], status)} onSelect={(id) => { setProcessingId(id); setTab('processing') }} /> : null}
      {tab === 'history' ? <HistoryWorkspace state={state} onExport={exportResults} /> : null}

      <SendToCrmModal open={canWrite && sendIds.length > 0} count={sendIds.length} stages={snapshot.stages} ownerNames={Array.from(new Set(snapshot.leads.map((lead) => lead.ownerName).filter(Boolean)))} loading={sending} onClose={() => setSendIds([])} onSubmit={sendToCrm} />

      {metrics.sent > 0 ? <section className="prospecting-footer-callout"><div><CheckCircle2 size={20} /><div><strong>Integração ativa com o CRM</strong><span>Leads enviados aparecem em Leads, Pipeline e nas atividades programadas.</span></div></div><Button variant="secondary" onClick={() => setRoute('leads')}>Abrir Leads <ArrowRight size={16} /></Button></section> : null}
    </div>
  )
}

function Metric({ icon: Icon, label, value, detail, tone = '' }: { icon: typeof Database; label: string; value: number; detail: string; tone?: string }) {
  return <article className="prospecting-metric"><span className={tone ? `is-${tone}` : ''}><Icon size={18} /></span><div><small>{label}</small><strong>{value}</strong><em>{detail}</em></div></article>
}

function SearchWorkspace(props: {
  readOnly: boolean; source: ProspectSource; segment: string; city: string; query: string; quantity: number; quickCapture: string; lastSync: string | null
  onSource(value: ProspectSource): void; onSegment(value: string): void; onCity(value: string): void; onQuery(value: string): void; onQuantity(value: number): void; onQuickCapture(value: string): void
  onOpenSearch(): void; onCapture(): void; onSyncExtension(): void
}) {
  return <div className="prospecting-search-layout">
    <section className="panel prospecting-search-panel">
      <header className="panel__heading"><div><span className="eyebrow"><Search size={14} /> Configuração da busca</span><h3>Encontrar novas oportunidades</h3><p>Escolha a fonte e abra uma pesquisa preparada com segmento e região.</p></div></header>
      <div className="prospecting-source-grid">{(['maps', 'instagram', 'cnpj', 'extension', 'manual'] as ProspectSource[]).map((item) => {
        const Icon = sourceIcons[item]
        return <button key={item} className={props.source === item ? 'is-active' : ''} onClick={() => props.onSource(item)}><span><Icon size={19} /></span><strong>{prospectSourceLabels[item]}</strong><small>{item === 'maps' ? 'Busca local e contatos' : item === 'instagram' ? 'Perfil e presença digital' : item === 'cnpj' ? 'Dados cadastrais' : item === 'extension' ? 'Captura automática' : 'Entrada própria'}</small></button>
      })}</div>
      <div className="prospecting-form-grid">
        <label><span>Segmento</span><input value={props.segment} onChange={(event) => props.onSegment(event.target.value)} placeholder="Ex.: Barbearias" /></label>
        <label><span>Cidade ou região</span><input value={props.city} onChange={(event) => props.onCity(event.target.value)} placeholder="Ex.: Canoas, RS" /></label>
        <label className="is-wide"><span>Busca específica</span><input value={props.query} onChange={(event) => props.onQuery(event.target.value)} placeholder="Opcional: nome, bairro ou palavra-chave" /></label>
        <label><span>Limite por lote</span><select value={props.quantity} onChange={(event) => props.onQuantity(Number(event.target.value))}><option value={10}>10 leads</option><option value={25}>25 leads</option><option value={50}>50 leads</option><option value={100}>100 leads</option></select></label>
      </div>
      <div className="prospecting-search-actions"><Button onClick={props.onOpenSearch}><ExternalLink size={17} /> Abrir busca preparada</Button><span>A pesquisa abre em uma nova guia e o CRM mantém o fluxo salvo.</span></div>
    </section>

    <aside className="panel prospecting-extension-card">
      <header><span><Zap size={20} /></span><div><small>Integração Chrome</small><strong>Caixa de entrada da extensão</strong></div><StatusPill tone="success">Pronta</StatusPill></header>
      <p>A extensão pode entregar lotes por mensagem do navegador ou pela caixa local compatível com a {APP_VERSION_LABEL}.</p>
      <div className="prospecting-extension-flow"><span>Capturar</span><ArrowRight size={14} /><span>Analisar</span><ArrowRight size={14} /><span>Revisar</span><ArrowRight size={14} /><span>Enviar</span></div>
      <div className="prospecting-extension-status"><Inbox size={17} /><div><strong>{props.lastSync ? `Última sincronização: ${formatDateTime(props.lastSync)}` : 'Nenhuma sincronização realizada'}</strong><span>Importação sem reenvio do mesmo registro.</span></div></div>
      {!props.readOnly ? <Button variant="secondary" onClick={props.onSyncExtension}><RefreshCw size={16} /> Sincronizar agora</Button> : null}
    </aside>

    <section className="panel prospecting-quick-capture">
      <header className="panel__heading"><div><span className="eyebrow"><ClipboardList size={14} /> Captura assistida</span><h3>Cole os resultados encontrados</h3><p>Uma empresa por linha. O Garimpo separa os campos e evita repetições.</p></div><span className="prospecting-format-hint">Nome | Telefone | Cidade | Instagram, site ou CNPJ | Observação</span></header>
      <textarea readOnly={props.readOnly} value={props.quickCapture} onChange={(event) => props.onQuickCapture(event.target.value)} placeholder={'Barbearia Exemplo | (51) 99999-9999 | Canoas | @barbeariaexemplo | Usa agenda manual\nOutra Empresa | (51) 98888-8888 | Porto Alegre | https://site.com.br'} />
      <footer><div><ShieldCheck size={17} /><span>Telefone, CNPJ, Instagram, domínio, nome e cidade são comparados antes de salvar.</span></div>{!props.readOnly ? <Button onClick={props.onCapture}><Sparkles size={17} /> Capturar e analisar</Button> : null}</footer>
    </section>
  </div>
}

function ProcessingWorkspace({ readOnly, queue, active, leads, onSelect, onChange, onAnalyze, onApprove, onDiscard, onSend, onAnalyzeAll }: {
  readOnly: boolean; queue: ProspectRecord[]; active: ProspectRecord | null; leads: Array<{ id: string; name: string; company: string }>; onSelect(id: string): void
  onChange(id: string, patch: Partial<ProspectRecord>): void; onAnalyze(id: string): void; onApprove(id: string): void; onDiscard(id: string): void; onSend(id: string): void; onAnalyzeAll(): void
}) {
  if (!active) return <EmptyState icon={Sparkles} title="Fila de processamento vazia" description="Capture ou importe leads para iniciar a análise comercial." />
  const index = queue.findIndex((item) => item.id === active.id)
  const duplicateLead = active.duplicateLeadId ? leads.find((lead) => lead.id === active.duplicateLeadId) : null
  const checks = prospectCompleteness(active)
  return <div className="prospecting-processing-layout">
    <aside className="panel prospecting-queue">
      <header><div><span className="eyebrow">Fila de análise</span><strong>{queue.length} lead(s)</strong></div>{!readOnly ? <button className="icon-button" onClick={onAnalyzeAll} title="Analisar todos"><Sparkles size={16} /></button> : null}</header>
      <div>{queue.map((prospect) => <button key={prospect.id} className={prospect.id === active.id ? 'is-active' : ''} onClick={() => onSelect(prospect.id)}><span className={`prospect-confidence is-${prospect.confidence >= 75 ? 'high' : prospect.confidence >= 50 ? 'medium' : 'low'}`}>{prospect.confidence}</span><div><strong>{prospect.company}</strong><small>{prospect.city || 'Cidade não informada'} · {prospectSourceLabels[prospect.source]}</small></div>{prospect.duplicateLevel !== 'none' ? <AlertTriangle size={14} /> : <ChevronRight size={14} />}</button>)}</div>
    </aside>

    <section className="panel prospecting-review-card">
      <header className="prospecting-review-header"><div><span className="eyebrow"><Sparkles size={14} /> Processamento individual</span><h3>{active.company}</h3><p>Revise os dados, valide a duplicidade e defina o destino comercial.</p></div><div><StatusPill tone={statusTones[active.status]}>{prospectStatusLabels[active.status]}</StatusPill><span className="prospecting-counter">{index + 1} de {queue.length}</span></div></header>
      <div className="prospecting-review-form">
        <label><span>Nome do contato/empresa</span><input readOnly={readOnly} value={active.name} onChange={(event) => onChange(active.id, { name: event.target.value, company: event.target.value })} /></label>
        <label><span>Telefone</span><input readOnly={readOnly} value={active.phone} onChange={(event) => onChange(active.id, { phone: event.target.value })} placeholder="(51) 99999-9999" /></label>
        <label><span>E-mail</span><input readOnly={readOnly} value={active.email} onChange={(event) => onChange(active.id, { email: event.target.value })} /></label>
        <label><span>Cidade</span><input readOnly={readOnly} value={active.city} onChange={(event) => onChange(active.id, { city: event.target.value })} /></label>
        <label className="is-wide"><span>Endereço</span><input readOnly={readOnly} value={active.address} onChange={(event) => onChange(active.id, { address: event.target.value })} /></label>
        <label><span>CNPJ</span><input readOnly={readOnly} value={active.cnpj} onChange={(event) => onChange(active.id, { cnpj: event.target.value })} /></label>
        <label><span>Instagram</span><input readOnly={readOnly} value={active.instagram} onChange={(event) => onChange(active.id, { instagram: event.target.value })} placeholder="@perfil" /></label>
        <label><span>Site</span><input readOnly={readOnly} value={active.website} onChange={(event) => onChange(active.id, { website: event.target.value })} /></label>
        <label><span>Link de agendamento</span><input readOnly={readOnly} value={active.bookingUrl} onChange={(event) => onChange(active.id, { bookingUrl: event.target.value })} /></label>
        <label><span>Sistema identificado</span><input readOnly={readOnly} value={active.systemName} onChange={(event) => onChange(active.id, { systemName: event.target.value })} /></label>
        <label className="is-wide"><span>Descrição e sinais comerciais</span><textarea readOnly={readOnly} value={active.description} onChange={(event) => onChange(active.id, { description: event.target.value })} /></label>
        <label className="is-wide"><span>Observações da revisão</span><textarea readOnly={readOnly} value={active.notes} onChange={(event) => onChange(active.id, { notes: event.target.value })} /></label>
      </div>
      {!readOnly ? <footer className="prospecting-review-actions"><div><Button variant="ghost" onClick={() => onDiscard(active.id)}><Ban size={16} /> Descartar</Button><Button variant="secondary" onClick={() => onAnalyze(active.id)}><RefreshCw size={16} /> Reanalisar</Button></div><div><Button variant="secondary" onClick={() => onApprove(active.id)}><Check size={16} /> Aprovar</Button><Button onClick={() => onSend(active.id)}><Send size={16} /> Enviar ao CRM</Button></div></footer> : null}
    </section>

    <aside className="prospecting-analysis-sidebar">
      <section className="panel prospecting-confidence-card"><header><div><span>Confiança dos dados</span><strong>{active.confidence}%</strong></div><GaugeRing value={active.confidence} /></header><div className="prospecting-confidence-track"><span style={{ width: `${active.confidence}%` }} /></div><div className="prospecting-checklist">{checks.map((check) => <span key={check.label} className={check.ok ? 'is-ok' : ''}>{check.ok ? <CheckCircle2 size={14} /> : <CircleDashed size={14} />}{check.label}</span>)}</div></section>
      <section className={`panel prospecting-duplicate-card is-${active.duplicateLevel}`}><header><span><AlertTriangle size={18} /></span><div><small>Antiduplicação</small><strong>{duplicateLabel(active.duplicateLevel)}</strong></div></header>{active.duplicateReasons.length ? <ul>{active.duplicateReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p>Nenhum identificador forte coincide com a base atual.</p>}{duplicateLead ? <div className="prospecting-duplicate-match"><UserRoundCheck size={16} /><div><small>Registro encontrado</small><strong>{duplicateLead.company || duplicateLead.name}</strong></div></div> : null}</section>
      <section className="panel prospecting-source-card"><span className="eyebrow">Origem e rastreabilidade</span><div><SourceMark source={active.source} /><div><strong>{prospectSourceLabels[active.source]}</strong><small>{active.sourceDetail || 'Captura sem detalhe adicional'}</small></div></div><dl><div><dt>Criado</dt><dd>{formatDateTime(active.createdAt)}</dd></div><div><dt>Analisado</dt><dd>{active.analyzedAt ? formatDateTime(active.analyzedAt) : 'Pendente'}</dd></div></dl></section>
    </aside>
  </div>
}

function GaugeRing({ value }: { value: number }) { return <span className="prospecting-gauge" style={{ '--value': `${value * 3.6}deg` } as CSSProperties}><em>{value}</em></span> }
function SourceMark({ source }: { source: ProspectSource }) { const Icon = sourceIcons[source]; return <span className={`prospecting-source-mark is-${source}`}><Icon size={17} /></span> }

function ResultsWorkspace({ readOnly, prospects, selectedIds, search, statusFilter, sourceFilter, onSearch, onStatusFilter, onSourceFilter, onSelected, onAnalyze, onApprove, onDiscard, onSend, onDelete, onExport }: {
  readOnly: boolean; prospects: ProspectRecord[]; selectedIds: Set<string>; search: string; statusFilter: 'all' | ProspectStatus; sourceFilter: 'all' | ProspectSource
  onSearch(value: string): void; onStatusFilter(value: 'all' | ProspectStatus): void; onSourceFilter(value: 'all' | ProspectSource): void; onSelected(value: Set<string>): void
  onAnalyze(ids: string[]): void; onApprove(ids: string[]): void; onDiscard(ids: string[]): void; onSend(ids: string[]): void; onDelete(ids: string[]): void; onExport(): void
}) {
  const allSelected = prospects.length > 0 && prospects.every((item) => selectedIds.has(item.id))
  const toggle = (id: string) => { const next = new Set(selectedIds); if (next.has(id)) next.delete(id); else next.add(id); onSelected(next) }
  const ids = [...selectedIds]
  return <section className="panel prospecting-results-panel">
    <header className="prospecting-results-toolbar"><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar empresa, cidade, telefone ou CNPJ" /></label><label className="compact-select"><Filter size={15} /><select value={statusFilter} onChange={(event) => onStatusFilter(event.target.value as 'all' | ProspectStatus)}><option value="all">Todos os status</option>{Object.entries(prospectStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="compact-select"><ListFilter size={15} /><select value={sourceFilter} onChange={(event) => onSourceFilter(event.target.value as 'all' | ProspectSource)}><option value="all">Todas as origens</option>{Object.entries(prospectSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><Button variant="secondary" onClick={onExport}><Download size={16} /> Exportar</Button></header>
    {!readOnly && selectedIds.size ? <div className="prospecting-bulkbar"><strong>{selectedIds.size} selecionado(s)</strong><div><Button size="sm" variant="ghost" onClick={() => onAnalyze(ids)}><Sparkles size={15} /> Analisar</Button><Button size="sm" variant="ghost" onClick={() => onApprove(ids)}><Check size={15} /> Aprovar</Button><Button size="sm" variant="ghost" onClick={() => onDiscard(ids)}><Ban size={15} /> Descartar</Button><Button size="sm" onClick={() => onSend(ids)}><Send size={15} /> Enviar</Button><Button size="sm" variant="danger" onClick={() => onDelete(ids)}><Trash2 size={15} /></Button></div></div> : null}
    {prospects.length ? <div className="prospecting-table"><div className="prospecting-table__head"><label><input type="checkbox" disabled={readOnly} checked={allSelected} onChange={() => onSelected(allSelected ? new Set() : new Set(prospects.map((item) => item.id)))} /></label><span>Lead</span><span>Contato</span><span>Origem</span><span>Confiança</span><span>Validação</span><span>Status</span><span>Ações</span></div>{prospects.map((prospect) => <article key={prospect.id}><label><input type="checkbox" disabled={readOnly} checked={selectedIds.has(prospect.id)} onChange={() => toggle(prospect.id)} /></label><div className="prospecting-table__lead"><span>{prospect.company.slice(0, 1).toUpperCase()}</span><div><strong>{prospect.company}</strong><small>{prospect.city || 'Cidade não informada'}</small></div></div><div className="prospecting-table__contact"><strong>{prospect.phone || 'Sem telefone'}</strong><small>{prospect.instagram || prospect.email || prospect.website || 'Sem canal digital'}</small></div><div><SourceMark source={prospect.source} /><small>{prospectSourceLabels[prospect.source]}</small></div><div className="prospecting-table__confidence"><div><span style={{ width: `${prospect.confidence}%` }} /></div><strong>{prospect.confidence}%</strong></div><StatusPill tone={duplicateTone(prospect.duplicateLevel)}>{prospect.duplicateLevel === 'none' ? 'Único' : prospect.duplicateLevel === 'possible' ? 'Revisar' : 'Duplicado'}</StatusPill><StatusPill tone={statusTones[prospect.status]}>{prospectStatusLabels[prospect.status]}</StatusPill><div className="prospecting-table__actions">{!readOnly ? <><button className="icon-button" title="Analisar" onClick={() => onAnalyze([prospect.id])}><Sparkles size={15} /></button>{prospect.status !== 'sent' && prospect.status !== 'discarded' ? <button className="icon-button" title="Enviar ao CRM" onClick={() => onSend([prospect.id])}><Send size={15} /></button> : null}<button className="icon-button icon-button--danger" title="Remover" onClick={() => onDelete([prospect.id])}><Trash2 size={15} /></button></> : null}</div></article>)}</div> : <EmptyState icon={Search} title="Nenhum resultado encontrado" description="Ajuste os filtros ou faça uma nova captura." />}
  </section>
}

const kanbanStatuses: ProspectStatus[] = ['new', 'analyzing', 'review', 'approved', 'discarded', 'sent']
function KanbanWorkspace({ readOnly, prospects, onStatus, onSelect }: { readOnly: boolean; prospects: ProspectRecord[]; onStatus(id: string, status: ProspectStatus): void; onSelect(id: string): void }) {
  return <section className="prospecting-kanban">{kanbanStatuses.map((status) => {
    const items = prospects.filter((item) => item.status === status)
    return <div className={`prospecting-kanban-column is-${status}`} key={status}><header><span><i />{prospectStatusLabels[status]}</span><strong>{items.length}</strong></header><div>{items.map((prospect) => <article key={prospect.id} draggable={!readOnly} onDragStart={(event) => { if (!readOnly) event.dataTransfer.setData('text/prospect-id', prospect.id) }} onClick={() => onSelect(prospect.id)}><div><SourceMark source={prospect.source} /><StatusPill tone={duplicateTone(prospect.duplicateLevel)}>{prospect.duplicateLevel === 'none' ? 'Validado' : 'Atenção'}</StatusPill></div><h3>{prospect.company}</h3><p>{prospect.city || 'Sem cidade'} · {prospect.phone || 'Sem telefone'}</p><footer><span className={`prospect-confidence is-${prospect.confidence >= 75 ? 'high' : prospect.confidence >= 50 ? 'medium' : 'low'}`}>{prospect.confidence}%</span><MoreHorizontal size={16} /></footer></article>)}</div>{!readOnly ? <button className="prospecting-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData('text/prospect-id'); if (id) onStatus(id, status) }}>Mover para {prospectStatusLabels[status]}</button> : null}</div>
  })}</section>
}

function HistoryWorkspace({ state, onExport }: { state: ProspectingState; onExport(): void }) {
  return <section className="panel prospecting-history-panel"><header className="panel__heading"><div><span className="eyebrow"><History size={14} /> Rastreabilidade</span><h3>Histórico do Garimpo</h3><p>Buscas, importações, análises, aprovações e envios registrados.</p></div><Button variant="secondary" onClick={onExport}><FileJson size={16} /> Exportar base</Button></header>{state.history.length ? <div className="prospecting-history-list">{state.history.map((item) => <article key={item.id}><span className={`is-${item.action}`}>{item.action === 'search' ? <Search /> : item.action === 'send' || item.action === 'merge' ? <Send /> : item.action === 'discard' || item.action === 'delete' ? <Trash2 /> : item.action === 'analyze' ? <Sparkles /> : <Upload />}</span><div><strong>{item.title}</strong><p>{item.description}</p></div><em>{item.count ? `${item.count} lead(s)` : 'Consulta'}</em><time>{formatDateTime(item.createdAt)}</time></article>)}</div> : <EmptyState icon={History} title="Nenhuma movimentação registrada" description="O histórico será criado conforme você utilizar o Garimpo." />}</section>
}

function SendToCrmModal({ open, count, stages, ownerNames, loading, onClose, onSubmit }: {
  open: boolean; count: number; stages: Array<{ id: string; name: string }>; ownerNames: string[]; loading: boolean; onClose(): void; onSubmit(options: SendOptions): Promise<void>
}) {
  const defaultDate = useMemo(() => { const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(10, 0, 0, 0); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16) }, [open])
  const [options, setOptions] = useState<SendOptions>({ stageId: stages[0]?.id ?? '', ownerName: ownerNames[0] ?? 'Camila', priority: 'medium', temperature: 'warm', tags: 'prospecção', nextActionAt: defaultDate, activityType: 'call', duplicateBehavior: 'update' })
  useEffect(() => { if (open) setOptions((current) => ({ ...current, stageId: current.stageId || stages[0]?.id || '', ownerName: current.ownerName || ownerNames[0] || 'Camila', nextActionAt: defaultDate })) }, [defaultDate, open, ownerNames, stages])
  return <Modal open={open} title={`Enviar ${count} lead(s) ao CRM`} subtitle="Defina a entrada no Pipeline, responsável e primeira ação comercial." onClose={onClose} size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={loading} onClick={() => void onSubmit(options)}><Send size={17} /> Confirmar envio</Button></>}>
    <div className="prospecting-send-form"><section><span className="eyebrow"><WorkflowIcon /> Organização comercial</span><div className="prospecting-form-grid"><label><span>Etapa inicial</span><select value={options.stageId} onChange={(event) => setOptions({ ...options, stageId: event.target.value })}>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label><label><span>Responsável</span><input list="prospecting-owner-list" value={options.ownerName} onChange={(event) => setOptions({ ...options, ownerName: event.target.value })} /><datalist id="prospecting-owner-list">{ownerNames.map((name) => <option key={name} value={name} />)}</datalist></label><label><span>Prioridade</span><select value={options.priority} onChange={(event) => setOptions({ ...options, priority: event.target.value as LeadPriority })}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label><label><span>Temperatura</span><select value={options.temperature} onChange={(event) => setOptions({ ...options, temperature: event.target.value as LeadTemperature })}><option value="cold">Frio</option><option value="warm">Morno</option><option value="hot">Quente</option></select></label><label className="is-wide"><span>Tags</span><input value={options.tags} onChange={(event) => setOptions({ ...options, tags: event.target.value })} placeholder="prospecção, barbearia, canoas" /></label></div></section>
      <section><span className="eyebrow"><Phone size={14} /> Primeira atividade</span><div className="prospecting-form-grid"><label><span>Tipo</span><select value={options.activityType} onChange={(event) => setOptions({ ...options, activityType: event.target.value as SendOptions['activityType'] })}><option value="call">Ligação</option><option value="followup">Follow-up</option></select></label><label><span>Data e horário</span><input type="datetime-local" value={options.nextActionAt} onChange={(event) => setOptions({ ...options, nextActionAt: event.target.value })} /></label></div></section>
      <section className="prospecting-duplicate-policy"><span className="eyebrow"><Merge size={14} /> Quando já existir no CRM</span><div>{([['update', 'Atualizar existente', 'Preenche campos ausentes e preserva o histórico.'], ['skip', 'Ignorar duplicados', 'Envia somente os registros realmente novos.'], ['create', 'Criar mesmo assim', 'Mantém dois registros separados na base.']] as Array<[DuplicateBehavior, string, string]>).map(([value, title, description]) => <label key={value} className={options.duplicateBehavior === value ? 'is-active' : ''}><input type="radio" name="duplicate-behavior" checked={options.duplicateBehavior === value} onChange={() => setOptions({ ...options, duplicateBehavior: value })} /><span><strong>{title}</strong><small>{description}</small></span></label>)}</div></section>
    </div>
  </Modal>
}

function WorkflowIcon() { return <Link2 size={14} /> }
