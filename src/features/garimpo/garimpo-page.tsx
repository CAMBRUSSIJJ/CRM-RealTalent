import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Check, ChevronDown, ExternalLink, Loader2, MapPin, Search, ShieldCheck } from 'lucide-react'
import { Modal } from '../../components/ui/modal'
import { useAppActions, useAppNavigation, useAppUi, useAppWorkspace } from '../../app/app-context'
import { safeStorage } from '../../lib/storage'
import { createUuid } from '../../lib/id'
import { cacheProspectingStateLocally, detectProspectDuplicate, flushProspectingSync, readProspectingState, readRemoteProspectingState, writeProspectingState, type ProspectingState, type ProspectRecord, type CaptureDraft } from '../../services/prospecting-workspace'
import { hostedGarimpo, type HostedJob } from './hosted-client'
import { IndexExplorer } from './index-explorer'
import { RecheckPanel } from './recheck-panel'
import { currentValue, readPending, resolveRecheck, stageRecheck, type RecheckField } from './recheck'
import { evidenceFor, mergeResults, publicUrl } from './review'
import './garimpo.css'

const states = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
const active = (job: HostedJob | null) => Boolean(job && ['queued','running'].includes(job.status))
const labels = { queued: 'Aguardando execução', running: 'Pesquisando empresas', completed: 'Pesquisa concluída', cancelled: 'Pesquisa cancelada', failed: 'Pesquisa interrompida' }
const digits = (value: string) => value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const empty = (): ProspectingState => ({ prospects: [], history: [], lastExtensionSyncAt: null })
type View = 'review' | 'sent' | 'discarded' | 'all'

