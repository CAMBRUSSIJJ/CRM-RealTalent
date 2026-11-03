import { AlertCircle, Bell, CheckCircle2, Clock3 } from 'lucide-react'
import type { LocalTaskAutoDiagnostic } from '../../services/local-communications-gateway'
import '../../styles/communication-task-state.css'

interface Props {
  status: LocalTaskAutoDiagnostic | null
  available: boolean
  configured: boolean
}

export function TaskCommunicationState({status,available,configured}:Props) {
  if(!configured) return null
  if(!available) return <span className="communication-task-state is-unavailable" title="Não foi possível verificar o gateway">
    <AlertCircle size={13}/> Gateway indisponível
  </span>
  if(!status) return <span className="communication-task-state is-unavailable" title="O gateway ainda não confirmou o estado desta tarefa">
    <Clock3 size={13}/> Aguardando diagnóstico
  </span>
  const scheduled=status.code==='scheduled'
  const accepted=status.code==='accepted'
  const tone=scheduled?'is-scheduled':accepted?'is-accepted':'is-attention'
  const text=scheduled?'Aviso programado':accepted?'Aceito pelo gateway':
    status.code==='channel_off'?'Canal WhatsApp desligado':
    status.code==='automatic_off'?'Automação desligada':
    status.code==='consent_missing'?'Sem autorização':
    status.code==='phone_missing'?'WhatsApp não cadastrado':
    status.code==='assignment_already_happened'?'Sem novo aviso':
    status.code==='task_not_synced'?'Aguardando sincronização':
    'Aviso não programado'
  return <span className={`communication-task-state ${tone}`} title={status.reason}>
    {scheduled?<Bell size={13}/>:accepted?<CheckCircle2 size={13}/>:<AlertCircle size={13}/>} {text}
  </span>
}
