import {useEffect,useRef,useState,type FormEvent,type KeyboardEvent} from 'react'
import {ArrowUpRight,BookOpen,Building2,ExternalLink,Instagram,LoaderCircle,MessageSquareText,Send,ShieldCheck} from 'lucide-react'
import type {ProspectRecord} from '../../services/prospecting-workspace'
import {env} from '../../lib/env'
import {runtimeFetch} from '../../services/realtalent-runtime-transport'
import './prospecting-company-assistant.css'

interface PublicSource {
  id:number;title:string;url:string;snippet:string;provider:string;reading?:'snippet'
}
interface CnpjFinding {
  cnpj:string;legalName:string;tradeName:string;city:string;state:string;
  registrationStatus:string;primaryActivity:string;registrationDate:string;
  association:'compatible'|'possible'|'unconfirmed';referenceUrl:string|null;
  registrySource:string
}
interface Answer {
  ok:boolean;kind:'instagram'|'cnpj'|'overview';company:string;answer:string
  sources?:PublicSource[];posts?:PublicSource[];
  profileUrl?:string|null;profileStatus?:string;
  cnpjFindings?:CnpjFinding[];limitation?:string;searchStatus?:string
}
interface Exchange {id:string;question:string;result:Answer}
const safeUrl=(value:string|null|undefined)=>{
  try{
    if(!value)return null
    const u=new URL(value)
    return u.protocol==='https:'&&u.hostname.includes('.')?u.href:null
  }catch{return null}
}
const quickPrompts=[
  {label:'Instagram público',icon:Instagram,question:'Encontre e mostre o Instagram público desta empresa e publicações acessíveis.'},
  {label:'Consultar CNPJ',icon:Building2,question:'Encontre o CNPJ desta empresa e confira o cadastro público.'},
  {label:'Serviços e diferenciais',icon:BookOpen,question:'Quais serviços desta empresa aparecem nas fontes públicas?'},
]
const tone=(value:CnpjFinding['association'])=>value==='compatible'?'compatível':
  value==='possible'?'vínculo pendente':'não confirmado'
