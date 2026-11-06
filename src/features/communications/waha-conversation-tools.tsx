import { useEffect, useState, type ReactNode } from 'react'
import { BrainCircuit, Check, Clipboard, FileText, LoaderCircle, Paperclip, Star, Tag, X } from 'lucide-react'
import {
  wahaAiStatus, wahaAnalyze, wahaMediaBlob,
  type WahaChat, type WahaMessage, type WahaPreferences,
  type WahaQuickReply,
} from '../../services/waha-direct'

export type WahaToolMode='overview'|'labels'|'replies'|'ai'
type Props={
  mode:WahaToolMode;token:string;chats:WahaChat[];selected:WahaChat|null;messages:WahaMessage[];prefs:WahaPreferences
  onClose():void;onInsert(text:string):void
  onPreference(patch:unknown):Promise<void>
}
const unreadCount=(c:WahaChat)=>Number(c.unreadCount||0)
const chatName=(c:WahaChat)=>c.name||c.id.split('@')[0]

export function WahaToolsDrawer({mode,token,chats,selected,messages,prefs,onClose,onInsert,onPreference}:Props){
  const [labels,setLabels]=useState('')
  const [replyTitle,setReplyTitle]=useState('')
  const [replyText,setReplyText]=useState('')
  const [error,setError]=useState('')
  const [saving,setSaving]=useState(false)
  const [aiResult,setAiResult]=useState('')
  const [aiModel,setAiModel]=useState('')
  const [aiAvailable,setAiAvailable]=useState(false)
  const [aiChecked,setAiChecked]=useState(false)
  const [aiTask,setAiTask]=useState<'summary'|'suggest'>('summary')

  useEffect(()=>{setLabels((selected&&prefs.labels[selected.id]||[]).join(', '))},[selected?.id,prefs.labels])
  useEffect(()=>{setAiResult('');setError('')},[selected?.id,mode])
  useEffect(()=>{
    if(mode!=='ai')return
    let active=true
    void wahaAiStatus(token).then(v=>{
      if(active){setAiAvailable(v.available);setAiModel(v.models.find(x=>/qwen/i.test(x))||v.models[0]||'');setAiChecked(true)}
    }).catch(()=>{if(active){setAiChecked(true);setAiAvailable(false)}})
    return()=>{active=false}
  },[mode,token])

  async function change(patch:unknown){
    setError('');setSaving(true)
    try{await onPreference(patch)}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.')}
    finally{setSaving(false)}
  }
  async function runAi(task:'summary'|'suggest'){
    setError('');setAiResult('');setAiTask(task);setSaving(true)
    try{
      const r=await wahaAnalyze(token,task,messages)
      setAiResult(r.text);setAiModel(r.model)
    }catch(e){setError(e instanceof Error?e.message:'Falha no Ollama local.')}
    finally{setSaving(false)}
  }

  let content:ReactNode=null
  if(mode==='overview'){
    const unread=chats.reduce((a,c)=>a+unreadCount(c),0)
    const groups=chats.filter(c=>c.id.endsWith('@g.us')).length
    content=<>
      <p className="waha-panel-description">Indicadores das {chats.length} conversas carregadas, não de todo o histórico.</p>
      <div className="waha-stat-grid">
        <article><small>Conversas</small><strong>{chats.length}</strong></article>
        <article><small>Não lidas</small><strong>{unread}</strong></article>
        <article><small>Grupos</small><strong>{groups}</strong></article>
        <article><small>Favoritos</small><strong>{prefs.favorites.length}</strong></article>
      </div>
      <h4>Conversas recentes</h4>
      {chats.slice(0,6).map(c=><div key={c.id} className="waha-tool-row"><span>{chatName(c)}</span><small>{unreadCount(c)?unreadCount(c)+' não lidas':'Sem pendências registradas'}</small></div>)}
      <p className="waha-panel-description">As métricas detalhadas exigirão registro de estados de atendimento e histórico local.</p>
    </>
  }
  if(mode==='labels'){
    content=selected?<>
      <p className="waha-panel-description">Classifique <strong>{chatName(selected)}</strong>. As etiquetas são armazenadas no Linux e não alteram o WhatsApp oficial.</p>
      <label htmlFor="waha-labels-input">Etiquetas — até 8, separadas por vírgula</label>
      <input id="waha-labels-input" placeholder="Cliente ativo, Prioridade alta" maxLength={280} value={labels} onChange={e=>setLabels(e.target.value)}/>
      <button type="button" className="waha-primary" disabled={saving} onClick={()=>void change({type:'labels',chatId:selected.id,labels:[...new Set(labels.split(',').map(x=>x.trim()).filter(Boolean))].slice(0,8)})}><Check size={15}/> Salvar etiquetas</button>
      <div className="waha-label-preview">{(prefs.labels[selected.id]||[]).map(l=><span className="waha-label" key={l}><Tag size={12}/>{l}</span>)}</div>
      <button type="button" className="waha-quiet" onClick={()=>void change({type:'favorite',chatId:selected.id,enabled:!prefs.favorites.includes(selected.id)})}>
        <Star size={16} fill={prefs.favorites.includes(selected.id)?'currentColor':'none'}/> {prefs.favorites.includes(selected.id)?'Remover dos favoritos':'Adicionar aos favoritos'}
      </button>
    </>:<p className="waha-panel-description">Selecione uma conversa para classificar.</p>
  }
  if(mode==='replies'){
    content=<>
      <p className="waha-panel-description">Insira um modelo no campo de mensagem. Nenhuma resposta é enviada automaticamente.</p>
      <div className="waha-replies">{prefs.quickReplies.map((r:WahaQuickReply)=><article key={r.id} className="waha-reply-card">
        <strong>{r.title}</strong><p>{r.text}</p>
        <div><button type="button" disabled={!selected} onClick={()=>{onInsert(r.text);onClose()}}><Clipboard size={14}/> Inserir</button>
          <button type="button" onClick={()=>void change({type:'deleteReply',id:r.id})}><X size={14}/> Excluir</button></div>
      </article>)}</div>
      {!prefs.quickReplies.length?<p className="waha-panel-description">Ainda não há modelos cadastrados.</p>:null}
      <h4>Nova resposta rápida</h4>
      <label htmlFor="waha-reply-title">Título</label><input id="waha-reply-title" value={replyTitle} maxLength={45} onChange={e=>setReplyTitle(e.target.value)} placeholder="Saudação inicial"/>
      <label htmlFor="waha-reply-text">Texto</label><textarea id="waha-reply-text" value={replyText} maxLength={1600} rows={4} onChange={e=>setReplyText(e.target.value)} placeholder="Olá, tudo bem?"/>
      <button className="waha-primary" disabled={saving||!replyTitle.trim()||!replyText.trim()} type="button" onClick={()=>void (async()=>{await change({type:'reply',title:replyTitle,text:replyText});setReplyTitle('');setReplyText('')})()}><Check size={15}/> Salvar modelo</button>
    </>
  }
  if(mode==='ai'){
    content=<>
      <p className="waha-panel-description">A IA utiliza somente o <strong>Ollama local</strong>. Ela não responde automaticamente, não envia mensagens e não usa API paga.</p>
      <div className="waha-ai-status"><BrainCircuit size={17}/>{!aiChecked?'Verificando Ollama...':aiAvailable?'Disponível: '+aiModel:'Ollama ou modelo local indisponível'}</div>
      {!selected?<p className="waha-panel-description">Selecione uma conversa antes de analisar.</p>:<>
        <p className="waha-panel-description">Serão analisadas até 35 mensagens de texto recentes da conversa selecionada.</p>
        <div className="waha-ai-actions">
          <button type="button" disabled={!aiAvailable||saving||!messages.some(m=>m.body)} onClick={()=>void runAi('summary')}><FileText size={15}/> Resumir conversa</button>
          <button type="button" disabled={!aiAvailable||saving||!messages.some(m=>m.body)} onClick={()=>void runAi('suggest')}><BrainCircuit size={15}/> Sugerir resposta</button>
        </div>
        {saving?<p className="waha-panel-description"><LoaderCircle size={15} className="spin"/> Consultando IA local...</p>:null}
        {aiResult?<div className="waha-ai-result"><h4>{aiTask==='summary'?'Resumo sugerido':'Resposta sugerida'}</h4><p>{aiResult}</p>
          {aiTask==='suggest'?<button type="button" onClick={()=>{onInsert(aiResult);onClose()}}>Inserir no campo para revisão</button>:null}
        </div>:null}
      </>}
      <p className="waha-panel-description">Confira as informações geradas. A IA pode errar ou interpretar mensagens fora de contexto.</p>
    </>
  }
  return <aside className="waha-tools-drawer" aria-label="Ferramentas do WhatsApp">
    <header className="waha-tools-drawer-head"><strong>{mode==='overview'?'Visão geral':mode==='labels'?'Etiquetas e favoritos':mode==='replies'?'Respostas rápidas':'Assistente IA local'}</strong><button type="button" onClick={onClose} aria-label="Fechar ferramentas"><X size={18}/></button></header>
    <div className="waha-tools-drawer-content">{content}{error?<p className="waha-error" role="alert">{error}</p>:null}</div>
  </aside>
}

