import { ArrowLeft, ArrowRight, CalendarPlus, CheckCircle2, CircleStop, Clipboard, Copy, Mic, MicOff, Pause, PhoneCall, Play, RotateCcw, Save, SkipForward, Square, Timer, Volume2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { StatusPill } from '../../components/ui/status-pill'
import { formatDateTime } from '../../domain/formatters'
import type { CallOutcome } from '../../domain/types'
import { CALL_OUTCOMES, defaultNextDate, outcomeDefinition, outcomeLabel } from '../../services/call-workspace'
import { usePreferences } from '../settings/preferences-context'
import { deleteLocalRecording, readLocalRecording, saveLocalRecording } from '../../lib/local-recordings'

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
}

const STORAGE_KEY = 'crm-v100-10-call-session'
const DRAFT_RECORDING_KEY = 'draft:crm-v100-call-session'

const safeStorageGet = (key: string) => { try { return window.localStorage.getItem(key) } catch { return null } }
const safeStorageSet = (key: string, value: string) => { try { window.localStorage.setItem(key, value) } catch { /* armazenamento indisponível */ } }
const safeStorageRemove = (key: string) => { try { window.localStorage.removeItem(key) } catch { /* armazenamento indisponível */ } }
const toInput = (date: Date | null) => date ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ''
const nextHourInput = () => { const date = new Date(); date.setHours(date.getHours() + 1, 0, 0, 0); return toInput(date) }

