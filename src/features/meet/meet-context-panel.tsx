import { useEffect, useState } from 'react'
import { BookOpenText, Check, ClipboardList, Save, UserRound } from 'lucide-react'
import type { PublicMeetRoom } from '../../services/realtalent-meet'

export interface MeetCommercialContext {
  customer: string
  company: string
  opportunity: string
  stage: string
}
export function MeetContextPanel({ room,context,onSaveNote }:{
  room:PublicMeetRoom; context?:MeetCommercialContext; onSaveNote?:(text:string)=>Promise<void>
}){
  const key='realtalent:meet:draft:'+room.id
  const [draft,setDraft]=useState(()=>{try{return localStorage.getItem(key)||''}catch{return ''}})
  const [saved,setSaved]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{try{localStorage.setItem(key,draft)}catch{/* local draft optional */}},[key,draft])
  const save=async()=>{
    if(!onSaveNote||!draft.trim())return
    setBusy(true);setError('')
    try{await onSaveNote(draft.trim());setDraft('');setSaved(true);window.setTimeout(()=>setSaved(false),2500)}
    catch(e){setError(e instanceof Error?e.message:'Falha ao registrar nota.')}
    finally{setBusy(false)}
  }
  return <div className="rtmeet-context-body">
    <section className="rtmeet-context-section">
      <h4><UserRound size={16}/> Contexto comercial</h4>
      {context?.customer||context?.company||context?.opportunity?
        <dl><dt>Cliente</dt><dd>{context.customer||'Não informado'}</dd><dt>Empresa</dt><dd>{context.company||'Não informada'}</dd><dt>Oportunidade</dt><dd>{context.opportunity||'Não vinculada'}</dd>{context.stage&&<><dt>Etapa</dt><dd>{context.stage}</dd></>}</dl>:
        <p className="rtmeet-context-hint">Esta reunião não foi vinculada a um contato ou oportunidade.</p>}
    </section>
    <section className="rtmeet-context-section"><h4><BookOpenText size={16}/> Pauta da reunião</h4>
      <p className="rtmeet-agenda">{room.agenda||'Sem pauta definida. Use o espaço abaixo para registrar decisões e próximos passos.'}</p>
    </section>
    <section className="rtmeet-context-section"><h4><ClipboardList size={16}/> Anotações privadas</h4>
      <label className="sr-only" htmlFor="rtmeet-notes">Anotações comerciais</label>
      <textarea id="rtmeet-notes" rows={7} value={draft} onChange={e=>setDraft(e.target.value)}
        placeholder="Decisões, objeções, próximos passos..." maxLength={10000}/>
      <small>Rascunho salvo neste navegador. Não é enviado aos convidados.</small>
      {error&&<p className="rtmeet-context-error" role="alert">{error}</p>}
      {onSaveNote&&<button className="rtmeet-context-save" onClick={()=>void save()} disabled={!draft.trim()||busy}>
        {saved?<Check size={15}/>:<Save size={15}/>} {saved?'Registrado no CRM':busy?'Salvando...':'Salvar no histórico do CRM'}
      </button>}
    </section>
  </div>
}
