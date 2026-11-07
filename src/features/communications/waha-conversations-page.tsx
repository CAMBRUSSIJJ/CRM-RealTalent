import { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, BrainCircuit, CheckCheck, CircleAlert, LoaderCircle, MessageCircle, Paperclip, Plus, RefreshCw, Search, Send, ShieldCheck, Star, Tag, Wifi, WifiOff, Zap } from 'lucide-react'
import {
  clearWahaToken, saveWahaToken, storedWahaToken, watchWaha,
  emptyWahaPreferences, wahaChats, wahaMessages, wahaPreferences, wahaResolve, wahaSend, wahaSendFile, wahaStatus, wahaUpdatePreferences,
  type WahaChat, type WahaMessage, type WahaPreferences, type WahaStatus,
} from '../../services/waha-direct'
import { WahaMessageMedia, WahaToolsDrawer, type WahaToolMode } from './waha-conversation-tools'
import { WahaInlineAiReply } from './waha-inline-ai-reply'
import '../../styles/waha-direct.css'
import '../../styles/waha-conversation-tools.css'

const localUrl='http://127.0.0.1:4392'
function messageTime(timestamp:number|undefined){
  if(!timestamp)return ''
  const millis=timestamp>1e12?timestamp:timestamp*1000
  return new Date(millis).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
}
const mediaLabel=(m:WahaMessage)=>m.hasMedia ? (m.media?.mimetype?.startsWith('audio/')?'🎤 Áudio':m.media?.mimetype?.startsWith('image/')?'🖼️ Imagem':'📎 Anexo') : ''
function deliveryLabel(m:WahaMessage){
  if(!m.fromMe)return ''
  const name=String(m.ackName||'').toLowerCase()
  if(name.includes('fail')||name.includes('error'))return 'Falhou'
  if(name.includes('pending')||name.includes('clock'))return 'Pendente'
  if(name.includes('read')||name.includes('played')||name.includes('lido'))return 'Lida'
  if(name.includes('deliver'))return 'Entregue'
  if(name.includes('send')||name.includes('sent'))return 'Enviada'
  if(Number.isInteger(m.ack)){
    if(m.ack===-1)return 'Falhou'
    if(m.ack===0)return 'Pendente'
    if(m.ack===1)return 'Enviada'
    if(m.ack===2)return 'Entregue'
    if((m.ack||0)>=3)return 'Lida'
  }
  return 'Status não confirmado'
}

