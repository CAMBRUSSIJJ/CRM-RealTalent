import '../../styles/call-workspace-v10055.css'
import '../../styles/coaching-playbooks-v10065.css'
import '../../styles/calls-ui-standard-v10071.css'
import '../../styles/calls-intelligence-workspace-v10072.css'
import '../../styles/calls-voice-dialer-v10073.css'
import '../../styles/calls-focus-simplification-v100731.css'
import '../../styles/calling-workspace.css'
import '../../styles/calls-v1014.css'
import '../../styles/calling-workspace-operational.css'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Building2,
  CalendarPlus,
  CircleCheckBig,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleStop,
  Clipboard,
  Copy,
  Lightbulb,
  History,
  Maximize2,
  MessageCircleQuestion,
  Network,
  NotebookPen,
  Pin,
  Mic,
  MicOff,
  Minimize2,
  Pause,
  PhoneCall,
  Play,
  RotateCcw,
  Save,
  SkipForward,
  Sparkles,
  Square,
  Target,
  UserPlus,
  UsersRound,
  Timer,
  UserRoundCheck,
  Volume2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppActions, useAppNavigation, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { MindMapCanvas } from '../../components/visualization/mind-map-canvas'
import { ErrorBoundary } from '../../components/ui/error-boundary'
import { Modal } from '../../components/ui/modal'
import { StatusPill } from '../../components/ui/status-pill'
import { formatCurrency, formatDateTime } from '../../domain/formatters'
import type { CallOutcome, Lead } from '../../domain/types'
import { deleteLocalRecording, deleteLocalRecordingChunks, readLocalRecording, readLocalRecordingChunks, saveLocalRecording, saveLocalRecordingChunk } from '../../lib/local-recordings'
import { copyTextToClipboard } from '../../lib/browser-actions'
import { CALL_OUTCOMES, defaultNextDate, outcomeDefinition, outcomeLabel, resolveLeadCallTarget } from '../../services/call-workspace'
import { contactBlockedMessage } from '../../services/contact-policy'
import { buildAccountIntelligence, contactInteractionSummary, decisionRoleLabels, relationshipStrengthLabels } from '../../services/account-intelligence'
import { buildDiscoveryChecklist, CALL_QUICK_SIGNALS, callSessionObjective, currentProposalForLead } from '../../services/call-session-intelligence'
import { analyzeLiveConversation, buildCallHealth, buildPreCallBrief, recommendNextBestQuestion } from '../../services/calling-intelligence-workspace'
import { discoverVoiceDevices, probeVoiceProviders, providerLabel, readVoiceSettings, resumeVoiceCallMonitoring, sendVoiceCommand, startOutboundVoiceCall, subscribeVoiceEvents, voiceProviderStateLabel, type VoiceCallRuntime, type VoiceDevice, type VoiceProviderId, type VoiceProviderStatus, type VoiceSettings, type VoiceTransportState } from '../../services/voice-dialer'
import { buildStructuredCallSummary, buildWrapRecommendation, recommendCommercialAction } from '../../services/commercial-execution'
import { CALL_SESSION_SCHEMA_VERSION, callRecordingDraftKey, callSessionStorageKey, storedCallSessionMatchesScope } from '../../services/call-session-storage-v10151'
import { applyVoiceRuntimeEvent, beginCallRuntimeAttempt, bindVoiceRuntime, markCallRuntimeSaved, runtimeAttemptById, updateCallRuntimeAttempt } from '../../services/call-runtime-v1014'
import { recommendPlaybooks } from '../../services/coaching-engine'
import { clearCallNoteDraft, readCallingStrategyPreferences, readCallNoteDraft, saveCallNoteDraft, type CallingStrategyPreferences } from '../../services/calling-strategy'
import { getGoalInsight, localDateKey } from '../../services/goals-workspace'
import { goalMetricLabels } from '../../services/metrics'
import {
  BUILT_IN_OBJECTIONS,
  OUTBOUND_CALL_STEPS,
  outboundStepById,
  renderOutboundText,
  type BuiltInObjection,
  type OutboundStepAction,
  type OutboundStepId,
} from '../../services/outbound-call-playbook'
import { usePreferences } from '../settings/preferences-context'
import { useAuth } from '../auth/auth-context'
import type { CallDisplayPreferences } from '../../services/call-display-preferences'
import type { CallSessionConfig } from './call-session-config'

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike
type SessionState = 'idle' | 'dialing' | 'running' | 'paused' | 'finished'
type GuidanceTab = 'assistant' | 'stakeholders' | 'objections' | 'battlecards' | 'history'
type WorkTab = 'script' | 'discovery' | 'notes'
type ContextTab = 'summary' | 'history' | 'notes'
type WrapGroup = 'no_contact' | 'conversation' | 'callback' | 'advance' | 'closed'
type ScriptView = 'guided' | 'full' | 'map'
type ObjectionStatus = 'open' | 'resolved' | 'persisted'

interface DiscoveryFields {
  decisionMaker: string
  currentSystem: string
  mainPain: string
  bestTime: string
}

interface StoredCallSession {
  schemaVersion: number
  workspaceId: string
  userId: string | null
  leadId: string
  queueLeadIds: string[]
  queueIndex: number
  session: SessionState
  startedAt: string | null
  seconds: number
  outcome: CallOutcome
  notes: string
  transcript: string
  nextAt: string
  scheduleNext: boolean
  playbookId: string
  consent: boolean
  hasRecordingDraft: boolean
  currentStepId?: OutboundStepId
  visitedStepIds?: OutboundStepId[]
  discovery?: DiscoveryFields
  activeContactId?: string
  attemptContactId?: string
  workTab?: WorkTab
  capturedSignals?: string[]
  scriptView?: ScriptView
  capturedObjections?: CapturedObjection[]
  outcomeDetail?: string
  voiceCall?: VoiceCallRuntime | null
  callAttemptId?: string
  voiceTransport?: VoiceTransportState
  voiceTransportDetail?: string
}

interface ObjectionItem extends BuiltInObjection { source: 'team' | 'built-in' }
interface CapturedObjection {
  id: string
  title: string
  category: string
  response: string
  diagnosticQuestion: string
  source: 'team' | 'built-in' | 'custom'
  status: ObjectionStatus
  leadResponse: string
}

const LEGACY_STORAGE_KEYS = ['crm-v100-46-5-call-session', 'crm-v100-29-call-session']
const LEGACY_DRAFT_RECORDING_KEY = 'draft:crm-v100-call-session'
const EMPTY_DISCOVERY: DiscoveryFields = { decisionMaker: '', currentSystem: '', mainPain: '', bestTime: '' }
const priorityLabel: Record<Lead['priority'], string> = { urgent: 'urgente', high: 'alta', medium: 'média', low: 'baixa' }

const WRAP_GROUPS: Array<{ id: WrapGroup; label: string; description: string; outcomes: CallOutcome[] }> = [
  { id: 'no_contact', label: 'Não conectou', description: 'Não atendeu, ocupado, caixa postal ou número inválido.', outcomes: ['no_answer', 'busy', 'voicemail', 'invalid_number'] },
  { id: 'conversation', label: 'Conversou', description: 'Houve conversa, interesse ou outro desfecho sem avanço formal.', outcomes: ['answered', 'interested', 'other'] },
  { id: 'callback', label: 'Retornar', description: 'O contato pediu retorno em outro momento.', outcomes: ['callback_requested'] },
  { id: 'advance', label: 'Avançou', description: 'A conversa gerou reunião, proposta ou avanço comercial.', outcomes: ['meeting_scheduled', 'proposal_requested', 'proposal_sent'] },
  { id: 'closed', label: 'Encerrar / concluir', description: 'Sem interesse, contato incorreto ou venda concluída.', outcomes: ['not_interested', 'wrong_person', 'sale_completed'] },
]

const MACRO_PHASES: Array<{ id: string; label: string; steps: OutboundStepId[] }> = [
  { id: 'opening', label: 'Abertura', steps: ['opening', 'decision-maker', 'context'] },
  { id: 'diagnosis', label: 'Diagnóstico', steps: ['diagnosis', 'impact'] },
  { id: 'value', label: 'Valor', steps: ['value', 'invitation'] },
  { id: 'next-step', label: 'Próximo passo', steps: ['scheduling', 'closing'] },
]

const safeStorageGet = (key: string) => { try { return window.localStorage.getItem(key) } catch { return null } }
const safeStorageSet = (key: string, value: string) => { try { window.localStorage.setItem(key, value) } catch { /* armazenamento indisponível */ } }
const safeStorageRemove = (key: string) => { try { window.localStorage.removeItem(key) } catch { /* armazenamento indisponível */ } }
const toInput = (date: Date | null) => date ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ''
const nextHourInput = () => { const date = new Date(); date.setHours(date.getHours() + 1, 0, 0, 0); return toInput(date) }

const writeClipboard = async (content: string) => {
  const result = await copyTextToClipboard(content)
  if (!result.ok) throw new Error(result.reason ?? 'Não foi possível copiar o conteúdo.')
}

