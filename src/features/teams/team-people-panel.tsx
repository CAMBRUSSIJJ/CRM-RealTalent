import {ArrowUpRight,CheckCircle2,Clock3,Pencil,UserRound,UsersRound} from 'lucide-react'
import type {WorkTask,WorkspaceMember} from '../../domain/types'
import {routeToHash} from '../../app/route-state'

interface Props{
  members:WorkspaceMember[]
  tasks:WorkTask[]
  leaderId:string|null
  teamId:string
  canManage:boolean
  onEditTeam():void
}
const OPEN=new Set(['todo','in_progress','blocked'])
export function TeamPeoplePanel({members,tasks,leaderId,teamId,canManage,onEditTeam}:Props){
  const active=tasks.filter(task=>OPEN.has(task.status))
  return <section className="work-section teams-operation__people" aria-label="Integrantes da equipe">
    <header>
      <div><span className="eyebrow"><UsersRound size={14}/> Pessoas</span>
        <h3>Integrantes e responsabilidades</h3>
        <p>Consulte quem compõe a equipe e a distribuição das atividades.</p></div>
      <div className="teams-operation__section-actions">
        <span>{members.length} pessoa(s)</span>
        {canManage?<button type="button" onClick={onEditTeam}><Pencil size={14}/> Gerenciar pessoas</button>:null}
      </div>
    </header>
    {members.length?<div className="teams-operation__people-grid">{members.map(member=>{
      const assigned=active.filter(task=>task.assigneeId===member.userId)
      const overdue=assigned.filter(task=>task.dueAt && Number.isFinite(Date.parse(task.dueAt)) && new Date(task.dueAt).getTime()<Date.now())
      const done=tasks.filter(task=>task.assigneeId===member.userId && task.status==='completed').length
      return <article key={member.userId} className="teams-operation__person-card">
        <div className="teams-operation__person-head">
          <span className="teams-operation__person-avatar"><UserRound size={19}/></span>
          <div><strong>{member.displayName}</strong><small>{leaderId===member.userId?'Liderança da equipe':'Integrante da equipe'}</small></div>
        </div>
        <p className="teams-operation__person-email">{member.email}</p>
        <div className="teams-operation__person-kpis">
          <span><Clock3 size={13}/><b>{assigned.length}</b> abertas</span>
          <span className={overdue.length?'is-late':''}><Clock3 size={13}/><b>{overdue.length}</b> atrasadas</span>
          <span><CheckCircle2 size={13}/><b>{done}</b> concluídas</span>
        </div>
      </article>
    })}</div>:<div className="teams-operation__empty"><UsersRound size={24}/><strong>Equipe sem integrantes</strong>
      <p>Selecione as pessoas no cadastro da equipe para distribuir responsabilidades.</p>
      {canManage?<button type="button" onClick={onEditTeam}>Adicionar integrantes</button>:null}</div>}
    <footer className="teams-operation__section-footer">
      <a href={routeToHash('tasks',{filter:'team:'+teamId})}>Abrir tarefas da equipe <ArrowUpRight size={15}/></a>
    </footer>
  </section>
}
