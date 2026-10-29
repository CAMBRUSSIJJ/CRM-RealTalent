import { copyTextToClipboard, openExternalUrl } from '../../lib/browser-actions'
import {
  AlertTriangle, ArrowRight, BadgeCheck, Ban, Building2, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed,
  Clipboard, ClipboardCheck, ClipboardList, Database, Download, ExternalLink, FileJson, Filter, Globe2, History, Inbox, AtSign, KanbanSquare, Link2,
  ListFilter, LoaderCircle, MapPinned, Merge, MoreHorizontal, Pause, Phone, Play, Plus, RefreshCw, Search, Send, ShieldCheck, ShieldX, SlidersHorizontal,
  Sparkles, Target, Trash2, Upload, UserRoundCheck, UsersRound, X, Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useAppActions, useAppNavigation, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { NativeSelectionSelect, EntityPicker, OwnerPicker, FilterSelection, SelectionCheckbox, SelectionSelect, SelectionToolbar } from '../../components/selection'
import { EmptyState } from '../../components/ui/empty-state'
import { Modal } from '../../components/ui/modal'
import { StatusPill } from '../../components/ui/status-pill'
import { WorkspaceAdvancedFilterDrawer, WorkspaceCommandBar as FilterWorkspaceCommandBar, WorkspaceFilterMenu, type WorkspaceFilterField } from '../../components/workspace/workspace-filter-system'
import { WorkspacePageHeader, WorkspaceSummaryMetric, WorkspaceSummaryStrip, WorkspaceViewStrip } from '../../components/workspace/workspace-shell'
import type { ActivityType, CompanyRecord, LeadPriority, LeadTemperature, WorkspaceMember } from '../../domain/types'
import { formatDateTime } from '../../domain/formatters'
import { APP_VERSION } from '../../lib/app-version'
import {
  EXTENSION_MESSAGE_TYPE, appendHistory, buildBrowserCaptureBookmarklet, buildProspectingSearchUrl, captureDraftFromBrowserPayload, clearExtensionInbox, createProspect, parseProspectFile,
  parseQuickCaptureLines, parseUniversalCaptureInput, prospectCompleteness, prospectSourceLabels, prospectStatusLabels, readExtensionInbox,
  readProspectingState, readRemoteProspectingState, refreshProspectAnalysis, writeProspectingState, cacheProspectingStateLocally, deleteProspectingRecords,
  type CaptureDraft, type ProspectRecord, type ProspectSource, type ProspectStatus, type ProspectingState,
} from '../../services/prospecting-workspace'
import { recordLocalIntegrationEvent } from '../../services/integration-framework'
import {
  ProspectingProviderError, getProspectingProviderDiagnostics, isDirectProspectingSource, runProspectingProviderSearch,
  type ProspectingProviderDiagnostics,
} from '../../services/prospecting-provider-gateway'
import {
  buildProspectingDataLayerEnvelope, prospectDataQuality, prospectReadinessCounts, sortProspectsForGuidedReview,
  type ProspectReadiness,
} from '../../services/prospecting-data-layer'
import { runProspectingSearchAutomation, type ProspectingSearchAutomationProgress } from '../../services/prospecting-search-automation'
import {
  acknowledgeProspectingReviewBatch, controlProspectingAgentJob, createProspectingAgentCampaign, createProspectingAgentJob, existingProspectingIdentityKeys, getProspectingReviewBatch, retryProspectingEnrichmentTask,
  getProspectingAgentHealth, listProspectingAgentJobs, previewProspectingTerritory, type ProspectingAgentCadence, type ProspectingAgentHealth, type ProspectingAgentJob,
  type ProspectingAreaMode, type ProspectingCategoryMode, type ProspectingEnrichmentTask, type ProspectingEnrichmentTaskId, type ProspectingGeoPoint, type ProspectingSearchMode, type ProspectingTargetMode, type ProspectingTerritoryPreview,
} from '../../services/prospecting-linux-agent'
import { ProspectingEvidenceExplorer, type ProspectingInspectorMode } from './prospecting-evidence-explorer'
import { RawSourceReview, rawSourceReviewCount } from './prospecting-raw-source-review'
import { usePreferences } from '../settings/preferences-context'
import { useAuth } from '../auth/auth-context'
import { requireExportApproval } from '../../services/team-governance'
import { buildProspectingIcp, prospectingIcpSummary, rankProspects } from '../../services/prospecting-intelligence'
import { ProspectingRedesignSearch, ProspectingRedesignShell } from './prospecting-redesign'
import { ProspectingG1G2Panel } from './prospecting-g1g2-panel'

 type ProspectingTab = 'search' | 'local' | 'results' | 'history'
 type ReviewMode = 'list' | 'guided' | 'sources'
 type ReviewScope = 'exceptions' | 'ready' | 'all'
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
const crmDigits = (value: string) => value.replace(/\D/g, '')
const crmDomain = (value: string) => value.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].toLocaleLowerCase('pt-BR')
const rawText = (record: Record<string, unknown>, ...keys: string[]) => { for (const key of keys) { const value = record[key]; if (typeof value === 'string' && value.trim()) return value.trim() } return '' }
const rawNumber = (record: Record<string, unknown>, ...keys: string[]) => { for (const key of keys) { const value = Number(record[key]); if (Number.isFinite(value)) return value } return null }
const prospectGeoPoint = (prospect: ProspectRecord): ProspectingGeoPoint | null => { const lat = rawNumber(prospect.rawData, 'latitude', 'lat'); const lon = rawNumber(prospect.rawData, 'longitude', 'lon', 'lng'); return lat !== null && lon !== null ? { lat, lon } : null }
const prospectPlaceType = (prospect: ProspectRecord) => rawText(prospect.rawData, 'placeType') || (prospectGeoPoint(prospect) ? 'physical_place' : 'service_business')
const prospectPlaceConfidence = (prospect: ProspectRecord) => Math.max(0, Math.min(100, rawNumber(prospect.rawData, 'placeConfidence') ?? (prospectGeoPoint(prospect) ? 100 : 55)))
const prospectOriginLabel = (prospect: ProspectRecord) => {
  const provider = rawText(prospect.rawData, 'provider').toLocaleLowerCase('pt-BR')
  if (provider.includes('openstreetmap') || provider.startsWith('osm') || rawText(prospect.rawData, 'osmId')) return 'OpenStreetMap'
  if (provider.startsWith('web')) return 'Web pública'
  if (prospect.source === 'extension') return 'RT Capture Browser'
  return prospectSourceLabels[prospect.source]
}

const prospectIsAutoValidatable = (prospect: ProspectRecord) => {
  const quality = prospectDataQuality(prospect)
  const placeType = prospectPlaceType(prospect)
  return quality.readiness === 'ready'
    && prospect.duplicateLevel === 'none'
    && prospectPlaceConfidence(prospect) >= 65
    && Boolean(prospectGeoPoint(prospect))
    && !['content', 'directory', 'web_document', 'unknown'].includes(placeType)
}

const prospectAttentionReasons = (prospect: ProspectRecord) => {
  const quality = prospectDataQuality(prospect)
  const reasons: string[] = []
  const placeType = prospectPlaceType(prospect)
  if (['content', 'directory', 'web_document', 'unknown'].includes(placeType)) reasons.push('Confirmar se é uma empresa/local real')
  if (!prospectGeoPoint(prospect)) reasons.push('Coordenadas não confirmadas no território')
  if (prospectPlaceConfidence(prospect) < 65) reasons.push('Baixa confiança territorial')
  if (prospect.duplicateLevel === 'possible') reasons.push('Possível duplicidade')
  if (prospect.duplicateLevel === 'confirmed') reasons.push('Duplicidade confirmada')
  if (!prospect.phone && !prospect.email && !prospect.website) reasons.push('Sem contato utilizável')
  for (const blocker of quality.blockers) if (!reasons.includes(blocker)) reasons.push(blocker)
  return reasons.slice(0, 4)
}

