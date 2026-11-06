import {useEffect,useRef,useState,type ChangeEvent,type FormEvent,type KeyboardEvent} from 'react'
import {ArrowUpRight,BookOpen,Building2,ExternalLink,AtSign,LoaderCircle,MessageSquareText,Send,ShieldCheck} from 'lucide-react'
import type {ProspectRecord} from '../../services/prospecting-workspace'
import {env} from '../../lib/env'
import {runtimeFetch} from '../../services/realtalent-runtime-transport'
import {ProspectingCommercialExecutiveG49,type CommercialExecutiveG49,type SourceComparisonG49} from './prospecting-commercial-executive-g49'
import './prospecting-company-assistant.css'

interface PublicSource {
  id:number;title:string;url:string;snippet:string;provider:string;
  reading?:'snippet'|'metadata'|'page';excerpt?:string;readStatus?:string;
  readTitle?:string;finalUrl?:string
}
interface PostAnalysis {
  id:number;url:string;title:string;quote:string;
  evidenceLevel:'snippet'|'metadata'|'page';
  observation:string;topic:'services'|'positioning'|'promotion'|'call_to_action'|
    'partnership'|'expansion'|'hiring'|'customer_experience'|'other';
  strategicReading:string;commercialHypothesis:string;diagnosticQuestion:string;
  reviewStatus:'analysis_only'
}
interface InstagramBatchCoverage {
  indexed:number;analyzed:number;batches:number;
  patterns:Array<{topic:PostAnalysis['topic'];count:number}>
}
interface CnpjFinding {
  cnpj:string;legalName:string;tradeName:string;city:string;state:string;
  registrationStatus:string;primaryActivity:string;registrationDate:string;
  association:'compatible'|'possible'|'unconfirmed';referenceUrl:string|null;
  registrySource:string
}
interface Answer {
  ok:boolean;kind:'instagram'|'cnpj'|'overview'|'screenshot';company:string;answer:string
  sources?:PublicSource[];posts?:PublicSource[];
  profileUrl?:string|null;profileStatus?:string;
  cnpjFindings?:CnpjFinding[];limitation?:string;searchStatus?:string;
  pagesRead?:number;metadataRead?:number;
  postAnalyses?:PostAnalysis[];postAnalysisStatus?:string;postAnalysisMessage?:string;
  postAnalysisCoverage?:InstagramBatchCoverage;
  executive?:CommercialExecutiveG49;
  answerSourceIds?:number[];directAnswer?:boolean;
  visibleObservations?:string[];commercialHypotheses?:string[];limitations?:string[];model?:string
}
interface Exchange {id:string;question:string;result:Answer;comparison?:SourceComparisonG49}
const safeUrl=(value:string|null|undefined)=>{
  try{
    if(!value)return null
    const u=new URL(value)
    return u.protocol==='https:'&&u.hostname.includes('.')?u.href:null
  }catch{return null}
}
const quickPrompts=[
  {label:'Instagram público',icon:AtSign,question:'Encontre e mostre o Instagram público desta empresa e publicações acessíveis.'},
  {label:'Analisar publicações',icon:BookOpen,
    question:'Analise individualmente as publicações públicas indexadas desta empresa, separando fatos, posicionamento, hipóteses comerciais e perguntas de diagnóstico.'},
  {label:'Consultar CNPJ',icon:Building2,question:'Encontre o CNPJ desta empresa e confira o cadastro público.'},
  {label:'Serviços e diferenciais',icon:BookOpen,question:'Quais serviços desta empresa aparecem nas fontes públicas?'},
]
const postTopics:Record<PostAnalysis['topic'],string>={
  services:'Serviços',positioning:'Posicionamento',promotion:'Promoção',
  call_to_action:'Chamada para ação',partnership:'Parceria',expansion:'Expansão',
  hiring:'Contratação',customer_experience:'Experiência do cliente',other:'Outro',
}
const evidenceLabel:Record<PostAnalysis['evidenceLevel'],string>={
  snippet:'Somente prévia indexada',metadata:'Metadados públicos',page:'Trecho público lido',
}
const answerSources=(result:Answer)=>{
  const ids=result.answerSourceIds?.length
    ?result.answerSourceIds
    :[...result.answer.matchAll(/\[(\d+)\]/g)].map(match=>Number(match[1]))
  return (result.sources||[]).filter(source=>ids.includes(source.id)&&safeUrl(source.url)).slice(0,2)
}
const tone=(value:CnpjFinding['association'])=>value==='compatible'?'compatível':
  value==='possible'?'vínculo pendente':'não confirmado'
