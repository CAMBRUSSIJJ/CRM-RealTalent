// G4.9 executive commercial intelligence. Deterministic ranking of *already*
// Qwen-analyzed, source-attributed posts. Not a probability or purchase-intent
// score. No extra model pass, external API, writes, automatic G4 approvals,
// or invented company needs.
const clean=(value,max=350)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ')
  .replace(/\s+/g,' ').trim().slice(0,max)
const fold=x=>clean(x,1500).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const tokens=x=>new Set(fold(x).split(/[^a-z0-9]+/).filter(w=>w.length>3))
const topics={
  services:{rank:5,label:'Serviço divulgado'},
  expansion:{rank:5,label:'Possível mudança operacional'},
  hiring:{rank:5,label:'Menção a contratação'},
  partnership:{rank:4,label:'Parceria divulgada'},
  customer_experience:{rank:4,label:'Experiência do cliente'},
  promotion:{rank:2,label:'Campanha ou promoção'},
  positioning:{rank:2,label:'Posicionamento'},
  call_to_action:{rank:1,label:'Chamada para ação'},
  other:{rank:0,label:'Outro conteúdo'},
}
const special=/pr[oó]tese capilar|servi[cç]o[s]?\s+(?:de|especializad)|(?:nova|novo)\s+(?:unidade|filial|servi[cç]o)|contrata[cç][aã]o|vaga[s]?|amplia[cç][aã]o|parceria|treinamento|cursos?|agendamento|consultoria|atendimento/i
const generic=/^(aqui [eé] assim|bem vindos?|bom dia|boa tarde|siga|curta|compartilhe|marque seu amigo|salento barbearia|vem renovar)(?:\s*!?)?$/i
const historical=/\b(inaugura[cç][aã]o|inauguramos|abertura|in[ií]cio da nossa hist[oó]ria|grande dia)\b/i
const years=text=>[...text.matchAll(/\b(?:20[0-3]\d)\b/g)].map(x=>Number(x[0]))
const safeSource=post=>{
  try{
    const u=new URL(post.url)
    if(u.protocol!=='https:'||!['instagram.com','www.instagram.com'].includes(u.hostname)||
      !/^\/(?:p|reel)\/[A-Za-z0-9_-]{5,}\/?$/.test(u.pathname))return null
    return u.origin+u.pathname
  }catch{return null}
}
const readingValue={snippet:0,metadata:1,page:2}
function relevance(post,currentYear){
  const quote=clean(post.quote,250)
  const combined=quote+' '+clean(post.title,160)
  let score=topics[post.topic]?.rank??0
  if(special.test(quote))score+=2
  if(post.evidenceLevel==='page')score+=2
  else if(post.evidenceLevel==='metadata')score+=1
  if(quote.length>=65)score+=1
  if(generic.test(quote)||quote.length<22)score-=4
  const datedYears=years(combined)
  const oldHistorical=historical.test(combined)&&datedYears.length>0&&
    Math.max(...datedYears)<currentYear-1
  if(oldHistorical)score-=5
  else if(historical.test(combined))score-=2 // inaugurations alone aren't buying signals
  if(post.topic==='call_to_action'&& !special.test(quote))score-=1
  return {score,oldHistorical}
}
const overlap=(a,b)=>{
  const A=tokens(a),B=tokens(b)
  if(!A.size||!B.size)return 0
  const shared=[...A].filter(x=>B.has(x)).length
  return shared/Math.min(A.size,B.size)
}
const sanitizedPost=(p)=>{
  if(!p||typeof p!=='object'||p.reviewStatus!=='analysis_only')return null
  const url=safeSource(p)
  const quote=clean(p.quote,250)
  if(!url||quote.length<12)return null
  const status=['page','metadata','snippet'].includes(p.evidenceLevel)?p.evidenceLevel:'snippet'
  // The per-post analyzer previously checked the literal quotation against its
  // evidence. Do not accept new data that claims a verified page without backing.
  return {
    id:Number(p.id),url,title:clean(p.title,140),
    topic:topics[p.topic]?p.topic:'other',quote,evidenceLevel:status,
    observation:clean(p.observation,230),
    strategicReading:clean(p.strategicReading,260),
    commercialHypothesis:clean(p.commercialHypothesis,270),
    diagnosticQuestion:clean(p.diagnosticQuestion,210),
  }
}
// Informational context may be valuable even when no defensible buying signal
// exists. Require a specific phrase in the quoted source and avoid empty slogans.
const substantive=/\b(?:servi[cç]os?|produto[s]?|cortes?|barbas?|pr[oó]tese|agendamento|consultoria|treinamento|cursos?|aulas?|tratamentos?|atendimento|unidades?|filiais?|parceria[s]?|equipe|evento[s]?|lan[cç]amento|promo[cç][aã]o|desconto|pacotes?|novidades?|entregas?|inscri[cç][aã]o)\b/i
const slogan=/^(?:aqui [eé] assim|bem.vindos?|bom dia|boa tarde|vem renovar|siga|curta|compartilhe|marque seu amigo|chegou o grande dia)\b/i
const contextWorthShowing=p=>p.quote.length>=24&&p.topic!=='other'&&
  !p.oldHistorical&&p.score>=1&&substantive.test(p.quote)&&
  !(slogan.test(p.quote)&&!special.test(p.quote))