interface SendOptions {
  createOpportunity: boolean
  stageId: string
  ownerId: string
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
  const { snapshot, currentWorkspace, currentUserId, repositoryMode, teamAccess, canTeamAccess, canTeamAccessRecord } = useAppWorkspace()
  const { setRoute, routeContext, clearRouteContext } = useAppNavigation()
  const { notify, confirmAction } = useAppUi()
  const { createCompany, updateCompany, createContact, updateContact, createLead, updateLead, createActivity, listWorkspaceMembers } = useAppActions()
  const { preferences } = usePreferences()
  const { user } = useAuth()
  const workspaceId = currentWorkspace?.id ?? ''
  const canProspectingCreate = canTeamAccess('create','prospecting')
  const canProspectingEdit = canTeamAccess('edit','prospecting')
  const canProspectingDelete = canTeamAccess('delete','prospecting')
  const canProspectingExport = canTeamAccess('export','prospecting')
  const canProspectingAssign = canTeamAccess('assign','prospecting')
  const canWrite = canProspectingCreate || canProspectingEdit
  const prospectInScope = useCallback((prospect: ProspectRecord) => canTeamAccessRecord('prospecting', prospect.createdBy ?? currentUserId), [canTeamAccessRecord, currentUserId])
  const [state, setState] = useState<ProspectingState>(initialState)
  const [tab, setTab] = useState<ProspectingTab>('search')
  const [source, setSource] = useState<ProspectSource>('maps')
  const [segment, setSegment] = useState('')
  const [city, setCity] = useState('')
  const [query, setQuery] = useState('')
  const [quantity, setQuantity] = useState(40)
  const [quickCapture, setQuickCapture] = useState('')
  const [universalCapture, setUniversalCapture] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ProspectStatus>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | ProspectSource>('all')
  const [qualityFilter, setQualityFilter] = useState<'all' | ProspectReadiness>('all')
  const [duplicateFilter, setDuplicateFilter] = useState<'all' | ProspectRecord['duplicateLevel']>('all')
  const [reviewMode, setReviewMode] = useState<ReviewMode>('list')
  const [reviewScope, setReviewScope] = useState<ReviewScope>('all')
  const [showTechnical, setShowTechnical] = useState(false)
  const [inspectorMode, setInspectorMode] = useState<ProspectingInspectorMode | null>(null)
  const [bulkRetryBusy, setBulkRetryBusy] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [sendIds, setSendIds] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [providerBusy, setProviderBusy] = useState(false)
  const [automationProgress, setAutomationProgress] = useState<ProspectingSearchAutomationProgress | null>(null)
  const automationAbortRef = useRef<AbortController | null>(null)
  const [agentHealth, setAgentHealth] = useState<ProspectingAgentHealth | null>(null)
  const [agentJob, setAgentJob] = useState<ProspectingAgentJob | null>(null)
  const progressiveReviewNoticeRef = useRef<Set<string>>(new Set())
  const [agentCadence, setAgentCadence] = useState<ProspectingAgentCadence>('off')
  const [areaMode, setAreaMode] = useState<ProspectingAreaMode>('radius')
  const [radiusKm, setRadiusKm] = useState(15)
  const [searchMode, setSearchMode] = useState<ProspectingSearchMode>('fast')
  const [targetMode, setTargetMode] = useState<ProspectingTargetMode>('quantity')
  const [categoryMode, setCategoryMode] = useState<ProspectingCategoryMode>('exact')
  const [mapPolygon, setMapPolygon] = useState<ProspectingGeoPoint[]>([])
  const [mapPreview, setMapPreview] = useState<ProspectingTerritoryPreview | null>(null)
  const [searchCenter, setSearchCenter] = useState<ProspectingGeoPoint | null>(null)
  const [mapPreviewBusy, setMapPreviewBusy] = useState(false)
  const [agentBusy, setAgentBusy] = useState(false)
  const [providerDiagnostics, setProviderDiagnostics] = useState<ProspectingProviderDiagnostics | null>(null)
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!workspaceId) { setWorkspaceMembers([]); return }
    let cancelled = false
    void listWorkspaceMembers().then((members) => { if (!cancelled) setWorkspaceMembers(members) }).catch(() => { if (!cancelled) setWorkspaceMembers([]) })
    return () => { cancelled = true }
  }, [listWorkspaceMembers, workspaceId])

  useEffect(() => {
    if (!workspaceId) { setState(initialState); return }
    const local = readProspectingState(workspaceId)
    const scopedLocal = { ...local, prospects: local.prospects.filter(prospectInScope) }
    setState(scopedLocal)
    let cancelled = false
    void readRemoteProspectingState(workspaceId).then((remote) => {
      if (cancelled || !remote || (!remote.prospects.length && !remote.history.length)) return
      const scopedRemote = { ...remote, prospects: remote.prospects.filter(prospectInScope), lastExtensionSyncAt: local.lastExtensionSyncAt,
        rawSourceDecisions: readProspectingState(workspaceId).rawSourceDecisions || local.rawSourceDecisions || {} }
      setState(scopedRemote)
      cacheProspectingStateLocally(workspaceId, scopedRemote)
    })
    setSelectedIds(new Set())
    return () => { cancelled = true }
  }, [canWrite, prospectInScope, workspaceId])

  const refreshProviderDiagnostics = useCallback(async () => {
    if (!workspaceId) { setProviderDiagnostics(null); return }
    const diagnostics = await getProspectingProviderDiagnostics(workspaceId)
    setProviderDiagnostics(diagnostics)
  }, [workspaceId])

  useEffect(() => { void refreshProviderDiagnostics() }, [refreshProviderDiagnostics])

  const commit = useCallback((updater: (current: ProspectingState) => ProspectingState) => {
    setState((current) => {
      if (!canWrite) return current
      const next = updater(current)
      if (workspaceId) writeProspectingState(workspaceId, next)
      return next
    })
  }, [canWrite, workspaceId])

  const importDrafts = useCallback((drafts: CaptureDraft[], fallbackSource: ProspectSource, action: 'capture' | 'import', detail: string, limit = Math.max(1, quantity), autoAnalyze = false, recordHistory = true) => {
    if (!canWrite || !workspaceId || !drafts.length) return 0
    const leads = snapshot?.leads ?? []
    const existingProspects = [...state.prospects]
    const existingKeys = new Map<string, ProspectRecord>()
    existingProspects.forEach((prospect) => prospectKey(prospect).forEach((key) => existingKeys.set(key, prospect)))
    const newProspects: ProspectRecord[] = []
    const enriched = new Map<string, ProspectRecord>()
    let skipped = 0
    for (const draft of drafts.slice(0, Math.max(1, limit))) {
      let incoming = createProspect(workspaceId, draft, fallbackSource, leads, currentUserId)
      if (autoAnalyze) incoming = refreshProspectAnalysis(incoming, leads)
      const match = prospectKey(incoming).map((key) => existingKeys.get(key)).find(Boolean)
      if (match && action === 'import') {
        const take = (next: string, current: string) => next.trim() || current
        const merged: ProspectRecord = refreshProspectAnalysis({
          ...match,
          name: take(incoming.name === 'Lead sem nome' ? '' : incoming.name, match.name),
          company: take(incoming.company === 'Lead sem nome' ? '' : incoming.company, match.company),
          phone: take(incoming.phone, match.phone), email: take(incoming.email, match.email), city: take(incoming.city, match.city), address: take(incoming.address, match.address),
          cnpj: take(incoming.cnpj, match.cnpj), instagram: take(incoming.instagram, match.instagram), website: take(incoming.website, match.website), bookingUrl: take(incoming.bookingUrl, match.bookingUrl),
          systemName: take(incoming.systemName, match.systemName), description: take(incoming.description, match.description), notes: take(incoming.notes, match.notes),
          followers: incoming.followers ?? match.followers, sourceDetail: take(incoming.sourceDetail, match.sourceDetail),
          rawData: { ...match.rawData, ...incoming.rawData, dataLayerImportedAt: new Date().toISOString() },
          updatedAt: new Date().toISOString(),
        }, leads)
        enriched.set(match.id, merged)
        prospectKey(merged).forEach((key) => existingKeys.set(key, merged))
        continue
      }
      if (match) { skipped += 1; continue }
      prospectKey(incoming).forEach((key) => existingKeys.set(key, incoming)); newProspects.push(incoming)
    }
    const processed = newProspects.length + enriched.size
    if (!processed) return 0
    commit((current) => {
      const prospects = current.prospects.map((item) => enriched.get(item.id) ?? item)
      let next = { ...current, prospects: [...newProspects, ...prospects] }
      if (recordHistory) next = appendHistory(next, workspaceId, { action, title: action === 'import' ? 'Arquivo importado / enriquecido' : 'Empresas capturadas', description: `${detail}${enriched.size ? ` · ${enriched.size} atualizado(s)` : ''}${skipped ? ` · ${skipped} repetido(s) ignorado(s)` : ''}`, count: processed })
      return next
    })
    return processed
  }, [canWrite, commit, currentUserId, quantity, snapshot?.leads, state.prospects, workspaceId])

  const importProgressiveAgentReview = useCallback(async (job: ProspectingAgentJob): Promise<ProspectingAgentJob> => {
    if (!workspaceId || !canWrite || !job.reviewStream || job.reviewStream.revision <= job.reviewStream.acknowledgedRevision) return job
    let current = job
    let afterRevision = job.reviewStream.acknowledgedRevision
    let totalImported = 0
    for (let page = 0; page < 4; page += 1) {
      const batch = await getProspectingReviewBatch(job.id, afterRevision, 50)
      if (!batch.entries.length) break
      totalImported += importDrafts(batch.entries.map((entry) => ({ ...entry, agentJobId: job.id })), 'manual', 'import', `Revisão progressiva · ${job.input.segment}`, batch.entries.length, true, false)
      current = await acknowledgeProspectingReviewBatch(job.id, batch.revision)
      afterRevision = batch.revision
      if (!batch.hasMore) break
    }
    if (totalImported > 0 && !progressiveReviewNoticeRef.current.has(job.id)) {
      progressiveReviewNoticeRef.current.add(job.id)
      notify('success', `Revisão progressiva ativa: ${totalImported} empresa(s) pronta(s) já chegaram enquanto o Garimpo continua.`)
    }
    return current
  }, [canWrite, importDrafts, notify, workspaceId])

  const importCompletedAgentJob = useCallback(async (job: ProspectingAgentJob) => {
    if (!workspaceId || !canWrite || job.clientImportedAt || !['completed', 'cancelled'].includes(job.status) || !job.results.length) return
    // O fechamento também recupera candidatos prontos que não chegaram à fila progressiva.
    // A ação capture ignora identidades já existentes e preserva edições/decisões humanas.
    const missing = job.results.map((entry) => ({ ...entry, agentJobId: job.id }))
    const added = missing.length ? importDrafts(missing, 'manual', 'capture', `Prospecting Agent Linux · fechamento · ${job.stats.unique} único(s) · ${job.stats.websitesVisited} site(s) visitado(s)`, missing.length, true) : 0
    try { await controlProspectingAgentJob(job.id, 'imported') } catch { /* mantém dedupe local como proteção */ }
    setAgentJob((current) => current?.id === job.id ? { ...job, clientImportedAt: new Date().toISOString() } : current)
    if (added) notify('success', `${added} empresa(s) restantes do Agent Linux foram enviadas para revisão.`)
  }, [canWrite, importDrafts, notify, workspaceId])

  const refreshAgent = useCallback(async () => {
    const health = await getProspectingAgentHealth()
    setAgentHealth(health)
    if (!health || !workspaceId) { setAgentJob(null); return }
    try {
      const jobs = await listProspectingAgentJobs(workspaceId)
      const synchronized = new Map<string, ProspectingAgentJob>()
      for (const job of jobs.filter((item) => item.reviewStream && item.reviewStream.revision > item.reviewStream.acknowledgedRevision).slice(0, 4)) {
        try { synchronized.set(job.id, await importProgressiveAgentReview(job)) } catch { synchronized.set(job.id, job) }
      }
      const effectiveJobs = jobs.map((job) => synchronized.get(job.id) ?? job)
      const active = effectiveJobs.find((job) => ['queued', 'running', 'paused'].includes(job.status))
        ?? effectiveJobs.find((job) => !job.clientImportedAt && ['completed', 'cancelled'].includes(job.status))
        ?? effectiveJobs[0]
        ?? null
      setAgentJob(active)
      const completed = effectiveJobs.filter((job) => !job.clientImportedAt && ['completed', 'cancelled'].includes(job.status) && job.results.length)
      for (const job of completed.slice(0, 3)) await importCompletedAgentJob(job)
    } catch { setAgentJob(null) }
  }, [importCompletedAgentJob, importProgressiveAgentReview, workspaceId])



  const retryEnrichmentTask = useCallback(async (candidateId: string, taskId: ProspectingEnrichmentTaskId) => {
    if (!agentJob || agentBusy) return
    setAgentBusy(true)
    try {
      const job = await retryProspectingEnrichmentTask(agentJob.id, candidateId, taskId)
      setAgentJob(job)
      const candidate = job.results.find((item) => item.candidateId === candidateId)
      const task = candidate?.enrichmentTasks?.[taskId]
      if (candidate) importDrafts([{ ...candidate, agentJobId: agentJob.id }], 'manual', 'import', `Enrichment reprocessado · ${taskId}`, 1, true)
      if (task?.status === 'completed') notify('success', `${taskId === 'website' ? 'Website' : taskId === 'contacts' ? 'Contatos' : taskId === 'cnpj' ? 'CNPJ' : 'Redes'} reprocessado com sucesso.`)
      else notify('info', task?.message || 'Etapa reprocessada; revise o resultado.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível reprocessar esta etapa.') }
    finally { setAgentBusy(false) }
  }, [agentBusy, agentJob, importDrafts, notify])

  // Uma única consulta por vez. Não manter polling contínuo quando o navegador está em segundo plano.
  const refreshAgentInFlight = useRef(false)
  useEffect(() => {
    let cancelled = false
    const refreshVisibleAgent = async () => {
      if (cancelled || document.visibilityState === 'hidden' || refreshAgentInFlight.current) return
      refreshAgentInFlight.current = true
      try { await refreshAgent() } finally { refreshAgentInFlight.current = false }
    }
    void refreshVisibleAgent()
    const active = Boolean(agentJob && ['queued', 'running', 'paused'].includes(agentJob.status))
    const timer = window.setInterval(() => { void refreshVisibleAgent() }, active ? 4000 : 20000)
    const onVisibility = () => { if (document.visibilityState === 'visible') void refreshVisibleAgent() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { cancelled = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility) }
  }, [agentJob?.status, refreshAgent])

  const resetProspectingSearch = () => {
    setTab('search')
    setSegment('')
    setCity('')
    setQuery('')
    setQuantity(40)
    setAreaMode('radius')
    setRadiusKm(15)
    setSearchMode('fast')
    setTargetMode('quantity')
    setCategoryMode('exact')
    setMapPreview(null)
    setSearchCenter(null)
    setMapPolygon([])
    setAgentJob(null)
    setShowTechnical(false)
    setInspectorMode(null)
    setSelectedIds(new Set())
  }

  const changeProspectingCity = (value: string) => {
    setCity(value)
    setMapPreview(null)
    setSearchCenter(null)
    setMapPolygon([])
  }

  const loadMapTerritory = async () => {
    const region = city.split(/[;\n]+/).map((item) => item.trim()).find(Boolean)
    if (!region) {
      notify('warning', 'Informe uma cidade ou região antes de carregar o mapa.')
      document.getElementById('prospecting-linux-regions')?.focus()
      return
    }
    setMapPreviewBusy(true)
    try {
      const preview = await previewProspectingTerritory(region)
      setMapPreview(preview)
      setSearchCenter(preview.center)
      setMapPolygon([])
      notify('success', 'Mapa carregado. Clique no mapa para contornar a área que deseja pesquisar.')
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Não foi possível carregar a área no mapa.')
    } finally { setMapPreviewBusy(false) }
  }

  const startLinuxAgentSearch = async () => {
    if (!canWrite || !workspaceId) return
    const liveHealth = agentHealth ?? await getProspectingAgentHealth()
    if (!liveHealth) {
      notify('warning', 'Serviço do Garimpo indisponível. Verifique a conexão com o runtime em nuvem e tente novamente.')
      return
    }
    if (!agentHealth) setAgentHealth(liveHealth)
    if (!segment.trim()) {
      notify('warning', 'Informe o tipo de empresa que deseja encontrar.')
      document.getElementById('prospecting-linux-segment')?.focus()
      return
    }
    const regions = city.split(/[;\n]+/).map((item) => item.trim()).filter(Boolean)
    if (!regions.length) {
      notify('warning', 'Informe pelo menos uma cidade ou região para o Garimpo.')
      document.getElementById('prospecting-linux-regions')?.focus()
      return
    }
    if (areaMode === 'map' && mapPolygon.length < 3) {
      notify('warning', 'Desenhe a área no mapa com pelo menos 3 pontos antes de iniciar o Garimpo.')
      return
    }
    setAgentBusy(true)
    try {
      const existingKeys = existingProspectingIdentityKeys(snapshot?.leads ?? [])
      const job = await createProspectingAgentJob({ workspaceId, segment: segment.trim(), regions, targetQuantity: quantity, targetMode, areaMode, radiusKm, searchMode, categoryMode, mapPolygon: areaMode === 'map' ? mapPolygon : undefined, searchCenter: areaMode === 'radius' ? searchCenter : undefined, existingKeys, enrichWeb: searchMode !== 'fast', enrichCnpj: searchMode !== 'fast', browserFallback: searchMode !== 'fast' })
      setAgentJob(job)
      notify('success', 'Garimpo iniciado. No modo Captura rápida, as primeiras empresas aparecem antes do enriquecimento completo.')
      if (agentCadence !== 'off') {
        await createProspectingAgentCampaign({ workspaceId, name: `${segment} · ${regions.join(', ')}`, cadence: agentCadence, segment, regions, targetQuantity: quantity, targetMode, areaMode, radiusKm, searchMode, categoryMode, mapPolygon: areaMode === 'map' ? mapPolygon : undefined, searchCenter: areaMode === 'radius' ? searchCenter : undefined, existingKeys })
        notify('success', `Garimpo iniciado e campanha ${agentCadence === 'daily' ? 'diária' : 'semanal'} salva.`)
      }
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Não foi possível iniciar o Prospecting Agent.')
    } finally { setAgentBusy(false) }
  }

  const controlLinuxAgentSearch = async (action: 'pause' | 'resume' | 'cancel') => {
    if (!agentJob) return
    setAgentBusy(true)
    try { setAgentJob(await controlProspectingAgentJob(agentJob.id, action)) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Falha ao controlar o Agent Linux.') }
    finally { setAgentBusy(false) }
  }

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; key?: string; payload?: unknown }
      if (!canWrite || !preferences.integrations.extensionEnabled || event.source !== window || data?.type !== EXTENSION_MESSAGE_TYPE || data.key !== preferences.integrations.inboxKey || !Array.isArray(data.payload)) return
      const added = importDrafts(data.payload as CaptureDraft[], 'extension', 'import', 'Recebido em tempo real pela extensão', data.payload.length, true)
      if (workspaceId) recordLocalIntegrationEvent(workspaceId, data.payload.length, 'extension_realtime_capture')
      if (added) notify('success', `${added} empresa(s) recebida(s) da extensão.`)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [canWrite, importDrafts, notify, preferences.integrations.extensionEnabled, preferences.integrations.inboxKey, workspaceId])

  const readinessCounts = useMemo(() => prospectReadinessCounts(state.prospects.filter((item) => item.status !== 'discarded' && item.status !== 'sent')), [state.prospects])
  const metrics = useMemo(() => {
    const active = state.prospects.filter((item) => item.status !== 'discarded' && item.status !== 'sent')
    const autoValidatable = active.filter(prospectIsAutoValidatable).length
    return {
      total: state.prospects.length,
      review: state.prospects.filter((item) => item.status === 'new' || item.status === 'analyzing' || item.status === 'review').length,
      ready: readinessCounts.ready,
      autoValidatable,
      attention: Math.max(0, active.length - autoValidatable),
      approved: state.prospects.filter((item) => item.status === 'approved').length,
      duplicates: state.prospects.filter((item) => item.duplicateLevel !== 'none' && item.status !== 'discarded' && item.status !== 'sent').length,
      sent: state.prospects.filter((item) => item.status === 'sent').length,
    }
  }, [readinessCounts.ready, state.prospects])

  const prospectingIcp = useMemo(() => snapshot ? buildProspectingIcp(snapshot) : null, [snapshot])
  const prospectingRanking = useMemo(() => snapshot ? rankProspects(state.prospects, snapshot).slice(0, 5) : [], [snapshot, state.prospects])

  const liveMetrics = useMemo(() => {
    if (!agentJob) return null
    const ready = agentJob.processing?.ready ?? agentJob.results.filter((item) => item.qualityStatus === 'ready').length
    const attention = agentJob.processing?.attention ?? agentJob.results.filter((item) => item.qualityStatus === 'attention').length
    return {
      found: agentJob.stats.unique,
      raw: agentJob.processing?.raw ?? agentJob.stats.discovered,
      ready,
      attention,
      rejected: (agentJob.stats.scopeRejectedCategory ?? 0) + (agentJob.stats.scopeRejectedLocation ?? 0),
      queries: agentJob.stats.queries,
      runId: agentJob.runtime?.runId || agentJob.id,
      phase: agentJob.runtime?.phaseLabel || agentJob.message,
    }
  }, [agentJob])

  const filtered = useMemo(() => {
    const term = normalize(search.trim())
    return state.prospects.filter((prospect) => {
      if (statusFilter !== 'all' && prospect.status !== statusFilter) return false
      if (sourceFilter !== 'all' && prospect.source !== sourceFilter) return false
      if (qualityFilter !== 'all' && prospectDataQuality(prospect).readiness !== qualityFilter) return false
      if (duplicateFilter !== 'all' && prospect.duplicateLevel !== duplicateFilter) return false
      if (term && !normalize(`${prospect.name} ${prospect.company} ${prospect.phone} ${prospect.city} ${prospect.instagram} ${prospect.cnpj}`).includes(term)) return false
      return true
    })
  }, [duplicateFilter, qualityFilter, search, sourceFilter, state.prospects, statusFilter])

  useEffect(() => {
    if (routeContext.action !== 'browser-capture' || !routeContext.capture || !workspaceId || !canWrite) return
    let payload: { url?: string; title?: string; selection?: string } | null = null
    try { payload = JSON.parse(routeContext.capture) as { url?: string; title?: string; selection?: string } } catch { payload = null }
    const draft = payload ? captureDraftFromBrowserPayload(payload) : null
    if (!draft) {
      notify('warning', 'A captura recebida do navegador não pôde ser interpretada.')
      clearRouteContext(['action', 'capture'])
      return
    }
    const added = importDrafts([draft], (draft.source as ProspectSource) || 'manual', 'capture', draft.sourceDetail || 'Captura universal do navegador', 1, true)
    notify(added ? 'success' : 'info', added ? 'Página recebida pelo Capturador Universal e enviada para revisão.' : 'Esta página já estava no Garimpo e foi preservada sem duplicação.')
    if (added) setTab('results')
    clearRouteContext(['action', 'capture'])
  }, [canWrite, clearRouteContext, importDrafts, notify, routeContext.action, routeContext.capture, workspaceId])

  const reviewFiltered = useMemo(() => filtered.filter((item) => {
    if (reviewScope === 'all') return true
    if (item.status === 'discarded' || item.status === 'sent') return false
    return reviewScope === 'ready' ? prospectIsAutoValidatable(item) : !prospectIsAutoValidatable(item)
  }), [filtered, reviewScope])
  const processingQueue = useMemo(() => sortProspectsForGuidedReview(state.prospects.filter((item) => ['new', 'analyzing', 'review', 'approved'].includes(item.status))), [state.prospects])
  const guidedQueue = useMemo(() => processingQueue.filter((item) => reviewScope === 'all' ? true : reviewScope === 'ready' ? prospectIsAutoValidatable(item) : !prospectIsAutoValidatable(item)), [processingQueue, reviewScope])
  const activeProspect = guidedQueue.find((item) => item.id === processingId) ?? guidedQueue[0] ?? null

  useEffect(() => {
    if (!processingId && guidedQueue[0]) setProcessingId(guidedQueue[0].id)
    if (processingId && !guidedQueue.some((item) => item.id === processingId)) setProcessingId(guidedQueue[0]?.id ?? null)
  }, [guidedQueue, processingId])

  // Buscar apresenta os resultados; Revisar concentra empresas, evidências e fontes brutas.
  // Resgata candidatos da execução local sem duplicar registros já editados.
  const openReviewWorkspace = (mode?: ProspectingInspectorMode) => {
    if (agentJob?.results.length && canWrite) {
      const candidates = agentJob.results.map((entry) => ({ ...entry, agentJobId: agentJob.id }))
      importDrafts(candidates, 'manual', 'capture', 'Resultados da execução atual enviados para revisão', candidates.length, true, false)
    }
    setReviewScope(mode === 'ready' ? 'ready' : mode === 'attention' ? 'exceptions' : 'all')
    setSelectedIds(new Set())
    const isSource = mode === 'raw' || mode === 'filtered' || mode === 'duplicates'
    setReviewMode(isSource ? 'sources' : 'list')
    setInspectorMode(mode ?? null)
    setTab('results')
  }

  const openSearch = () => {
    const url = buildProspectingSearchUrl(source, segment, city, query)
    const opened = openExternalUrl(url)
    if (!opened.ok) { notify('error', opened.reason ?? 'Não foi possível abrir a busca externa.'); return }
    if (canWrite) commit((current) => appendHistory(current, workspaceId, { action: 'search', title: `Busca no ${prospectSourceLabels[source]}`, description: [query || segment, city].filter(Boolean).join(' · '), count: 0 }))
  }

  const runAutomatedSearch = async () => {
    if (!canWrite || !workspaceId) return
    const channel = providerDiagnostics?.maps
    if (!channel?.available || channel.mode !== 'direct') { openSearch(); return }
    if (!segment.trim() && !query.trim()) { notify('warning', 'Informe um segmento ou uma busca específica para iniciar a busca automática.'); return }
    automationAbortRef.current?.abort()
    const controller = new AbortController()
    automationAbortRef.current = controller
    setProviderBusy(true)
    setAutomationProgress({ status: 'planning', targetQuantity: quantity, uniqueFound: 0, requestsCompleted: 0, maxRequests: Math.min(12, Math.ceil(quantity / 20) + 2), currentArea: '', currentQuery: '', message: 'Montando plano de busca…' })
    try {
      const result = await runProspectingSearchAutomation({ workspaceId, segment, city, query, targetQuantity: quantity }, { signal: controller.signal, onProgress: setAutomationProgress })
      const added = importDrafts(result.drafts, 'maps', 'import', `Busca automática Google Places · ${result.requestsCompleted} consulta(s) · ${result.uniqueCount} único(s)`, result.drafts.length, true)
      commit((current) => appendHistory(current, workspaceId, {
        action: 'search',
        title: 'Busca automática concluída',
        description: `${[query || segment, city].filter(Boolean).join(' · ')} · ${result.requestsCompleted} consulta(s) · ${result.uniqueCount} resultado(s) único(s)`,
        count: result.uniqueCount,
      }))
      result.warnings.forEach((warning) => notify('info', warning))
      if (controller.signal.aborted || result.stoppedReason === 'cancelled') notify('info', `Busca cancelada com ${result.uniqueCount} resultado(s) coletado(s).`)
      else if (!result.uniqueCount) notify('info', 'A busca automática terminou sem novos resultados.')
      else if (added) { notify('success', `${added} empresa(s) única(s) recebida(s) e analisada(s). A revisão está pronta.`); setTab('results') }
      else notify('info', 'Os resultados encontrados já estavam no Garimpo; nenhuma duplicidade foi criada.')
      void refreshProviderDiagnostics()
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        setAutomationProgress((current) => current ? { ...current, status: 'cancelled', message: 'Busca automática cancelada.' } : current)
        notify('info', 'Busca automática cancelada.')
      } else {
        setAutomationProgress((current) => current ? { ...current, status: 'failed', message: error instanceof Error ? error.message : 'Falha na busca automática.' } : current)
        const providerError = error instanceof ProspectingProviderError ? error : null
        notify(providerError?.code === 'maps_api_key_missing' ? 'warning' : 'error', error instanceof Error ? error.message : 'Não foi possível concluir a busca automática.')
      }
    } finally {
      if (automationAbortRef.current === controller) automationAbortRef.current = null
      setProviderBusy(false)
    }
  }

  const cancelAutomatedSearch = () => automationAbortRef.current?.abort()

  const runProviderSearch = async () => {
    if (!canWrite || !workspaceId) return
    if (!isDirectProspectingSource(source)) { openSearch(); return }
    setProviderBusy(true)
    try {
      const result = await runProspectingProviderSearch({ workspaceId, source, segment, city, query, quantity })
      const added = importDrafts(result.drafts, source, 'import', `${result.provider} · ${[query || segment, city].filter(Boolean).join(' · ') || 'consulta direta'}`, result.drafts.length, true)
      result.warnings.forEach((warning) => notify('info', warning))
      if (!result.drafts.length) {
        notify('info', 'A consulta foi concluída, mas nenhum resultado foi encontrado.')
      } else if (added) {
        notify('success', `${added} empresa(s) recebida(s), deduplicada(s) e analisada(s) pelo Garimpo.`)
        setTab('results')
      } else {
        notify('info', 'Os resultados encontrados já estavam no Garimpo e foram preservados sem duplicação.')
      }
      void refreshProviderDiagnostics()
    } catch (error) {
      const providerError = error instanceof ProspectingProviderError ? error : null
      const message = error instanceof Error ? error.message : 'Não foi possível concluir a consulta direta.'
      notify(providerError?.code === 'maps_api_key_missing' ? 'warning' : 'error', message)
      if (providerError?.code === 'maps_api_key_missing') openSearch()
    } finally { setProviderBusy(false) }
  }

  const captureQuick = () => {
    const drafts = parseQuickCaptureLines(quickCapture)
    if (!drafts.length) { notify('error', 'Cole pelo menos um resultado para capturar.'); return }
    const added = importDrafts(drafts, source, 'capture', `${prospectSourceLabels[source]} · ${city || 'sem cidade'}`, Math.max(1, quantity), true)
    setQuickCapture('')
    notify(added ? 'success' : 'info', added ? `${added} empresa(s) adicionada(s) à revisão.` : 'Nenhuma empresa nova foi encontrada.')
    if (added) setTab('results')
  }

  const captureUniversal = () => {
    const drafts = parseUniversalCaptureInput(universalCapture)
    if (!drafts.length) { notify('error', 'Cole uma URL, um resultado ou um texto reconhecível para capturar.'); return }
    const fallback = (drafts[0]?.source as ProspectSource) || 'manual'
    const added = importDrafts(drafts, fallback, 'capture', 'Captura universal por URL/clipboard', drafts.length, true)
    if (added) { setUniversalCapture(''); setTab('results'); notify('success', `${added} registro(s) capturado(s) e enviado(s) para revisão.`) }
    else notify('info', 'Nenhum registro novo foi encontrado; duplicidades foram preservadas.')
  }

  const copyBrowserCaptureBookmarklet = async () => {
    const bookmarklet = buildBrowserCaptureBookmarklet(window.location.origin)
    const result = await copyTextToClipboard(bookmarklet)
    if (result.ok) {
      notify('success', 'Capturador Universal copiado. Crie um favorito no navegador e cole o código no campo URL/endereço.')
      return
    }
    setUniversalCapture(bookmarklet)
    notify('info', result.reason ?? 'O navegador bloqueou a área de transferência. O código foi colocado no campo para cópia manual.')
  }

  const syncExtension = () => {
    if (!preferences.integrations.extensionEnabled) { notify('info', 'A entrada da extensão está desativada nas Configurações.'); return }
    const drafts = readExtensionInbox(preferences.integrations.inboxKey)
    if (!drafts.length) { notify('info', 'A caixa de entrada da extensão está vazia.'); return }
    const added = importDrafts(drafts, 'extension', 'import', 'Sincronização da caixa de entrada da extensão', drafts.length, true)
    if (workspaceId) recordLocalIntegrationEvent(workspaceId, drafts.length, 'extension_inbox_sync')
    clearExtensionInbox(preferences.integrations.inboxKey)
    commit((current) => ({ ...current, lastExtensionSyncAt: new Date().toISOString() }))
    notify(added ? 'success' : 'info', added ? `${added} empresa(s) sincronizada(s).` : 'Os registros recebidos já estavam no Garimpo.')
    if (added) setTab('results')
  }

  const importFile = async (file: File) => {
    try {
      const raw = await file.text()
      const drafts = parseProspectFile(file.name, raw)
      if (!drafts.length) throw new Error('O arquivo não possui empresas reconhecíveis.')
      const added = importDrafts(drafts, 'manual', 'import', `${file.name} · ${drafts.length} registro(s) lido(s)`, drafts.length, true)
      notify('success', `${added} empresa(s) importada(s) sem duplicar registros do Garimpo.`)
      if (added) setTab('results')
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
    notify('success', `${count} empresa(s) analisada(s).`)
  }

  const setStatus = (ids: string[], status: ProspectStatus) => {
    const idSet = new Set(ids); const now = new Date().toISOString()
    commit((current) => {
      const prospects = current.prospects.map((item) => idSet.has(item.id) ? { ...item, status, updatedAt: now } : item)
      const action = status === 'approved' ? 'approve' : status === 'discarded' ? 'discard' : 'analyze'
      return appendHistory({ ...current, prospects }, workspaceId, { action, title: status === 'approved' ? 'Empresas aprovadas' : status === 'discarded' ? 'Empresas descartadas' : 'Status atualizado', description: `${ids.length} registro(s) alterado(s).`, count: ids.length })
    })
    setSelectedIds(new Set())
  }

  const removeProspects = async (ids: string[]) => {
    if (!canProspectingDelete) { notify('error','Seu perfil não permite excluir empresas do Garimpo.'); return }
    if (!await confirmAction({ title: `Remover ${ids.length} registro(s)?`, description: 'Os itens serão retirados da base de processamento do Garimpo.', confirmLabel: 'Remover registros', tone: 'danger' })) return
    // Send only explicitly selected, visible IDs. Never propagate filtered snapshot absence as deletion.
    const allowedIds = [...new Set(ids)].filter((id) => state.prospects.some((item) => item.id === id && prospectInScope(item)))
    if (allowedIds.length !== new Set(ids).size) { notify('error', 'A seleção contém registros sem permissão de exclusão.'); return }
    try {
      await deleteProspectingRecords(workspaceId, allowedIds)
      const idSet = new Set(allowedIds)
      commit((current) => appendHistory({ ...current, prospects: current.prospects.filter((item) => !idSet.has(item.id)) }, workspaceId, { action: 'delete', title: 'Registros removidos', description: 'Exclusão manual da base de processamento.', count: allowedIds.length }))
      setSelectedIds(new Set())
      notify('success', 'Registros selecionados removidos com confirmação do servidor.')
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Não foi possível confirmar a exclusão no Supabase.')
    }
  }

  const approveProspects = (ids: string[]) => {
    const prospects = state.prospects.filter((item) => ids.includes(item.id))
    const blocked = prospects.filter((item) => prospectDataQuality(item).readiness === 'blocked')
    const approvable = prospects.filter((item) => prospectDataQuality(item).readiness !== 'blocked').map((item) => item.id)
    if (blocked.length) notify('warning', `${blocked.length} registro(s) precisam corrigir identidade, contato ou duplicidade antes da aprovação.`)
    if (approvable.length) setStatus(approvable, 'approved')
  }

  const retrySelectedEnrichment = async (ids: string[]) => {
    if (!canWrite || bulkRetryBusy || !ids.length) return
    setBulkRetryBusy(true)
    let retried = 0; let companies = 0; let skipped = 0; let failed = 0
    try {
      const jobs = await listProspectingAgentJobs(workspaceId).catch(() => [] as ProspectingAgentJob[])
      const jobByCandidate = new Map<string, ProspectingAgentJob>()
      jobs.forEach((job) => job.results.forEach((candidate) => { if (candidate.candidateId) jobByCandidate.set(candidate.candidateId, job) }))
      for (const prospect of state.prospects.filter((item) => ids.includes(item.id))) {
        const raw = prospect.rawData ?? {}
        const candidateId = rawText(raw, 'candidateId')
        if (!candidateId) { skipped += 1; continue }
        const jobId = rawText(raw, 'agentJobId') || jobByCandidate.get(candidateId)?.id || (agentJob?.results.some((candidate) => candidate.candidateId === candidateId) ? agentJob.id : '')
        if (!jobId) { skipped += 1; continue }
        const taskRecord = (raw.enrichmentTasks && typeof raw.enrichmentTasks === 'object' ? raw.enrichmentTasks : {}) as Partial<Record<ProspectingEnrichmentTaskId, ProspectingEnrichmentTask>>
        let taskIds = (['website', 'contacts', 'cnpj', 'social'] as ProspectingEnrichmentTaskId[]).filter((taskId) => ['attention', 'failed'].includes(taskRecord[taskId]?.status ?? ''))
        if (!taskIds.length) taskIds = ['website', 'contacts', 'cnpj', 'social'].filter((taskId) => taskRecord[taskId as ProspectingEnrichmentTaskId]?.status === 'skipped') as ProspectingEnrichmentTaskId[]
        if (!taskIds.length) { skipped += 1; continue }
        let latest: ProspectingAgentJob | null = null
        try {
          for (const taskId of taskIds) { latest = await retryProspectingEnrichmentTask(jobId, candidateId, taskId); retried += 1 }
          const candidate = latest?.results.find((item) => item.candidateId === candidateId)
          if (candidate) importDrafts([{ ...candidate, agentJobId: jobId }], 'manual', 'import', 'Reprocessamento em lote · Review Workspace 2.0', 1, true, false)
          companies += 1
          if (latest && agentJob?.id === latest.id) setAgentJob(latest)
        } catch { failed += 1 }
      }
      if (companies) commit((current) => appendHistory(current, workspaceId, { action: 'analyze', title: 'Enriquecimento reprocessado em lote', description: `${companies} empresa(s) · ${retried} tarefa(s) reexecutada(s) · ${skipped} sem tarefa pendente · ${failed} falha(s).`, count: companies }))
      if (failed) notify('warning', `${companies} empresa(s) reprocessada(s); ${failed} falha(s) precisam de atenção.`)
      else if (companies) notify('success', `${companies} empresa(s) reprocessada(s) em ${retried} tarefa(s) de enriquecimento.`)
      else notify('info', skipped ? 'Os registros selecionados não possuem tarefas de enriquecimento pendentes/reprocessáveis.' : 'Nenhuma empresa foi reprocessada.')
    } finally { setBulkRetryBusy(false) }
  }

  const exportDataLayer = async () => {
    if (!canProspectingExport) { notify('error','Seu perfil não permite exportar dados do Garimpo.'); return }
    const selected = selectedIds.size ? state.prospects.filter((item) => selectedIds.has(item.id)) : filtered
    if (!selected.length) { notify('info', 'Não há registros para enviar ao Data Layer.'); return }
    if (!currentWorkspace) return
    const approved=await requireExportApproval(repositoryMode,currentWorkspace.id,teamAccess,{userName:user?.displayName??user?.email??'Usuário',resource:'prospecting',entityType:'prospecting_data_layer_export',count:selected.length})
    if(!approved){notify('warning','Exportação do Garimpo enviada para aprovação. Após o gestor aprovar, repita a ação.');return}
    const payload = buildProspectingDataLayerEnvelope(workspaceId, selected)
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `realtalent-data-layer-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url)
    commit((current) => appendHistory(current, workspaceId, { action: 'analyze', title: 'Lote exportado para o Data Layer', description: `${selected.length} registro(s) preparados no contrato realtalent-data-layer/2.5 para enriquecimento externo.`, count: selected.length }))
    notify('success', `${selected.length} registro(s) preparados para enriquecimento no Data Layer.`)
  }

  const exportResults = async () => {
    if (!canProspectingExport) { notify('error','Seu perfil não permite exportar dados do Garimpo.'); return }
    if (!currentWorkspace) return
    const approved=await requireExportApproval(repositoryMode,currentWorkspace.id,teamAccess,{userName:user?.displayName??user?.email??'Usuário',resource:'prospecting',entityType:'prospecting_results_export',count:filtered.length})
    if(!approved){notify('warning','Exportação do Garimpo enviada para aprovação. Após o gestor aprovar, repita a ação.');return}
    const payload = { version: APP_VERSION, exportedAt: new Date().toISOString(), prospects: filtered }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `garimpo-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url)
  }

  const openSend = (ids: string[]) => {
    const validIds = ids.filter((id) => state.prospects.some((item) => item.id === id && item.status === 'approved' && prospectDataQuality(item).readiness !== 'blocked'))
    if (!validIds.length) { notify('info', 'Revise e aprove as empresas antes de enviar ao CRM. Registros bloqueados pelo Data Layer não são enviados.'); return }
    if (validIds.length < ids.length) notify('warning', `${ids.length - validIds.length} registro(s) ficaram de fora por ainda não estarem aprovados.`)
    setSendIds(validIds)
  }

  const sendToCrm = async (options: SendOptions) => {
    if (!snapshot) return
    const prospects = state.prospects.filter((item) => sendIds.includes(item.id))
    setSending(true)
    let companiesCreated = 0; let companiesUpdated = 0; let contactsCreated = 0; let contactsUpdated = 0; let opportunitiesCreated = 0; let skipped = 0; let failed = 0; let activityWarnings = 0
    const sentIds: string[] = []
    const batchId = `garimpo-${Date.now().toString(36)}`
    const tagsFromOptions = options.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    const companyCache = [...snapshot.companies]
    const contactCache = [...snapshot.contacts]

    const resolveCompany = (prospect: ProspectRecord) => {
      const cnpj = crmDigits(prospect.cnpj).slice(0, 14)
      if (cnpj.length === 14) {
        const exact = companyCache.find((company) => crmDigits(company.cnpj).slice(0, 14) === cnpj)
        if (exact) return { company: exact, strength: 'confirmed' as const }
      }
      const name = normalize(prospect.company || prospect.name)
      const city = normalize(prospect.city)
      const domain = crmDomain(prospect.website)
      const phone = crmDigits(prospect.phone)
      const possible = companyCache.find((company) => {
        if (!name || normalize(company.name) !== name || (city && normalize(company.city) !== city)) return false
        const sameDomain = Boolean(domain && company.domain && crmDomain(company.domain) === domain)
        const samePhone = Boolean(phone.length >= 10 && crmDigits(company.phone) === phone)
        return sameDomain || samePhone
      })
      return possible ? { company: possible, strength: 'possible' as const } : { company: null, strength: 'none' as const }
    }

    try {
      for (const prospect of prospects) {
        try {
          const match = resolveCompany(prospect)
          if (match.company && options.duplicateBehavior === 'skip') { skipped += 1; continue }
          const raw = prospect.rawData ?? {}
          const domain = crmDomain(prospect.website)
          const companyPayload = {
            name: prospect.company || prospect.name,
            legalName: rawText(raw, 'legalName', 'legal_name', 'razaoSocial', 'razao_social'),
            cnpj: prospect.cnpj,
            domain,
            website: prospect.website,
            segment: rawText(raw, 'category', 'segment', 'cnaeDescription') || segment,
            phone: prospect.phone,
            city: prospect.city,
            state: rawText(raw, 'state', 'uf'),
            status: 'prospect' as const,
            leadIds: [] as string[],
          }

          let company: CompanyRecord
          if (match.company && options.duplicateBehavior === 'update') {
            company = await updateCompany(match.company.id, {
              name: companyPayload.name || match.company.name,
              legalName: companyPayload.legalName || match.company.legalName,
              cnpj: companyPayload.cnpj || match.company.cnpj,
              domain: companyPayload.domain || match.company.domain,
              website: companyPayload.website || match.company.website,
              segment: companyPayload.segment || match.company.segment,
              phone: companyPayload.phone || match.company.phone,
              city: companyPayload.city || match.company.city,
              state: companyPayload.state || match.company.state,
            })
            const index = companyCache.findIndex((item) => item.id === company.id); if (index >= 0) companyCache[index] = company
            companiesUpdated += 1
          } else {
            company = await createCompany(companyPayload)
            companyCache.push(company); companiesCreated += 1
          }

          const rawContactName = rawText(raw, 'contactName', 'contact_name', 'responsible', 'responsavel', 'ownerName')
          const contactName = rawContactName || (normalize(prospect.name) !== normalize(prospect.company) ? prospect.name.trim() : '')
          let contactId: string | null = null
          if (contactName) {
            const phone = crmDigits(prospect.phone); const email = prospect.email.trim().toLocaleLowerCase('pt-BR')
            const existingContact = contactCache.find((contact) => contact.companyId === company.id && ((email && contact.email.toLocaleLowerCase('pt-BR') === email) || (phone.length >= 10 && crmDigits(contact.phone) === phone && normalize(contact.name) === normalize(contactName))))
            if (existingContact && options.duplicateBehavior === 'update') {
              const contact = await updateContact(existingContact.id, { name: contactName, phone: prospect.phone || existingContact.phone, email: prospect.email || existingContact.email, jobTitle: rawText(raw, 'jobTitle', 'job_title', 'cargo') || existingContact.jobTitle, companyId: company.id })
              const index = contactCache.findIndex((item) => item.id === contact.id); if (index >= 0) contactCache[index] = contact
              contactId = contact.id; contactsUpdated += 1
            } else if (!existingContact || options.duplicateBehavior === 'create') {
              const contact = await createContact({ companyId: company.id, name: contactName, jobTitle: rawText(raw, 'jobTitle', 'job_title', 'cargo'), phone: prospect.phone, email: prospect.email, decisionRole: 'unknown', influenceLevel: 0, relationshipStrength: 'unknown', relationshipScore: 0, stance: 'unknown', relationshipOwnerId: null, relationshipOwnerName: options.ownerName || '', lastContactAt: null, nextActionAt: options.createOpportunity && options.nextActionAt ? new Date(options.nextActionAt).toISOString() : null, notes: `Criado pelo Garimpo · lote ${batchId}.`, isPrimary: true, consentStatus: 'unknown', doNotContact: false, doNotContactReason: '', leadIds: [] })
              contactCache.push(contact); contactId = contact.id; contactsCreated += 1
            } else contactId = existingContact.id
          }

          let leadId: string | null = null
          if (options.createOpportunity) {
            const importTag = `garimpo-id:${prospect.id}`
            const details = [`Lote Garimpo: ${batchId}`, `Empresa canônica: ${company.id}`, contactId ? `Contato canônico: ${contactId}` : '', prospect.instagram ? `Instagram: ${prospect.instagram}` : '', prospect.website ? `Site: ${prospect.website}` : '', prospect.bookingUrl ? `Agendamento: ${prospect.bookingUrl}` : '', prospect.cnpj ? `CNPJ: ${prospect.cnpj}` : '', prospect.address ? `Endereço: ${prospect.address}` : '', prospect.description, prospect.notes].filter(Boolean).join('\n')
            const alreadyImported = snapshot.leads.find((lead) => lead.tags.includes(importTag))
            if (alreadyImported && options.duplicateBehavior === 'update') {
              const tags = Array.from(new Set([...alreadyImported.tags, ...tagsFromOptions, 'garimpo', importTag]))
              const lead = await updateLead(alreadyImported.id, { companyId: company.id, primaryContactId: contactId, company: company.name, cnpj: company.cnpj, website: company.website, phone: prospect.phone || alreadyImported.phone, email: prospect.email || alreadyImported.email, city: prospect.city || alreadyImported.city, source: `Garimpo · ${prospectOriginLabel(prospect)}`, priority: options.priority, temperature: options.temperature, ownerId: options.ownerId || alreadyImported.ownerId, ownerName: options.ownerName || alreadyImported.ownerName, tags, nextActionAt: options.nextActionAt ? new Date(options.nextActionAt).toISOString() : alreadyImported.nextActionAt, notes: [alreadyImported.notes, details].filter(Boolean).join('\n\n') })
              leadId = lead.id
            } else {
              const lead = await createLead({ name: contactName || company.name, company: company.name, phone: prospect.phone, email: prospect.email, city: prospect.city, cnpj: company.cnpj, website: company.website, companyId: company.id, primaryContactId: contactId, source: `Garimpo · ${prospectOriginLabel(prospect)}`, stageId: options.stageId, status: 'active', temperature: options.temperature, priority: options.priority, ownerId: options.ownerId || null, ownerName: options.ownerName || 'Sem responsável', value: 0, nextActionAt: options.nextActionAt ? new Date(options.nextActionAt).toISOString() : null, notes: details, tags: Array.from(new Set([...tagsFromOptions, 'garimpo', prospect.source, importTag])) })
              leadId = lead.id
            }
            opportunitiesCreated += 1
            if (options.nextActionAt && leadId) {
              try { await createActivity({ leadId, contactId, type: options.activityType, title: options.activityType === 'call' ? `Primeira ligação — ${company.name}` : `Primeiro follow-up — ${company.name}`, description: `Atividade criada pelo Garimpo · lote ${batchId}.`, dueAt: new Date(options.nextActionAt).toISOString(), completedAt: null, assignedTo: options.ownerId || null, purpose: 'prospecting_first_contact', originEventKey: `prospecting:${prospect.id}` }) }
              catch { activityWarnings += 1 }
            }
          }

          sentIds.push(prospect.id)
          const now = new Date().toISOString()
          commit((current) => ({ ...current, prospects: current.prospects.map((item) => item.id === prospect.id ? { ...item, status: 'sent' as const, sentAt: now, updatedAt: now, rawData: { ...item.rawData, crmCompanyId: company.id, ...(contactId ? { crmContactId: contactId } : {}), ...(leadId ? { crmLeadId: leadId } : {}) } } : item) }))
        } catch { failed += 1 }
      }
      commit((current) => appendHistory(current, workspaceId, { action: companiesUpdated || contactsUpdated ? 'merge' : 'send', title: `Lote ${batchId} enviado ao CRM`, description: `${companiesCreated} empresa(s) criada(s) · ${companiesUpdated} atualizada(s) · ${contactsCreated} contato(s) criado(s) · ${contactsUpdated} atualizado(s) · ${opportunitiesCreated} oportunidade(s) criada(s) · ${skipped} ignorada(s) · ${failed} falha(s)${activityWarnings ? ` · ${activityWarnings} atividade(s) pendente(s)` : ''}`, count: sentIds.length }))
      setSendIds((current) => current.filter((id) => !sentIds.includes(id))); setSelectedIds(new Set())
      if (failed || activityWarnings) notify('info', `${sentIds.length} empresa(s) processada(s); ${failed} falha(s) e ${activityWarnings} atividade(s) precisam de revisão.`)
      else notify('success', `${sentIds.length} empresa(s) enviada(s) ao CRM canônico.`)
    } finally { setSending(false) }
  }

  if (!snapshot || !currentWorkspace) return null

  return (
    <div className="page-stack prospecting-page prospecting-page-h20 prospecting-page-v4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.json,text/csv,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void importFile(file)
        }}
      />

      <ProspectingRedesignShell
        activeTab={tab === 'results' ? 'results' : tab === 'history' ? 'history' : 'search'}
        reviewCount={metrics.total}
        sentCount={metrics.sent}
        suggestionSegment={prospectingIcp?.segments[0]?.value ?? ''}
        suggestionCity={prospectingIcp?.cities[0]?.value ?? ''}
        canCreate={canProspectingCreate}
        onImport={() => fileInputRef.current?.click()}
        onNewSearch={() => {
          resetProspectingSearch()
          window.setTimeout(() => document.getElementById('prospecting-linux-segment')?.focus(), 0)
        }}
        onUseSuggestion={() => {
          if (prospectingIcp?.segments[0]?.value) setSegment(prospectingIcp.segments[0].value)
          if (prospectingIcp?.cities[0]?.value) changeProspectingCity(prospectingIcp.cities[0].value)
          setTab('search')
        }}
        onSearchTab={() => setTab('search')}
        onReviewTab={() => openReviewWorkspace()}
        onCrm={() => setRoute('leads')}
        onHistoryTab={() => setTab('history')}
      >
        {tab === 'search' || tab === 'local' ? <>
          <ProspectingRedesignSearch
            segment={segment}
            city={city}
            quantity={quantity}
            categoryMode={categoryMode}
            areaMode={areaMode}
            radiusKm={radiusKm}
            canEdit={canProspectingEdit}
            agentBusy={agentBusy}
            agentHealth={agentHealth}
            job={agentJob}
            baseTotal={metrics.total}
            sentCount={metrics.sent}
            readyCount={metrics.autoValidatable}
            attentionCount={metrics.attention}
            mapPanel={areaMode === 'map' ? <TerritoryAreaSelector
              preview={mapPreview}
              polygon={mapPolygon}
              busy={mapPreviewBusy}
              disabled={!canWrite || Boolean(agentJob && ['queued', 'running', 'paused'].includes(agentJob.status))}
              onLoad={() => void loadMapTerritory()}
              onPolygon={setMapPolygon}
            /> : <SearchTerritoryPlanner
              preview={mapPreview}
              center={searchCenter}
              areaMode={areaMode}
              radiusKm={radiusKm}
              polygon={mapPolygon}
              busy={mapPreviewBusy}
              disabled={!canWrite || Boolean(agentJob && ['queued', 'running', 'paused'].includes(agentJob.status))}
              searchMode={searchMode}
              onLoad={() => void loadMapTerritory()}
              onRadiusKm={setRadiusKm}
              onCenter={setSearchCenter}
            />}
            onSegment={setSegment}
            onCity={changeProspectingCity}
            onQuantity={setQuantity}
            onCategoryMode={setCategoryMode}
            onAreaMode={(value) => { setAreaMode(value); if (value !== 'map') setMapPolygon([]) }}
            onRadiusKm={setRadiusKm}
            onStart={() => void startLinuxAgentSearch()}
            onControl={(action) => void controlLinuxAgentSearch(action)}
            onDetails={() => setShowTechnical((value) => !value)}
            onInspect={(mode) => openReviewWorkspace(mode)}
          />
          {showTechnical && agentJob ? <div className="prospecting-redesign-v4__legacy-content">
            <EngineProcessingWorkspace
              job={agentJob}
              busy={agentBusy}
              onRefresh={() => void refreshAgent()}
              onRetry={(candidateId, taskId) => void retryEnrichmentTask(candidateId, taskId)}
              onOpenReview={() => openReviewWorkspace()}
            />
          </div> : null}
        </> : null}
      {tab === 'results' ? <div className="prospecting-review-workspace-v101103-h7 prospecting-review-workspace-v101106">
        <section className="panel prospecting-review-modebar-v101103-h7 prospecting-review-modebar-v101106"><div><span className="eyebrow"><ClipboardCheck size={14} /> Central de revisão</span><h3>Todos os resultados em um único lugar</h3><p>Empresas ficam na lista e na revisão guiada. Dados brutos, fontes filtradas e duplicidades ficam disponíveis para triagem, sem envio automático ao CRM.</p></div><div className="prospecting-review-modebar-v101106__actions"><div className="prospecting-review-scope-v101106">{([['exceptions', 'Precisa atenção', metrics.attention], ['ready', 'Prontas', metrics.autoValidatable], ['all', 'Todas', metrics.total]] as Array<[ReviewScope,string,number]>).map(([value,label,count]) => <button type="button" key={value} className={reviewScope === value ? 'is-active' : ''} onClick={() => { setReviewScope(value); setSelectedIds(new Set()) }}>{label}<span>{count}</span></button>)}</div><div className="prospecting-review-switch-v101103-h7"><button type="button" className={reviewMode === 'list' ? 'is-active' : ''} onClick={() => { setReviewMode('list'); setInspectorMode(null) }}><ClipboardList size={15}/> Lista</button><button type="button" className={reviewMode === 'guided' ? 'is-active' : ''} onClick={() => { setReviewMode('guided'); setInspectorMode(null) }}><Sparkles size={15}/> Guiada</button><button type="button" className={reviewMode === 'sources' ? 'is-active' : ''} onClick={() => { setReviewMode('sources'); setInspectorMode(null) }}><Globe2 size={15}/> Fontes brutas <span>{rawSourceReviewCount(agentJob)}</span></button></div></div></section>
        {inspectorMode && reviewMode === 'list' ? <ProspectingEvidenceExplorer
          job={agentJob} prospects={state.prospects} mode={inspectorMode}
          onMode={(next) => {
            setInspectorMode(next)
            setReviewMode(next === 'raw' || next === 'filtered' || next === 'duplicates' ? 'sources' : 'list')
          }}
          onClose={() => setInspectorMode(null)}
          onReview={() => { setInspectorMode(null); setReviewMode(inspectorMode === 'raw' || inspectorMode === 'filtered' || inspectorMode === 'duplicates' ? 'sources' : 'list') }}
        /> : null}
        {reviewMode === 'sources' ? <RawSourceReview
          initialScope={inspectorMode === 'raw' ? 'raw' : inspectorMode === 'filtered' ? 'filtered' : inspectorMode === 'duplicates' ? 'duplicates' : 'all'}
          job={agentJob}
          decisions={state.rawSourceDecisions || {}}
          disabled={!canProspectingEdit}
          onDecision={(key, decision) => {
            commit((current) => {
              const nextDecisions = { ...(current.rawSourceDecisions || {}) }
              if (decision) nextDecisions[key] = decision
              else delete nextDecisions[key]
              return { ...current, rawSourceDecisions: nextDecisions }
            })
          }}
          onPromote={(sourceRecord, draft) => {
            const added = importDrafts([draft], 'manual', 'capture',
              'Fonte pública conferida e promovida para revisão humana · ' + (sourceRecord.url || sourceRecord.name), 1, true)
            if (!added) {
              notify('info', 'Essa empresa já está na sua base de revisão. Abra a lista para verificar o registro.')
              return false
            }
            commit((current) => ({ ...current, rawSourceDecisions: {
              ...(current.rawSourceDecisions || {}), [sourceRecord.key]: 'promoted',
            }}))
            notify('success', 'Empresa enviada à fila de revisão. Dados não confirmados continuam pendentes.')
            return true
          }}
          onShowCompanies={() => { setReviewMode('list'); setReviewScope('all'); setInspectorMode(null) }}
        /> : inspectorMode && reviewMode === 'list' ? null : reviewMode === 'list' ? <ResultsWorkspace
          readOnly={!canProspectingEdit} prospects={reviewFiltered} selectedIds={selectedIds} search={search} statusFilter={statusFilter} sourceFilter={sourceFilter} qualityFilter={qualityFilter} duplicateFilter={duplicateFilter} bulkRetryBusy={bulkRetryBusy}
          onSearch={setSearch} onStatusFilter={setStatusFilter} onSourceFilter={setSourceFilter} onQualityFilter={setQualityFilter} onDuplicateFilter={setDuplicateFilter} onSelected={setSelectedIds}
          onAnalyze={analyze} onApprove={approveProspects} onDiscard={(ids) => setStatus(ids, 'discarded')} onSend={openSend} onDelete={(ids) => void removeProspects(ids)} onExport={exportResults} onBulkRetry={(ids) => void retrySelectedEnrichment(ids)}
          onOpenGuided={(id) => { setProcessingId(id); setReviewMode('guided') }}
        /> : <ProcessingWorkspace
          readOnly={!canProspectingEdit}
          queue={guidedQueue} active={activeProspect} leads={snapshot.leads} snapshot={snapshot} onSelect={setProcessingId} onChange={updateProspect}
          onAnalyze={(id) => analyze([id])} onApprove={(id) => approveProspects([id])} onDiscard={(id) => setStatus([id], 'discarded')}
          onSend={(id) => openSend([id])} onAnalyzeAll={() => analyze(guidedQueue.filter((item) => item.status !== 'sent').map((item) => item.id))}
        />}
      </div> : null}
      {tab === 'history' ? <HistoryWorkspace state={state} onExport={exportResults} /> : null}


      </ProspectingRedesignShell>
      <SendToCrmModal open={canProspectingEdit && sendIds.length > 0} count={sendIds.length} stages={snapshot.stages} ownerOptions={(canProspectingAssign ? workspaceMembers : workspaceMembers.filter((member) => member.userId === currentUserId)).map((member) => ({ id: member.userId, name: member.displayName || member.email }))} loading={sending} onClose={() => setSendIds([])} onSubmit={sendToCrm} />

      {metrics.sent > 0 ? <section className="prospecting-footer-callout"><div><CheckCircle2 size={20} /><div><strong>Integração ativa com o CRM</strong><span>Empresas enviadas entram primeiro como CompanyRecord; pessoas identificadas viram ContactRecord. Oportunidades só são criadas quando você solicitar.</span></div></div><Button variant="secondary" onClick={() => setRoute('leads')}>Abrir Contatos <ArrowRight size={16} /></Button></section> : null}
    </div>
  )
}


