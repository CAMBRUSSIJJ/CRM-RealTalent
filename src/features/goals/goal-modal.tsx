import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Save, Target, UserRound, UsersRound } from 'lucide-react'
import { Modal } from '../../components/ui/modal'
import { Button } from '../../components/ui/button'
import type { Goal, GoalMetric, WorkspaceMember } from '../../domain/types'
import { goalMetricLabels, goalMetricUnits } from '../../services/metrics'

const dateKey = (date: Date) => {
  const copy = new Date(date); copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset())
  return copy.toISOString().slice(0, 10)
}

const boundsFor = (preset: 'day' | 'week' | 'month') => {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  if (preset === 'week') {
    const mondayOffset = start.getDay() === 0 ? -6 : 1 - start.getDay()
    start.setDate(start.getDate() + mondayOffset)
    end.setTime(start.getTime()); end.setDate(end.getDate() + 6)
  }
  if (preset === 'month') {
    start.setDate(1)
    end.setTime(start.getTime()); end.setMonth(end.getMonth() + 1); end.setDate(0)
  }
  return { start: dateKey(start), end: dateKey(end) }
}

interface GoalModalProps {
  open: boolean
  goal: Goal | null
  members: WorkspaceMember[]
  loading?: boolean
  onClose(): void
  onSubmit(input: { userId: string | null; userName: string; metric: GoalMetric; targetValue: number; periodStart: string; periodEnd: string }): Promise<void>
}

export function GoalModal({ open, goal, members, loading = false, onClose, onSubmit }: GoalModalProps) {
  const month = useMemo(() => boundsFor('month'), [open])
  const [metric, setMetric] = useState<GoalMetric>('calls')
  const [targetValue, setTargetValue] = useState('20')
  const [periodStart, setPeriodStart] = useState(month.start)
  const [periodEnd, setPeriodEnd] = useState(month.end)
  const [ownerId, setOwnerId] = useState('team')
  const [preset, setPreset] = useState<'day' | 'week' | 'month' | 'custom'>('month')

  useEffect(() => {
    if (!open) return
    setMetric(goal?.metric ?? 'calls')
    setTargetValue(String(goal?.targetValue ?? 20))
    setPeriodStart(goal?.periodStart ?? month.start)
    setPeriodEnd(goal?.periodEnd ?? month.end)
    setOwnerId(goal?.userId ?? 'team')
    setPreset(goal ? 'custom' : 'month')
  }, [goal, month.end, month.start, open])

  const applyPreset = (value: 'day' | 'week' | 'month') => {
    const bounds = boundsFor(value)
    setPreset(value); setPeriodStart(bounds.start); setPeriodEnd(bounds.end)
  }

  const submit = async () => {
    const value = Number(targetValue)
    if (!Number.isFinite(value) || value <= 0 || !periodStart || !periodEnd || periodEnd < periodStart) return
    const member = members.find((item) => item.userId === ownerId)
    await onSubmit({ userId: ownerId === 'team' ? null : ownerId, userName: member?.displayName ?? 'Equipe', metric, targetValue: value, periodStart, periodEnd })
  }

  return (
    <Modal open={open} size="lg" title={goal ? 'Editar meta comercial' : 'Nova meta comercial'} subtitle="Defina o resultado, o período e quem será responsável por alcançá-lo." onClose={onClose}
      footer={<><span className="modal__footer-spacer" /><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={loading} onClick={() => void submit()}><Save size={16} /> Salvar meta</Button></>}>
      <div className="goal-modal-layout">
        <section className="goal-modal-section">
          <header><span className="goal-modal-section__icon"><Target size={18} /></span><div><strong>Resultado esperado</strong><small>Escolha uma métrica que o CRM consiga medir automaticamente.</small></div></header>
          <div className="form-grid">
            <label className="form-field form-field--full"><span>Métrica</span><select value={metric} onChange={(event) => setMetric(event.target.value as GoalMetric)}>{Object.entries(goalMetricLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="form-field form-field--full"><span>{goalMetricUnits[metric] === 'currency' ? 'Valor da meta (R$)' : 'Quantidade da meta'}</span><input type="number" min="0.01" step={goalMetricUnits[metric] === 'currency' ? '100' : '1'} value={targetValue} onChange={(event) => setTargetValue(event.target.value)} /></label>
          </div>
        </section>

        <section className="goal-modal-section">
          <header><span className="goal-modal-section__icon"><CalendarDays size={18} /></span><div><strong>Período de acompanhamento</strong><small>O ritmo esperado e a previsão serão recalculados diariamente.</small></div></header>
          <div className="goal-period-presets">
            <button type="button" className={preset === 'day' ? 'is-active' : ''} onClick={() => applyPreset('day')}>Hoje</button>
            <button type="button" className={preset === 'week' ? 'is-active' : ''} onClick={() => applyPreset('week')}>Esta semana</button>
            <button type="button" className={preset === 'month' ? 'is-active' : ''} onClick={() => applyPreset('month')}>Este mês</button>
            <button type="button" className={preset === 'custom' ? 'is-active' : ''} onClick={() => setPreset('custom')}>Personalizado</button>
          </div>
          <div className="form-grid">
            <label className="form-field"><span>Início</span><input type="date" value={periodStart} onChange={(event) => { setPreset('custom'); setPeriodStart(event.target.value) }} /></label>
            <label className="form-field"><span>Fim</span><input type="date" value={periodEnd} min={periodStart} onChange={(event) => { setPreset('custom'); setPeriodEnd(event.target.value) }} /></label>
          </div>
        </section>

        <section className="goal-modal-section">
          <header><span className="goal-modal-section__icon">{ownerId === 'team' ? <UsersRound size={18} /> : <UserRound size={18} />}</span><div><strong>Responsável</strong><small>Crie uma meta geral da equipe ou uma meta individual.</small></div></header>
          <label className="form-field"><span>Aplicar para</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}><option value="team">Equipe inteira</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></label>
        </section>
      </div>
    </Modal>
  )
}
