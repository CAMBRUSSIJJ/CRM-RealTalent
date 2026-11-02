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
function VideoTile({ stream, label, muted = false, screen = false }: { stream: MediaStream | null; label: string; muted?: boolean; screen?: boolean }) {
  const el = useRef<HTMLVideoElement>(null)
  const [hasVideo, setHasVideo] = useState(false)
  useEffect(() => {
    if(el.current) el.current.srcObject = stream
    const track = stream?.getVideoTracks()[0]
    const update = () => setHasVideo(Boolean(track && track.readyState === 'live' && track.enabled && !track.muted))
    update()
    track?.addEventListener('mute', update)
    track?.addEventListener('unmute', update)
    track?.addEventListener('ended', update)
    return () => {
      track?.removeEventListener('mute', update)
      track?.removeEventListener('unmute', update)
      track?.removeEventListener('ended', update)
    }
  }, [stream])
  return <div className={'rtmeet-tile' + (screen ? ' rtmeet-tile--screen' : '')}>
    <video ref={el} autoPlay playsInline muted={muted} aria-label={label} />
    {!hasVideo && <div className="rtmeet-tile-placeholder"><CameraOff size={30}/><span>Vídeo desligado</span></div>}
    <span className="rtmeet-tile-label">{label}</span>
  </div>
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
  const [panel, setPanel] = useState<'chat'|'context'|'people'|null>(null)
  const [notice, setNotice] = useState('')
  const [sharingBusy, setSharingBusy] = useState(false)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [connecting, setConnecting] = useState(true)
  const screenRef = useRef<MediaStream | null>(null)
  const [startedAt] = useState(Date.now)
  const [seconds,setSeconds] = useState(0)
  useEffect(()=>{const timer=window.setInterval(()=>setSeconds(Math.floor((Date.now()-startedAt)/1000)),1000);return()=>window.clearInterval(timer)},[startedAt])
  const clock=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`
  useEffect(() => {
    if(!notice)return
    const timer=window.setTimeout(()=>setNotice(''),6500)
    return()=>window.clearTimeout(timer)
  },[notice])
  const copyInvite=async()=>{
    const url=meetUrl(room.publicToken)
    try{await navigator.clipboard.writeText(url);setNotice('Link do convite copiado.')}
    catch{setNotice('Não foi possível copiar automaticamente. Link: '+url)}
  }

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
    const activeScreen=screenRef.current?.getVideoTracks()[0]
    let hasVideoSender=false
    for(const track of localRef.current?.getTracks()||[]){
      const outgoing=track.kind==='video' && activeScreen ? activeScreen : track
      const source=outgoing===activeScreen ? screenRef.current! : localRef.current!
      pc.addTrack(outgoing,source)
      if(outgoing.kind==='video')hasVideoSender=true
    }
    if(!hasVideoSender){
      if(activeScreen)pc.addTrack(activeScreen,screenRef.current!)
      else pc.addTransceiver('video',{direction:'sendrecv'})
    }
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
        if(pcs.current.size>=room.settings.maxPeers-1 && !pcs.current.has(signal.from)){
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
  const replaceVideo=async(track:MediaStreamTrack|null)=>{
    await Promise.all([...pcs.current.values()].map(async pc=>{
      if(pc.signalingState==='closed')return
      const sender=pc.getTransceivers().find(transceiver=>transceiver.receiver.track.kind==='video')?.sender
      if(sender)await sender.replaceTrack(track)
    }))
  }
  const shareScreen=async()=>{
    if(sharingBusy)return
    setSharingBusy(true)
    try{
      if(screenOn){
        const previous=screenRef.current
        screenRef.current=null
        setScreenOn(false)
        setScreenStream(null)
        await replaceVideo(localRef.current?.getVideoTracks()[0]||null)
        previous?.getTracks().forEach(t=>t.stop())
        return
      }
      if(!navigator.mediaDevices?.getDisplayMedia){
        setNotice('Este navegador não oferece compartilhamento de tela neste contexto.')
        return
      }
      const capture=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false})
      const video=capture.getVideoTracks()[0]
      if(!video){capture.getTracks().forEach(t=>t.stop());setNotice('Nenhuma tela foi selecionada.');return}
      try{await replaceVideo(video)}
      catch(e){capture.getTracks().forEach(t=>t.stop());throw e}
      screenRef.current=capture
      setScreenStream(capture)
      setScreenOn(true)
      video.onended=()=>{
        if(screenRef.current!==capture)return
        screenRef.current=null
        setScreenStream(null)
        setScreenOn(false)
        void replaceVideo(localRef.current?.getVideoTracks()[0]||null)
          .catch(()=>setNotice('Falha ao restaurar a câmera após compartilhar.'))
      }
    }catch(e){
      const name=e instanceof Error?e.name:''
      if(name==='AbortError')return
      if(name==='NotAllowedError'||name==='SecurityError'){
        setNotice('Compartilhamento não iniciado. Verifique as permissões do Firefox ou selecione outra janela.')
      }else{
        setNotice('Não foi possível compartilhar a tela. Tente novamente ou escolha outra janela.')
      }
    }finally{setSharingBusy(false)}
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
    if(!onEnd || !window.confirm('Encerrar a reunião para todos os participantes?'))return
    try{
      await onEnd() // Host must persist an authorized status change first.
      await broadcast({type:'end'})
      onLeave()
    }catch{setNotice('Não foi possível encerrar a sala no servidor. Tente novamente.')}
  }
  return <div className="rtmeet-call">
    <header className="rtmeet-call-header">
      <div className="rtmeet-brand"><Video size={19}/><span>RealTalent Meet</span><small title={room.title}>{room.title}</small></div>
      <div className="rtmeet-header-actions">
        <span className="rtmeet-badge" aria-label={'Duração '+clock}>{clock}</span>
        <button className={'rtmeet-participant-trigger'+(panel==='people'?' is-active':'')} type="button" onClick={()=>setPanel(v=>v==='people'?null:'people')} aria-label="Mostrar participantes" aria-pressed={panel==='people'}><Users size={15}/> {peers.length+1}</button>
        <button type="button" className="rtmeet-invite-button" onClick={()=>void copyInvite()}><Copy size={15}/> Convidar</button>
      </div>
    </header>
    {notice && <div className="rtmeet-notice" role="status">{notice}<button type="button" aria-label="Dispensar aviso" onClick={()=>setNotice('')}>×</button></div>}
    <div className="rtmeet-call-body">
      <div className={'rtmeet-video-grid '+(peers.length===0?'rtmeet-video-grid--solo':peers.length===1?'rtmeet-video-grid--duo':'')}>
        <VideoTile stream={screenStream||stream} label={screenOn?'Sua tela (compartilhando)':displayName+' (você)'} muted screen={screenOn}/>
        {peers.map(p=><VideoTile key={p.id} stream={p.stream} label={p.name}/>)}
        {connecting ? <div className="rtmeet-status-overlay" role="status">Conectando à sala...</div>:
          peers.length===0 && <div className="rtmeet-status-overlay rtmeet-status-overlay--alone"><Users size={16}/><span>Você está na sala. Convide alguém para começar.</span><button type="button" onClick={()=>void copyInvite()}>Copiar convite</button></div>}
      </div>
      {panel==='chat' && room.settings.chat && <aside className="rtmeet-chat"><header><strong>Chat da reunião</strong><button type="button" aria-label="Fechar chat" onClick={()=>setPanel(null)}>×</button></header><div className="rtmeet-chat-items">{chat.length===0&&<p className="rtmeet-chat-empty">As mensagens desta reunião aparecerão aqui.</p>}{chat.map(c=><p key={c.id}><strong>{c.name}</strong><span>{c.text}</span></p>)}</div><form onSubmit={e=>{e.preventDefault();send()}}><input aria-label="Mensagem" value={message} onChange={e=>setMessage(e.target.value)} placeholder="Escrever mensagem..." maxLength={2000}/><button type="submit" disabled={!message.trim()} aria-label="Enviar"><Send size={16}/></button></form></aside>}
      {panel==='people' && <aside className="rtmeet-chat rtmeet-people"><header><strong>Participantes ({peers.length+1})</strong><button type="button" aria-label="Fechar participantes" onClick={()=>setPanel(null)}>×</button></header><div className="rtmeet-people-list"><div><Users size={16}/><span>{displayName} (você)</span></div>{peers.map(p=><div key={p.id}><Users size={16}/><span>{p.name}</span></div>)}</div><div className="rtmeet-people-invite"><p>Compartilhe o convite para adicionar participantes à sala.</p><button type="button" onClick={()=>void copyInvite()}><Copy size={15}/> Copiar link</button></div></aside>}
      {panel==='context' && isHost && <aside className="rtmeet-chat rtmeet-context-panel"><header><strong>Contexto da reunião</strong><button type="button" aria-label="Fechar contexto" onClick={()=>setPanel(null)}>×</button></header><MeetContextPanel room={room} context={commercialContext} onSaveNote={onSaveNote}/></aside>}
    </div>
    <footer className="rtmeet-controls" aria-label="Controles da reunião">
      <div className="rtmeet-controls-main">
        <button type="button" className={!micOn?'is-off':''} onClick={toggleAudio} aria-label={micOn?'Desativar microfone':'Ativar microfone'} aria-pressed={micOn} title={micOn?'Desativar microfone':'Ativar microfone'}>{micOn?<Mic/>:<MicOff/>}<span>Microfone</span></button>
        <button type="button" className={!cameraOn?'is-off':''} onClick={toggleVideo} aria-label={cameraOn?'Desativar câmera':'Ativar câmera'} aria-pressed={cameraOn} title={cameraOn?'Desativar câmera':'Ativar câmera'}>{cameraOn?<Camera/>:<CameraOff/>}<span>Câmera</span></button>
        {room.settings.screenShare && <button type="button" onClick={()=>void shareScreen()} disabled={sharingBusy} aria-pressed={screenOn} aria-label={screenOn?'Parar compartilhamento':'Compartilhar tela'} className={screenOn?'is-active':''} title={screenOn?'Parar compartilhamento':'Compartilhar tela'}><MonitorUp/><span>{screenOn?'Parar tela':'Tela'}</span></button>}
        {room.settings.chat && <button type="button" className={panel==='chat'?'is-active':''} aria-pressed={panel==='chat'} onClick={()=>setPanel(v=>v==='chat'?null:'chat')}><MessageSquare/><span>Chat</span></button>}
        {isHost && <button type="button" className={panel==='context'?'is-active':''} aria-pressed={panel==='context'} onClick={()=>setPanel(v=>v==='context'?null:'context')}><ClipboardList/><span>Contexto</span></button>}
      </div>
      <div className="rtmeet-controls-exit"><button type="button" className="rtmeet-leave" onClick={leave} title="Sair sem encerrar para os demais"><LogOut/><span>Sair</span></button>
      {isHost && <button type="button" className="rtmeet-end" onClick={()=>void end()} title="Encerrar para todos os participantes"><LogOut/><span>Encerrar todos</span></button>}</div>
    </footer>
  </div>
}
