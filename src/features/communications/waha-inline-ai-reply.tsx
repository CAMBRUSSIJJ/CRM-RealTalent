import {useEffect,useRef,useState} from 'react'
import {BrainCircuit,Check,LoaderCircle,RefreshCw,X} from 'lucide-react'
import {
  wahaAnalyzeSelectedConversation,
  type WahaReplyTone,
} from '../../services/waha-direct'
import './waha-inline-ai-reply.css'

const TONES:{value:WahaReplyTone;label:string}[]=[
  {value:'objetiva',label:'Objetiva'},
  {value:'consultiva',label:'Consultiva'},
  {value:'comercial',label:'Comercial'},
  {value:'amigavel',label:'Amigável'},
  {value:'profissional',label:'Profissional'},
]
type Props={
  token:string;chatId:string;latestMessageId:string;
  originalDraft:string;initialIntent:'suggest'|'improve';
  onInsert:(text:string)=>void;onClose:()=>void
}

/** G4.11 — draft-only assistance. This component NEVER calls WAHA send. */
export function WahaInlineAiReply({
  token,chatId,latestMessageId,originalDraft,initialIntent,onInsert,onClose,
}:Props){
  const [tone,setTone]=useState<WahaReplyTone>('objetiva')
  const [suggestion,setSuggestion]=useState('')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [model,setModel]=useState('')
  const [usedMessageId,setUsedMessageId]=useState('')
  const [intent,setIntent]=useState<'suggest'|'improve'>(initialIntent)
  const active=useRef(true)
  const generation=useRef(0)
  const latestRef=useRef(latestMessageId)
  latestRef.current=latestMessageId

  useEffect(()=>{active.current=true;return()=>{
    active.current=false;generation.current+=1
  }},[])

  async function generate(selectedTone:WahaReplyTone,selectedIntent:'suggest'|'improve'){
    const id=++generation.current
    const sourceMessage=latestRef.current
    setLoading(true);setError('');setSuggestion('')
    try{
      const result=await wahaAnalyzeSelectedConversation(token,chatId,'reply','',{
        tone:selectedTone,intent:selectedIntent,
        ...(selectedIntent==='improve'?{draft:originalDraft.trim().slice(0,1500)}:{}),
      })
      if(!active.current||generation.current!==id)return
      if(result.chatId!==chatId||result.sent!==false||result.readOnly!==true)
        throw Error('A resposta da IA não corresponde à conversa selecionada.')
      const text=String(result.text||'').trim()
      if(!text||text.length>750)throw Error('O Ollama não retornou uma resposta útil.')
      setSuggestion(text);setUsedMessageId(sourceMessage)
      setModel(result.model)
    }catch(e){
      if(active.current&&generation.current===id)
        setError(e instanceof Error?e.message:'Não foi possível gerar a resposta.')
    }finally{
      if(active.current&&generation.current===id)setLoading(false)
    }
  }
  // A single click on "Sugerir resposta" opens and generates the first draft.
  useEffect(()=>{
    // Delay the first call until after StrictMode's development effect cleanup:
    // avoid sending duplicate heavy Qwen requests on mount.
    const timer=window.setTimeout(()=>{void generate('objetiva',initialIntent)},0)
    return()=>window.clearTimeout(timer)
    // The component is keyed by chatId and intent. Re-runs are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])
  const outOfDate=Boolean(suggestion)&&usedMessageId!==latestMessageId
  return <section className="waha-inline-ai" aria-label="Sugestão de resposta com IA">
    <header><strong><BrainCircuit size={15}/> Assistente de resposta</strong>
      <span>Ollama local · Apenas rascunho</span>
      <button type="button" onClick={onClose} aria-label="Fechar sugestão"><X size={15}/></button>
    </header>
    <div className="waha-inline-ai__tones" aria-label="Estilo da resposta">
      {TONES.map(item=><button type="button" key={item.value}
        aria-pressed={tone===item.value} className={tone===item.value?'active':''}
        disabled={loading} onClick={()=>{
          setTone(item.value);void generate(item.value,intent)
        }}>{item.label}</button>)}
    </div>
    {loading?<p className="waha-inline-ai__state" role="status"><LoaderCircle size={14} className="spin"/>
      Preparando resposta com base na conversa…</p>:null}
    {error?<p role="alert" className="waha-inline-ai__error">{error}</p>:null}
    {suggestion?<div className="waha-inline-ai__preview" aria-live="polite">
      <p>{suggestion}</p>
      <small>{model} · Confira dados e compromissos antes de enviar.</small>
    </div>:null}
    {outOfDate?<p role="alert" className="waha-inline-ai__warning">
      Chegaram mensagens novas. Gere outra sugestão para considerar o contexto atualizado.
    </p>:null}
    <footer>
      <button type="button" onClick={()=>{setIntent('suggest');void generate(tone,'suggest')}} disabled={loading}>
        <RefreshCw size={14}/> Outra resposta
      </button>
      {originalDraft.trim().length>=3?<button type="button"
        onClick={()=>{setIntent('improve');void generate(tone,'improve')}} disabled={loading}>
        Melhorar meu texto
      </button>:null}
      <button type="button" className="waha-inline-ai__insert" disabled={!suggestion||loading||outOfDate}
        onClick={()=>onInsert(suggestion)}><Check size={14}/> Inserir no campo</button>
    </footer>
    <small className="waha-inline-ai__notice">Não envia mensagens. Revise o texto antes de clicar em Enviar no chat.</small>
  </section>
}
