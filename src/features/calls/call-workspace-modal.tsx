import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleStop,
  Clipboard,
  Copy,
  Lightbulb,
  Maximize2,
  MessageCircleQuestion,
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
  Timer,
  UserRoundCheck,
  Volume2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { StatusPill } from '../../components/ui/status-pill'
import { formatDateTime } from '../../domain/formatters'
import type { CallOutcome, Lead } from '../../domain/types'
import { deleteLocalRecording, readLocalRecording, saveLocalRecording } from '../../lib/local-recordings'
import { CALL_OUTCOMES, defaultNextDate, outcomeDefinition, outcomeLabel } from '../../services/call-workspace'
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
type GuidanceTab = 'objections' | 'notes' | 'lead' | 'history'

interface DiscoveryFields {
  decisionMaker: string
  currentSystem: string
  mainPain: string
  bestTime: string
}

interface StoredCallSession {
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
}

interface ObjectionItem extends BuiltInObjection {
  source: 'team' | 'built-in'
}

const STORAGE_KEY = 'crm-v100-29-call-session'
const LEGACY_STORAGE_KEY = 'crm-v100-10-call-session'
const DRAFT_RECORDING_KEY = 'draft:crm-v100-call-session'
const EMPTY_DISCOVERY: DiscoveryFields = { decisionMaker: '', currentSystem: '', mainPain: '', bestTime: '' }
const priorityLabel: Record<Lead['priority'], string> = { urgent: 'urgente', high: 'alta', medium: 'média', low: 'baixa' }

const safeStorageGet = (key: string) => { try { return window.localStorage.getItem(key) } catch { return null } }
const safeStorageSet = (key: string, value: string) => { try { window.localStorage.setItem(key, value) } catch { /* armazenamento indisponível */ } }
const safeStorageRemove = (key: string) => { try { window.localStorage.removeItem(key) } catch { /* armazenamento indisponível */ } }
const toInput = (date: Date | null) => date ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ''
const nextHourInput = () => { const date = new Date(); date.setHours(date.getHours() + 1, 0, 0, 0); return toInput(date) }