function ProspectingIntelligencePanel({ icpSummary, topSegment, topCity, ranked, onUseIcp, onReview }: {
  icpSummary: string; topSegment: string; topCity: string
  ranked: Array<{ prospect: ProspectRecord; intelligence: { score: number; reasons: string[]; opportunitySignals: string[]; breakdown: { fit: number; potential: number; contactability: number; timing: number; dataQuality: number } } }>
  onUseIcp(): void; onReview(id: string): void
}) {
  return <section className="panel prospecting-intelligence-v33">
    <header><div><span className="eyebrow"><Sparkles size={14}/> Prospecting Intelligence</span><h3>A IA prioriza o Garimpo com os dados reais do CRM</h3><p>{icpSummary}</p></div><div className="prospecting-intelligence-v33__actions"><StatusPill tone="info">ICP dinâmico</StatusPill>{topSegment || topCity ? <Button size="sm" variant="secondary" onClick={onUseIcp}><Target size={14}/> Usar ICP na busca</Button> : null}</div></header>
    <div className="prospecting-intelligence-v33__prompt"><Sparkles size={16}/><div><strong>Você pode pedir diretamente à RealTalent Agent</strong><span>“Encontre 30 empresas parecidas com meus melhores clientes”, “priorize as melhores do Garimpo” ou “aprove as 10 primeiras e coloque no CRM para eu trabalhar amanhã”.</span></div></div>
    {ranked.length ? <div className="prospecting-intelligence-v33__ranking">{ranked.slice(0, 3).map(({ prospect, intelligence }, index) => <button type="button" key={prospect.id} onClick={() => onReview(prospect.id)}><span className="prospecting-intelligence-v33__rank">{index + 1}</span><div><strong>{prospect.company}</strong><small>{intelligence.reasons[0] || intelligence.opportunitySignals[0] || 'Score calculado pelos sinais disponíveis'}</small><em>Fit {intelligence.breakdown.fit}/30 · Potencial {intelligence.breakdown.potential}/25 · Contato {intelligence.breakdown.contactability}/20</em></div><b>{intelligence.score}</b></button>)}</div> : <div className="prospecting-intelligence-v33__empty"><span>O ranking aparecerá aqui assim que o Garimpo tiver empresas para analisar.</span>{topSegment ? <small>ICP atual sugere começar por {topSegment}{topCity ? ` em ${topCity}` : ''}.</small> : null}</div>}
  </section>
}

