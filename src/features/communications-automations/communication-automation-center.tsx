import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BellRing, Clock3, RefreshCw, Send, ShieldCheck } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { useAppUi } from '../../app/app-context'
import type { WorkTask } from '../../domain/types'
import {
  loadGatewayLocalTaskAutoHistory, requestGatewayLocalTaskNotice,
  type LocalTaskAutoDiagnostic, type LocalTaskAutoHistory, type LocalTaskAutoJob,
} from '../../services/local-communications-gateway'
import '../../styles/communication-automation-center.css'

interface Props {
  workspaceId:string
  tasks:WorkTask[]
  onOpenTask:(task:WorkTask)=>void
}
type Filter='pending'|'attention'|'history'|'diagnostics'

const labels:Record<LocalTaskAutoJob['status'],string>={
  pending:'Programado',processing:'Processando',sent:'Aceito pelo gateway',
  failed:'Falhou',unknown:'Resultado incerto',blocked:'Bloqueado',
  expired:'Expirado',cancelled:'Cancelado',
}
const flags=(job:LocalTaskAutoJob,filter:Filter)=>filter==='pending'
  ? ['pending','processing'].includes(job.status)
  : filter==='attention'
    ? ['failed','unknown','blocked','expired'].includes(job.status)
    : filter==='history' ? ['sent','cancelled'].includes(job.status) : false
const humanDate=(iso:string)=>{
  const date=new Date(iso)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : 'Sem data'
}

/** Shared workspace notification console.
 * Task events are live; other CRM domain producers will be added to the same
 * event contract after cloud persistence and provider homologation.
 */
