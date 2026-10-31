import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Copy, LogOut, MessageSquare, Mic, MicOff, MonitorUp, Send, Users, Video, ClipboardList } from 'lucide-react'
import { getSupabaseClient } from '../../lib/supabase'
import { getPublicMeetRoom, meetUrl, type PublicMeetRoom } from '../../services/realtalent-meet'
import { MeetPrejoin, type MeetPreparation } from './meet-prejoin'
import { MeetContextPanel, type MeetCommercialContext } from './meet-context-panel'
import '../../styles/realtalent-meet.css'

type Signal = { type: 'join' | 'hello' | 'offer' | 'answer' | 'ice' | 'leave' | 'chat' | 'end'; from: string; to?: string; name?: string; text?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
type ChatItem = { id: string; name: string; text: string }
type PeerStream = { id: string; name: string; stream: MediaStream }
const iceServers: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }
function VideoTile({ stream, label, muted = false }: { stream: MediaStream | null; label: string; muted?: boolean }) {
  const el = useRef<HTMLVideoElement>(null)
  useEffect(() => { if(el.current) el.current.srcObject = stream }, [stream])
  return <div className="rtmeet-tile"><video ref={el} autoPlay playsInline muted={muted}/><span>{label}</span></div>
}
type SessionProps = {room:PublicMeetRoom; displayName:string; isHost?:boolean; onLeave():void; onEnd?():Promise<void>;
  commercialContext?:MeetCommercialContext; onSaveNote?:(text:string)=>Promise<void>}