function CampaignStatusBar({ job, baseTotal, busy, technicalOpen, onTechnical, onLocal, onReview, onControl }: {
  job: ProspectingAgentJob; baseTotal: number; busy: boolean; technicalOpen: boolean; onTechnical(): void; onLocal(): void; onReview(): void; onControl(action: 'pause' | 'resume' | 'cancel'): void
}) {
  const active = ['queued', 'running', 'paused'].includes(job.status)
  const coverage = job.coverage?.successfulTerritoryPercent ?? job.coverage?.territoryPercent ?? (job.status === 'completed' ? 100 : 0)
  const ready = job.processing?.ready ?? job.results.filter((item) => item.qualityStatus === 'ready').length
  const attention = job.processing?.attention ?? job.results.filter((item) => item.qualityStatus === 'attention').length
  const failed = job.processing?.failed ?? 0
  const processing = Math.max(0, job.stats.unique - ready - attention - failed)
  const status = job.status === 'running' ? 'Buscando' : job.status === 'paused' ? 'Pausado' : job.status === 'queued' ? 'Preparando' : job.status === 'completed' ? 'Concluído' : job.status === 'failed' ? 'Falhou' : 'Cancelado'
  return <section className={`panel prospecting-campaign-v101106 is-${job.status}`}>
    <div className="prospecting-campaign-v101106__top"><div><span className="eyebrow"><CircleDashed size={13}/> Execução atual · {(job.runtime?.runId || job.id).slice(0, 8)}</span><strong>{job.input.segment || 'Busca de empresas'} · {job.input.regions.join(' · ') || 'território em definição'}</strong><small>{job.runtime?.phaseLabel || job.message || 'Preparando território'}{job.progress.currentRegion ? ` · ${job.progress.currentRegion}` : ''}{job.progress.currentSource ? ` · ${job.progress.currentSource}` : ''}</small></div><div><StatusPill tone={job.status === 'failed' ? 'danger' : active ? 'info' : 'success'}>{status}</StatusPill><span className="prospecting-campaign-v101106__percent">{Math.round(coverage)}%</span></div></div>
    <div className="prospecting-campaign-v101106__track"><span style={{ width: `${Math.max(0, Math.min(100, coverage))}%` }}/></div>
    <div className="prospecting-campaign-v101106__facts prospecting-runtime-facts-h21"><span><small>Brutas</small><strong>{job.processing?.raw ?? job.stats.discovered}</strong></span><span><small>Encontradas</small><strong>{job.stats.unique}</strong></span><span><small>Prontas</small><strong>{ready}</strong></span><span><small>Atenção</small><strong>{attention}</strong></span><span><small>Rejeitadas</small><strong>{(job.stats.scopeRejectedCategory ?? 0) + (job.stats.scopeRejectedLocation ?? 0)}</strong></span><span><small>Base total</small><strong>{baseTotal}</strong></span></div>
    <div className="prospecting-campaign-v101106__actions"><Button size="sm" variant="secondary" onClick={onLocal}><MapPinned size={14}/> Ver no mapa</Button>{attention || ready ? <Button size="sm" variant="secondary" onClick={onReview}><ClipboardCheck size={14}/> Revisar</Button> : null}<Button size="sm" variant="ghost" onClick={onTechnical}><SlidersHorizontal size={14}/> {technicalOpen ? 'Ocultar detalhes' : 'Detalhes da campanha'}</Button>{job.status === 'running' ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => onControl('pause')}><Pause size={14}/> Pausar</Button> : null}{job.status === 'paused' ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => onControl('resume')}><Play size={14}/> Retomar</Button> : null}{active ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => onControl('cancel')}><X size={14}/> Cancelar</Button> : null}</div>
  </section>
}

