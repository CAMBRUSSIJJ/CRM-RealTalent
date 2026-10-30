import { useState } from 'react'
import { ArrowRight, CheckCircle2, ClipboardCheck, CalendarDays } from 'lucide-react'
import type { MeetRoom } from '../../services/realtalent-meet'
import { Button } from '../../components/ui/button'

export function MeetWrapUp({room,onFinish,onSkip}:{
  room:MeetRoom; onFinish:(outcome:string,next:string,dueAt:string|null)=>Promise<void>;onSkip():void
}){
  const [outcome,setOutcome]=useState('')
  const [next,setNext]=useState('')
  const [dueAt,setDueAt]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const submit=async()=>{
    setBusy(true);setError('')
    try{await onFinish(outcome.trim(),next.trim(),dueAt?new Date(dueAt).toISOString():null)}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível registrar o resultado.')}
    finally{setBusy(false)}
  }
  return <div className="rtmeet-wrap">
    <section className="rtmeet-wrap-card">
      <div className="rtmeet-wrap-icon"><CheckCircle2 size={30}/></div>
      <span className="eyebrow">REUNIÃO ENCERRADA</span>
      <h1>Registre os próximos passos</h1><p>{room.title}</p>
      <label><ClipboardCheck size={16}/> Principais decisões<textarea rows={4} maxLength={8000}
        value={outcome} onChange={e=>setOutcome(e.target.value)}
        placeholder="O que ficou decidido? Alguma objeção ou informação importante?"/></label>
      <label><ArrowRight size={16}/> Próxima ação<input value={next} maxLength={160} onChange={e=>setNext(e.target.value)}
        placeholder="Ex.: Enviar proposta comercial"/></label>
      {next.trim()&&<label><CalendarDays size={16}/> Prazo (opcional)<input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label>}
      {error&&<div className="rtmeet-alert" role="alert">{error}</div>}
      <div className="rtmeet-wrap-actions"><Button variant="secondary" onClick={onSkip} disabled={busy}>Agora não</Button>
        <Button onClick={()=>void submit()} disabled={busy||(!outcome.trim()&&!next.trim())}>{busy?'Salvando...':'Registrar no CRM'}</Button>
      </div>
      <small>O registro ficará vinculado ao contato da reunião, quando houver vínculo no CRM.</small>
    </section>
  </div>
}