export function CommunicationAutomationCenter({ workspaceId,tasks,onOpenTask }:Props) {
  const {notify,confirmAction}=useAppUi()
  const [data,setData]=useState<LocalTaskAutoHistory|null>(null)
  const [filter,setFilter]=useState<Filter>('pending')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [revision,setRevision]=useState(0)
  const [requesting,setRequesting]=useState<string|null>(null)

  useEffect(()=>{
    let active=true
    setLoading(true);setError('')
    void loadGatewayLocalTaskAutoHistory(workspaceId).then(next=>{
      if(active)setData(next)
    }).catch(()=>{
      if(active){setData(null);setError('Não foi possível consultar o Communications Gateway. Os estados das notificações não estão confirmados.')}
    }).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[workspaceId,revision])

  const taskById=useMemo(()=>new Map(tasks.map(t=>[t.id,t])),[tasks])
  const rows=useMemo(()=>(data?.jobs??[]).filter(job=>taskById.has(job.taskId)&&flags(job,filter))
    .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)),[data,filter,taskById])
  const diagnostics=useMemo(()=>((data?.diagnostics??[]) as LocalTaskAutoDiagnostic[])
    .filter(d=>taskById.has(d.taskId)&&d.state!=='inactive'&&d.code!=='scheduled'&&d.code!=='accepted')
    .sort((a,b)=>Number(b.canRequest)-Number(a.canRequest)),[data,taskById])
  // Never display notification metadata for tasks the current CRM view
  // has not authorized the user to inspect.
  const count=(statuses:LocalTaskAutoJob['status'][])=> (data?.jobs??[])
    .filter(job=>taskById.has(job.taskId)&&statuses.includes(job.status)).length

  const requestNotice=async(diagnostic:LocalTaskAutoDiagnostic)=>{
    const task=taskById.get(diagnostic.taskId)
    if(!task||!diagnostic.canRequest||requesting)return
    const approved=await confirmAction({
      title:'Programar um aviso único?',
      description:`Um aviso será enviado ao responsável por “${task.title}” pelo WhatsApp QR experimental, se o gateway estiver conectado. O destinatário já precisa ter autorizado as mensagens. Não haverá reenvio automático.`,
      confirmLabel:'Programar aviso',
    })
    if(!approved)return
    setRequesting(diagnostic.taskId)
    try {
      await requestGatewayLocalTaskNotice(workspaceId,diagnostic.taskId)
      notify('success','Aviso único programado. Acompanhe a situação na Central.')
      setFilter('pending');setRevision(n=>n+1)
    } catch(error) {
      notify('error',error instanceof Error?error.message:'Não foi possível programar o aviso.')
      setRevision(n=>n+1)
    } finally {setRequesting(null)}
  }

  return <section className="communication-automation-console" aria-label="Central de comunicação e automações">
    <div className="communication-automation-console__intro">
      <div><strong><BellRing size={17}/> Comunicação e automações</strong>
        <p>Consulte eventos reais do gateway. A marcação de lembrete na tarefa não comprova agendamento ou entrega.</p>
      </div>
      <Button variant="secondary" size="sm" disabled={loading} onClick={()=>setRevision(n=>n+1)}>
        <RefreshCw size={14}/> Atualizar
      </Button>
    </div>
    <div className="communication-automation-console__tabs" role="group" aria-label="Categorias das notificações">
      {([
        ['pending','Programados',count(['pending','processing'])],
        ['attention','Precisam atenção',count(['failed','unknown','blocked','expired'])],
        ['history','Histórico',count(['sent','cancelled'])],
        ['diagnostics','Diagnóstico',diagnostics.length],
      ] as const).map(([key,title,total])=><button key={key} type="button" aria-pressed={filter===key}
        onClick={()=>setFilter(key)}>{title}<span>{total}</span></button>)}
    </div>

    {error?<p className="communication-automation-console__alert" role="alert"><AlertTriangle size={16}/>{error}</p>:null}
    {loading&&!data?<p className="communication-automation-console__hint">Consultando o Communications Gateway…</p>:null}
    {filter==='pending'&&!rows.length&&!error&&!loading&&diagnostics.length>0
      ? <div className="communication-automation-console__why">
          <strong>Nenhum aviso programado não significa que tudo está configurado.</strong>
          <p>{diagnostics.length} tarefa(s) exigem diagnóstico ou não possuem um novo evento para avisar.</p>
          <Button variant="secondary" size="sm" onClick={()=>setFilter('diagnostics')}>Ver motivos e ações</Button>
        </div> : null}

    {filter==='diagnostics' ? <div className="communication-automation-console__records">
      {!diagnostics.length&&!error&&!loading?<p className="communication-automation-console__hint">Nenhuma tarefa aberta com configuração pendente encontrada no gateway.</p>:null}
      {diagnostics.map(d=>{
        const task=taskById.get(d.taskId)
        if(!task)return null
        return <article className="communication-automation-console__record" key={d.taskId}>
          <div className="communication-automation-console__mark"><AlertTriangle size={16}/></div>
          <div className="communication-automation-console__body">
            <strong>{task.title}</strong><small>{task.assigneeName||'Sem responsável'} · {d.reason}</small>
          </div>
          <div className="communication-automation-console__actions">
            {d.canRequest?<Button size="sm" disabled={requesting!==null} onClick={()=>void requestNotice(d)}>
              <Send size={14}/>{requesting===d.taskId?'Programando…':'Programar aviso'}
            </Button>:null}
            <Button variant="secondary" size="sm" onClick={()=>onOpenTask(task)}>Abrir tarefa</Button>
          </div>
        </article>
      })}
    </div> : <div className="communication-automation-console__records">
      {!rows.length&&!loading&&!error&&filter!=='pending'
        ? <p className="communication-automation-console__hint">{filter==='attention'?'Nenhuma falha registrada.':'Nenhum evento de envio ou cancelamento registrado.'}</p>:null}
      {rows.map(job=>{
        const task=taskById.get(job.taskId)
        return <article className="communication-automation-console__record" key={job.id}>
          <div className="communication-automation-console__mark">{job.status==='unknown'?<AlertTriangle size={16}/>:<Clock3 size={16}/>}</div>
          <div className="communication-automation-console__body">
            <strong>{task?.title||'Tarefa ausente do filtro atual'}</strong>
            <small>{job.eventType==='assigned'?'Atribuição':job.eventType==='requested'?'Aviso solicitado':'Antes do prazo'}
              {' · '}{humanDate(job.at)}{' · '}{labels[job.status]}</small>
            {job.status==='unknown'?<small>Confira a conversa antes de realizar qualquer nova tentativa.</small>:null}
          </div>
          {task?<Button variant="secondary" size="sm" onClick={()=>onOpenTask(task)}>Abrir tarefa</Button>:null}
        </article>
      })}
    </div>}
    <footer className="communication-automation-console__footer"><ShieldCheck size={15}/>
      Este ambiente utiliza WhatsApp QR experimental. “Aceito pelo gateway” não garante entrega nem leitura.
      Para execução hospedada, é necessária integração oficial homologada.
    </footer>
  </section>
}
