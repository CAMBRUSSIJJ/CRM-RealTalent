import { ArrowUpRight, CalendarClock, FileText, History, LoaderCircle, PhoneCall, Sparkles, Timer, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CallRecord, Lead } from '../../domain/types'
import { formatDateTime } from '../../domain/formatters'
import { outcomeDefinition, outcomeLabel } from '../../services/call-workspace'
import type { CallCoachingReview } from '../../services/coaching-engine'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { StatusPill } from '../../components/ui/status-pill'

const formatDuration = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}m ${String(Math.max(0, seconds) % 60).padStart(2, '0')}s`

export function CallHistoryDetailModal({ open, call, lead, review, canWrite, onClose, onOpenLead, onCallAgain, onDelete, resolveRecordingUrl }: {
  open: boolean
  call: CallRecord | null
  lead: Lead | null
  review: CallCoachingReview | null
  canWrite: boolean
  onClose(): void
  onOpenLead(): void
  onCallAgain(): void
  onDelete(): void
  resolveRecordingUrl(callId: string): Promise<string | null>
}) {
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null)
  const [recordingLoading, setRecordingLoading] = useState(false)
  const [recordingError, setRecordingError] = useState<string | null>(null)
  useEffect(() => {
    setRecordingUrl(call?.recordingUrl ?? null)
    setRecordingError(null)
    setRecordingLoading(false)
  }, [call?.id, call?.recordingUrl, open])
  if (!call) return null
  const loadRecording = async () => {
    if (!call.recordingPath || recordingLoading) return
    setRecordingLoading(true); setRecordingError(null)
    try {
      const url = await resolveRecordingUrl(call.id)
      if (!url) setRecordingError('A gravação não está mais disponível.')
      setRecordingUrl(url)
    } catch (error) { setRecordingError(error instanceof Error ? error.message : 'Não foi possível carregar a gravação.') }
    finally { setRecordingLoading(false) }
  }
  const definition = outcomeDefinition(call.outcome)
  return <Modal
    open={open}
    onClose={onClose}
    title="Detalhes da ligação"
    subtitle={`${lead?.company || lead?.name || 'Lead removido'} · ${formatDateTime(call.startedAt)}`}
    size="lg"
    footer={<><Button variant="ghost" onClick={onClose}>Fechar</Button><span className="modal__footer-spacer" /><Button variant="secondary" onClick={onOpenLead}><ArrowUpRight size={16} /> Abrir Lead</Button>{canWrite ? <Button onClick={onCallAgain}><PhoneCall size={16} /> Nova ligação</Button> : null}</>}
  >
    <div className="call-history-detail">
      <section className="call-history-detail__hero">
        <div className="call-history-detail__identity"><span className="lead-cell__avatar">{(lead?.name || 'LR').slice(0, 2).toUpperCase()}</span><div><span className="eyebrow">Contato</span><h3>{lead?.name ?? 'Lead removido'}</h3><p>{lead?.company || 'Empresa não informada'}</p></div></div>
        <div className="call-history-detail__result"><StatusPill tone={definition.tone === 'neutral' ? 'info' : definition.tone}>{outcomeLabel(call.outcome)}</StatusPill>{review ? <span className={`call-coaching-score call-coaching-score--${review.grade}`}><Sparkles size={14} /> {review.score}/100</span> : null}</div>
      </section>

      <div className="call-history-detail__kpis">
        <article><Timer size={17} /><span><small>Duração</small><strong>{formatDuration(call.durationSeconds)}</strong></span></article>
        <article><CalendarClock size={17} /><span><small>Início</small><strong>{formatDateTime(call.startedAt)}</strong></span></article>
        <article><History size={17} /><span><small>Encerramento</small><strong>{call.endedAt ? formatDateTime(call.endedAt) : 'Não informado'}</strong></span></article>
      </div>

      <section className="call-history-detail__section"><div className="call-history-detail__section-title"><FileText size={17} /><div><span className="eyebrow">Registro</span><h3>Anotações</h3></div></div><p>{call.notes || 'Nenhuma anotação registrada nesta ligação.'}</p></section>

      {call.transcript ? <section className="call-history-detail__section"><div className="call-history-detail__section-title"><FileText size={17} /><div><span className="eyebrow">Conversa</span><h3>Transcrição</h3></div></div><div className="call-history-detail__transcript">{call.transcript}</div></section> : null}

      {review ? <section className="call-history-detail__section"><div className="call-history-detail__section-title"><Sparkles size={17} /><div><span className="eyebrow">Coaching</span><h3>Qualidade da execução</h3></div></div><div className="call-coaching-dimensions">{review.dimensions.map((item) => <div key={item.id}><span><strong>{item.label}</strong><small>{item.evidence}</small></span><b>{item.score}</b></div>)}</div>{review.improvements.length ? <div className="call-coaching-improvements"><strong>Próximas melhorias</strong>{review.improvements.slice(0, 4).map((item) => <p key={item}>{item}</p>)}</div> : null}</section> : null}

      {call.recordingPath ? <section className="call-history-detail__section"><div className="call-history-detail__section-title"><PhoneCall size={17} /><div><span className="eyebrow">Áudio</span><h3>Gravação</h3></div></div>{recordingUrl ? <audio src={recordingUrl} controls preload="none" /> : <div className="call-recording-lazy"><Button variant="secondary" size="sm" disabled={recordingLoading} onClick={() => void loadRecording()}>{recordingLoading ? <LoaderCircle size={15} className="spin" /> : <PhoneCall size={15} />} {recordingLoading ? 'Carregando…' : 'Carregar gravação'}</Button>{recordingError ? <small role="alert">{recordingError}</small> : <small>O áudio é carregado somente quando solicitado.</small>}</div>}</section> : null}

      {canWrite ? <div className="call-history-detail__danger"><Button variant="danger" size="sm" onClick={onDelete}><Trash2 size={15} /> Excluir esta ligação</Button></div> : null}
    </div>
  </Modal>
}