export function ProspectingCompanyAssistant({prospect}:{prospect:ProspectRecord}){
  const [question,setQuestion]=useState('')
  const [exchanges,setExchanges]=useState<Exchange[]>([])
  const [selectedExchangeId,setSelectedExchangeId]=useState<string|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const inflight=useRef<AbortController|null>(null)
  const [imageName,setImageName]=useState('')
  const fileInput=useRef<HTMLInputElement|null>(null)
  useEffect(()=>{
    inflight.current?.abort()
    setQuestion('');setExchanges([]);setSelectedExchangeId(null);setError('');setBusy(false);setImageName('')
    return ()=>inflight.current?.abort()
  },[prospect.id])
  const sendQuestion=async(requested:string)=>{
    const value=requested.trim()
    if(!value||busy)return
    const ctrl=new AbortController()
    inflight.current?.abort();inflight.current=ctrl
    const timer=setTimeout(()=>ctrl.abort(),180000)
    setQuestion('');setSelectedExchangeId(null);setBusy(true);setError('')
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
      const payload=await response.json().catch(()=>null) as (Answer&{error?:string})|null
      if(!response.ok){
        const message=response.status===429
          ?'Outra pesquisa da IA está em andamento. Tente novamente.'
          :payload?.error==='local_ai_offline'
            ?'A ponte de IA local está indisponível ou desatualizada. Reabra o CRM atualizado e confira o Agent na porta 8791.'
            :response.status===404
              ?'O Agent ainda não carregou a função G4.5. Atualize o inicializador local.'
              :payload?.error==='company_research_unavailable'
                ?'A pesquisa G4.5 falhou no Agent. Confira o diagnóstico do serviço local.'
                :'O serviço de consulta da empresa não respondeu ('+response.status+').'
        throw Error(message)
      }
      const result=payload as Answer
      if(!result.ok||typeof result.answer!=='string')throw Error('Resposta incompleta da pesquisa.')
      if(!ctrl.signal.aborted)setExchanges(old=>{
        const previous=[...old].reverse().find(item=>item.result.kind==='instagram'&&item.result.executive)?.result.executive
        const current=result.executive?.sourceUrls||[]
        const earlier=previous?.sourceUrls||[]
        const comparison:SourceComparisonG49|undefined=result.kind==='instagram'&&previous
          ?{added:current.filter(url=>!earlier.includes(url)).length,
            removed:earlier.filter(url=>!current.includes(url)).length}:undefined
        return [...old,{id:crypto.randomUUID(),question:value,result,comparison}].slice(-6)
      })
    }catch(e){
      if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:'Não foi possível consultar as fontes.')
    }finally{
      clearTimeout(timer)
      if(inflight.current===ctrl){setBusy(false);inflight.current=null}
    }
  }
  const localAgent=(()=>{
    try{
      const url=new URL(env.agentGatewayUrl)
      return url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port==='8791'
    }catch{return false}
  })()
  const onImageSelected=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0]
    if(!file||busy)return
    event.target.value=''
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2_100_000){
      setError('Envie uma captura PNG, JPG ou WebP com no máximo 2 MB.')
      return
    }
    const ctrl=new AbortController()
    inflight.current?.abort();inflight.current=ctrl
    const timer=setTimeout(()=>ctrl.abort(),115000)
    setBusy(true);setError('');setImageName(file.name)
    try{
      const data=await new Promise<string>((resolve,reject)=>{
        const reader=new FileReader()
        reader.onload=()=>resolve(String(reader.result||''))
        reader.onerror=()=>reject(new Error('Não foi possível ler a captura.'))
        reader.readAsDataURL(file)
      })
      if(ctrl.signal.aborted)return
      const base64=data.split(',')[1]||''
      const response=await runtimeFetch(env.agentGatewayUrl+'/tools/company-image',{
        method:'POST',signal:ctrl.signal,headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          company:prospect.company||prospect.name,
          question:question.trim()||'Analise somente o que está visível nesta captura pública e identifique hipóteses comerciais.',
          mime:file.type,imageBase64:base64,
        }),
      })
      const result=await response.json().catch(()=>null) as (Answer&{error?:string;model?:string})|null
      if(!response.ok){
        if(response.status===412&&result?.error==='vision_model_missing')
          throw Error('Modelo de visão não instalado no Ollama. Opcional: execute no terminal ollama pull '+(result.model||'qwen2.5vl:3b')+'.')
        throw Error(response.status===429?'A análise visual já está ocupada. Tente novamente.'
          :'A leitura da captura falhou ('+response.status+'): '+(result?.error||'serviço indisponível'))
      }
      if(!result?.ok||!result.answer)throw Error('A IA visual não gerou uma resposta válida.')
      if(!ctrl.signal.aborted){
        setSelectedExchangeId(null)
        setExchanges(old=>[...old,{
          id:crypto.randomUUID(),question:'Captura enviada: '+file.name,result,
        }].slice(-6))
      }
      setQuestion('')
    }catch(e){
      if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:'Falha ao analisar captura.')
    }finally{
      clearTimeout(timer)
      if(inflight.current===ctrl){setBusy(false);setImageName('');inflight.current=null}
    }
  }
  const visibleExchange=exchanges.find(item=>item.id===selectedExchangeId)||
    exchanges[exchanges.length-1]
  const handleSubmit=(event:FormEvent)=>{event.preventDefault();void sendQuestion(question)}
  const onKeyDown=(event:KeyboardEvent<HTMLTextAreaElement>)=>{
    if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void sendQuestion(question)}
  }
  return <section className="prospecting-company-assistant" aria-label="Pergunte à inteligência comercial sobre a empresa">
    <header>
      <span className="prospecting-company-assistant__icon"><MessageSquareText size={18}/></span>
      <div><strong>Investigação assistida por IA</strong>
        <p>Faça perguntas sobre esta empresa, analise publicações públicas em lote e confira a origem de cada conclusão.</p>
      </div>
      <span className="prospecting-company-assistant__read-only"><ShieldCheck size={13}/> Somente consulta</span>
    </header>
    <div className="prospecting-company-assistant__prompts">
      {quickPrompts.map(prompt=><button key={prompt.label} type="button" disabled={busy}
        onClick={()=>void sendQuestion(prompt.question)}><prompt.icon size={14}/>{prompt.label}</button>)}
    </div>
    {exchanges.length>1?<details className="prospecting-company-assistant__history">
      <summary>Consultas anteriores ({exchanges.length-1})</summary>
      <div>{exchanges.slice(0,-1).map(item=><button type="button" key={item.id}
        onClick={()=>setSelectedExchangeId(item.id)}
        aria-pressed={visibleExchange?.id===item.id}>{item.question}</button>)}
        {selectedExchangeId?<button type="button" onClick={()=>setSelectedExchangeId(null)}>
          Voltar à resposta mais recente
        </button>:null}</div>
    </details>:null}
    {visibleExchange?<div className="prospecting-company-assistant__conversation" aria-live="polite">
      {[visibleExchange].map(exchange=><article key={exchange.id}>
        <p className="prospecting-company-assistant__question">{exchange.question}</p>
        <div className="prospecting-company-assistant__answer">
          {exchange.result.kind!=='instagram'||!exchange.result.executive
            ?<p>{exchange.result.answer}</p>:null}
          {exchange.result.kind==='instagram'&&exchange.result.executive
            ?<ProspectingCommercialExecutiveG49 report={exchange.result.executive}
              comparison={exchange.comparison}/>:null}
          {exchange.result.kind==='instagram'&&safeUrl(exchange.result.profileUrl)
            ?<a className="prospecting-company-assistant__profile" href={safeUrl(exchange.result.profileUrl)!}
              target="_blank" rel="noopener noreferrer"><AtSign size={16}/> Abrir Instagram público <ArrowUpRight size={13}/></a>:null}
          {exchange.result.kind==='instagram'?<>
            <details className="prospecting-company-assistant__disclosure">
              <summary><BookOpen size={15}/> Análise estratégica e publicações individuais <span>Ver detalhes</span></summary>
              <div className="prospecting-company-assistant__disclosure-body">
{exchange.result.kind==='instagram'?<div className="prospecting-company-assistant__coverage">
            <strong>Leitura pública nesta pesquisa</strong>
            <span>{exchange.result.pagesRead||0} página(s) lida(s) · {exchange.result.metadataRead||0} metadado(s) acessível(is)</span>
            <small>Snippets de buscadores não são páginas lidas. A leitura do Instagram não inclui fotos, vídeos, Stories nem o feed completo.</small>
          </div>:null}
{exchange.result.kind==='instagram'?<div className="prospecting-company-assistant__post-analysis">
            <div className="prospecting-company-assistant__post-analysis-head">
              <strong>Análise das publicações com Ollama</strong>
              <small>{exchange.result.postAnalysisCoverage?.batches||0} lote(s) processado(s)</small>
            </div>
            <div className="prospecting-company-assistant__batch-metrics">
              <span><b>{exchange.result.postAnalysisCoverage?.indexed??exchange.result.posts?.length??0}</b> publicações indexadas</span>
              <span><b>{exchange.result.postAnalysisCoverage?.analyzed??exchange.result.postAnalyses?.length??0}</b> análises sustentadas</span>
              <span><b>{exchange.result.pagesRead||0}</b> páginas realmente lidas</span>
            </div>
            {exchange.result.postAnalysisCoverage?.patterns?.length?<div className="prospecting-company-assistant__patterns">
              <strong>Padrões de comunicação identificados</strong>
              <div>{exchange.result.postAnalysisCoverage.patterns.map(pattern=>
                <span key={pattern.topic}>{postTopics[pattern.topic]||pattern.topic} · {pattern.count}</span>)}</div>
              <small>Contagens entre as publicações analisadas; não representam estatísticas completas do Instagram.</small>
            </div>:null}
            {exchange.result.postAnalyses?.length
              ?exchange.result.postAnalyses.map(post=><div className="prospecting-company-assistant__post-card" key={post.url}>
                <div className="prospecting-company-assistant__post-heading">
                  <a href={safeUrl(post.url)||undefined} target="_blank" rel="noopener noreferrer">
                    {post.title||'Publicação'} <ExternalLink size={12}/></a>
                  <span>{postTopics[post.topic]||'Outro'}</span>
                </div>
                <small className="prospecting-company-assistant__post-evidence">{evidenceLabel[post.evidenceLevel]}</small>
                <blockquote>{post.quote}</blockquote>
                <p><b>Fato identificado:</b> {post.observation}</p>
                {post.strategicReading?<p><b>Leitura comercial:</b> {post.strategicReading}</p>:null}
                {post.commercialHypothesis?<p><b>Hipótese a verificar:</b> {post.commercialHypothesis}</p>:null}
                {post.diagnosticQuestion?<p><b>Pergunta consultiva:</b> {post.diagnosticQuestion}</p>:null}
                <small>Esta avaliação é uma hipótese de pesquisa, não um evento-gatilho aprovado.</small>
              </div>)
              :<p className="prospecting-company-assistant__post-empty">
                {exchange.result.postAnalysisMessage||'Nenhuma publicação possui conteúdo suficiente para análise individual fundamentada.'}
              </p>}
          </div>:null}
              </div>
            </details>
            <details className="prospecting-company-assistant__disclosure">
              <summary><ExternalLink size={15}/> Fontes, prévias e investigação completa
                <span>{exchange.result.sources?.length||0} referências</span></summary>
              <div className="prospecting-company-assistant__disclosure-body">
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
              {source.excerpt&&source.reading!=='snippet'
                ?<blockquote className="prospecting-company-assistant__excerpt">{source.excerpt}</blockquote>:null}
              <small>{source.reading==='page'
                ?'Trecho limitado de página pública efetivamente lida'
                :source.reading==='metadata'
                  ?'Metadados públicos encontrados (não é leitura integral)'
                  :source.readStatus==='restricted_or_non_html'||source.readStatus==='unavailable'
                    ?'Leitura pública indisponível; somente resultado indexado'
                    :source.readStatus==='identity_not_confirmed'
                      ?'A identidade da página não foi confirmada; somente resultado indexado'
                      :'Resultado indexado · página não lida integralmente'}</small>
            </div>)}
          </div>:null}
{exchange.result.limitation?<small className="prospecting-company-assistant__limitation">{exchange.result.limitation}</small>:null}
{exchange.result.searchStatus&&exchange.result.searchStatus!=='done'
            ?<small className="prospecting-company-assistant__limitation">Pesquisa incompleta: {exchange.result.searchStatus}</small>:null}
              </div>
            </details>
          </>:null}
          {exchange.result.kind!=='instagram'?<>
{exchange.result.kind==='screenshot'?<div className="prospecting-company-assistant__coverage">
            <strong>Imagem fornecida por você · analisada localmente no Ollama</strong>
            <small>A captura não confirma a identidade ou atualidade da conta. O RealTalent não acessou o feed por sua conta.</small>
            {exchange.result.visibleObservations?.length?<div><b>Observações visíveis</b>
              <ul>{exchange.result.visibleObservations.map((value,i)=><li key={i}>{value}</li>)}</ul></div>:null}
            {exchange.result.commercialHypotheses?.length?<div><b>Hipóteses a confirmar</b>
              <ul>{exchange.result.commercialHypotheses.map((value,i)=><li key={i}>{value}</li>)}</ul></div>:null}
            {exchange.result.limitations?.length?<small>{exchange.result.limitations.join(' · ')}</small>:null}
          </div>:null}
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
{answerSources(exchange.result).length?<div className="prospecting-company-assistant__inline-citations">
  <span>Fontes da resposta:</span>
  {answerSources(exchange.result).map(source=><a key={source.url}
    href={safeUrl(source.url)||undefined} target="_blank" rel="noopener noreferrer">
    [{source.id}] {source.title||'Conferir fonte'} <ExternalLink size={12}/></a>)}
</div>:null}
{exchange.result.sources?.length?<details className="prospecting-company-assistant__disclosure">
  <summary><ExternalLink size={14}/> Conferir todas as fontes
    <span>{exchange.result.sources.length} referências</span></summary>
  <div className="prospecting-company-assistant__disclosure-body">
{exchange.result.sources?.length?<div className="prospecting-company-assistant__sources">
            <strong>Fontes públicas ({exchange.result.sources.length})</strong>
            {exchange.result.sources.map((source,index)=><div key={source.url}>
              <a href={safeUrl(source.url)||undefined} target="_blank" rel="noopener noreferrer">
                [{index+1}] {source.title||source.url} <ExternalLink size={12}/>
              </a>
              {source.snippet?<p>{source.snippet}</p>:null}
              {source.excerpt&&source.reading!=='snippet'
                ?<blockquote className="prospecting-company-assistant__excerpt">{source.excerpt}</blockquote>:null}
              <small>{source.reading==='page'
                ?'Trecho limitado de página pública efetivamente lida'
                :source.reading==='metadata'
                  ?'Metadados públicos encontrados (não é leitura integral)'
                  :source.readStatus==='restricted_or_non_html'||source.readStatus==='unavailable'
                    ?'Leitura pública indisponível; somente resultado indexado'
                    :source.readStatus==='identity_not_confirmed'
                      ?'A identidade da página não foi confirmada; somente resultado indexado'
                      :'Resultado indexado · página não lida integralmente'}</small>
            </div>)}
          </div>:null}
  </div>
</details>:null}
{exchange.result.limitation&&!exchange.result.directAnswer
  ?<small className="prospecting-company-assistant__limitation">{exchange.result.limitation}</small>:null}
{exchange.result.searchStatus&&exchange.result.searchStatus!=='done'
  ?<small className="prospecting-company-assistant__limitation">Pesquisa incompleta: {exchange.result.searchStatus}</small>:null}
          </>:null}
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
      {localAgent?<div className="prospecting-company-assistant__visual">
        <label htmlFor={'prospect-image-'+prospect.id}>Captura do Instagram (opcional)</label>
        <input id={'prospect-image-'+prospect.id} ref={fileInput} type="file"
          accept="image/png,image/jpeg,image/webp" disabled={busy}
          onChange={event=>void onImageSelected(event)}/>
        <small>{busy&&imageName?'Analisando '+imageName+' no Ollama local…':
          'Analisa a imagem que você fornecer, somente no Ollama local. PNG/JPG/WebP de até 2 MB. Requer modelo visual instalado.'}</small>
      </div>:null}
    </form>
    {error?<p role="alert" className="prospecting-company-assistant__error">{error}</p>:null}
  </section>
}