function SearchWorkspace(props: {
  readOnly: boolean; source: ProspectSource; segment: string; city: string; query: string; quantity: number; quickCapture: string; universalCapture: string; lastSync: string | null
  diagnostics: ProspectingProviderDiagnostics | null; providerBusy: boolean; automationProgress: ProspectingSearchAutomationProgress | null
  agentHealth: ProspectingAgentHealth | null; agentJob: ProspectingAgentJob | null; agentBusy: boolean; agentCadence: ProspectingAgentCadence
  areaMode: ProspectingAreaMode; radiusKm: number; searchMode: ProspectingSearchMode; targetMode: ProspectingTargetMode; categoryMode: ProspectingCategoryMode; mapPolygon: ProspectingGeoPoint[]; mapPreview: ProspectingTerritoryPreview | null; searchCenter: ProspectingGeoPoint | null; mapPreviewBusy: boolean
  onSource(value: ProspectSource): void; onSegment(value: string): void; onCity(value: string): void; onQuery(value: string): void; onQuantity(value: number): void; onQuickCapture(value: string): void; onUniversalCapture(value: string): void
  onAreaMode(value: ProspectingAreaMode): void; onRadiusKm(value: number): void; onSearchMode(value: ProspectingSearchMode): void; onTargetMode(value: ProspectingTargetMode): void; onCategoryMode(value: ProspectingCategoryMode): void; onMapPolygon(value: ProspectingGeoPoint[]): void; onSearchCenter(value: ProspectingGeoPoint): void; onLoadMap(): void
  onOpenSearch(): void; onProviderSearch(): void; onAutomatedSearch(): void; onCancelAutomation(): void; onRefreshProviders(): void; onCapture(): void; onUniversalSubmit(): void; onCopyBookmarklet(): void; onSyncExtension(): void
  onAgentStart(): void; onAgentControl(action: 'pause' | 'resume' | 'cancel'): void; onAgentCadence(value: ProspectingAgentCadence): void; onAgentRefresh(): void
}) {
  const channel = props.source === 'maps' ? props.diagnostics?.maps : props.source === 'cnpj' ? props.diagnostics?.cnpj : props.source === 'instagram' ? props.diagnostics?.instagram : null
  const directReady = Boolean(channel?.available && channel.mode === 'direct')
  const primaryAction = () => {
    if (props.source === 'extension') { props.onSyncExtension(); return }
    if (props.source === 'manual') { document.getElementById('prospecting-quick-capture')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    if (props.source === 'maps' && directReady) { props.onAutomatedSearch(); return }
    if (props.source === 'cnpj' && directReady) { props.onProviderSearch(); return }
    props.onOpenSearch()
  }
  const primaryLabel = props.source === 'extension' ? 'Sincronizar RT Capture'
    : props.source === 'manual' ? 'Ir para captura manual'
      : props.source === 'maps' && directReady ? 'Iniciar busca automática'
        : props.source === 'cnpj' && directReady ? 'Consultar e analisar'
          : 'Abrir busca assistida'
  const sourceHelper = props.source === 'maps'
    ? 'Google Places pode pesquisar automaticamente em várias páginas e regiões, deduplicando os resultados antes de enviar tudo para revisão.'
    : props.source === 'cnpj'
      ? 'A consulta cadastral é individual: informe um CNPJ completo. Não é realizado crawling ou varredura em massa.'
      : props.source === 'instagram'
        ? 'A descoberta permanece assistida para respeitar as capacidades oficiais da rede. O resultado pode ser capturado pela extensão ou colado abaixo.'
        : props.source === 'extension'
          ? 'O RT Capture Browser recebe lotes do navegador. Para navegadores sem extensão, use URL/clipboard ou o Capturador Universal abaixo.'
          : 'Cole ou importe seus próprios dados; o Data Layer normaliza e compara antes de criar empresas para revisão.'

  const agentActive = Boolean(props.agentJob && ['queued', 'running', 'paused'].includes(props.agentJob.status))
  const agentOnline = Boolean(props.agentHealth)
  return <div className="prospecting-search-layout prospecting-search-layout-v10098 prospecting-search-layout-v101102-h1">
    <section className="panel prospecting-search-panel prospecting-search-panel-v101102-h1">
      <header className="panel__heading prospecting-search-panel-v101102-h1__heading"><div><span className="eyebrow"><Search size={14} /> Buscar empresas</span><h3>O que você quer encontrar e onde?</h3><p>Defina o tipo de empresa, a região e a área. As opções avançadas ficam recolhidas até você precisar delas.</p></div></header>

      <section className="prospecting-search-primary-v101106" aria-label="Configuração principal do Garimpo">
        <div className="prospecting-search-primary-v101106__status"><div><span className={`prospecting-search-primary-v101106__dot ${agentOnline ? 'is-online' : 'is-offline'}`}/><span>{agentOnline ? 'Garimpo pronto' : 'Motor local desconectado'}</span></div><button type="button" className="icon-button" title="Verificar conexão" onClick={props.onAgentRefresh}><RefreshCw size={15}/></button></div>
        {agentOnline ? <>
          <div className="prospecting-local-discovery-v101104__planner-grid prospecting-planner-grid-v101106">
            <div className="prospecting-local-discovery-v101104__controls prospecting-search-fields-v101106">
              <div className="prospecting-search-engine-v101103__form prospecting-search-engine-v101106__form">
                <label className="is-wide"><span>O que você procura?</span><input id="prospecting-linux-segment" value={props.segment} onChange={(event) => props.onSegment(event.target.value)} placeholder="Ex.: Barbearias" disabled={props.readOnly || agentActive} /><small>Digite o tipo de empresa. Sinônimos ajudam a entender a intenção, mas a categoria solicitada é validada antes de entrar nos resultados.</small></label>
                <label className="is-wide"><span>Onde?</span><input id="prospecting-linux-regions" value={props.city} onChange={(event) => props.onCity(event.target.value)} placeholder="Ex.: Canoas, RS" disabled={props.readOnly || agentActive} /><small>Cidade, bairro ou região que será usada para montar o território.</small></label>
                <label className="is-wide"><span>Área da busca</span><SelectionSelect value={props.areaMode} onValueChange={(value) => props.onAreaMode(value as ProspectingAreaMode)} disabled={props.readOnly || agentActive} options={[{ value: 'radius', label: 'Raio', description: 'Centro + distância ajustável diretamente no mapa' }, { value: 'city', label: 'Cidade inteira', description: 'Cobrir a área administrativa da cidade' }, { value: 'neighborhoods', label: 'Bairros / regiões', description: 'Direcionar a busca para regiões específicas' }, { value: 'map', label: 'Desenhar no mapa', description: 'Criar um contorno personalizado' }]} /></label>
              </div>
              <div className="prospecting-place-first-v101106 prospecting-strict-scope-v101113-h15"><ShieldCheck size={15}/><div><strong>{props.categoryMode === 'exact' ? 'Correspondência exata ativa' : 'Categorias relacionadas permitidas'}</strong><span>{props.categoryMode === 'exact' ? `Somente ${props.segment.trim() || 'a categoria solicitada'} dentro de ${props.city.trim() || 'a região informada'} entra nos resultados. Artigos, rankings e diretórios não viram empresas automaticamente; diretórios e redes podem gerar pistas de cobertura, sempre marcadas para revisão humana.` : 'O Garimpo pode aceitar categorias semanticamente próximas, mantendo a validação de localização e de estabelecimento.'}</span></div><StatusPill tone={props.categoryMode === 'exact' ? 'info' : 'warning'}>{props.categoryMode === 'exact' ? 'Exata' : 'Ampliada'}</StatusPill></div>
              <div className="prospecting-coverage-truth-h21"><MapPinned size={15}/><div><strong>Cobertura aberta ≠ catálogo do Google Maps</strong><span>O motor local combina OpenStreetMap e web pública. Na busca exata, uma segunda varredura traz candidatos relacionados que podem estar classificados de forma genérica nas bases abertas; eles ficam em Atenção até você confirmar a categoria. Google Places continua opcional quando configurado.</span></div></div>
              <details className="prospecting-search-advanced-v101106">
                <summary><span><SlidersHorizontal size={15}/> Opções da busca</span><small>{props.searchMode === 'coverage' ? 'Máxima cobertura' : props.searchMode === 'fast' ? 'Captura rápida' : 'Menor consumo'} · {props.targetMode === 'max' ? 'máximo possível' : `${props.quantity} empresas`}</small><ChevronRight size={15}/></summary>
                <div className="prospecting-search-advanced-v101106__body">
                  <label><span>Correspondência</span><SelectionSelect value={props.categoryMode} onValueChange={(value) => props.onCategoryMode(value as ProspectingCategoryMode)} disabled={props.readOnly || agentActive} options={[{ value: 'exact', label: 'Somente categoria solicitada', description: 'Rejeita categorias relacionadas e exige confirmação do local' }, { value: 'related', label: 'Incluir categorias relacionadas', description: 'Amplia a descoberta mantendo o filtro geográfico' }]} /></label>
                  <label><span>Estratégia</span><SelectionSelect value={props.searchMode} onValueChange={(value) => props.onSearchMode(value as ProspectingSearchMode)} disabled={props.readOnly || agentActive} options={[{ value: 'coverage', label: 'Máxima cobertura', description: 'Prioriza encontrar mais empresas' }, { value: 'fast', label: 'Captura rápida', description: 'Web e captura primeiro; mostra empresas antes da varredura profunda' }, { value: 'economy', label: 'Menor consumo', description: 'Usa menos recursos locais' }]} /></label>
                  <label><span>Meta</span><SelectionSelect value={props.targetMode} onValueChange={(value) => props.onTargetMode(value as ProspectingTargetMode)} disabled={props.readOnly || agentActive} options={[{ value: 'max', label: 'Encontrar o máximo possível', description: 'Continua enquanto houver ganho útil de cobertura' }, { value: 'quantity', label: 'Quantidade definida', description: 'Encerra ao atingir a meta quando possível' }]} /></label>
                  {props.targetMode === 'quantity' ? <label><span>Quantidade</span><SelectionSelect value={String(props.quantity)} onValueChange={(value) => props.onQuantity(Number(value))} disabled={props.readOnly || agentActive} options={[20, 40, 60, 100, 200, 300].map((value) => ({ value: String(value), label: `${value} empresas` }))} /></label> : null}
                  <label><span>Repetição</span><SelectionSelect value={props.agentCadence} onValueChange={(value) => props.onAgentCadence(value as ProspectingAgentCadence)} disabled={props.readOnly || agentActive} options={[{ value: 'off', label: 'Executar uma vez' }, { value: 'daily', label: 'Todos os dias' }, { value: 'weekly', label: 'Toda semana' }]} /></label>
                </div>
              </details>
            </div>
            <SearchTerritoryPlanner preview={props.mapPreview} center={props.searchCenter} areaMode={props.areaMode} radiusKm={props.radiusKm} polygon={props.mapPolygon} busy={props.mapPreviewBusy} disabled={props.readOnly || agentActive} searchMode={props.searchMode} onLoad={props.onLoadMap} onRadiusKm={props.onRadiusKm} onCenter={props.onSearchCenter} />
          </div>
          {props.areaMode === 'map' ? <TerritoryAreaSelector preview={props.mapPreview} polygon={props.mapPolygon} busy={props.mapPreviewBusy} disabled={props.readOnly || agentActive} onLoad={props.onLoadMap} onPolygon={props.onMapPolygon} /> : null}
          <div className="prospecting-search-primary-v101106__actions"><Button disabled={props.readOnly || props.agentBusy || agentActive || !props.segment.trim() || !props.city.trim()} loading={props.agentBusy && !props.agentJob} onClick={props.onAgentStart}><Zap size={16}/> {agentActive ? 'Busca em andamento' : 'Iniciar busca'}</Button><span>{!props.segment.trim() || !props.city.trim() ? 'Informe o que procura e onde.' : props.mapPreview ? 'Território pronto para executar.' : 'Carregue o mapa para confirmar a área.'}</span></div>
        </> : <div className="prospecting-agent-v101102-h1__offline prospecting-agent-offline-v101106"><div><AlertTriangle size={18}/><div><strong>O motor local não está conectado.</strong><span>Abra o CRM pelo <code>start-linux.sh</code> ou mantenha o serviço <code>realtalent-prospecting-agent</code> ativo.</span></div></div><div><Button onClick={props.onAgentRefresh}><RefreshCw size={16}/> Tentar conectar</Button><Button variant="secondary" onClick={() => openExternalUrl('http://127.0.0.1:4319/')}><ExternalLink size={16}/> Abrir diagnóstico</Button></div></div>}
      </section>

      <details className="prospecting-alternatives-v101102-h1">
        <summary><div><Globe2 size={17}/><div><strong>Capturar do navegador / Google Maps</strong><span>Use a captura assistida para trazer os resultados visíveis para o Garimpo e enriquecer depois.</span></div></div><ChevronRight size={17}/></summary>
        <div className="prospecting-alternatives-v101102-h1__body">
          <div className="prospecting-source-grid">{(['maps', 'instagram', 'cnpj', 'extension', 'manual'] as ProspectSource[]).map((item) => {
            const Icon = sourceIcons[item]
            const status = item === 'maps' ? props.diagnostics?.maps : item === 'cnpj' ? props.diagnostics?.cnpj : item === 'instagram' ? props.diagnostics?.instagram : null
            const badge = item === 'extension' ? 'Browser' : item === 'manual' ? 'Manual' : status?.available && status.mode === 'direct' ? 'API' : 'Assistido'
            return <button type="button" key={item} className={props.source === item ? 'is-active' : ''} onClick={() => props.onSource(item)}><span><Icon size={19} /></span><strong>{prospectSourceLabels[item]}</strong><small>{item === 'maps' ? 'Busca local e contatos' : item === 'instagram' ? 'Perfil e presença digital' : item === 'cnpj' ? 'Dados cadastrais' : item === 'extension' ? 'Chrome, Edge, Firefox e outros' : 'Entrada própria'}</small><em className={`prospecting-source-badge-v10098 is-${status?.available && status.mode === 'direct' ? 'direct' : 'assisted'}`}>{badge}</em></button>
          })}</div>

          <section className="prospecting-provider-health-v10098" aria-label="Status das fontes de prospecção">
            <header><div><ShieldCheck size={16} /><div><strong>Fontes opcionais</strong><span>{props.diagnostics?.runtime === 'supabase' ? 'Gateway Supabase' : props.diagnostics?.runtime === 'local-vite' ? 'Gateway local Linux' : 'Modo assistido'}</span></div></div><button type="button" className="icon-button" title="Atualizar status" onClick={props.onRefreshProviders}><RefreshCw size={15} /></button></header>
            <div>{([
              ['Google Places', props.diagnostics?.maps],
              ['CNPJ', props.diagnostics?.cnpj],
              ['Instagram', props.diagnostics?.instagram],
            ] as const).map(([label, status]) => <article key={label} className={status?.available && status.mode === 'direct' ? 'is-ready' : 'is-assisted'}><span>{status?.available && status.mode === 'direct' ? <CheckCircle2 size={15} /> : <ExternalLink size={15} />}</span><div><strong>{label}</strong><small>{status?.message ?? 'Verificando disponibilidade...'}</small></div><em>{status?.available && status.mode === 'direct' ? 'Direto' : 'Assistido'}</em></article>)}</div>
          </section>

          {props.source === 'cnpj' ? <div className="prospecting-form-grid prospecting-form-grid-v10098">
            <label className="is-wide"><span>CNPJ para consulta</span><input value={props.query} onChange={(event) => props.onQuery(event.target.value)} inputMode="numeric" placeholder="00.000.000/0000-00" /></label>
          </div> : props.source === 'extension' || props.source === 'manual' ? <div className="prospecting-source-instruction-v10098"><Database size={18} /><div><strong>{props.source === 'extension' ? 'Entrada pelo RT Capture Browser' : 'Importação e captura próprias'}</strong><p>{sourceHelper}</p></div></div> : <div className="prospecting-form-grid prospecting-form-grid-v10098">
            <label><span>Segmento</span><input value={props.segment} onChange={(event) => props.onSegment(event.target.value)} placeholder="Ex.: Barbearias" /></label>
            <label><span>Cidade ou região</span><input value={props.city} onChange={(event) => props.onCity(event.target.value)} placeholder="Ex.: Canoas, RS; Esteio, RS" /><small>Separe várias regiões com ponto e vírgula.</small></label>
            <label className="is-wide"><span>Busca específica</span><input value={props.query} onChange={(event) => props.onQuery(event.target.value)} placeholder="Opcional: nome, bairro ou palavra-chave" /></label>
            {props.source === 'maps' ? <label><span>Meta da busca automática</span><NativeSelectionSelect value={props.quantity} onChange={(event) => props.onQuantity(Number(event.target.value))}><option value={20}>20 empresas</option><option value={40}>40 empresas</option><option value={60}>60 empresas</option><option value={80}>80 empresas</option><option value={100}>100 empresas</option></NativeSelectionSelect></label> : null}
          </div>}
          <p className="prospecting-source-helper-v10098">{sourceHelper}</p>
          <div className="prospecting-search-actions"><Button disabled={props.readOnly || props.providerBusy} loading={props.providerBusy} onClick={primaryAction}>{props.source === 'maps' && directReady ? <Search size={17} /> : props.source === 'cnpj' && directReady ? <Database size={17} /> : props.source === 'extension' ? <RefreshCw size={17} /> : <ExternalLink size={17} />} {primaryLabel}</Button>{channel ? <span>{channel.provider} · {props.source === 'maps' && directReady ? 'paginação automática · até 100 únicos' : channel.mode === 'direct' && channel.available ? `até ${channel.maxResults} resultado(s) por consulta` : 'fluxo assistido disponível'}</span> : <span>O Data Layer mantém identidade, origem e duplicidade no mesmo fluxo.</span>}</div>
          {props.source === 'maps' && props.automationProgress ? <section className={`prospecting-automation-v101101 is-${props.automationProgress.status}`}><header><div><strong>Busca automática</strong><span>{props.automationProgress.message}</span></div><em>{props.automationProgress.uniqueFound}/{props.automationProgress.targetQuantity}</em></header><div className="prospecting-automation-v101101__track"><span style={{ width: `${Math.min(100, (props.automationProgress.uniqueFound / Math.max(1, props.automationProgress.targetQuantity)) * 100)}%` }} /></div><footer><span>{props.automationProgress.requestsCompleted} de {props.automationProgress.maxRequests} consulta(s)</span><span>{props.automationProgress.currentArea || 'Região principal'}{props.automationProgress.currentQuery ? ` · ${props.automationProgress.currentQuery}` : ''}</span>{['planning','searching'].includes(props.automationProgress.status) ? <Button variant="secondary" size="sm" onClick={props.onCancelAutomation}><X size={14}/> Cancelar</Button> : null}</footer></section> : null}
        </div>
      </details>
    </section>

    <details className="panel prospecting-capture-tools-v101106">
      <summary><div><Plus size={16}/><span><strong>Outras formas de adicionar empresas</strong><small>Navegador, URL, extensão, CNPJ ou colagem manual</small></span></div><ChevronRight size={16}/></summary>
      <div className="prospecting-capture-tools-v101106__body">
    <aside className="panel prospecting-extension-card">
      <header><span><Zap size={20} /></span><div><small>Captura pelo navegador</small><strong>Caixa de entrada do navegador</strong></div><StatusPill tone="success">Pronta</StatusPill></header>
      <p>Chrome, Edge, Brave e Firefox podem usar a extensão ou o Capturador Universal. Sem extensão, URL e clipboard continuam disponíveis.</p>
      <div className="prospecting-extension-flow"><span>Capturar</span><ArrowRight size={14} /><span>Analisar</span><ArrowRight size={14} /><span>Revisar</span><ArrowRight size={14} /><span>Enviar</span></div>
      <div className="prospecting-extension-status"><Inbox size={17} /><div><strong>{props.lastSync ? `Última sincronização: ${formatDateTime(props.lastSync)}` : 'Nenhuma sincronização realizada'}</strong><span>Importação sem reenvio do mesmo registro.</span></div></div>
      {!props.readOnly ? <Button variant="secondary" onClick={props.onSyncExtension}><RefreshCw size={16} /> Sincronizar agora</Button> : null}
    </aside>

    <section className="panel prospecting-browser-capture-h3" aria-label="Captura universal no navegador">
      <div className="prospecting-browser-capture-h3__intro"><div><span className="eyebrow"><Globe2 size={14}/> Captura universal</span><h3>Capturar de qualquer navegador</h3><p>Use uma URL, cole dados do clipboard ou instale o Capturador Universal como favorito. A captura abre o RealTalent com a página atual, sem depender exclusivamente de extensão Chrome.</p></div><StatusPill tone="success">Multinavegador</StatusPill></div>
      <div className="prospecting-browser-capture-h3__grid">
        <div className="prospecting-browser-capture-h3__box"><header><span><Link2 size={17}/></span><div><strong>URL ou clipboard</strong><small>Google Maps, Instagram, sites, CNPJ ou linha estruturada</small></div></header><div className="prospecting-browser-capture-h3__input-row"><input readOnly={props.readOnly} value={props.universalCapture} onChange={(event) => props.onUniversalCapture(event.target.value)} placeholder="Cole uma URL ou: Empresa | Telefone | Cidade | Instagram/site/CNPJ" />{!props.readOnly ? <Button onClick={props.onUniversalSubmit}><ClipboardCheck size={16}/> Capturar</Button> : null}</div><div className="prospecting-browser-capture-h3__tips"><span>Chrome</span><span>Firefox</span><span>Edge</span><span>Brave</span><span>Safari desktop*</span><span>Sem API obrigatória</span></div></div>
        <div className="prospecting-browser-capture-h3__box prospecting-browser-capture-h3__bookmarklet"><header><span><Globe2 size={17}/></span><div><strong>Capturador Universal</strong><small>Favorito/bookmarklet — envia URL, título e texto selecionado ao CRM</small></div></header><code>javascript:… → RealTalent / Garimpo</code>{!props.readOnly ? <Button variant="secondary" onClick={props.onCopyBookmarklet}><Clipboard size={16}/> Copiar Capturador Universal</Button> : null}</div>
      </div>
    </section>

    <section id="prospecting-quick-capture" className="panel prospecting-quick-capture">
      <header className="panel__heading"><div><span className="eyebrow"><ClipboardList size={14} /> Captura assistida</span><h3>Cole os resultados encontrados</h3><p>Uma empresa por linha. O Garimpo separa os campos e evita repetições.</p></div><span className="prospecting-format-hint">Nome | Telefone | Cidade | Instagram, site ou CNPJ | Observação</span></header>
      <textarea readOnly={props.readOnly} value={props.quickCapture} onChange={(event) => props.onQuickCapture(event.target.value)} placeholder={'Barbearia Exemplo | (51) 99999-9999 | Canoas | @barbeariaexemplo | Usa agenda manual\nOutra Empresa | (51) 98888-8888 | Porto Alegre | https://site.com.br'} />
      <footer><div><ShieldCheck size={17} /><span>Telefone, CNPJ, Instagram, domínio, nome e cidade são comparados antes de salvar.</span></div>{!props.readOnly ? <Button onClick={props.onCapture}><Sparkles size={17} /> Capturar e analisar</Button> : null}</footer>
    </section>
      </div>
    </details>
  </div>
}



function SearchTerritoryPlanner({ preview, center, areaMode, radiusKm, polygon, busy, disabled, searchMode, onLoad, onRadiusKm, onCenter }: {
  preview: ProspectingTerritoryPreview | null; center: ProspectingGeoPoint | null; areaMode: ProspectingAreaMode; radiusKm: number; polygon: ProspectingGeoPoint[]; busy: boolean; disabled: boolean; searchMode: ProspectingSearchMode
  onLoad(): void; onRadiusKm(value: number): void; onCenter(value: ProspectingGeoPoint): void
}) {
  const [dragMode, setDragMode] = useState<'center' | 'radius' | null>(null)
  if (!preview) return <section className="prospecting-radius-planner-v101104 is-empty"><div><MapPinned size={20}/><div><strong>Prévia territorial</strong><span>Carregue a cidade para confirmar visualmente onde o Garimpo vai procurar empresas.</span></div></div><Button variant="secondary" loading={busy} disabled={disabled || busy} onClick={onLoad}><MapPinned size={16}/> Carregar mapa</Button></section>

  const activeCenter = center ?? preview.center
  const radiusLat = radiusKm / 111.32
  const lonScale = Math.max(0.15, 111.32 * Math.cos(activeCenter.lat * Math.PI / 180))
  const radiusLon = radiusKm / lonScale
  const mapBounds = areaMode === 'radius' ? {
    south: Math.min(preview.bbox.south, activeCenter.lat - radiusLat * 1.18), north: Math.max(preview.bbox.north, activeCenter.lat + radiusLat * 1.18),
    west: Math.min(preview.bbox.west, activeCenter.lon - radiusLon * 1.18), east: Math.max(preview.bbox.east, activeCenter.lon + radiusLon * 1.18),
  } : preview.bbox
  const lonSpan = Math.max(0.000001, mapBounds.east - mapBounds.west)
  const latSpan = Math.max(0.000001, mapBounds.north - mapBounds.south)
  const project = (point: ProspectingGeoPoint) => ({ x: ((point.lon - mapBounds.west) / lonSpan) * 1000, y: ((mapBounds.north - point.lat) / latSpan) * 600 })
  const centerPx = project(activeCenter)
  const rx = Math.abs(project({ lat: activeCenter.lat, lon: activeCenter.lon + radiusLon }).x - centerPx.x)
  const ry = Math.abs(project({ lat: activeCenter.lat + radiusLat, lon: activeCenter.lon }).y - centerPx.y)
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${mapBounds.west},${mapBounds.south},${mapBounds.east},${mapBounds.north}`)}&layer=mapnik`
  const pointFromEvent = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(); if (!rect.width || !rect.height) return null
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)); const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    return { lon: mapBounds.west + x * lonSpan, lat: mapBounds.north - y * latSpan }
  }
  const areaKm2 = areaMode === 'radius' ? Math.PI * radiusKm * radiusKm : Math.max(0, (preview.bbox.north - preview.bbox.south) * 111.32 * (preview.bbox.east - preview.bbox.west) * lonScale)
  const estimatedCells = Math.max(1, Math.round(areaKm2 / (searchMode === 'coverage' ? 18 : searchMode === 'economy' ? 45 : 80)))
  const loadLabel = areaMode === 'radius' ? `${radiusKm} km de raio` : areaMode === 'city' ? 'Cidade inteira' : areaMode === 'map' ? `${polygon.length} pontos desenhados` : 'Bairros / regiões'
  const workload = estimatedCells <= 8 ? 'Baixa' : estimatedCells <= 24 ? 'Média' : estimatedCells <= 60 ? 'Alta' : 'Muito alta'

  return <section className="prospecting-radius-planner-v101104">
    <header><div><MapPinned size={17}/><div><strong>Onde vamos procurar</strong><small>{preview.displayName}</small></div></div><StatusPill tone="info">{loadLabel}</StatusPill></header>
    <div className="prospecting-radius-planner-v101104__canvas">
      <iframe title="Prévia da área de busca do Garimpo" src={mapUrl} loading="lazy" referrerPolicy="no-referrer" />
      <svg viewBox="0 0 1000 600" preserveAspectRatio="none" onPointerMove={(event) => {
        if (!dragMode || disabled || areaMode !== 'radius') return
        const point = pointFromEvent(event); if (!point) return
        if (dragMode === 'center') { onCenter(point); return }
        const latKm = (point.lat - activeCenter.lat) * 111.32
        const lonKm = (point.lon - activeCenter.lon) * lonScale
        onRadiusKm(Math.max(1, Math.min(100, Math.round(Math.sqrt(latKm * latKm + lonKm * lonKm)))))
      }} onPointerUp={() => setDragMode(null)} onPointerCancel={() => setDragMode(null)}>
        {areaMode === 'radius' ? <><ellipse className="prospecting-radius-planner-v101104__radius" cx={centerPx.x} cy={centerPx.y} rx={Math.max(4, rx)} ry={Math.max(4, ry)} /><circle className="prospecting-radius-planner-v101104__center" cx={centerPx.x} cy={centerPx.y} r={13} onPointerDown={(event) => { if (disabled) return; event.stopPropagation(); setDragMode('center'); event.currentTarget.setPointerCapture(event.pointerId) }}><title>Arraste para mover o centro da busca</title></circle><circle className="prospecting-radius-planner-v101106__radius-handle" cx={centerPx.x + Math.max(4, rx)} cy={centerPx.y} r={10} onPointerDown={(event) => { if (disabled) return; event.stopPropagation(); setDragMode('radius'); event.currentTarget.setPointerCapture(event.pointerId) }}><title>Arraste para aumentar ou reduzir o raio</title></circle></> : null}
      </svg>
      {areaMode === 'radius' ? <div className="prospecting-radius-planner-v101104__hint">Arraste o centro para mover a busca ou a alça na borda para ajustar o raio.</div> : areaMode === 'map' ? <div className="prospecting-radius-planner-v101104__hint">Use o editor abaixo para desenhar o contorno.</div> : null}
    </div>
    {areaMode === 'radius' ? <div className="prospecting-radius-planner-v101104__radius-controls"><div className="prospecting-radius-planner-v101104__presets">{[2,5,10,15,25,50].map((value) => <button type="button" key={value} className={radiusKm === value ? 'is-active' : ''} disabled={disabled} onClick={() => onRadiusKm(value)}>{value} km</button>)}</div><label><span>Raio</span><input type="range" min={2} max={50} step={1} value={radiusKm} disabled={disabled} onChange={(event) => onRadiusKm(Number(event.target.value))}/><input type="number" min={1} max={100} value={radiusKm} disabled={disabled} onChange={(event) => onRadiusKm(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}/><em>km</em></label></div> : null}
    <footer><span><small>Área estimada</small><strong>{areaKm2 < 100 ? areaKm2.toFixed(1) : Math.round(areaKm2)} km²</strong></span><span><small>Células previstas</small><strong>~{estimatedCells}</strong></span><span><small>Carga</small><strong>{workload}</strong></span><Button size="sm" variant="secondary" disabled={disabled || busy} loading={busy} onClick={onLoad}><RefreshCw size={14}/> Recarregar região</Button></footer>
  </section>
}

