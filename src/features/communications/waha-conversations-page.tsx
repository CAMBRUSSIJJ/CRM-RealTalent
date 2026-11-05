import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCheck, CircleAlert, LoaderCircle, MessageCircle, Plus, RefreshCw, Search, Send, ShieldCheck, Wifi, WifiOff } from 'lucide-react'
import {
  clearWahaToken, saveWahaToken, storedWahaToken, watchWaha,
  wahaChats, wahaMessages, wahaResolve, wahaSend, wahaStatus,
  type WahaChat, type WahaMessage, type WahaStatus,
} from '../../services/waha-direct'
import '../../styles/waha-direct.css'

const localUrl='http://127.0.0.1:4390'
function messageTime(timestamp:number|undefined){
  if(!timestamp)return ''
  const millis=timestamp>1e12?timestamp:timestamp*1000
  return new Date(millis).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
}
const mediaLabel=(m:WahaMessage)=>m.hasMedia ? (m.media?.mimetype?.startsWith('audio/')?'🎤 Áudio':m.media?.mimetype?.startsWith('image/')?'🖼️ Imagem':'📎 Anexo') : ''

export function WahaConversationsPage(){
  const [token,setToken]=useState(storedWahaToken)
  const [keyDraft,setKeyDraft]=useState('')
  const [status,setStatus]=useState<WahaStatus|null>(null)
  const [chats,setChats]=useState<WahaChat[]>([])
  const [selected,setSelected]=useState<WahaChat|null>(null)
  const [messages,setMessages]=useState<WahaMessage[]>([])
  const [query,setQuery]=useState('')
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
  const selectedId=selected?.id||''

  async function connect(){
    const key=keyDraft.trim()
    setError('');setRefreshing(true)
    try{
      if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Cole a chave local com 64 caracteres.')
      const current=await wahaStatus(key)
      if(current.status!=='WORKING')throw new Error('O WAHA está em '+current.status+'. Confirme a sessão realtalent no painel.')
      saveWahaToken(key);setToken(key);setStatus(current);setKeyDraft('')
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
    const interval=window.setInterval(()=>{void refresh()},15000)
    const abort=new AbortController()
    void watchWaha(token,()=>setRevision(v=>v+1),abort.signal)
    return()=>{active=false;abort.abort();window.clearInterval(interval)}
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
    const interval=window.setInterval(()=>{void refresh()},8000)
    return()=>{active=false;window.clearInterval(interval)}
  },[token,selectedId,revision])

  useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth',block:'end'})},[selectedId,messages.length])

  const filtered=useMemo(()=>chats.filter(c=>{
    const text=((c.name||'')+' '+c.id).toLocaleLowerCase('pt-BR')
    return text.includes(query.toLocaleLowerCase('pt-BR'))
  }),[chats,query])
  const connected=status?.status==='WORKING'

  async function refreshAll(){
    if(!token)return
    setRefreshing(true)
    try{
      const [s,c]=await Promise.all([wahaStatus(token),wahaChats(token)])
      setStatus(s);setChats(c)
      if(selectedId)setMessages((await wahaMessages(token,selectedId)).sort((a,b)=>(a.timestamp||0)-(b.timestamp||0)))
      setError('')
    }catch(e){setError(e instanceof Error?e.message:'Falha na atualização.')}
    finally{setRefreshing(false)}
  }

  async function newChat(){
    if(!token)return
    setError('');setAdding(true)
    try{
      const digits=phone.replace(/\D/g,'')
      if(!/^\d{10,15}$/.test(digits))throw new Error('Digite o número com DDI e DDD.')
      const r=await wahaResolve(token,digits)
      if(!r.numberExists||!r.chatId)throw new Error('O WAHA não localizou esse contato no WhatsApp.')
      setSelected({id:r.chatId,name:'+'+digits});setPhone('');setAdding(false);setMessages([]);setRequiresReview(false)
    }catch(e){setError(e instanceof Error?e.message:'Número não encontrado.')}
  }

  async function send(){
    if(!token||!selectedId||!connected||sending||requiresReview||!draft.trim())return
    const body=draft.trim()
    setSending(true);setSendError('')
    try{
      await wahaSend(token,selectedId,body,crypto.randomUUID())
      setDraft('');setRequiresReview(false)
      const next=await wahaMessages(token,selectedId)
      setMessages([...next].sort((a,b)=>(a.timestamp||0)-(b.timestamp||0)))
    }catch(e){
      setSendError((e instanceof Error?e.message:'Falha no envio.')+' Confira o WhatsApp antes de decidir se deve tentar novamente.')
      setRequiresReview(true)
    }finally{setSending(false)}
  }

  if(!token)return <section className="waha-wrap"><div className="waha-setup">
    <span className="waha-status"><ShieldCheck size={18}/> Conexão direta local</span>
    <h2>WhatsApp no RealTalent</h2>
    <p>A sessão <strong>realtalent</strong> já está conectada pelo WAHA GOWS. Esta integração não utiliza Supabase para transportar nem armazenar mensagens.</p>
    <p>Primeiro execute a ponte no Linux. Abra <a href={localUrl} target="_blank" rel="noreferrer">http://127.0.0.1:4390</a>, clique em <strong>Exibir chave local</strong> e cole abaixo.</p>
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
        <button onClick={()=>{clearWahaToken();setToken('');setSelected(null);setMessages([])}} title="Desvincular esta aba sem sair do WhatsApp">Sair da ponte</button>
      </div>
    </header>
    {error?<div className="waha-error" role="alert"><CircleAlert size={15}/>{error}</div>:null}
    <div className="waha-layout">
      <aside className="waha-list">
        <div className="waha-list-head"><strong>Conversas</strong><button aria-label="Nova conversa" onClick={()=>setAdding(v=>!v)}><Plus size={18}/></button></div>
        {adding?<div className="waha-new"><label htmlFor="waha-phone">Número com DDI e DDD</label><div><input id="waha-phone" placeholder="55 51 99999 9999" value={phone} onChange={e=>setPhone(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void newChat()}}/><button onClick={()=>void newChat()}>Buscar</button></div></div>:null}
        <div className="waha-search"><Search size={17}/><input aria-label="Buscar conversas" placeholder="Buscar conversa" value={query} onChange={e=>setQuery(e.target.value)}/></div>
        <div className="waha-list-items">
          {filtered.map(c=><button key={c.id} className={'waha-chat '+(selectedId===c.id?'active':'')} onClick={()=>{setSelected(c);setSendError('');setRequiresReview(false);setMessages([])}}>
            <span className="waha-avatar">{(c.name||c.id).slice(0,1).toUpperCase()}</span>
            <span className="waha-chat-info"><strong>{c.name||c.id.split('@')[0]}</strong><small>{c.lastMessage?.hasMedia?mediaLabel(c.lastMessage):c.lastMessage?.body||'Sem mensagens recentes'}</small></span>
            <span className="waha-chat-time">{messageTime(c.lastMessage?.timestamp)}</span>
          </button>)}
          {!filtered.length?<p className="waha-empty">Nenhuma conversa encontrada.</p>:null}
        </div>
      </aside>
      <div className="waha-thread">
        {selected?<><div className="waha-thread-head"><span className="waha-avatar">{(selected.name||selected.id).slice(0,1).toUpperCase()}</span><div><strong>{selected.name||selected.id.split('@')[0]}</strong><small>{selected.id.endsWith('@g.us')?'Grupo':'Conversa WhatsApp'}</small></div></div>
          <div className="waha-messages" role="log" aria-live="polite">
            {messages.map(m=><div key={m.id} className={'waha-bubble '+(m.fromMe?'out':'in')}>
              {m.body?<p>{m.body}</p>:null}
              {m.hasMedia?<p className="waha-media">{mediaLabel(m)} — mídia disponível no WAHA; pré-visualização será integrada na próxima etapa.</p>:null}
              <small>{messageTime(m.timestamp)} {m.fromMe&&m.ackName?<CheckCheck size={12} aria-label={m.ackName}/>:null}</small>
            </div>)}
            {!messages.length?<p className="waha-empty">Nenhuma mensagem carregada nesta conversa.</p>:null}
            <div ref={bottom}/>
          </div>
          {sendError?<div className="waha-error" role="alert">{sendError}{requiresReview?<button type="button" onClick={()=>{setRequiresReview(false);setSendError('')}}>Verifiquei a conversa; liberar novo envio</button>:null}</div>:null}
          <form className="waha-compose" onSubmit={e=>{e.preventDefault();void send()}}>
            <textarea aria-label="Mensagem WhatsApp" placeholder={connected?'Escreva uma mensagem...':'WAHA desconectado'} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}}} disabled={!connected||sending||requiresReview} rows={2}/>
            <button type="submit" className="waha-primary" disabled={!connected||sending||requiresReview||!draft.trim()}>{sending?<LoaderCircle className="spin" size={17}/>:<Send size={17}/>} Enviar</button>
          </form>
        </>:<div className="waha-blank"><MessageCircle size={38}/><h3>Selecione uma conversa</h3><p>Mensagens consultadas diretamente no WAHA local, sem armazenamento adicional.</p></div>}
      </div>
    </div>
    <p className="waha-fine">A ponte funciona neste computador. Para outros computadores é necessário um túnel privado autenticado. Envios automáticos de tarefas continuam desligados.</p>
  </section>
}
