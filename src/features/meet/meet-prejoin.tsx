import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Camera, CameraOff, Headphones, Mic, MicOff, Video, Wifi } from 'lucide-react'
import type { PublicMeetRoom } from '../../services/realtalent-meet'

export type MeetPreparation = { stream: MediaStream | null; micOn: boolean; cameraOn: boolean }
export function MeetPrejoin({room,displayName,onJoin,onBack}:{
  room:PublicMeetRoom; displayName:string; onJoin(preparation:MeetPreparation):void; onBack():void
}) {
  const [stream,setStream]=useState<MediaStream|null>(null)
  const streamRef=useRef<MediaStream|null>(null)
  const handedOff=useRef(false)
  const preview=useRef<HTMLVideoElement>(null)
  const [mic,setMic]=useState(true)
  const [camera,setCamera]=useState(true)
  const [audioInput,setAudioInput]=useState('')
  const [videoInput,setVideoInput]=useState('')
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([])
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  const refreshDevices=async()=>{
    try{const all=await navigator.mediaDevices.enumerateDevices();setDevices(all)}catch{/* unsupported */}
  }
  useEffect(()=>{
    if(preview.current)preview.current.srcObject=stream
  },[stream])
  useEffect(()=>{
    let alive=true
    async function setup(){
      if(!navigator.mediaDevices?.getUserMedia){
        setError('Seu navegador não permite acesso à câmera e ao microfone neste endereço.')
        setLoading(false);return
      }
      setLoading(true);setError('')
      streamRef.current?.getTracks().forEach(t=>t.stop())
      try{
        const media=await navigator.mediaDevices.getUserMedia({
          audio:mic?audioInput?{deviceId:{ideal:audioInput}}:true:false,
          video:camera?videoInput?{deviceId:{ideal:videoInput}}:true:false,
        })
        if(!alive){media.getTracks().forEach(t=>t.stop());return}
        streamRef.current=media;setStream(media)
        await refreshDevices()
      }catch(e){
        if(!alive)return
        setStream(null)
        setError(e instanceof Error&&e.name==='NotAllowedError'?'Permissão negada. Habilite câmera e microfone no navegador ou entre sem mídia.':'Dispositivo indisponível. Você pode entrar sem mídia e usar o chat.')
      }finally{if(alive)setLoading(false)}
    }
    if(!mic&&!camera){
      streamRef.current?.getTracks().forEach(t=>t.stop())
      streamRef.current=null;setStream(null);setLoading(false)
    }else void setup()
    return()=>{alive=false}
  },[mic,camera,audioInput,videoInput])
  useEffect(()=>()=>{if(!handedOff.current)streamRef.current?.getTracks().forEach(t=>t.stop())},[])
  const enter=()=>{
    handedOff.current=true
    onJoin({stream:streamRef.current,micOn:mic,cameraOn:camera})
  }
  return <div className="rtmeet-prejoin">
    <div className="rtmeet-prejoin-top"><button type="button" onClick={onBack}><ArrowLeft size={18}/> Voltar</button><span><Video size={19}/> RealTalent Meet</span></div>
    <div className="rtmeet-prejoin-layout">
      <div className="rtmeet-prejoin-preview">
        {camera&&stream?.getVideoTracks().length?<video ref={preview} autoPlay muted playsInline/>:<div className="rtmeet-prejoin-disabled"><CameraOff size={34}/><span>Câmera desligada</span></div>}
        <div className="rtmeet-prejoin-controls">
          <button type="button" className={!mic?'is-off':''} onClick={()=>setMic(v=>!v)} aria-label={mic?'Desligar microfone':'Ligar microfone'}>{mic?<Mic/>:<MicOff/>}</button>
          <button type="button" className={!camera?'is-off':''} onClick={()=>setCamera(v=>!v)} aria-label={camera?'Desligar câmera':'Ligar câmera'}>{camera?<Camera/>:<CameraOff/>}</button>
        </div>
      </div>
      <section className="rtmeet-prejoin-content">
        <span className="eyebrow">PREPARAR REUNIÃO</span><h1>{room.title}</h1><p>Confira seus dispositivos antes de entrar.</p>
        <div className="rtmeet-prejoin-device"><label><Headphones size={16}/> Microfone</label><select value={audioInput} onChange={e=>setAudioInput(e.target.value)} disabled={!mic}><option value="">Padrão do sistema</option>{devices.filter(d=>d.kind==='audioinput').map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||'Microfone'}</option>)}</select></div>
        <div className="rtmeet-prejoin-device"><label><Camera size={16}/> Câmera</label><select value={videoInput} onChange={e=>setVideoInput(e.target.value)} disabled={!camera}><option value="">Padrão do sistema</option>{devices.filter(d=>d.kind==='videoinput').map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||'Câmera'}</option>)}</select></div>
        <div className="rtmeet-prejoin-status"><Wifi size={15}/>{loading?'Verificando dispositivos...':error||'Dispositivos preparados. Mídia não será gravada pelo CRM.'}</div>
        <button type="button" className="rtmeet-join-button" onClick={enter} disabled={loading}>Entrar na reunião</button>
        <small>Você entrará como {displayName}. É possível mudar câmera e microfone durante a chamada.</small>
      </section>
    </div>
  </div>
}