export function MeetRoomSession(props:SessionProps){
  const [preparation,setPreparation]=useState<MeetPreparation|null>(null)
  if(!preparation)return <MeetPrejoin room={props.room} displayName={props.displayName}
    onJoin={setPreparation} onBack={props.onLeave}/>
  return <ConnectedRoom {...props} preparation={preparation}/>
}
function ConnectedRoom({ room, displayName, isHost, onLeave, onEnd, preparation, commercialContext, onSaveNote }: SessionProps & {preparation:MeetPreparation}) {
  const [selfId] = useState(() => crypto.randomUUID())
  const [stream, setStream] = useState<MediaStream | null>(preparation.stream)
  const localRef = useRef<MediaStream | null>(preparation.stream)
  const [peers, setPeers] = useState<PeerStream[]>([])
  const pcs = useRef(new Map<string,RTCPeerConnection>())
  const peerNames = useRef(new Map<string,string>())
  const pending = useRef(new Map<string,RTCIceCandidateInit[]>())
  const iceConfigRef = useRef<RTCConfiguration>(iceServers)
  const channel = useRef<any>(null)
  const [micOn, setMicOn] = useState(preparation.micOn)
  const [cameraOn, setCameraOn] = useState(preparation.cameraOn)
  const [screenOn, setScreenOn] = useState(false)
  const [message, setMessage] = useState('')
  const [chat, setChat] = useState<ChatItem[]>([])
  const [panel, setPanel] = useState<'chat'|'context'|null>(null)
  const [notice, setNotice] = useState('')
  const [connecting, setConnecting] = useState(true)
  const screenRef = useRef<MediaStream | null>(null)
  const [startedAt] = useState(Date.now)
  const [seconds,setSeconds] = useState(0)
  useEffect(()=>{const timer=window.setInterval(()=>setSeconds(Math.floor((Date.now()-startedAt)/1000)),1000);return()=>window.clearInterval(timer)},[startedAt])
  const clock=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`

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
    pc = new RTCPeerConnection(iceConfigRef.current)
    pcs.current.set(id,pc)
    peerNames.current.set(id,name)
    for(const track of localRef.current?.getTracks()||[]) pc.addTrack(track,localRef.current!)
    pc.onicecandidate = (ev) => { if(ev.candidate) void broadcast({type:'ice',to:id,candidate:ev.candidate.toJSON()}) }
    pc.ontrack = (ev) => {
      const next = ev.streams[0] || new MediaStream([ev.track])
      setPeers(items => [...items.filter(x=>x.id!==id),{id,name:peerNames.current.get(id)||name,stream:next}])
    }
    pc.onconnectionstatechange = () => {
      if(pc?.connectionState==='disconnected'){
        window.setTimeout(()=>{
          if(pc?.connectionState!=='disconnected')return
          pc.restartIce()
          if(selfId<id && pc.signalingState==='stable'){
            void (async()=>{const offer=await pc.createOffer({iceRestart:true});await pc.setLocalDescription(offer);await broadcast({type:'offer',to:id,sdp:offer})})()
              .catch(()=>setNotice('Falha na reconexão de mídia. Tente entrar novamente.'))
          }
        },3500)
      }
      if(pc?.connectionState==='failed') setNotice('A rede bloqueou a chamada. Configure um servidor TURN para permitir conexões restritas.')
      if(pc?.connectionState==='closed') disconnectPeer(id)
    }
    return pc
  },[broadcast,disconnectPeer,selfId])

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
      if(signal.type==='end'){
        // A client broadcast alone never proves host authority.
        const latest=await getPublicMeetRoom(room.publicToken).catch(()=>undefined)
        if(latest===null){setNotice('A reunião foi encerrada.');onLeave()}
        return
      }
      if(signal.type==='leave'){disconnectPeer(signal.from);return}
      if(signal.type==='ice'){
        const pc=pcs.current.get(signal.from)
        if(pc?.remoteDescription && signal.candidate) {try{await pc.addIceCandidate(signal.candidate)}catch{/* connection reset */}}
        else if(signal.candidate) pending.current.set(signal.from,[...(pending.current.get(signal.from)||[]),signal.candidate])
        return
      }
      if(signal.type==='join'||signal.type==='hello'){
        if(signal.type==='join')await broadcast({type:'hello',to:signal.from})
        // Deterministic offerer prevents simultaneous-offer glare.
        if(selfId>signal.from)return
        if(pcs.current.size>=room.settings.maxPeers && !pcs.current.has(signal.from)){
          setNotice('A sala atingiu a capacidade definida.');return
        }
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
      // Prepared media is transferred from prejoin. No second permission prompt.
      localRef.current=preparation.stream
      setStream(preparation.stream)
      if(!active)return
      if(client){
        // Optional coturn relay: ephemeral credentials come from Supabase, never bundled in the app.
        try{
          const {data,error}=await client.functions.invoke('meet-turn-credentials',{body:{token:room.publicToken}})
          if(!error&&Array.isArray(data?.iceServers)){
            const valid=data.iceServers.filter((s:unknown)=>s&&typeof s==='object'&&
              typeof (s as RTCIceServer).username==='string'&&typeof (s as RTCIceServer).credential==='string'&&
              Array.isArray((s as RTCIceServer).urls)&&((s as RTCIceServer).urls as string[]).every(u=>/^turns?:/i.test(u)))
            if(valid.length)iceConfigRef.current={iceServers:[...(iceServers.iceServers||[]),...valid]}
          }
        }catch{/* STUN-only fallback until coturn is configured */}
        if(!active)return
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
      if(channel.current) {void channel.current.send({type:'broadcast',event:'signal',payload:{type:'leave',from:selfId,name:displayName}});void client?.removeChannel(channel.current);channel.current=null}
      pcs.current.forEach(pc=>pc.close());pcs.current.clear()
      localRef.current?.getTracks().forEach(t=>t.stop())
      screenRef.current?.getTracks().forEach(t=>t.stop())
    }
  // Intentionally establish the room only once per token and identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[room.publicToken,selfId])

  useEffect(()=>{
    if(isHost)return
    const timer=window.setInterval(()=>{
      void getPublicMeetRoom(room.publicToken).then(latest=>{
        if(!latest){setNotice('Esta reunião foi encerrada.');onLeave()}
      }).catch(()=>{/* recover on next poll */})
    },10000)
    return()=>window.clearInterval(timer)
  },[isHost,onLeave,room.publicToken])
  const toggleAudio=()=>{
    if(!localRef.current?.getAudioTracks().length){setNotice('Microfone indisponível. Saia e selecione um dispositivo na preparação.');return}
    const next=!micOn
    localRef.current?.getAudioTracks().forEach(t=>{t.enabled=next})
    setMicOn(next)
  }
  const toggleVideo=()=>{
    if(!localRef.current?.getVideoTracks().length){setNotice('Câmera indisponível. Saia e selecione um dispositivo na preparação.');return}
    const next=!cameraOn
    localRef.current?.getVideoTracks().forEach(t=>{t.enabled=next})
    setCameraOn(next)
  }
  const shareScreen=async()=>{
    if(screenOn){
      screenRef.current?.getTracks().forEach(t=>t.stop())
      const camera=localRef.current?.getVideoTracks()[0]||null
      for(const pc of pcs.current.values())for(const sender of pc.getSenders())if(sender.track?.kind==='video')await sender.replaceTrack(camera)
      setScreenOn(false)
      return
    }
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
    if(!onEnd)return
    try{
      await onEnd() // Host must persist an authorized status change first.
      await broadcast({type:'end'})
      onLeave()
    }catch{setNotice('Não foi possível encerrar a sala no servidor. Tente novamente.')}
  }
  return <div className="rtmeet-call">
    <header className="rtmeet-call-header"><div className="rtmeet-brand"><Video size={19}/><span>RealTalent Meet</span><small>{room.title}</small></div><div><span className="rtmeet-badge">⏱ {clock}</span><span className="rtmeet-badge"><Users size={14}/> {peers.length+1}</span><button onClick={()=>{void navigator.clipboard.writeText(meetUrl(room.publicToken)).then(()=>setNotice('Link copiado.')).catch(()=>setNotice('Copie o link da barra de endereço.'))}}><Copy size={15}/> Convidar</button></div></header>
    {notice && <div className="rtmeet-notice" role="status">{notice}<button aria-label="Dispensar aviso" onClick={()=>setNotice('')}>×</button></div>}
    <div className="rtmeet-call-body"><div className="rtmeet-video-grid">
      <VideoTile stream={stream} label={displayName+' (você)'} muted />
      {peers.map(p=><VideoTile key={p.id} stream={p.stream} label={p.name}/>)}
      {connecting && <div className="rtmeet-connecting">Conectando à sala...</div>}
      {peers.length===0 && !connecting && <p className="rtmeet-alone">Sala aberta. Envie o convite para receber participantes.</p>}
    </div>
    {panel==='chat' && room.settings.chat && <aside className="rtmeet-chat"><header><strong>Chat da reunião</strong><button aria-label="Fechar chat" onClick={()=>setPanel(null)}>×</button></header><div className="rtmeet-chat-items">{chat.map(c=><p key={c.id}><strong>{c.name}</strong><span>{c.text}</span></p>)}</div><form onSubmit={e=>{e.preventDefault();send()}}><input aria-label="Mensagem" value={message} onChange={e=>setMessage(e.target.value)} placeholder="Escrever mensagem..." maxLength={2000}/><button type="submit" disabled={!message.trim()} aria-label="Enviar"><Send size={16}/></button></form></aside>}
    {panel==='context' && isHost && <aside className="rtmeet-chat rtmeet-context-panel"><header><strong>Contexto da reunião</strong><button aria-label="Fechar contexto" onClick={()=>setPanel(null)}>×</button></header><MeetContextPanel room={room} context={commercialContext} onSaveNote={onSaveNote}/></aside>}
    </div>
    <footer className="rtmeet-controls">
      <button onClick={toggleAudio} aria-label={micOn?'Desativar microfone':'Ativar microfone'}>{micOn?<Mic/>:<MicOff/>}<span>Microfone</span></button>
      <button onClick={toggleVideo} aria-label={cameraOn?'Desativar câmera':'Ativar câmera'}>{cameraOn?<Camera/>:<CameraOff/>}<span>Câmera</span></button>
      {room.settings.screenShare && <button onClick={()=>void shareScreen()} className={screenOn?'is-active':''}><MonitorUp/><span>{screenOn?'Parar tela':'Compartilhar'}</span></button>}
      {room.settings.chat && <button className={panel==='chat'?'is-active':''} onClick={()=>setPanel(v=>v==='chat'?null:'chat')}><MessageSquare/><span>Chat</span></button>}
      {isHost && <button className={panel==='context'?'is-active':''} onClick={()=>setPanel(v=>v==='context'?null:'context')}><ClipboardList/><span>Contexto</span></button>}
      <button className="rtmeet-leave" onClick={leave}><LogOut/><span>Sair</span></button>
      {isHost && <button className="rtmeet-end" onClick={()=>void end()}><LogOut/><span>Encerrar</span></button>}
    </footer>
  </div>
}