function LocalWorkspace({ prospects, job, onOpenReview }: { prospects: ProspectRecord[]; job: ProspectingAgentJob | null; onOpenReview(id: string): void }) {
  const [view, setView] = useState<'companies' | 'density' | 'coverage'>('companies')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'ready' | 'attention' | 'phone' | 'no-phone'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const visibleProspects = useMemo(() => prospects.filter((prospect) => {
    const term = normalize(query)
    if (term && !normalize(`${prospect.company} ${prospect.city} ${prospect.address} ${prospect.phone} ${prospect.website}`).includes(term)) return false
    const quality = prospectDataQuality(prospect)
    if (filter === 'ready' && !prospectIsAutoValidatable(prospect)) return false
    if (filter === 'attention' && prospectIsAutoValidatable(prospect)) return false
    if (filter === 'phone' && !prospect.phone) return false
    if (filter === 'no-phone' && prospect.phone) return false
    return prospect.status !== 'discarded'
  }), [filter, prospects, query])
  const located = useMemo(() => visibleProspects.map((prospect) => ({ prospect, point: prospectGeoPoint(prospect) })).filter((item): item is { prospect: ProspectRecord; point: ProspectingGeoPoint } => Boolean(item.point)), [visibleProspects])
  useEffect(() => { if (selectedId && !visibleProspects.some((prospect) => prospect.id === selectedId)) setSelectedId(null) }, [selectedId, visibleProspects])
  const selected = visibleProspects.find((prospect) => prospect.id === selectedId) ?? null

  if (view === 'coverage') return <div className="prospecting-local-workspace-v101104"><LocalToolbar view={view} query={query} filter={filter} total={visibleProspects.length} onView={setView} onQuery={setQuery} onFilter={setFilter}/>{job ? <TerritoryCoverageMap job={job}/> : <EmptyState icon={MapPinned} title="Nenhuma campanha territorial carregada" description="Inicie uma busca para visualizar as células de cobertura."/>}</div>

  let mapPane: ReactNode
  if (!located.length) {
    mapPane = <div className="prospecting-local-workspace-v101104__map is-empty prospecting-local-empty-v101106"><div><span><MapPinned size={22}/></span><strong>Sem pontos confirmados neste recorte</strong><p>As empresas continuam na lista. O mapa só cria um marcador quando há coordenadas confiáveis.</p></div></div>
  } else {
    const west0 = Math.min(...located.map(({ point }) => point.lon)); const east0 = Math.max(...located.map(({ point }) => point.lon)); const south0 = Math.min(...located.map(({ point }) => point.lat)); const north0 = Math.max(...located.map(({ point }) => point.lat))
    const padLon = Math.max(0.008, (east0 - west0) * 0.12); const padLat = Math.max(0.008, (north0 - south0) * 0.12)
    const west = west0 - padLon; const east = east0 + padLon; const south = south0 - padLat; const north = north0 + padLat; const lonSpan = Math.max(0.000001, east - west); const latSpan = Math.max(0.000001, north - south)
    const project = (point: ProspectingGeoPoint) => ({ x: ((point.lon - west) / lonSpan) * 1000, y: ((north - point.lat) / latSpan) * 600 })
    const buckets = new Map<string, Array<{ prospect: ProspectRecord; point: ProspectingGeoPoint; x: number; y: number }>>()
    for (const item of located) { const projected = project(item.point); const key = `${Math.floor(projected.x / 75)}:${Math.floor(projected.y / 75)}`; const bucket = buckets.get(key) ?? []; bucket.push({ ...item, ...projected }); buckets.set(key, bucket) }
    const clusters = [...buckets.values()].map((items) => ({ items, x: items.reduce((sum, item) => sum + item.x, 0) / items.length, y: items.reduce((sum, item) => sum + item.y, 0) / items.length }))
    const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${west},${south},${east},${north}`)}&layer=mapnik`
    mapPane = <div className="prospecting-local-workspace-v101104__map"><iframe title="Mapa de empresas encontradas" src={mapUrl} loading="lazy" referrerPolicy="no-referrer"/><svg viewBox="0 0 1000 600" preserveAspectRatio="none">
      {clusters.map((cluster, index) => { const only = cluster.items.length === 1 ? cluster.items[0].prospect : null; const readiness = only ? prospectDataQuality(only).readiness : 'review'; const cls = only?.status === 'approved' || readiness === 'ready' ? 'is-ready' : readiness === 'blocked' ? 'is-attention' : 'is-found'; const radius = view === 'density' ? Math.min(52, 14 + Math.sqrt(cluster.items.length) * 10) : cluster.items.length > 1 ? 22 : 11; return <g key={`${index}-${cluster.x}-${cluster.y}`} className={`prospecting-local-marker-v101104 ${cls} ${only?.id === selectedId ? 'is-selected' : ''}`} onClick={() => { if (only) setSelectedId(only.id) }}><circle cx={cluster.x} cy={cluster.y} r={radius}/>{cluster.items.length > 1 ? <text x={cluster.x} y={cluster.y + 5} textAnchor="middle">{cluster.items.length}</text> : null}<title>{only ? `${only.company} · ${only.city}` : `${cluster.items.length} empresas nesta área`}</title></g> })}
    </svg><div className="prospecting-local-workspace-v101104__legend"><span className="is-found">Encontrada</span><span className="is-ready">Pronta/aprovada</span><span className="is-attention">Atenção</span></div></div>
  }

  return <div className="prospecting-local-workspace-v101104">
    <LocalToolbar view={view} query={query} filter={filter} total={visibleProspects.length} onView={setView} onQuery={setQuery} onFilter={setFilter}/>
    <section className="prospecting-local-workspace-v101104__split">
      {mapPane}
      <aside className="prospecting-local-workspace-v101104__list">
        {selected ? <article className="prospecting-local-detail-v101104"><header><div><span className="eyebrow"><MapPinned size={13}/> Local selecionado</span><h3>{selected.company}</h3><p>{selected.address || selected.city || 'Endereço em validação'}</p></div><StatusPill tone={prospectIsAutoValidatable(selected) ? 'success' : 'warning'}>{prospectIsAutoValidatable(selected) ? 'Pronta' : 'Precisa atenção'}</StatusPill></header><div className="prospecting-local-detail-v101104__facts"><span><Phone size={14}/>{selected.phone || 'Sem telefone'}</span><span><Globe2 size={14}/>{selected.website || 'Sem website'}</span><span><ShieldCheck size={14}/>Local {prospectPlaceConfidence(selected)}%</span></div><Button onClick={() => onOpenReview(selected.id)}><ClipboardCheck size={15}/> Revisar empresa</Button></article> : null}
        <header><div><strong>{visibleProspects.length} empresa(s)</strong><small>{located.length} com coordenadas confirmadas · clique em um card para localizar quando disponível.</small></div></header>
        <div>{visibleProspects.slice(0, 160).map((prospect) => { const quality = prospectDataQuality(prospect); const hasPoint = Boolean(prospectGeoPoint(prospect)); const ready = prospectIsAutoValidatable(prospect); return <button type="button" key={prospect.id} className={prospect.id === selectedId ? 'is-active' : ''} onClick={() => setSelectedId(prospect.id)}><span className={`prospecting-local-workspace-v101104__status ${ready ? 'is-ready' : quality.readiness === 'blocked' ? 'is-blocked' : 'is-review'}`}/><div><strong>{prospect.company}</strong><small>{prospect.address || prospect.city || (hasPoint ? 'Localização confirmada por coordenadas' : 'Local validado sem coordenadas')}</small><em>{prospect.phone || prospect.website || 'Sem contato confirmado'}</em></div><span>{quality.score}%</span></button> })}</div>
      </aside>
    </section>
  </div>
}

function LocalToolbar({ view, query, filter, total, onView, onQuery, onFilter }: { view: 'companies' | 'density' | 'coverage'; query: string; filter: 'all' | 'ready' | 'attention' | 'phone' | 'no-phone'; total: number; onView(value: 'companies' | 'density' | 'coverage'): void; onQuery(value: string): void; onFilter(value: 'all' | 'ready' | 'attention' | 'phone' | 'no-phone'): void }) {
  return <section className="panel prospecting-local-toolbar-v101104 prospecting-local-toolbar-v101106"><div><span className="eyebrow"><MapPinned size={14}/> Local</span><h3>Onde estão as empresas</h3><p>Use o mapa para entender concentração e a lista para decidir qual empresa abrir ou revisar.</p></div><div className="prospecting-local-toolbar-v101104__controls"><div className="prospecting-local-toolbar-v101104__views">{([['companies','Empresas'],['density','Densidade'],['coverage','Cobertura']] as const).map(([value,label]) => <button type="button" className={view === value ? 'is-active' : ''} key={value} onClick={() => onView(value)}>{label}</button>)}</div><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Buscar empresa ou local"/><FilterSelection label="Mostrar" value={filter} onValueChange={(value) => onFilter(value as typeof filter)} options={[{ value: 'all', label: `Todas (${total})` }, { value: 'ready', label: 'Prontas' }, { value: 'attention', label: 'Precisam atenção' }, { value: 'phone', label: 'Com telefone' }, { value: 'no-phone', label: 'Sem telefone' }]} /></div></section>
}


function TerritoryAreaSelector({ preview, polygon, busy, disabled, onLoad, onPolygon }: {
  preview: ProspectingTerritoryPreview | null; polygon: ProspectingGeoPoint[]; busy: boolean; disabled: boolean
  onLoad(): void; onPolygon(value: ProspectingGeoPoint[]): void
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  if (!preview) {
    return <section className="prospecting-territory-selector-v101103-h1 is-empty">
      <div><MapPinned size={18}/><div><strong>Defina a área no mapa</strong><span>Carregue a cidade/região e depois marque pelo menos 3 pontos formando o contorno da busca.</span></div></div>
      <Button variant="secondary" loading={busy} disabled={disabled || busy} onClick={onLoad}><MapPinned size={16}/> Carregar mapa</Button>
    </section>
  }

  const { west, east, south, north } = preview.bbox
  const lonSpan = Math.max(0.000001, east - west)
  const latSpan = Math.max(0.000001, north - south)
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${west},${south},${east},${north}`)}&layer=mapnik`
  const project = (point: ProspectingGeoPoint) => ({ x: ((point.lon - west) / lonSpan) * 1000, y: ((north - point.lat) / latSpan) * 600 })
  const points = polygon.map(project)
  const pointsAttr = points.map((point) => `${point.x},${point.y}`).join(' ')
  const areaKm2 = (() => {
    if (polygon.length < 3) return 0
    const latMid = polygon.reduce((sum, point) => sum + point.lat, 0) / polygon.length
    const kmLat = 111.32
    const kmLon = 111.32 * Math.max(0.15, Math.cos(latMid * Math.PI / 180))
    let area = 0
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index]; const b = polygon[(index + 1) % polygon.length]
      area += (a.lon * kmLon) * (b.lat * kmLat) - (b.lon * kmLon) * (a.lat * kmLat)
    }
    return Math.abs(area) / 2
  })()
  const pointFromEvent = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    const ratioX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const ratioY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    return { lon: west + ratioX * lonSpan, lat: north - ratioY * latSpan }
  }
  const addPoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (disabled || dragIndex !== null) return
    const point = pointFromEvent(event)
    if (!point) return
    setSelectedIndex(polygon.length)
    onPolygon([...polygon, point])
  }
  const movePoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (disabled || dragIndex === null) return
    const point = pointFromEvent(event)
    if (!point) return
    const next = polygon.map((item, index) => index === dragIndex ? point : item)
    onPolygon(next)
  }
  const deleteSelected = () => {
    if (selectedIndex === null) return
    onPolygon(polygon.filter((_, index) => index !== selectedIndex))
    setSelectedIndex(null)
    setDragIndex(null)
  }

  return <section className={`prospecting-territory-selector-v101103-h1 prospecting-territory-selector-v101103-h9 ${polygon.length >= 3 ? 'is-ready' : ''}`}>
    <header>
      <div><MapPinned size={17}/><div><strong>Desenhar território</strong><small>{preview.displayName}</small></div></div>
      <StatusPill tone={polygon.length >= 3 ? 'success' : 'warning'}>{polygon.length >= 3 ? 'Área pronta' : `${polygon.length}/3 pontos`}</StatusPill>
    </header>
    <div className="prospecting-territory-selector-v101103-h1__canvas">
      <iframe title="Mapa para desenhar o território do Garimpo" src={mapUrl} loading="lazy" referrerPolicy="no-referrer" />
      <svg viewBox="0 0 1000 600" preserveAspectRatio="none" onPointerDown={addPoint} onPointerMove={movePoint} onPointerUp={() => setDragIndex(null)} onPointerCancel={() => setDragIndex(null)} aria-label="Clique para desenhar e arraste os vértices para ajustar o polígono de busca">
        {polygon.length >= 3 ? <polygon points={pointsAttr} /> : points.length >= 2 ? <polyline points={pointsAttr} /> : null}
        {points.map((point, index) => <circle
          key={`${index}-${point.x}-${point.y}`}
          className={selectedIndex === index ? 'is-selected-vertex' : ''}
          cx={point.x} cy={point.y} r={selectedIndex === index ? 12 : index === 0 ? 10 : 8}
          onPointerDown={(event) => { if (disabled) return; event.stopPropagation(); setSelectedIndex(index); setDragIndex(index); event.currentTarget.setPointerCapture(event.pointerId) }}
          onClick={(event) => { event.stopPropagation(); setSelectedIndex(index) }}
        ><title>{`Ponto ${index + 1} · arraste para ajustar`}</title></circle>)}
      </svg>
      {!polygon.length ? <div className="prospecting-territory-selector-v101103-h1__hint">Clique no mapa em sequência para contornar a área.</div> : <div className="prospecting-territory-selector-v101103-h1__hint">Arraste os pontos para ajustar o território.</div>}
    </div>
    <footer>
      <div><strong>{polygon.length} ponto(s)</strong><span>{polygon.length >= 3 ? `Área aproximada: ${areaKm2 < 10 ? areaKm2.toFixed(2) : areaKm2.toFixed(1)} km²` : 'Adicione pelo menos 3 pontos.'}</span></div>
      <div>
        <Button size="sm" variant="secondary" disabled={disabled || selectedIndex === null} onClick={deleteSelected}>Excluir ponto</Button>
        <Button size="sm" variant="secondary" disabled={disabled || !polygon.length} onClick={() => { onPolygon(polygon.slice(0, -1)); setSelectedIndex(null) }}>Desfazer</Button>
        <Button size="sm" variant="ghost" disabled={disabled || !polygon.length} onClick={() => { onPolygon([]); setSelectedIndex(null) }}><Trash2 size={14}/> Limpar</Button>
        <Button size="sm" variant="secondary" disabled={disabled || busy} onClick={onLoad}><RefreshCw size={14}/> Recarregar mapa</Button>
      </div>
    </footer>
  </section>
}

function TerritoryCoverageMap({ job }: { job: ProspectingAgentJob }) {
  const cells = (job.plan?.cells ?? []).filter((cell) => cell.bbox && cell.status !== 'subdivided')
  if (!cells.length) {
    return <section className="prospecting-territory-map-v101103 is-fallback">
      <header><div><MapPinned size={16}/><div><strong>Cobertura territorial</strong><small>A área administrativa está sendo processada sem geometria disponível para o mapa.</small></div></div><StatusPill tone="info">{job.progress.currentRegion || 'Planejando'}</StatusPill></header>
    </section>
  }

  const selectedPolygon = ['polygon','circle'].includes(job.plan?.geometry?.type ?? '') ? (job.plan?.geometry?.polygon ?? job.input.mapPolygon ?? []) : []
  const west = Math.min(...cells.map((cell) => cell.bbox!.west), ...selectedPolygon.map((point) => point.lon))
  const east = Math.max(...cells.map((cell) => cell.bbox!.east), ...selectedPolygon.map((point) => point.lon))
  const south = Math.min(...cells.map((cell) => cell.bbox!.south), ...selectedPolygon.map((point) => point.lat))
  const north = Math.max(...cells.map((cell) => cell.bbox!.north), ...selectedPolygon.map((point) => point.lat))
  const lonSpan = Math.max(0.000001, east - west)
  const latSpan = Math.max(0.000001, north - south)
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${west},${south},${east},${north}`)}&layer=mapnik`
  const statusLabel = (status: string) => status === 'completed' ? 'Concluída' : status === 'running' ? 'Em busca' : status === 'failed' ? 'Falhou' : 'Pendente'

  return <section className="prospecting-territory-map-v101103">
    <header>
      <div><MapPinned size={16}/><div><strong>Mapa de cobertura</strong><small>{cells.length} célula(s) · profundidade {job.coverage?.deepestSubdivisionLevel ?? 0} · {job.coverage?.subdivisionCount ?? 0} subdivisão(ões)</small></div></div>
      <div className="prospecting-territory-map-v101103__legend"><span className="is-completed">Concluída</span><span className="is-running">Em busca</span><span className="is-pending">Pendente</span><span className="is-failed">Falhou</span></div>
    </header>
    <div className="prospecting-territory-map-v101103__canvas">
      <iframe title="Mapa territorial do Garimpo" src={mapUrl} loading="lazy" referrerPolicy="no-referrer" />
      <svg viewBox="0 0 1000 600" preserveAspectRatio="none" aria-label="Células de cobertura territorial">
        {selectedPolygon.length >= 3 ? <polygon className="is-selected-territory" points={selectedPolygon.map((point) => `${((point.lon - west) / lonSpan) * 1000},${((north - point.lat) / latSpan) * 600}`).join(' ')} /> : null}
        {cells.map((cell) => {
          const box = cell.bbox!
          const x = ((box.west - west) / lonSpan) * 1000
          const width = Math.max(2, ((box.east - box.west) / lonSpan) * 1000)
          const y = ((north - box.north) / latSpan) * 600
          const height = Math.max(2, ((box.north - box.south) / latSpan) * 600)
          return <rect key={cell.id} className={`is-${cell.status}`} x={x} y={y} width={width} height={height}>
            <title>{`${cell.region} · ${statusLabel(cell.status)} · nível ${cell.level} · ${(cell.searchAreaKm2 ?? cell.areaKm2 ?? 0).toFixed(2)} km² · ${cell.resultsFound} bruto(s) · ${cell.uniqueResultsFound} nova(s)${cell.providerSaturated ? ' · limite do provider atingido' : ''}`}</title>
          </rect>
        })}
      </svg>
    </div>
    <footer><span>{job.coverage?.completedCells ?? 0}/{job.coverage?.totalCells ?? cells.length} células · {(job.coverage?.successfulAreaKm2 ?? 0).toFixed(1)} km² concluídos · {job.coverage?.saturatedCells ?? 0} saturada(s)</span><span>Área tentada {(job.coverage?.attemptedAreaKm2 ?? 0).toFixed(1)} km² · {(job.coverage?.failedAreaKm2 ?? 0).toFixed(1)} km² com falha</span><span>Saturação estimada {job.coverage?.saturationPercent ?? 0}% · confiança {job.coverage?.saturationConfidence ?? 'low'}</span><strong>Cobertura com sucesso {job.coverage?.successfulTerritoryPercent ?? job.coverage?.territoryPercent ?? 0}%</strong></footer>
  </section>
}