export function WahaConversationsPage(){
  const [token,setToken]=useState(storedWahaToken)
  const [keyDraft,setKeyDraft]=useState('')
  const [status,setStatus]=useState<WahaStatus|null>(null)
  const [chats,setChats]=useState<WahaChat[]>([])
  const [selected,setSelected]=useState<WahaChat|null>(null)
  const [messages,setMessages]=useState<WahaMessage[]>([])
  const [query,setQuery]=useState('')
  const [messageQuery,setMessageQuery]=useState('')
  const [unseen,setUnseen]=useState(false)
  const [filter,setFilter]=useState<'all'|'unread'|'favorites'|'groups'>('all')
  const [prefs,setPrefs]=useState<WahaPreferences>(emptyWahaPreferences)
  const [toolMode,setToolMode]=useState<WahaToolMode|null>(null)
  const [inlineAiIntent,setInlineAiIntent]=useState<'suggest'|'improve'|null>(null)
  const [attachment,setAttachment]=useState<File|null>(null)
  const [draft,setDraft]=useState('')
  const [phone,setPhone]=useState('')
  const [adding,setAdding]=useState(false)
  const [refreshing,setRefreshing]=useState(false)
  const [sending,setSending]=useState(false)
  const [error,setError]=useState('')
  const [sendError,setSendError]=useState('')
  const [requiresReview,setRequiresReview]=useState(false)
  const [revision,setRevision]=useState(0)
  const bottom=useRef<HTMLDivElement>(null)
  const scrollArea=useRef<HTMLDivElement>(null)
  const atBottom=useRef(true)
  const selectedIdRef=useRef('')
  const drafts=useRef(new Map<string,string>())
  const attachRef=useRef<HTMLInputElement>(null)
  const selectedId=selected?.id||''
  selectedIdRef.current=selectedId
  function selectConversation(chat:WahaChat){
    if(selectedId)drafts.current.set(selectedId,draft)
    setSelected(chat)
    setInlineAiIntent(null)
    setDraft(drafts.current.get(chat.id)||'')
    setAttachment(null)
    if(attachRef.current)attachRef.current.value=''
    setMessageQuery('')
    setUnseen(false)
    atBottom.current=true
    setSendError('');setRequiresReview(false);setMessages([])
  }

  async function connect(){
    const key=keyDraft.trim()
    setError('');setRefreshing(true)
    try{
      if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Cole a chave local com 64 caracteres.')
      const current=await wahaStatus(key)
      if(current.status!=='WORKING')throw new Error('O WAHA está em '+current.status+'. Confirme a sessão realtalent no painel.')
      const p=await wahaPreferences(key)
      saveWahaToken(key);setToken(key);setPrefs(p);setStatus(current);setKeyDraft('')
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível conectar.')}
    finally{setRefreshing(false)}
  }

  useEffect(()=>{
    if(!token)return
    let active=true
    async function refresh(){
      try{
        const [s,c]=await Promise.all([wahaStatus(token),wahaChats(token)])
        if(!active)return
        setStatus(s);setChats(c);setError('')
      }catch(e){if(active)setError(e instanceof Error?e.message:'WAHA não respondeu.')}
    }
    void refresh()
    void wahaPreferences(token).then(p=>{if(active)setPrefs(p)}).catch(()=>{})
    const interval=window.setInterval(()=>{void refresh()},20000)
    const abort=new AbortController()
    let debounce=0
    void watchWaha(token,event=>{
      if(!active)return
      // Refresh the active thread on events for it; other threads cannot overwrite it.
      if(!event.chatId||event.chatId===selectedIdRef.current||event.event==='session.status')
        setRevision(v=>v+1)
      if(debounce)window.clearTimeout(debounce)
      debounce=window.setTimeout(()=>{void refresh()},650)
    },abort.signal)
    return()=>{active=false;abort.abort();window.clearInterval(interval);if(debounce)window.clearTimeout(debounce)}
  },[token])

  useEffect(()=>{
    if(!token||!selectedId)return
    let active=true
    async function refresh(){
      try{
        const next=await wahaMessages(token,selectedId)
        if(active){
          setMessages([...next].sort((a,b)=>(a.timestamp||0)-(b.timestamp||0)))
        }
      }catch(e){if(active)setSendError(e instanceof Error?e.message:'Falha ao carregar mensagens.')}
    }
    void refresh()
    const interval=window.setInterval(()=>{if(!document.hidden)void refresh()},20000)
    return()=>{active=false;window.clearInterval(interval)}
  },[token,selectedId,revision])

  useEffect(()=>{
    const box=scrollArea.current
    if(!box)return
    if(atBottom.current){
      box.scrollTop=box.scrollHeight
      setUnseen(false)
    }else if(messages.length){
      setUnseen(true)
    }
  },[selectedId,messages.length])
  const visibleMessages=useMemo(()=>messages.filter(m=>
    !messageQuery.trim()||
    String(m.body||'').toLocaleLowerCase('pt-BR').includes(messageQuery.trim().toLocaleLowerCase('pt-BR'))||
    String(m.senderName||'').toLocaleLowerCase('pt-BR').includes(messageQuery.trim().toLocaleLowerCase('pt-BR'))
  ),[messages,messageQuery])

  const filtered=useMemo(()=>chats.filter(c=>{
    const text=((c.name||'')+' '+c.id+' '+(prefs.labels[c.id]||[]).join(' ')).toLocaleLowerCase('pt-BR')
    const favorite=prefs.favorites.includes(c.id)
    const unread=Number(c.unreadCount||0)>0
    return text.includes(query.toLocaleLowerCase('pt-BR')) && (
      filter==='all'||filter==='favorites'&&favorite||filter==='unread'&&unread||filter==='groups'&&c.id.endsWith('@g.us')
    )
  }).sort((a,b)=>Number(prefs.favorites.includes(b.id))-Number(prefs.favorites.includes(a.id)) || Number(b.lastMessage?.timestamp||0)-Number(a.lastMessage?.timestamp||0)),[chats,query,filter,prefs])
  const connected=status?.status==='WORKING'

  async function refreshAll(){
    if(!token)return
    setRefreshing(true)
    try{
      const [s,c]=await Promise.all([wahaStatus(token),wahaChats(token)])
      setStatus(s);setChats(c)
      if(selectedId){
        const next=await wahaMessages(token,selectedId)
        if(selectedIdRef.current===selectedId)setMessages([...next].sort((a,b)=>(a.timestamp||0)-(b.timestamp||0)))
      }
      setError('')
    }catch(e){setError(e instanceof Error?e.message:'Falha na atualização.')}
    finally{setRefreshing(false)}
  }

  async function onPreference(patch:unknown){
    if(!token)return
    const next=await wahaUpdatePreferences(token,patch)
    setPrefs(next)
  }

  async function toggleFavorite(chatId:string){
    try{await onPreference({type:'favorite',chatId,enabled:!prefs.favorites.includes(chatId)})}
    catch(e){setError(e instanceof Error?e.message:'Falha ao salvar favorito.')}
  }

  async function newChat(){
    if(!token)return
    setError('');setAdding(true)
    try{
      const digits=phone.replace(/\D/g,'')
      if(!/^\d{10,15}$/.test(digits))throw new Error('Digite o número com DDI e DDD.')
      const r=await wahaResolve(token,digits)
      if(!r.numberExists||!r.chatId)throw new Error('O WAHA não localizou esse contato no WhatsApp.')
      selectConversation({id:r.chatId,name:'+'+digits});setPhone('');setAdding(false)
    }catch(e){setError(e instanceof Error?e.message:'Número não encontrado.')}
  }

  async function send(){
    if(!token||!selectedId||!connected||sending||requiresReview||(!draft.trim()&&!attachment))return
    const chatId=selectedId
    const body=draft.trim()
    setSending(true);setSendError('')
    try{
      if(attachment)await wahaSendFile(token,chatId,attachment,body,crypto.randomUUID())
      else await wahaSend(token,chatId,body,crypto.randomUUID())
      drafts.current.delete(chatId)
      if(selectedIdRef.current===chatId){
        setInlineAiIntent(null)
        setDraft('');setRequiresReview(false);setAttachment(null)
        if(attachRef.current)attachRef.current.value=''
      }
      const next=await wahaMessages(token,chatId)
      if(selectedIdRef.current===chatId)
        setMessages([...next].sort((a,b)=>(a.timestamp||0)-(b.timestamp||0)))
    }catch(e){
      // Do not show a failed send from a previous chat in the newly selected chat.
      if(selectedIdRef.current===chatId){
        setSendError((e instanceof Error?e.message:'Falha no envio.')+' Confira o WhatsApp antes de decidir se deve tentar novamente.')
        setRequiresReview(true)
      }
    }finally{setSending(false)}
  }

  if(!token)return <section className="waha-wrap"><div className="waha-setup">
    <span className="waha-status"><ShieldCheck size={18}/> Conexão direta local</span>
    <h2>WhatsApp no RealTalent</h2>
    <p>A sessão <strong>realtalent</strong> já está conectada pelo WAHA GOWS. Esta integração não utiliza Supabase para transportar nem armazenar mensagens.</p>
    <p>Primeiro execute a ponte no Linux. Abra <a href={localUrl} target="_blank" rel="noreferrer">http://127.0.0.1:4392</a>, clique em <strong>Exibir chave local</strong> e cole abaixo.</p>
    <label htmlFor="waha-token">Chave de acesso da ponte (não é a chave API do WAHA)</label>
    <input id="waha-token" type="password" autoComplete="off" placeholder="Cole a chave local" value={keyDraft} onChange={e=>setKeyDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void connect()}} />
    <button className="waha-primary" onClick={()=>void connect()} disabled={refreshing}>{refreshing?<LoaderCircle size={16} className="spin"/>:<Wifi size={16}/>} Conectar</button>
    {error?<p className="waha-error" role="alert">{error}</p>:null}
    <p className="waha-fine">A chave WAHA permanece protegida no Linux. Não compartilhamos seu histórico com o Supabase.</p>
  </div></section>

  return <section className="waha-wrap">
    <header className="waha-toolbar">
      <div><h2>Comunicações <span className="waha-chip">WAHA</span></h2><p>WhatsApp direto • Sessão {status?.session||'realtalent'}</p></div>
      <div className="waha-toolbar-actions">
        <span className={'waha-state '+(connected?'is-up':'is-down')}>{connected?<Wifi size={14}/>:<WifiOff size={14}/>} {connected?'Conectado':status?.status||'Reconectando'}</span>
        <button onClick={()=>void refreshAll()} disabled={refreshing} title="Atualizar"><RefreshCw size={17}/></button>
        <button onClick={()=>{clearWahaToken();setToken('');setSelected(null);setMessages([]);setInlineAiIntent(null)}} title="Desvincular esta aba sem sair do WhatsApp">Sair da ponte</button>
      </div>
    </header>
    <nav className="waha-tools-bar" aria-label="Ferramentas de comunicação">
      <button type="button" className={toolMode==='overview'?'active':''} onClick={()=>setToolMode(toolMode==='overview'?null:'overview')}><BarChart3 size={15}/> Visão geral</button>
      <button type="button" className={toolMode==='labels'?'active':''} onClick={()=>setToolMode(toolMode==='labels'?null:'labels')}><Tag size={15}/> Etiquetas</button>
      <button type="button" className={toolMode==='replies'?'active':''} onClick={()=>setToolMode(toolMode==='replies'?null:'replies')}><Zap size={15}/> Respostas rápidas</button>
      <button type="button" className={toolMode==='ai'?'active':''} onClick={()=>setToolMode(toolMode==='ai'?null:'ai')}><BrainCircuit size={15}/> IA local</button>
    </nav>
    {error?<div className="waha-error" role="alert"><CircleAlert size={15}/>{error}</div>:null}
    <div className={'waha-layout'+(toolMode?' with-panel':'')}>
      <aside className="waha-list">
        <div className="waha-list-head"><strong>Conversas</strong><button aria-label="Nova conversa" onClick={()=>setAdding(v=>!v)}><Plus size={18}/></button></div>
        {adding?<div className="waha-new"><label htmlFor="waha-phone">Número com DDI e DDD</label><div><input id="waha-phone" placeholder="55 51 99999 9999" value={phone} onChange={e=>setPhone(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void newChat()}}/><button onClick={()=>void newChat()}>Buscar</button></div></div>:null}
        <div className="waha-search"><Search size={17}/><input aria-label="Buscar conversas" placeholder="Buscar nome, número ou etiqueta" value={query} onChange={e=>setQuery(e.target.value)}/></div>
        <div className="waha-filters">{(['all','unread','favorites','groups'] as const).map((key)=><button type="button" key={key} className={filter===key?'active':''} onClick={()=>setFilter(key)}>{({all:'Todas',unread:'Não lidas',favorites:'Favoritas',groups:'Grupos'})[key]}</button>)}</div>
        <div className="waha-list-items">
          {filtered.map(c=><button key={c.id} className={'waha-chat '+(selectedId===c.id?'active':'')} onClick={()=>selectConversation(c)}>
            <span className="waha-avatar">{(c.name||c.id).slice(0,1).toUpperCase()}</span>
            <span className="waha-chat-info"><strong>{prefs.favorites.includes(c.id)?'★ ':''}{c.name||c.id.split('@')[0]}</strong><small>{c.lastMessage?.hasMedia?mediaLabel(c.lastMessage):c.lastMessage?.body||'Sem mensagens recentes'}</small>
              {(prefs.labels[c.id]||[]).length?<span className="waha-inline-labels">{(prefs.labels[c.id]||[]).slice(0,2).map(l=><em key={l}>{l}</em>)}</span>:null}</span>
            <span className="waha-chat-time">{messageTime(c.lastMessage?.timestamp)}</span>
          </button>)}
          {!filtered.length?<p className="waha-empty">Nenhuma conversa encontrada.</p>:null}
        </div>
      </aside>
      <div className="waha-thread">
        {selected?<><div className="waha-thread-head"><span className="waha-avatar">{(selected.name||selected.id).slice(0,1).toUpperCase()}</span><div><strong>{selected.name||selected.id.split('@')[0]}</strong><small>{selected.id.endsWith('@g.us')?'Grupo':'Conversa WhatsApp'}</small></div>
          <div className="waha-thread-actions"><button type="button" title="Marcar como favorito" aria-label="Marcar como favorito" onClick={()=>void toggleFavorite(selected.id)}><Star size={18} fill={prefs.favorites.includes(selected.id)?'currentColor':'none'}/></button><button type="button" onClick={()=>setToolMode('labels')}><Tag size={16}/> Etiquetas</button></div>
        </div>
          <div className="waha-thread-filters">
            <Search size={14}/><input aria-label="Buscar nas mensagens carregadas" value={messageQuery}
              onChange={e=>setMessageQuery(e.target.value)} placeholder="Buscar neste histórico recente"/>
            {messageQuery?<button type="button" onClick={()=>setMessageQuery('')}>Limpar</button>:null}
          </div>
          <div className="waha-messages" role="log" aria-live="polite" ref={scrollArea}
            onScroll={e=>{const el=e.currentTarget;atBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<90;if(atBottom.current)setUnseen(false)}}>
            {visibleMessages.map(m=><div key={m.id} className={'waha-bubble '+(m.fromMe?'out':'in')}>
              {selectedId.endsWith('@g.us')&&!m.fromMe?
                <strong className="waha-sender-name">{m.senderName||'Participante não identificado'}</strong>:null}
              {m.body?<p>{m.body}</p>:null}
              {m.hasMedia?<WahaMessageMedia message={m} token={token} chatId={selectedId}/>:null}
              <small>{messageTime(m.timestamp)} {m.fromMe?<span className="waha-delivery" title={deliveryLabel(m)}>{deliveryLabel(m)} <CheckCheck size={12}/></span>:null}</small>
            </div>)}
            {!visibleMessages.length?<p className="waha-empty">{messageQuery?'Nenhum resultado nas mensagens carregadas.':'Nenhuma mensagem carregada nesta conversa.'}</p>:null}
            <div ref={bottom}/>
          </div>
          {unseen&&!messageQuery?<button type="button" className="waha-scroll-new"
            onClick={()=>{const area=scrollArea.current;if(area){area.scrollTop=area.scrollHeight;atBottom.current=true;setUnseen(false)}}}>
            ↓ Ver mensagens recentes
          </button>:null}
          {sendError?<div className="waha-error" role="alert">{sendError}{requiresReview?<button type="button" onClick={()=>{setRequiresReview(false);setSendError('')}}>Verifiquei a conversa; liberar novo envio</button>:null}</div>:null}
          <div className="waha-compose-ai-actions">
            <button type="button" disabled={!connected||sending||requiresReview||selectedId.endsWith('@g.us')}
              title={selectedId.endsWith('@g.us')?'Sugestão inline disponível para conversas individuais':'Preparar uma resposta usando o histórico do WhatsApp'}
              onClick={()=>setInlineAiIntent('suggest')}><BrainCircuit size={15}/> Sugerir resposta</button>
            {draft.trim().length>=3?<button type="button"
              disabled={!connected||sending||requiresReview||selectedId.endsWith('@g.us')}
              onClick={()=>setInlineAiIntent('improve')}><BrainCircuit size={15}/> Melhorar meu texto</button>:null}
          </div>
          {inlineAiIntent&&!selectedId.endsWith('@g.us')?<WahaInlineAiReply
            key={selectedId+'-'+inlineAiIntent} token={token} chatId={selectedId}
            latestMessageId={messages[messages.length-1]?.id||''}
            originalDraft={draft} initialIntent={inlineAiIntent}
            onClose={()=>setInlineAiIntent(null)}
            onInsert={text=>{
              if(draft.trim()&&draft.trim()!==text.trim()&&
                !window.confirm('Substituir o texto que você já escreveu por esta sugestão?'))return
              setDraft(text)
              drafts.current.set(selectedId,text)
              setInlineAiIntent(null)
            }}/>:null}
          <form className="waha-compose" onSubmit={e=>{e.preventDefault();void send()}}>
            <label className="waha-attach-button" title="Anexar arquivo" aria-label="Anexar arquivo"><Paperclip size={18}/><input ref={attachRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,audio/mpeg,audio/ogg,audio/mp4,video/mp4,application/pdf,text/plain" onChange={e=>{const f=e.target.files?.[0]||null;if(f&&f.size>8*1024*1024){setSendError('Arquivo acima do limite de 8 MB.');setAttachment(null)}else{setAttachment(f);setSendError('')}}} disabled={sending||requiresReview}/></label>
            <div className="waha-compose-input">{attachment?<div className="waha-attachment-chip"><Paperclip size={12}/>{attachment.name} ({(attachment.size/1024/1024).toFixed(1)} MB)<button type="button" onClick={()=>{setAttachment(null);if(attachRef.current)attachRef.current.value=''}}>×</button></div>:null}
              <textarea aria-label="Mensagem WhatsApp" placeholder={connected?'Escreva uma mensagem...':'WAHA desconectado'} value={draft} onChange={e=>{setDraft(e.target.value);if(selectedId)drafts.current.set(selectedId,e.target.value)}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}}} disabled={!connected||sending||requiresReview} rows={2}/></div>
            <button type="submit" className="waha-primary" disabled={!connected||sending||requiresReview||(!draft.trim()&&!attachment)}>{sending?<LoaderCircle className="spin" size={17}/>:<Send size={17}/>} Enviar</button>
          </form>
        </>:<div className="waha-blank"><MessageCircle size={38}/><h3>Selecione uma conversa</h3><p>Mensagens consultadas diretamente no WAHA local, sem armazenamento adicional.</p></div>}
      </div>
      {toolMode?<WahaToolsDrawer mode={toolMode} token={token} chats={chats} selected={selected} messages={messages} prefs={prefs}
        onClose={()=>setToolMode(null)}
        onInsert={text=>{setDraft(text);if(selectedId)drafts.current.set(selectedId,text)}}
        onPreference={onPreference}/>:null}
    </div>
    <p className="waha-fine">A ponte funciona neste computador. Para outros computadores é necessário um túnel privado autenticado. Envios automáticos de tarefas continuam desligados.</p>
  </section>
}