export function WahaMessageMedia({message,token}:{message:WahaMessage;token:string}){
  const [url,setUrl]=useState('')
  const [error,setError]=useState('')
  const src=message.media?.url||message.mediaUrl||''
  useEffect(()=>{
    if(!message.hasMedia||!src)return
    let active=true,objectUrl=''
    void wahaMediaBlob(token,src).then(blob=>{if(!active)return;objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Mídia indisponível.')})
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[message.id,src,message.hasMedia,token])
  if(!message.hasMedia)return null
  const mime=message.media?.mimetype||''
  const filename=message.media?.filename||'Arquivo'
  if(!src)return <p className="waha-media"><Paperclip size={15}/> {filename}: arquivo ainda não disponibilizado pelo WAHA.</p>
  if(error)return <p className="waha-media"><Paperclip size={15}/> {filename}: {error}</p>
  if(!url)return <p className="waha-media"><LoaderCircle className="spin" size={15}/> Carregando mídia...</p>
  if(mime.startsWith('image/'))return <a href={url} target="_blank" rel="noopener noreferrer"><img className="waha-chat-image" src={url} alt="Imagem da conversa"/></a>
  if(mime.startsWith('audio/'))return <audio controls preload="none" src={url} className="waha-chat-audio"/>
  if(mime.startsWith('video/'))return <video controls preload="none" src={url} className="waha-chat-video"/>
  return <a href={url} download={filename} className="waha-media-download"><Paperclip size={15}/>{filename}</a>
}
