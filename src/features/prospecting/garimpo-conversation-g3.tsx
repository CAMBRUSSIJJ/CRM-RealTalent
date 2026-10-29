import {useEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react'
import {ArrowRight,ChevronDown,LoaderCircle,MessageCircle,Search,Send,Sparkles} from 'lucide-react'
import {Button} from '../../components/ui/button'
import type {WorkspaceSnapshot} from '../../domain/types'
import type {ProspectRecord} from '../../services/prospecting-workspace'
import {rankProspects} from '../../services/prospecting-intelligence'
import {explainProspectScore} from '../../services/prospecting-g1g2-intelligence'
import {env} from '../../lib/env'
import {runtimeFetch} from '../../services/realtalent-runtime-transport'
import '../../styles/prospecting-g3.css'

export interface GarimpoSearchProposal {segment:string;city:string;quantity:number}
interface Plan extends GarimpoSearchProposal {
  intent:'search'|'rank'|'review'|'answer'|'clarify'
  confidence:number
  answer:string
}
interface Message {role:'user'|'assistant';text:string}
interface Props {
  prospects:ProspectRecord[]
  snapshot:WorkspaceSnapshot
  currentSegment:string
  currentCity:string
  currentQuantity:number
  canWrite:boolean
  searchBusy:boolean
  onSearch(request:GarimpoSearchProposal):Promise<boolean>
  onReview():void
}
const starter:Message={role:'assistant',text:'Posso buscar empresas na região escolhida, priorizar as que já estão na revisão e explicar os sinais comerciais. O envio ao CRM continua sob sua decisão.'}
const safeText=(value:unknown,max=500)=>typeof value==='string'?value.trim().slice(0,max):''
const validPlan=(value:unknown):value is Plan=>{
  if(!value||typeof value!=='object')return false
  const p=value as Partial<Plan>
  return ['search','rank','review','answer','clarify'].includes(String(p.intent)) &&
    typeof p.segment==='string' && typeof p.city==='string' &&
    typeof p.quantity==='number' && Number.isInteger(p.quantity) &&
    p.quantity>=1 && p.quantity<=150 &&
    typeof p.answer==='string' && typeof p.confidence==='number'
}
/** Conversational control of existing Garimpo native tools. Never writes to CRM. */
export function GarimpoConversationG3({
  prospects,snapshot,currentSegment,currentCity,currentQuantity,canWrite,searchBusy,onSearch,onReview,
}:Props){
  const [expanded,setExpanded]=useState(false)
  const [message,setMessage]=useState('')
  const [turns,setTurns]=useState<Message[]>([starter])
  const [pending,setPending]=useState<GarimpoSearchProposal|null>(null)
  const [thinking,setThinking]=useState(false)
  const [executing,setExecuting]=useState(false)
  const abortRef=useRef<AbortController|null>(null)
  const endRef=useRef<HTMLDivElement|null>(null)
  const ranked=useMemo(()=>rankProspects(prospects,snapshot),[prospects,snapshot])
  useEffect(()=>()=>{abortRef.current?.abort()},[])
  useEffect(()=>{if(expanded)endRef.current?.scrollIntoView({block:'nearest',behavior:'smooth'})},[turns,expanded,pending])

  const ask=async(text:string)=>{
    const prompt=text.trim().slice(0,1100)
    if(!prompt||thinking||executing)return
    setExpanded(true)
    setMessage('')
    setPending(null)
    const previous=turns.slice(-6)
    setTurns(current=>[...current,{role:'user',text:prompt}].slice(-24))
    setThinking(true)
    const controller=new AbortController()
    abortRef.current?.abort()
    abortRef.current=controller
    const timer=setTimeout(()=>controller.abort(),55000)
    try{
      // Only aggregated counts and the user-selected search context leave the
      // browser. No phone, email, CRM IDs, free-form notes or customer contacts.
      const response=await runtimeFetch(env.agentGatewayUrl+'/tools/garimpo-conversation',{
        method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({prompt,context:{
          segment:currentSegment,city:currentCity,quantity:currentQuantity,
          totalKnown:prospects.length,
        },history:previous.map(turn=>({role:turn.role,text:turn.text.slice(0,400)}))})
      })
      if(!response.ok)throw Error(response.status===429?'O modelo está ocupado; tente novamente.':'O Agent local não está disponível. Verifique o Ollama e o gateway.')
      const payload=await response.json() as {ok?:boolean;plan?:unknown}
      if(!payload.ok||!validPlan(payload.plan))throw Error('A interpretação da IA não pôde ser validada.')
      const plan=payload.plan
      let reply=safeText(plan.answer)
      if(plan.intent==='search'){
        if(!plan.segment.trim()||!plan.city.trim()||plan.confidence<0.65){
          reply='Preciso confirmar o segmento e a região antes de iniciar a busca.'
        }else{
          const proposal={segment:plan.segment.trim(),city:plan.city.trim(),quantity:plan.quantity}
          setPending(proposal)
          reply='Preparei a pesquisa de '+proposal.quantity+' empresa(s) de '+proposal.segment+
            ' em '+proposal.city+'. Confira a região abaixo e clique em Iniciar busca. Nenhuma empresa será aprovada automaticamente.'
        }
      }else if(plan.intent==='rank'){
        if(!ranked.length)reply='Ainda não há empresas disponíveis para priorizar. Inicie uma busca e revise os resultados.'
        else{
          const lines=ranked.slice(0,5).map(({prospect})=>{
            const dimensions=explainProspectScore(prospect,snapshot)
            const reason=dimensions.reasons[0]||'Requer validação comercial'
            return prospect.company+' ('+prospect.city+'): ICP '+dimensions.fit+
              '/100, potencial '+dimensions.opportunity+'/100, evidências '+
              dimensions.evidenceConfidence+'/100. '+reason+'.'
          })
          reply='Prioridade para investigação, não previsão de compra:\n'+lines.join('\n')+
            '\nOs dados são os que já existem no Garimpo. Confirme cada empresa antes de aprovar.'
        }
      }else if(plan.intent==='review'){
        onReview()
        reply='Abri a revisão das empresas disponíveis. Você pode analisar os dados e aprovar cada registro manualmente.'
      }else if(plan.intent==='clarify')reply=reply||'Qual segmento e cidade devo considerar?'
      setTurns(current=>[...current,{role:'assistant',text:reply}].slice(-24))
    }catch(error){
      if(!controller.signal.aborted)setTurns(current=>[...current,{role:'assistant',text:error instanceof Error?error.message:'Não consegui conversar com o Agent.'}].slice(-24))
    }finally{
      clearTimeout(timer)
      if(abortRef.current===controller){abortRef.current=null;setThinking(false)}
    }
  }
  const confirmSearch=async()=>{
    if(!pending||!canWrite||thinking||searchBusy||executing)return
    const proposal=pending
    setExecuting(true)
    try{
      const ok=await onSearch(proposal)
      setTurns(current=>[...current,{role:'assistant',text:ok?
        'Busca iniciada pelo motor territorial. Os resultados reais serão encaminhados à Revisão; acompanhe o progresso na aba Buscar.':
        'A pesquisa não foi iniciada. Confira as permissões, o motor do Garimpo e o território selecionado.'}].slice(-24))
      if(ok)setPending(null)
    }catch(error){
      setTurns(current=>[...current,{role:'assistant',text:error instanceof Error?error.message:'Não foi possível iniciar a busca.'}].slice(-24))
    }finally{setExecuting(false)}
  }
  const onKeyDown=(event:KeyboardEvent<HTMLTextAreaElement>)=>{
    if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void ask(message)}
  }
  return <section className={'garimpo-g3'+(expanded?' is-open':'')} aria-label="Conversa com Agent do Garimpo">
    <header className="garimpo-g3__header">
      <div className="garimpo-g3__title"><span><MessageCircle size={17}/></span><div><strong>Converse com o Garimpo</strong><small>Agent local · Qwen3 8B · G3</small></div></div>
      <button type="button" className="garimpo-g3__toggle" onClick={()=>setExpanded(value=>!value)} aria-expanded={expanded}>{expanded?'Recolher':'Abrir conversa'}<ChevronDown size={16}/></button>
    </header>
    {expanded?<div className="garimpo-g3__body">
      <div className="garimpo-g3__feed" role="log" aria-live="polite" aria-label="Histórico da conversa">
        {turns.map((turn,index)=><article key={index} className={'garimpo-g3__turn is-'+turn.role}><div>{turn.role==='assistant'?<Sparkles size={14}/>:null}<p>{turn.text}</p></div></article>)}
        {thinking?<div className="garimpo-g3__thinking"><LoaderCircle size={15} className="spin"/> Interpretando o pedido com Qwen…</div>:null}
        <div ref={endRef}/>
      </div>
      {pending?<div className="garimpo-g3__proposal">
        <div><strong>Busca preparada</strong><span>{pending.quantity} empresas · {pending.segment} · {pending.city}</span></div>
        <Button onClick={()=>void confirmSearch()} disabled={!canWrite||thinking||executing||searchBusy}>{executing?<LoaderCircle size={15} className="spin"/>:<Search size={15}/>} Iniciar busca</Button>
      </div>:null}
      <div className="garimpo-g3__examples">
        <button type="button" disabled={thinking} onClick={()=>void ask('Quais empresas devo investigar primeiro e por quê?')}>Priorizar resultados</button>
        <button type="button" disabled={thinking} onClick={()=>void ask('Abra a revisão das empresas encontradas.')}>Abrir revisão</button>
      </div>
      <div className="garimpo-g3__compose">
        <textarea aria-label="Mensagem para o Garimpo" rows={2} maxLength={1100}
          value={message} onChange={event=>setMessage(event.target.value)} onKeyDown={onKeyDown}
          placeholder="Ex.: encontre 40 empresas de jardinagem em Rio Grande e depois me diga quais merecem atenção."/>
        <Button aria-label="Enviar mensagem" disabled={!message.trim()||thinking||executing} onClick={()=>void ask(message)}><Send size={16}/></Button>
      </div>
      <small className="garimpo-g3__disclaimer"><ArrowRight size={12}/> A IA interpreta pedidos, mas não inventa resultados, não altera o mapa desenhado e não envia registros ao CRM.</small>
    </div>:null}
  </section>
}