export function ProspectingPage() {
  const { snapshot, currentWorkspace, currentUserId, repositoryMode, can, canTeamAccess, canTeamAccessRecord } = useAppWorkspace()
  const { createCompany, createLead, updateCompany } = useAppActions()
  const { navigate } = useAppNavigation()
  const { notify } = useAppUi()
  const workspaceId = currentWorkspace?.id || ''
  const canCreate = canTeamAccess('create','prospecting')
  const canEdit = canTeamAccess('edit','prospecting')
  const canSend = canEdit && canTeamAccess('create','contacts') && can('create','company')
  const canCreateOpportunity = canTeamAccess('create','pipeline') && can('create','lead')
  const canUpdateCompany = can('edit','company') && canTeamAccess('edit','contacts')
  const [state, setState] = useState<ProspectingState>(empty)
  const stateRef = useRef(state)
  const scopeRef = useRef(workspaceId)
  const snapshotRef = useRef(snapshot)
  const execution = useRef<AbortController | null>(null)
  const starting = useRef(false)
  const searchKey = useRef<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [availability, setAvailability] = useState<'checking' | 'ready' | 'error'>('checking')
  const [connectionError, setConnectionError] = useState('')
  const [error, setError] = useState('')
  const [syncError, setSyncError] = useState('')
  const [job, setJob] = useState<HostedJob | null>(null)
  const [jobs, setJobs] = useState<HostedJob[]>([])
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [segment, setSegment] = useState('Barbearia')
  const [city, setCity] = useState('Rio Grande')
  const [uf, setUf] = useState('RS')
  const [quantity, setQuantity] = useState(30)
  const [phone, setPhone] = useState(true)
  const [emailOnly, setEmailOnly] = useState(false)
  const [verifiedLocation, setVerifiedLocation] = useState(false)
  const [minRelevance, setMinRelevance] = useState(0)
  const [sites, setSites] = useState(true)
  const [view, setView] = useState<View>('review')
  const [filter, setFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all'|'cnpj'|'maps'>('all')
  const [contactFilter, setContactFilter] = useState<'all'|'with'|'without'>('all')
  const [recheckedOnly, setRecheckedOnly] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [opportunity, setOpportunity] = useState(false)
  const [stageId, setStageId] = useState('')

  useEffect(() => { snapshotRef.current = snapshot }, [snapshot])
  const commit = useCallback((transform: (current: ProspectingState) => ProspectingState) => {
    if (scopeRef.current !== workspaceId || !workspaceId) return
    const next = transform(stateRef.current)
    if (next === stateRef.current) return
    stateRef.current = next
    setState(next)
    writeProspectingState(workspaceId, next)
  }, [workspaceId])

  const acceptJob = useCallback((next: HostedJob) => {
    if (scopeRef.current !== workspaceId || next.organization_id !== workspaceId) return
    setJob(next)
    setJobs(current => [next, ...current.filter(item => item.id !== next.id)].slice(0,20))
    safeStorage.setItem(`garimpo-hosted-job:${workspaceId}`, next.id)
    if (canCreate) commit(current => mergeResults(current, next.results, workspaceId, currentUserId, snapshotRef.current?.leads || []))
  }, [workspaceId, currentUserId, canCreate, commit])

  const drive = useCallback(async (next: HostedJob) => {
    if (scopeRef.current !== workspaceId || next.organization_id !== workspaceId) return
    execution.current?.abort()
    const controller = new AbortController()
    execution.current = controller
    setBusy(true); setError('')
    acceptJob(next)
    try {
      // A second browser can observe the same job; durable leases prevent duplicate collection.
      while (!controller.signal.aborted) {
        await hostedGarimpo.run(workspaceId, next.id, acceptJob, controller.signal)
        const latest = await hostedGarimpo.get(workspaceId, next.id, controller.signal)
        acceptJob(latest)
        if (!active(latest)) break
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted','AbortError')) }
          const timer = window.setTimeout(() => { controller.signal.removeEventListener('abort', onAbort); resolve() }, 4000)
          controller.signal.addEventListener('abort', onAbort, { once: true })
        })
      }
      await flushProspectingSync(workspaceId)
    } catch (cause) {
      if (!controller.signal.aborted && scopeRef.current === workspaceId) setError(cause instanceof Error ? cause.message : 'Não foi possível acompanhar a pesquisa.')
    } finally {
      if (execution.current === controller && scopeRef.current === workspaceId) { execution.current = null; setBusy(false) }
    }
  }, [workspaceId, acceptJob])

  const check = useCallback(async (signal?: AbortSignal) => {
    setAvailability('checking'); setConnectionError('')
    try {
      const status = await hostedGarimpo.capabilities(workspaceId, signal)
      if (signal?.aborted || scopeRef.current !== workspaceId) return
      if (!status.ready || !status.hosted) throw new Error('O motor hospedado ainda não está pronto para pesquisar.')
      setAvailability('ready')
    } catch (cause) {
      if (!signal?.aborted && scopeRef.current === workspaceId) {
        setAvailability('error'); setConnectionError(cause instanceof Error ? cause.message : 'Não foi possível verificar o motor.')
      }
    }
  }, [workspaceId])

  useEffect(() => {
    scopeRef.current = workspaceId
    const controller = new AbortController()
    execution.current?.abort(); execution.current = null
    starting.current = false; searchKey.current = null
    setJob(null); setJobs([]); setBusy(false); setSending(false); setSelected([]); setExpanded(null); setSendOpen(false)
    setError(''); setSyncError(''); setHydrated(false)
    const local = workspaceId ? readProspectingState(workspaceId) : empty()
    stateRef.current = local; setState(local)
    if (!workspaceId) return
    void (async () => {
      const remote = repositoryMode === 'supabase' ? await readRemoteProspectingState(workspaceId) : null
      if (controller.signal.aborted) return
      if (remote) {
        const merged = new Map(local.prospects.map(record => [record.id, record]))
        for (const record of remote.prospects) {
          const previous = merged.get(record.id)
          if (!previous || record.updatedAt >= previous.updatedAt) merged.set(record.id,record)
        }
        const next = { ...remote, prospects: [...merged.values()] }
        stateRef.current = next; setState(next); cacheProspectingStateLocally(workspaceId,next)
      } else if (repositoryMode === 'supabase') setSyncError('Não foi possível carregar a revisão salva. Verifique sua conexão antes de enviar empresas ao CRM.')
      setHydrated(true)
      await check(controller.signal)
      if (controller.signal.aborted) return
      try {
        const history = await hostedGarimpo.list(workspaceId, controller.signal)
        if (controller.signal.aborted) return
        setJobs(history)
        const savedId = safeStorage.getItem(`garimpo-hosted-job:${workspaceId}`)
        const latest = history.find(item => item.id === savedId) || history[0]
        if (latest) {
          const full = await hostedGarimpo.get(workspaceId,latest.id,controller.signal)
          if (controller.signal.aborted) return
          acceptJob(full)
          if (active(full) && canCreate) void drive(full)
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o histórico.')
      }
    })()
    return () => { controller.abort(); execution.current?.abort(); execution.current = null; void flushProspectingSync(workspaceId).catch(() => undefined) }
  }, [workspaceId, repositoryMode, check, acceptJob, drive, canCreate])

  const inScope = (record: ProspectRecord) => canTeamAccessRecord('prospecting', record.createdBy ?? currentUserId)
  const all = state.prospects.filter(inScope)
  const visible = all.filter(record => (view === 'all' || (view === 'review' ? !['sent','discarded'].includes(record.status) : record.status === view))
    && (sourceFilter === 'all' || (sourceFilter === 'cnpj' ? record.source === 'cnpj' : record.source === 'maps'))
    && (contactFilter === 'all' || (contactFilter === 'with' ? Boolean(record.phone || record.email) : !record.phone && !record.email))
    && (!recheckedOnly || Boolean(record.rawData.lastRecheckedAt))
    && normalize(`${record.name} ${record.company} ${record.cnpj} ${record.city} ${record.phone} ${record.email}`).includes(normalize(filter)))
  const chosen = all.filter(record => selected.includes(record.id))
  const approved = chosen.filter(record => record.status === 'approved')
  const patchRecord = (id: string, patch: Partial<ProspectRecord>) => {
    if (!canEdit) return
    commit(current => ({ ...current, prospects: current.prospects.map(record => record.id === id && inScope(record) ? { ...record, ...patch, updatedAt: new Date().toISOString() } : record) }))
  }

  const acceptIndexed = useCallback((drafts: CaptureDraft[]) => {
    if (!canCreate || !hydrated || !workspaceId || drafts.length === 0) return
    commit(current => mergeResults(current, drafts, workspaceId, currentUserId, snapshotRef.current?.leads || []))
    setView('review'); setSelected([])
    notify('success', `${drafts.length} empresa(s) adicionada(s) à revisão. Confira os dados antes de enviá-las ao CRM.`)
  }, [canCreate, hydrated, workspaceId, currentUserId, commit, notify])

  const recheckRecord = useCallback(async (id: string) => {
    if (!canEdit || !workspaceId) throw new Error('Sem permissão para revisar empresas.')
    const record = stateRef.current.prospects.find(item => item.id === id && item.workspaceId === workspaceId)
    if (!record) throw new Error('Empresa não encontrada neste workspace.')
    if (!canTeamAccessRecord('prospecting', record.createdBy ?? currentUserId)) throw new Error('Sem acesso à ficha desta empresa.')
    if (readPending(record)) throw new Error('Resolva as propostas anteriores antes de investigar novamente.')
    const requestedWorkspace = workspaceId
    const engine = record.rawData.engine as Record<string,unknown> | undefined
    const sourceState = String(record.rawData.state || engine?.uf || 'RS')
    const result = await hostedGarimpo.recheck(workspaceId, {
      company: record.company || record.name, city: record.city, state: sourceState,
      cnpj: record.cnpj, website: record.website, phone: record.phone, address: record.address,
    })
    if (scopeRef.current !== requestedWorkspace) return
    commit(current => ({ ...current, prospects: current.prospects.map(item =>
      item.id === id && item.workspaceId === workspaceId
        ? { ...item, ...stageRecheck(item,result), updatedAt: new Date().toISOString() } : item) }))
    notify('success', 'Revisão concluída. Confira as novas informações antes de aceitar atualizações.')
  }, [canEdit, workspaceId, currentUserId, canTeamAccessRecord, commit, notify])

  const resolveRecordRecheck = useCallback(async (id: string, fields: RecheckField[], syncCrm: boolean) => {
    if (!canEdit || !workspaceId) throw new Error('Sem acesso à revisão desta empresa.')
    const original = stateRef.current.prospects.find(item => item.id === id && item.workspaceId === workspaceId)
    if (!original || !canTeamAccessRecord('prospecting', original.createdBy ?? currentUserId))
      throw new Error('Empresa não encontrada ou sem permissão de revisão.')
    const pending = readPending(original)
    if (!pending) throw new Error('As alterações já foram resolvidas. Atualize a ficha.')
    if (syncCrm) {
      if (!canUpdateCompany || original.status !== 'sent')
        throw new Error('Sem permissão para atualizar esta empresa no CRM.')
      const linkedId = String(original.rawData.hostedCrmCompanyId || '')
      const linked = snapshotRef.current?.companies.find(item =>
        item.workspaceId === workspaceId &&
        ((linkedId && item.id === linkedId) ||
         (digits(original.cnpj).length === 14 && digits(item.cnpj) === digits(original.cnpj))))
      if (!linked) throw new Error('O cadastro principal desta empresa não foi localizado no CRM.')
      const mapped = {
        phone: 'phone', website: 'website', city: 'city', cnpj: 'cnpj',
        legal_name: 'legalName', trade_name: 'name',
      } as const
      type CompanyChange = { phone?: string; website?: string; domain?: string;
        city?: string; cnpj?: string; legalName?: string; name?: string }
      const updates: CompanyChange = {}
      const comparable = (value: string, field: string) =>
        field === 'phone' || field === 'cnpj' ? value.replace(/\D/g,'') : normalize(value)
      const eligible = pending.proposals.filter(proposal => fields.includes(proposal.field)
        && proposal.field in mapped && currentValue(original, proposal.field) === proposal.before)
      if (!eligible.length) throw new Error('Selecione um campo de empresa que possa ser atualizado no CRM.')
      for (const proposal of eligible) {
        const key = mapped[proposal.field as keyof typeof mapped]
        const existing = String(linked[key] || '')
        if (comparable(existing,proposal.field) !== comparable(proposal.before,proposal.field))
          throw new Error(`O campo ${key} foi alterado diretamente no CRM. Confira a divergência antes de substituir.`)
        Object.assign(updates, { [key]: proposal.after })
        if (key === 'website' && publicUrl(proposal.after))
          updates.domain = new URL(publicUrl(proposal.after)!).hostname
      }
      await updateCompany(linked.id, updates)
      if (scopeRef.current !== workspaceId) return
    }
    commit(current => ({ ...current, prospects: current.prospects.map(item => {
      if (item.id !== id || item.workspaceId !== workspaceId
          || !canTeamAccessRecord('prospecting', item.createdBy ?? currentUserId)) return item
      const latest = readPending(item)
      if (!latest || latest.checkedAt !== pending.checkedAt) return item
      return { ...item, ...resolveRecheck(item,fields), updatedAt: new Date().toISOString() }
    }) }))
    notify('success', syncCrm ? 'Atualização aplicada à revisão e ao cadastro da empresa no CRM.'
      : fields.length ? 'Atualizações aceitas na revisão.' : 'Sugestões descartadas; histórico preservado.')
  }, [canEdit,canUpdateCompany,workspaceId,currentUserId,canTeamAccessRecord,commit,notify,updateCompany])

  async function start(event: FormEvent) {
    event.preventDefault()
    if (!canCreate || !hydrated || starting.current || active(job)) return
    starting.current = true; setBusy(true); setError(''); setView('review')
    // Preserve the key when a response is lost, so clicking again cannot queue two jobs.
    searchKey.current ||= createUuid()
    const requestedWorkspace = workspaceId
    try {
      const next = await hostedGarimpo.create(workspaceId, { segment: segment.trim(), city: city.trim(), state: uf, limit: quantity,
        require_phone: phone, require_email: emailOnly, require_observed_location: verifiedLocation,
        minimum_relevance: minRelevance, enrich_websites: sites }, searchKey.current)
      if (scopeRef.current !== requestedWorkspace) return
      searchKey.current = null
      await drive(next)
    } catch (cause) {
      if (scopeRef.current === requestedWorkspace) { setBusy(false); setError(cause instanceof Error ? cause.message : 'Não foi possível iniciar a pesquisa.') }
    } finally { if (scopeRef.current === requestedWorkspace) starting.current = false }
  }

  async function cancel() {
    if (!job || !canCreate) return
    try {
      acceptJob(await hostedGarimpo.cancel(workspaceId,job.id))
      if (scopeRef.current !== workspaceId) return
      execution.current?.abort(); setBusy(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível cancelar.') }
  }

  async function resume() {
    if (!job || busy || starting.current || !canCreate) return
    starting.current = true; setBusy(true)
    try { await drive(await hostedGarimpo.resume(workspaceId,job.id,createUuid())) }
    catch (cause) { if (scopeRef.current === workspaceId) { setBusy(false); setError(cause instanceof Error ? cause.message : 'Não foi possível retomar.') } }
    finally { if (scopeRef.current === workspaceId) starting.current = false }
  }

  async function send() {
    if (!snapshot || !canSend || sending || !approved.length || (opportunity && (!stageId || !canCreateOpportunity))) return
    const requestedWorkspace = workspaceId
    setSending(true); setError('')
    const companies = [...snapshot.companies], leads = [...snapshot.leads]
    let sent = 0
    try {
      await flushProspectingSync(workspaceId)
      for (const prospect of approved) {
        if (scopeRef.current !== requestedWorkspace) break
        let company = companies.find(item => item.id === prospect.rawData.hostedCrmCompanyId)
          || companies.find(item => (digits(prospect.cnpj).length === 14 && digits(item.cnpj) === digits(prospect.cnpj))
            || (!(prospect.cnpj && item.cnpj && digits(prospect.cnpj) !== digits(item.cnpj))
              && normalize(item.name) === normalize(prospect.company) && normalize(item.city) === normalize(prospect.city)
              && ((digits(prospect.phone).length >= 10 && digits(item.phone) === digits(prospect.phone))
                || (publicUrl(prospect.website) && publicUrl(item.website) === publicUrl(prospect.website)))))
        if (!company) {
          company = await createCompany({ name: prospect.company || prospect.name, legalName: prospect.source === 'cnpj' ? String((prospect.rawData.engine as Record<string, unknown> | undefined)?.legalName || '') : '', cnpj: prospect.cnpj,
            website: publicUrl(prospect.website) || '', domain: publicUrl(prospect.website) ? new URL(prospect.website).hostname : '',
            segment: prospect.source === 'cnpj' ? String((prospect.rawData.engine as Record<string, unknown> | undefined)?.mainCnae || 'CNAE cadastral') : String((prospect.rawData.engine as Record<string,unknown> | undefined)?.requestedSegment || ''),
            phone: prospect.phone, city: prospect.city, state: prospect.source === 'cnpj' ? 'RS' : String(prospect.rawData.state || ''), status: 'prospect', leadIds: [] })
          companies.push(company)
        }
        if (scopeRef.current !== requestedWorkspace) break
        const receipt = { ...prospect.rawData, hostedCrmCompanyId: company.id }
        patchRecord(prospect.id,{ rawData: receipt })
        await flushProspectingSync(workspaceId)
        let leadId = String(prospect.rawData.hostedCrmLeadId || '')
        if (opportunity && !leadId) {
          const duplicate = detectProspectDuplicate(prospect, leads)
          leadId = duplicate.level === 'confirmed' ? duplicate.leadId || '' : ''
          if (!leadId) {
            const lead = await createLead({ name: prospect.name, company: company.name, companyId: company.id,
              phone: prospect.phone, email: prospect.email, city: prospect.city, cnpj: prospect.cnpj, website: publicUrl(prospect.website) || '',
              source: prospect.source === 'cnpj' ? 'Garimpo · CNPJ' : 'Garimpo · Google Maps', sourceDetail: prospect.sourceDetail || 'Motor Python hospedado', sourceUrl: evidenceFor(prospect)[0]?.url || '',
              stageId, status: 'active', temperature: 'cold', priority: 'medium', ownerId: null, ownerName: 'Sem responsável',
              value: 0, nextActionAt: null, notes: [prospect.notes, prospect.description, ...evidenceFor(prospect).map(item => `${item.field}: ${item.value} · ${item.url}`)].join('\n'), tags: ['garimpo'] })
            leads.push(lead); leadId = lead.id
          }
        }
        if (scopeRef.current !== requestedWorkspace) break
        patchRecord(prospect.id,{ status: 'sent', sentAt: new Date().toISOString(), rawData: { ...receipt, hostedCrmLeadId: leadId || null } })
        await flushProspectingSync(workspaceId)
        sent++
      }
      if (scopeRef.current === requestedWorkspace) { setSendOpen(false); setSelected([]); setView('sent'); notify('success',`${sent} empresa(s) enviada(s) ao CRM.`) }
    } catch (cause) {
      if (scopeRef.current === requestedWorkspace) setError(`${sent} empresa(s) enviada(s). ${cause instanceof Error ? cause.message : 'Falha ao enviar a próxima empresa.'} Você pode tentar novamente; os vínculos salvos serão reutilizados.`)
    } finally { if (scopeRef.current === requestedWorkspace) setSending(false) }
  }

  return <div className="gh-page">
    <header className="gh-header"><div><span className="gh-eyebrow">PROSPECÇÃO COMERCIAL</span><h1>Garimpo</h1><p>Encontre empresas, confira os contatos e escolha quem entra no seu CRM.</p></div>
      <div className={`gh-status gh-status--${availability}`} role="status"><span />{availability === 'checking' ? 'Verificando motor…' : availability === 'ready' ? 'Motor hospedado disponível' : 'Motor indisponível'}<button onClick={() => void check()} aria-label="Verificar conexão novamente">↻</button></div></header>
    {(connectionError || error || syncError) && <div className="gh-alert" role="alert">{[connectionError,error,syncError].filter(Boolean).map((message,index) => <p key={index}>{message}</p>)}</div>}
    <div className="gh-layout">
      <aside><form className="gh-card gh-search" onSubmit={start}>
        <div className="gh-section-heading"><span>01</span><div><h2>Nova pesquisa</h2><p>Comece pelo segmento e pela cidade.</p></div></div>
        <label>O que você procura?<input required maxLength={120} value={segment} onChange={event => { setSegment(event.target.value); searchKey.current=null }} placeholder="Ex.: barbearias, clínicas odontológicas" disabled={active(job) || busy} /></label>
        <div className="gh-location"><label>Cidade<input required maxLength={100} value={city} onChange={event => { setCity(event.target.value); searchKey.current=null }} disabled={active(job) || busy} /></label><label>UF<select aria-label="UF" value={uf} onChange={event => { setUf(event.target.value); searchKey.current=null }} disabled={active(job) || busy}>{states.map(item => <option key={item}>{item}</option>)}</select></label></div>
        <label>Até quantas empresas?<input type="number" min={1} max={100} required value={quantity} onChange={event => { setQuantity(Number(event.target.value)); searchKey.current=null }} disabled={active(job) || busy} /></label>
        <div className="gh-options"><label><input type="checkbox" checked={phone} onChange={event => { setPhone(event.target.checked); searchKey.current=null }} disabled={active(job) || busy} />Exigir telefone publicado</label><label><input type="checkbox" checked={sites} onChange={event => { setSites(event.target.checked); searchKey.current=null }} disabled={active(job) || busy} />Consultar também os sites das empresas</label></div>
        <details className="gh-search-advanced"><summary>Mais filtros de descoberta</summary><div>
          <label className="gh-check"><input type="checkbox" checked={emailOnly} onChange={event => { setEmailOnly(event.target.checked); searchKey.current=null }} disabled={active(job) || busy} />Exigir e-mail publicado</label>
          <label className="gh-check"><input type="checkbox" checked={verifiedLocation} onChange={event => { setVerifiedLocation(event.target.checked); searchKey.current=null }} disabled={active(job) || busy} />Exigir município observado na fonte</label>
          <label>Relevância mínima (0–100)
            <input type="number" min={0} max={100} step={5} value={minRelevance}
              onChange={event => { setMinRelevance(Math.max(0,Math.min(100,Number(event.target.value) || 0))); searchKey.current=null }}
              disabled={active(job) || busy} />
          </label>
          <p className="gh-help">A relevância é calculada por regras. Um limite maior e contatos obrigatórios podem reduzir o resultado. Empresas sem contato poderão precisar de nova investigação.</p>
        </div></details>
        <p className="gh-source"><ShieldCheck size={16} />Google Maps e sites públicos. A busca amplia termos e áreas dentro do município.</p>
        <button className="gh-primary" disabled={!canCreate || availability !== 'ready' || !hydrated || busy || active(job)} type="submit">{busy ? <Loader2 size={17} className="gh-spin" /> : <Search size={17} />}{busy ? 'Pesquisa em andamento' : 'Pesquisar empresas'}</button>
        <p className="gh-help">Os contatos precisam de revisão. A fonte pode retornar menos empresas que o limite solicitado.</p>
      </form>
      {jobs.length > 0 && <section className="gh-card gh-history"><h2>Pesquisas recentes</h2>{jobs.slice(0,6).map(item => <button key={item.id} aria-current={item.id === job?.id} disabled={busy || sending} onClick={() => { void hostedGarimpo.get(workspaceId,item.id).then(full => { acceptJob(full); if (active(full) && canCreate) void drive(full) }).catch(cause => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a pesquisa.')) }}><strong>{item.request.segment}</strong><span>{item.request.city}, {item.request.state} · {item.result_count ?? item.results.length} resultados</span><small>{new Date(item.created_at).toLocaleString('pt-BR')} · {labels[item.status]}</small></button>)}</section>}</aside>
      <main className="gh-main">
        <IndexExplorer workspaceId={workspaceId} canImport={canCreate && hydrated} onImport={acceptIndexed} />
        <section className="gh-card gh-progress" aria-live="polite"><div className="gh-progress-title"><div><span className="gh-eyebrow">ACOMPANHE A PESQUISA</span><h2>{job ? labels[job.status] : 'Sua próxima oportunidade começa aqui'}</h2>{job && <p><MapPin size={14} />{job.request.segment} · {job.request.city}, {job.request.state}</p>}</div>
          <div className="gh-actions">{active(job) && canCreate && <button className="gh-secondary" onClick={() => void cancel()}>Cancelar</button>}{job?.can_resume && canCreate && <button className="gh-secondary" disabled={busy} onClick={() => void resume()}>Retomar pesquisa</button>}{active(job) && !busy && canCreate && <button className="gh-secondary" onClick={() => job && void drive(job)}>Reconectar pesquisa</button>}</div></div>
          {busy && <div className="gh-loading"><i /></div>}
          <div className="gh-metrics"><div><strong>{job?.discovered ?? '—'}</strong><span>Descobertas</span></div><div><strong>{job?.processed ?? '—'}</strong><span>Processadas</span></div><div><strong>{job?.results.length ?? '—'}</strong><span>Com os critérios pedidos</span></div></div>
          {job?.error && <p className="gh-job-error">{job.error}</p>}{job?.warnings?.map((warning,index) => <p className="gh-help" key={index}>{warning}</p>)}
          {job && <p className="gh-help">{job.partial ? 'Os resultados são parciais e foram preservados. ' : ''}{job.metrics?.first_result_ms ? `Primeiro resultado em ${(job.metrics.first_result_ms / 1000).toFixed(1)} s. ` : ''}{active(job) ? 'A coleta e o enriquecimento continuam enquanto a pesquisa está ativa.' : 'Consulte a fonte e a data de cada contato na revisão.'}</p>}
        </section>
        <section className="gh-card gh-review"><div className="gh-review-heading"><div><span className="gh-eyebrow">SUA LISTA DE PROSPECÇÃO</span><h2>Empresas para revisar</h2></div><div className="gh-actions"><button className="gh-secondary" disabled={!canEdit || !chosen.some(record => !['sent','discarded'].includes(record.status))} onClick={() => chosen.filter(record => !['sent','discarded'].includes(record.status)).forEach(record => patchRecord(record.id,{status:'approved'}))}><Check size={15} />Aprovar selecionadas</button><button className="gh-primary" disabled={!canSend || !approved.length || sending || Boolean(syncError)} onClick={() => { setStageId(snapshot?.stages[0]?.id || ''); setSendOpen(true) }}>Enviar ao CRM ({approved.length})<ArrowRight size={15} /></button></div></div>
          <div className="gh-tools"><nav aria-label="Etapas da revisão">{([['review','Revisar'],['sent','No CRM'],['discarded','Descartadas'],['all','Todas']] as const).map(([value,label]) => <button key={value} aria-pressed={view === value} onClick={() => { setView(value); setSelected([]) }}>{label}<span>{all.filter(record => value === 'all' || (value === 'review' ? !['sent','discarded'].includes(record.status) : record.status === value)).length}</span></button>)}</nav><input type="search" aria-label="Filtrar empresas" placeholder="Nome, CNPJ, cidade, contato…" value={filter} onChange={event => setFilter(event.target.value)} /></div>
          <details className="gh-review-more"><summary>Mais filtros da revisão</summary><div>
            <label>Origem<select value={sourceFilter} onChange={e => setSourceFilter(e.target.value as typeof sourceFilter)}>
              <option value="all">Todas as origens</option><option value="cnpj">Base CNPJ</option><option value="maps">Busca Maps</option>
            </select></label>
            <label>Contatos<select value={contactFilter} onChange={e => setContactFilter(e.target.value as typeof contactFilter)}>
              <option value="all">Com e sem contatos</option><option value="with">Com telefone ou e-mail</option><option value="without">Sem contatos publicados</option>
            </select></label>
            <label className="gh-check"><input type="checkbox" checked={recheckedOnly} onChange={e => setRecheckedOnly(e.target.checked)} />Somente já investigadas novamente</label>
          </div></details>
          {visible.length ? <div className="gh-table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Selecionar todas as empresas visíveis" checked={visible.length > 0 && visible.every(record => selected.includes(record.id))} onChange={event => setSelected(event.target.checked ? visible.map(record => record.id) : [])} /></th><th>Empresa</th><th>Contato publicado</th><th>Situação</th><th><span className="gh-sr">Ações</span></th></tr></thead><tbody>{visible.map(record => <RecordRows key={record.id} record={record} selected={selected.includes(record.id)} onSelect={checked => setSelected(current => checked ? [...new Set([...current,record.id])] : current.filter(id => id !== record.id))} expanded={expanded === record.id} onExpand={() => setExpanded(expanded === record.id ? null : record.id)} canEdit={canEdit} onPatch={patch => patchRecord(record.id,patch)}
            onRecheck={() => recheckRecord(record.id)}
            onResolve={(fields,syncCrm) => resolveRecordRecheck(record.id,fields,syncCrm)}
            canSyncCrm={canUpdateCompany && record.status === 'sent'
              && Boolean(snapshot?.companies.some(item => item.workspaceId === workspaceId
                && (item.id === record.rawData.hostedCrmCompanyId
                  || (digits(record.cnpj).length === 14 && digits(item.cnpj) === digits(record.cnpj)))))} />)}</tbody></table></div>
            : <div className="gh-empty"><Search size={29} /><h3>{busy ? 'Buscando as primeiras empresas…' : filter ? 'Nenhuma empresa corresponde ao filtro.' : view === 'review' ? 'As empresas encontradas aparecerão aqui.' : 'Nenhuma empresa nesta etapa.'}</h3><p>{busy ? 'Os resultados aparecem durante a coleta.' : 'Revise os dados, aprove as empresas e envie sua seleção ao CRM.'}</p></div>}
        </section>
      </main>
    </div>
    <Modal open={sendOpen} title={`Enviar ${approved.length} empresa(s) ao CRM`} onClose={() => { if (!sending) setSendOpen(false) }} footer={<div className="gh-actions"><button className="gh-secondary" disabled={sending} onClick={() => setSendOpen(false)}>Cancelar</button><button className="gh-primary" disabled={sending || (opportunity && !stageId)} onClick={() => void send()}>{sending ? 'Enviando…' : 'Confirmar envio'}</button></div>}><div className="gh-page gh-send-content"><p>As empresas aprovadas entrarão na sua base de contatos. Empresas já vinculadas serão reutilizadas.</p><label className="gh-check"><input type="checkbox" checked={opportunity} disabled={sending || !canCreateOpportunity} onChange={event => setOpportunity(event.target.checked)} />Criar também uma oportunidade no funil</label>{opportunity && <label>Etapa inicial<select aria-label="Etapa inicial" value={stageId} disabled={sending} onChange={event => setStageId(event.target.value)}>{snapshot?.stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>}</div></Modal>
    <footer className="gh-footer">Motor Python 0.6 + Índice CNPJ/RS · Confirme os dados antes da abordagem.<button onClick={() => navigate('leads')}>Abrir base do CRM <ArrowRight size={13} /></button></footer>
  </div>
}

function RecordRows({ record, selected, onSelect, expanded, onExpand, canEdit, onPatch, onRecheck, onResolve, canSyncCrm }: {
  record: ProspectRecord; selected: boolean; onSelect(value: boolean): void; expanded: boolean;
  onExpand(): void; canEdit: boolean; onPatch(patch: Partial<ProspectRecord>): void;
  onRecheck: () => Promise<void>; onResolve: (fields: RecheckField[], syncCrm: boolean) => Promise<void>;
  canSyncCrm: boolean
}) {
  const evidence = evidenceFor(record)
  const status = { new:'Revisar', analyzing:'Revisar', review:'Revisar', approved:'Aprovada', discarded:'Descartada', sent:'No CRM' }[record.status]
  return <><tr className={selected ? 'gh-selected' : ''}><td><input type="checkbox" aria-label={`Selecionar ${record.company}`} checked={selected} onChange={event => onSelect(event.target.checked)} /></td><td><strong>{record.company || record.name}</strong><span>{record.city || 'Cidade a confirmar'}</span>{record.duplicateLevel !== 'none' && <small>Possível vínculo já existente no CRM</small>}</td><td>{record.phone ? <a href={`tel:${record.phone.replace(/[^+\d]/g,'')}`}>{record.phone}</a> : <span>Sem telefone publicado</span>}{record.email && <span>{record.email}</span>}{publicUrl(record.website) && <a href={publicUrl(record.website)!} target="_blank" rel="noopener noreferrer">Site da empresa <ExternalLink size={11} /></a>}</td><td><span className={`gh-badge gh-badge--${record.status}`}>{status}</span></td><td><button className="gh-icon" onClick={onExpand} aria-expanded={expanded} aria-label={`Conferir dados e fontes de ${record.company}`}><ChevronDown size={18} /></button></td></tr>
    {expanded && <tr><td colSpan={5}><div className="gh-detail"><div className="gh-edit-fields">{(['company','phone','email','address','website','notes'] as const).map(field => <label key={field}>{{company:'Empresa',phone:'Telefone',email:'E-mail',address:'Endereço',website:'Site',notes:'Suas observações'}[field]}<input key={`${record.id}:${field}:${record[field]}`} defaultValue={record[field]} disabled={!canEdit || record.status === 'sent'} onBlur={event => { if (event.target.value !== record[field]) onPatch({ [field]: event.target.value }) }} /></label>)}</div><h3>Fontes dos dados</h3>{evidence.length ? <ul>{evidence.map((item,index) => <li key={index}><strong>{item.field}</strong>: {item.value} <a href={item.url} target="_blank" rel="noopener noreferrer">Conferir fonte <ExternalLink size={11} /></a>{item.observed_at && <small>Consultado em {new Date(item.observed_at).toLocaleString('pt-BR')}</small>}</li>)}</ul> : <p>Este registro não possui evidências detalhadas. Revise os dados antes de aprovar.</p>}<div className="gh-actions">{canEdit && !['sent','discarded'].includes(record.status) && <><button className="gh-primary" onClick={() => onPatch({status:record.status === 'approved' ? 'review' : 'approved'})}>{record.status === 'approved' ? 'Voltar para revisão' : 'Aprovar empresa'}</button><button className="gh-secondary" onClick={() => onPatch({status:'discarded'})}>Descartar</button></>}{canEdit && record.status === 'discarded' && <button className="gh-secondary" onClick={() => onPatch({status:'review'})}>Restaurar para revisão</button>}</div>
    <RecheckPanel record={record} canEdit={canEdit} canSyncCrm={canSyncCrm} onRecheck={onRecheck} onResolve={onResolve} />
    </div></td></tr>}</>
}
