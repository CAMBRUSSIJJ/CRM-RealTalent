import '../../styles/buyer-room-v10066.css'
import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Check, CheckCircle2, FileText, LoaderCircle, LockKeyhole, MessageSquareText, Send, UsersRound } from 'lucide-react'
import { formatCurrency } from '../../domain/formatters'
import type { BuyerRoomPublicPayload } from '../../services/buyer-room-public'
import { addBuyerRoomPublicComment, loadBuyerRoomPublic, trackBuyerRoomPublicDocument, updateBuyerRoomPublicStep } from '../../services/buyer-room-public'

const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value)) : 'Sem prazo'
const ownerLabel = { seller: 'RealTalent', buyer: 'Comprador', shared: 'Em conjunto' } as const

export function BuyerRoomPublicPage({ token }: { token: string }) {
  const [room, setRoom] = useState<BuyerRoomPublicPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actorName, setActorName] = useState('')
  const [savingStep, setSavingStep] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [sendingComment, setSendingComment] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true); setError(null)
    void loadBuyerRoomPublic(token, true).then((data) => { if (active) setRoom(data) }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível abrir este espaço.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])

  const progress = useMemo(() => {
    if (!room?.steps.length) return 0
    return Math.round(room.steps.filter((step) => step.status === 'completed').length / room.steps.length * 100)
  }, [room])

  const toggleStep = async (stepId: string, completed: boolean) => {
    setSavingStep(stepId); setError(null)
    try {
      const next = await updateBuyerRoomPublicStep(token, stepId, completed, actorName || 'Comprador')
      if (next) setRoom(next)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a etapa.') }
    finally { setSavingStep(null) }
  }

  const sendComment = async () => {
    if (comment.trim().length < 2) return
    setSendingComment(true); setError(null)
    try {
      const ok = await addBuyerRoomPublicComment(token, comment, actorName || 'Comprador')
      if (ok) setComment('')
      else setError('Não foi possível enviar a observação.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a observação.') }
    finally { setSendingComment(false) }
  }

  if (loading) return <main className="buyer-room-public buyer-room-public--state"><LoaderCircle className="spin"/><h1>Abrindo espaço de fechamento</h1><p>Carregando proposta e próximos passos...</p></main>
  if (!room) return <main className="buyer-room-public buyer-room-public--state"><LockKeyhole/><h1>Link indisponível</h1><p>{error || 'Este link expirou, foi desativado ou não existe mais.'}</p></main>

  return <main className="buyer-room-public">
    <header className="buyer-room-public__top"><div className="buyer-room-brand"><span>RT</span><div><strong>RealTalent</strong><small>Espaço de fechamento</small></div></div><span className="buyer-room-secure"><LockKeyhole size={14}/> Link privado</span></header>
    <section className="buyer-room-public__hero">
      <div><span className="eyebrow">Plano compartilhado</span><h1>{room.title}</h1><p>{room.welcomeMessage}</p><div className="buyer-room-public__customer">Preparado para <strong>{room.customer.company || room.customer.name}</strong></div></div>
      <div className="buyer-room-public__progress"><strong>{progress}%</strong><span>do plano concluído</span><div><i style={{ width: `${progress}%` }}/></div><small>{room.steps.filter((step) => step.status === 'completed').length} de {room.steps.length} etapas</small></div>
    </section>

    {error ? <div className="buyer-room-public__error">{error}</div> : null}

    <section className="buyer-room-public__grid">
      <article className="buyer-room-public__panel buyer-room-public__proposal"><header><FileText/><div><span className="eyebrow">Proposta</span><h2>{room.proposal.proposalNumber}</h2></div></header><h3>{room.proposal.title}</h3><div className="buyer-room-public__money"><div><small>Investimento contratual</small><strong>{formatCurrency(room.proposal.totalContractValue)}</strong></div>{room.proposal.recurringMonthlyTotal ? <div><small>Mensal recorrente</small><strong>{formatCurrency(room.proposal.recurringMonthlyTotal)}</strong></div> : null}</div><div className="buyer-room-public__proposal-meta"><span><CalendarClock size={15}/> Validade {dateLabel(room.proposal.validUntil)}</span><span className={`buyer-room-public__proposal-status is-${room.proposal.status}`}>{room.proposal.status === 'accepted' ? 'Aceita' : room.proposal.status === 'viewed' ? 'Visualizada' : room.proposal.status === 'sent' ? 'Enviada' : room.proposal.status}</span></div>{room.proposal.terms ? <details><summary>Condições comerciais</summary><p>{room.proposal.terms}</p></details> : null}</article>

      <article className="buyer-room-public__panel"><header><UsersRound/><div><span className="eyebrow">Pessoas</span><h2>Time do negócio</h2></div></header><div className="buyer-room-public__people">{room.participants.map((person) => <div key={person.id}><span>{person.name.split(/\s+/).slice(0,2).map((part) => part[0]).join('').toUpperCase()}</span><div><strong>{person.name}</strong><small>{person.jobTitle || (person.side === 'seller' ? 'Responsável comercial' : 'Stakeholder')}</small></div>{person.required ? <em>Essencial</em> : null}</div>)}</div></article>
    </section>

    <section className="buyer-room-public__panel buyer-room-public__plan"><header><CheckCircle2/><div><span className="eyebrow">Mutual Action Plan</span><h2>Próximos passos até o fechamento</h2></div><label>Seu nome <input value={actorName} onChange={(event) => setActorName(event.target.value)} placeholder="Opcional"/></label></header><div className="buyer-room-public__steps">{room.steps.map((step, index) => {
      const buyerCanChange = step.owner === 'buyer' || step.owner === 'shared'
      const done = step.status === 'completed'
      return <article key={step.id} className={`buyer-room-step is-${step.status}`}><span className="buyer-room-step__index">{done ? <Check size={15}/> : index + 1}</span><div><div className="buyer-room-step__title"><strong>{step.title}</strong><span>{ownerLabel[step.owner]}</span></div><p>{step.description}</p><small>Prazo: {dateLabel(step.dueAt)}</small></div>{buyerCanChange ? <button type="button" disabled={savingStep === step.id} onClick={() => void toggleStep(step.id, !done)}>{savingStep === step.id ? <LoaderCircle className="spin" size={15}/> : done ? 'Reabrir' : 'Marcar concluída'}</button> : <span className="buyer-room-step__locked">Responsável: RealTalent</span>}</article>
    })}</div></section>

    {room.documents.filter((item) => item.visible && item.kind !== 'proposal').length ? <section className="buyer-room-public__panel"><header><FileText/><div><span className="eyebrow">Documentos</span><h2>Materiais compartilhados</h2></div></header><div className="buyer-room-public__documents">{room.documents.filter((item) => item.visible && item.kind !== 'proposal').map((doc) => <a key={doc.id} href={doc.url} target="_blank" rel="noreferrer" onClick={() => void trackBuyerRoomPublicDocument(token, doc.id, actorName || 'Comprador')}><FileText/><span><strong>{doc.title}</strong><small>Abrir documento</small></span></a>)}</div></section> : null}

    <section className="buyer-room-public__panel buyer-room-public__comment"><header><MessageSquareText/><div><span className="eyebrow">Colaboração</span><h2>Deixar uma observação</h2></div></header><p>Use este campo para registrar uma dúvida, dependência ou retorno para o responsável comercial.</p><div><textarea rows={3} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Escreva sua observação…"/><button type="button" disabled={sendingComment || comment.trim().length < 2} onClick={() => void sendComment()}>{sendingComment ? <LoaderCircle className="spin" size={15}/> : <Send size={15}/>} Enviar observação</button></div></section>

    <footer className="buyer-room-public__footer"><strong>RealTalent</strong><span>Este espaço apresenta apenas informações compartilhadas para este negócio.</span>{room.expiresAt ? <small>Link válido até {dateLabel(room.expiresAt)}</small> : null}</footer>
  </main>
}