function EngineProcessingWorkspace({ job, busy, onRefresh, onRetry, onOpenReview }: { job: ProspectingAgentJob | null; busy: boolean; onRefresh(): void; onRetry(candidateId: string, taskId: ProspectingEnrichmentTaskId): void; onOpenReview(): void }) {
  if (!job) return <EmptyState icon={Sparkles} title="Nenhum processamento ativo" description="Inicie uma busca na aba Buscas. As empresas descobertas passarão automaticamente por identidade, website, contatos, dados empresariais, redes e validação." />
  const summary = job.processing ?? { raw: job.stats.discovered, identity: 0, website: 0, contacts: 0, legal: 0, social: 0, validation: 0, ready: 0, attention: 0, failed: 0 }
  const stages = [
    ['Identidade', summary.identity, Building2],
    ['Website', summary.website, Globe2],
    ['Contatos', summary.contacts, Phone],
    ['Empresa legal', summary.legal, ShieldCheck],
    ['Redes sociais', summary.social, AtSign],
    ['Validação', summary.validation, BadgeCheck],
  ] as const
  const taskMeta: Array<[ProspectingEnrichmentTaskId, string]> = [['website','Website'],['contacts','Contatos'],['cnpj','CNPJ'],['social','Redes']]
  const active = ['queued','running','paused'].includes(job.status)
  const runtime = job.runtime
  const sourceLabels: Record<string, string> = { osmExact: 'OSM exato', osmCoverage: 'Cobertura OSM', web: 'Web pública', enrichment: 'Enriquecimento' }
  const sourceStateLabel = (value: string | undefined) => value === 'completed' ? 'Concluído' : value === 'running' ? 'Executando' : value === 'failed' ? 'Falhou' : value === 'disabled' ? 'Desativado' : 'Aguardando'
  const taskTone = (status: string | undefined) => status === 'completed' ? 'is-completed' : status === 'failed' ? 'is-failed' : status === 'attention' ? 'is-attention' : ['running','retrying'].includes(status || '') ? 'is-running' : 'is-pending'
  const taskLabel = (status: string | undefined) => status === 'completed' ? 'Concluído' : status === 'failed' ? 'Falhou' : status === 'attention' ? 'Atenção' : status === 'retrying' ? 'Tentando novamente' : status === 'running' ? 'Executando' : status === 'skipped' ? 'Ignorado' : 'Pendente'
  return <div className="prospecting-engine-processing-v101103">
    <section className="panel prospecting-engine-processing-v101103__hero">
      <header><div><span className="eyebrow"><Sparkles size={14}/> Search & Processing Engine</span><h3>{job.input.segment}</h3><p>As empresas prontas entram na Revisão enquanto a campanha continua pesquisando e enriquecendo o restante. Cada enriquecimento permanece independente e reprocessável.</p></div><div><StatusPill tone={job.status === 'failed' ? 'danger' : active ? 'info' : 'success'}>{active ? 'Processando' : job.status === 'failed' ? 'Falhou' : 'Concluído'}</StatusPill><button type="button" className="icon-button" title="Atualizar" onClick={onRefresh}><RefreshCw size={16}/></button></div></header>
      <div className="prospecting-engine-processing-v101103__totals">
        <article><small>Empresas brutas</small><strong>{summary.raw}</strong></article>
        <article><small>Empresas únicas</small><strong>{job.stats.unique}</strong></article>
        <article><small>Prontas</small><strong>{summary.ready}</strong></article>
        <article><small>Na revisão ao vivo</small><strong>{job.reviewStream?.readyCandidates ?? 0}</strong></article>
        <article><small>Precisam atenção</small><strong>{summary.attention}</strong></article>
        <article><small>Falhas</small><strong>{summary.failed}</strong></article><article><small>Fora do escopo</small><strong>{(job.stats.scopeRejectedCategory ?? 0) + (job.stats.scopeRejectedLocation ?? 0)}</strong></article><article><small>Consultas</small><strong>{job.stats.queries}</strong></article>
      </div>
      {job.plan?.ontology ? <details className="prospecting-search-ontology-v101103-h8 prospecting-search-ontology-v101106">
        <summary><div><Database size={15}/><span><strong>Segmento entendido</strong><small>{job.plan.ontology.label} · confiança {job.plan.ontology.confidence}%</small></span></div><ChevronRight size={15}/></summary>
        <div><span>Intenção: {job.plan.ontology.intent}</span><span>Correspondência: {job.input.categoryMode === 'related' ? 'categorias relacionadas' : 'categoria exata + local confirmado'}</span>{job.plan.ontology.cnaes?.length ? <span>{job.plan.ontology.cnaes.map((item) => `CNAE ${item.code} · ${item.label}`).join(' · ')}</span> : <span>Sem CNAE específico para esta intenção</span>}</div>
      </details> : null}
    </section>

    {runtime ? <section className="panel prospecting-runtime-truth-h21">
      <header className="panel__heading"><div><span className="eyebrow"><Zap size={14}/> Execução ao vivo · {runtime.runId.slice(0, 8)}</span><h3>{runtime.phaseLabel || 'Processando'}</h3><p>{job.message}</p></div><StatusPill tone={job.status === 'failed' ? 'danger' : active ? 'info' : 'success'}>{job.status === 'running' ? 'Ao vivo' : job.status}</StatusPill></header>
      <div className="prospecting-runtime-truth-h21__sources">{Object.entries(runtime.sourceStates || {}).map(([key, value]) => <article key={key} className={`is-${value}`}><span/><div><small>{sourceLabels[key] || key}</small><strong>{sourceStateLabel(value)}</strong></div></article>)}</div>
      <div className="prospecting-runtime-truth-h21__current"><span><strong>Fonte agora</strong>{job.progress.currentSource || '—'}</span><span><strong>Região</strong>{job.progress.currentRegion || '—'}</span><span><strong>Consulta</strong>{runtime.currentQuery || job.plan?.ontology?.label || job.input.segment}</span></div>
      {runtime.events?.length ? <div className="prospecting-runtime-truth-h21__events">{runtime.events.slice(-6).reverse().map((event) => <div key={event.id}><time>{new Date(event.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><span>{event.message}</span></div>)}</div> : null}
    </section> : null}

    <section className="panel prospecting-engine-processing-v101103__pipeline">
      <header className="panel__heading"><div><span className="eyebrow">Esteira de processamento</span><h3>Processamento progressivo + Enrichment Jobs</h3><p>Cada empresa pronta é publicada incrementalmente para a Revisão, sem esperar o fim do território. Website, Contatos, CNPJ e Redes continuam com retries independentes.</p></div></header>
      <div className="prospecting-engine-processing-v101103__stages">{stages.map(([label, value, Icon]) => <article key={label}><span><Icon size={18}/></span><div><small>{label}</small><strong>{value}</strong></div>{active && value < job.stats.unique ? <LoaderCircle size={15} className="is-spinning"/> : <CheckCircle2 size={15}/>}</article>)}</div>
    </section>

    <section className="panel prospecting-engine-processing-v101103__candidates">
      <header className="panel__heading"><div><span className="eyebrow">Empresas processadas</span><h3>Qualidade, jobs e proveniência</h3><p>Completude mede quanto sabemos; confiança mede identidade; os jobs mostram exatamente onde o enriquecimento precisa ser repetido.</p></div>{summary.ready > 0 ? <Button variant="secondary" onClick={onOpenReview}>Abrir revisão <ArrowRight size={16}/></Button> : null}</header>
      {job.results.length ? <div className="prospecting-engine-processing-v101103__list">{job.results.slice(0, 40).map((candidate, index) => {
        const completeness = Number(candidate.completenessPercent ?? 0)
        const confidence = Number(candidate.confidencePercent ?? 0)
        const evidence = Array.isArray(candidate.evidence) ? candidate.evidence.length : 0
        const candidateId = String(candidate.candidateId || '')
        return <article key={candidateId || `${candidate.company || candidate.name}-${index}`} className="prospecting-enrichment-candidate-v101103-h5">
          <div className="prospecting-enrichment-candidate-v101103-h5__top"><div className="prospecting-engine-processing-v101103__candidate-main"><span className={candidate.qualityStatus === 'ready' ? 'is-ready' : 'is-attention'}>{candidate.qualityStatus === 'ready' ? <CheckCircle2 size={15}/> : candidate.qualityStatus === 'processing' ? <LoaderCircle size={15} className="is-spinning"/> : <AlertTriangle size={15}/>}</span><div><strong>{String(candidate.company || candidate.name || 'Empresa sem nome')}</strong><small>{String(candidate.city || job.progress.currentRegion || 'Localização em validação')} · {evidence} evidência(s){candidate.coverageCandidate ? ' · cobertura ampliada: confirmar categoria' : ''}</small></div></div><div className="prospecting-engine-processing-v101103__scores"><span><small>Completude</small><strong>{completeness}%</strong></span><span><small>Confiança</small><strong>{confidence}%</strong></span></div></div>
          <div className="prospecting-enrichment-candidate-v101103-h5__tasks">{taskMeta.map(([taskId, label]) => { const task = candidate.enrichmentTasks?.[taskId]; const retryable = candidateId && ['attention','failed'].includes(task?.status || ''); return <div key={taskId} className={`prospecting-enrichment-task-v101103-h5 ${taskTone(task?.status)}`}><div><strong>{label}</strong><span>{taskLabel(task?.status)} · {task?.attempts ?? 0}/{task?.maxAttempts ?? 0}</span>{task?.message ? <small title={task.lastError || task.message}>{task.message}</small> : null}</div>{retryable ? <Button variant="secondary" disabled={busy} onClick={() => onRetry(candidateId, taskId)}><RefreshCw size={13}/> Reprocessar</Button> : null}</div> })}</div>
        </article>
      })}</div> : <EmptyState icon={active ? LoaderCircle : job.status === 'failed' ? AlertTriangle : Database} title={active ? 'Buscando primeiras empresas' : job.status === 'failed' ? 'A execução falhou' : 'Nenhuma empresa encontrada nesta execução'} description={active ? `${job.runtime?.phaseLabel || 'Pesquisa em andamento'}${job.progress.currentSource ? ` · ${job.progress.currentSource}` : ''}. Os primeiros resultados aparecem aqui assim que forem aceitos.` : job.message} />}
    </section>

    {job.rejections?.length ? <details className="panel prospecting-scope-rejections-v101113-h15"><summary><div><ShieldX size={16}/><span><strong>Resultados rejeitados pelo escopo</strong><small>{job.rejections.length} registro(s) recente(s) · categoria e localização são validadas antes da revisão</small></span></div><ChevronRight size={16}/></summary><div className="prospecting-scope-rejections-v101113-h15__list">{job.rejections.slice(-30).reverse().map((item, index) => <article key={`${item.name}-${item.at}-${index}`}><div><strong>{item.name}</strong><small>{item.source}</small></div><StatusPill tone={item.type === 'location' ? 'warning' : 'info'}>{item.type === 'location' ? 'Fora da região' : item.type === 'category' ? 'Categoria diferente' : 'Fora do escopo'}</StatusPill><p>{item.reason}</p></article>)}</div></details> : null}
    {job.warnings.length ? <section className="panel prospecting-engine-processing-v101103__warnings"><header><AlertTriangle size={17}/><strong>Atenções da execução</strong></header>{job.warnings.slice(-6).map((warning, index) => <p key={`${warning}-${index}`}>{warning}</p>)}</section> : null}
  </div>
}

function ProcessingWorkspace({ readOnly, queue, active, leads, snapshot, onSelect, onChange, onAnalyze, onApprove, onDiscard, onSend, onAnalyzeAll }: {
  readOnly: boolean; queue: ProspectRecord[]; active: ProspectRecord | null; leads: Array<{ id: string; name: string; company: string }>; snapshot: import('../../domain/types').WorkspaceSnapshot; onSelect(id: string): void
  onChange(id: string, patch: Partial<ProspectRecord>): void; onAnalyze(id: string): void; onApprove(id: string): void; onDiscard(id: string): void; onSend(id: string): void; onAnalyzeAll(): void
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (readOnly || !active || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT','TEXTAREA','SELECT'].includes(target.tagName)) return
      const currentIndex = queue.findIndex((item) => item.id === active.id)
      if (event.key.toLowerCase() === 'a') { event.preventDefault(); onApprove(active.id); return }
      if (event.key.toLowerCase() === 'd') { event.preventDefault(); onDiscard(active.id); return }
      if (event.key === 'ArrowRight' && queue[currentIndex + 1]) { event.preventDefault(); onSelect(queue[currentIndex + 1].id); return }
      if (event.key === 'ArrowLeft' && queue[currentIndex - 1]) { event.preventDefault(); onSelect(queue[currentIndex - 1].id) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, onApprove, onDiscard, onSelect, queue, readOnly])
  if (!active) return <EmptyState icon={Sparkles} title="Fila de revisão vazia" description="Empresas prontas ou que exigem atenção aparecerão aqui." />
  const index = queue.findIndex((item) => item.id === active.id)
  const duplicateLead = active.duplicateLeadId ? leads.find((lead) => lead.id === active.duplicateLeadId) : null
  const checks = prospectCompleteness(active)
  const quality = prospectDataQuality(active)
  const attentionReasons = prospectAttentionReasons(active)
  const autoValidatable = prospectIsAutoValidatable(active)
  return <div className="prospecting-processing-layout prospecting-processing-layout-v101106">
    <aside className="panel prospecting-queue">
      <header><div><span className="eyebrow">Fila de análise</span><strong>{queue.length} empresa(s)</strong></div>{!readOnly ? <button type="button" className="icon-button" onClick={onAnalyzeAll} title="Analisar todos"><Sparkles size={16} /></button> : null}</header>
      <div>{queue.map((prospect) => <button type="button" key={prospect.id} className={prospect.id === active.id ? 'is-active' : ''} onClick={() => onSelect(prospect.id)}><span className={`prospect-confidence is-${prospectDataQuality(prospect).readiness === 'ready' ? 'high' : prospectDataQuality(prospect).readiness === 'blocked' ? 'low' : 'medium'}`}>{prospectDataQuality(prospect).score}</span><div><strong>{prospect.company}</strong><small>{prospectDataQuality(prospect).label} · {prospectOriginLabel(prospect)}</small></div>{prospectDataQuality(prospect).readiness === 'blocked' ? <AlertTriangle size={14} /> : <ChevronRight size={14} />}</button>)}</div>
    </aside>

    <section className="panel prospecting-review-card">
      <header className="prospecting-review-header"><div><span className="eyebrow"><ClipboardCheck size={14} /> {autoValidatable ? 'Validação rápida' : 'Revisão de exceção'}</span><h3>{active.company}</h3><p>{autoValidatable ? 'Os sinais principais estão confirmados. Faça uma leitura rápida antes de aprovar.' : 'Veja primeiro o que precisa da sua decisão; os detalhes técnicos ficam recolhidos.'}</p></div><div><StatusPill tone={autoValidatable ? 'success' : 'warning'}>{autoValidatable ? 'Pronta' : 'Precisa atenção'}</StatusPill><span className="prospecting-counter">{index + 1} de {queue.length}</span></div></header>
      <div className="prospecting-review-decisions-v101104">
        <article className={active.company ? 'is-ok' : 'is-warning'}><span>1</span><div><strong>É uma empresa real?</strong><small>{prospectPlaceType(active) === 'content' || prospectPlaceType(active) === 'directory' ? 'Resultado parece conteúdo/diretório' : `Local classificado como ${prospectPlaceType(active).replace('_', ' ')}`}</small></div>{active.company ? <CheckCircle2 size={17}/> : <AlertTriangle size={17}/>}</article>
        <article className={active.description || rawText(active.rawData, 'intentId', 'category') ? 'is-ok' : 'is-warning'}><span>2</span><div><strong>É do segmento correto?</strong><small>{active.description || rawText(active.rawData, 'intentLabel', 'category') || 'Categoria ainda precisa de confirmação'}</small></div>{active.description || rawText(active.rawData, 'intentId', 'category') ? <CheckCircle2 size={17}/> : <AlertTriangle size={17}/>}</article>
        <article className={prospectGeoPoint(active) ? 'is-ok' : 'is-warning'}><span>3</span><div><strong>Está no território correto?</strong><small>{prospectGeoPoint(active) ? active.address || active.city || 'Coordenada confirmada' : `Coordenadas pendentes${active.city ? ' · cidade informada: ' + active.city : ''}`}</small></div>{prospectGeoPoint(active) ? <CheckCircle2 size={17}/> : <AlertTriangle size={17}/>}</article>
        <article className={active.phone || active.email || active.website ? 'is-ok' : 'is-warning'}><span>4</span><div><strong>Há contato utilizável?</strong><small>{active.phone || active.email || active.website || 'Nenhum canal confirmado'}</small></div>{active.phone || active.email || active.website ? <CheckCircle2 size={17}/> : <AlertTriangle size={17}/>}</article>
        <article className={quality.readiness === 'ready' && active.duplicateLevel === 'none' ? 'is-ok' : 'is-warning'}><span>5</span><div><strong>Está pronta para sua base?</strong><small>{quality.readiness === 'ready' && active.duplicateLevel === 'none' ? 'Sem bloqueios conhecidos' : [...quality.blockers, ...active.duplicateReasons].slice(0, 2).join(' · ') || 'Requer decisão humana'}</small></div>{quality.readiness === 'ready' && active.duplicateLevel === 'none' ? <CheckCircle2 size={17}/> : <AlertTriangle size={17}/>}</article>
      </div>
      {attentionReasons.length ? <section className="prospecting-review-attention-v101106"><AlertTriangle size={16}/><div><strong>O que precisa da sua atenção</strong><div>{attentionReasons.map((reason) => <span key={reason}>{reason}</span>)}</div></div></section> : <section className="prospecting-review-attention-v101106 is-clear"><CheckCircle2 size={16}/><div><strong>Sem divergências importantes</strong><small>Identidade, local, contato e duplicidade atendem às regras atuais.</small></div></section>}
      <ProspectingG1G2Panel prospect={active} snapshot={snapshot}/>
      <details className="prospecting-review-edit-v101106">
        <summary><div><span><SlidersHorizontal size={15}/> Editar dados</span><small>Abra somente se precisar corrigir alguma informação.</small></div><ChevronRight size={15}/></summary>
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
      </details>
      {!readOnly ? <footer className="prospecting-review-actions prospecting-review-actions-v101106"><div><Button variant="ghost" onClick={() => onDiscard(active.id)}><Ban size={16} /> Descartar</Button><Button variant="secondary" onClick={() => onAnalyze(active.id)}><RefreshCw size={16} /> Reanalisar</Button></div><div><Button variant="secondary" disabled={quality.readiness === 'blocked'} title={quality.readiness === 'blocked' ? quality.blockers.join(' · ') : 'Aprovar registro revisado'} onClick={() => onApprove(active.id)}><Check size={16} /> Aprovar</Button><Button disabled={active.status !== 'approved' || quality.readiness === 'blocked'} title={active.status !== 'approved' ? 'Aprove o registro antes do envio' : quality.blockers.join(' · ')} onClick={() => onSend(active.id)}><Send size={16} /> Enviar ao CRM</Button></div><small className="prospecting-review-shortcuts-v101104">Atalhos: A aprovar · D descartar · ← → navegar</small></footer> : null}
    </section>

    <aside className="prospecting-analysis-sidebar prospecting-analysis-sidebar-v101106">
      <ProspectMiniMap prospect={active} />
      <details className="panel prospecting-review-evidence-v101106">
        <summary><div><Database size={15}/><span><strong>Qualidade e evidências</strong><small>Score, duplicidade, origem e rastreabilidade</small></span></div><ChevronRight size={15}/></summary>
        <div className="prospecting-review-evidence-v101106__body">
      <section className={`panel prospecting-data-layer-card is-${quality.readiness}`}><header><div><span className="eyebrow"><Database size={13} /> RealTalent Data Layer</span><strong>{quality.label}</strong></div><span className="prospecting-quality-score">{quality.score}</span></header><div className="prospecting-quality-grid">{Object.entries(quality.dimensions).map(([key, value]) => <div key={key}><span>{key === 'identity' ? 'Identidade' : key === 'contact' ? 'Contato' : key === 'origin' ? 'Origem' : 'Cobertura'}</span><strong>{value}%</strong><i><b style={{ width: `${value}%` }} /></i></div>)}</div>{quality.blockers.length ? <div className="prospecting-quality-notes is-blocker"><strong>Bloqueios</strong>{quality.blockers.map((item) => <span key={item}>• {item}</span>)}</div> : null}{quality.recommendedActions.length ? <div className="prospecting-quality-notes"><strong>Próximos passos</strong>{quality.recommendedActions.slice(0, 3).map((item) => <span key={item}>• {item}</span>)}</div> : null}<small className="prospecting-identity-key">ID: {quality.identityKey}</small></section>
      <section className="panel prospecting-confidence-card"><header><div><span>Confiança dos dados</span><strong>{active.confidence}%</strong></div><GaugeRing value={active.confidence} /></header><div className="prospecting-confidence-track"><span style={{ width: `${active.confidence}%` }} /></div><div className="prospecting-checklist">{checks.map((check) => <span key={check.label} className={check.ok ? 'is-ok' : ''}>{check.ok ? <CheckCircle2 size={14} /> : <CircleDashed size={14} />}{check.label}</span>)}</div></section>
      <section className={`panel prospecting-duplicate-card is-${active.duplicateLevel}`}><header><span><AlertTriangle size={18} /></span><div><small>Antiduplicação</small><strong>{duplicateLabel(active.duplicateLevel)}</strong></div></header>{active.duplicateReasons.length ? <ul>{active.duplicateReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p>Nenhum identificador forte coincide com a base atual.</p>}{duplicateLead ? <div className="prospecting-duplicate-match"><UserRoundCheck size={16} /><div><small>Registro encontrado</small><strong>{duplicateLead.company || duplicateLead.name}</strong></div></div> : null}</section>
      <section className="panel prospecting-source-card"><span className="eyebrow">Origem e rastreabilidade</span><div><SourceMark source={active.source} /><div><strong>{prospectSourceLabels[active.source]}</strong><small>{active.sourceDetail || 'Captura sem detalhe adicional'}</small></div></div><dl><div><dt>Criado</dt><dd>{formatDateTime(active.createdAt)}</dd></div><div><dt>Analisado</dt><dd>{active.analyzedAt ? formatDateTime(active.analyzedAt) : 'Pendente'}</dd></div></dl></section>
        </div>
      </details>
    </aside>
  </div>
}

function ProspectMiniMap({ prospect }: { prospect: ProspectRecord }) {
  const point = prospectGeoPoint(prospect)
  if (!point) return <section className="panel prospecting-review-map-v101104 is-empty"><span className="eyebrow"><MapPinned size={13}/> Localização</span><strong>Sem coordenada confirmada</strong><p>{prospect.address || prospect.city || 'Revise a cidade/endereço antes de aprovar.'}</p></section>
  const latDelta = 0.018; const lonDelta = 0.022 / Math.max(0.35, Math.cos(point.lat * Math.PI / 180)); const west = point.lon - lonDelta; const east = point.lon + lonDelta; const south = point.lat - latDelta; const north = point.lat + latDelta
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${west},${south},${east},${north}`)}&layer=mapnik&marker=${encodeURIComponent(`${point.lat},${point.lon}`)}`
  return <section className="panel prospecting-review-map-v101104"><header><div><span className="eyebrow"><MapPinned size={13}/> Território</span><strong>Localização encontrada</strong></div><StatusPill tone="success">{prospectPlaceConfidence(prospect)}%</StatusPill></header><iframe title={`Localização de ${prospect.company}`} src={mapUrl} loading="lazy" referrerPolicy="no-referrer"/><small>{prospect.address || prospect.city} · confira visualmente antes de aprovar se houver dúvida.</small></section>
}

function GaugeRing({ value }: { value: number }) { return <span className="prospecting-gauge" style={{ '--value': `${value * 3.6}deg` } as CSSProperties}><em>{value}</em></span> }
function SourceMark({ source }: { source: ProspectSource }) { const Icon = sourceIcons[source]; return <span className={`prospecting-source-mark is-${source}`}><Icon size={17} /></span> }

function ResultsWorkspace({ readOnly, prospects, selectedIds, search, statusFilter, sourceFilter, qualityFilter, duplicateFilter, bulkRetryBusy, onSearch, onStatusFilter, onSourceFilter, onQualityFilter, onDuplicateFilter, onSelected, onAnalyze, onApprove, onDiscard, onSend, onDelete, onExport, onBulkRetry, onOpenGuided }: {
  readOnly: boolean; prospects: ProspectRecord[]; selectedIds: Set<string>; search: string; statusFilter: 'all' | ProspectStatus; sourceFilter: 'all' | ProspectSource; qualityFilter: 'all' | ProspectReadiness; duplicateFilter: 'all' | ProspectRecord['duplicateLevel']; bulkRetryBusy: boolean
  onSearch(value: string): void; onStatusFilter(value: 'all' | ProspectStatus): void; onSourceFilter(value: 'all' | ProspectSource): void; onQualityFilter(value: 'all' | ProspectReadiness): void; onDuplicateFilter(value: 'all' | ProspectRecord['duplicateLevel']): void; onSelected(value: Set<string>): void
  onAnalyze(ids: string[]): void; onApprove(ids: string[]): void; onDiscard(ids: string[]): void; onSend(ids: string[]): void; onDelete(ids: string[]): void; onExport(): void; onBulkRetry(ids: string[]): void; onOpenGuided(id: string): void
}) {
  const selectableProspects = prospects.filter((item) => item.status !== 'sent' && item.status !== 'discarded')
  const selectableIds = new Set(selectableProspects.map((item) => item.id))
  const allSelected = selectableProspects.length > 0 && selectableProspects.every((item) => selectedIds.has(item.id))
  const toggle = (id: string) => { if (!selectableIds.has(id)) return; const next = new Set([...selectedIds].filter((selectedId) => selectableIds.has(selectedId))); if (next.has(id)) next.delete(id); else next.add(id); onSelected(next) }
  const ids = selectableProspects.filter((item) => selectedIds.has(item.id)).map((item) => item.id)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (sourceFilter !== 'all' ? 1 : 0) + (qualityFilter !== 'all' ? 1 : 0) + (duplicateFilter !== 'all' ? 1 : 0)
  const clearFilters = () => { onStatusFilter('all'); onSourceFilter('all'); onQualityFilter('all'); onDuplicateFilter('all') }
  const readyCount = prospects.filter(prospectIsAutoValidatable).length
  const blockedCount = prospects.filter((item) => prospectDataQuality(item).readiness === 'blocked').length
  const duplicateCount = prospects.filter((item) => item.duplicateLevel !== 'none').length
  const smartEligible = selectableProspects.filter(prospectIsAutoValidatable)
  const universalProspectingFilters: WorkspaceFilterField[] = [
    { key: 'status', label: 'Status', value: statusFilter, allValue: 'all', allLabel: 'Todos os status', group: 'Empresa', options: Object.entries(prospectStatusLabels).map(([value, label]) => ({ value, label })) },
    { key: 'source', label: 'Origem', value: sourceFilter, allValue: 'all', allLabel: 'Todas as origens', group: 'Origem', options: Object.entries(prospectSourceLabels).map(([value, label]) => ({ value, label })) },
    { key: 'quality', label: 'Qualidade', value: qualityFilter, allValue: 'all', allLabel: 'Toda qualidade', group: 'Data Layer', options: [{ value: 'ready', label: 'Prontos para aprovar' }, { value: 'review', label: 'Revisão necessária' }, { value: 'blocked', label: 'Bloqueados' }] },
    { key: 'duplicate', label: 'Duplicidade', value: duplicateFilter, allValue: 'all', allLabel: 'Todas', group: 'Data Layer', options: [{ value: 'none', label: 'Sem duplicidade' }, { value: 'possible', label: 'Possível duplicidade' }, { value: 'confirmed', label: 'Duplicidade confirmada' }] },
  ]
  return <section className="panel prospecting-results-panel">
    <FilterWorkspaceCommandBar query={search} onQueryChange={onSearch} placeholder="Buscar empresa, cidade, telefone ou CNPJ" actions={<><WorkspaceFilterMenu workspaceKey="prospecting:results" fields={universalProspectingFilters} activeCount={activeFilterCount} onOpenAdvanced={() => setFiltersOpen(true)} onClearAll={clearFilters} onChange={(key, value) => { if (key === 'status') onStatusFilter(value as 'all' | ProspectStatus); else if (key === 'source') onSourceFilter(value as 'all' | ProspectSource); else if (key === 'quality') onQualityFilter(value as 'all' | ProspectReadiness); else if (key === 'duplicate') onDuplicateFilter(value as 'all' | ProspectRecord['duplicateLevel']) }} /><Button variant="secondary" onClick={onExport}><Download size={16} /> Exportar</Button></>} />
    {filtersOpen ? <WorkspaceAdvancedFilterDrawer title="Filtros do Garimpo" eyebrow="Resultados" description="A mesma lógica de filtros rápidos e avançados usada em todo o CRM." onClose={() => setFiltersOpen(false)} onClear={clearFilters}>
      <label className="field"><span>Status</span><SelectionSelect value={statusFilter} onValueChange={(value) => onStatusFilter(value as 'all' | ProspectStatus)} options={[{ value: 'all', label: 'Todos os status' }, ...Object.entries(prospectStatusLabels).map(([value, label]) => ({ value, label }))]} /></label>
      <label className="field"><span>Origem</span><SelectionSelect value={sourceFilter} onValueChange={(value) => onSourceFilter(value as 'all' | ProspectSource)} options={[{ value: 'all', label: 'Todas as origens' }, ...Object.entries(prospectSourceLabels).map(([value, label]) => ({ value, label }))]} /></label>
      <label className="field"><span>Qualidade</span><SelectionSelect value={qualityFilter} onValueChange={(value) => onQualityFilter(value as 'all' | ProspectReadiness)} options={[{ value: 'all', label: 'Toda qualidade' }, { value: 'ready', label: 'Prontos para aprovar' }, { value: 'review', label: 'Revisão necessária' }, { value: 'blocked', label: 'Bloqueados' }]} /></label>
      <label className="field"><span>Duplicidade</span><SelectionSelect value={duplicateFilter} onValueChange={(value) => onDuplicateFilter(value as 'all' | ProspectRecord['duplicateLevel'])} options={[{ value: 'all', label: 'Todas' }, { value: 'none', label: 'Sem duplicidade' }, { value: 'possible', label: 'Possível duplicidade' }, { value: 'confirmed', label: 'Confirmada' }]} /></label>
    </WorkspaceAdvancedFilterDrawer> : null}
    <div className="prospecting-review-summary-v101103-h7"><span><strong>{prospects.length}</strong> visíveis</span><span className="is-ready"><strong>{readyCount}</strong> prontos</span><span className="is-warning"><strong>{duplicateCount}</strong> duplicidades</span><span className="is-blocked"><strong>{blockedCount}</strong> bloqueados</span></div>
    {!readOnly && smartEligible.length > 0 ? <div className="prospecting-smart-approval-v101104"><div><ShieldCheck size={17}/><span><strong>{smartEligible.length} empresa(s) atendem às regras de aprovação</strong><small>Qualidade pronta · sem duplicidade · localidade confirmada · confiança local ≥ 65%</small></span></div><Button size="sm" variant="secondary" onClick={() => onApprove(smartEligible.map((item) => item.id))}><Check size={15}/> Aprovar {smartEligible.length}</Button></div> : null}
    {!readOnly ? <SelectionToolbar count={ids.length} label="empresas selecionadas" onClear={() => onSelected(new Set())}><Button size="sm" variant="ghost" onClick={() => onAnalyze(ids)}><Sparkles size={15} /> Analisar</Button><Button size="sm" variant="ghost" loading={bulkRetryBusy} onClick={() => onBulkRetry(ids)}><RefreshCw size={15} /> Reprocessar</Button><Button size="sm" variant="ghost" onClick={() => onApprove(ids)}><Check size={15} /> Aprovar</Button><Button size="sm" variant="ghost" onClick={() => onDiscard(ids)}><Ban size={15} /> Descartar</Button><Button size="sm" onClick={() => onSend(ids)}><Send size={15} /> Enviar</Button><Button size="sm" variant="danger" onClick={() => onDelete(ids)}><Trash2 size={15} /></Button></SelectionToolbar> : null}
    {prospects.length ? <div className="prospecting-table prospecting-table-v101106"><div className="prospecting-table__head"><SelectionCheckbox ariaLabel="Selecionar empresas visíveis" disabled={readOnly} checked={allSelected} indeterminate={!allSelected && ids.length > 0} onCheckedChange={() => onSelected(allSelected ? new Set() : new Set(selectableProspects.map((item) => item.id)))} /><span>Empresa</span><span>Local</span><span>Contato</span><span>Qualidade</span><span>Status</span><span>Ações</span></div>{prospects.map((prospect) => { const quality = prospectDataQuality(prospect); const reasons = prospectAttentionReasons(prospect); return <article key={prospect.id}><SelectionCheckbox ariaLabel={`Selecionar ${prospect.company}`} disabled={readOnly || prospect.status === 'sent' || prospect.status === 'discarded'} checked={selectedIds.has(prospect.id)} onCheckedChange={() => toggle(prospect.id)} /><div className="prospecting-table__lead"><span>{prospect.company.slice(0, 1).toUpperCase()}</span><div><strong>{prospect.company}</strong><small>{prospectOriginLabel(prospect)}</small></div></div><div className="prospecting-table-v101106__local"><strong>{prospect.city || 'Local não confirmado'}</strong><small>{prospect.address || (prospectGeoPoint(prospect) ? `Coordenadas confirmadas · ${prospectPlaceConfidence(prospect)}%` : 'Sem endereço confirmado')}</small></div><div className="prospecting-table__contact"><strong>{prospect.phone || prospect.email || 'Sem contato confirmado'}</strong><small>{prospect.website || prospect.instagram || 'Sem canal digital'}</small></div><div className="prospecting-table__confidence"><div><span style={{ width: `${quality.score}%` }} /></div><strong>{quality.score}%</strong><small>{reasons[0] || 'Sem divergência importante'}</small></div><div className="prospecting-table-v101106__status"><StatusPill tone={statusTones[prospect.status]}>{prospectStatusLabels[prospect.status]}</StatusPill>{prospect.duplicateLevel !== 'none' ? <StatusPill tone={duplicateTone(prospect.duplicateLevel)}>{prospect.duplicateLevel === 'possible' ? 'Possível duplicidade' : 'Duplicado'}</StatusPill> : null}</div><div className="prospecting-table__actions">{!readOnly ? <><button type="button" className="icon-button" title="Abrir revisão guiada" onClick={() => onOpenGuided(prospect.id)}><ClipboardCheck size={15} /></button><button type="button" className="icon-button" title="Reanalisar" onClick={() => onAnalyze([prospect.id])}><RefreshCw size={15} /></button>{prospect.status === 'approved' && quality.readiness !== 'blocked' ? <button type="button" className="icon-button" title="Enviar ao CRM" onClick={() => onSend([prospect.id])}><Send size={15} /></button> : null}<button type="button" className="icon-button icon-button--danger" title="Remover" onClick={() => onDelete([prospect.id])}><Trash2 size={15} /></button></> : null}</div></article> })}</div> : <EmptyState icon={Search} title="Nenhuma empresa neste recorte" description="Troque entre Precisa atenção, Prontas ou Todas, ou ajuste os filtros." />}
  </section>
}

const kanbanStatuses: ProspectStatus[] = ['new', 'analyzing', 'review', 'approved', 'discarded', 'sent']
function KanbanWorkspace({ readOnly, prospects, onStatus, onSelect }: { readOnly: boolean; prospects: ProspectRecord[]; onStatus(id: string, status: ProspectStatus): void; onSelect(id: string): void }) {
  return <section className="prospecting-kanban">{kanbanStatuses.map((status) => {
    const items = prospects.filter((item) => item.status === status)
    return <div className={`prospecting-kanban-column is-${status}`} key={status}><header><span><i />{prospectStatusLabels[status]}</span><strong>{items.length}</strong></header><div>{items.map((prospect) => <article key={prospect.id} draggable={!readOnly} onDragStart={(event) => { if (!readOnly) event.dataTransfer.setData('text/prospect-id', prospect.id) }} onClick={() => onSelect(prospect.id)}><div><SourceMark source={prospect.source} /><StatusPill tone={duplicateTone(prospect.duplicateLevel)}>{prospect.duplicateLevel === 'none' ? 'Validado' : 'Atenção'}</StatusPill></div><h3>{prospect.company}</h3><p>{prospect.city || 'Sem cidade'} · {prospect.phone || 'Sem telefone'}</p><footer><span className={`prospect-confidence is-${prospect.confidence >= 75 ? 'high' : prospect.confidence >= 50 ? 'medium' : 'low'}`}>{prospect.confidence}%</span><MoreHorizontal size={16} /></footer></article>)}</div>{!readOnly ? <div className="prospecting-dropzone" role="status" aria-label={`Área para mover para ${prospectStatusLabels[status]}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData('text/prospect-id'); if (id) onStatus(id, status) }}>Arraste aqui para mover para {prospectStatusLabels[status]}</div> : null}</div>
  })}</section>
}

function HistoryWorkspace({ state, onExport }: { state: ProspectingState; onExport(): void }) {
  return <section className="panel prospecting-history-panel"><header className="panel__heading"><div><span className="eyebrow"><History size={14} /> Rastreabilidade</span><h3>Histórico do Garimpo</h3><p>Buscas, importações, análises, aprovações e envios registrados.</p></div><Button variant="secondary" onClick={onExport}><FileJson size={16} /> Exportar base</Button></header>{state.history.length ? <div className="prospecting-history-list">{state.history.map((item) => <article key={item.id}><span className={`is-${item.action}`}>{item.action === 'search' ? <Search /> : item.action === 'send' || item.action === 'merge' ? <Send /> : item.action === 'discard' || item.action === 'delete' ? <Trash2 /> : item.action === 'analyze' ? <Sparkles /> : <Upload />}</span><div><strong>{item.title}</strong><p>{item.description}</p></div><em>{item.count ? `${item.count} empresa(s)` : 'Consulta'}</em><time>{formatDateTime(item.createdAt)}</time></article>)}</div> : <EmptyState icon={History} title="Nenhuma movimentação registrada" description="O histórico será criado conforme você utilizar o Garimpo." />}</section>
}

function SendToCrmModal({ open, count, stages, ownerOptions, loading, onClose, onSubmit }: {
  open: boolean; count: number; stages: Array<{ id: string; name: string }>; ownerOptions: Array<{ id: string; name: string }>; loading: boolean; onClose(): void; onSubmit(options: SendOptions): Promise<void>
}) {
  const defaultDate = useMemo(() => { const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(10, 0, 0, 0); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16) }, [open])
  const [options, setOptions] = useState<SendOptions>({ createOpportunity: false, stageId: stages[0]?.id ?? '', ownerId: ownerOptions[0]?.id ?? '', ownerName: ownerOptions[0]?.name ?? '', priority: 'medium', temperature: 'warm', tags: 'prospecção', nextActionAt: defaultDate, activityType: 'call', duplicateBehavior: 'update' })
  useEffect(() => { if (open) setOptions((current) => ({ ...current, stageId: current.stageId || stages[0]?.id || '', ownerId: current.ownerId || ownerOptions[0]?.id || '', ownerName: current.ownerName || ownerOptions[0]?.name || '', nextActionAt: defaultDate })) }, [defaultDate, open, ownerOptions, stages])
  return <Modal open={open} title={`Enviar ${count} empresa(s) ao CRM`} subtitle="A empresa entra primeiro no modelo canônico. Criar uma oportunidade comercial é opcional." onClose={onClose} size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={loading} onClick={() => void onSubmit(options)}><Send size={17} /> Confirmar envio</Button></>}>
    <div className="prospecting-send-form"><section><span className="eyebrow"><Building2 size={14} /> Entrada canônica</span><p>Aprovar cria ou atualiza <strong>CompanyRecord</strong>. Se uma pessoa estiver identificada, ela vira <strong>ContactRecord</strong>.</p><SelectionCheckbox checked={options.createOpportunity} onCheckedChange={(checked) => setOptions({ ...options, createOpportunity: checked })} label="Criar também uma oportunidade comercial no Pipeline" description="A empresa continua canônica; a oportunidade é criada somente quando necessário." /></section>{options.createOpportunity ? <><section><span className="eyebrow"><WorkflowIcon /> Organização comercial</span><div className="prospecting-form-grid"><label><span>Etapa inicial</span><SelectionSelect value={options.stageId} onValueChange={(value) => setOptions({ ...options, stageId: value })} options={stages.map((stage) => ({ value: stage.id, label: stage.name }))} /></label><label><span>Responsável</span><EntityPicker value={options.ownerId} onValueChange={(value) => { const selected = ownerOptions.find((owner) => owner.id === value); setOptions({ ...options, ownerId: value, ownerName: selected?.name ?? '' }) }} placeholder="Sem responsável" options={[{ value: '', label: 'Sem responsável' }, ...ownerOptions.map((owner) => ({ value: owner.id, label: owner.name, initials: owner.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() }))]} /></label><label><span>Prioridade</span><SelectionSelect value={options.priority} onValueChange={(value) => setOptions({ ...options, priority: value as LeadPriority })} options={[{ value: 'low', label: '↓ Baixa' }, { value: 'medium', label: '– Média' }, { value: 'high', label: '↑ Alta' }, { value: 'urgent', label: '!! Urgente' }]} /></label><label><span>Temperatura</span><SelectionSelect value={options.temperature} onValueChange={(value) => setOptions({ ...options, temperature: value as LeadTemperature })} options={[{ value: 'cold', label: 'Frio' }, { value: 'warm', label: 'Morno' }, { value: 'hot', label: 'Quente' }]} /></label><label className="is-wide"><span>Tags</span><input value={options.tags} onChange={(event) => setOptions({ ...options, tags: event.target.value })} placeholder="prospecção, barbearia, canoas" /></label></div></section>
      <section><span className="eyebrow"><Phone size={14} /> Primeira atividade</span><div className="prospecting-form-grid"><label><span>Tipo</span><SelectionSelect value={options.activityType} onValueChange={(value) => setOptions({ ...options, activityType: value as SendOptions['activityType'] })} options={[{ value: 'call', label: 'Ligação' }, { value: 'followup', label: 'Follow-up' }]} /></label><label><span>Data e horário</span><input type="datetime-local" value={options.nextActionAt} onChange={(event) => setOptions({ ...options, nextActionAt: event.target.value })} /></label></div></section></> : null}
      <section className="prospecting-duplicate-policy"><span className="eyebrow"><Merge size={14} /> Quando já existir no CRM</span><div>{([['update', 'Atualizar existente', 'Preenche campos ausentes e preserva o histórico.'], ['skip', 'Ignorar duplicados', 'Envia somente os registros realmente novos.'], ['create', 'Criar mesmo assim', 'Mantém dois registros separados na base.']] as Array<[DuplicateBehavior, string, string]>).map(([value, title, description]) => <label key={value} className={options.duplicateBehavior === value ? 'is-active' : ''}><input type="radio" name="duplicate-behavior" checked={options.duplicateBehavior === value} onChange={() => setOptions({ ...options, duplicateBehavior: value })} /><span><strong>{title}</strong><small>{description}</small></span></label>)}</div></section>
    </div>
  </Modal>
}

function WorkflowIcon() { return <Link2 size={14} /> }