export function CallWorkspaceModal({ open, initialLeadId = '', queueLeadIds = [], onClose }: { open: boolean; initialLeadId?: string; queueLeadIds?: string[]; onClose(): void }) {
  const { snapshot, repositoryMode, createCall, createActivity, createCalendarEvent, updateLead, notify } = useApp()
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
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryHasAudio, setRecoveryHasAudio] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  const selectedLead = snapshot?.leads.find((lead) => lead.id === leadId)
  const selectedPlaybook = snapshot?.playbooks.find((item) => item.id === playbookId)
  const renderedPlaybook = (selectedPlaybook?.content ?? '')
    .replaceAll('{{nome}}', selectedLead?.name ?? 'lead')
    .replaceAll('{{empresa}}', selectedLead?.company || 'empresa')
    .replaceAll('{{cidade}}', selectedLead?.city || 'sua cidade')
    .replaceAll('[Nome]', selectedLead?.name ?? 'lead')
    .replaceAll('[Empresa]', selectedLead?.company || 'empresa')
  const leadCalls = useMemo(() => (snapshot?.calls ?? []).filter((call) => call.leadId === leadId).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()), [leadId, snapshot])
  const leadActivities = useMemo(() => (snapshot?.activities ?? []).filter((activity) => activity.leadId === leadId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [leadId, snapshot])
  const selectedStage = snapshot?.stages.find((stage) => stage.id === selectedLead?.stageId)
  const objectionPlaybooks = snapshot?.playbooks.filter((item) => item.kind === 'objection' && item.active) ?? []
  const recordingSupported = typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  const speechConstructor = (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition
  const speechSupported = Boolean(speechConstructor)
  const currentDefinition = outcomeDefinition(outcome)

  const cleanupMedia = useCallback(() => {
    recognitionRef.current?.stop(); recognitionRef.current = null; setListening(false)
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null; mediaRecorderRef.current = null; setRecording(false)
  }, [])

  const hasUnsavedAttempt = Boolean(
    startedAt || seconds > 0 || notes.trim() || transcript.trim() || interim.trim() || recordingBlob || recording || listening || session !== 'idle',
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
    setScheduleNext(true); setNextAt(nextHourInput())
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
    if (recordingUrl) URL.revokeObjectURL(recordingUrl); setRecordingUrl(null)
    const stored = safeStorageGet(STORAGE_KEY)
    setShowRecovery(Boolean(stored))
    void readLocalRecording(DRAFT_RECORDING_KEY).then((blob) => setRecoveryHasAudio(Boolean(blob?.size))).catch(() => setRecoveryHasAudio(false))
    return cleanupMedia
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open || !leadId) return
    if (session === 'idle' && seconds === 0 && !notes.trim() && !transcript.trim()) return
    const payload: StoredCallSession = { leadId, queueLeadIds: routineIds, queueIndex, session, startedAt, seconds, outcome, notes, transcript, nextAt, scheduleNext, playbookId, consent, hasRecordingDraft: Boolean(recordingBlob || recording) }
    safeStorageSet(STORAGE_KEY, JSON.stringify(payload))
  }, [consent, leadId, nextAt, notes, open, outcome, playbookId, queueIndex, recording, recordingBlob, routineIds, scheduleNext, seconds, session, startedAt, transcript])

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
      const stored = JSON.parse(safeStorageGet(STORAGE_KEY) ?? '') as StoredCallSession
      setLeadId(stored.leadId); setRoutineIds(stored.queueLeadIds); setQueueIndex(stored.queueIndex); setSession(stored.session === 'running' ? 'paused' : stored.session)
      setStartedAt(stored.startedAt); setSeconds(stored.seconds); setOutcome(stored.outcome); setNotes(stored.notes); setTranscript(stored.transcript); setNextAt(stored.nextAt); setScheduleNext(stored.scheduleNext); setPlaybookId(stored.playbookId)
      setConsent(Boolean(stored.consent))
      const draft = stored.hasRecordingDraft ? await readLocalRecording(DRAFT_RECORDING_KEY).catch(() => undefined) : undefined
      if (draft?.size) {
        recordingBlobRef.current = draft; setRecordingBlob(draft); setRecordingUrl(URL.createObjectURL(draft)); setRecoveryHasAudio(true)
      }
      setShowRecovery(false); notify('success', draft?.size ? 'Sessão e áudio parcial recuperados em modo pausado.' : 'Sessão de ligação recuperada em modo pausado.')
    } catch { safeStorageRemove(STORAGE_KEY); await clearDraftRecording(); setShowRecovery(false); notify('error', 'Não foi possível recuperar a sessão anterior.') }
  }

  const discardRecovery = async () => { safeStorageRemove(STORAGE_KEY); await clearDraftRecording(); setShowRecovery(false); setRecoveryHasAudio(false) }
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

  const applyLeadConsequences = async () => {
    if (!selectedLead) return
    const update: Parameters<typeof updateLead>[1] = {}
    if (outcome === 'invalid_number') update.tags = [...new Set([...selectedLead.tags, 'telefone-invalido'])]
    if (outcome === 'wrong_person') update.tags = [...new Set([...selectedLead.tags, 'buscar-decisor'])]
    if (currentDefinition.closesLead) {
      update.status = currentDefinition.closesLead
      const finalStage = snapshot?.stages.find((stage) => currentDefinition.closesLead === 'won' ? stage.isWon : stage.isLost)
      if (finalStage) update.stageId = finalStage.id
      update.nextActionAt = null
    } else if (outcome === 'proposal_requested' || outcome === 'proposal_sent') {
      const proposalStage = snapshot?.stages.find((stage) => stage.name.toLowerCase().includes('proposta'))
      if (proposalStage) update.stageId = proposalStage.id
      if (scheduleNext && nextAt) update.nextActionAt = new Date(nextAt).toISOString()
    } else if (scheduleNext && nextAt) update.nextActionAt = new Date(nextAt).toISOString()
    if (Object.keys(update).length) await updateLead(selectedLead.id, update)
  }

  const createNextStep = async () => {
    if (!scheduleNext || !nextAt || currentDefinition.closesLead) return
    const nextIso = new Date(nextAt).toISOString()
    if (outcome === 'meeting_scheduled') {
      const end = new Date(nextIso); end.setMinutes(end.getMinutes() + 30)
      await createCalendarEvent({ leadId, title: `Reunião — ${selectedLead?.name ?? 'Lead'}`, description: notes.trim(), startsAt: nextIso, endsAt: end.toISOString(), allDay: false, location: '', status: 'confirmed', assignedTo: null })
      return
    }
    const duplicate = snapshot?.activities.some((activity) => activity.leadId === leadId && !activity.completedAt && activity.dueAt && Math.abs(new Date(activity.dueAt).getTime() - new Date(nextIso).getTime()) < 60_000 && ['call', 'followup'].includes(activity.type))
    if (!duplicate) await createActivity({ leadId, type: 'call', title: `Ligação — ${selectedLead?.name ?? 'Lead'}`, description: `${outcomeLabel(outcome)}. ${notes.trim()}`.trim(), dueAt: nextIso, completedAt: null, assignedTo: null })
  }

  const moveInQueue = (direction: 1 | -1) => {
    if (!confirmDiscardAttempt(direction > 0 ? 'Avançar para o próximo lead' : 'Voltar ao lead anterior')) return
    const nextIndex = queueIndex + direction
    const nextLeadId = routineIds[nextIndex]
    if (!nextLeadId) { notify('info', direction > 0 ? 'Você chegou ao fim da fila.' : 'Você está no primeiro lead.'); return }
    resetAttempt(nextLeadId, nextIndex)
  }

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
      const contextualNotes = [`Resultado: ${outcomeLabel(outcome)}.`, selectedPlaybook ? `Roteiro: ${selectedPlaybook.title}.` : '', notes.trim()].filter(Boolean).join(' ')
      await createCall({ leadId, outcome, durationSeconds: seconds, notes: contextualNotes, transcript: `${transcript}${interim ? ` ${interim}` : ''}`.trim(), recordingPath: null, consentAt: blob && consent ? ended : null, startedAt: start, endedAt: ended }, blob)
      try {
        await createNextStep()
        await applyLeadConsequences()
      } catch (followupError) {
        notify('info', `A ligação foi salva, mas o próximo passo precisa ser revisado: ${followupError instanceof Error ? followupError.message : 'falha no agendamento.'}`)
      }
      safeStorageRemove(STORAGE_KEY)
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
  const copyPhone = async () => { if (!selectedLead?.phone) return; await navigator.clipboard.writeText(selectedLead.phone); notify('success', 'Telefone copiado.') }
  const insertObjection = (content: string) => setNotes((current) => `${current}${current ? '\n\n' : ''}Objeção trabalhada: ${content}`)
  const formattedTime = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const requestClose = () => {
    if (!confirmDiscardAttempt('Fechar o modo ligação')) return
    cleanupMedia(); safeStorageRemove(STORAGE_KEY); void clearDraftRecording(); onClose()
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

  return <Modal open={open} onClose={requestClose} title="Modo Ligação em Foco" subtitle={`${routineIds.length ? `${queueIndex + 1} de ${routineIds.length} na fila` : 'Ligação avulsa'} · contexto, execução e próximo passo no mesmo ambiente.`} size="xl" footer={<>
    <Button variant="ghost" disabled={!hasPrevious || busy} onClick={() => moveInQueue(-1)}><ArrowLeft size={16} /> Anterior</Button>
    <span className="modal__footer-spacer" />
    <Button variant="secondary" disabled={!hasNext || busy} onClick={() => moveInQueue(1)}><SkipForward size={16} /> Pular</Button>
    <Button variant="secondary" loading={busy} onClick={() => void save(false)}><Save size={16} /> Salvar</Button>
    <Button loading={busy} disabled={!hasNext} onClick={() => void save(true)}><ArrowRight size={16} /> Salvar e próximo</Button>
  </>}>
    <div className="call-focus-workspace">
      {showRecovery ? <section className="call-recovery-banner"><RotateCcw size={20} /><div><strong>Há uma sessão de ligação interrompida</strong><span>Recupere notas, transcrição, tempo, posição na fila{recoveryHasAudio ? ' e o áudio parcial' : ''}.</span></div><Button size="sm" onClick={recoverSession}>Recuperar</Button><Button size="sm" variant="ghost" onClick={discardRecovery}>Descartar</Button></section> : null}

      <section className="call-focus-leadbar">
        <label className="compact-select"><span>Lead da ligação</span><select value={leadId} onChange={(event) => { if (!confirmDiscardAttempt('Trocar de lead')) return; const index = routineIds.indexOf(event.target.value); resetAttempt(event.target.value, Math.max(0, index)) }} disabled={recording}><option value="">Selecione</option>{snapshot?.leads.filter((lead) => lead.status === 'active').map((lead) => <option key={lead.id} value={lead.id}>{lead.name} · {lead.phone || 'sem telefone'}</option>)}</select></label>
        {selectedLead ? <div className="call-focus-leadbar__identity"><span className="lead-cell__avatar">{selectedLead.name.slice(0, 2).toUpperCase()}</span><div><strong>{selectedLead.name}</strong><small>{selectedLead.company || 'Empresa não informada'} · {selectedStage?.name ?? 'Sem etapa'} · {selectedLead.priority}</small></div></div> : null}
        <div className="call-focus-leadbar__actions">{selectedLead?.phone ? <><button className="button button--secondary button--sm" type="button" onClick={() => void copyPhone()}><Copy size={15} /> Copiar</button><a className="button button--primary button--sm" href={`tel:${selectedLead.phone.replace(/[^\d+]/g, '')}`} onClick={markDialing}><PhoneCall size={15} /> Ligar {selectedLead.phone}</a></> : null}</div>
      </section>

      <div className="call-focus-grid">
        <aside className="call-focus-column call-focus-context">
          <section className="call-focus-panel"><span className="eyebrow">Contexto do lead</span><div className="call-context-list"><div><small>Temperatura</small><strong>{selectedLead?.temperature === 'hot' ? 'Quente' : selectedLead?.temperature === 'warm' ? 'Morno' : 'Frio'}</strong></div><div><small>Tentativas</small><strong>{leadCalls.length}</strong></div><div><small>Última ação</small><strong>{selectedLead?.nextActionAt ? formatDateTime(selectedLead.nextActionAt) : 'Não definida'}</strong></div><div><small>Responsável</small><strong>{selectedLead?.ownerName || 'Não definido'}</strong></div></div>{selectedLead?.tags.length ? <div className="call-context-tags">{selectedLead.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}{selectedLead?.notes ? <div className="call-context-notes"><small>Notas do lead</small><p>{selectedLead.notes}</p></div> : null}</section>
          <section className="call-focus-panel"><span className="eyebrow">Histórico recente</span><div className="call-mini-history">{leadCalls.slice(0, 4).map((call) => <article key={call.id}><PhoneCall size={14} /><div><strong>{outcomeLabel(call.outcome)}</strong><span>{formatDateTime(call.startedAt)} · {call.durationSeconds}s</span>{call.notes ? <p>{call.notes}</p> : null}</div></article>)}{!leadCalls.length ? <p className="activity-empty">Nenhuma ligação anterior.</p> : null}{leadActivities.slice(0, 2).map((activity) => <article key={activity.id}><CalendarPlus size={14} /><div><strong>{activity.title}</strong><span>{activity.dueAt ? formatDateTime(activity.dueAt) : 'Sem data'}</span></div></article>)}</div></section>
        </aside>

        <main className="call-focus-column call-focus-main">
          <section className="call-console call-console--focus">
            <div className={`call-timer call-timer--focus ${session === 'running' ? 'is-running' : ''} ${session === 'paused' ? 'is-paused' : ''}`}><Timer size={24} /><div><strong>{formattedTime}</strong><span>{session === 'idle' ? 'Pronta para discar' : session === 'dialing' ? 'Aguardando confirmação' : session === 'running' ? 'Conversa em andamento' : session === 'paused' ? 'Ligação pausada' : 'Tentativa finalizada'}</span></div><StatusPill tone={session === 'running' ? 'success' : session === 'paused' || session === 'dialing' ? 'warning' : 'neutral'}>{session === 'running' ? 'Ao vivo' : session === 'paused' ? 'Pausada' : session === 'dialing' ? 'Discando' : session === 'finished' ? 'Finalizada' : 'Pronta'}</StatusPill></div>
            {session === 'dialing' ? <div className="call-answer-actions"><Button onClick={markAnswered}><CheckCircle2 size={17} /> Atendeu — iniciar timer</Button><Button variant="secondary" onClick={markNoAnswer}><PhoneCall size={17} /> Não atendeu</Button></div> : null}
            <div className="call-console__buttons">
              {session === 'running' ? <><Button variant="secondary" onClick={() => setSession('paused')}><Pause size={16} /> Pausar</Button><Button variant="danger" onClick={finishSession}><Square size={16} /> Finalizar conversa</Button></> : null}
              {session === 'paused' ? <><Button onClick={() => setSession('running')}><Play size={16} /> Retomar</Button><Button variant="danger" onClick={finishSession}><Square size={16} /> Finalizar</Button></> : null}
              {session === 'finished' ? <Button variant="secondary" onClick={() => { setSession('dialing'); setStartedAt(new Date().toISOString()); setSeconds(0) }}><RotateCcw size={16} /> Nova tentativa</Button> : null}
              <Button variant={recording ? 'danger' : 'secondary'} disabled={!recordingSupported || !['running', 'paused'].includes(session)} onClick={() => recording ? mediaRecorderRef.current?.stop() : void startRecording()}>{recording ? <CircleStop size={17} /> : <Mic size={17} />} {recording ? 'Parar gravação' : 'Gravar áudio'}</Button>
              <Button variant={listening ? 'danger' : 'secondary'} disabled={!speechSupported || !['running', 'paused'].includes(session)} onClick={toggleTranscription}>{listening ? <MicOff size={17} /> : <Volume2 size={17} />} {listening ? 'Parar transcrição' : 'Transcrever'}</Button>
            </div>
            <label className="consent-check"><input type="checkbox" checked={consent} disabled={recording || Boolean(recordingBlob)} onChange={(event) => setConsent(event.target.checked)} /><span>O participante foi informado e consentiu com a gravação.</span></label>{recordingBlob ? <Button size="sm" variant="ghost" onClick={() => void discardRecording()}>Descartar áudio</Button> : null}
            {!recordingSupported ? <p className="support-note">O microfone exige navegador compatível e página hospedada em HTTPS.</p> : null}
            {repositoryMode === 'local' && recordingBlob ? <p className="support-note">No modo local, o áudio é salvo no armazenamento privado deste navegador e continua disponível após recarregar.</p> : null}
            {recordingUrl ? <audio className="call-audio" src={recordingUrl} controls /> : null}
          </section>

          <section className="call-result-panel"><div className="call-result-panel__heading"><div><span className="eyebrow">Resultado obrigatório</span><h3>O que aconteceu nesta tentativa?</h3></div><StatusPill tone={currentDefinition.tone === 'neutral' ? 'neutral' : currentDefinition.tone}>{currentDefinition.label}</StatusPill></div><div className="call-outcome-grid">{CALL_OUTCOMES.map((item) => <button key={item.value} type="button" className={outcome === item.value ? 'is-active' : ''} onClick={() => selectOutcome(item.value)}>{item.label}</button>)}</div></section>

          <section className="call-notes-grid">
            <label className="field"><span>Anotações da conversa</span><textarea rows={6} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Dor identificada, objeção, interesse, decisor e compromisso assumido" /></label>
            <label className="field"><span>Transcrição</span><textarea rows={6} value={`${transcript}${interim ? ` ${interim}` : ''}`} onChange={(event) => { setTranscript(event.target.value); setInterim('') }} placeholder="Texto confirmado e provisório da conversa" /></label>
          </section>

          <section className="call-next-step"><label className="consent-check"><input type="checkbox" checked={scheduleNext} onChange={(event) => setScheduleNext(event.target.checked)} disabled={Boolean(currentDefinition.closesLead)} /><span>{outcome === 'meeting_scheduled' ? 'Criar compromisso na Agenda' : 'Criar próxima ligação no Follow-up'}</span></label><label className="field"><span>Data e horário</span><input type="datetime-local" value={nextAt} onChange={(event) => setNextAt(event.target.value)} disabled={!scheduleNext || Boolean(currentDefinition.closesLead)} /></label><div className="call-next-step__summary"><CalendarPlus size={18} /><div><strong>{currentDefinition.closesLead ? `Lead será marcado como ${currentDefinition.closesLead === 'won' ? 'ganho' : 'perdido'}` : scheduleNext && nextAt ? `Próximo passo em ${formatDateTime(new Date(nextAt).toISOString())}` : 'Sem próximo passo automático'}</strong><span>O Pipeline, a Agenda e o Follow-up serão atualizados ao salvar.</span></div></div></section>
        </main>

        <aside className="call-focus-column call-focus-guidance">
          <section className="call-script call-script--focus"><div className="call-script__heading"><span className="eyebrow">Roteiro da ligação</span><select aria-label="Playbook da ligação" value={playbookId} onChange={(event) => setPlaybookId(event.target.value)}><option value="">Sem roteiro</option>{snapshot?.playbooks.filter((item) => item.kind === 'script' && item.active).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div><div className="call-script__content">{renderedPlaybook || 'Selecione um roteiro em Playbooks para apoiar esta conversa.'}</div><small>Adapte o texto ao contexto real do lead; não leia de forma mecânica.</small></section>
          <section className="call-focus-panel"><div className="call-panel-title"><div><span className="eyebrow">Respostas rápidas</span><h3>Objeções</h3></div><Clipboard size={19} /></div><div className="call-objections">{objectionPlaybooks.slice(0, 6).map((item) => <button type="button" key={item.id} onClick={() => insertObjection(item.content)}><strong>{item.title}</strong><span>{item.content}</span></button>)}{!objectionPlaybooks.length ? <p className="activity-empty">Cadastre objeções em Playbooks.</p> : null}</div></section>
          <section className="call-focus-panel call-shortcuts"><span className="eyebrow">Atalhos da rotina</span><div><span><kbd>Ctrl</kbd> + <kbd>Enter</kbd></span><small>Salvar ligação</small></div><div><span><kbd>Espaço</kbd></span><small>Pausar ou retomar timer</small></div><div><span><kbd>Alt</kbd> + <kbd>→</kbd></span><small>Próximo lead</small></div></section>
        </aside>
      </div>
    </div>
  </Modal>
}
