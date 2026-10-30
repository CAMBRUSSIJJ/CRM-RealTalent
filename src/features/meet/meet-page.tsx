import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock3, Copy, ExternalLink, Plus, RefreshCw, Trash2, Video, XCircle } from 'lucide-react'
import { useAppActions, useAppWorkspace } from '../../app/app-context'
import { useAuth } from '../auth/auth-context'
import { Button } from '../../components/ui/button'
import { changeMeetRoom, createMeetRoom, deleteMeetRoom, listMeetRooms, meetUrl, type MeetRoom, type PublicMeetRoom } from '../../services/realtalent-meet'
import { MeetRoomSession } from './meet-room'
import '../../styles/realtalent-meet.css'

const initialStart = () => {
  const date = new Date(Date.now()+15*60_000)
  return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16)
}
const publicView = (room:MeetRoom):PublicMeetRoom => ({
  id:room.id,title:room.title,agenda:room.agenda,startsAt:room.startsAt,endsAt:room.endsAt,
  status:room.status,publicToken:room.publicToken,hostName:room.hostName,settings:room.settings,
})
const label = (status:MeetRoom['status']) => ({
  scheduled:'Agendada',live:'Em andamento',completed:'Concluída',cancelled:'Cancelada',
}[status])

export function MeetPage(){
  const {currentWorkspace,repositoryMode,canWrite,snapshot}=useAppWorkspace()
  const {user}=useAuth()
  const {createCalendarEvent}=useAppActions()
  const [rooms,setRooms]=useState<MeetRoom[]>([])
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [active,setActive]=useState<MeetRoom|null>(null)
  const [creating,setCreating]=useState(false)
  const [title,setTitle]=useState('')
  const [leadId,setLeadId]=useState('')
  const [agenda,setAgenda]=useState('')
  const [start,setStart]=useState(initialStart)
  const [duration,setDuration]=useState(45)
  const leadOptions=snapshot?.leads ?? []
  const selectedLead=leadOptions.find(item=>item.id===leadId)
  const workspaceId=currentWorkspace?.id||''
  const mode=repositoryMode
  const refresh=useCallback(async()=>{
    if(!workspaceId)return
    setLoading(true);setError('')
    try{setRooms(await listMeetRooms(workspaceId,mode))}
    catch(e){setError(e instanceof Error?e.message:'Falha ao carregar as reuniões.')}
    finally{setLoading(false)}
  },[workspaceId,mode])
  useEffect(()=>{void refresh()},[refresh])
  const statusUpdate=async(room:MeetRoom,status:MeetRoom['status'])=>{
    const next=await changeMeetRoom(room,status,mode)
    setRooms(list=>list.map(r=>r.id===next.id?next:r))
    return next
  }
  const add=async()=>{
    if(!workspaceId || !user || !canWrite)return
    setBusy(true);setError('')
    try{
      const startsAt=new Date(start)
      if(Number.isNaN(startsAt.getTime()))throw new Error('Escolha uma data e horário válidos.')
      const endsAt=new Date(startsAt.getTime()+duration*60_000)
      const room=await createMeetRoom({workspaceId,createdBy:user.id,hostName:user.displayName||'RealTalent',
        title,agenda,startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString(),leadId: selectedLead?.id ?? null,
        contactId: selectedLead?.primaryContactId ?? null,companyId:selectedLead?.companyId ?? null,opportunityId:selectedLead?.opportunityId ?? null},mode)
      setRooms(list=>[room,...list])
      setCreating(false);setTitle('');setLeadId('');setAgenda('');setStart(initialStart())
      setNotice('Sala criada. Copie o convite ou entre na reunião.')
      try{
        await createCalendarEvent({leadId:room.leadId,contactId:room.contactId,title:room.title,
          description:(room.agenda ? room.agenda+'\n\n' : '')+'RealTalent Meet: '+meetUrl(room.publicToken),
          startsAt:room.startsAt,endsAt:room.endsAt,allDay:false,location:meetUrl(room.publicToken),status:'confirmed',assignedTo:user.id})
      }catch{setNotice('Sala criada; o evento não foi sincronizado com a Agenda.')}
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível criar a reunião.')}
    finally{setBusy(false)}
  }
  const copy=async(room:MeetRoom)=>{
    try{await navigator.clipboard.writeText(meetUrl(room.publicToken));setNotice('Link da reunião copiado.')}
    catch{setNotice('Link da reunião: '+meetUrl(room.publicToken))}
  }
  const remove=async(room:MeetRoom)=>{
    if(!canWrite || !window.confirm('Excluir a reunião "'+room.title+'"?'))return
    try{await deleteMeetRoom(room,mode);setRooms(list=>list.filter(r=>r.id!==room.id));setNotice('Reunião excluída.')}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível excluir a reunião.')}
  }
  const join=async(room:MeetRoom)=>{
    if(!user)return
    try{
      if(room.status!=='live')room=await statusUpdate(room,'live')
      setActive(room)
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível iniciar a reunião.')}
  }
  const groups=useMemo(()=>{
    const upcoming=rooms.filter(r=>r.status==='scheduled'||r.status==='live')
    const history=rooms.filter(r=>r.status==='completed'||r.status==='cancelled')
    return {upcoming,history}
  },[rooms])
  if(active && user)return <MeetRoomSession room={publicView(active)} displayName={user.displayName||'Anfitrião'} isHost
    onLeave={()=>{setActive(null);void refresh()}}
    onEnd={async()=>{try{await statusUpdate(active,'completed')}catch(e){setError(e instanceof Error?e.message:'Falha ao concluir a reunião.')}}}/>
  const row=(room:MeetRoom)=><article key={room.id} className="rtmeet-card">
    <div className="rtmeet-card-main">
      <span className={'rtmeet-state rtmeet-state--'+room.status}>{label(room.status)}</span>
      <h3>{room.title}</h3>
      {room.agenda&&<p>{room.agenda}</p>}
      <div className="rtmeet-meta"><CalendarDays size={15}/>{new Date(room.startsAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}<span>·</span><Clock3 size={15}/>{Math.max(15,Math.round((new Date(room.endsAt).getTime()-new Date(room.startsAt).getTime())/60000))} min</div>
    </div>
    <div className="rtmeet-card-actions">
      <Button size="sm" variant="secondary" onClick={()=>void copy(room)}><Copy size={15}/> Copiar link</Button>
      {room.status!=='cancelled'&&room.status!=='completed'&&<Button size="sm" onClick={()=>void join(room)} disabled={!canWrite}><Video size={16}/> Entrar</Button>}
      {canWrite&&<button className="rtmeet-icon-button" title="Excluir reunião" aria-label="Excluir reunião" onClick={()=>void remove(room)}><Trash2 size={17}/></button>}
    </div>
  </article>
  return <div className="rtmeet-page">
    <div className="rtmeet-heading">
      <div><span className="eyebrow">COMUNICAÇÃO · VIDEOCONFERÊNCIA</span><h1>RealTalent Meet</h1><p>Reuniões por vídeo com convite por link e registro na Agenda do CRM.</p></div>
      <div className="rtmeet-heading-actions"><Button variant="secondary" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={16}/> Atualizar</Button><Button onClick={()=>setCreating(true)} disabled={!canWrite}><Plus size={17}/> Nova reunião</Button></div>
    </div>
    {error && <div className="rtmeet-alert" role="alert">{error}</div>}
    {notice && <div className="rtmeet-success" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Fechar aviso">×</button></div>}
    {creating&&<section className="rtmeet-create panel" aria-label="Criar reunião">
      <div className="rtmeet-create-title"><h2>Nova reunião</h2><button onClick={()=>setCreating(false)} aria-label="Fechar"><XCircle size={20}/></button></div>
      <div className="rtmeet-fields"><label>Título<input autoFocus value={title} onChange={e=>setTitle(e.target.value)} maxLength={180} placeholder="Ex.: Apresentação de proposta"/></label><label>Data e horário<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Duração<select value={duration} onChange={e=>setDuration(Number(e.target.value))}><option value={15}>15 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option><option value={90}>90 min</option></select></label><label className="rtmeet-fields-wide">Vincular ao contato do CRM (opcional)<select value={leadId} onChange={e=>setLeadId(e.target.value)}><option value="">Sem vínculo</option>{leadOptions.map(item=><option key={item.id} value={item.id}>{item.name}{item.company?' · '+item.company:''}</option>)}</select></label><label className="rtmeet-fields-wide">Pauta (opcional)<textarea rows={2} value={agenda} onChange={e=>setAgenda(e.target.value)} placeholder="Objetivo e assuntos principais"/></label></div>
      <div className="rtmeet-create-actions"><Button variant="secondary" onClick={()=>setCreating(false)}>Cancelar</Button><Button onClick={()=>void add()} disabled={!title.trim()||busy}>{busy?'Criando...':'Criar reunião'}</Button></div>
    </section>}
    <section className="rtmeet-section"><div className="rtmeet-section-header"><div><Video size={19}/><h2>Próximas e em andamento</h2></div><span>{groups.upcoming.length}</span></div>
      {groups.upcoming.length? <div className="rtmeet-list">{groups.upcoming.map(row)}</div>:<div className="rtmeet-empty"><Video size={28}/><h3>Nenhuma reunião agendada</h3><p>Crie uma sala para gerar o convite e adicioná-la à Agenda.</p>{canWrite&&<Button onClick={()=>setCreating(true)}><Plus size={16}/> Criar reunião</Button>}</div>}
    </section>
    {groups.history.length>0&&<section className="rtmeet-section"><div className="rtmeet-section-header"><div><CheckCircle2 size={19}/><h2>Histórico de reuniões</h2></div><span>{groups.history.length}</span></div><div className="rtmeet-list">{groups.history.map(row)}</div></section>}
    <div className="rtmeet-footnote"><ExternalLink size={15}/> Convites podem ser abertos sem uma conta no CRM. O vídeo usa conexão WebRTC ponto a ponto; redes restritas podem exigir um servidor TURN.</div>
  </div>
}
