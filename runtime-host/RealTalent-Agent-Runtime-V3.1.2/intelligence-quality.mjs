const norm=(v='')=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9_+#.\/\s-]/g,' ').replace(/\s+/g,' ').trim()
const STOP=new Set('a o os as um uma uns umas de da do das dos em no na nos nas por para pra com sem e ou que como qual quais quem onde quando porque por isso esse essa estes estas isso isto eu voce você tu ele ela eles elas meu minha meus minhas seu sua seus suas me te se ao aos mais menos muito muita muitos muitas'.split(/\s+/))
const tokens=(v='')=>[...new Set(norm(v).split(/\s+/).filter(x=>x.length>2&&!STOP.has(x)))]
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n))
const overlap=(a,b)=>{const A=new Set(tokens(a)),B=new Set(tokens(b));if(!A.size||!B.size)return 0;let hit=0;for(const x of A)if(B.has(x))hit++;return hit/Math.max(1,Math.min(A.size,B.size))}
const isCodey=(v='')=>/(\.tsx?\b|\.jsx?\b|\.py\b|\.sql\b|\/src\/|_[a-z0-9]+|[a-z0-9]+\.[a-z0-9]+|endpoint|gateway|hook|component|componente|fun[cç][aã]o|classe|schema)/.test(norm(v))
const WRITE=/\b(crie|criar|altere|alterar|atualize|atualizar|mova|mover|envie|enviar|rode|rodar|execute|executar|implemente|implementar|corrija|corrigir|remova|remover|troque|trocar)\b/
const READ=/\b(mostre|listar|liste|buscar|busque|encontre|ver|veja|qual|quais|analise|analisar|compare|comparar|explique|resuma|resumir)\b/
const VISUAL=/\b(imagem|print|screenshot|tela|botao|botão|card|modal|layout|canto|lado|visual|interface|ui|ux)\b/
const GENERIC_OPEN=/^(claro[!.:,\s]+|com certeza[!.:,\s]+|certamente[!.:,\s]+|perfeito[!.:,\s]+|sem problema[!.:,\s]+|aqui est[aá][!.:,\s]+|vamos l[aá][!.:,\s]+)/i
const GENERIC_CLOSE=/(?:\n\n|^)(?:se quiser|caso queira|se precisar|se desejar),?\s+(?:posso|eu posso)[^\n]{0,220}[.!]?\s*$/i

export const intelligenceQualityInfo=Object.freeze({
  version:'3.1',name:'Intelligence Quality',generation:'quality-first',
  features:{naturalConversation:true,contextPrecision2:true,semanticMemoryConflictAwareness:true,rag2DynamicThresholds:true,referenceResolution2:true,toolSelection2:true,visionUnderstanding2:true,latencyBudgets:true,realWorldQualityDataset:true,humanEvaluationRubric:true}
})

export function buildResponseStyleProfile({message='',turnPlan={},complexity={}}={}){
  const intent=turnPlan?.intent||'smalltalk',tier=complexity?.tier||turnPlan?.intelligenceCore?.complexity?.tier||'standard'
  const short=['greeting','thanks'].includes(intent),personal=intent==='personal_emotional',technical=['project_question','analysis_job','execute_task','app_context_reference'].includes(intent)
  return {
    version:'3.1',language:'pt-BR',tone:personal?'warm-direct':'natural-direct',directAnswerFirst:true,
    opening:short?'brief':'answer-before-explanation',avoidGenericPreamble:!short,avoidGenericClosing:true,
    maxHeadings:short?0:tier==='deep'?5:technical?3:2,maxBullets:tier==='deep'?12:8,
    targetWords:short?24:personal?180:tier==='deep'?650:technical?360:220,
    preserveMarkdown:true,avoidMetaNarration:true
  }
}

