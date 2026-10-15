import { NativeSelectionSelect } from '../../components/selection'
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Save, Target, UserRound, UsersRound, Building2 } from 'lucide-react'
import { Modal } from '../../components/ui/modal'
import { Button } from '../../components/ui/button'
import type { Goal, GoalMetric, GoalScope, Team, TeamMembership, WorkspaceMember } from '../../domain/types'
import { goalMetricDefinition, goalMetricUnits, metricGroups, metricRegistry } from '../../services/metrics'
import { getGoalPeriodBounds, type GoalPeriodPreset } from '../../services/goals-workspace'

interface GoalModalProps {
  open: boolean; goal: Goal | null; members: WorkspaceMember[]; teams: Team[]; memberships: TeamMembership[]; loading?: boolean; onClose(): void
  onSubmit(input: { scope: GoalScope; teamId: string | null; teamName: string; userId: string | null; userName: string; metric: GoalMetric; targetValue: number; periodStart: string; periodEnd: string }): Promise<void>
}
const periodLabels: Array<{ value: Exclude<GoalPeriodPreset,'custom'>; label: string }> = [
  { value: 'day', label: 'Hoje' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'year', label: 'Ano' },
]

export function GoalModal({ open, goal, members, teams, memberships, loading=false, onClose, onSubmit }: GoalModalProps) {
  const month=useMemo(()=>getGoalPeriodBounds('month'),[open]); const [metric,setMetric]=useState<GoalMetric>('calls'); const [targetValue,setTargetValue]=useState('20'); const [periodStart,setPeriodStart]=useState(month.start); const [periodEnd,setPeriodEnd]=useState(month.end); const [scope,setScope]=useState<GoalScope>('workspace'); const [teamId,setTeamId]=useState(''); const [userId,setUserId]=useState(''); const [preset,setPreset]=useState<GoalPeriodPreset>('month')
  useEffect(()=>{ if(!open)return; const inferred=goal?.scope ?? (goal?.teamId?'team':goal?.userId?'user':'workspace'); setMetric(goal?.metric??'calls'); setTargetValue(String(goal?.targetValue??20)); setPeriodStart(goal?.periodStart??month.start); setPeriodEnd(goal?.periodEnd??month.end); setScope(inferred); setTeamId(goal?.teamId??teams[0]?.id??''); setUserId(goal?.userId??members[0]?.userId??''); setPreset(goal?'custom':'month') },[goal,members,month.end,month.start,open,teams])
  const applyPreset=(value:Exclude<GoalPeriodPreset,'custom'>)=>{const b=getGoalPeriodBounds(value);setPreset(value);setPeriodStart(b.start);setPeriodEnd(b.end)}
  const selectedTeam=teams.find(t=>t.id===teamId); const teamMemberCount=teamId?memberships.filter(m=>m.teamId===teamId).length:0; const definition=goalMetricDefinition(metric)
  const submit=async()=>{const value=Number(targetValue);if(!Number.isFinite(value)||value<=0||!periodStart||!periodEnd||periodEnd<periodStart)return; const member=members.find(m=>m.userId===userId); await onSubmit({scope,teamId:scope==='team'?teamId:null,teamName:scope==='team'?(selectedTeam?.name??'Equipe'):'',userId:scope==='user'?userId:null,userName:scope==='user'?(member?.displayName??'Usuário'):scope==='team'?(selectedTeam?.name??'Equipe'):'Workspace',metric,targetValue:value,periodStart,periodEnd})}
  return <Modal open={open} size="lg" title={goal?'Editar meta comercial':'Nova meta comercial'} subtitle="Escolha primeiro o que medir, depois quem responde pela meta e o período." onClose={onClose} footer={<><span className="modal__footer-spacer"/><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={loading} onClick={()=>void submit()}><Save size={16}/> Salvar meta</Button></>}>
    <div className="goal-modal-layout goal-modal-layout--h14">
      <section className="goal-modal-section"><header><span className="goal-modal-section__icon"><Target size={18}/></span><div><strong>O que você quer acompanhar?</strong><small>Cada opção tem uma fonte de dados definida pelo CRM; não é apenas um nome de meta.</small></div></header>
        <div className="goal-metric-groups">{metricGroups.map(group=><div key={group}><span>{group}</span><div>{metricRegistry.filter(item=>item.group===group).map(item=><button type="button" key={item.key} className={metric===item.key?'is-active':''} onClick={()=>setMetric(item.key)}><strong>{item.label}</strong><small>{item.description}</small></button>)}</div></div>)}</div>
        <label className="form-field"><span>{goalMetricUnits[metric]==='currency'?'Alvo (R$)':'Alvo'}</span><input type="number" min="0.01" step={goalMetricUnits[metric]==='currency'?'100':'1'} value={targetValue} onChange={e=>setTargetValue(e.target.value)}/><small>{definition.description}</small></label>
      </section>
      <section className="goal-modal-section"><header><span className="goal-modal-section__icon"><UsersRound size={18}/></span><div><strong>Quem responde pela meta?</strong><small>Escolha Meta de equipe, individual ou do workspace; todas usam a mesma definição de métrica.</small></div></header>
        <div className="goal-scope-choice"><button type="button" className={scope==='workspace'?'is-active':''} onClick={()=>setScope('workspace')}><Building2 size={17}/><span><strong>Workspace</strong><small>Resultado coletivo</small></span></button><button type="button" className={scope==='team'?'is-active':''} onClick={()=>setScope('team')}><UsersRound size={17}/><span><strong>Equipe</strong><small>Roll-up dos membros</small></span></button><button type="button" className={scope==='user'?'is-active':''} onClick={()=>setScope('user')}><UserRound size={17}/><span><strong>Pessoa</strong><small>Meta individual</small></span></button></div>
        {scope==='team'?<label className="form-field"><span>Equipe</span><NativeSelectionSelect value={teamId} onChange={e=>setTeamId(e.target.value)}>{teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</NativeSelectionSelect><small>{teamMemberCount} membro(s) contribuirão automaticamente para o realizado.</small></label>:null}
        {scope==='user'?<label className="form-field"><span>Responsável</span><NativeSelectionSelect value={userId} onChange={e=>setUserId(e.target.value)}>{members.map(member=><option key={member.userId} value={member.userId}>{member.displayName}</option>)}</NativeSelectionSelect></label>:null}
      </section>
      <section className="goal-modal-section"><header><span className="goal-modal-section__icon"><CalendarDays size={18}/></span><div><strong>Período</strong><small>Ritmo, projeção e necessário por dia são calculados por dias úteis.</small></div></header><div className="goal-period-presets goal-period-presets--extended">{periodLabels.map(item=><button key={item.value} type="button" className={preset===item.value?'is-active':''} onClick={()=>applyPreset(item.value)}>{item.label}</button>)}<button type="button" className={preset==='custom'?'is-active':''} onClick={()=>setPreset('custom')}>Personalizado</button></div><div className="form-grid"><label className="form-field"><span>Início</span><input type="date" value={periodStart} onChange={e=>{setPreset('custom');setPeriodStart(e.target.value)}}/></label><label className="form-field"><span>Fim</span><input type="date" value={periodEnd} min={periodStart} onChange={e=>{setPreset('custom');setPeriodEnd(e.target.value)}}/></label></div></section>
    </div>
  </Modal>
}