export function CallWorkspaceModal({ open, config, onClose }: { open: boolean; config: CallSessionConfig | null; onClose(): void }) {
  const { snapshot, currentWorkspace, repositoryMode } = useAppWorkspace()
  const { navigate } = useAppNavigation()
  const { notify, confirmAction, promptAction } = useAppUi()
  const { registerCallOutcome, createContact, createActivity } = useAppActions()
  const { preferences } = usePreferences()
  const { user } = useAuth()
  const workspaceId = currentWorkspace?.id ?? snapshot?.workspace.id ?? 'default'
  const sessionStorageKey = callSessionStorageKey(workspaceId, user?.id ?? null)
  const display = config?.display
  const [localDisplay, setLocalDisplay] = useState<CallDisplayPreferences | null>(display ?? null)
  const effectiveDisplay = localDisplay ?? display
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => readVoiceSettings(workspaceId))
  const [voiceProviders, setVoiceProviders] = useState<VoiceProviderStatus[]>([])
  const [voiceDevices, setVoiceDevices] = useState<VoiceDevice[]>([])
  const [voiceProviderId, setVoiceProviderId] = useState<VoiceProviderId>(() => readVoiceSettings(workspaceId).defaultProviderId)
  const [voiceDeviceId, setVoiceDeviceId] = useState(() => readVoiceSettings(workspaceId).selectedDeviceId)
  const [voiceCallerId, setVoiceCallerId] = useState(() => readVoiceSettings(workspaceId).selectedCallerId)
  const [voiceCall, setVoiceCall] = useState<VoiceCallRuntime | null>(null)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voiceMuted, setVoiceMuted] = useState(false)
  const [voiceHeld, setVoiceHeld] = useState(false)
  const [voiceTransport, setVoiceTransport] = useState<VoiceTransportState>('healthy')
  const [voiceTransportDetail, setVoiceTransportDetail] = useState('')
  const [callAttemptId, setCallAttemptId] = useState('')
  const [leadId, setLeadId] = useState('')
  const [routineIds, setRoutineIds] = useState<string[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [session, setSession] = useState<SessionState>('idle')
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [outcome, setOutcome] = useState<CallOutcome>('answered')
  const [wrapGroup, setWrapGroup] = useState<WrapGroup>('conversation')
  const [notes, setNotes] = useState('')
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [consent, setConsent] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null)
  const recordingBlobRef = useRef<Blob | null>(null)
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [scheduleNext, setScheduleNext] = useState(true)
  const [nextAt, setNextAt] = useState(nextHourInput())
  const [busy, setBusy] = useState(false)
  const [playbookId, setPlaybookId] = useState('')
  const [fullScreen, setFullScreen] = useState(true)
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryHasAudio, setRecoveryHasAudio] = useState(false)
  const [currentStepId, setCurrentStepId] = useState<OutboundStepId>('opening')
  const [visitedStepIds, setVisitedStepIds] = useState<OutboundStepId[]>(['opening'])
  const [discovery, setDiscovery] = useState<DiscoveryFields>(EMPTY_DISCOVERY)
  const [activeObjectionId, setActiveObjectionId] = useState('')
  const [guidanceTab, setGuidanceTab] = useState<GuidanceTab>('assistant')
  const [workTab, setWorkTab] = useState<WorkTab>('script')
  const [activeContactId, setActiveContactId] = useState('')
  const [attemptContactId, setAttemptContactId] = useState('')
  const [capturedSignals, setCapturedSignals] = useState<string[]>([])
  const [scriptView, setScriptView] = useState<ScriptView>('guided')
  const [capturedObjections, setCapturedObjections] = useState<CapturedObjection[]>([])
  const [outcomeDetail, setOutcomeDetail] = useState('')
  const [contextTab, setContextTab] = useState<ContextTab>('summary')
  const [strategy, setStrategy] = useState<CallingStrategyPreferences>(() => readCallingStrategyPreferences(workspaceId))
  const [sessionOutcomes, setSessionOutcomes] = useState<CallOutcome[]>([])
  const [attemptSaved, setAttemptSaved] = useState(false)
  const [completedInSession, setCompletedInSession] = useState(0)
  const [advanceTarget, setAdvanceTarget] = useState<{ leadId: string; index: number } | null>(null)
  const [advanceCountdown, setAdvanceCountdown] = useState(0)
  const [autoDialPending, setAutoDialPending] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const voiceCallRef = useRef<VoiceCallRuntime | null>(null)
  const callAttemptIdRef = useRef('')
  const recordingChunkIndexRef = useRef(0)
  const saveInFlightRef = useRef(false)
  const openDialerRef = useRef<(automatic?: boolean) => Promise<void>>(async () => undefined)

  const selectedLead = snapshot?.leads.find((lead) => lead.id === leadId)
  const selectedPlaybook = snapshot?.playbooks.find((item) => item.id === playbookId)
  const leadCalls = useMemo(() => (snapshot?.calls ?? []).filter((call) => call.leadId === leadId).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()), [leadId, snapshot])
  const leadActivities = useMemo(() => (snapshot?.activities ?? []).filter((activity) => activity.leadId === leadId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [leadId, snapshot])
  const leadEvents = useMemo(() => (snapshot?.events ?? []).filter((event) => event.leadId === leadId).sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()), [leadId, snapshot?.events])
  const pinnedLeadNotes = useMemo(() => leadActivities.filter((activity) => activity.type === 'note' && activity.title.startsWith('📌')).slice(0, 3), [leadActivities])
  const recentHistory = useMemo(() => {
    const items = [
      ...leadCalls.map((call) => ({ id: `call:${call.id}`, at: call.startedAt, label: `Ligação · ${outcomeLabel(call.outcome)}`, detail: call.notes || `${call.durationSeconds}s`, kind: 'call' as const })),
      ...leadActivities.map((activity) => ({ id: `activity:${activity.id}`, at: activity.completedAt || activity.dueAt || activity.createdAt, label: activity.title, detail: activity.description, kind: 'activity' as const })),
      ...leadEvents.map((event) => ({ id: `event:${event.id}`, at: event.startsAt, label: `Reunião · ${event.title}`, detail: event.description || event.location, kind: 'event' as const })),
    ]
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 10)
  }, [leadActivities, leadCalls, leadEvents])
  const priorObjectionTitles = useMemo(() => {
    const found = new Set<string>()
    for (const call of leadCalls) {
      const text = `${call.notes || ''} ${call.transcript || ''}`
      const pattern = /obje[cç][aã]o\s*[—:-]\s*([^.;\n]+)/gi
      for (const match of text.matchAll(pattern)) {
        const title = match[1]?.trim()
        if (title) found.add(title)
      }
    }
    return [...found].slice(0, 4)
  }, [leadCalls])
  const activeGoalInsights = useMemo(() => {
    if (!snapshot) return []
    const today = localDateKey()
    const relevantMetrics = new Set(['calls', 'contacts', 'meetings', 'proposals'])
    const goals = snapshot.goals
      .filter((goal) => goal.periodStart <= today && goal.periodEnd >= today && relevantMetrics.has(goal.metric))
      .filter((goal) => !goal.userId || !user?.id || goal.userId === user.id)
      .sort((a, b) => Number(Boolean(b.userId && b.userId === user?.id)) - Number(Boolean(a.userId && a.userId === user?.id)))
    const byMetric = new Map<string, ReturnType<typeof getGoalInsight>>()
    for (const goal of goals) if (!byMetric.has(goal.metric)) byMetric.set(goal.metric, getGoalInsight(snapshot, goal))
    return [...byMetric.values()].sort((a, b) => Number(b.goal.id === config?.linkedGoalId) - Number(a.goal.id === config?.linkedGoalId)).slice(0, 4)
  }, [config?.linkedGoalId, snapshot, user?.id])
  const selectedStage = snapshot?.stages.find((stage) => stage.id === selectedLead?.stageId)
  const companyContacts = useMemo(() => {
    if (!selectedLead || !snapshot) return []
    if (selectedLead.companyId) return snapshot.contacts.filter((contact) => contact.companyId === selectedLead.companyId)
    return snapshot.contacts.filter((contact) => contact.leadIds.includes(selectedLead.id))
  }, [selectedLead, snapshot])
  const companyRelationships = useMemo(() => selectedLead?.companyId ? (snapshot?.contactRelationships ?? []).filter((item) => item.companyId === selectedLead.companyId) : [], [selectedLead?.companyId, snapshot?.contactRelationships])
  const accountIntelligence = useMemo(() => selectedLead && snapshot ? buildAccountIntelligence(selectedLead, companyContacts, companyRelationships, snapshot) : null, [companyContacts, companyRelationships, selectedLead, snapshot])
  const resolvedTarget = selectedLead ? resolveLeadCallTarget(selectedLead, companyContacts) : null
  const selectedContact = companyContacts.find((contact) => contact.id === attemptContactId)
    ?? companyContacts.find((contact) => contact.id === activeContactId)
    ?? companyContacts.find((contact) => contact.id === resolvedTarget?.contactId)
    ?? null
  const callTargetPhone = selectedContact ? selectedContact.phone?.trim() || '' : resolvedTarget?.phone || ''
  const callTargetName = selectedContact?.name || resolvedTarget?.name || selectedLead?.name || 'Contato'
  const currentProposal = selectedLead ? currentProposalForLead(selectedLead.id, snapshot?.proposals ?? []) : null
  const objectiveDefinition = callSessionObjective(config?.sessionObjective ?? 'first_meeting')
  const playbookContext = useMemo(() => ({ objective: objectiveDefinition.id, stageId: selectedLead?.stageId ?? null, decisionRole: selectedContact?.decisionRole ?? selectedLead?.decisionRole ?? null, temperature: selectedLead?.temperature ?? null, outcome }), [objectiveDefinition.id, outcome, selectedContact?.decisionRole, selectedLead?.decisionRole, selectedLead?.stageId, selectedLead?.temperature])
  const scriptRecommendations = useMemo(() => recommendPlaybooks(snapshot?.playbooks ?? [], { ...playbookContext, kind: 'script' }), [playbookContext, snapshot?.playbooks])
  const battlecardRecommendations = useMemo(() => recommendPlaybooks(snapshot?.playbooks ?? [], { ...playbookContext, kind: 'battlecard' }), [playbookContext, snapshot?.playbooks])
  const checklistRecommendations = useMemo(() => recommendPlaybooks(snapshot?.playbooks ?? [], { ...playbookContext, kind: 'checklist' }), [playbookContext, snapshot?.playbooks])
  const selectedRecommendation = scriptRecommendations.find((item) => item.playbook.id === playbookId) ?? null
  const nextBestAction = useMemo(() => selectedLead ? recommendCommercialAction(selectedLead, selectedStage ?? null, snapshot?.calls ?? [], snapshot?.activities ?? []) : null, [selectedLead, selectedStage, snapshot?.activities, snapshot?.calls])
  const recordingSupported = typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  const activeVoiceProvider = voiceProviders.find((item) => item.id === voiceProviderId) ?? null
  const activeVoiceDevice = voiceDevices.find((item) => item.id === voiceDeviceId) ?? null
  const activeVoiceIdentity = voiceSettings.outboundIdentities.find((item) => item.id === voiceCallerId) ?? null
  const voiceCanStart = voiceProviderId === 'external_tel' || (activeVoiceProvider?.state === 'available' && Boolean(activeVoiceDevice?.available))
  const voiceLaunchAvailable = voiceCanStart || voiceProviderId === 'realtalent_connect'
  const activeRuntimeProviderId = voiceCall?.providerId ?? voiceProviderId
  const voiceState = voiceCall?.state ?? (session === 'idle' ? 'ready' : session === 'dialing' ? 'ringing' : session === 'running' ? 'connected' : session === 'paused' ? 'held' : session === 'finished' ? 'ended' : 'ready')
  const speechConstructor = (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition
  const speechSupported = Boolean(speechConstructor)
  const currentDefinition = outcomeDefinition(outcome)
  const currentStep = outboundStepById(currentStepId)
  const wrapRecommendation = useMemo(() => buildWrapRecommendation(outcome, discovery, notes), [discovery, notes, outcome])
  const discoveryChecklist = useMemo(() => buildDiscoveryChecklist({ lead: selectedLead, contacts: companyContacts, notes, decisionMaker: discovery.decisionMaker, currentSystem: discovery.currentSystem, mainPain: discovery.mainPain, bestTime: discovery.bestTime, objective: config?.sessionObjective ?? 'first_meeting' }), [companyContacts, config?.sessionObjective, discovery, notes, selectedLead])
  const discoveryCompleted = discoveryChecklist.filter((item) => item.complete).length
  const liveConversationText = `${transcript}${interim ? ` ${interim}` : ''}${notes ? ` ${notes}` : ''}`.trim()
  const liveSignals = useMemo(() => analyzeLiveConversation(liveConversationText), [liveConversationText])
  const callHealth = useMemo(() => selectedLead ? buildCallHealth({ lead: selectedLead, contact: selectedContact, contacts: companyContacts, allLeads: snapshot?.leads ?? [], calls: snapshot?.calls ?? [], events: snapshot?.events ?? [] }) : null, [companyContacts, selectedContact, selectedLead, snapshot?.calls, snapshot?.events, snapshot?.leads])
  const preCallBrief = useMemo(() => selectedLead ? buildPreCallBrief({ lead: selectedLead, contact: selectedContact, contacts: companyContacts, calls: snapshot?.calls ?? [], activities: snapshot?.activities ?? [], proposals: snapshot?.proposals ?? [], stage: selectedStage ?? null, objective: config?.sessionObjective ?? 'first_meeting' }) : null, [companyContacts, config?.sessionObjective, selectedContact, selectedLead, selectedStage, snapshot?.activities, snapshot?.calls, snapshot?.proposals])
  const nextBestQuestion = useMemo(() => recommendNextBestQuestion({ checklist: discoveryChecklist, mainPain: discovery.mainPain, objective: config?.sessionObjective ?? 'first_meeting', liveSignals }), [config?.sessionObjective, discovery.mainPain, discoveryChecklist, liveSignals])
  const activeGuidanceTabs = useMemo<GuidanceTab[]>(() => {
    const next: GuidanceTab[] = []
    if (effectiveDisplay?.showLeadContext !== false) next.push('assistant', 'stakeholders')
    if (effectiveDisplay?.showObjections !== false) next.push('objections', 'battlecards')
    if (effectiveDisplay?.showHistory !== false) next.push('history')
    return [...new Set(next)]
  }, [effectiveDisplay])

  const tokenValues = useMemo(() => ({
    'Nome do Lead': selectedLead?.name || 'nome do contato',
    'Nome do Estabelecimento': selectedLead?.company || 'estabelecimento',
    'Responsável': selectedLead?.ownerName || 'consultor da RealTalent',
    'Dor principal': discovery.mainPain || 'o problema identificado',
    'Opção de horário 1': discovery.bestTime || 'terça-feira às 15h',
    'Opção de horário 2': 'quarta-feira às 10h',
  }), [discovery.bestTime, discovery.mainPain, selectedLead?.company, selectedLead?.name, selectedLead?.ownerName])

  const renderedStep = useMemo(() => ({
    say: renderOutboundText(currentStep.say, tokenValues),
    ask: currentStep.ask ? renderOutboundText(currentStep.ask, tokenValues) : '',
  }), [currentStep, tokenValues])

  const renderedTeamPlaybook = useMemo(() => (selectedPlaybook?.content ?? '')
    .replaceAll('{{nome}}', selectedLead?.name ?? 'lead')
    .replaceAll('{{empresa}}', selectedLead?.company || 'empresa')
    .replaceAll('{{cidade}}', selectedLead?.city || 'sua cidade')
    .replaceAll('{{responsavel}}', selectedLead?.ownerName || 'consultor da RealTalent')
    .replaceAll('[Nome]', selectedLead?.name ?? 'lead')
    .replaceAll('[Empresa]', selectedLead?.company || 'empresa'), [selectedLead, selectedPlaybook?.content])

  const objections = useMemo<ObjectionItem[]>(() => {
    const teamItems: ObjectionItem[] = recommendPlaybooks(snapshot?.playbooks ?? [], { ...playbookContext, kind: 'objection' })
      .map(({ playbook: item }) => ({ id: `team:${item.id}`, title: item.title.replace(/[“”"]/g, ''), category: item.category || 'Objeção da equipe', response: item.content, diagnosticQuestion: item.guidance?.coachingFocus || 'Qual é o principal motivo para isso não fazer sentido agora?', source: 'team' }))
    const teamTitles = new Set(teamItems.map((item) => item.title.trim().toLowerCase()))
    return [...teamItems, ...BUILT_IN_OBJECTIONS.filter((item) => !teamTitles.has(item.title.trim().toLowerCase())).map<ObjectionItem>((item) => ({ ...item, source: 'built-in' }))]
  }, [playbookContext, snapshot?.playbooks])

  const activeObjection = objections.find((item) => item.id === activeObjectionId) ?? null
  const activeCapturedObjection = capturedObjections.find((item) => item.id === activeObjectionId) ?? (activeObjection ? { ...activeObjection, status: 'open' as ObjectionStatus, leadResponse: '' } : null)
  const queueLeads = useMemo(() => routineIds.map((id) => snapshot?.leads.find((lead) => lead.id === id)).filter((lead): lead is Lead => Boolean(lead)), [routineIds, snapshot?.leads])

  const cleanupMedia = useCallback(() => {
    recognitionRef.current?.stop(); recognitionRef.current = null; setListening(false)
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null; mediaRecorderRef.current = null; setRecording(false)
  }, [workspaceId])

  const hasUnsavedAttempt = !attemptSaved && Boolean(startedAt || seconds > 0 || notes.trim() || outcomeDetail.trim() || capturedObjections.length || transcript.trim() || interim.trim() || recordingBlob || recording || listening || session !== 'idle' || Object.values(discovery).some(Boolean) || currentStepId !== 'opening')

  const confirmDiscardAttempt = useCallback(async (action: string) => {
    if (recording) { notify('error', 'Pare a gravação antes de sair desta tentativa.'); return false }
    if (!hasUnsavedAttempt) return true
    return confirmAction({
      title: 'Descartar tentativa não salva?',
      description: `${action} irá remover as anotações, o progresso e os dados ainda não salvos desta ligação.`,
      confirmLabel: 'Descartar e continuar',
      tone: 'warning',
      details: ['Gravações em andamento precisam ser encerradas primeiro.', 'Resultados já salvos no histórico não serão alterados.'],
    })
  }, [confirmAction, hasUnsavedAttempt, notify, recording])

  const draftRecordingKeyFor = useCallback((attemptId = callAttemptIdRef.current || callAttemptId || leadId || 'pending') =>
    callRecordingDraftKey(workspaceId, user?.id ?? null, attemptId), [callAttemptId, leadId, user?.id, workspaceId])

  const clearDraftRecording = useCallback(async (attemptId?: string) => {
    const key = draftRecordingKeyFor(attemptId)
    try { await deleteLocalRecording(key) } catch { /* rascunho inexistente */ }
    try { await deleteLocalRecordingChunks(key) } catch { /* chunks inexistentes */ }
  }, [draftRecordingKeyFor])

  const clearStoredRecoveryDraft = useCallback(async () => {
    const raw = safeStorageGet(sessionStorageKey)
    if (!raw) return
    try {
      const stored = JSON.parse(raw) as StoredCallSession
      if (!storedCallSessionMatchesScope(stored, workspaceId, user?.id ?? null)) return
      const key = callRecordingDraftKey(workspaceId, user?.id ?? null, stored.callAttemptId || stored.leadId)
      await deleteLocalRecording(key).catch(() => undefined)
      await deleteLocalRecordingChunks(key).catch(() => undefined)
    } catch { /* payload corrompido: a sessão será descartada */ }
  }, [sessionStorageKey, user?.id, workspaceId])

  const resetAttempt = useCallback((nextLeadId: string, nextIndex: number, autoDispatch = false) => {
    cleanupMedia()
    setLeadId(nextLeadId); setQueueIndex(nextIndex); setSession('idle'); setStartedAt(null); setSeconds(0); setOutcome('answered'); setWrapGroup('conversation')
    setPlaybookId(config?.playbookId || '')
    setNotes(readCallNoteDraft(workspaceId, nextLeadId)); setTranscript(''); setInterim(''); setConsent(false); setRecording(false); setRecordingBlob(null); recordingBlobRef.current = null; setListening(false)
    setScheduleNext(true); setNextAt(nextHourInput()); setCurrentStepId('opening'); setVisitedStepIds(['opening']); setDiscovery(EMPTY_DISCOVERY); setActiveObjectionId(''); setWorkTab('script'); setCapturedSignals([]); setScriptView('guided'); setCapturedObjections([]); setOutcomeDetail('')
    setAttemptSaved(false); setAttemptContactId(''); setAdvanceTarget(null); setAdvanceCountdown(0); setAutoDialPending(Boolean(autoDispatch && config?.fastDial && config?.autoDispatchNext)); setContextTab('summary'); setVoiceCall(null); setCallAttemptId(''); setVoiceTransport('healthy'); setVoiceTransportDetail('')
    setGuidanceTab(activeGuidanceTabs[0] ?? 'assistant')
    const nextLead = snapshot?.leads.find((lead) => lead.id === nextLeadId)
    const nextTarget = nextLead ? resolveLeadCallTarget(nextLead, snapshot?.contacts ?? []) : null
    setActiveContactId(nextTarget?.contactId ?? '')
    if (recordingUrl) URL.revokeObjectURL(recordingUrl)
    setRecordingUrl(null)
    void clearDraftRecording()
  }, [activeGuidanceTabs, cleanupMedia, clearDraftRecording, config?.autoDispatchNext, config?.fastDial, config?.playbookId, recordingUrl, snapshot?.contacts, snapshot?.leads, workspaceId])

  useEffect(() => {
    if (!open || !config) return
    const validQueue = config.leadIds.filter((id, index, all) => all.indexOf(id) === index && snapshot?.leads.some((lead) => lead.id === id && lead.status === 'active' && Boolean(resolveLeadCallTarget(lead, snapshot?.contacts ?? []).phone)))
    const startingId = config.initialLeadId || validQueue[0] || ''
    const startingIndex = Math.max(0, validQueue.indexOf(startingId))
    setRoutineIds(validQueue)
    setLeadId(startingId); setQueueIndex(startingIndex); setSession('idle'); setStartedAt(null); setSeconds(0); setOutcome('answered'); setWrapGroup('conversation'); setNotes(readCallNoteDraft(workspaceId, startingId)); setTranscript(''); setInterim('')
    setConsent(false); setRecording(false); setRecordingBlob(null); recordingBlobRef.current = null; setListening(false); setScheduleNext(true); setNextAt(nextHourInput())
    setPlaybookId(config.playbookId || '')
    setLocalDisplay(config.display); setFullScreen(true); setCurrentStepId('opening'); setVisitedStepIds(['opening']); setDiscovery(EMPTY_DISCOVERY); setActiveObjectionId(''); setGuidanceTab('assistant'); setWorkTab('script'); setCapturedSignals([]); setScriptView('guided'); setCapturedObjections([]); setOutcomeDetail(''); setContextTab('summary'); setStrategy(readCallingStrategyPreferences(workspaceId))
    const initialLead = snapshot?.leads.find((lead) => lead.id === startingId)
    const initialTarget = initialLead ? resolveLeadCallTarget(initialLead, snapshot?.contacts ?? []) : null
    setActiveContactId(initialTarget?.contactId ?? '')
    setAttemptContactId('')
    setAttemptSaved(false); setCompletedInSession(0); setSessionOutcomes([]); setAdvanceTarget(null); setAdvanceCountdown(0); setAutoDialPending(Boolean(config.fastDial)); setVoiceCall(null); setVoiceMuted(false); setVoiceHeld(false); setCallAttemptId(''); setVoiceTransport('healthy'); setVoiceTransportDetail('')
    if (recordingUrl) URL.revokeObjectURL(recordingUrl); setRecordingUrl(null)
    // Privacy migration: never recover the old global session/draft keys across workspaces.
    LEGACY_STORAGE_KEYS.forEach((key) => safeStorageRemove(key))
    void deleteLocalRecording(LEGACY_DRAFT_RECORDING_KEY).catch(() => undefined)
    const recoveryRaw = safeStorageGet(sessionStorageKey)
    let recoveryStored: StoredCallSession | null = null
    try { recoveryStored = recoveryRaw ? JSON.parse(recoveryRaw) as StoredCallSession : null } catch { safeStorageRemove(sessionStorageKey) }
    const recoveryValid = Boolean(recoveryStored && storedCallSessionMatchesScope(recoveryStored, workspaceId, user?.id ?? null) && snapshot?.leads.some((item) => item.id === recoveryStored!.leadId))
    setShowRecovery(recoveryValid)
    if (recoveryStored && !recoveryValid) {
      const invalidDraftKey = callRecordingDraftKey(workspaceId, user?.id ?? null, recoveryStored.callAttemptId || recoveryStored.leadId || 'pending')
      void deleteLocalRecording(invalidDraftKey).catch(() => undefined)
      void deleteLocalRecordingChunks(invalidDraftKey).catch(() => undefined)
      safeStorageRemove(sessionStorageKey)
    }
    if (recoveryStored && recoveryValid && recoveryStored.hasRecordingDraft) {
      const recoveryDraftKey = callRecordingDraftKey(workspaceId, user?.id ?? null, recoveryStored.callAttemptId || recoveryStored.leadId)
      void Promise.all([readLocalRecording(recoveryDraftKey).catch(() => undefined), readLocalRecordingChunks(recoveryDraftKey).catch(() => [])])
        .then(([blob, chunks]) => setRecoveryHasAudio(Boolean(blob?.size || chunks.some((chunk) => chunk.size))))
        .catch(() => setRecoveryHasAudio(false))
    } else setRecoveryHasAudio(false)
    return cleanupMedia
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, config?.initialLeadId, workspaceId])

  useEffect(() => {
    if (!open || config?.playbookId || playbookId || !scriptRecommendations.length) return
    setPlaybookId(scriptRecommendations[0].playbook.id)
  }, [config?.playbookId, open, playbookId, scriptRecommendations])

  useEffect(() => {
    if (!activeGuidanceTabs.includes(guidanceTab)) setGuidanceTab(activeGuidanceTabs[0] ?? 'assistant')
  }, [activeGuidanceTabs, guidanceTab])


  useEffect(() => {
    if (effectiveDisplay?.showNotes === false && workTab !== 'script') setWorkTab('script')
  }, [effectiveDisplay?.showNotes, workTab])

  useEffect(() => {
    if (!open || !leadId || !strategy.autosaveNotes) return
    const timer = window.setTimeout(() => saveCallNoteDraft(workspaceId, leadId, notes), 250)
    return () => window.clearTimeout(timer)
  }, [leadId, notes, open, strategy.autosaveNotes, workspaceId])

  useEffect(() => {
    if (!open || !leadId) return
    if (session === 'idle' && seconds === 0 && !notes.trim() && !transcript.trim() && currentStepId === 'opening' && !Object.values(discovery).some(Boolean)) return
    const payload: StoredCallSession = { schemaVersion: CALL_SESSION_SCHEMA_VERSION, workspaceId, userId: user?.id ?? null, leadId, queueLeadIds: routineIds, queueIndex, session, startedAt, seconds, outcome, notes, transcript, nextAt, scheduleNext, playbookId, consent, hasRecordingDraft: Boolean(recordingBlob || recording), currentStepId, visitedStepIds, discovery, activeContactId, attemptContactId, workTab, capturedSignals, scriptView, capturedObjections, outcomeDetail, voiceCall, callAttemptId, voiceTransport, voiceTransportDetail }
    safeStorageSet(sessionStorageKey, JSON.stringify(payload))
  }, [activeContactId, attemptContactId, callAttemptId, capturedObjections, capturedSignals, consent, currentStepId, discovery, leadId, nextAt, notes, open, outcome, outcomeDetail, playbookId, queueIndex, recording, recordingBlob, routineIds, scheduleNext, scriptView, seconds, session, startedAt, transcript, visitedStepIds, voiceCall, voiceTransport, voiceTransportDetail, workTab, sessionStorageKey, user?.id, workspaceId])

  useEffect(() => {
    if (session !== 'running') return
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [session])

  useEffect(() => {
    const next = defaultNextDate(outcome, new Date(), preferences.commercial)
    setScheduleNext(currentDefinition.requiresSchedule)
    setNextAt(toInput(next))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, preferences.commercial])

  const recoverSession = async () => {
    try {
      const raw = safeStorageGet(sessionStorageKey) ?? ''
      const stored = JSON.parse(raw) as StoredCallSession
      if (!storedCallSessionMatchesScope(stored, workspaceId, user?.id ?? null)) throw new Error('Sessão pertence a outro workspace ou usuário.')
      if (!snapshot?.leads.some((item) => item.id === stored.leadId)) throw new Error('Lead da sessão não existe no workspace atual.')
      setLeadId(stored.leadId); setRoutineIds(stored.queueLeadIds); setQueueIndex(stored.queueIndex); setSession(stored.session === 'running' ? 'paused' : stored.session)
      setStartedAt(stored.startedAt); setSeconds(stored.seconds); setOutcome(stored.outcome); setNotes(stored.notes); setTranscript(stored.transcript); setNextAt(stored.nextAt); setScheduleNext(stored.scheduleNext); setPlaybookId(stored.playbookId)
      setConsent(Boolean(stored.consent)); setCurrentStepId(stored.currentStepId ?? 'opening'); setVisitedStepIds(stored.visitedStepIds?.length ? stored.visitedStepIds : ['opening']); setDiscovery(stored.discovery ?? EMPTY_DISCOVERY); setActiveContactId(stored.activeContactId ?? ''); setAttemptContactId(stored.attemptContactId ?? (stored.session !== 'idle' ? stored.activeContactId ?? '' : '')); setWorkTab(stored.workTab ?? 'script'); setCapturedSignals(stored.capturedSignals ?? []); setScriptView(stored.scriptView ?? 'guided'); setCapturedObjections(stored.capturedObjections ?? []); setOutcomeDetail(stored.outcomeDetail ?? '')
      const recoveredVoiceCall = stored.voiceCall ?? null
      const recoveredAttemptId = stored.callAttemptId ?? ''
      setVoiceCall(recoveredVoiceCall); setCallAttemptId(recoveredAttemptId); setVoiceTransport(stored.voiceTransport ?? 'healthy'); setVoiceTransportDetail(stored.voiceTransportDetail ?? '')
      if (recoveredVoiceCall?.providerId === 'realtalent_connect' && recoveredVoiceCall.externalCallId && !['ended', 'failed'].includes(recoveredVoiceCall.state)) resumeVoiceCallMonitoring(voiceSettings, recoveredVoiceCall)
      const runtime = runtimeAttemptById(workspaceId, recoveredAttemptId)
      if (runtime?.transport === 'degraded') { setVoiceTransport('degraded'); setVoiceTransportDetail(runtime.lastDetail || 'Reconectando ao RealTalent Connect.') }
      const group = WRAP_GROUPS.find((item) => item.outcomes.includes(stored.outcome))?.id ?? 'conversation'; setWrapGroup(group)
      const recoveryDraftKey = callRecordingDraftKey(workspaceId, user?.id ?? null, recoveredAttemptId || stored.leadId)
      const fullDraft = stored.hasRecordingDraft ? await readLocalRecording(recoveryDraftKey).catch(() => undefined) : undefined
      const chunkDrafts = !fullDraft?.size && stored.hasRecordingDraft ? await readLocalRecordingChunks(recoveryDraftKey).catch(() => []) : []
      const draft = fullDraft?.size ? fullDraft : chunkDrafts.length ? new Blob(chunkDrafts, { type: chunkDrafts[0]?.type || 'audio/webm' }) : undefined
      if (draft?.size) { recordingBlobRef.current = draft; setRecordingBlob(draft); setRecordingUrl(URL.createObjectURL(draft)); setRecoveryHasAudio(true) }
      setShowRecovery(false)
      notify('success', draft?.size ? 'Sessão e áudio parcial recuperados em modo pausado.' : 'Sessão recuperada em modo pausado.')
    } catch { safeStorageRemove(sessionStorageKey); await clearDraftRecording(); setShowRecovery(false); notify('error', 'Não foi possível recuperar a sessão anterior.') }
  }

  const discardRecovery = async () => { await clearStoredRecoveryDraft(); safeStorageRemove(sessionStorageKey); setShowRecovery(false); setRecoveryHasAudio(false) }

  const refreshVoiceLayer = useCallback(async (settings: VoiceSettings) => {
    const providers = await probeVoiceProviders(settings)
    setVoiceProviders(providers)
    setVoiceDevices(await discoverVoiceDevices(providers, settings, workspaceId))
    return providers
  }, [workspaceId])

  useEffect(() => {
    if (!open) return
    const next = readVoiceSettings(workspaceId)
    setVoiceSettings(next); setVoiceProviderId(next.defaultProviderId); setVoiceDeviceId(next.selectedDeviceId); setVoiceCallerId(next.selectedCallerId)
    void refreshVoiceLayer(next)
  }, [open, workspaceId, refreshVoiceLayer])

  useEffect(() => { voiceCallRef.current = voiceCall }, [voiceCall])
  useEffect(() => { callAttemptIdRef.current = callAttemptId }, [callAttemptId])

  useEffect(() => subscribeVoiceEvents((event) => {
    const current = voiceCallRef.current
    if (!current?.externalCallId || current.externalCallId !== event.callId) return
    const runtimeAttemptId = callAttemptIdRef.current
    if (runtimeAttemptId) applyVoiceRuntimeEvent(workspaceId, runtimeAttemptId, event)
    if (event.transport === 'degraded') {
      setVoiceTransport('degraded')
      setVoiceTransportDetail(event.detail || 'O CRM perdeu temporariamente a confirmação de estado do RealTalent Connect. A chamada não será encerrada automaticamente.')
      return
    }
    if (event.transport === 'recovered') {
      setVoiceTransport('recovered')
      setVoiceTransportDetail(event.detail || 'Conexão com o RealTalent Connect restabelecida.')
      window.setTimeout(() => setVoiceTransport((value) => value === 'recovered' ? 'healthy' : value), 3500)
    } else if (event.transport === 'healthy') {
      setVoiceTransport('healthy')
      setVoiceTransportDetail('')
    }
    if (event.state === 'connected') {
      setSession('running')
      setOutcome('answered')
      setWrapGroup('conversation')
    }
    if (event.state === 'held') setSession('paused')
    if (event.state === 'failed') {
      setOutcome('no_answer')
      setWrapGroup('no_contact')
      setSession('finished')
    }
    if (event.state === 'ended') {
      if (!['connected', 'held'].includes(current.state)) {
        setOutcome('no_answer')
        setWrapGroup('no_contact')
      }
      setSession('finished')
    }
    setVoiceCall({ ...current, state: event.state })
  }), [workspaceId])

  const openDialer = async (automatic = false) => {
    const blocked = contactBlockedMessage(selectedLead, 'call')
    if (blocked) { notify('info', blocked); return }
    if (selectedContact?.doNotContact) { notify('info', selectedContact.doNotContactReason?.trim() ? `Contato bloqueado: ${selectedContact.doNotContactReason}` : 'Este stakeholder está marcado como não contatar.'); return }
    if (!selectedLead || !callTargetPhone) { notify('error', 'Este contato não possui telefone.'); return }
    if (callHealth?.status === 'restricted') { notify('error', `Call Health bloqueou esta tentativa: ${callHealth.recommendation}`); return }
    let launchProviderId: VoiceProviderId = voiceProviderId
    let launchDeviceId = voiceDeviceId
    let provider = activeVoiceProvider
    if (voiceProviderId !== 'external_tel' && provider?.state !== 'available') {
      const statuses = await refreshVoiceLayer(voiceSettings)
      provider = statuses.find((item) => item.id === voiceProviderId) ?? null
      if (provider?.state !== 'available') {
        if (voiceProviderId !== 'realtalent_connect') { notify('error', `${providerLabel(voiceProviderId)} não está disponível.`); return }
        if (automatic) { notify('error', 'Fast Dial pausado: o RealTalent Phone não está online. Reabra o companion no celular e tente novamente.'); return }
        const fallback = await confirmAction({
          title: 'RealTalent Connect indisponível',
          description: 'O bridge ou o celular pareado não respondeu. Você pode continuar esta tentativa pelo discador padrão do dispositivo sem perder o fluxo comercial.',
          confirmLabel: 'Usar discador do dispositivo',
          tone: 'warning',
          details: [provider?.detail || 'Connect sem canal de saída disponível.', 'O resultado e a próxima ação continuam sendo registrados no CRM.'],
        })
        if (!fallback) return
        launchProviderId = 'external_tel'
        launchDeviceId = 'external:system-dialer'
      }
    }
    const attempt = beginCallRuntimeAttempt({ workspaceId, leadId: selectedLead.id, contactId: selectedContact?.id ?? null, providerId: launchProviderId, deviceId: launchDeviceId, phone: callTargetPhone })
    setCallAttemptId(attempt.attemptId)
    setVoiceTransport('healthy')
    setVoiceTransportDetail('')
    setVoiceBusy(true)
    try {
      const runtime = await startOutboundVoiceCall({ settings: voiceSettings, providerId: launchProviderId, deviceId: launchDeviceId, phone: callTargetPhone, callerId: launchProviderId === 'realtalent_connect' ? activeVoiceIdentity?.number ?? null : null, workspaceId, leadId: selectedLead.id, contactId: selectedContact?.id ?? null, displayName: callTargetName, companyName: selectedLead.company || null, playbookId: selectedPlaybook?.id ?? null, playbookName: sessionPlaybookLabel, sessionId: attempt.attemptId, objective: objectiveDefinition.shortLabel, requestId: attempt.attemptId, fastDial: Boolean(config?.fastDial && launchProviderId === 'realtalent_connect' && launchDeviceId.startsWith('connect:phone:')) })
      bindVoiceRuntime(workspaceId, attempt.attemptId, runtime)
      setAttemptContactId(selectedContact?.id ?? '')
      setStartedAt(runtime.startedAt); setSeconds(0); setVoiceCall(runtime); setSession('dialing')
      notify('info', runtime.providerId === 'external_tel' ? (launchProviderId !== voiceProviderId ? 'Connect indisponível: discador do dispositivo aberto como fallback. O fluxo comercial continua no CRM.' : 'Discador do dispositivo aberto. O CRM manterá o fluxo comercial; estados da operadora são confirmados manualmente.') : activeVoiceDevice?.id.startsWith('connect:phone:') ? `Chamada enviada para ${activeVoiceDevice.label}.` : 'Chamada enviada ao RealTalent Connect.')
    } catch (error) {
      updateCallRuntimeAttempt(workspaceId, attempt.attemptId, { state: 'failed', transport: 'degraded', lastDetail: error instanceof Error ? error.message : 'Falha ao iniciar a chamada.' })
      setVoiceTransport('degraded')
      setVoiceTransportDetail(error instanceof Error ? error.message : 'Falha ao iniciar a chamada.')
      notify('error', error instanceof Error ? error.message : 'Não foi possível iniciar a chamada.')
    } finally { setVoiceBusy(false) }
  }
  openDialerRef.current = openDialer

  const markAnswered = () => { if (!startedAt) setStartedAt(new Date().toISOString()); setOutcome('answered'); setWrapGroup('conversation'); setVoiceCall((current) => current ? { ...current, state: 'connected' } : current); if (callAttemptId) updateCallRuntimeAttempt(workspaceId, callAttemptId, { state: 'connected' }); setSession('running') }
  const markNoAnswer = () => { setOutcome('no_answer'); setWrapGroup('no_contact'); setVoiceCall((current) => current ? { ...current, state: 'ended' } : current); if (callAttemptId) updateCallRuntimeAttempt(workspaceId, callAttemptId, { state: 'ended' }); setSession('finished'); setSeconds(0) }
  const cancelDialing = async () => {
    const current = voiceCallRef.current
    if (current?.providerId === 'realtalent_connect' && current.externalCallId && !['ended', 'failed'].includes(current.state)) {
      setVoiceBusy(true)
      try { await sendVoiceCommand(voiceSettings, current, 'hangup') }
      catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível cancelar a chamada no provider.') }
      finally { setVoiceBusy(false) }
    }
    setOutcome('no_answer')
    setWrapGroup('no_contact')
    setVoiceCall((value) => value ? { ...value, state: 'ended' } : value)
    if (callAttemptId) updateCallRuntimeAttempt(workspaceId, callAttemptId, { state: 'ended' })
    setSession('finished')
    setSeconds(0)
  }
  const finishSession = async () => {
    if (voiceCall?.providerId === 'realtalent_connect' && voiceCall.externalCallId && !['ended', 'failed'].includes(voiceCall.state)) {
      try { await sendVoiceCommand(voiceSettings, voiceCall, 'hangup') } catch { /* mantém wrap-up mesmo se o bridge perdeu conexão */ }
    }
    setVoiceCall((current) => current ? { ...current, state: 'ended' } : current)
    if (callAttemptId) updateCallRuntimeAttempt(workspaceId, callAttemptId, { state: 'ended' })
    setSession('finished'); if (recording && mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop(); if (listening) recognitionRef.current?.stop()
  }

  const voiceCommand = async (command: 'mute' | 'unmute' | 'hold' | 'resume' | 'dtmf' | 'transfer' | 'voicemail_drop', payload: Record<string, unknown> = {}) => {
    if (!voiceCall) return
    setVoiceBusy(true)
    try {
      const result = await sendVoiceCommand(voiceSettings, voiceCall, command, payload)
      if (result.state) setVoiceCall((current) => current ? { ...current, state: result.state! } : current)
      if (command === 'mute') setVoiceMuted(true)
      if (command === 'unmute') setVoiceMuted(false)
      if (command === 'hold') { setVoiceHeld(true); setSession('paused') }
      if (command === 'resume') { setVoiceHeld(false); setSession('running') }
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Comando de voz indisponível.') }
    finally { setVoiceBusy(false) }
  }

  const sendDtmf = async () => {
    const digits = await promptAction({ title: 'Teclado da chamada', description: 'Digite os tons DTMF que devem ser enviados pelo provedor.', label: 'Dígitos', placeholder: 'Ex.: 1#204', confirmLabel: 'Enviar', required: true })
    if (digits?.trim()) await voiceCommand('dtmf', { digits: digits.trim().replace(/[^0-9*#]/g, '') })
  }

  const transferVoiceCall = async () => {
    const target = await promptAction({ title: 'Transferir chamada', description: 'Informe o ramal, número ou identificador aceito pelo provedor de voz.', label: 'Destino', placeholder: 'Ex.: ramal 204', confirmLabel: 'Transferir', required: true })
    if (target?.trim()) await voiceCommand('transfer', { target: target.trim(), mode: 'warm' })
  }

  const dropVoicemail = async () => {
    const message = await promptAction({ title: 'Voicemail Drop', description: 'Use uma mensagem aprovada pelo time. O recurso só é executado se o provedor declarar suporte.', label: 'Mensagem', placeholder: 'Olá, tentei falar com você...', confirmLabel: 'Enviar mensagem', required: true })
    if (message?.trim()) await voiceCommand('voicemail_drop', { text: message.trim() })
  }

  const startRecording = async () => {
    if (!consent) { notify('error', 'Confirme o consentimento antes de gravar.'); return }
    if (!recordingSupported) { notify('error', 'Gravação indisponível neste navegador ou sem HTTPS.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); mediaStreamRef.current = stream; chunksRef.current = []; recordingChunkIndexRef.current = 0
      const recorder = new MediaRecorder(stream); mediaRecorderRef.current = recorder
      const draftKey = draftRecordingKeyFor(callAttemptId || leadId)
      await deleteLocalRecording(draftKey).catch(() => undefined)
      await deleteLocalRecordingChunks(draftKey).catch(() => undefined)
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return
        chunksRef.current.push(event.data)
        const index = recordingChunkIndexRef.current++
        void saveLocalRecordingChunk(draftKey, index, event.data).catch(() => notify('error', 'Não foi possível manter o backup local incremental da gravação.'))
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        recordingBlobRef.current = blob; setRecordingBlob(blob)
        void saveLocalRecording(draftKey, blob).then(() => deleteLocalRecordingChunks(draftKey)).catch(() => notify('error', 'O áudio foi mantido na sessão, mas o backup local final falhou.'))
        if (recordingUrl) URL.revokeObjectURL(recordingUrl); setRecordingUrl(URL.createObjectURL(blob)); setRecording(false); stream.getTracks().forEach((track) => track.stop())
      }
      recorder.start(1000); setRecording(true)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível acessar o microfone.') }
  }

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return recordingBlobRef.current ?? recordingBlob
    if (recorder.state !== 'recording') {
      if (recording && !recordingBlobRef.current) await new Promise((resolve) => window.setTimeout(resolve, 90))
      return recordingBlobRef.current ?? recordingBlob
    }
    await new Promise<void>((resolve) => { const previous = recorder.onstop; recorder.onstop = (event) => { previous?.call(recorder, event); window.setTimeout(resolve, 60) }; recorder.stop() })
    return recordingBlobRef.current ?? recordingBlob
  }

  const toggleTranscription = () => {
    if (!speechConstructor) { notify('error', 'Transcrição ao vivo não é suportada neste navegador.'); return }
    if (listening) { recognitionRef.current?.stop(); return }
    const recognition = new speechConstructor(); recognition.lang = 'pt-BR'; recognition.continuous = true; recognition.interimResults = true
    recognition.onresult = (event) => { let confirmed = ''; let temporary = ''; for (let index = event.resultIndex; index < event.results.length; index += 1) { const result = event.results[index]; if (result.isFinal) confirmed += `${result[0].transcript} `; else temporary += result[0].transcript }; if (confirmed) setTranscript((current) => `${current}${confirmed}`.trimStart()); setInterim(temporary) }
    recognition.onend = () => { setListening(false); setInterim('') }
    recognition.onerror = () => { setListening(false); notify('error', 'A transcrição foi interrompida pelo navegador.') }
    recognitionRef.current = recognition; recognition.start(); setListening(true)
  }

  const moveInQueue = async (direction: 1 | -1) => {
    if (!await confirmDiscardAttempt(direction > 0 ? 'Avançar para o próximo lead' : 'Voltar ao lead anterior')) return
    const nextIndex = queueIndex + direction
    const nextLeadId = routineIds[nextIndex]
    if (!nextLeadId) { notify('info', direction > 0 ? 'Você chegou ao fim da fila.' : 'Você está no primeiro lead.'); return }
    resetAttempt(nextLeadId, nextIndex)
  }

  const discoverySummary = Object.entries({ 'Decisor': discovery.decisionMaker, 'Sistema/processo atual': discovery.currentSystem, 'Dor principal': discovery.mainPain, 'Melhor horário': discovery.bestTime }).filter(([, value]) => value.trim()).map(([label, value]) => `${label}: ${value.trim()}.`).join(' ')

  const save = async (advance = false) => {
    if (saveInFlightRef.current) return
    const persistedRuntime = runtimeAttemptById(workspaceId, callAttemptId)
    if (persistedRuntime?.savedAt) {
      setAttemptSaved(true)
      notify('info', 'Este resultado já foi registrado. O CRM bloqueou um salvamento duplicado.')
      return
    }
    if (!leadId) { notify('error', 'Selecione um lead.'); return }
    if (!startedAt || session === 'idle') { notify('error', 'Inicie a tentativa antes de salvar o resultado.'); return }
    if (outcome === 'answered' && seconds <= 0) { notify('error', 'Uma ligação atendida precisa ter duração maior que zero.'); return }
    if (recordingBlob && !consent) { notify('error', 'O áudio só pode ser salvo com consentimento confirmado.'); return }
    if (session === 'running') { notify('error', 'Finalize ou pause a ligação antes de salvar.'); return }
    if (currentDefinition.requiresSchedule && (!scheduleNext || !nextAt)) { notify('error', 'Este resultado exige o agendamento do próximo passo.'); return }
    saveInFlightRef.current = true
    setBusy(true)
    try {
      const blob = await stopRecording()
      const start = startedAt ?? new Date().toISOString(); const ended = new Date().toISOString()
      const manualSignalLabels = capturedSignals.map((id) => CALL_QUICK_SIGNALS.find((item) => item.id === id)?.label ?? id)
      const automaticSignalLabels = liveSignals.map((signal) => signal.label)
      const allSignalLabels = [...new Set([...manualSignalLabels, ...automaticSignalLabels])]
      const recordedProviderId = voiceCall?.providerId ?? voiceProviderId
      const recordedDeviceLabel = recordedProviderId === 'external_tel' ? 'Discador do sistema' : activeVoiceDevice?.label ?? ''
      const recordedCallerId = recordedProviderId === 'realtalent_connect' ? activeVoiceIdentity?.number ?? '' : ''
      const objectionNotes = capturedObjections.map((item) => `Objeção — ${item.title}. Status: ${item.status === 'resolved' ? 'contornada' : item.status === 'persisted' ? 'permaneceu' : 'em aberto'}.${item.leadResponse.trim() ? ` Resposta do lead: ${item.leadResponse.trim()}.` : ''}${item.response.trim() ? ` Resposta utilizada: ${item.response.trim()}` : ''}`).join(' ')
      const contextualNotes = [`Resultado: ${outcomeLabel(outcome)}.`, outcomeDetail.trim() ? `Detalhe do resultado: ${outcomeDetail.trim()}.` : '', `Objetivo da ligação: ${objectiveDefinition.label}.`, `Canal de voz: ${providerLabel(recordedProviderId)}${recordedDeviceLabel ? ` · Dispositivo ${recordedDeviceLabel}` : ''}${recordedCallerId ? ` · Caller ID ${recordedCallerId}` : ''}.`, selectedContact ? `Contato: ${selectedContact.name} — ${decisionRoleLabels[selectedContact.decisionRole]}.` : '', `Etapa do roteiro: ${currentStep.phase} — ${currentStep.title}.`, selectedPlaybook ? `Material complementar: ${selectedPlaybook.title}.` : '', allSignalLabels.length ? `Sinais da conversa: ${allSignalLabels.join(', ')}.` : '', objectionNotes, discoverySummary, notes.trim()].filter(Boolean).join(' ')
      const savedResult = await registerCallOutcome({ leadId, contactId: selectedContact?.id ?? selectedLead?.primaryContactId ?? null, outcome, durationSeconds: seconds, notes: contextualNotes, transcript: `${transcript}${interim ? ` ${interim}` : ''}`.trim(), recordingPath: null, consentAt: blob && consent ? ended : null, startedAt: start, endedAt: ended, scheduleNext, nextAt: scheduleNext && nextAt ? new Date(nextAt).toISOString() : null, meetingDurationMinutes: 30 }, blob)
      if (callAttemptId) markCallRuntimeSaved(workspaceId, callAttemptId)
      if (savedResult.idempotent) notify('info', 'A tentativa já existia no histórico; o CRM reutilizou o registro sem duplicar atividades.')
      safeStorageRemove(sessionStorageKey); clearCallNoteDraft(workspaceId, leadId); await clearDraftRecording(callAttemptId || leadId)
      setAttemptSaved(true); setCompletedInSession((current) => current + 1); setSessionOutcomes((current) => [...current, outcome])
      const nextLeadId = routineIds[queueIndex + 1]
      if (advance && nextLeadId) {
        if (config?.autoAdvance) { setAdvanceTarget({ leadId: nextLeadId, index: queueIndex + 1 }); setAdvanceCountdown(config.autoAdvanceSeconds || 3) }
        else resetAttempt(nextLeadId, queueIndex + 1, Boolean(config?.fastDial && config?.autoDispatchNext))
      } else onClose()
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar a ligação.') }
    finally { saveInFlightRef.current = false; setBusy(false) }
  }

  const reconnectVoiceLayer = async () => {
    setVoiceBusy(true)
    try {
      const statuses = await refreshVoiceLayer(voiceSettings)
      const connect = statuses.find((item) => item.id === 'realtalent_connect')
      const resumed = resumeVoiceCallMonitoring(voiceSettings, voiceCall)
      if (connect?.state === 'available') {
        setVoiceTransport('recovered'); setVoiceTransportDetail(resumed ? 'Connect disponível novamente. O monitoramento da chamada foi retomado.' : 'Connect disponível novamente.')
        window.setTimeout(() => setVoiceTransport((value) => value === 'recovered' ? 'healthy' : value), 3500)
      } else setVoiceTransportDetail(connect?.detail || 'RealTalent Connect ainda não respondeu.')
    } finally { setVoiceBusy(false) }
  }

  const hasNext = Boolean(routineIds[queueIndex + 1])
  const hasPrevious = queueIndex > 0
  const sessionConversations = sessionOutcomes.filter((item) => !['no_answer', 'busy', 'voicemail', 'invalid_number'].includes(item)).length
  const sessionMeetings = sessionOutcomes.filter((item) => item === 'meeting_scheduled').length
  const sessionProposals = sessionOutcomes.filter((item) => item === 'proposal_requested' || item === 'proposal_sent').length

  useEffect(() => {
    if (!advanceTarget) return
    if (advanceCountdown <= 0) { resetAttempt(advanceTarget.leadId, advanceTarget.index, Boolean(config?.fastDial && config?.autoDispatchNext)); return }
    const timer = window.setTimeout(() => setAdvanceCountdown((current) => Math.max(0, current - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [advanceCountdown, advanceTarget, resetAttempt])

  const advanceNow = () => { if (advanceTarget) resetAttempt(advanceTarget.leadId, advanceTarget.index, Boolean(config?.fastDial && config?.autoDispatchNext)) }
  const pauseAutoAdvance = () => { setAdvanceTarget(null); setAdvanceCountdown(0); notify('info', 'Fila pausada. O resultado já está salvo.') }
  const continueAfterSaved = () => { const nextLeadId = routineIds[queueIndex + 1]; if (nextLeadId) resetAttempt(nextLeadId, queueIndex + 1, Boolean(config?.fastDial && config?.autoDispatchNext)); else onClose() }

  useEffect(() => {
    if (!open || !autoDialPending || !config?.fastDial || session !== 'idle' || !leadId || !callTargetPhone || voiceBusy) return
    const delay = Math.max(0, Math.min(5, config.autoDispatchDelaySeconds ?? 1)) * 1000
    const timer = window.setTimeout(() => {
      setAutoDialPending(false)
      void openDialerRef.current(true)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [autoDialPending, callTargetPhone, config?.autoDispatchDelaySeconds, config?.fastDial, leadId, open, session, voiceBusy])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT'
      if (event.ctrlKey && event.key === 'Enter') { event.preventDefault(); void save(false); return }
      if (event.altKey && event.key === 'ArrowRight' && hasNext) { event.preventDefault(); void moveInQueue(1); return }
      if (!typing && event.code === 'Space' && ['running', 'paused'].includes(session) && activeVoiceProvider?.capabilities.hold) { event.preventDefault(); void voiceCommand(session === 'running' ? 'hold' : 'resume') }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const selectOutcome = (value: CallOutcome) => { setOutcome(value); setWrapGroup(WRAP_GROUPS.find((item) => item.outcomes.includes(value))?.id ?? 'conversation'); if (session === 'dialing') setSession('finished') }
  const copyPhone = async () => { if (!callTargetPhone) return; try { await writeClipboard(callTargetPhone); notify('success', 'Telefone copiado.') } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível copiar o telefone.') } }
  const copyCurrentStep = async () => { try { await writeClipboard([renderedStep.say, renderedStep.ask].filter(Boolean).join('\n\n')); notify('success', 'Etapa do roteiro copiada.') } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível copiar o roteiro.') } }
  const copyTeamPlaybook = async () => { if (!renderedTeamPlaybook) return; try { await writeClipboard(renderedTeamPlaybook); notify('success', 'Material da equipe copiado.') } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível copiar o material.') } }
  const appendNote = (value: string) => setNotes((current) => `${current}${current ? '\n\n' : ''}${value}`)
  const toggleSignal = (signalId: string) => {
    const signal = CALL_QUICK_SIGNALS.find((item) => item.id === signalId)
    if (!signal) return
    setCapturedSignals((current) => current.includes(signalId) ? current.filter((item) => item !== signalId) : [...current, signalId])
    if (!capturedSignals.includes(signalId)) appendNote(signal.note)
  }
  const addStakeholderFromCall = async () => {
    if (!selectedLead) return
    const name = await promptAction({ title: 'Adicionar pessoa mencionada', description: 'Registre rapidamente alguém citado durante a conversa.', label: 'Nome', placeholder: 'Ex.: Mariana Silva', confirmLabel: 'Continuar', required: true })
    if (!name?.trim()) return
    const jobTitle = await promptAction({ title: 'Cargo da pessoa', description: `Qual é o cargo ou função de ${name.trim()}?`, label: 'Cargo', placeholder: 'Ex.: Sócia / Financeiro', confirmLabel: 'Adicionar', required: false })
    try {
      const contact = await createContact({ companyId: selectedLead.companyId ?? null, name: name.trim(), jobTitle: jobTitle?.trim() ?? '', phone: '', email: '', decisionRole: 'unknown', influenceLevel: 50, relationshipStrength: 'unknown', relationshipScore: 0, stance: 'unknown', relationshipOwnerId: null, relationshipOwnerName: selectedLead.ownerName || '', lastContactAt: null, nextActionAt: null, notes: `Pessoa mencionada durante ligação com ${callTargetName}.`, isPrimary: false, consentStatus: 'unknown', doNotContact: false, doNotContactReason: '', leadIds: [selectedLead.id] })
      setGuidanceTab('stakeholders')
      notify('success', `${contact.name} foi adicionada ao mapa da conta sem alterar o contato desta tentativa.`)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível adicionar o stakeholder.') }
  }
  const selectStakeholder = (contactId: string) => {
    if (session !== 'idle') { notify('info', 'O contato da tentativa fica bloqueado depois que a discagem começa. Salve ou descarte a tentativa antes de trocar de pessoa.'); return }
    setActiveContactId(contactId)
  }
  const goToStep = (stepId: OutboundStepId) => { setCurrentStepId(stepId); setVisitedStepIds((current) => current.includes(stepId) ? current : [...current, stepId]) }
  const applyScriptAction = (action: OutboundStepAction) => { if (action.note) appendNote(`Roteiro — ${action.note}`); if (action.outcome) selectOutcome(action.outcome); if (action.nextStepId) goToStep(action.nextStepId); else if (action.outcome && ['running', 'paused', 'dialing'].includes(session)) void finishSession() }
  const useObjection = (item: ObjectionItem) => {
    const alreadyCaptured = capturedObjections.some((entry) => entry.id === item.id)
    setCapturedObjections((current) => current.some((entry) => entry.id === item.id) ? current : [...current, { ...item, status: 'open', leadResponse: '' }])
    setActiveObjectionId(item.id)
    if (!alreadyCaptured) appendNote(`Objeção — ${item.title}.`)
    notify('success', alreadyCaptured ? 'Objeção aberta para continuar o tratamento.' : 'Objeção capturada e vinculada à ligação.')
  }
  const updateCapturedObjection = (id: string, patch: Partial<Pick<CapturedObjection, 'status' | 'leadResponse'>>) => setCapturedObjections((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))
  const addCustomObjection = async () => {
    const title = await promptAction({ title: 'Registrar outra objeção', description: 'Use as palavras do lead. Isso ficará ligado ao histórico da chamada e à inteligência de Playbooks.', label: 'Objeção', placeholder: 'Ex.: Preciso esperar o próximo mês', confirmLabel: 'Registrar', required: true })
    if (!title?.trim()) return
    const id = `custom:${Date.now()}`
    const item: CapturedObjection = { id, title: title.trim(), category: 'Personalizada', response: '', diagnosticQuestion: 'O que está por trás dessa objeção e o que precisaria mudar para avançar?', source: 'custom', status: 'open', leadResponse: '' }
    setCapturedObjections((current) => [...current, item]); setActiveObjectionId(id); appendNote(`Objeção — ${item.title}.`)
  }
  const pinImportantNote = async () => {
    if (!selectedLead) return
    const content = notes.trim()
    if (!content) { notify('info', 'Escreva uma anotação antes de fixá-la no histórico.'); return }
    try {
      await createActivity({ leadId: selectedLead.id, contactId: selectedContact?.id ?? null, type: 'note', title: '📌 Informação importante da ligação', description: content, dueAt: null, completedAt: new Date().toISOString(), resolutionStatus: 'completed', resolutionReason: 'pinned_call_note', originEventKey: null, purpose: 'call_context', assignedTo: null })
      notify('success', 'Informação fixada no histórico do lead.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível fixar a anotação.') }
  }

  const structureSummary = () => {
    const summary = buildStructuredCallSummary({ notes, transcript: `${transcript}${interim ? ` ${interim}` : ''}`, discovery, outcomeLabel: outcomeLabel(outcome) })
    if (!summary) { notify('info', 'Registre notas ou dados de descoberta antes de estruturar o resumo.'); return }
    setNotes(summary); notify('success', 'Resumo estruturado com os dados capturados.')
  }

  const formattedTime = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const openGoalsWorkspace = () => {
    if (hasUnsavedAttempt) { notify('info', 'Salve ou descarte a tentativa atual antes de abrir Metas.'); return }
    onClose(); navigate('goals')
  }
  const openContactRecord = () => {
    if (!selectedLead) return
    if (session !== 'idle') { notify('info', 'Abra a ficha completa antes de iniciar a discagem ou depois de salvar o resultado.'); return }
    onClose(); navigate('leads', { leadId: selectedLead.id })
  }
  const requestClose = async () => { if (!await confirmDiscardAttempt('Fechar a sessão')) return; cleanupMedia(); safeStorageRemove(sessionStorageKey); void clearDraftRecording(callAttemptId || leadId); onClose() }
  const discardRecording = async () => { if (recording) { notify('error', 'Pare a gravação antes de descartá-la.'); return }; if (!recordingBlob && !recordingUrl) return; if (!await confirmAction({ title: 'Descartar gravação?', description: 'O áudio desta tentativa será removido permanentemente.', confirmLabel: 'Descartar áudio', tone: 'danger' })) return; recordingBlobRef.current = null; setRecordingBlob(null); setConsent(false); if (recordingUrl) URL.revokeObjectURL(recordingUrl); setRecordingUrl(null); await clearDraftRecording(); setRecoveryHasAudio(false) }

  useEffect(() => {
    if (!open || !hasUnsavedAttempt) return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [hasUnsavedAttempt, open])

  const progressPercent = Math.round((currentStep.order / OUTBOUND_CALL_STEPS.length) * 100)
  const showGuidance = activeGuidanceTabs.length > 0
  const gridClass = `call-focus-grid call-focus-grid--v465 ${effectiveDisplay?.showQueueSidebar === false ? 'call-focus-grid--no-queue' : ''} ${!showGuidance ? 'call-focus-grid--no-guidance' : ''}`
  const currentMacro = MACRO_PHASES.find((phase) => phase.steps.includes(currentStepId))?.id
  const wrapOptions = WRAP_GROUPS.find((item) => item.id === wrapGroup)?.outcomes ?? ['answered']

  const sessionPlaybookLabel = selectedPlaybook?.title || 'Roteiro padrão RealTalent'
  const currentMacroLabel = MACRO_PHASES.find((phase) => phase.steps.includes(currentStepId))?.label ?? currentStep.phase
  const compactContext = [
    preCallBrief?.lastInteraction ? `Último contato: ${preCallBrief.lastInteraction}` : '',
    currentProposal ? `Proposta: ${formatCurrency(currentProposal.total)} · ${currentProposal.status}` : '',
    selectedContact ? `${decisionRoleLabels[selectedContact.decisionRole]}` : selectedStage?.name ?? '',
    priorObjectionTitles[0] ? `Objeção anterior: ${priorObjectionTitles[0]}` : '',
  ].filter(Boolean)

  return <>
    <Modal
      open={open}
      onClose={requestClose}
      title="Modo Foco — Ligações"
      subtitle={`${routineIds.length ? `${queueIndex + 1} de ${routineIds.length} na fila` : 'Ligação rápida'} · Roteiro: ${sessionPlaybookLabel}`}
      size={fullScreen ? 'full' : 'xl'}
      headerActions={<div className="call-session-header-actions call-action-group"><Button variant="secondary" size="sm" onClick={() => setFullScreen((value) => !value)}>{fullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{fullScreen ? 'Restaurar' : 'Expandir'}</Button></div>}
      footer={<>{attemptSaved ? <><Button variant="secondary" onClick={requestClose}>Encerrar sessão</Button><span className="modal__footer-spacer" /><Button disabled={!hasNext || Boolean(advanceTarget)} onClick={continueAfterSaved}><ArrowRight size={16} /> Próximo lead</Button></> : <><Button variant="ghost" disabled={!hasPrevious || busy} onClick={() => void moveInQueue(-1)}><ArrowLeft size={16} /> Anterior</Button><span className="modal__footer-spacer" />{session === 'finished' ? <><Button variant="secondary" loading={busy} onClick={() => void save(false)}><Save size={16} /> Salvar e encerrar</Button><Button loading={busy} disabled={!hasNext} onClick={() => void save(true)}><ArrowRight size={16} /> Salvar e próximo</Button></> : <Button variant="secondary" disabled={!hasNext || busy} onClick={() => void moveInQueue(1)}><SkipForward size={16} /> Pular lead</Button>}</>}</>}
    >
      <div className={`calling-v982 calling-v10171 calling-v10171--${session}`}>
        {showRecovery ? <section className="call-recovery-banner"><RotateCcw size={20} /><div><strong>Há uma tentativa interrompida</strong><span>Recupere o progresso, as notas e o tempo antes de continuar.</span></div><Button size="sm" onClick={recoverSession}>Recuperar</Button><Button size="sm" variant="ghost" onClick={discardRecovery}>Descartar</Button></section> : null}
        {advanceTarget ? <section className="call-auto-advance-banner"><CheckCircle2 size={20} /><div><strong>Resultado salvo. Próximo contato em {advanceCountdown}s</strong><span>{config?.fastDial && config?.autoDispatchNext ? 'O próximo contato será carregado e enviado automaticamente ao RealTalent Phone.' : 'O próximo contato será preparado sem iniciar a chamada.'}</span></div><Button size="sm" onClick={advanceNow}>Avançar agora</Button><Button size="sm" variant="ghost" onClick={pauseAutoAdvance}>Pausar</Button></section> : null}
        {voiceCall?.providerId === 'realtalent_connect' && voiceTransport !== 'healthy' ? <section className={`calling-v1014__transport is-${voiceTransport}`}>{voiceTransport === 'recovered' ? <CheckCircle2 size={20}/> : <AlertCircle size={20}/>}<div><strong>{voiceTransport === 'recovered' ? 'Conexão restabelecida' : 'Connect temporariamente sem confirmação'}</strong><span>{voiceTransportDetail || 'O CRM preservou a sessão e continuará tentando recuperar os estados da chamada.'}</span></div>{voiceTransport === 'degraded' ? <Button size="sm" variant="secondary" loading={voiceBusy} onClick={() => void reconnectVoiceLayer()}>Tentar reconectar</Button> : null}</section> : null}

        <section className="calling-v982__topbar">
          <div className="calling-v982__identity"><span className="lead-cell__avatar">{callTargetName.slice(0, 2).toUpperCase() || '--'}</span><div><small>Contato em foco</small><strong>{callTargetName || 'Selecione um contato'}</strong><span>{selectedLead?.company || 'Empresa não informada'} · {selectedLead ? `prioridade ${priorityLabel[selectedLead.priority]}` : 'sem prioridade'}</span></div></div>
          <div className="calling-v982__channel call-session-device call-session-channel"><PhoneCall size={17}/><div><small>Canal</small><strong>{providerLabel(activeRuntimeProviderId)}</strong><span>{voiceCall?.providerId === 'external_tel' && voiceProviderId === 'realtalent_connect' ? 'Fallback do dispositivo · contexto preservado' : voiceCanStart ? activeVoiceDevice?.label ?? 'Pronto' : `${voiceProviderStateLabel(activeVoiceProvider?.state ?? 'not_configured')} · fallback disponível`}</span></div></div>
          <div className="calling-v982__timer"><span className={`calling-v982__live-dot ${session === 'running' ? 'is-live' : ''}`}/><div><strong>{formattedTime}</strong><small>{session === 'running' ? 'Em conversa' : session === 'paused' ? 'Em espera' : session === 'dialing' ? 'Conectando' : session === 'finished' ? 'Registrar resultado' : 'Pronto'}</small></div></div>
          {config?.fastDial ? <div className="calling-fast-dial-status-v10182"><Sparkles size={14}/><span>Fast Dial</span></div> : null}<div className="calling-v982__primary-actions">
            {session === 'idle' ? <Button loading={voiceBusy} onClick={() => void openDialer()} disabled={!callTargetPhone || !voiceLaunchAvailable}><PhoneCall size={16}/> Ligar agora</Button> : null}
            {session === 'dialing' ? (activeRuntimeProviderId === 'realtalent_connect'
              ? <Button variant="danger" loading={voiceBusy} onClick={() => void cancelDialing()}><CircleStop size={16}/> Cancelar</Button>
              : <><Button onClick={markAnswered}><CheckCircle2 size={16}/> Atendeu</Button><Button variant="secondary" onClick={markNoAnswer}>Não atendeu</Button></>) : null}
            {session === 'running' || session === 'paused' ? <Button variant="danger" loading={voiceBusy} onClick={() => void finishSession()}><CircleStop size={16}/> {activeVoiceDevice?.id.startsWith('connect:phone:') ? 'Registrar término' : 'Encerrar'}</Button> : null}
          </div>
        </section>

        {(session === 'running' || session === 'paused') && activeVoiceProvider && (activeVoiceProvider.capabilities.mute || activeVoiceProvider.capabilities.hold || activeVoiceProvider.capabilities.transfer || activeVoiceProvider.capabilities.voicemailDrop || activeVoiceProvider.capabilities.keypad) ? <section className="voice-control-v73 calling-v982__voice-controls" aria-label="Controles avançados da chamada">
          {activeVoiceProvider.capabilities.mute ? <Button size="sm" variant="secondary" disabled={voiceBusy} onClick={() => void voiceCommand(voiceMuted ? 'unmute' : 'mute')}>{voiceMuted ? <Volume2 size={15}/> : <MicOff size={15}/>} {voiceMuted ? 'Ativar áudio' : 'Mudo'}</Button> : null}
          {activeVoiceProvider.capabilities.hold ? <Button size="sm" variant="secondary" disabled={voiceBusy} onClick={() => void voiceCommand(voiceHeld ? 'resume' : 'hold')}>{voiceHeld ? <Play size={15}/> : <Pause size={15}/>} {voiceHeld ? 'Retomar' : 'Espera'}</Button> : null}
          {activeVoiceProvider.capabilities.keypad ? <Button size="sm" variant="secondary" disabled={voiceBusy} onClick={() => void sendDtmf()}><Network size={15}/> Teclado</Button> : null}
          {activeVoiceProvider.capabilities.transfer ? <Button size="sm" variant="secondary" disabled={voiceBusy} onClick={() => void transferVoiceCall()}><UsersRound size={15}/> Transferir</Button> : null}
          {activeVoiceProvider.capabilities.voicemailDrop ? <Button size="sm" variant="secondary" disabled={voiceBusy} onClick={() => void dropVoicemail()}><PhoneCall size={15}/> Voicemail</Button> : null}
        </section> : null}

        {session === 'idle' ? <section className="calling-v982__precall call-precall-compact-v731 calling-h5__precall">
          <div className="calling-h5__precall-heading"><div><span className="eyebrow">Antes de ligar</span><h3>Resumo essencial do contato</h3><p>Somente o contexto necessário para começar a conversa com segurança.</p></div><Button size="sm" variant="secondary" onClick={openContactRecord}><UserRoundCheck size={15}/> Abrir ficha completa</Button></div>
          <div className="calling-h5__precall-essential">
            <article className="calling-h5__essential-card calling-h5__essential-card--interaction"><small>Última interação</small><strong>{recentHistory[0]?.label || 'Primeiro contato registrado'}</strong><span>{recentHistory[0] ? formatDateTime(recentHistory[0].at) : 'Sem histórico anterior'}</span>{recentHistory[0]?.detail ? <p>{recentHistory[0].detail}</p> : null}</article>
            <article className="calling-h5__essential-card calling-h5__essential-card--objective"><small>Objetivo da ligação</small><strong>{objectiveDefinition.shortLabel}</strong><span>{objectiveDefinition.description}</span></article>
            <article className="calling-h5__essential-card calling-h5__essential-card--history"><header><small>Histórico</small><span>{recentHistory.length ? `${recentHistory.length} registro(s)` : 'sem registros'}</span></header><div className="calling-h5__history">{recentHistory.slice(0, 2).map((item) => <div key={item.id}><i/><section><strong>{item.label}</strong>{item.detail ? <p>{item.detail}</p> : null}<time>{formatDateTime(item.at)}</time></section></div>)}{!recentHistory.length ? <p className="activity-empty">Ainda não há interações registradas.</p> : null}</div></article>
            <article className="calling-h5__essential-card calling-h5__essential-card--important"><header><small>Informações importantes</small><span>ficha + anotações</span></header><div className="calling-h5__important-list">{pinnedLeadNotes.slice(0, 2).map((item) => <p key={item.id}>{item.description}</p>)}{selectedContact?.notes?.trim() ? <p>{selectedContact.notes}</p> : null}{!pinnedLeadNotes.length && !selectedContact?.notes?.trim() && selectedLead?.notes?.trim() ? <p>{selectedLead.notes}</p> : null}{!pinnedLeadNotes.length && !selectedContact?.notes?.trim() && !selectedLead?.notes?.trim() ? <p className="is-empty">Nenhuma informação importante registrada.</p> : null}</div></article>
          </div>
          {callHealth && (!strategy.healthAlertsOnly || callHealth.status !== 'good') ? <div className={`calling-h5__health-exception is-${callHealth.status}`}><strong>Call Health {callHealth.score}</strong><span>{callHealth.status === 'restricted' ? 'Há uma restrição que precisa ser resolvida antes de ligar.' : 'Revise este contato antes da chamada.'}</span></div> : null}
        </section> : null}

        {session === 'dialing' ? <section className="calling-v982__dialing calling-v10171__dialing"><div className="calling-v10171__dialing-status"><PhoneCall size={28}/><div><span className="eyebrow">Conectando chamada</span><h3>{activeRuntimeProviderId === 'realtalent_connect' ? (activeVoiceDevice?.id.startsWith('connect:phone:') ? 'Chamada enviada ao RealTalent Phone' : 'Atenda seu telefone para conectar o lead') : 'Aguardando confirmação'}</h3><p>{activeRuntimeProviderId === 'realtalent_connect' ? (activeVoiceDevice?.id.startsWith('connect:phone:') ? 'No celular, toque em Abrir discador. Ao voltar ao app, informe se o contato atendeu.' : 'O RealTalent Connect cria uma ponte segura: agente primeiro, lead depois.') : voiceProviderId === 'realtalent_connect' ? 'O Connect ficou indisponível e o CRM abriu o discador do dispositivo como fallback. Confirme o resultado aqui.' : 'Confirme quando o contato atender ou quando não houver resposta.'}</p></div></div><div className="calling-v10171__dialing-context"><article><small>Objetivo</small><strong>{objectiveDefinition.shortLabel}</strong><span>{objectiveDefinition.successSignal}</span></article><article><small>Último contexto</small><strong>{preCallBrief?.lastInteraction || recentHistory[0]?.label || 'Primeiro contato registrado'}</strong><span>{preCallBrief?.recommendedApproach || selectedStage?.name || 'Sem etapa'}</span></article><article><small>Roteiro</small><strong>{sessionPlaybookLabel}</strong><span>{selectedPlaybook?.guidance?.coachingFocus || currentStep.objective}</span></article></div></section> : null}

        {session === 'running' || session === 'paused' ? <div className={`calling-v982__conversation ${strategy.showAssistantDuringCall ? '' : 'calling-v1012__conversation--no-assistant'}`}>
          <main className="calling-v982__script">
            <div className="calling-v982__progress"><div><small>{currentMacroLabel}</small><strong>Etapa {currentStep.order} de {OUTBOUND_CALL_STEPS.length}</strong></div><span>{progressPercent}%</span></div>
            <div className="calling-h3__script-toolbar"><div><small>Visualização do roteiro</small><strong>{scriptView === 'guided' ? 'Guiado · uma etapa por vez' : scriptView === 'full' ? 'Roteiro completo · leitura contínua' : 'Mapa da conversa · navegação por fase'}</strong></div><div className="calling-h3__view-switch" role="group" aria-label="Visualização do roteiro"><button type="button" className={scriptView === 'guided' ? 'is-active' : ''} onClick={() => setScriptView('guided')}>Guiado</button><button type="button" className={scriptView === 'full' ? 'is-active' : ''} onClick={() => setScriptView('full')}>Completo</button><button type="button" className={scriptView === 'map' ? 'is-active' : ''} onClick={() => setScriptView('map')}>Mapa</button></div></div>
            {scriptView === 'guided' ? <section className="calling-v982__script-card calling-focus-script-v10171">
              <header><div><span className="eyebrow">{currentStep.phase}</span><h2>{currentStep.title}</h2><p>{currentStep.objective}</p></div><Button size="sm" variant="ghost" onClick={() => void copyCurrentStep()}><Copy size={15}/> Copiar</Button></header>
              {renderedStep.ask ? <div className="calling-focus-script-v10171__prompt"><MessageCircleQuestion size={20}/><div><small>Pergunta recomendada</small><strong>{renderedStep.ask}</strong></div></div> : <div className="calling-focus-script-v10171__prompt"><MessageCircleQuestion size={20}/><div><small>Fala recomendada</small><strong>{renderedStep.say}</strong></div></div>}
              <div className="calling-v982__responses calling-focus-script-v10171__responses">{currentStep.actions.map((action) => <Button key={action.id} size="sm" variant={action.tone === 'primary' || action.tone === 'success' ? 'primary' : action.tone === 'danger' ? 'danger' : 'secondary'} onClick={() => applyScriptAction(action)}>{action.label}</Button>)}</div>
              <details className="calling-focus-script-v10171__support"><summary>Ver fala completa e coaching</summary><div>{renderedStep.ask ? <div className="calling-v982__say"><small>Fala sugerida</small><p>{renderedStep.say}</p></div> : null}<div className="calling-v982__coaching"><Lightbulb size={16}/><span>{currentStep.coaching}</span></div></div></details>
            </section> : null}
            {scriptView !== 'guided' ? <section className="calling-h4__current-focus"><div className="calling-h4__current-index">{currentStep.order}</div><div><small>Agora · {currentStep.phase}</small><h2>{currentStep.title}</h2><p>{renderedStep.ask || renderedStep.say}</p></div><Button size="sm" variant="ghost" onClick={() => void copyCurrentStep()}><Copy size={15}/> Copiar</Button></section> : null}
            {scriptView === 'full' ? <section className="calling-h3__full-script">{OUTBOUND_CALL_STEPS.map((step) => { const text = renderOutboundText(step.ask || step.say, tokenValues); return <button type="button" key={step.id} className={`calling-h3__full-step ${currentStepId === step.id ? 'is-active' : ''}`} onClick={() => goToStep(step.id)}><span>{step.order}</span><div><small>{step.phase}</small><strong>{step.title}</strong><p>{text}</p></div></button> })}</section> : null}
            {scriptView === 'map' ? <MindMapCanvas
              ariaLabel="Mapa mental do roteiro da ligação"
              compact
              rootEyebrow="Conversa"
              rootTitle={objectiveDefinition.shortLabel}
              rootDescription={`${currentStep.order} de ${OUTBOUND_CALL_STEPS.length} · ${progressPercent}% concluído`}
              rootIcon={<Network size={18}/>}
              branches={MACRO_PHASES.map((phase) => ({
                id: phase.id,
                title: phase.label,
                description: phase.id === currentMacro ? 'fase atual' : undefined,
                items: phase.steps.map((stepId) => {
                  const step = outboundStepById(stepId)
                  return {
                    id: step.id,
                    eyebrow: `Etapa ${step.order}`,
                    title: step.title,
                    description: renderOutboundText(step.ask || step.say, tokenValues),
                    active: currentStepId === step.id,
                    visited: visitedStepIds.includes(step.id),
                    onClick: () => goToStep(step.id),
                  }
                }),
              }))}
            /> : null}
            {effectiveDisplay?.showObjections !== false ? <section className="calling-h3__objection-picker"><div><small>Objeções durante a conversa</small><strong>Capture o que o lead realmente respondeu</strong></div><div className="calling-h3__objection-picker-actions">{objections.slice(0, 5).map((item) => <button type="button" key={item.id} className={capturedObjections.some((entry) => entry.id === item.id) ? 'is-captured' : ''} onClick={() => useObjection(item)}>{item.title}</button>)}<button type="button" onClick={() => void addCustomObjection()}>+ Outra</button></div></section> : null}
            {activeCapturedObjection ? <section className="calling-h3__objection-workspace"><div className="calling-h3__objection-head"><div><small>Objeção capturada</small><strong>{activeCapturedObjection.title}</strong></div><Button size="sm" variant="ghost" onClick={() => setActiveObjectionId('')}>Fechar</Button></div><div className="calling-h3__objection-copy"><article><small>Pergunta de diagnóstico</small><p>{activeCapturedObjection.diagnosticQuestion}</p></article><article><small>Resposta / abordagem do playbook</small><p>{activeCapturedObjection.response || 'Sem resposta predefinida. Diagnostique primeiro e registre como conduziu.'}</p></article></div><div className="calling-h3__objection-status"><button type="button" className={activeCapturedObjection.status === 'open' ? 'is-active' : ''} onClick={() => updateCapturedObjection(activeCapturedObjection.id, { status: 'open' })}>Em aberto</button><button type="button" className={activeCapturedObjection.status === 'resolved' ? 'is-active' : ''} onClick={() => updateCapturedObjection(activeCapturedObjection.id, { status: 'resolved' })}>Contornada</button><button type="button" className={activeCapturedObjection.status === 'persisted' ? 'is-active' : ''} onClick={() => updateCapturedObjection(activeCapturedObjection.id, { status: 'persisted' })}>Permaneceu</button></div><label><span>O que o lead respondeu / contexto real</span><textarea value={activeCapturedObjection.leadResponse} onChange={(event) => updateCapturedObjection(activeCapturedObjection.id, { leadResponse: event.target.value })} placeholder="Ex.: Achou caro porque compara com o sistema atual e precisa validar com a sócia."/></label></section> : null}
            <details className="calling-v982__details calling-v1012__context"><summary>Contexto, histórico e anotações</summary><div className="calling-v982__details-body">
              <nav className="calling-v1012__context-tabs" aria-label="Contexto do lead"><button type="button" className={contextTab === 'summary' ? 'is-active' : ''} onClick={() => setContextTab('summary')}><Building2 size={14}/> Resumo</button>{strategy.showHistoryOnDemand ? <button type="button" className={contextTab === 'history' ? 'is-active' : ''} onClick={() => setContextTab('history')}><History size={14}/> Histórico</button> : null}<button type="button" className={contextTab === 'notes' ? 'is-active' : ''} onClick={() => setContextTab('notes')}><NotebookPen size={14}/> Notas</button></nav>
              {contextTab === 'summary' ? <div className="calling-v1012__summary-grid"><article><small>Empresa</small><strong>{selectedLead?.company || selectedLead?.name || '—'}</strong><span>{selectedStage?.name || 'Sem etapa'}</span></article><article><small>Contato</small><strong>{selectedContact?.name || callTargetName}</strong><span>{selectedContact ? decisionRoleLabels[selectedContact.decisionRole] : 'Papel não identificado'}</span></article><article><small>Oportunidade</small><strong>{currentProposal ? formatCurrency(currentProposal.total) : selectedLead?.value ? formatCurrency(selectedLead.value) : 'Sem proposta ativa'}</strong><span>{currentProposal?.status || 'Contexto comercial'}</span></article><article><small>Último contato</small><strong>{recentHistory[0] ? formatDateTime(recentHistory[0].at) : 'Nenhum registro'}</strong><span>{recentHistory[0]?.label || 'Comece a construir o histórico'}</span></article>{pinnedLeadNotes.map((item) => <article className="is-pinned" key={item.id}><small>Informação fixada</small><strong>{item.description}</strong><span>{formatDateTime(item.createdAt)}</span></article>)}</div> : null}
              {contextTab === 'history' ? <div className="calling-v1012__history">{recentHistory.length ? recentHistory.map((item) => <article key={item.id}><span className={`is-${item.kind}`}></span><div><strong>{item.label}</strong><p>{item.detail || 'Sem detalhes adicionais.'}</p><small>{formatDateTime(item.at)}</small></div></article>) : <p className="activity-empty">Nenhuma interação registrada para este lead.</p>}</div> : null}
              {contextTab === 'notes' ? <div className="calling-v1012__notes"><label><span>Anotações da ligação {strategy.autosaveNotes ? '· salvas automaticamente' : ''}</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Registre somente o que muda a próxima ação..." rows={5}/></label><div className="calling-v1012__notes-actions"><Button size="sm" variant="secondary" disabled={!notes.trim()} onClick={() => void pinImportantNote()}><Pin size={14}/> Fixar informação importante</Button></div><div className="calling-v982__quick-signals">{CALL_QUICK_SIGNALS.slice(0, 6).map((signal) => <button type="button" key={signal.id} className={capturedSignals.includes(signal.id) ? 'is-active' : ''} onClick={() => toggleSignal(signal.id)}>{signal.label}</button>)}</div></div> : null}
              {selectedPlaybook && renderedTeamPlaybook && contextTab === 'summary' ? <div className="calling-v982__team-playbook"><small>Material do roteiro</small><strong>{selectedPlaybook.title}</strong><p>{renderedTeamPlaybook}</p></div> : null}
            </div></details>
            <details className="calling-v982__advanced-support"><summary>Ferramentas avançadas</summary><div className="calling-v982__advanced-body">
              <nav className="call-tabs call-tabs--work" role="tablist" aria-label="Área de trabalho da ligação">
                <button type="button" role="tab" aria-selected={workTab === 'script'} className={`call-tab ${workTab === 'script' ? 'is-active' : ''}`} onClick={() => setWorkTab('script')}>Roteiro</button>
                <button type="button" role="tab" aria-selected={workTab === 'discovery'} className={`call-tab ${workTab === 'discovery' ? 'is-active' : ''}`} onClick={() => setWorkTab('discovery')}>Descoberta</button>
                <button type="button" role="tab" aria-selected={workTab === 'notes'} className={`call-tab ${workTab === 'notes' ? 'is-active' : ''}`} onClick={() => setWorkTab('notes')}>Notas</button>
              </nav>
              <nav className="call-tabs call-tabs--guidance" role="tablist" aria-label="Apoio avançado">{activeGuidanceTabs.map((tab) => <button type="button" role="tab" aria-selected={guidanceTab === tab} key={tab} className={`call-tab ${guidanceTab === tab ? 'is-active' : ''}`} onClick={() => setGuidanceTab(tab)}>{tab === 'assistant' ? 'Assistente' : tab === 'stakeholders' ? 'Pessoas' : tab === 'objections' ? 'Objeções' : tab === 'battlecards' ? 'Battlecards' : 'Histórico'}</button>)}</nav>
              <section className="calling-v982__advanced-intelligence"><div><small>Next Best Question</small><strong>{nextBestQuestion.question}</strong></div><div><small>Live Conversation Signals</small><div>{liveSignals.map((signal) => <span key={signal.id} className={`is-${signal.tone}`}>{signal.label}</span>)}</div></div></section>
            </div></details>
          </main>
          {strategy.showAssistantDuringCall ? <aside className="calling-v982__copilot">
            <div className="calling-v982__copilot-head"><Sparkles size={18}/><div><small>RealTalent Assistant</small><strong>Somente o próximo sinal útil</strong></div></div>
            <article><small>Próxima pergunta</small><strong>{nextBestQuestion.question}</strong><p>{nextBestQuestion.reason}</p></article>
            {liveSignals[0] ? <article className={`is-${liveSignals[0].tone}`}><small>Sinal detectado</small><strong>{liveSignals[0].label}</strong><p>{liveSignals[0].excerpt}</p></article> : null}
            {accountIntelligence?.recommendedAction ? <article><small>Próxima ação da conta</small><strong>{accountIntelligence.recommendedAction.title}</strong><p>{accountIntelligence.recommendedAction.explanation}</p></article> : null}
            <details open={guidanceTab === 'objections'}><summary>Objeções rápidas</summary><div className="calling-v982__objections">{objections.slice(0, 5).map((item) => <button type="button" className={`calling-h3__objection-chip ${capturedObjections.some((entry) => entry.id === item.id) ? 'is-captured' : ''}`} key={item.id} onClick={() => useObjection(item)}><strong>{item.title}</strong><span>{capturedObjections.some((entry) => entry.id === item.id) ? 'Capturada · clique para abrir' : item.response}</span></button>)}</div><div className="calling-h3__objection-actions"><button type="button" onClick={() => void addCustomObjection()}>+ Registrar outra objeção</button>{capturedObjections.length ? <span>{capturedObjections.length} capturada(s)</span> : null}</div></details>
          </aside> : null}
        </div> : null}

        {session === 'finished' ? <section className="calling-v982__wrap">
          <header><div><span className="eyebrow">Depois da ligação</span><h2>Registre o resultado e a próxima ação</h2><p>O CRM guarda somente o necessário para o próximo contato.</p></div><StatusPill tone="info">{formattedTime}</StatusPill></header>
          <article className="calling-v1014__wrap-recommendation"><div><small>Wrap-up assistido</small><strong>{wrapRecommendation.title}</strong><p>{wrapRecommendation.description}</p></div><div className="calling-v1014__wrap-checklist">{wrapRecommendation.checklist.slice(0,3).map((item) => <span key={item}><Check size={13}/>{item}</span>)}</div><StatusPill tone={wrapRecommendation.closesLead ? 'warning' : wrapRecommendation.scheduleRecommended ? 'info' : 'neutral'}>{wrapRecommendation.closesLead ? 'Encerramento' : wrapRecommendation.scheduleRecommended ? 'Próxima ação recomendada' : 'Revisar e salvar'}</StatusPill></article>
          <div className="calling-v982__wrap-layout">
            <div className="calling-v982__outcomes">
              <div className="calling-h3__wrap-primary"><small>1. Resultado principal</small><div className="calling-h3__wrap-primary-grid">{WRAP_GROUPS.map((group) => <button type="button" key={group.id} className={wrapGroup === group.id ? 'is-active' : ''} title={group.description} onClick={() => { setWrapGroup(group.id); const first = group.outcomes[0]; if (first) setOutcome(first) }}>{group.label}</button>)}</div></div>
              <div className="calling-h3__wrap-secondary"><small>2. Resultado específico</small><div className="calling-v982__outcome-options">{wrapOptions.map((value) => <button type="button" key={value} className={outcome === value ? 'is-active' : ''} onClick={() => selectOutcome(value)}>{outcomeLabel(value)}</button>)}</div></div>
              {capturedObjections.length ? <div className="calling-h3__captured-summary"><strong>Objeções registradas nesta ligação</strong>{capturedObjections.map((item) => <span key={item.id}>{item.title} · {item.status === 'resolved' ? 'contornada' : item.status === 'persisted' ? 'permaneceu' : 'em aberto'}</span>)}</div> : null}
            </div>
            <div className="calling-v982__wrap-fields">
              <label className="calling-h3__outcome-detail"><span>Motivo / contexto deste resultado</span><small>Complemente a escolha estruturada com as palavras do lead. Isso melhora o histórico sem perder analytics.</small><textarea value={outcomeDetail} onChange={(event) => setOutcomeDetail(event.target.value)} rows={3} placeholder="Ex.: pediu retorno depois de falar com a sócia; orçamento será revisado na sexta."/></label>
              <label><span>Resumo / notas</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} placeholder="O que ficou combinado?"/></label>
              <Button size="sm" variant="secondary" onClick={structureSummary}><Sparkles size={15}/> Estruturar resumo</Button>
              <label className="calling-v982__next-toggle"><input type="checkbox" checked={scheduleNext} onChange={(event) => setScheduleNext(event.target.checked)}/><span>Agendar próxima ação</span></label>
              {scheduleNext ? <label><span>Quando</span><input type="datetime-local" value={nextAt} onChange={(event) => setNextAt(event.target.value)}/></label> : null}
            </div>
          </div>
        </section> : null}

        {activeGoalInsights.length ? <section className="calling-h3__session-goals"><div className="calling-h3__session-goals-head"><div><Target size={15}/><strong>Metas conectadas à operação</strong></div><button type="button" onClick={openGoalsWorkspace}>Abrir aba Metas</button></div><div className="calling-h3__session-goals-grid">{activeGoalInsights.map((insight) => <article key={insight.goal.id} className={insight.goal.id === config?.linkedGoalId ? 'is-linked' : ''}><small>{goalMetricLabels[insight.goal.metric]}{insight.goal.id === config?.linkedGoalId ? ' · vinculada' : ''}</small><strong>{Math.round(insight.value)} / {insight.goal.targetValue}</strong><span><i style={{ width: `${Math.min(100, insight.percentage)}%` }}/></span></article>)}</div></section> : null}
        <footer className="calling-v982__session-strip"><span><Target size={14}/> Meta da sessão {completedInSession}/{config?.sessionGoal ?? Math.max(routineIds.length, 1)}</span><span>{sessionConversations} conversa(s)</span><span>{sessionMeetings} reunião(ões)</span><span>{sessionProposals} proposta(s)</span><span>{sessionPlaybookLabel}</span></footer>
      </div>
    </Modal>
  </>
}