export function naturalizeResponse(text,style={}){
  let value=String(text||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim()
  if(!value)return value
  if(style?.avoidGenericPreamble!==false)value=value.replace(GENERIC_OPEN,'').trimStart()
  if(style?.avoidGenericClosing!==false)value=value.replace(GENERIC_CLOSE,'').trimEnd()
  const maxHeadings=Math.max(0,Number(style?.maxHeadings??5));if(maxHeadings>=0){let seen=0;value=value.split('\n').filter(line=>{if(/^#{1,6}\s+/.test(line)){seen++;return seen<=maxHeadings}return true}).join('\n')}
  return value.replace(/\n{3,}/g,'\n\n').trim()
}

const entityHints=(value='')=>tokens(value).filter(t=>/\d/.test(t)||t.includes('_')||t.includes('.')||t.includes('/')||t.length>=8)
export function selectPrecisionContext({messages=[],query='',limit=6,topicShift=false}={}){
  if(topicShift||!Array.isArray(messages)||!messages.length||limit<=0)return []
  const q=String(query||''),qt=tokens(q),entities=new Set(entityHints(q)),total=messages.length,scored=[]
  for(let i=0;i<total;i++){
    const m=messages[i];if(!m||!['user','assistant'].includes(m.role))continue
    const content=String(m.content||'').trim();if(!content)continue
    const lexical=overlap(q,content),recency=(i+1)/total
    const cTokens=tokens(content);let entityHits=0;for(const t of cTokens)if(entities.has(t))entityHits++
    const entityScore=entities.size?entityHits/entities.size:0
    const role=m.role==='user'?.05:0
    const recentPair=(i>=Math.max(0,total-2)&&(lexical>0||entityScore>0))?.08:0
    const stalePenalty=qt.length>=3&&lexical===0&&entityScore===0&&i<total-6?.16:0
    const score=lexical*.55+entityScore*.20+recency*.18+role+recentPair-stalePenalty
    if(score>.10||lexical>0||entityScore>0)scored.push({i,m,score})
  }
  const selected=scored.sort((a,b)=>b.score-a.score||b.i-a.i).slice(0,Math.max(1,limit))
  const indexes=new Set(selected.map(x=>x.i))
  for(const x of selected){const neighbor=x.m.role==='user'?x.i+1:x.i-1;if(neighbor>=0&&neighbor<total&&messages[neighbor]&&['user','assistant'].includes(messages[neighbor].role))indexes.add(neighbor)}
  return [...indexes].sort((a,b)=>a-b).slice(-Math.max(limit,Math.min(limit+2,indexes.size))).map(i=>({role:messages[i].role,content:String(messages[i].content||'').slice(0,2800),at:messages[i].at,relevance:Number((selected.find(x=>x.i===i)?.score||.05).toFixed(3)),qualityContext:true}))
}

function cues(message=''){
  const low=norm(message)
  return {visual:VISUAL.test(low),app:/\b(registro|contato|lead|oportunidade|selecionad|campo|rota|pagina|p[aá]gina)\b/.test(low),attachment:/\b(anexo|arquivo|imagem enviada|print enviado)\b/.test(low),conversation:/^(e |mas |entao|então|isso|ele|ela|e isso|e ele|e ela|como|por que|porque)/.test(low)}
}
export function refineReference31({message='',attachments=[],appContext=null,messages=[],baseReference=null}={}){
  const base=baseReference||{source:'explicit_message',confidence:1,candidates:[]},cs=Array.isArray(base.candidates)?base.candidates:[],hint=cues(message)
  if((attachments||[]).length&&cs.some(x=>x.source==='attachment'))return {...cs.find(x=>x.source==='attachment'),candidates:cs,resolverVersion:'3.1',decision:'current-attachment'}
  const bareVague=/^(isso|isto|aqui|ali|ele|ela)[!.?\s]*$/.test(norm(message));const ranked=[...cs].sort((a,b)=>Number(b.confidence||0)-Number(a.confidence||0));if(bareVague&&ranked.length>1&&Number(ranked[0].confidence||0)-Number(ranked[1].confidence||0)<.08)return {source:'unresolved',confidence:Number(ranked[0].confidence||.5),candidates:cs,resolverVersion:'3.1',reason:'referência curta compatível com mais de uma evidência atual'}
  const prefer=hint.visual?'visual_context':hint.app?'app_context':hint.attachment?'attachment':hint.conversation?'conversation':null
  if(prefer&&cs.some(x=>x.source===prefer)){const found=cs.find(x=>x.source===prefer);return {...found,confidence:Math.max(Number(found.confidence||0),.92),candidates:cs,resolverVersion:'3.1',decision:`cue:${prefer}`}}
  if(base.source!=='unresolved'&&base.source!=='explicit_message'){
    const sorted=[...cs].sort((a,b)=>Number(b.confidence||0)-Number(a.confidence||0)),top=sorted[0],second=sorted[1]
    if(top&&second&&Number(top.confidence||0)<.98&&Number(top.confidence||0)-Number(second.confidence||0)<.055&&!prefer)return {source:'unresolved',confidence:Number(top.confidence||.5),candidates:cs,resolverVersion:'3.1',reason:'duas referências plausíveis com confiança semelhante'}
    return {...base,resolverVersion:'3.1'}
  }
  return {...base,resolverVersion:'3.1'}
}

const TOOL_HINTS={
  'crm.contacts.search':['contato','contatos','lead','leads','follow-up','followup','pessoa','pessoas','buscar','encontrar','listar'],
  'crm.contacts.get':['contato','lead','detalhe','id'],
  'crm.contacts.update':['contato','lead','responsavel','responsável','telefone','email','atualizar','alterar'],
  'crm.pipeline.list':['pipeline','oportunidade','oportunidades','etapa','negociacao','negociação','risco'],
  'crm.pipeline.moveOpportunity':['mover','mova','oportunidade','etapa','pipeline'],
  'crm.communications.getThread':['whatsapp','email','mensagem','thread','conversa','comunicacao','comunicação'],
  'crm.communications.sendMessage':['enviar','envie','mensagem','whatsapp','email'],
  'crm.prospecting.runSearch':['garimpo','prospectar','prospecção','buscar empresas','busca local'],
  'blueOcean.journey.get':['jornada','journey','etapa da jornada'],
  'blueOcean.blueprint.get':['blueprint','frontstage','backstage','linha de visibilidade'],
  'blueOcean.persona.get':['persona','cliente','perfil'],
  'blueOcean.serviceGraph.read':['service graph','grafo','serviço','servico','ecossistema']
}
export function rankToolsForRequest({message='',tools=[],product=null,orchestration={},appContext=null}={}){
  const low=norm(message),writeIntent=WRITE.test(low),readIntent=READ.test(low)||!writeIntent
  const ranked=(tools||[]).map(tool=>{
    const name=String(tool?.name||''),hints=TOOL_HINTS[name]||[],match=hints.reduce((s,h)=>s+(low.includes(norm(h))?1:0),0)
    let score=.08+Math.min(.62,match*.14)
    if(product&&name.startsWith(product==='blue_ocean'?'blueOcean.':`${product}.`))score+=.08
    if(appContext&&name.startsWith(appContext.product==='blue_ocean'?'blueOcean.':`${appContext.product}.`))score+=.08
    if(tool?.capability==='write'){score+=writeIntent?.13:-.16}else if(readIntent)score+=.12
    if(orchestration?.toolFirst&&tool?.capability==='read')score+=.08
    return {...tool,qualityScore:Number(clamp(score).toFixed(3)),recommended:score>=.32}
  }).sort((a,b)=>b.qualityScore-a.qualityScore||String(a.name).localeCompare(String(b.name)))
  return {version:'3.1',strategy:'intent+domain+risk-ranked',writeIntent,readIntent,recommended:ranked.filter(x=>x.recommended).slice(0,5).map(x=>x.name),rankedTools:ranked}
}

export function buildLatencyBudget({complexity={},orchestration={},attachments=[],qualityMode='balanced'}={}){
  const tier=complexity?.tier||'standard',vision=(attachments||[]).length>0
  const base=tier==='instant'?3500:tier==='deep'?45000:14000
  const total=Math.round(base*(vision?1.8:1)*(orchestration?.toolFirst?1.35:1)*(qualityMode==='deep'?1.25:1))
  return {version:'3.1',tier,totalMs:Math.min(120000,total),retrievalMs:tier==='deep'?6000:3500,firstTokenTargetMs:tier==='instant'?1200:tier==='standard'?2500:5000,maxOutputTokens:tier==='instant'?650:tier==='standard'?1800:3200,cacheEligible:!vision&&!orchestration?.toolFirst}
}

export function responseQualityMetrics({prompt='',answer='',style={}}={}){
  const text=String(answer||'').trim(),paras=text.split(/\n\n+/).filter(Boolean),headings=(text.match(/^#{1,6}\s/gm)||[]).length
  const promptTokens=tokens(prompt),answerTokens=new Set(tokens(answer));const coverage=promptTokens.length?promptTokens.filter(x=>answerTokens.has(x)).length/promptTokens.length:1
  const preamble=GENERIC_OPEN.test(text),genericClosing=GENERIC_CLOSE.test(text)
  const repeated=paras.length>1?1-new Set(paras.map(norm)).size/paras.length:0
  const score=clamp(.52+coverage*.30-(preamble?.08:0)-(genericClosing?.06:0)-repeated*.2-(headings>Number(style?.maxHeadings??5)?.08:0))
  return {version:'3.1',score:Number(score.toFixed(3)),coverage:Number(coverage.toFixed(3)),genericPreamble:preamble,genericClosing,headings,repetition:Number(repeated.toFixed(3))}
}

export function buildQualityPlan({message='',turnPlan={},orchestration={},messages=[],tools=[],appContext=null,intelligenceCore=null,attachments=[]}={}){
  const style=buildResponseStyleProfile({message,turnPlan,complexity:intelligenceCore?.complexity||{}})
  const toolSelection=rankToolsForRequest({message,tools,product:turnPlan?.requestedProduct||appContext?.product||null,orchestration,appContext})
  const latency=buildLatencyBudget({complexity:intelligenceCore?.complexity||{},orchestration,attachments})
  return {version:'3.1',style,context:{strategy:'precision-relevance+pair-continuity',topicShift:Boolean(turnPlan?.topicShift),requestedMessages:Number(turnPlan?.contextMessages||0)},reference:{source:turnPlan?.reference?.source||'explicit_message',confidence:Number(turnPlan?.reference?.confidence??1),resolverVersion:turnPlan?.reference?.resolverVersion||'3.1'},toolSelection,latency,qualityGates:{answerFirst:true,noGenericPreamble:true,noGenericClosing:true,abstainOnAmbiguousReference:true,preferCurrentEvidence:true}}
}
