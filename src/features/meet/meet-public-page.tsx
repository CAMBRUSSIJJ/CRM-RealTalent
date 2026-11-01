import { useEffect, useState } from 'react'
import { AlertTriangle, LoaderCircle, ShieldCheck, Video } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { getPublicMeetRoom, type PublicMeetRoom } from '../../services/realtalent-meet'
import { MeetRoomSession } from './meet-room'
import '../../styles/realtalent-meet.css'

export function MeetPublicPage({token}:{token:string}){
  const [room,setRoom]=useState<PublicMeetRoom|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [displayName,setDisplayName]=useState('')
  const [joined,setJoined]=useState(false)
  useEffect(()=>{
    let active=true
    setLoading(true)
    void getPublicMeetRoom(token).then(r=>{
      if(!active)return
      if(!r || r.status==='cancelled'||r.status==='completed')setError('Esta reunião não existe ou já foi encerrada.')
      else setRoom(r)
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Não foi possível localizar a reunião.')})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[token])
  if(loading)return <div className="rtmeet-public-state"><LoaderCircle className="spin"/><h2>Abrindo RealTalent Meet...</h2></div>
  if(error || !room)return <div className="rtmeet-public-state" role="alert"><AlertTriangle size={28}/><h1>Não foi possível abrir esta reunião</h1><p>{error||'Sala indisponível.'}</p></div>
  if(joined)return <MeetRoomSession room={room} displayName={displayName} onLeave={()=>setJoined(false)}/>
  return <main className="rtmeet-guest-page"><section className="rtmeet-guest-card">
    <div className="rtmeet-guest-brand"><Video size={24}/><strong>RealTalent Meet</strong></div>
    <span className="eyebrow">Convite de videoconferência</span>
    <h1>{room.title}</h1>
    <p>{room.agenda||('Reunião organizada por '+room.hostName)}</p>
    <div className="rtmeet-guest-time">{new Date(room.startsAt).toLocaleString('pt-BR',{dateStyle:'full',timeStyle:'short'})}</div>
    <label>Como você quer aparecer<input value={displayName} onChange={e=>setDisplayName(e.target.value)} autoFocus maxLength={80} placeholder="Seu nome"/></label>
    <p className="rtmeet-consent"><ShieldCheck size={16}/> A câmera e o microfone são solicitados pelo navegador. Esta versão não grava reuniões.</p>
    <Button size="lg" disabled={!displayName.trim()} onClick={()=>setJoined(true)}><Video size={18}/> Entrar na sala</Button>
    <small>Não é necessário ter uma conta no CRM.</small>
  </section></main>
}