const keyTopic=p=>p.topic
export function createCommercialExecutiveG49({
  company,postAnalyses=[],coverage={},checkedAt=new Date().toISOString(),currentYear=new Date().getUTCFullYear(),
}={}){
  const uniqueUrls=new Set()
  const candidates=[]
  for(const raw of Array.isArray(postAnalyses)?postAnalyses.slice(0,24):[]){
    const p=sanitizedPost(raw)
    if(!p||!Number.isInteger(p.id)||uniqueUrls.has(p.url))continue
    uniqueUrls.add(p.url)
    const rank=relevance(p,currentYear)
    candidates.push({...p,...rank})
  }
  candidates.sort((a,b)=>b.score-a.score||
    readingValue[b.evidenceLevel]-readingValue[a.evidenceLevel]||
    a.url.localeCompare(b.url))
  const selected=[]
  const seenTopics=new Set()
  // Prefer topic breadth before showing multiple nearly identical posts.
  for(const candidate of candidates){
    if(candidate.score<5||candidate.oldHistorical)continue
    if(selected.some(p=>p.url===candidate.url||
      (p.topic===candidate.topic&&overlap(p.quote,candidate.quote)>=0.55)))continue
    if(seenTopics.has(keyTopic(candidate)))continue
    selected.push(candidate)
    seenTopics.add(keyTopic(candidate))
    if(selected.length>=3)break
  }
  for(const candidate of candidates){
    if(selected.length>=3)break
    if(candidate.score<6||candidate.oldHistorical||selected.some(p=>p.url===candidate.url||
      overlap(p.quote,candidate.quote)>=0.65))continue
    selected.push(candidate)
  }
  const discoveries=selected.map((p,i)=>({
    id:'finding-'+(i+1),sourceId:p.id,url:p.url,
    category:topics[p.topic]?.label||'Conteúdo comercial',
    priority:p.score>=9?'alta':p.score>=7?'média':'contexto',
    // This is priority for review, not confidence/probability of purchase.
    priorityMeaning:'Prioridade de investigação, não propensão de compra',
    fact:p.quote, // verbatim excerpt, never a rewritten "fact" that adds claims
    reading:p.evidenceLevel,
    interpretation:p.strategicReading,
    hypothesis:p.commercialHypothesis,
    diagnosticQuestion:p.diagnosticQuestion,
  }))
  // Show verifiable business context when the model analyzed posts but none
  // achieved the commercial-priority threshold. Do not invent buying signals.
  const context=[]
  for(const candidate of candidates){
    if(discoveries.length+context.length>=3)break
    if(!contextWorthShowing(candidate)||selected.some(p=>p.url===candidate.url)||
      context.some(p=>p.topic===candidate.topic||
        overlap(p.quote,candidate.quote)>=0.50))continue
    context.push(candidate)
  }
  const contextHighlights=context.map((p,i)=>({
    id:'context-'+(i+1),sourceId:p.id,url:p.url,
    category:topics[p.topic]?.label||'Informação pública',
    fact:p.quote,reading:p.evidenceLevel,
    // The user is shown exactly what is quoted, not the Qwen-inferred need.
    note:'Informação contextual da publicação, sem sinal de compra confirmado.',
  }))
  const actions=discoveries.filter(p=>p.diagnosticQuestion.length>=16).slice(0,2)
    .map(p=>({question:p.diagnosticQuestion,sourceId:p.sourceId,url:p.url,reason:p.category}))
  const indexed=Math.max(0,Number(coverage.indexed)||0)
  const analyzed=Math.max(0,Number(coverage.analyzed)||candidates.length)
  const status=discoveries.length?'findings':
    contextHighlights.length?'context_only':'insufficient_evidence'
  const executive=discoveries.length
    ?'Encontrei '+discoveries.length+' ponto(s) para investigar a partir das publicações analisadas. Não há necessidade de compra confirmada.'
    :contextHighlights.length
      ?'Há '+contextHighlights.length+' informação(ões) úteis sobre a comunicação da empresa, mas nenhuma oportunidade comercial foi confirmada nas fontes disponíveis.'
      :'Não encontrei conteúdo público específico o suficiente para destacar descobertas nesta investigação.'
  const limitations=[
    'Os resultados indexados não equivalem à leitura completa do Instagram.',
    'Prioridade indica utilidade para investigação, não interesse em comprar.',
    'Nenhuma oportunidade, necessidade ou evento foi confirmado automaticamente.',
  ]
  return {
    version:'g49',status,company:clean(company,120),checkedAt:clean(checkedAt,40),
    executive,discoveries,contextHighlights,actions,
    coverage:{indexed,analyzed,selected:discoveries.length+contextHighlights.length,
      commercial:discoveries.length,context:contextHighlights.length},
    limitations,
    // Only headlines/IDs and URLs from attributable already-analyzed results.
    sourceUrls:[...uniqueUrls].slice(0,12),
  }
}
