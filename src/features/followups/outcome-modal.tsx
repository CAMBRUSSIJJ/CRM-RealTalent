import { ArrowRight, CheckCircle2, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { ActivityItem, ActivityType } from '../../domain/types'
import { appendFollowupMetadata, channelLabel, outcomeLabel, readFollowupMetadata, type FollowupChannel, type FollowupOutcome } from '../../services/followup-workspace'

const toLocalInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

const defaults: Record<FollowupOutcome, { days: number | null; channel: FollowupChannel; title: string }> = {
  answered: { days: 1, channel: 'whatsapp', title: 'Dar continuidade ao contato' },
  no_response: { days: 2, channel: 'whatsapp', title: 'Nova tentativa de contato' },
  callback_requested: { days: 1, channel: 'call', title: 'Retorno solicitado pelo lead' },
  interested: { days: 1, channel: 'call', title: 'Avançar diagnóstico comercial' },
  proposal_requested: { days: 2, channel: 'whatsapp', title: 'Retomar proposta enviada' },
  meeting_scheduled: { days: 1, channel: 'meeting', title: 'Confirmar reunião agendada' },
  not_decision_maker: { days: 1, channel: 'call', title: 'Buscar contato do decisor' },
  invalid_contact: { days: null, channel: 'task', title: '' },
  not_interested: { days: null, channel: 'task', title: '' },
  won: { days: null, channel: 'task', title: '' },
  lost: { days: null, channel: 'task', title: '' },
}

const channelActivityType = (channel: FollowupChannel): ActivityType => channel === 'call' ? 'call' : channel === 'meeting' ? 'meeting' : 'followup'

interface Props {
  activity: ActivityItem | null
  onClose(): void
  onFinished?(): void
}

export function OutcomeModal({ activity, onClose, onFinished }: Props) {
  const { snapshot, registerActivityOutcome, notify } = useApp()
  const [outcome, setOutcome] = useState<FollowupOutcome>('answered')
  const [note, setNote] = useState('')
  const [createNext, setCreateNext] = useState(true)
  const [nextAt, setNextAt] = useState('')
  const [nextTitle, setNextTitle] = useState('')
  const [nextChannel, setNextChannel] = useState<FollowupChannel>('whatsapp')
  const [stageId, setStageId] = useState('')
  const [busy, setBusy] = useState(false)
  const lead = useMemo(() => snapshot?.leads.find((item) => item.id === activity?.leadId) ?? null, [activity, snapshot])

  useEffect(() => {
    if (!activity) return
    setOutcome('answered'); setNote(''); setStageId('')
    const config = defaults.answered
    const due = new Date(); due.setDate(due.getDate() + (config.days ?? 1)); due.setHours(10, 0, 0, 0)
    setCreateNext(config.days !== null); setNextAt(toLocalInput(due)); setNextTitle(config.title); setNextChannel(config.channel)
  }, [activity])

  const changeOutcome = (value: FollowupOutcome) => {
    setOutcome(value)
    const config = defaults[value]
    setCreateNext(config.days !== null)
    setNextChannel(config.channel)
    setNextTitle(config.title)
    if (config.days !== null) {
      const due = new Date(); due.setDate(due.getDate() + config.days); due.setHours(10, 0, 0, 0)
      setNextAt(toLocalInput(due))
    } else setNextAt('')
    if (value === 'proposal_requested') setStageId(snapshot?.stages.find((stage) => stage.name.toLowerCase().includes('proposta'))?.id ?? '')
    else if (value === 'won') setStageId(snapshot?.stages.find((stage) => stage.isWon)?.id ?? '')
    else if (value === 'lost') setStageId(snapshot?.stages.find((stage) => stage.isLost)?.id ?? '')
    else setStageId('')
  }

  const submit = async () => {
    if (!activity) return
    if (createNext && !nextAt) { notify('error', 'Informe quando será o próximo contato.'); return }
    setBusy(true)
    try {
      const recordedAt = new Date().toISOString()
      const resultDescription = appendFollowupMetadata(note.trim() || `Resultado registrado a partir de ${activity.title}.`, {
        version: 1, kind: 'result', outcome, outcomeLabel: outcomeLabel[outcome], resultNote: note.trim(), recordedAt,
      })
      const previousMeta = readFollowupMetadata(activity)
      const nextDescription = createNext ? appendFollowupMetadata(`Próxima ação criada após o resultado “${outcomeLabel[outcome]}”.`, {
        version: 1, kind: 'cadence-step', cadenceId: previousMeta?.cadenceId, cadenceName: previousMeta?.cadenceName ?? 'Próximos passos',
        cadenceCategory: previousMeta?.cadenceCategory ?? 'Acompanhamento', channel: nextChannel, objective: nextTitle.trim(), script: '',
      }) : null
      await registerActivityOutcome({
        activityId: activity.id,
        outcome,
        resultTitle: `Resultado: ${outcomeLabel[outcome]}`,
        resultDescription,
        createNext,
        nextType: createNext ? channelActivityType(nextChannel) : null,
        nextTitle: createNext ? (nextTitle.trim() || 'Próximo contato') : null,
        nextDescription,
        nextAt: createNext && nextAt ? new Date(nextAt).toISOString() : null,
        stageId: stageId || null,
      })
      onClose(); onFinished?.()
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível registrar o resultado.') }
    finally { setBusy(false) }
  }

  return <Modal open={Boolean(activity)} onClose={onClose} title="Registrar resultado" subtitle={lead ? `${lead.name} · ${activity?.title}` : activity?.title} size="md" footer={<><span className="modal__footer-spacer" /><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={() => void submit()}><Save size={16} /> Salvar resultado</Button></>}>
    <div className="outcome-form">
      <section><span className="eyebrow">Resultado do contato</span><div className="outcome-grid">{(Object.keys(outcomeLabel) as FollowupOutcome[]).map((item) => <button type="button" key={item} className={outcome === item ? 'is-active' : ''} onClick={() => changeOutcome(item)}><CheckCircle2 size={16} /><span>{outcomeLabel[item]}</span></button>)}</div></section>
      <label className="field"><span>Observações do contato</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="O que aconteceu, quais objeções surgiram e o que foi combinado?" /></label>
      <label className="outcome-next-toggle"><input type="checkbox" checked={createNext} onChange={(event) => setCreateNext(event.target.checked)} /><span><strong>Programar o próximo passo</strong><small>Evita que o lead fique sem uma atividade futura.</small></span></label>
      {createNext ? <section className="outcome-next-card">
        <div className="outcome-next-card__heading"><ArrowRight size={18} /><strong>Próxima ação</strong></div>
        <div className="form-grid">
          <label className="field"><span>Canal</span><select value={nextChannel} onChange={(event) => setNextChannel(event.target.value as FollowupChannel)}>{Object.entries(channelLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>Data e horário</span><input type="datetime-local" value={nextAt} onChange={(event) => setNextAt(event.target.value)} /></label>
          <label className="field field--span-2"><span>Título da próxima ação</span><input value={nextTitle} onChange={(event) => setNextTitle(event.target.value)} /></label>
        </div>
      </section> : null}
      <label className="field"><span>Mover no Pipeline após salvar</span><select value={stageId} onChange={(event) => setStageId(event.target.value)}><option value="">Manter etapa atual</option>{snapshot?.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
    </div>
  </Modal>
}