const writeClipboard = async (content: string) => {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(content)
  const textarea = document.createElement('textarea')
  textarea.value = content
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

export function CallWorkspaceModal({ open, initialLeadId = '', queueLeadIds = [], onClose }: { open: boolean; initialLeadId?: string; queueLeadIds?: string[]; onClose(): void }) {
  const { snapshot, repositoryMode, registerCallOutcome, notify } = useApp()
  const { preferences } = usePreferences()
  const [leadId, setLeadId] = useState('')
  const [routineIds, setRoutineIds] = useState<string[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [session, setSession] = useState<SessionState>('idle')
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [outcome, setOutcome] = useState<CallOutcome>('answered')
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
  const [guidanceTab, setGuidanceTab] = useState<GuidanceTab>('objections')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  const selectedLead = snapshot?.leads.find((lead) => lead.id === leadId)
  const selectedPlaybook = snapshot?.playbooks.find((item) => item.id === playbookId)
  const leadCalls = useMemo(() => (snapshot?.calls ?? []).filter((call) => call.leadId === leadId).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()), [leadId, snapshot])
  const leadActivities = useMemo(() => (snapshot?.activities ?? []).filter((activity) => activity.leadId === leadId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [leadId, snapshot])
  const selectedStage = snapshot?.stages.find((stage) => stage.id === selectedLead?.stageId)
  const recordingSupported = typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  const speechConstructor = (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition
  const speechSupported = Boolean(speechConstructor)
  const currentDefinition = outcomeDefinition(outcome)
  const currentStep = outboundStepById(currentStepId)

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
    const teamItems: ObjectionItem[] = (snapshot?.playbooks ?? [])
      .filter((item) => item.kind === 'objection' && item.active)
      .map((item) => ({
        id: `team:${item.id}`,
        title: item.title.replace(/[“”"]/g, ''),
        category: item.category || 'Objeção da equipe',
        response: item.content,
        diagnosticQuestion: 'Qual é o principal motivo para isso não fazer sentido agora?',
        source: 'team',
      }))
    const teamTitles = new Set(teamItems.map((item) => item.title.trim().toLowerCase()))
    const builtIns = BUILT_IN_OBJECTIONS
      .filter((item) => !teamTitles.has(item.title.trim().toLowerCase()))
      .map<ObjectionItem>((item) => ({ ...item, source: 'built-in' }))
    return [...teamItems, ...builtIns]
  }, [snapshot?.playbooks])

  const activeObjection = objections.find((item) => item.id === activeObjectionId) ?? null

  const cleanupMedia = useCallback(() => {
    recognitionRef.current?.stop(); recognitionRef.current = null; setListening(false)
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null; mediaRecorderRef.current = null; setRecording(false)
  }, [])

  const hasUnsavedAttempt = Boolean(
    startedAt || seconds > 0 || notes.trim() || transcript.trim() || interim.trim() || recordingBlob || recording || listening || session !== 'idle'
    || Object.values(discovery).some(Boolean) || currentStepId !== 'opening',
  )

  const confirmDiscardAttempt = useCallback((action: string) => {
    if (recording) { notify('error', 'Pare a gravação antes de sair desta tentativa.'); return false }
    if (!hasUnsavedAttempt) return true
    return window.confirm(`Há dados desta ligação ainda não salvos. ${action} irá descartá-los. Deseja continuar?`)
  }, [hasUnsavedAttempt, notify, recording])

  const clearDraftRecording = useCallback(async () => {
    try { await deleteLocalRecording(DRAFT_RECORDING_KEY) } catch { /* rascunho inexistente ou armazenamento indisponível */ }
  }, [])

  const resetAttempt = useCallback((nextLeadId: string, nextIndex: number) => {
    cleanupMedia()
    setLeadId(nextLeadId); setQueueIndex(nextIndex); setSession('idle'); setStartedAt(null); setSeconds(0); setOutcome('answered')
    setNotes(''); setTranscript(''); setInterim(''); setConsent(false); setRecording(false); setRecordingBlob(null); recordingBlobRef.current = null; setListening(false)
    setScheduleNext(true); setNextAt(nextHourInput()); setCurrentStepId('opening'); setVisitedStepIds(['opening']); setDiscovery(EMPTY_DISCOVERY); setActiveObjectionId(''); setGuidanceTab('objections')
    if (recordingUrl) URL.revokeObjectURL(recordingUrl)
    setRecordingUrl(null)
    void clearDraftRecording()
  }, [cleanupMedia, clearDraftRecording, recordingUrl])

  useEffect(() => {
    if (!open) return
    const validQueue = (queueLeadIds.length ? queueLeadIds : snapshot?.leads.filter((lead) => lead.status === 'active' && lead.phone).map((lead) => lead.id) ?? []).filter((id, index, all) => all.indexOf(id) === index)
    const startingId = initialLeadId || validQueue[0] || snapshot?.leads.find((lead) => lead.status === 'active' && lead.phone)?.id || ''
    const startingIndex = Math.max(0, validQueue.indexOf(startingId))
    setRoutineIds(validQueue.length ? validQueue : startingId ? [startingId] : [])
    setLeadId(startingId); setQueueIndex(startingIndex); setSession('idle'); setStartedAt(null); setSeconds(0); setOutcome('answered'); setNotes(''); setTranscript(''); setInterim('')
    setConsent(false); setRecording(false); setRecordingBlob(null); recordingBlobRef.current = null; setListening(false); setScheduleNext(true); setNextAt(nextHourInput())
    setPlaybookId(snapshot?.playbooks.find((item) => item.kind === 'script' && item.active)?.id ?? '')
    setFullScreen(true); setCurrentStepId('opening'); setVisitedStepIds(['opening']); setDiscovery(EMPTY_DISCOVERY); setActiveObjectionId(''); setGuidanceTab('objections')
    if (recordingUrl) URL.revokeObjectURL(recordingUrl); setRecordingUrl(null)
    const stored = safeStorageGet(STORAGE_KEY) ?? safeStorageGet(LEGACY_STORAGE_KEY)
    setShowRecovery(Boolean(stored))
    void readLocalRecording(DRAFT_RECORDING_KEY).then((blob) => setRecoveryHasAudio(Boolean(blob?.size))).catch(() => setRecoveryHasAudio(false))
    return cleanupMedia
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open || !leadId) return
    if (session === 'idle' && seconds === 0 && !notes.trim() && !transcript.trim() && currentStepId === 'opening' && !Object.values(discovery).some(Boolean)) return
    const payload: StoredCallSession = {
      leadId, queueLeadIds: routineIds, queueIndex, session, startedAt, seconds, outcome, notes, transcript, nextAt, scheduleNext, playbookId, consent,
      hasRecordingDraft: Boolean(recordingBlob || recording), currentStepId, visitedStepIds, discovery,
    }
    safeStorageSet(STORAGE_KEY, JSON.stringify(payload))
  }, [consent, currentStepId, discovery, leadId, nextAt, notes, open, outcome, playbookId, queueIndex, recording, recordingBlob, routineIds, scheduleNext, seconds, session, startedAt, transcript, visitedStepIds])

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
      const raw = safeStorageGet(STORAGE_KEY) ?? safeStorageGet(LEGACY_STORAGE_KEY) ?? ''
      const stored = JSON.parse(raw) as StoredCallSession
      setLeadId(stored.leadId); setRoutineIds(stored.queueLeadIds); setQueueIndex(stored.queueIndex); setSession(stored.session === 'running' ? 'paused' : stored.session)
      setStartedAt(stored.startedAt); setSeconds(stored.seconds); setOutcome(stored.outcome); setNotes(stored.notes); setTranscript(stored.transcript); setNextAt(stored.nextAt); setScheduleNext(stored.scheduleNext); setPlaybookId(stored.playbookId)
      setConsent(Boolean(stored.consent)); setCurrentStepId(stored.currentStepId ?? 'opening'); setVisitedStepIds(stored.visitedStepIds?.length ? stored.visitedStepIds : ['opening']); setDiscovery(stored.discovery ?? EMPTY_DISCOVERY)
      const draft = stored.hasRecordingDraft ? await readLocalRecording(DRAFT_RECORDING_KEY).catch(() => undefined) : undefined
      if (draft?.size) {
        recordingBlobRef.current = draft; setRecordingBlob(draft); setRecordingUrl(URL.createObjectURL(draft)); setRecoveryHasAudio(true)
      }
      setShowRecovery(false); safeStorageRemove(LEGACY_STORAGE_KEY)
      notify('success', draft?.size ? 'Sessão e áudio parcial recuperados em modo pausado.' : 'Sessão de ligação recuperada em modo pausado.')
    } catch { safeStorageRemove(STORAGE_KEY); safeStorageRemove(LEGACY_STORAGE_KEY); await clearDraftRecording(); setShowRecovery(false); notify('error', 'Não foi possível recuperar a sessão anterior.') }
  }

  const discardRecovery = async () => { safeStorageRemove(STORAGE_KEY); safeStorageRemove(LEGACY_STORAGE_KEY); await clearDraftRecording(); setShowRecovery(false); setRecoveryHasAudio(false) }
  const markDialing = () => { if (!leadId) { notify('error', 'Selecione um lead.'); return }; setStartedAt(new Date().toISOString()); setSession('dialing'); setSeconds(0) }
  const markAnswered = () => { if (!startedAt) setStartedAt(new Date().toISOString()); setOutcome('answered'); setSession('running') }
  const markNoAnswer = () => { setOutcome('no_answer'); setSession('finished'); setSeconds(0) }
  const finishSession = () => { setSession('finished'); if (recording) mediaRecorderRef.current?.stop(); if (listening) recognitionRef.current?.stop() }

  const startRecording = async () => {
    if (!consent) { notify('error', 'Confirme o consentimento antes de gravar.'); return }
    if (!recordingSupported) { notify('error', 'Gravação indisponível neste navegador ou sem HTTPS.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); mediaStreamRef.current = stream; chunksRef.current = []
      const recorder = new MediaRecorder(stream); mediaRecorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return
        chunksRef.current.push(event.data)
        const partial = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        void saveLocalRecording(DRAFT_RECORDING_KEY, partial).catch(() => undefined)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }); recordingBlobRef.current = blob; setRecordingBlob(blob); void saveLocalRecording(DRAFT_RECORDING_KEY, blob).catch(() => undefined)
        if (recordingUrl) URL.revokeObjectURL(recordingUrl)
        setRecordingUrl(URL.createObjectURL(blob)); setRecording(false); stream.getTracks().forEach((track) => track.stop())
      }
      recorder.start(500); setRecording(true)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível acessar o microfone.') }
  }

  const stopRecording = async () => {
    if (!recording || !mediaRecorderRef.current) return recordingBlobRef.current ?? recordingBlob
    await new Promise<void>((resolve) => {
      const recorder = mediaRecorderRef.current!
      const previous = recorder.onstop
      recorder.onstop = (event) => { previous?.call(recorder, event); window.setTimeout(resolve, 60) }
      recorder.stop()
    })
    return recordingBlobRef.current ?? recordingBlob
  }

  const toggleTranscription = () => {
    if (!speechConstructor) { notify('error', 'Transcrição ao vivo não é suportada neste navegador.'); return }
    if (listening) { recognitionRef.current?.stop(); return }
    const recognition = new speechConstructor(); recognition.lang = 'pt-BR'; recognition.continuous = true; recognition.interimResults = true
    recognition.onresult = (event) => {
      let confirmed = ''; let temporary = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]; if (result.isFinal) confirmed += `${result[0].transcript} `; else temporary += result[0].transcript
      }
      if (confirmed) setTranscript((current) => `${current}${confirmed}`.trimStart()); setInterim(temporary)
    }
    recognition.onend = () => { setListening(false); setInterim('') }
    recognition.onerror = () => { setListening(false); notify('error', 'A transcrição foi interrompida pelo navegador.') }
    recognitionRef.current = recognition; recognition.start(); setListening(true)
  }

  const moveInQueue = (direction: 1 | -1) => {
    if (!confirmDiscardAttempt(direction > 0 ? 'Avançar para o próximo lead' : 'Voltar ao lead anterior')) return
    const nextIndex = queueIndex + direction
    const nextLeadId = routineIds[nextIndex]
    if (!nextLeadId) { notify('info', direction > 0 ? 'Você chegou ao fim da fila.' : 'Você está no primeiro lead.'); return }
    resetAttempt(nextLeadId, nextIndex)
  }

  const discoverySummary = Object.entries({
    'Decisor': discovery.decisionMaker,
    'Sistema/processo atual': discovery.currentSystem,
    'Dor principal': discovery.mainPain,
    'Melhor horário': discovery.bestTime,
  }).filter(([, value]) => value.trim()).map(([label, value]) => `${label}: ${value.trim()}.`).join(' ')

  const save = async (advance = false) => {
    if (!leadId) { notify('error', 'Selecione um lead.'); return }
    if (!startedAt || session === 'idle') { notify('error', 'Inicie a tentativa pelo botão Ligar antes de salvar um resultado.'); return }
    if (outcome === 'answered' && seconds <= 0) { notify('error', 'Uma ligação atendida precisa ter duração maior que zero.'); return }
    if (recordingBlob && !consent) { notify('error', 'O áudio só pode ser salvo com o consentimento confirmado.'); return }
    if (session === 'running') { notify('error', 'Finalize ou pause a ligação antes de salvar.'); return }
    if (currentDefinition.requiresSchedule && (!scheduleNext || !nextAt)) { notify('error', 'Este resultado exige o agendamento do próximo passo.'); return }
    setBusy(true)
    try {
      const blob = await stopRecording()
      const start = startedAt ?? new Date().toISOString(); const ended = new Date().toISOString()
      const contextualNotes = [
        `Resultado: ${outcomeLabel(outcome)}.`,
        `Etapa do roteiro: ${currentStep.phase} — ${currentStep.title}.`,
        selectedPlaybook ? `Material complementar: ${selectedPlaybook.title}.` : '',
        discoverySummary,
        notes.trim(),
      ].filter(Boolean).join(' ')
      await registerCallOutcome({
        leadId,
        outcome,
        durationSeconds: seconds,
        notes: contextualNotes,
        transcript: `${transcript}${interim ? ` ${interim}` : ''}`.trim(),
        recordingPath: null,
        consentAt: blob && consent ? ended : null,
        startedAt: start,
        endedAt: ended,
        scheduleNext,
        nextAt: scheduleNext && nextAt ? new Date(nextAt).toISOString() : null,
        meetingDurationMinutes: 30,
      }, blob)
      safeStorageRemove(STORAGE_KEY); safeStorageRemove(LEGACY_STORAGE_KEY)
      await clearDraftRecording()
      if (advance && routineIds[queueIndex + 1]) resetAttempt(routineIds[queueIndex + 1], queueIndex + 1)
      else onClose()
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar a ligação.') }
    finally { setBusy(false) }
  }

  const hasNext = Boolean(routineIds[queueIndex + 1])
  const hasPrevious = queueIndex > 0

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT'
      if (event.ctrlKey && event.key === 'Enter') { event.preventDefault(); void save(false); return }
      if (event.altKey && event.key === 'ArrowRight' && hasNext) { event.preventDefault(); moveInQueue(1); return }
      if (!typing && event.code === 'Space' && ['running', 'paused'].includes(session)) { event.preventDefault(); setSession((current) => current === 'running' ? 'paused' : 'running') }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const selectOutcome = (value: CallOutcome) => { setOutcome(value); if (session === 'dialing') setSession('finished') }
  const copyPhone = async () => { if (!selectedLead?.phone) return; await writeClipboard(selectedLead.phone); notify('success', 'Telefone copiado.') }
  const copyCurrentStep = async () => { await writeClipboard([renderedStep.say, renderedStep.ask].filter(Boolean).join('\n\n')); notify('success', 'Etapa do roteiro copiada.') }
  const copyTeamPlaybook = async () => { if (!renderedTeamPlaybook) return; await writeClipboard(renderedTeamPlaybook); notify('success', 'Material da equipe copiado.') }

  const appendNote = (value: string) => setNotes((current) => `${current}${current ? '\n\n' : ''}${value}`)
  const goToStep = (stepId: OutboundStepId) => {
    setCurrentStepId(stepId)
    setVisitedStepIds((current) => current.includes(stepId) ? current : [...current, stepId])
  }
  const applyScriptAction = (action: OutboundStepAction) => {
    if (action.note) appendNote(`Roteiro — ${action.note}`)
    if (action.outcome) setOutcome(action.outcome)
    if (action.nextStepId) goToStep(action.nextStepId)
    else if (action.outcome && ['running', 'paused', 'dialing'].includes(session)) finishSession()
  }
  const useObjection = (item: ObjectionItem) => {
    appendNote(`Objeção — ${item.title}. Resposta utilizada: ${item.response} Pergunta de diagnóstico: ${item.diagnosticQuestion}`)
    setActiveObjectionId(item.id)
    notify('success', 'Objeção registrada nas anotações.')
  }

  const formattedTime = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const requestClose = () => {
    if (!confirmDiscardAttempt('Fechar o modo ligação')) return
    cleanupMedia(); safeStorageRemove(STORAGE_KEY); safeStorageRemove(LEGACY_STORAGE_KEY); void clearDraftRecording(); onClose()
  }
  const discardRecording = async () => {
    if (recording) { notify('error', 'Pare a gravação antes de descartá-la.'); return }
    if (!recordingBlob && !recordingUrl) return
    if (!window.confirm('Descartar definitivamente o áudio desta tentativa?')) return
    recordingBlobRef.current = null; setRecordingBlob(null); setConsent(false)
    if (recordingUrl) URL.revokeObjectURL(recordingUrl)
    setRecordingUrl(null); await clearDraftRecording(); setRecoveryHasAudio(false)
  }

  useEffect(() => {
    if (!open || !hasUnsavedAttempt) return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [hasUnsavedAttempt, open])

  const progressPercent = Math.round((currentStep.order / OUTBOUND_CALL_STEPS.length) * 100)

  return <Modal
    open={open}
    onClose={requestClose}
    title="Modo Ligação em Foco"
    subtitle={`${routineIds.length ? `${queueIndex + 1} de ${routineIds.length} na fila` : 'Ligação avulsa'} · roteiro, diagnóstico e registro em uma única tela.`}
    size={fullScreen ? 'full' : 'xl'}
    headerActions={<button className="button button--secondary button--sm call-focus-fullscreen" type="button" onClick={() => setFullScreen((value) => !value)}>{fullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{fullScreen ? 'Restaurar janela' : 'Expandir área'}</button>}
    footer={<>
      <Button variant="ghost" disabled={!hasPrevious || busy} onClick={() => moveInQueue(-1)}><ArrowLeft size={16} /> Anterior</Button>
      <span className="modal__footer-spacer" />
      {session === 'finished' ? <>
        <Button variant="secondary" loading={busy} onClick={() => void save(false)}><Save size={16} /> Salvar</Button>
        <Button loading={busy} disabled={!hasNext} onClick={() => void save(true)}><ArrowRight size={16} /> Salvar e próximo</Button>
      </> : <Button variant="secondary" disabled={!hasNext || busy} onClick={() => moveInQueue(1)}><SkipForward size={16} /> Pular lead</Button>}
    </>}
  >
    <div className="call-focus-workspace call-focus-workspace--v29">
      {showRecovery ? <section className="call-recovery-banner"><RotateCcw size={20} /><div><strong>Há uma sessão de ligação interrompida</strong><span>Recupere roteiro, descoberta, notas, transcrição, tempo e posição na fila{recoveryHasAudio ? ' e o áudio parcial' : ''}.</span></div><Button size="sm" onClick={recoverSession}>Recuperar</Button><Button size="sm" variant="ghost" onClick={discardRecovery}>Descartar</Button></section> : null}

      <section className="call-focus-leadbar call-focus-leadbar--v29">
        <label className="compact-select"><span>Lead da ligação</span><select value={leadId} onChange={(event) => { if (!confirmDiscardAttempt('Trocar de lead')) return; const index = routineIds.indexOf(event.target.value); resetAttempt(event.target.value, Math.max(0, index)) }} disabled={recording}><option value="">Selecione</option>{snapshot?.leads.filter((lead) => lead.status === 'active').map((lead) => <option key={lead.id} value={lead.id}>{lead.name} · {lead.phone || 'sem telefone'}</option>)}</select></label>
        {selectedLead ? <div className="call-focus-leadbar__identity"><span className="lead-cell__avatar">{selectedLead.name.slice(0, 2).toUpperCase()}</span><div><strong>{selectedLead.name}</strong><small>{selectedLead.company || 'Empresa não informada'} · {selectedStage?.name ?? 'Sem etapa'} · prioridade {priorityLabel[selectedLead.priority]}</small></div></div> : null}
        <div className="call-live-summary"><span className={`call-live-summary__dot ${session === 'running' ? 'is-live' : ''}`} /><div><strong>{formattedTime}</strong><small>{session === 'running' ? 'Conversa em andamento' : session === 'paused' ? 'Ligação pausada' : session === 'dialing' ? 'Discando' : session === 'finished' ? 'Tentativa finalizada' : 'Pronto para iniciar'}</small></div></div>
        <div className="call-focus-leadbar__actions">{selectedLead?.phone ? <><button className="button button--secondary button--sm" type="button" onClick={() => void copyPhone()}><Copy size={15} /> Copiar</button><a className="button button--primary button--sm" href={`tel:${selectedLead.phone.replace(/[^\d+]/g, '')}`} onClick={markDialing}><PhoneCall size={15} /> Ligar {selectedLead.phone}</a></> : null}</div>
      </section>

      <div className="call-focus-grid call-focus-grid--v29">
        <aside className="call-focus-column call-focus-flow">
          <section className="call-flow-panel">
            <div className="call-flow-panel__heading"><div><span className="eyebrow">Fluxo da conversa</span><h3>{progressPercent}% concluído</h3></div><span>{currentStep.order}/{OUTBOUND_CALL_STEPS.length}</span></div>
            <div className="call-flow-progress"><i style={{ width: `${progressPercent}%` }} /></div>
            <nav className="call-step-nav" aria-label="Etapas do roteiro">
              {OUTBOUND_CALL_STEPS.map((step) => {
                const active = step.id === currentStepId
                const visited = visitedStepIds.includes(step.id)
                return <button type="button" key={step.id} className={`${active ? 'is-active' : ''} ${visited ? 'is-visited' : ''}`} onClick={() => goToStep(step.id)}>
                  <span>{visited && !active ? <Check size={13} /> : step.order}</span>
                  <div><small>{step.phase}</small><strong>{step.title}</strong></div>
                  {active ? <ChevronRight size={15} /> : null}
                </button>
              })}
            </nav>
          </section>

          <section className="call-focus-panel call-queue-panel"><span className="eyebrow">Fila da rotina</span><div className="call-queue-panel__metric"><strong>{Math.max(0, routineIds.length - queueIndex - 1)}</strong><span>leads restantes</span></div><div className="call-shortcuts"><div><span><kbd>Ctrl</kbd> + <kbd>Enter</kbd></span><small>Salvar ligação</small></div><div><span><kbd>Espaço</kbd></span><small>Pausar/retomar</small></div><div><span><kbd>Alt</kbd> + <kbd>→</kbd></span><small>Próximo lead</small></div></div></section>
        </aside>

        <main className="call-focus-column call-focus-main call-focus-main--v29">
          <section className="call-guided-script">
            <header className="call-guided-script__header">
              <div className="call-guided-script__identity"><span><BookOpenText size={21} /></span><div><small>Etapa {currentStep.order} · {currentStep.phase}</small><h2>{currentStep.title}</h2></div></div>
              <div className="call-guided-script__tools"><StatusPill tone="info">Roteiro outbound</StatusPill><button className="icon-button" type="button" aria-label="Copiar etapa do roteiro" onClick={() => void copyCurrentStep()}><Copy size={17} /></button></div>
            </header>

            <div className="call-guided-objective"><Target size={18} /><div><span>Objetivo desta etapa</span><strong>{currentStep.objective}</strong></div></div>

            <div className="call-guided-script__body">
              <section className="call-say-card"><span><Sparkles size={16} /> Fala sugerida</span><p>{renderedStep.say}</p></section>
              {renderedStep.ask ? <section className="call-ask-card"><span><MessageCircleQuestion size={16} /> Pergunta sugerida</span><p>{renderedStep.ask}</p></section> : null}
              <section className="call-coaching-line"><Lightbulb size={17} /><p><strong>Orientação:</strong> {currentStep.coaching}</p></section>
            </div>

            <footer className="call-guided-actions"><div><span>O que o lead respondeu?</span><small>Selecione uma opção para avançar e registrar o contexto.</small></div><div className="call-guided-actions__buttons">{currentStep.actions.map((action) => <button type="button" key={action.id} className={`call-response-button call-response-button--${action.tone ?? 'secondary'}`} onClick={() => applyScriptAction(action)}>{action.label}<ChevronRight size={15} /></button>)}</div></footer>
          </section>

          <section className="call-console call-console--focus call-console--v29">
            <div className={`call-timer call-timer--focus ${session === 'running' ? 'is-running' : ''} ${session === 'paused' ? 'is-paused' : ''}`}><Timer size={24} /><div><strong>{formattedTime}</strong><span>{session === 'idle' ? 'Pronta para discar' : session === 'dialing' ? 'Aguardando confirmação' : session === 'running' ? 'Conversa em andamento' : session === 'paused' ? 'Ligação pausada' : 'Tentativa finalizada'}</span></div><StatusPill tone={session === 'running' ? 'success' : session === 'paused' || session === 'dialing' ? 'warning' : 'neutral'}>{session === 'running' ? 'Ao vivo' : session === 'paused' ? 'Pausada' : session === 'dialing' ? 'Discando' : session === 'finished' ? 'Finalizada' : 'Pronta'}</StatusPill></div>
            {session === 'dialing' ? <div className="call-answer-actions"><Button onClick={markAnswered}><CheckCircle2 size={17} /> Atendeu — iniciar timer</Button><Button variant="secondary" onClick={markNoAnswer}><PhoneCall size={17} /> Não atendeu</Button></div> : null}
            <div className="call-console__buttons">
              {session === 'running' ? <><Button variant="secondary" onClick={() => setSession('paused')}><Pause size={16} /> Pausar</Button><Button variant="danger" onClick={finishSession}><Square size={16} /> Finalizar conversa</Button></> : null}
              {session === 'paused' ? <><Button onClick={() => setSession('running')}><Play size={16} /> Retomar</Button><Button variant="danger" onClick={finishSession}><Square size={16} /> Finalizar</Button></> : null}
              {session === 'finished' ? <Button variant="secondary" onClick={() => { setSession('dialing'); setStartedAt(new Date().toISOString()); setSeconds(0) }}><RotateCcw size={16} /> Nova tentativa</Button> : null}
            </div>
            <details className="call-recording-tools">
              <summary><Mic size={16} /> Gravação e transcrição <ChevronRight size={15} /></summary>
              <div>
                <label className="consent-check"><input type="checkbox" checked={consent} disabled={recording || Boolean(recordingBlob)} onChange={(event) => setConsent(event.target.checked)} /><span>O participante foi informado e consentiu com a gravação.</span></label>
                <div className="call-recording-tools__actions">
                  <Button variant={recording ? 'danger' : 'secondary'} disabled={!recordingSupported || !['running', 'paused'].includes(session)} onClick={() => recording ? mediaRecorderRef.current?.stop() : void startRecording()}>{recording ? <CircleStop size={17} /> : <Mic size={17} />} {recording ? 'Parar gravação' : 'Gravar áudio'}</Button>
                  <Button variant={listening ? 'danger' : 'secondary'} disabled={!speechSupported || !['running', 'paused'].includes(session)} onClick={toggleTranscription}>{listening ? <MicOff size={17} /> : <Volume2 size={17} />} {listening ? 'Parar transcrição' : 'Transcrever'}</Button>
                  {recordingBlob ? <Button size="sm" variant="ghost" onClick={() => void discardRecording()}>Descartar áudio</Button> : null}
                </div>
                {!recordingSupported ? <p className="support-note">O microfone exige navegador compatível e página hospedada em HTTPS.</p> : null}
                {repositoryMode === 'local' && recordingBlob ? <p className="support-note">No modo local, o áudio fica salvo neste navegador.</p> : null}
                {recordingUrl ? <audio className="call-audio" src={recordingUrl} controls /> : null}
              </div>
            </details>
          </section>

          <details className="call-complementary-playbook" open={Boolean(renderedTeamPlaybook)}><summary><span><BookOpenText size={17} /><strong>Material complementar da equipe</strong></span><ChevronRight size={16} /></summary><div><label><span>Playbook ativo</span><select aria-label="Material complementar da ligação" value={playbookId} onChange={(event) => setPlaybookId(event.target.value)}><option value="">Sem material complementar</option>{snapshot?.playbooks.filter((item) => item.kind === 'script' && item.active).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>{renderedTeamPlaybook ? <><p>{renderedTeamPlaybook}</p><Button size="sm" variant="secondary" onClick={() => void copyTeamPlaybook()}><Copy size={15} /> Copiar material</Button></> : <span className="activity-empty">Selecione um script cadastrado em Playbooks.</span>}</div></details>

          {session === 'finished' ? <>
          <section className="call-result-panel"><div className="call-result-panel__heading"><div><span className="eyebrow">Resultado obrigatório</span><h3>O que aconteceu nesta tentativa?</h3></div><StatusPill tone={currentDefinition.tone === 'neutral' ? 'neutral' : currentDefinition.tone}>{currentDefinition.label}</StatusPill></div><div className="call-outcome-grid">{CALL_OUTCOMES.map((item) => <button key={item.value} type="button" className={outcome === item.value ? 'is-active' : ''} onClick={() => selectOutcome(item.value)}>{item.label}</button>)}</div></section>

          <section className="call-notes-grid">
            <label className="field"><span>Anotações da conversa</span><textarea rows={6} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="O roteiro registra respostas automaticamente. Complemente com detalhes importantes." /></label>
            <label className="field"><span>Transcrição</span><textarea rows={6} value={`${transcript}${interim ? ` ${interim}` : ''}`} onChange={(event) => { setTranscript(event.target.value); setInterim('') }} placeholder="Texto confirmado e provisório da conversa" /></label>
          </section>

          <section className="call-next-step"><label className="consent-check"><input type="checkbox" checked={scheduleNext} onChange={(event) => setScheduleNext(event.target.checked)} disabled={Boolean(currentDefinition.closesLead)} /><span>{outcome === 'meeting_scheduled' ? 'Criar compromisso na Agenda' : 'Criar próxima ligação no Follow-up'}</span></label><label className="field"><span>Data e horário</span><input type="datetime-local" value={nextAt} onChange={(event) => setNextAt(event.target.value)} disabled={!scheduleNext || Boolean(currentDefinition.closesLead)} /></label><div className="call-next-step__summary"><CalendarPlus size={18} /><div><strong>{currentDefinition.closesLead ? `Lead será marcado como ${currentDefinition.closesLead === 'won' ? 'ganho' : 'perdido'}` : scheduleNext && nextAt ? `Próximo passo em ${formatDateTime(new Date(nextAt).toISOString())}` : 'Sem próximo passo automático'}</strong><span>O Pipeline, a Agenda e o Follow-up serão atualizados ao salvar.</span></div></div></section>
          </> : null}
        </main>

        <aside className="call-focus-column call-focus-guidance call-focus-guidance--v29 call-guidance-tabs">
          <nav className="call-guidance-tabs__nav" aria-label="Apoio da ligação">
            <button type="button" className={guidanceTab === 'objections' ? 'is-active' : ''} onClick={() => setGuidanceTab('objections')}>Objeções</button>
            <button type="button" className={guidanceTab === 'notes' ? 'is-active' : ''} onClick={() => setGuidanceTab('notes')}>Notas</button>
            <button type="button" className={guidanceTab === 'lead' ? 'is-active' : ''} onClick={() => setGuidanceTab('lead')}>Lead</button>
            <button type="button" className={guidanceTab === 'history' ? 'is-active' : ''} onClick={() => setGuidanceTab('history')}>Histórico</button>
          </nav>

          {guidanceTab === 'objections' ? <section className="call-focus-panel call-objection-library">
            <div className="call-panel-title"><div><span className="eyebrow">Respostas rápidas</span><h3>Objeções</h3></div><AlertCircle size={19} /></div>
            <div className="call-objection-chips">{objections.slice(0, 8).map((item) => <button type="button" key={item.id} className={activeObjectionId === item.id ? 'is-active' : ''} onClick={() => setActiveObjectionId(item.id)}>{item.title}</button>)}</div>
            {activeObjection ? <article className="call-objection-detail"><header><div><small>{activeObjection.category}</small><strong>{activeObjection.title}</strong></div>{activeObjection.source === 'team' ? <StatusPill tone="info">Equipe</StatusPill> : <StatusPill tone="neutral">Padrão</StatusPill>}</header><div><span>Resposta sugerida</span><p>{activeObjection.response}</p></div><div className="call-objection-question"><span>Pergunta para diagnosticar</span><p>{activeObjection.diagnosticQuestion}</p></div><footer><Button size="sm" variant="secondary" onClick={() => void writeClipboard(`${activeObjection.response}

${activeObjection.diagnosticQuestion}`).then(() => notify('success', 'Resposta copiada.'))}><Copy size={14} /> Copiar</Button><Button size="sm" onClick={() => useObjection(activeObjection)}><Check size={14} /> Registrar uso</Button></footer></article> : <p className="activity-empty">Selecione uma objeção para abrir a resposta.</p>}
          </section> : null}

          {guidanceTab === 'notes' ? <section className="call-focus-panel call-discovery-panel">
            <div className="call-panel-title"><div><span className="eyebrow">Notas e descoberta</span><h3>Registre enquanto escuta</h3></div><Clipboard size={19} /></div>
            <label><span>Anotações livres</span><textarea rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Detalhes importantes da conversa" /></label>
            <label><span>Decisor responsável</span><input value={discovery.decisionMaker} onChange={(event) => setDiscovery((current) => ({ ...current, decisionMaker: event.target.value }))} placeholder="Nome e cargo" /></label>
            <label><span>Sistema ou processo atual</span><input value={discovery.currentSystem} onChange={(event) => setDiscovery((current) => ({ ...current, currentSystem: event.target.value }))} placeholder="Sistema, WhatsApp ou agenda" /></label>
            <label><span>Dor principal</span><textarea rows={3} value={discovery.mainPain} onChange={(event) => setDiscovery((current) => ({ ...current, mainPain: event.target.value }))} placeholder="Use as palavras do lead" /></label>
            <label><span>Melhor horário</span><input value={discovery.bestTime} onChange={(event) => setDiscovery((current) => ({ ...current, bestTime: event.target.value }))} placeholder="Ex.: terça às 15h" /></label>
          </section> : null}

          {guidanceTab === 'lead' ? <section className="call-focus-panel call-lead-intelligence">
            <div className="call-panel-title"><div><span className="eyebrow">Contexto do lead</span><h3>{selectedLead?.company || selectedLead?.name || 'Selecione um lead'}</h3></div><UserRoundCheck size={19} /></div>
            <div className="call-context-list"><div><small>Temperatura</small><strong>{selectedLead?.temperature === 'hot' ? 'Quente' : selectedLead?.temperature === 'warm' ? 'Morno' : 'Frio'}</strong></div><div><small>Tentativas</small><strong>{leadCalls.length}</strong></div><div><small>Próxima ação</small><strong>{selectedLead?.nextActionAt ? formatDateTime(selectedLead.nextActionAt) : 'Não definida'}</strong></div><div><small>Responsável</small><strong>{selectedLead?.ownerName || 'Não definido'}</strong></div></div>
            {selectedLead?.tags?.length ? <div className="call-context-tags">{selectedLead.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
          </section> : null}

          {guidanceTab === 'history' ? <section className="call-focus-panel"><span className="eyebrow">Histórico recente</span><div className="call-mini-history">{leadCalls.slice(0, 5).map((call) => <article key={call.id}><PhoneCall size={14} /><div><strong>{outcomeLabel(call.outcome)}</strong><span>{formatDateTime(call.startedAt)} · {call.durationSeconds}s</span>{call.notes ? <p>{call.notes}</p> : null}</div></article>)}{!leadCalls.length ? <p className="activity-empty">Nenhuma ligação anterior.</p> : null}{leadActivities.slice(0, 3).map((activity) => <article key={activity.id}><CalendarPlus size={14} /><div><strong>{activity.title}</strong><span>{activity.dueAt ? formatDateTime(activity.dueAt) : 'Sem data'}</span></div></article>)}</div></section> : null}
        </aside>
      </div>
    </div>
  </Modal>
}
