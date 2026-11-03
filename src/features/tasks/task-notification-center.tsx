import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BellRing, Clock3, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/button'
import type { WorkTask } from '../../domain/types'
import { loadGatewayLocalTaskAutoHistory, type LocalTaskAutoHistory, type LocalTaskAutoJob } from '../../services/local-communications-gateway'
import '../../styles/task-notification-center.css'

interface Props {
  workspaceId: string
  tasks: WorkTask[]
  onOpenTask: (task: WorkTask) => void
}

const label: Record<LocalTaskAutoJob['status'],string> = {
  pending:'Programado',processing:'Processando',sent:'Aceito pelo gateway',
  failed:'Falha',unknown:'Envio incerto',cancelled:'Cancelado',
  blocked:'Bloqueado',expired:'Expirado',
}
type Filter = 'pending' | 'attention' | 'history'
const matches = (job:LocalTaskAutoJob,filter:Filter) => filter==='pending'
  ? ['pending','processing'].includes(job.status)
  : filter==='attention'
    ? ['failed','unknown','blocked','expired'].includes(job.status)
    : ['sent','cancelled'].includes(job.status)

const when = (value:string) => {
  const date=new Date(value)
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})
    : 'Data indisponível'
}

export function TaskNotificationCenter({ workspaceId, tasks, onOpenTask }:Props) {
  const [data,setData] = useState<LocalTaskAutoHistory | null>(null)
  const [filter,setFilter] = useState<Filter>('pending')
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [refresh,setRefresh] = useState(0)
  useEffect(() => {
    if(!workspaceId) return
    let live=true
    setLoading(true);setError('')
    void loadGatewayLocalTaskAutoHistory(workspaceId).then(value=>{
      if(live)setData(value)
    }).catch(()=>{
      if(live){setData(null);setError('Gateway indisponível. Não é possível confirmar se há avisos programados neste momento.')}
    }).finally(()=>{if(live)setLoading(false)})
    return ()=>{live=false}
  },[workspaceId,refresh])

  const taskById = useMemo(()=>new Map(tasks.map(task=>[task.id,task])),[tasks])
  const records = useMemo(()=>[...(data?.jobs||[])].filter(job=>matches(job,filter))
    .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)),[data,filter])
  const count = (statuses:LocalTaskAutoJob['status'][])=>statuses.reduce((n,s)=>n+(data?.counts[s]??0),0)

  return <section className="task-notification-center work-section" aria-label="Central de notificações">
    <header className="task-notification-center__header">
      <div><span className="eyebrow"><BellRing size={14}/> Comunicação automática · modo local</span>
        <h3>Central de notificações</h3>
        <p>Fila persistente do Communications Gateway. “Aceito” não significa entregue ou lido.</p>
      </div>
      <Button variant="secondary" size="sm" disabled={loading}
        onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={14}/> Atualizar</Button>
    </header>
    <div className="task-notification-center__tabs" role="group" aria-label="Filtrar notificações">
      <button type="button" aria-pressed={filter==='pending'} onClick={()=>setFilter('pending')}>
        Programados <strong>{count(['pending','processing'])}</strong>
      </button>
      <button type="button" aria-pressed={filter==='attention'} onClick={()=>setFilter('attention')}>
        Precisam atenção <strong>{count(['failed','unknown','blocked','expired'])}</strong>
      </button>
      <button type="button" aria-pressed={filter==='history'} onClick={()=>setFilter('history')}>
        Histórico <strong>{count(['sent','cancelled'])}</strong>
      </button>
    </div>
    {error ? <p className="task-notification-center__notice" role="alert"><AlertTriangle size={16}/>{error}</p> : null}
    {loading&&!data ? <p className="task-notification-center__muted">Consultando o gateway…</p> : null}
    {!loading&&!error&&!records.length ? <p className="task-notification-center__muted">
      {filter==='pending'?'Nenhum aviso programado.':filter==='attention'?'Nenhuma falha registrada nesta fila.':'Ainda não existem eventos nesse histórico.'}
    </p> : null}
    {!!records.length ? <div className="task-notification-center__rows">
      {records.map(job=>{
        const task=taskById.get(job.taskId)
        return <div className="task-notification-center__row" key={job.id}>
          <div className="task-notification-center__icon">{job.status==='unknown'?<AlertTriangle size={17}/>:<Clock3 size={17}/>}</div>
          <div className="task-notification-center__content">
            <strong>{task?.title || 'Tarefa não encontrada neste workspace'}</strong>
            <small>{job.eventType==='assigned'?'Atribuição':'Antes do prazo'} · {when(job.at)} · {label[job.status]}</small>
            {job.error&&['unknown','failed','blocked'].includes(job.status)
              ? <small className="task-notification-center__error">Verifique a conversa antes de tentar um novo envio.</small>:null}
          </div>
          {task ? <Button variant="secondary" size="sm" onClick={()=>onOpenTask(task)}>Abrir tarefa</Button>:null}
        </div>
      })}
    </div> : null}
    <p className="task-notification-center__footnote">Automação via WhatsApp QR experimental. O gateway e a sessão precisam estar ativos. O histórico mantém registros recentes e não comprova entrega ao destinatário.</p>
  </section>
}