export function ProspectingCompanyAssistant({prospect}:{prospect:ProspectRecord}){
  const [question,setQuestion]=useState('')
  const [exchanges,setExchanges]=useState<Exchange[]>([])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const inflight=useRef<AbortController|null>(null)
  useEffect(()=>{
    inflight.current?.abort()
    setQuestion('');setExchanges([]);setError('');setBusy(false)
    return ()=>inflight.current?.abort()
  },[prospect.id])
  const sendQuestion=async(requested:string)=>{
    const value=requested.trim()
    if(!value||busy)return
    const ctrl=new AbortController()
    inflight.current?.abort();inflight.current=ctrl
    const timer=setTimeout(()=>ctrl.abort(),115000)
    setQuestion('');setBusy(true);setError('')
    try{
      const response=await runtimeFetch(env.agentGatewayUrl+'/tools/company-ask',{
        method:'POST',signal:ctrl.signal,headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          question:value,
          company:prospect.company||prospect.name,
          city:prospect.city,
          // Only public identifiers, never messages, contacts, CRM notes or workspace data.
          cnpj:prospect.cnpj||'',
          instagram:prospect.instagram||'',
        }),
      })
      if(!response.ok)throw Error(response.status===429
        ?'Outra pesquisa da IA está em andamento. Tente novamente.'
        :'O serviço de consulta da empresa não respondeu ('+response.status+').')
      const result=await response.json() as Answer
      if(!result.ok||typeof result.answer!=='string')throw Error('Resposta incompleta da pesquisa.')
      if(!ctrl.signal.aborted)setExchanges(old=>[...old,{id:crypto.randomUUID(),question:value,result}].slice(-6))
    }catch(e){
      if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:'Não foi possível consultar as fontes.')
    }finally{
      clearTimeout(timer)
      if(inflight.current===ctrl){setBusy(false);inflight.current=null}
    }
  }
  const handleSubmit=(event:FormEvent)=>{event.preventDefault();void sendQuestion(question)}
  const onKeyDown=(event:KeyboardEvent<HTMLTextAreaElement>)=>{
    if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void sendQuestion(question)}
  }
  return <section className="prospecting-company-assistant" aria-label="Pergunte à inteligência comercial sobre a empresa">
    <header>
      <span className="prospecting-company-assistant__icon"><MessageSquareText size={18}/></span>
      <div><strong>Pergunte à IA sobre esta empresa</strong>
        <p>Pesquise Instagram, CNPJ, serviços e sinais públicos sem sair da revisão.</p>
      </div>
      <span className="prospecting-company-assistant__read-only"><ShieldCheck size={13}/> Somente consulta</span>
    </header>
    <div className="prospecting-company-assistant__prompts">
      {quickPrompts.map(prompt=><button key={prompt.label} type="button" disabled={busy}
        onClick={()=>void sendQuestion(prompt.question)}><prompt.icon size={14}/>{prompt.label}</button>)}
    </div>
    {exchanges.length?<div className="prospecting-company-assistant__conversation" aria-live="polite">
      {exchanges.map(exchange=><article key={exchange.id}>
        <p className="prospecting-company-assistant__question">{exchange.question}</p>
        <div className="prospecting-company-assistant__answer">
          <p>{exchange.result.answer}</p>
          {exchange.result.kind==='instagram'&&safeUrl(exchange.result.profileUrl)
            ?<a className="prospecting-company-assistant__profile" href={safeUrl(exchange.result.profileUrl)!}
              target="_blank" rel="noopener noreferrer"><Instagram size={16}/> Abrir perfil público no Instagram <ArrowUpRight size={13}/></a>:null}
          {exchange.result.cnpjFindings?.length?<div className="prospecting-company-assistant__cnpjs">
            {exchange.result.cnpjFindings.map(record=><div key={record.cnpj}>
              <div><strong>{record.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')}</strong>
                <small className={'is-'+record.association}>{tone(record.association)}</small></div>
              <p><b>Razão social:</b> {record.legalName||'Não informada'}</p>
              {record.tradeName?<p><b>Nome fantasia:</b> {record.tradeName}</p>:null}
              <p><b>Município:</b> {[record.city,record.state].filter(Boolean).join(' / ')||'Não informado'}</p>
              <p><b>Situação:</b> {record.registrationStatus||'Não informada'}</p>
              {record.primaryActivity?<p><b>Atividade:</b> {record.primaryActivity}</p>:null}
              {safeUrl(record.referenceUrl)?<a target="_blank" rel="noopener noreferrer" href={safeUrl(record.referenceUrl)!}>
                <ExternalLink size={12}/> Conferir fonte da associação
              </a>:null}
              <small>Cadastro consultado na BrasilAPI. Revise o vínculo com este estabelecimento.</small>
            </div>)}
          </div>:null}
          {exchange.result.posts?.length?<div className="prospecting-company-assistant__posts">
            <strong>Publicações indexadas encontradas</strong>
            {exchange.result.posts.map(post=><a key={post.url} href={safeUrl(post.url)||undefined} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={13}/>{post.title||'Abrir publicação'} <small>{post.snippet||'Prévia indisponível'}</small>
            </a>)}
          </div>:null}
          {exchange.result.sources?.length?<div className="prospecting-company-assistant__sources">
            <strong>Fontes públicas ({exchange.result.sources.length})</strong>
            {exchange.result.sources.map((source,index)=><div key={source.url}>
              <a href={safeUrl(source.url)||undefined} target="_blank" rel="noopener noreferrer">
                [{index+1}] {source.title||source.url} <ExternalLink size={12}/>
              </a>
              {source.snippet?<p>{source.snippet}</p>:null}
              <small>Resultado indexado · página não lida integralmente</small>
            </div>)}
          </div>:null}
          {exchange.result.limitation?<small className="prospecting-company-assistant__limitation">{exchange.result.limitation}</small>:null}
          {exchange.result.searchStatus&&exchange.result.searchStatus!=='done'
            ?<small className="prospecting-company-assistant__limitation">Pesquisa incompleta: {exchange.result.searchStatus}</small>:null}
        </div>
      </article>)}
    </div>:null}
    <form onSubmit={handleSubmit}>
      <label htmlFor={'prospect-ai-question-'+prospect.id}>O que você quer saber sobre {prospect.company||prospect.name}?</label>
      <div><textarea id={'prospect-ai-question-'+prospect.id} value={question} onChange={e=>setQuestion(e.target.value)}
        onKeyDown={onKeyDown} disabled={busy} maxLength={500} rows={2}
        placeholder="Ex.: Mostre o Instagram público e suas publicações, ou localize o CNPJ."/>
        <button type="submit" disabled={busy||question.trim().length<5}>
          {busy?<LoaderCircle className="spin" size={16}/>:<Send size={16}/>}
          {busy?'Pesquisando':'Perguntar'}
        </button></div>
      <small>Enter envia · Shift+Enter quebra a linha · Nenhum dado é alterado automaticamente.</small>
    </form>
    {error?<p role="alert" className="prospecting-company-assistant__error">{error}</p>:null}
  </section>
}
