import { BarChart3, Clock3, Gauge, Headphones, MessageSquareWarning, Sparkles, Target, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { CallRecord, ContactRecord, Lead, PipelineStage, Playbook } from '../../domain/types'
import { buildCallIntelligence, type CallIntelligencePeriod } from '../../services/call-intelligence'

const formatDuration = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}m ${String(Math.max(0, seconds) % 60).padStart(2, '0')}s`
const periods: Array<[CallIntelligencePeriod, string]> = [['today', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['all', 'Todo histórico']]

export function CallsIntelligencePanel({ calls, leads, contacts, playbooks, stages }: {
  calls: CallRecord[]
  leads: Lead[]
  contacts: ContactRecord[]
  playbooks: Playbook[]
  stages: PipelineStage[]
}) {
  const [period, setPeriod] = useState<CallIntelligencePeriod>('30d')
  const data = useMemo(() => buildCallIntelligence({ calls, leads, contacts, playbooks, stages, period }), [calls, contacts, leads, period, playbooks, stages])
  const maxOutcome = Math.max(1, ...data.outcomes.map((item) => item.count))
  const hours = [...data.hourly].sort((a, b) => b.contactRate - a.contactRate || b.attempts - a.attempts).slice(0, 8)

  return <section className="calls-intelligence-workspace">
    <div className="calls-intelligence-head">
      <div><span className="eyebrow">Inteligência de ligações</span><h3>Operação, conversão e coaching no mesmo lugar</h3><p>Analise volume, qualidade e avanço comercial sem separar desempenho de desenvolvimento.</p></div>
      <div className="calls-period-picker call-segmented" role="group" aria-label="Período da inteligência">{periods.map(([value, label]) => <button type="button" key={value} className={`call-segmented__button ${period === value ? 'is-active' : ''}`} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}</div>
    </div>

    <div className="calls-intelligence-kpis">
      <article><span><Headphones size={17} /> Tentativas</span><strong>{data.totals.attempts}</strong><small>{data.totals.connectionRate}% de conexão</small></article>
      <article><span><Target size={17} /> Conversas</span><strong>{data.totals.conversations}</strong><small>{data.totals.qualificationRate}% qualificadas</small></article>
      <article><span><Trophy size={17} /> Reuniões</span><strong>{data.totals.meetings}</strong><small>{data.totals.meetingRate}% das conversas</small></article>
      <article><span><Clock3 size={17} /> Duração média</span><strong>{formatDuration(data.totals.averageDuration)}</strong><small>{data.totals.bestHour ? `melhor hora ${String(data.totals.bestHour.hour).padStart(2, '0')}:00` : 'sem janela dominante'}</small></article>
      <article><span><Sparkles size={17} /> Coaching</span><strong>{data.coaching.averageScore || '—'}</strong><small>{data.coaching.reviewedCalls} ligação(ões) avaliadas</small></article>
      <article><span><Gauge size={17} /> Próximo passo</span><strong>{data.coaching.nextStepRate}%</strong><small>das ligações com avanço registrado</small></article>
    </div>

    <div className="calls-intelligence-grid calls-intelligence-grid--primary">
      <article className="panel calls-funnel-panel">
        <div className="panel__heading"><div><span className="eyebrow">Funil de chamadas</span><h3>Da tentativa ao fechamento</h3></div><BarChart3 size={20} /></div>
        <div className="calls-funnel">{data.funnel.map((step, index) => <div key={step.id} className="calls-funnel__row"><div><span>{index + 1}</span><strong>{step.label}</strong></div><div className="calls-funnel__bar"><i style={{ width: `${Math.max(step.rate, step.value ? 4 : 0)}%` }} /></div><b>{step.value}</b><small>{step.rate}%</small></div>)}</div>
      </article>

      <article className="panel calls-results-panel">
        <div className="panel__heading"><div><span className="eyebrow">Resultados</span><h3>Distribuição das ligações</h3></div><Target size={20} /></div>
        {data.outcomes.length ? <div className="calls-outcome-bars calls-outcome-bars--v69">{data.outcomes.map((item) => <div key={item.outcome}><span>{item.label}</span><div><i style={{ width: `${Math.max(4, (item.count / maxOutcome) * 100)}%` }} /></div><strong>{item.count}</strong><small>{item.percent}%</small></div>)}</div> : <p className="activity-empty">Ainda não há ligações no período selecionado.</p>}
      </article>
    </div>

    <div className="calls-intelligence-grid">
      <article className="panel calls-hours-panel">
        <div className="panel__heading"><div><span className="eyebrow">Horários</span><h3>Quando as pessoas atendem</h3></div><Clock3 size={20} /></div>
        {hours.length ? <div className="calls-hours-list">{hours.map((row) => <div key={row.hour}><strong>{String(row.hour).padStart(2, '0')}:00</strong><span>{row.attempts} tentativas · {row.contacts} contatos</span><b>{row.contactRate}%</b></div>)}</div> : <p className="activity-empty">Mais histórico é necessário para comparar horários.</p>}
      </article>

      <article className="panel calls-coaching-summary-panel">
        <div className="panel__heading"><div><span className="eyebrow">Coaching</span><h3>Qualidade da execução</h3></div><Sparkles size={20} /></div>
        <div className="calls-coaching-mini-kpis"><div><span>Discovery</span><strong>{data.coaching.discoveryRate}%</strong></div><div><span>Avanço</span><strong>{data.coaching.meetingRate}%</strong></div><div><span>Objeções</span><strong>{data.coaching.objectionHandlingRate}%</strong></div><div><span>Excelentes</span><strong>{data.coaching.excellentCalls}</strong></div></div>
        <div className="calls-coaching-split"><div><span>Prioridades</span>{data.coaching.improvementAreas.length ? data.coaching.improvementAreas.slice(0, 3).map((item) => <p key={item.label}><strong>{item.count}x</strong>{item.label}</p>) : <p>Nenhuma lacuna recorrente.</p>}</div><div><span>Forças</span>{data.coaching.topStrengths.length ? data.coaching.topStrengths.slice(0, 3).map((item) => <p key={item.label}><strong>{item.count}x</strong>{item.label}</p>) : <p>Mais histórico é necessário.</p>}</div></div>
      </article>
    </div>

    <div className="calls-intelligence-grid">
      <article className="panel calls-objections-panel">
        <div className="panel__heading"><div><span className="eyebrow">Objeções</span><h3>Padrões das conversas</h3></div><MessageSquareWarning size={20} /></div>
        {data.coaching.objections.length ? <div className="coaching-objection-grid">{data.coaching.objections.map((item) => <div key={item.title}><strong>{item.title}</strong><span>{item.count} ocorrência{item.count === 1 ? '' : 's'}</span></div>)}</div> : <p className="activity-empty">Registre objeções durante as ligações para formar o mapa de padrões.</p>}
      </article>

      <article className="panel calls-playbook-panel">
        <div className="panel__heading"><div><span className="eyebrow">Playbooks</span><h3>Cobertura da operação</h3></div><Sparkles size={20} /></div>
        <div className="calls-playbook-kpis"><div><span>Ativos</span><strong>{data.playbooks.active}</strong></div><div><span>Contextuais</span><strong>{data.playbooks.contextualRate}%</strong></div><div><span>Etapas cobertas</span><strong>{data.playbooks.stageCoverage}%</strong></div></div>
        <p>Use playbooks contextuais para que o Modo Foco recomende o material certo conforme etapa, objetivo, persona e resultado.</p>
      </article>
    </div>
  </section>
}
