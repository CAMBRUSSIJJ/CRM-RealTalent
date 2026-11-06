import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BrainCircuit, Check, Clipboard, FileText, LoaderCircle, Paperclip, Star, Tag, X } from 'lucide-react'
import {
  wahaAiStatus, wahaAnalyzeSelectedConversation, wahaMediaBlob,
  type WahaCommercialReport, type WahaAiConversationTask,
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
  const [commercial,setCommercial]=useState<WahaCommercialReport|null>(null)
  const [question,setQuestion]=useState('')
  const [messagesRead,setMessagesRead]=useState(0)
  const [voiceInfo,setVoiceInfo]=useState<{textMessagesRead:number;audioDetected:number;audioTranscribed:number;audioSkipped:number;audioTranscripts:{id:string;text:string}[]}|null>(null)
  const requestEpoch=useRef(0)
  const [aiModel,setAiModel]=useState('')
  const [aiAvailable,setAiAvailable]=useState(false)
  const [aiChecked,setAiChecked]=useState(false)
  const [aiTask,setAiTask]=useState<WahaAiConversationTask>('summary')

  useEffect(()=>{setLabels((selected&&prefs.labels[selected.id]||[]).join(', '))},[selected?.id,prefs.labels])
  useEffect(()=>{requestEpoch.current+=1;setAiResult('');setCommercial(null);setQuestion('');setMessagesRead(0);setVoiceInfo(null);setError('')},[selected?.id,mode])
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
  async function runAi(task:WahaAiConversationTask){
    if(!selected||!aiAvailable)return
    const epoch=++requestEpoch.current
    setError('');setAiResult('');setCommercial(null);setVoiceInfo(null);setAiTask(task);setSaving(true)
    try{
      // The local bridge reads actual messages directly from selected WAHA chat.
      // Generated content remains read-only until manually inserted and sent.
      const r=await wahaAnalyzeSelectedConversation(token,selected.id,task,task==='ask'?question.trim():'')
      if(epoch!==requestEpoch.current||r.chatId!==selected.id)return
      setAiResult(r.text||'');setCommercial(r.analysis||null)
      setAiModel(r.model);setMessagesRead(r.messagesRead)
      setVoiceInfo({textMessagesRead:r.textMessagesRead??r.messagesRead,
        audioDetected:r.audioDetected??0,audioTranscribed:r.audioTranscribed??0,
        audioSkipped:r.audioSkipped??0,audioTranscripts:r.audioTranscripts||[]})
    }catch(e){
      if(epoch===requestEpoch.current)setError(e instanceof Error?e.message:'Falha na IA local.')
    }finally{if(epoch===requestEpoch.current)setSaving(false)}
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
    const sections: {key:keyof Pick<WahaCommercialReport,'needs'|'objections'|'opportunities'|'nextSteps'>;title:string}[]=[
      {key:'needs',title:'Necessidades identificadas'},
      {key:'objections',title:'Objeções e dificuldades'},
      {key:'opportunities',title:'Oportunidades possíveis'},
      {key:'nextSteps',title:'Próximos passos sugeridos'},
    ]
    content=<>
      <p className="waha-panel-description">Assistente do WhatsApp: lê a conversa selecionada diretamente no <strong>WAHA</strong> e usa o <strong>Ollama local</strong>. Nunca envia mensagens automaticamente.</p>
      <div className="waha-ai-status"><BrainCircuit size={17}/>{!aiChecked?'Verificando Ollama...':aiAvailable?'Disponível: '+aiModel:'Ollama ou modelo local indisponível'}</div>
      {!selected?<p className="waha-panel-description">Selecione uma conversa à esquerda para que a IA leia suas mensagens reais.</p>:<>
        <p className="waha-panel-description"><strong>Conversa:</strong> {chatName(selected)}. Até 45 mensagens recentes (texto e áudios recebidos transcritos) entram na análise. A transcrição usa Whisper local, no máximo 3 áudios de até 3 minutos por solicitação.</p>
        <div className="waha-ai-actions">
          <button type="button" disabled={!aiAvailable||saving} onClick={()=>void runAi('summary')}><FileText size={15}/> Resumir conversa</button>
          <button type="button" disabled={!aiAvailable||saving} onClick={()=>void runAi('reply')}><BrainCircuit size={15}/> Preparar resposta</button>
          <button type="button" className="waha-analysis-main" disabled={!aiAvailable||saving} onClick={()=>void runAi('commercial')}><Clipboard size={15}/> Análise comercial</button>
        </div>
        <label htmlFor="waha-ai-question">Perguntar sobre esta conversa</label>
        <div className="waha-ai-question">
          <textarea id="waha-ai-question" rows={3} maxLength={450} placeholder="Ex.: O cliente demonstrou interesse? Quais problemas ele mencionou?" value={question} onChange={e=>setQuestion(e.target.value)}/>
          <button className="waha-primary" type="button" disabled={!aiAvailable||saving||question.trim().length<4} onClick={()=>void runAi('ask')}>Perguntar à IA</button>
        </div>
        {saving?<p className="waha-panel-description" role="status"><LoaderCircle size={15} className="spin"/> Lendo mensagens e transcrevendo áudios no Linux antes de consultar o Ollama...</p>:null}
        {commercial?<div className="waha-ai-result waha-commercial-result" aria-live="polite">
          <h4>Análise comercial <small>Confiança indicada: {commercial.confidence}</small></h4>
          <p className="waha-commercial-summary">{commercial.summary}</p>
          {sections.map(section=><section className="waha-commercial-section" key={section.key}>
            <h5>{section.title}</h5>
            {commercial[section.key].length===0?<p className="waha-panel-description">Não identificadas nas mensagens consultadas.</p>:null}
            {commercial[section.key].map((finding,index)=><article className="waha-commercial-finding" key={section.key+'-'+index}>
              <p>{finding.description}</p>
              <details><summary>Ver evidências ({finding.evidence.length})</summary>
                {finding.evidence.map(e=><blockquote key={e.id}><b>{e.id} · {e.fromMe?'Atendente':'Contato'}{e.source==='audio'?' · áudio transcrito':''}:</b> {e.text}</blockquote>)}
              </details>
            </article>)}
          </section>)}
          <p className="waha-panel-description"><strong>Limitações:</strong> {commercial.limitations}</p>
          <button type="button" disabled={saving} onClick={()=>void runAi('reply')}><BrainCircuit size={15}/> Preparar resposta para revisar</button>
        </div>:null}
        {aiResult?<div className="waha-ai-result" aria-live="polite">
          <h4>{aiTask==='reply'?'Resposta sugerida':aiTask==='ask'?'Resposta sobre a conversa':'Resumo da conversa'}</h4>
          <p>{aiResult}</p>
          {aiTask==='reply'?<button type="button" onClick={()=>{onInsert(aiResult);onClose()}}>Inserir no campo de mensagem para revisar</button>:null}
        </div>:null}
        {messagesRead>0?<div className="waha-panel-description" role="status">
          Fonte: {messagesRead} mensagens consideradas ({voiceInfo?.textMessagesRead??messagesRead} de texto,
          {' '}{voiceInfo?.audioTranscribed??0} áudios transcritos localmente) · {aiModel}. Nenhuma resposta enviada.
          {(voiceInfo?.audioSkipped??0)>0?<p role="alert"><strong>Análise parcial:</strong> {voiceInfo?.audioSkipped} áudio(s)
            recebido(s) não foram transcritos (mídia ausente, limite de 3 ou transcritor não instalado).
            Para ativar, execute <code>bash deploy/waha-direct/instalar-transcricao-local-linux.sh</code> no projeto Linux.</p>:null}
          {(voiceInfo?.audioTranscripts.length??0)>0?<details><summary>Ver transcrições utilizadas ({voiceInfo?.audioTranscripts.length})</summary>
            {voiceInfo?.audioTranscripts.map(a=><blockquote key={a.id}><strong>{a.id} · Áudio recebido:</strong> {a.text}</blockquote>)}
          </details>:null}
        </div>:null}
      </>}
      <p className="waha-panel-description">Análises são sugestões, não fatos garantidos. Confira as mensagens citadas e revise qualquer texto antes de enviá-lo ao contato.</p>
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
  const [retry,setRetry]=useState(0)
  const src=message.media?.url||message.mediaUrl||''
  useEffect(()=>{
    if(!message.hasMedia||!src)return
    let active=true,objectUrl=''
    setUrl('');setError('')
    void wahaMediaBlob(token,src).then(blob=>{if(!active)return;objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Mídia indisponível.')})
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[message.id,src,message.hasMedia,token,retry])
  if(!message.hasMedia)return null
  const mime=message.media?.mimetype||''
  const filename=message.media?.filename||'Arquivo'
  if(!src)return <p className="waha-media"><Paperclip size={15}/> {filename}: arquivo ainda não disponibilizado pelo WAHA.</p>
  if(error)return <p className="waha-media"><Paperclip size={15}/> {filename}: {error}{' '}
    <button type="button" onClick={()=>setRetry(x=>x+1)}>Tentar novamente</button>
  </p>
  if(!url)return <p className="waha-media"><LoaderCircle className="spin" size={15}/> Carregando mídia...</p>
  if(mime.startsWith('image/'))return <a href={url} target="_blank" rel="noopener noreferrer"><img className="waha-chat-image" src={url} alt="Imagem da conversa"/></a>
  if(mime.startsWith('audio/'))return <audio controls preload="none" src={url} className="waha-chat-audio"/>
  if(mime.startsWith('video/'))return <video controls preload="none" src={url} className="waha-chat-video"/>
  return <a href={url} download={filename} className="waha-media-download"><Paperclip size={15}/>{filename}</a>
}
