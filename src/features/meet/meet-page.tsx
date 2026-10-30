import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock3, Copy, ExternalLink, MoreHorizontal, Plus, RefreshCw, Search, Trash2, Video, XCircle } from 'lucide-react'
import { useAppActions, useAppNavigation, useAppWorkspace } from '../../app/app-context'
import { useAuth } from '../auth/auth-context'
import { Button } from '../../components/ui/button'
import { changeMeetRoom, createMeetRoom, deleteMeetRoom, listMeetRooms, meetUrl, type MeetRoom, type PublicMeetRoom } from '../../services/realtalent-meet'
import { MeetRoomSession } from './meet-room'
import { MeetWrapUp } from './meet-wrap-up'
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
  const {createCalendarEvent,createActivity}=useAppActions()
  const {setRoute}=useAppNavigation()
  const [rooms,setRooms]=useState<MeetRoom[]>([])
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [active,setActive]=useState<MeetRoom|null>(null)
  const [wrapRoom,setWrapRoom]=useState<MeetRoom|null>(null)
  const [creating,setCreating]=useState(false)
  const [tab,setTab]=useState<'upcoming'|'history'>('upcoming')
  const [search,setSearch]=useState('')
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
  const add=async(kind:'scheduled'|'instant'='scheduled')=>{
    if(!workspaceId || !user || !canWrite)return
    setBusy(true);setError('')
    try{
      const startsAt=kind==='instant'?new Date():new Date(start)
      if(Number.isNaN(startsAt.getTime()))throw new Error('Escolha uma data e horário válidos.')
      const endsAt=new Date(startsAt.getTime()+duration*60_000)
      let room=await createMeetRoom({workspaceId,createdBy:user.id,hostName:user.displayName||'RealTalent',
        title:kind==='instant'?'Reunião imediata':title,agenda:kind==='instant'?'':agenda,startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString(),leadId: kind==='instant'?null:selectedLead?.id ?? null,
        contactId: kind==='instant'?null:selectedLead?.primaryContactId ?? null,companyId:kind==='instant'?null:selectedLead?.companyId ?? null,opportunityId:kind==='instant'?null:selectedLead?.opportunityId ?? null},mode)
      if(kind==='instant')room=await changeMeetRoom(room,'live',mode)
      setRooms(list=>[room,...list])
      setCreating(false);setTitle('');setLeadId('');setAgenda('');setStart(initialStart())
      setNotice(kind==='instant'?'Sala pronta. Confira câmera e microfone.':'Sala criada. Copie o convite ou entre na reunião.')
      if(kind==='instant')setActive(room)
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
    const q=search.trim().toLocaleLowerCase('pt-BR')
    const matching=rooms.filter(r=>!q||[r.title,r.agenda,r.hostName].some(x=>x.toLocaleLowerCase('pt-BR').includes(q)))
    const upcoming=matching.filter(r=>r.status==='scheduled'||r.status==='live')
      .sort((a,b)=>a.status==='live'?-1:b.status==='live'?1:a.startsAt.localeCompare(b.startsAt))
    const history=matching.filter(r=>r.status==='completed'||r.status==='cancelled')
    return {upcoming,history}
  },[rooms,search])
  if(wrapRoom && user){
    return <MeetWrapUp room={wrapRoom} onSkip={()=>{setWrapRoom(null);void refresh()}}
      onFinish={async(outcome,next,dueAt)=>{
        if(outcome)await createActivity({leadId:wrapRoom.leadId,contactId:wrapRoom.contactId,
          type:'note',title:'Resultado · '+wrapRoom.title,description:outcome,
          dueAt:null,completedAt:null,assignedTo:user.id})
        if(next)await createActivity({leadId:wrapRoom.leadId,contactId:wrapRoom.contactId,
          type:'followup',title:next,description:'Próxima ação após '+wrapRoom.title,
          dueAt,completedAt:null,assignedTo:user.id})
        setWrapRoom(null)
        setNotice('Resultado e próximas ações registrados no CRM.')
        await refresh()
      }}/>
  }
  if(active && user){
    const lead=leadOptions.find(x=>x.id===active.leadId)
    const opportunity=snapshot?.opportunities?.find(x=>x.id===active.opportunityId)
    return <MeetRoomSession room={publicView(active)} displayName={user.displayName||'Anfitrião'} isHost
      commercialContext={{customer:lead?.name||'',company:lead?.company||'',opportunity:opportunity?.title||'',stage:''}}
      onSaveNote={async(text)=>{await createActivity({leadId:active.leadId,contactId:active.contactId,
        type:'note',title:'Anotações · '+active.title,description:text,dueAt:null,completedAt:null,assignedTo:user.id})}}
      onLeave={()=>{setActive(null);void refresh()}}
      onEnd={async()=>{try{await statusUpdate(active,'completed');setWrapRoom(active)}catch(e){setError(e instanceof Error?e.message:'Falha ao concluir a reunião.');throw e}}}/>
  }
  const row=(room:MeetRoom)=><article key={room.id} className="rtmeet-card">
    <div className="rtmeet-card-main">
      <span className={'rtmeet-state rtmeet-state--'+room.status}>{label(room.status)}</span>
      <h3>{room.title}</h3>
      {room.agenda&&<p>{room.agenda}</p>}
      <div className="rtmeet-meta"><CalendarDays size={15}/>{new Date(room.startsAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}<span>·</span><Clock3 size={15}/>{Math.max(15,Math.round((new Date(room.endsAt).getTime()-new Date(room.startsAt).getTime())/60000))} min</div>
    </div>
    <div className="rtmeet-card-actions">
      {room.status!=='cancelled'&&room.status!=='completed'&&<Button size="sm" onClick={()=>void join(room)} disabled={!canWrite}><Video size={16}/> Entrar</Button>}
      <details className="rtmeet-more"><summary title="Mais opções" aria-label="Mais opções"><MoreHorizontal size={19}/></summary>
        <div className="rtmeet-more-menu"><button onClick={()=>void copy(room)}><Copy size={15}/> Copiar convite</button>
          {canWrite&&<button className="rtmeet-danger-action" onClick={()=>void remove(room)}><Trash2 size={15}/> Excluir</button>}
        </div>
      </details>
    </div>
  </article>
  return <div className="rtmeet-page">
    <div className="rtmeet-heading">
      <div><span className="eyebrow">COMUNICAÇÃO · VIDEOCONFERÊNCIA</span><h1>Reuniões</h1><p>Prepare encontros, converse e acompanhe os próximos passos.</p></div>
      <div className="rtmeet-heading-actions">
        <Button variant="secondary" onClick={()=>setRoute('agenda')}><CalendarDays size={16}/> Agenda</Button>
        <Button variant="secondary" onClick={()=>{setCreating(true);setTab('upcoming')}} disabled={!canWrite}><CalendarDays size={16}/> Agendar</Button>
        <Button onClick={()=>void add('instant')} disabled={!canWrite||busy}><Video size={17}/> Iniciar agora</Button>
      </div>
    </div>
    {error && <div className="rtmeet-alert" role="alert">{error}</div>}
    {notice && <div className="rtmeet-success" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Fechar aviso">×</button></div>}
    {creating&&<section className="rtmeet-create panel" aria-label="Criar reunião">
      <div className="rtmeet-create-title"><h2>Nova reunião</h2><button onClick={()=>setCreating(false)} aria-label="Fechar"><XCircle size={20}/></button></div>
      <div className="rtmeet-fields"><label>Título<input autoFocus value={title} onChange={e=>setTitle(e.target.value)} maxLength={180} placeholder="Ex.: Apresentação de proposta"/></label><label>Data e horário<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Duração<select value={duration} onChange={e=>setDuration(Number(e.target.value))}><option value={15}>15 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option><option value={90}>90 min</option></select></label><label className="rtmeet-fields-wide">Vincular ao contato do CRM (opcional)<select value={leadId} onChange={e=>setLeadId(e.target.value)}><option value="">Sem vínculo</option>{leadOptions.map(item=><option key={item.id} value={item.id}>{item.name}{item.company?' · '+item.company:''}</option>)}</select></label><label className="rtmeet-fields-wide">Pauta (opcional)<textarea rows={2} value={agenda} onChange={e=>setAgenda(e.target.value)} placeholder="Objetivo e assuntos principais"/></label></div>
      <div className="rtmeet-create-actions"><Button variant="secondary" onClick={()=>setCreating(false)}>Cancelar</Button><Button onClick={()=>void add('scheduled')} disabled={!title.trim()||busy}>{busy?'Criando...':'Agendar reunião'}</Button></div>
    </section>}
    <div className="rtmeet-navigation">
      <div className="rtmeet-tabs" role="tablist" aria-label="Visualizar reuniões">
        <button role="tab" aria-selected={tab==='upcoming'} className={tab==='upcoming'?'is-active':''} onClick={()=>setTab('upcoming')}>Próximas <span>{groups.upcoming.length}</span></button>
        <button role="tab" aria-selected={tab==='history'} className={tab==='history'?'is-active':''} onClick={()=>setTab('history')}>Histórico <span>{groups.history.length}</span></button>
      </div>
      <label className="rtmeet-search"><Search size={16}/><input placeholder="Buscar reuniões" value={search} onChange={e=>setSearch(e.target.value)} aria-label="Buscar reuniões"/></label>
      <button className="rtmeet-refresh" onClick={()=>void refresh()} disabled={loading} title="Atualizar reuniões"><RefreshCw size={17}/></button>
    </div>
    <section className="rtmeet-section" role="tabpanel">
      {tab==='upcoming'?(groups.upcoming.length? <div className="rtmeet-list">{groups.upcoming.map(row)}</div>:<div className="rtmeet-empty"><Video size={28}/><h3>Nenhuma reunião próxima</h3><p>Comece uma reunião agora ou agende um encontro com seu cliente.</p>{canWrite&&<Button onClick={()=>setCreating(true)}><Plus size={16}/> Agendar reunião</Button>}</div>)
        :(groups.history.length?<div className="rtmeet-list">{groups.history.map(row)}</div>:<div className="rtmeet-empty"><CheckCircle2 size={28}/><h3>Sem reuniões no histórico</h3><p>Os encontros concluídos aparecerão aqui.</p></div>)}
    </section>
    <div className="rtmeet-footnote"><ExternalLink size={15}/> Convites podem ser abertos sem uma conta no CRM. O vídeo usa conexão WebRTC ponto a ponto; redes restritas podem exigir um servidor TURN.</div>
  </div>
}
