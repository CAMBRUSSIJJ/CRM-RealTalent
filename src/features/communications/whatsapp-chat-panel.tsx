import { NativeSelectionSelect } from '../../components/selection'
import { AlertCircle, Check, CheckCheck, Clock3, FileText, Image as ImageIcon, Info, Mic, MessageCircle, Paperclip, Pause, Play, RefreshCw, Reply, RotateCcw, Send, ShieldCheck, Square, UsersRound, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { Lead } from '../../domain/types'
import { formatDateTime } from '../../domain/formatters'
import { connectedAccountLabel, loadCommunicationChannelState, type ConversationStatus, type UnifiedCommunicationItem } from '../../services/communication-workspace'
import type { ConnectedAccount } from '../../services/integration-framework'
import type { RealtimeTransportState } from '../../platform/events/realtime-status'
import { normalizeWhatsAppPhone, sendOfficialWhatsApp } from '../../services/whatsapp-workspace'
import { loadGatewayWhatsAppGroupInfo, retryGatewayCommunication, type GatewayWhatsAppAttachmentInput, type GatewayWhatsAppGroupInfo } from '../../services/local-communications-gateway'
import { WhatsAppConnectionCenter } from './whatsapp-connection-center'

const sameDay = (left: string, right: string) => {
  const a = new Date(left); const b = new Date(right)
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
const dayLabel = (iso: string) => {
  const date = new Date(iso); const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  if (sameDay(iso, today.toISOString())) return 'Hoje'
  if (sameDay(iso, yesterday.toISOString())) return 'Ontem'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' }).format(date)
}
const timeLabel = (iso: string) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const clientMessageKey = () => `crm-whatsapp:${Date.now()}:${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`
const MAX_MEDIA_BYTES = 8 * 1024 * 1024

const looksLikeEncodedMediaText = (value: unknown) => {
  const text = String(value || '').trim()
  if (!text) return false
  if (/^data:[^;]{1,120};base64,/i.test(text)) return true
  return text.length >= 512 && !/\s/.test(text.slice(0, 512)) && /^[A-Za-z0-9+/=_-]+$/.test(text.slice(0, Math.min(text.length, 4096)))
}
const safeMessageText = (value: unknown) => looksLikeEncodedMediaText(value) ? '' : String(value || '').trim()
const formatDuration = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`

type ComposerAttachment = GatewayWhatsAppAttachmentInput & { previewUrl: string }
type PendingMessage = { id: string; idempotencyKey: string; body: string; occurredAt: string; status: 'queued' | 'failed'; attachment?: ComposerAttachment | null; replyToExternalMessageId?: string | null; replyPreview?: string | null }

function MessageStatus({ status }: { status: UnifiedCommunicationItem['status'] }) {
  if (status === 'read') return <span className="whatsapp-chat__ticks is-read" title="Lida"><CheckCheck size={14}/></span>
  if (status === 'delivered') return <span className="whatsapp-chat__ticks" title="Entregue"><CheckCheck size={14}/></span>
  if (status === 'sent') return <span className="whatsapp-chat__ticks" title="Enviada"><Check size={14}/></span>
  if (status === 'queued') return <span className="whatsapp-chat__ticks" title="Na fila"><Clock3 size={13}/></span>
  if (status === 'failed') return <span className="whatsapp-chat__ticks is-failed" title="Falhou"><AlertCircle size={13}/></span>
  return null
}

function VoicePlayer({ src, label = 'Mensagem de voz' }: { src: string; label?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [rate, setRate] = useState(1)
  const ratio = duration > 0 ? Math.min(1, current / duration) : 0
  useEffect(() => { setPlaying(false); setCurrent(0); setDuration(0); setRate(1) }, [src])
  const toggle = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) { try { await audio.play() } catch {} } else audio.pause()
  }
  const cycleRate = () => {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1
    setRate(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }
  return <div className="whatsapp-voice-player">
    <audio ref={audioRef} src={src} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setCurrent(0) }} onLoadedMetadata={(event) => setDuration(Number(event.currentTarget.duration || 0))} onTimeUpdate={(event) => setCurrent(Number(event.currentTarget.currentTime || 0))}/>
    <button type="button" className="whatsapp-voice-player__play" onClick={() => void toggle()} aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}>{playing ? <Pause size={16}/> : <Play size={16}/>}</button>
    <div className="whatsapp-voice-player__main">
      <div className="whatsapp-voice-player__wave" aria-hidden="true">{Array.from({ length: 28 }, (_, index) => <i key={index} className={index / 28 <= ratio ? 'is-active' : ''} style={{ height: `${7 + ((index * 13) % 15)}px` }}/>)}</div>
      <input aria-label="Posição do áudio" type="range" min={0} max={Math.max(1, duration)} step={0.05} value={Math.min(current, Math.max(1, duration))} onChange={(event) => { const next = Number(event.target.value); setCurrent(next); if (audioRef.current) audioRef.current.currentTime = next }}/>
      <div className="whatsapp-voice-player__meta"><span>{label}</span><time>{formatDuration(current || duration)}</time></div>
    </div>
    <button type="button" className="whatsapp-voice-player__rate" onClick={cycleRate} aria-label={`Velocidade ${rate} vezes`}>{rate}x</button>
  </div>
}

const fileKind = (file: File): GatewayWhatsAppAttachmentInput['kind'] => file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'document'
const readFile = (file: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo.')); reader.readAsDataURL(file) })
const attachmentFromMetadata = (item: UnifiedCommunicationItem) => { const raw = item.metadata?.attachment; return raw && typeof raw === 'object' ? raw as Record<string, unknown> : null }

export function WhatsAppChatPanel({ lead, externalIdentity, workspaceId, events, countryCode, preferredAccountId, syncing = false, realtimeState = 'connecting', readOnly = false, workToolbar, onSync, onManageContact, onOpenLeadContext, onSent, onError }: { lead: Lead | null; externalIdentity?: { name: string; phone: string; company?: string | null; isGroup?: boolean; threadId?: string | null }; workspaceId: string; conversationKey: string; conversationStatus: ConversationStatus; lastOccurredAt?: string | null; events: UnifiedCommunicationItem[]; countryCode: string; preferredAccountId?: string; syncing?: boolean; realtimeState?: RealtimeTransportState; readOnly?: boolean; workToolbar?: ReactNode; onSync(): void; onManageContact?(): void; onOpenLeadContext?(): void; onSalesStateChanged?(): void; onSent(message: string): void; onError(message: string): void }) {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [accountId, setAccountId] = useState('')
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([])
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null)
  const [replyingTo, setReplyingTo] = useState<UnifiedCommunicationItem | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [connectionOpen, setConnectionOpen] = useState(false)
  const [groupInfoOpen, setGroupInfoOpen] = useState(false)
  const [groupInfoLoading, setGroupInfoLoading] = useState(false)
  const [groupInfo, setGroupInfo] = useState<GatewayWhatsAppGroupInfo | null>(null)
  const sendLockRef = useRef(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recorderStreamRef = useRef<MediaStream | null>(null)
  const recorderChunksRef = useRef<Blob[]>([])
  const recorderCancelledRef = useRef(false)
  const recordingTimerRef = useRef<number | null>(null)

  const messages = useMemo(() => events.filter(item => item.channel === 'whatsapp').slice().sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)), [events])
  const identityName = lead?.name || externalIdentity?.name || 'WhatsApp'
  const identityCompany = lead?.company || externalIdentity?.company || (externalIdentity?.isGroup ? 'Grupo do WhatsApp' : 'Conversa do WhatsApp')
  const rawPhone = externalIdentity?.phone || lead?.phone || ''
  const recipient = normalizeWhatsAppPhone(rawPhone, countryCode)
  const groupThreadId = externalIdentity?.isGroup && externalIdentity.threadId?.endsWith('@g.us') ? externalIdentity.threadId : ''
  const blocked = Boolean(lead?.doNotContact)
  const account = useMemo(() => accounts.find(item => item.id === accountId) ?? null, [accountId, accounts])
  const connected = account?.status === 'connected'
  const groupTransportReady = !externalIdentity?.isGroup || account?.metadata?.transport === 'qr'
  const hasPayload = Boolean(safeMessageText(body) || attachment)
  const canSend = Boolean(!readOnly && account && (recipient || groupThreadId) && hasPayload && !blocked && !sending && !recording && groupTransportReady)
  const deliveredKeys = useMemo(() => new Set(messages.map(item => String(item.metadata?.idempotencyKey || '')).filter(Boolean)), [messages])
  const optimisticItems = useMemo(() => pendingMessages.filter(item => !deliveredKeys.has(item.idempotencyKey)).map(item => ({ id: `optimistic:${item.id}`, source: 'official' as const, leadId: lead?.id ?? null, contactId: lead?.primaryContactId ?? null, channel: 'whatsapp' as const, direction: 'outbound' as const, status: item.status, title: identityName, body: item.body || (`[${item.attachment?.kind === 'voice' ? 'Áudio' : item.attachment?.kind === 'image' ? 'Imagem' : 'Arquivo'}]`), subject: '', occurredAt: item.occurredAt, official: false, metadata: { idempotencyKey: item.idempotencyKey, optimistic: true, attachment: item.attachment ? { ...item.attachment, url: item.attachment.previewUrl } : null, replyToExternalMessageId: item.replyToExternalMessageId || null, replyPreview: item.replyPreview || null } })), [deliveredKeys, identityName, lead?.id, lead?.primaryContactId, pendingMessages])
  const displayMessages = useMemo(() => [...messages, ...optimisticItems].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)), [messages, optimisticItems])
  const externalIndex = useMemo(() => new Map(displayMessages.map(item => [String(item.metadata?.externalMessageId || ''), item]).filter(([key]) => Boolean(key))), [displayMessages])

  const loadAccounts = async () => {
    setLoadingAccounts(true)
    try {
      const state = await loadCommunicationChannelState(workspaceId)
      const next = state.whatsappAccounts
      setAccounts(next)
      const preferred = preferredAccountId ? next.find(item => item.id === preferredAccountId) : null
      setAccountId(current => next.some(item => item.id === current) ? current : preferred?.id ?? next[0]?.id ?? '')
    } catch (error) {
      setAccounts([]); setAccountId(''); onError(error instanceof Error ? error.message : 'Não foi possível carregar a conta do WhatsApp.')
    } finally { setLoadingAccounts(false) }
  }

  useEffect(() => { void loadAccounts() }, [workspaceId, preferredAccountId])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [displayMessages.length, lead?.id, externalIdentity?.phone])
  useEffect(() => { textareaRef.current?.focus() }, [lead?.id, externalIdentity?.phone, externalIdentity?.threadId])
  useEffect(() => { if (deliveredKeys.size) setPendingMessages(current => current.filter(item => !deliveredKeys.has(item.idempotencyKey))) }, [deliveredKeys])
  useEffect(() => () => {
    recorderStreamRef.current?.getTracks().forEach(track => track.stop())
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current)
  }, [])

  const chooseFile = async (file?: File | null) => {
    if (!file) return
    if (file.size > MAX_MEDIA_BYTES) { onError('O arquivo excede o limite de 8 MB desta versão.'); return }
    try {
      const url = await readFile(file)
      setAttachment({ dataBase64: url.split(',')[1] || '', mimeType: file.type || 'application/octet-stream', fileName: file.name || 'arquivo', size: file.size, kind: fileKind(file), previewUrl: url })
    } catch (error) { onError(error instanceof Error ? error.message : 'Não foi possível ler o arquivo.') }
  }

  const stopRecording = (discard = false) => {
    recorderCancelledRef.current = discard
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    else {
      setRecording(false); setRecordingSeconds(0)
      recorderStreamRef.current?.getTracks().forEach(track => track.stop())
    }
  }

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { onError('Gravação de voz não está disponível neste navegador.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recorderStreamRef.current = stream
      recorderChunksRef.current = []
      recorderCancelledRef.current = false
      setAttachment(null)
      const preferredMime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find(type => typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(type))
      const recorder = preferredMime ? new MediaRecorder(stream, { mimeType: preferredMime }) : new MediaRecorder(stream)
      recorderRef.current = recorder
      recorder.ondataavailable = event => { if (event.data.size) recorderChunksRef.current.push(event.data) }
      recorder.onstop = async () => {
        if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
        setRecording(false)
        setRecordingSeconds(0)
        stream.getTracks().forEach(track => track.stop())
        if (recorderCancelledRef.current) { recorderChunksRef.current = []; return }
        const blob = new Blob(recorderChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (!blob.size) { onError('A gravação ficou vazia. Tente novamente.'); return }
        if (blob.size > MAX_MEDIA_BYTES) { onError('A gravação excedeu 8 MB.'); return }
        const url = await readFile(blob)
        const ext = blob.type.includes('ogg') ? 'ogg' : 'webm'
        setAttachment({ dataBase64: url.split(',')[1] || '', mimeType: blob.type || 'audio/webm', fileName: `voz-${Date.now()}.${ext}`, size: blob.size, kind: 'voice', previewUrl: url })
      }
      recorder.start(250)
      setRecordingSeconds(0)
      recordingTimerRef.current = window.setInterval(() => setRecordingSeconds(current => current + 1), 1000)
      setRecording(true)
    } catch (error) { onError(error instanceof Error ? error.message : 'Não foi possível acessar o microfone.') }
  }

  const send = async () => {
    if (!account || !canSend || sendLockRef.current) return
    const text = safeMessageText(body)
    const selectedAttachment = attachment
    const reply = replyingTo
    const idempotencyKey = clientMessageKey()
    const optimisticId = idempotencyKey.split(':').pop() || idempotencyKey
    const replyId = String(reply?.metadata?.externalMessageId || '') || null
    const replyPreview = safeMessageText(reply?.body || reply?.subject || reply?.title || '').slice(0, 240) || null
    sendLockRef.current = true
    setSending(true); setBody(''); setAttachment(null); setReplyingTo(null)
    setPendingMessages(current => [...current, { id: optimisticId, idempotencyKey, body: text, occurredAt: new Date().toISOString(), status: 'queued', attachment: selectedAttachment, replyToExternalMessageId: replyId, replyPreview }])
    window.setTimeout(() => textareaRef.current?.focus(), 0)
    try {
      const event = await sendOfficialWhatsApp({ workspaceId, leadId: lead?.id ?? null, contactId: lead?.primaryContactId ?? null, accountId: account.id, recipient: recipient || undefined, threadId: groupThreadId || null, body: text, idempotencyKey, attachment: selectedAttachment ? { dataBase64: selectedAttachment.dataBase64, mimeType: selectedAttachment.mimeType, fileName: selectedAttachment.fileName, size: selectedAttachment.size, kind: selectedAttachment.kind } : null, replyToExternalMessageId: replyId, replyPreview })
      setPendingMessages(current => current.filter(item => item.idempotencyKey !== idempotencyKey))
      if (event.status === 'failed') { onSync(); onError(String(event.metadata?.lastSendError || 'Não foi possível enviar a mídia. Use “Tentar novamente”.')); return }
      onSent(event.status === 'queued' ? 'Mensagem guardada na fila. Será enviada quando o WhatsApp reconectar.' : 'Mensagem enviada pelo WhatsApp.')
    } catch (error) {
      setPendingMessages(current => current.map(item => item.idempotencyKey === idempotencyKey ? { ...item, status: 'failed' } : item))
      setBody(current => current.trim() ? current : text)
      if (selectedAttachment) setAttachment(selectedAttachment)
      if (reply) setReplyingTo(reply)
      onError(error instanceof Error ? error.message : 'Não foi possível enviar a mensagem do WhatsApp.')
    } finally { sendLockRef.current = false; setSending(false) }
  }

  const retry = async (item: UnifiedCommunicationItem) => {
    const eventId = String(item.metadata?.eventId || item.id.replace(/^official:/, ''))
    if (!eventId) return
    try { await retryGatewayCommunication(workspaceId, eventId); onSent('Mensagem colocada novamente na fila.'); onSync() }
    catch (error) { onError(error instanceof Error ? error.message : 'Não foi possível reenviar a mensagem.') }
  }

  const openIdentity = async () => {
    if (externalIdentity?.isGroup && groupThreadId) {
      setGroupInfoOpen(true)
      setGroupInfoLoading(true)
      try { setGroupInfo(await loadGatewayWhatsAppGroupInfo(workspaceId, groupThreadId)) }
      catch (error) { setGroupInfo(null); onError(error instanceof Error ? error.message : 'Não foi possível carregar as informações do grupo.') }
      finally { setGroupInfoLoading(false) }
      return
    }
    if (lead && onOpenLeadContext) { onOpenLeadContext(); return }
    onManageContact?.()
  }

  const placeholder = blocked ? 'Contato bloqueado pela política de comunicação.' : externalIdentity?.isGroup && !groupTransportReady ? 'Grupos exigem a conta WhatsApp por QR local.' : !account ? 'Conecte uma conta do WhatsApp para começar.' : connected ? 'Digite uma mensagem…' : 'Digite uma mensagem… ela ficará na fila até reconectar.'

  return <section className="whatsapp-chat whatsapp-native-workspace whatsapp-pure-chat whatsapp-rich-chat" data-realtime-state={realtimeState} aria-label={`Conversa WhatsApp com ${identityName}`}>
    <header className="whatsapp-chat__header whatsapp-chat__header--pure">
      <button type="button" className="whatsapp-chat__identity whatsapp-chat__identity--static whatsapp-chat__identity--action" onClick={() => void openIdentity()} title={externalIdentity?.isGroup ? 'Informações do grupo' : lead ? 'Abrir contexto do contato' : 'Salvar ou vincular contato'}><div className="whatsapp-chat__avatar">{externalIdentity?.isGroup ? <UsersRound size={17}/> : identityName.slice(0, 2).toUpperCase()}</div><div><strong>{identityName}</strong><span>{identityCompany}{rawPhone ? ` · ${rawPhone}` : ''}</span></div><Info size={15} className="whatsapp-chat__identity-info"/></button>
      <div className="whatsapp-chat__header-actions whatsapp-chat__header-actions--pure"><button type="button" className={`whatsapp-chat__connection ${connected ? 'is-connected' : ''}`} onClick={() => setConnectionOpen(true)} disabled={loadingAccounts} title={connected ? 'WhatsApp conectado' : 'Conectar WhatsApp'}><i/>{connected ? 'Conectado' : 'Conectar'}</button><Button size="sm" variant="ghost" loading={syncing} onClick={onSync} aria-label="Sincronizar conversa" title="Sincronizar"><RefreshCw size={15}/></Button></div>
    </header>
    {workToolbar ? <div className="whatsapp-chat__work-layer">{workToolbar}</div> : null}

    {accounts.length > 1 ? <div className="whatsapp-chat__accountbar whatsapp-chat__accountbar--compact"><div><MessageCircle size={15}/><span>WhatsApp</span></div><label><span>Enviar por</span><NativeSelectionSelect value={accountId} onChange={event => setAccountId(event.target.value)}>{accounts.map(item => <option key={item.id} value={item.id}>{connectedAccountLabel(item)}</option>)}</NativeSelectionSelect></label></div> : null}

    <div className="whatsapp-chat__messages" role="log" aria-live="polite">
      {!displayMessages.length ? <div className="whatsapp-chat__empty"><MessageCircle size={38}/><strong>Nenhuma mensagem ainda</strong><p>Quando a conversa começar, as mensagens enviadas e recebidas aparecerão aqui.</p></div> : displayMessages.map((item, index) => {
        const previous = displayMessages[index - 1]
        const showDay = !previous || !sameDay(previous.occurredAt, item.occurredAt)
        const outbound = item.direction === 'outbound'
        const text = safeMessageText(item.body || item.subject || '')
        const media = attachmentFromMetadata(item)
        const mediaKind = String(media?.kind || '')
        const mediaUrl = String(media?.url || '')
        const replyId = String(item.metadata?.replyToExternalMessageId || '')
        const quoted = replyId ? externalIndex.get(replyId) : null
        const quoteText = safeMessageText(quoted?.body || item.metadata?.replyPreview || '')
        return <div className="whatsapp-chat__message-group" key={item.id}>
          {showDay ? <div className="whatsapp-chat__day"><span>{dayLabel(item.occurredAt)}</span></div> : null}
          <article data-optimistic={item.metadata?.optimistic === true ? 'true' : undefined} className={`whatsapp-chat__message ${outbound ? 'is-outbound' : item.direction === 'inbound' ? 'is-inbound' : 'is-system'}`}>
            {quoteText ? <div className="whatsapp-chat__quote"><Reply size={13}/><span>{quoteText}</span></div> : null}
            {media ? <div className={`whatsapp-chat__attachment is-${mediaKind || 'document'}`}>
              {(mediaKind === 'image' || mediaKind === 'sticker') && mediaUrl ? <img className={mediaKind === 'sticker' ? 'is-sticker' : ''} src={mediaUrl} alt={String(media.fileName || (mediaKind === 'sticker' ? 'Sticker' : 'Imagem'))}/> : null}
              {mediaKind === 'video' && mediaUrl ? <video src={mediaUrl} controls preload="metadata"/> : null}
              {(mediaKind === 'audio' || mediaKind === 'voice') && mediaUrl ? <VoicePlayer src={mediaUrl} label={mediaKind === 'voice' ? 'Mensagem de voz' : String(media.fileName || 'Áudio')}/> : null}
              {!['image', 'sticker', 'video', 'audio', 'voice'].includes(mediaKind) && mediaUrl ? <a href={mediaUrl} target="_blank" rel="noreferrer"><FileText size={18}/><span>{String(media.fileName || 'Documento')}</span><small>{media.mimeType ? String(media.mimeType) : 'Arquivo'}</small></a> : null}
              {!mediaUrl ? <span><FileText size={18}/>{String(media.fileName || '[Mídia]')}</span> : null}
            </div> : null}
            {text && !(/^\[(Imagem|Áudio|Documento|Mídia|Sticker|Vídeo)\]/.test(text) && media) ? <p>{text}</p> : null}
            <div className="whatsapp-chat__native-actions">{item.metadata?.externalMessageId ? <button type="button" onClick={() => setReplyingTo(item)} title="Responder"><Reply size={13}/></button> : null}{outbound && item.status === 'failed' ? <button type="button" onClick={() => void retry(item)} title="Tentar novamente"><RotateCcw size={13}/></button> : null}</div>
            <footer><time title={formatDateTime(item.occurredAt)}>{timeLabel(item.occurredAt)}</time>{outbound ? <MessageStatus status={item.status}/> : null}</footer>
          </article>
        </div>
      })}<div ref={endRef}/>
    </div>

    <footer className="whatsapp-chat__composer whatsapp-chat__composer--pure" id="whatsapp-chat-composer">
      {replyingTo ? <div className="whatsapp-chat__reply-composer"><Reply size={14}/><div><small>Respondendo</small><span>{safeMessageText(replyingTo.body || replyingTo.title || 'Mensagem').slice(0, 160)}</span></div><button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancelar resposta"><X size={15}/></button></div> : null}
      {recording ? <div className="whatsapp-chat__recording"><span className="whatsapp-chat__recording-dot"/><strong>{formatDuration(recordingSeconds)}</strong><span>Gravando mensagem de voz</span><button type="button" onClick={() => stopRecording(true)}>Cancelar</button><button type="button" className="is-stop" onClick={() => stopRecording(false)}><Square size={14}/> Parar</button></div> : null}
      {attachment ? <div className="whatsapp-chat__attachment-preview">{attachment.kind === 'image' ? <img src={attachment.previewUrl} alt={attachment.fileName}/> : attachment.kind === 'voice' || attachment.kind === 'audio' ? <VoicePlayer src={attachment.previewUrl} label={attachment.kind === 'voice' ? 'Mensagem de voz pronta para enviar' : attachment.fileName}/> : <div>{attachment.kind === 'document' ? <FileText size={19}/> : <ImageIcon size={19}/>}<span>{attachment.fileName}</span></div>}<small>{Math.max(1, Math.round(attachment.size / 1024))} KB</small><button type="button" onClick={() => setAttachment(null)} aria-label="Remover anexo"><X size={16}/></button></div> : null}
      <div className="whatsapp-chat__compose-row whatsapp-chat__compose-row--pure whatsapp-chat__compose-row--rich">
        <input ref={fileInputRef} className="whatsapp-chat__file-input" type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" onChange={event => { void chooseFile(event.target.files?.[0]); event.currentTarget.value = '' }}/>
        <button type="button" className="whatsapp-chat__tool" onClick={() => fileInputRef.current?.click()} disabled={readOnly || !account || blocked || recording} title="Anexar arquivo"><Paperclip size={18}/></button>
        <button type="button" className={`whatsapp-chat__tool ${recording ? 'is-recording' : ''}`} onClick={() => recording ? stopRecording(false) : void startRecording()} disabled={readOnly || !account || blocked} title={recording ? 'Parar gravação' : 'Gravar áudio'}>{recording ? <Square size={17}/> : <Mic size={18}/>}</button>
        <textarea ref={textareaRef} rows={1} value={body} onChange={event => setBody(event.target.value)} onPaste={event => { const file = Array.from(event.clipboardData.files || [])[0]; if (file) { event.preventDefault(); void chooseFile(file) } }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} placeholder={recording ? 'Finalize a gravação antes de enviar…' : placeholder} disabled={readOnly || !account || blocked || !groupTransportReady || recording}/>
        <Button aria-label="Enviar mensagem" title={connected ? 'Enviar (Enter)' : 'Adicionar à fila (Enter)'} loading={sending} disabled={!canSend} onClick={() => void send()}><Send size={18}/><span>Enviar</span></Button>
      </div>
      {!connected && account ? <div className="whatsapp-chat__queue-hint"><Clock3 size={13}/><span>Offline: novas mensagens ficam na fila e saem automaticamente quando a conexão voltar.</span></div> : null}
    </footer>
    <WhatsAppConnectionCenter open={connectionOpen} workspaceId={workspaceId} onClose={() => setConnectionOpen(false)} onChanged={() => { void loadAccounts(); onSync() }} onError={onError}/>
    <Modal open={groupInfoOpen} title={groupInfo?.name || identityName} subtitle={groupInfoLoading ? 'Carregando informações do grupo…' : groupInfo ? `${groupInfo.participantCount} participante(s)` : 'Informações do grupo do WhatsApp'} onClose={() => setGroupInfoOpen(false)} footer={<><span className="modal__footer-spacer"/><Button variant="secondary" onClick={() => setGroupInfoOpen(false)}>Fechar</Button></>}>
      <div className="whatsapp-group-info">
        {groupInfoLoading ? <div className="whatsapp-group-info__empty"><RefreshCw size={18} className="is-spinning"/> Carregando…</div> : groupInfo ? <>
          {groupInfo.description ? <section><small>Descrição</small><p>{groupInfo.description}</p></section> : null}
          <section><div className="whatsapp-group-info__section-title"><span>Participantes</span><strong>{groupInfo.participantCount}</strong></div><div className="whatsapp-group-info__participants">{groupInfo.participants.map(participant => <div key={participant.id}><div className="whatsapp-group-info__participant-avatar">{participant.phone.slice(-2)}</div><div><strong>+{participant.phone}</strong><span>{participant.isSuperAdmin ? 'Criador do grupo' : participant.isAdmin ? 'Administrador' : 'Participante'}</span></div>{participant.isAdmin || participant.isSuperAdmin ? <ShieldCheck size={16}/> : null}</div>)}</div></section>
        </> : <div className="whatsapp-group-info__empty">Não foi possível carregar os dados do grupo agora.</div>}
      </div>
    </Modal>
  </section>
}
