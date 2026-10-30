import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Copy, LogOut, MessageSquare, Mic, MicOff, MonitorUp, Send, Users, Video } from 'lucide-react'
import { getSupabaseClient } from '../../lib/supabase'
import { meetUrl, type PublicMeetRoom } from '../../services/realtalent-meet'
import '../../styles/realtalent-meet.css'

type Signal = { type: 'join' | 'offer' | 'answer' | 'ice' | 'leave' | 'chat' | 'end'; from: string; to?: string; name?: string; text?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
type ChatItem = { id: string; name: string; text: string }
type PeerStream = { id: string; name: string; stream: MediaStream }
const iceServers: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }
function VideoTile({ stream, label, muted = false }: { stream: MediaStream | null; label: string; muted?: boolean }) {
  const el = useRef<HTMLVideoElement>(null)
  useEffect(() => { if(el.current) el.current.srcObject = stream }, [stream])
  return <div className="rtmeet-tile"><video ref={el} autoPlay playsInline muted={muted}/><span>{label}</span></div>
}
export function MeetRoomSession({ room, displayName, isHost, onLeave, onEnd }: {
  room: PublicMeetRoom
  displayName: string
  isHost?: boolean
  onLeave(): void
  onEnd?(): Promise<void>
}) {
  const [selfId] = useState(() => crypto.randomUUID())
  const [stream, setStream] = useState<MediaStream | null>(null)
  const localRef = useRef<MediaStream | null>(null)
  const [peers, setPeers] = useState<PeerStream[]>([])
  const pcs = useRef(new Map<string,RTCPeerConnection>())
  const peerNames = useRef(new Map<string,string>())
  const pending = useRef(new Map<string,RTCIceCandidateInit[]>())
  const channel = useRef<any>(null)
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const [screenOn, setScreenOn] = useState(false)
  const [message, setMessage] = useState('')
  const [chat, setChat] = useState<ChatItem[]>([])
  const [chatOpen, setChatOpen] = useState(true)
  const [notice, setNotice] = useState('')
  const [connecting, setConnecting] = useState(true)
  const screenRef = useRef<MediaStream | null>(null)
  const leaving = useRef(false)

  const broadcast = useCallback(async (signal: Omit<Signal,'from'>) => {
    if(!channel.current) return
    try { await channel.current.send({type:'broadcast',event:'signal',payload:{...signal,from:selfId,name:displayName}}) }
    catch { setNotice('Falha de comunicação com a sala. Verifique sua conexão.') }
  },[displayName,selfId])
  const disconnectPeer = useCallback((id: string) => {
    pcs.current.get(id)?.close()
    pcs.current.delete(id)
    pending.current.delete(id)
    peerNames.current.delete(id)
    setPeers(p=>p.filter(x=>x.id!==id))
  },[])
  const createPeer = useCallback((id: string, name: string) => {
    let pc = pcs.current.get(id)
    if(pc) return pc
    pc = new RTCPeerConnection(iceServers)
    pcs.current.set(id,pc)
    peerNames.current.set(id,name)
    for(const track of localRef.current?.getTracks()||[]) pc.addTrack(track,localRef.current!)
    pc.onicecandidate = (ev) => { if(ev.candidate) void broadcast({type:'ice',to:id,candidate:ev.candidate.toJSON()}) }
    pc.ontrack = (ev) => {
      const next = ev.streams[0] || new MediaStream([ev.track])
      setPeers(items => [...items.filter(x=>x.id!==id),{id,name:peerNames.current.get(id)||name,stream:next}])
    }
    pc.onconnectionstatechange = () => {
      if(pc?.connectionState==='failed') setNotice('A conexão de mídia falhou. Para redes restritas é necessário configurar TURN.')
      if(pc?.connectionState==='closed') disconnectPeer(id)
    }
    return pc
  },[broadcast,disconnectPeer])

  useEffect(() => {
    let active = true
    const client = getSupabaseClient()
    const applyIce = async (id:string, pc:RTCPeerConnection) => {
      const queued=pending.current.get(id)||[]
      pending.current.delete(id)
      for(const candidate of queued) {try{await pc.addIceCandidate(candidate)}catch{/* expired */}}
    }
    const handle = async (signal:Signal) => {
      if(!active || !signal || signal.from===selfId || (signal.to && signal.to!==selfId))return
      if(signal.type==='chat') {setChat(x=>[...x,{id:crypto.randomUUID(),name:signal.name||'Convidado',text:signal.text||''}]);return}
      if(signal.type==='end'){setNotice('O anfitrião encerrou a reunião.');return}
      if(signal.type==='leave'){disconnectPeer(signal.from);return}
      if(signal.type==='ice'){
        const pc=pcs.current.get(signal.from)
        if(pc?.remoteDescription && signal.candidate) {try{await pc.addIceCandidate(signal.candidate)}catch{/* connection reset */}}
        else if(signal.candidate) pending.current.set(signal.from,[...(pending.current.get(signal.from)||[]),signal.candidate])
        return
      }
      if(signal.type==='join'){
        const pc=createPeer(signal.from,signal.name||'Convidado')
        if(pc.signalingState!=='stable')return
        const offer=await pc.createOffer()
        await pc.setLocalDescription(offer)
        await broadcast({type:'offer',to:signal.from,sdp:offer})
        return
      }
      if(signal.type==='offer' && signal.sdp){
        const pc=createPeer(signal.from,signal.name||'Convidado')
        if(pc.signalingState!=='stable') return
        await pc.setRemoteDescription(signal.sdp)
        await applyIce(signal.from,pc)
        const answer=await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await broadcast({type:'answer',to:signal.from,sdp:answer})
        return
      }
      if(signal.type==='answer' && signal.sdp){
        const pc=pcs.current.get(signal.from)
        if(pc && pc.signalingState==='have-local-offer'){await pc.setRemoteDescription(signal.sdp);await applyIce(signal.from,pc)}
      }
    }
    const start=async()=>{
      try {
        const media=await navigator.mediaDevices.getUserMedia({audio:true,video:true})
        if(!active){media.getTracks().forEach(x=>x.stop());return}
        localRef.current=media
        setStream(media)
      } catch { if(active) setNotice('Câmera ou microfone indisponíveis. Você ainda pode participar do chat.') }
      if(!active)return
      if(client){
        const ch=client.channel('realtalent-meet:'+room.publicToken)
        channel.current=ch
        ch.on('broadcast',{event:'signal'},({payload}:any)=>{void handle(payload as Signal).catch(()=>setNotice('Falha na negociação de mídia. Tente sair e entrar novamente.'))})
        ch.subscribe((status:string)=>{
          if(!active)return
          if(status==='SUBSCRIBED'){setConnecting(false);void broadcast({type:'join'})}
          if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){setConnecting(false);setNotice('Não foi possível abrir o canal em tempo real do Supabase.')}
        })
      }else{
        setConnecting(false)
        setNotice('Modo local: reuniões compartilhadas precisam do Supabase conectado.')
      }
    }
    void start()
    return ()=>{
      active=false
      leaving.current=true
      if(channel.current) {void channel.current.send({type:'broadcast',event:'signal',payload:{type:'leave',from:selfId,name:displayName}});void client?.removeChannel(channel.current);channel.current=null}
      pcs.current.forEach(pc=>pc.close());pcs.current.clear()
      localRef.current?.getTracks().forEach(t=>t.stop())
      screenRef.current?.getTracks().forEach(t=>t.stop())
    }
  // Intentionally establish the room only once per token and identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[room.publicToken,selfId])

  const toggleAudio=()=>{
    const next=!micOn
    localRef.current?.getAudioTracks().forEach(t=>{t.enabled=next})
    setMicOn(next)
  }
  const toggleVideo=()=>{
    const next=!cameraOn
    localRef.current?.getVideoTracks().forEach(t=>{t.enabled=next})
    setCameraOn(next)
  }
  const shareScreen=async()=>{
    if(screenOn){screenRef.current?.getTracks().forEach(t=>t.stop());return}
    try{
      const capture=await navigator.mediaDevices.getDisplayMedia({video:true})
      screenRef.current=capture
      const video=capture.getVideoTracks()[0]
      const replace=async(track:MediaStreamTrack|null)=>{
        for(const pc of pcs.current.values())for(const sender of pc.getSenders())if(sender.track?.kind==='video')await sender.replaceTrack(track)
      }
      await replace(video)
      setScreenOn(true)
      video.onended=()=>{void replace(localRef.current?.getVideoTracks()[0]||null);setScreenOn(false)}
    }catch{setNotice('Compartilhamento de tela cancelado ou bloqueado.')}
  }
  const send=()=>{
    const value=message.trim()
    if(!value || !room.settings.chat)return
    setChat(x=>[...x,{id:crypto.randomUUID(),name:displayName,text:value}])
    setMessage('')
    void broadcast({type:'chat',text:value})
  }
  const leave=()=>{onLeave()}
  const end=async()=>{
    await broadcast({type:'end'})
    if(onEnd)await onEnd()
    onLeave()
  }
  return <div className="rtmeet-call">
    <header className="rtmeet-call-header"><div className="rtmeet-brand"><Video size={19}/><span>RealTalent Meet</span><small>{room.title}</small></div><div><span className="rtmeet-badge"><Users size={14}/> {peers.length+1}</span><button onClick={()=>{void navigator.clipboard.writeText(meetUrl(room.publicToken)).then(()=>setNotice('Link copiado.')).catch(()=>setNotice('Copie o link da barra de endereço.'))}}><Copy size={15}/> Convidar</button></div></header>
    {notice && <div className="rtmeet-notice" role="status">{notice}<button aria-label="Dispensar aviso" onClick={()=>setNotice('')}>×</button></div>}
    <div className="rtmeet-call-body"><div className="rtmeet-video-grid">
      <VideoTile stream={stream} label={displayName+' (você)'} muted />
      {peers.map(p=><VideoTile key={p.id} stream={p.stream} label={p.name}/>)}
      {connecting && <div className="rtmeet-connecting">Conectando à sala...</div>}
      {peers.length===0 && !connecting && <p className="rtmeet-alone">Sala aberta. Envie o convite para receber participantes.</p>}
    </div>
    {chatOpen && room.settings.chat && <aside className="rtmeet-chat"><header><strong>Chat da reunião</strong><button aria-label="Fechar chat" onClick={()=>setChatOpen(false)}>×</button></header><div className="rtmeet-chat-items">{chat.map(c=><p key={c.id}><strong>{c.name}</strong><span>{c.text}</span></p>)}</div><form onSubmit={e=>{e.preventDefault();send()}}><input aria-label="Mensagem" value={message} onChange={e=>setMessage(e.target.value)} placeholder="Escrever mensagem..." maxLength={2000}/><button type="submit" disabled={!message.trim()} aria-label="Enviar"><Send size={16}/></button></form></aside>}
    </div>
    <footer className="rtmeet-controls">
      <button onClick={toggleAudio} aria-label={micOn?'Desativar microfone':'Ativar microfone'}>{micOn?<Mic/>:<MicOff/>}<span>Microfone</span></button>
      <button onClick={toggleVideo} aria-label={cameraOn?'Desativar câmera':'Ativar câmera'}>{cameraOn?<Camera/>:<CameraOff/>}<span>Câmera</span></button>
      {room.settings.screenShare && <button onClick={()=>void shareScreen()} className={screenOn?'is-active':''}><MonitorUp/><span>{screenOn?'Parar tela':'Compartilhar'}</span></button>}
      {room.settings.chat && <button onClick={()=>setChatOpen(v=>!v)}><MessageSquare/><span>Chat</span></button>}
      <button className="rtmeet-leave" onClick={leave}><LogOut/><span>Sair</span></button>
      {isHost && <button className="rtmeet-end" onClick={()=>void end()}><LogOut/><span>Encerrar</span></button>}
    </footer>
  </div>
}
