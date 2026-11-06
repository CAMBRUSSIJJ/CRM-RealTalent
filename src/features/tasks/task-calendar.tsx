import {useMemo,useState} from 'react'
import {CalendarDays,ChevronLeft,ChevronRight,Clock3} from 'lucide-react'
import type {WorkTask} from '../../domain/types'
import {taskPriorityLabel} from '../../services/work-management'

const dayKey=(date:Date)=>date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0')
const WEEKDAYS=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']

interface Props {tasks:WorkTask[];readOnly:boolean;onEdit(task:WorkTask):void}
export function TaskCalendar({tasks,readOnly,onEdit}:Props){
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1))
  const calendar=useMemo(()=>{
    const first=new Date(month.getFullYear(),month.getMonth(),1)
    const start=(first.getDay()+6)%7
    return Array.from({length:42},(_,i)=>{
      const date=new Date(first.getFullYear(),first.getMonth(),1-start+i)
      return {date,key:dayKey(date),currentMonth:date.getMonth()===first.getMonth()}
    })
  },[month])
  const {byDay,withoutDue}=useMemo(()=>{
    const byDay=new Map<string,WorkTask[]>(),withoutDue:WorkTask[]=[]
    for(const task of tasks){
      if(!task.dueAt||!Number.isFinite(new Date(task.dueAt).getTime())){withoutDue.push(task);continue}
      const key=dayKey(new Date(task.dueAt))
      byDay.set(key,[...(byDay.get(key)||[]),task])
    }
    return {byDay,withoutDue}
  },[tasks])
  const jump=(delta:number)=>setMonth(prev=>new Date(prev.getFullYear(),prev.getMonth()+delta,1))
  return <section className="tasks-page-v4__calendar" aria-label="Calendário de tarefas">
    <header className="tasks-page-v4__calendar-toolbar">
      <div><CalendarDays size={19}/><h2>{month.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</h2></div>
      <div>
        <button type="button" onClick={()=>setMonth(new Date(new Date().getFullYear(),new Date().getMonth(),1))}>Mês atual</button>
        <button type="button" onClick={()=>jump(-1)} aria-label="Mês anterior"><ChevronLeft size={17}/></button>
        <button type="button" onClick={()=>jump(1)} aria-label="Próximo mês"><ChevronRight size={17}/></button>
      </div>
    </header>
    <div className="tasks-page-v4__calendar-scroll">
      <div className="tasks-page-v4__calendar-grid">
        {WEEKDAYS.map(day=><strong key={day} className="tasks-page-v4__calendar-weekday">{day}</strong>)}
        {calendar.map(({date,key,currentMonth})=>{
          const entries=byDay.get(key)||[]
          const today=key===dayKey(new Date())
          return <div key={key} className={'tasks-page-v4__calendar-day'+(!currentMonth?' is-adjacent':'')+(today?' is-today':'')}>
            <span className="tasks-page-v4__calendar-date">{date.getDate()}</span>
            {entries.slice(0,3).map(task=><button type="button" key={task.id} disabled={readOnly}
              className={'tasks-page-v4__calendar-task priority-'+task.priority}
              onClick={()=>onEdit(task)} title={task.title+' · '+taskPriorityLabel[task.priority]}>{task.title}</button>)}
            {entries.length>3?<small>+{entries.length-3} tarefa(s)</small>:null}
          </div>
        })}
      </div>
    </div>
    {withoutDue.length?<section className="tasks-page-v4__calendar-undated">
      <h3><Clock3 size={16}/> Sem prazo definido <span>{withoutDue.length}</span></h3>
      <div>{withoutDue.map(task=><button type="button" key={task.id} disabled={readOnly}
        onClick={()=>onEdit(task)}>{task.title}</button>)}</div>
    </section>:null}
  </section>
}
