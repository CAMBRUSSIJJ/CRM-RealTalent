import { NativeSelectionSelect } from '../../components/selection'
import { ArrowRight, CheckCircle2, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppActions, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { ActivityItem, ActivityType } from '../../domain/types'
import { appendFollowupMetadata, channelLabel, outcomeLabel, readFollowupMetadata, type FollowupChannel, type FollowupOutcome } from '../../services/followup-workspace'
import { decideCadenceAfterOutcome } from '../../services/sales-engagement'
import { usePreferences } from '../settings/preferences-context'

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
  onFinished?(): void | Promise<void>
  mode?: 'contact' | 'meeting'
}

export function OutcomeModal({ activity, onClose, onFinished, mode = 'contact' }: Props) {
  const { snapshot } = useAppWorkspace()
  const { notify } = useAppUi()
  const { registerActivityOutcome } = useAppActions()
  const { preferences } = usePreferences()
  const [outcome, setOutcome] = useState<FollowupOutcome>('answered')
  const [note, setNote] = useState('')
  const [createNext, setCreateNext] = useState(true)
  const [nextAt, setNextAt] = useState('')
  const [nextTitle, setNextTitle] = useState('')
  const [nextChannel, setNextChannel] = useState<FollowupChannel>('whatsapp')
  const [stageId, setStageId] = useState('')
  const [busy, setBusy] = useState(false)
  const lead = useMemo(() => snapshot?.leads.find((item) => item.id === activity?.leadId) ?? null, [activity, snapshot])

  const nextBusinessDue = (days: number) => {
    const date = new Date()
    const allowed = preferences.commercial.businessDays.length ? preferences.commercial.businessDays : [1, 2, 3, 4, 5]
    let remaining = Math.max(0, days)
    while (remaining > 0) {
      date.setDate(date.getDate() + 1)
      if (allowed.includes(date.getDay())) remaining -= 1
    }
    while (!allowed.includes(date.getDay())) date.setDate(date.getDate() + 1)
    const [hour, minute] = preferences.commercial.businessStart.split(':').map(Number)
    date.setHours(Number.isFinite(hour) ? hour : 9, Number.isFinite(minute) ? minute : 0, 0, 0)
    return date
  }

  useEffect(() => {
    if (!activity) return
    const initialOutcome: FollowupOutcome = mode === 'meeting' ? 'interested' : 'answered'
    setOutcome(initialOutcome); setNote(''); setStageId('')
    const config = defaults[initialOutcome]
    const due = nextBusinessDue(config.days ?? 1)
    setCreateNext(config.days !== null); setNextAt(toLocalInput(due)); setNextTitle(config.title); setNextChannel(config.channel)
  }, [activity, mode, preferences.commercial.businessDays, preferences.commercial.businessStart])

  const changeOutcome = (value: FollowupOutcome) => {
    setOutcome(value)
    const config = defaults[value]
    setCreateNext(config.days !== null)
    setNextChannel(config.channel)
    setNextTitle(config.title)
    if (config.days !== null) {
      setNextAt(toLocalInput(nextBusinessDue(config.days)))
    } else setNextAt('')
    if (value === 'proposal_requested') setStageId(snapshot?.stages.find((stage) => stage.name.toLowerCase().includes('proposta'))?.id ?? '')
    else if (value === 'won') setStageId(snapshot?.stages.find((stage) => stage.isWon)?.id ?? '')
    else if (value === 'lost') setStageId(snapshot?.stages.find((stage) => stage.isLost)?.id ?? '')
    else setStageId('')
  }

  const submit = async () => {
    if (!activity) return
    if (outcome === 'callback_requested' && (!createNext || !nextAt)) { notify('error', 'Quando o lead pedir retorno, informe a data e o horário combinados para pausar a cadência corretamente.'); return }
    if (createNext && !nextAt) { notify('error', 'Informe quando será o próximo contato.'); return }
    setBusy(true)
    try {
      const recordedAt = new Date().toISOString()
      const previousMeta = readFollowupMetadata(activity)
      const engagementDecision = previousMeta?.cadenceId ? decideCadenceAfterOutcome(outcome, previousMeta.policy) : null
      const resultDescription = appendFollowupMetadata(note.trim() || `${mode === 'meeting' ? 'Resultado da reunião' : 'Resultado registrado'} a partir de ${activity.title}.`, {
        version: 1, kind: 'result', cadenceId: previousMeta?.cadenceId, enrollmentId: previousMeta?.enrollmentId, cadenceName: previousMeta?.cadenceName,
        cadenceCategory: previousMeta?.cadenceCategory, policy: previousMeta?.policy, engagementAction: engagementDecision?.action,
        outcome, outcomeLabel: labelForOutcome(outcome), resultNote: note.trim(), recordedAt,
      })
      const nextDescription = createNext ? appendFollowupMetadata(`Próxima ação criada após o resultado “${labelForOutcome(outcome)}”.`, {
        version: 1, kind: 'next-action', cadenceId: previousMeta?.cadenceId, enrollmentId: previousMeta?.enrollmentId, cadenceName: previousMeta?.cadenceName ?? 'Próximos passos',
        cadenceCategory: previousMeta?.cadenceCategory ?? 'Acompanhamento', channel: nextChannel, objective: nextTitle.trim(), script: '', cadenceState: 'active',
      }) : null
      await registerActivityOutcome({
        activityId: activity.id,
        outcome,
        resultTitle: `${mode === 'meeting' ? 'Reunião' : 'Resultado'}: ${labelForOutcome(outcome)}`,
        resultDescription,
        createNext,
        nextType: createNext ? channelActivityType(nextChannel) : null,
        nextTitle: createNext ? (nextTitle.trim() || 'Próximo contato') : null,
        nextDescription,
        nextAt: createNext && nextAt ? new Date(nextAt).toISOString() : null,
        stageId: stageId || null,
      })
      if (onFinished) await onFinished()
      onClose()
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível registrar o resultado.') }
    finally { setBusy(false) }
  }


  const meetingOutcomeLabel: Partial<Record<FollowupOutcome, string>> = {
    interested: 'Qualificado / avançar', proposal_requested: 'Solicitou proposta', callback_requested: 'Precisa de follow-up',
    no_response: 'Não compareceu', meeting_scheduled: 'Reagendar reunião', not_interested: 'Sem interesse', won: 'Ganho', lost: 'Perdido',
  }
  const visibleOutcomes = mode === 'meeting'
    ? (['interested', 'proposal_requested', 'callback_requested', 'no_response', 'meeting_scheduled', 'not_interested', 'won', 'lost'] as FollowupOutcome[])
    : (Object.keys(outcomeLabel) as FollowupOutcome[])
  const labelForOutcome = (value: FollowupOutcome) => mode === 'meeting' ? (meetingOutcomeLabel[value] ?? outcomeLabel[value]) : outcomeLabel[value]
  const terminalOutcome = defaults[outcome].days === null
  const currentCadenceMeta = readFollowupMetadata(activity)
  const cadenceDecision = currentCadenceMeta?.cadenceId ? decideCadenceAfterOutcome(outcome, currentCadenceMeta.policy) : null

  return <Modal open={Boolean(activity)} onClose={onClose} title={mode === 'meeting' ? 'Resultado da reunião' : 'Registrar resultado'} subtitle={lead ? `${lead.name} · ${activity?.title}` : activity?.title} size="md" footer={<><span className="modal__footer-spacer" /><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={() => void submit()}><Save size={16} /> Salvar resultado</Button></>}>
    <div className="outcome-form">
      <section><span className="eyebrow">Resultado do contato</span><div className="outcome-grid">{visibleOutcomes.map((item) => <button type="button" key={item} className={outcome === item ? 'is-active' : ''} onClick={() => changeOutcome(item)}><CheckCircle2 size={16} /><span>{labelForOutcome(item)}</span></button>)}</div></section>
      {cadenceDecision ? <div className={`cadence-decision cadence-decision--${cadenceDecision.action}`}><strong>{cadenceDecision.action === 'continue' ? 'Cadência continua' : cadenceDecision.action === 'pause' ? 'Cadência será pausada' : 'Lead sairá da cadência'}</strong><span>{cadenceDecision.reason}</span></div> : null}
      <label className="field"><span>Observações do contato</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="O que aconteceu, quais objeções surgiram e o que foi combinado?" /></label>
      <label className={`outcome-next-toggle ${terminalOutcome ? 'is-disabled' : ''}`}><input type="checkbox" checked={createNext} disabled={terminalOutcome} onChange={(event) => setCreateNext(event.target.checked)} /><span><strong>Programar o próximo passo</strong><small>Evita que o lead fique sem uma atividade futura.</small></span></label>
      {createNext ? <section className="outcome-next-card">
        <div className="outcome-next-card__heading"><ArrowRight size={18} /><strong>Próxima ação</strong></div>
        <div className="form-grid">
          <label className="field"><span>Canal</span><NativeSelectionSelect value={nextChannel} onChange={(event) => setNextChannel(event.target.value as FollowupChannel)}>{Object.entries(channelLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelectionSelect></label>
          <label className="field"><span>Data e horário</span><input type="datetime-local" value={nextAt} onChange={(event) => setNextAt(event.target.value)} /></label>
          <label className="field field--span-2"><span>Título da próxima ação</span><input value={nextTitle} onChange={(event) => setNextTitle(event.target.value)} /></label>
        </div>
      </section> : null}
      <label className="field"><span>Mover no Pipeline após salvar</span><NativeSelectionSelect value={stageId} onChange={(event) => setStageId(event.target.value)}><option value="">Manter etapa atual</option>{snapshot?.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</NativeSelectionSelect></label>
    </div>
  </Modal>
}
