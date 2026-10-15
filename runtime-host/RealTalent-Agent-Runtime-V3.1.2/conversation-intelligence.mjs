import { refineReference31, selectPrecisionContext, naturalizeResponse } from './intelligence-quality.mjs'
const strip = (value='') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9_+#.\s-]/g,' ').replace(/\s+/g,' ').trim()

const STOP = new Set('a o os as um uma uns umas de da do das dos em no na nos nas por para pra com sem e ou que como qual quais quem onde quando porque por isso esse essa estes estas isso isto eu voce tu ele ela eles elas meu minha meus minhas seu sua seus suas me te se ao aos'.split(' '))
const tokens = (value='') => [...new Set(strip(value).split(/\s+/).filter((x)=>x.length>2&&!STOP.has(x)))]
const jaccard = (a,b) => { const A=new Set(tokens(a)),B=new Set(tokens(b)); if(!A.size||!B.size)return 0; let hit=0; for(const x of A)if(B.has(x))hit++; return hit/(A.size+B.size-hit) }
const lastUser = (messages=[]) => [...messages].reverse().find((m)=>m?.role==='user')?.content || ''
const lastAssistant = (messages=[]) => [...messages].reverse().find((m)=>m?.role==='assistant')?.content || ''

const GREETING = /^(oi|ola|opa|e ai|ei|hey|hello|bom dia|boa tarde|boa noite|tudo bem|como vai)[!.?\s]*$/
const THANKS = /^(obrigad[oa]|valeu|agradeco|muito obrigad[oa]|show|perfeito)[!.?\s]*$/
const PERSONAL = /(amor proprio|autoestima|me amar|me amo|me odi|me sinto|estou triste|estou feliz|estou ansios|minha vida|meu relacionamento|cuidar de mim|gostar de mim|como posso me (amar|cuidar|valorizar|aceitar|conhecer)|nao gosto de mim)/
const PROJECT_TERMS = /(crm|blue ocean|service studio|whatsapp|garimpo|pipeline|contat|lead|oportunidade|proposta|blueprint|jornada|persona|whiteboard|supabase|tsx|typescript|css|componente|arquivo|codigo|c[oó]digo|endpoint|gateway|migration|hook|store|builder|browser qa)/
const PROJECT_LOCATOR = /(onde (esta|fica)|em qual arquivo|qual arquivo|qual componente|implementad|referenciad|depende|dependencia|o que pode quebrar|impacto|causa raiz|root cause|erro|bug|stack|log|console|network)/
const EXECUTE = /(fa[cç]a|execute|rode|implemente|corrija|arrume|altere|adicione|crie|melhore|aplique|conserte|refatore|prepare|remova|troque|mude|investigue e corrija)/
const ANALYSIS_JOB = /(analise|audite|avalie|revise|diagnostique|priorize).*(crm|blue ocean|service studio|whatsapp|garimpo|pipeline|produto|plataforma|comercializa|produ[cç][aã]o)|(crm|blue ocean).*(pronto para|pode ser vendido|comercializa)/
const DEFINITION = /^(o que e|o que significa|defina|explique o que e|qual a definicao de)\s+(um\s+|uma\s+)?/
const FOLLOWUP_LEAD = /^(e\s+)?(qual|quais|como|por que|porque|e se|e isso|e ele|e ela|isso|ele|ela|tambem|e agora|e quanto|mas e|entao)[\s?]/
const ATTACHMENT_REFERENCE = /^(analise|analisa|analisar|veja|olha|olhe|avalie|revise|diagnostique|o que esta errado|o que tem de errado|melhore isso|corrija isso|arrume isso|veja isso|olha isso|analise isso)[!.?\s]*$/
const APP_REFERENCE_ACTION = /^(melhore|corrija|arrume|ajuste|refatore|analise|avalie|revise|veja|olha|investigue)\s+(isso|aqui|essa tela|esta tela|esse botao|este botao|essa parte|esta parte)[!.?\s]*$/

const explicitSelfReference = (value='') => /(\beu\b|\bme\b|\bmeu\b|\bminha\b|\bmim\b|\bcomigo\b)/.test(strip(value))
const asksAboutAgent = (value='') => /(\bvoce\b|\btu\b|\bsua ia\b|\brealtalent agent\b|\bcomo ia\b)/.test(strip(value))
const isFreshDefinition = (value='') => DEFINITION.test(strip(value)) && !FOLLOWUP_LEAD.test(strip(value))
const attachmentCountOf = (attachments=[]) => Array.isArray(attachments) ? attachments.filter(Boolean).length : 0
const normalizeAppProduct = (appContext) => ['crm','blue_ocean'].includes(appContext?.product) ? appContext.product : null

const resolveUserRequest = (raw, intent, {attachments=[],appContext=null}={}) => {
  const low=strip(raw)
  if(intent==='attachment_analysis'){
    const names=(attachments||[]).map(a=>a?.name).filter(Boolean).slice(0,4)
    return `Analise o anexo atual como a referência principal da mensagem. ${names.length?`Anexos: ${names.join(', ')}.`:''} Não trate a mensagem curta como saudação ou smalltalk.`
  }
  if(intent==='app_context_reference'){
    const route=appContext?.route||'rota atual'
    const selected=appContext?.selectedEntity?.label||appContext?.selectedEntity?.id||''
    return `A referência “isso/aqui/essa tela” aponta primeiro para o contexto atual do aplicativo: ${appContext?.product||'app'} · ${route}${selected?` · selecionado ${selected}`:''}. Use esse contexto; não adivinhe pelo histórico.`
  }
  if(intent==='personal_emotional'){
    if(/como posso me amar|amor proprio/.test(low)) return `A pessoa usuária pergunta sobre ela mesma: como pode desenvolver amor próprio, autocuidado e uma relação mais gentil consigo. Responda diretamente usando “você”; não fale sobre a capacidade da IA de amar.`
    return `A pessoa usuária está falando sobre si mesma. Responda diretamente à pessoa usuária e interprete primeira pessoa (eu/me/meu/minha/mim) como referência à pessoa, nunca à RealTalent Agent. Pergunta original: ${raw}`
  }
  if(isFreshDefinition(raw)){
    const subject=low.replace(DEFINITION,'').trim()
    return `Defina de forma humana e conceitual: ${subject||raw}. A pergunta é sobre o conceito, não sobre capacidades ou limitações da RealTalent Agent.`
  }
  if(explicitSelfReference(raw)&&!asksAboutAgent(raw)) return `Responda à pessoa usuária sobre ela mesma. Pergunta original: ${raw}`
  return raw
}

const inferProduct = (message, requested='auto', appContext=null) => {
  if (['crm','blue_ocean','both'].includes(requested)) return requested
  const low=strip(message)
  const hasCrm=/(\bcrm\b|whatsapp|garimpo|pipeline|contat|lead|oportunidade|proposta|supabase)/.test(low)
  const hasBlue=/(blue ocean|service studio|blueprint|jornada|persona|whiteboard|service graph)/.test(low)
  if(hasCrm&&hasBlue)return'both'; if(hasBlue)return'blue_ocean'; if(hasCrm)return'crm'
  return normalizeAppProduct(appContext)
}

function resolveConversationReferenceBase({message='',attachments=[],appContext=null,messages=[]}={}){
  const low=strip(message), attachmentCount=attachmentCountOf(attachments); const candidates=[]
  if(attachmentCount>0) candidates.push({source:'attachment',confidence:.99,attachmentCount,label:(attachments||[])[0]?.name||'anexo atual'})
  if(appContext) candidates.push({source:'app_context',confidence:.96,product:appContext.product||null,route:appContext.route||null,selectedEntity:appContext.selectedEntity||appContext.selected||null})
  const visualMessage=[...(messages||[])].reverse().find((m)=>m?.metadata?.visualEvidence?.version==='2.5')
  if(visualMessage) candidates.push({source:'visual_context',confidence:.91,label:visualMessage.metadata.visualEvidence.summary||'evidência visual anterior',imageCount:Number(visualMessage.metadata.visualEvidence.imageCount||1)})
  const previous=lastUser(messages); if(previous) candidates.push({source:'conversation',confidence:FOLLOWUP_LEAD.test(low)?.76:.58,label:String(previous).slice(0,180)})
  if(attachmentCount>0 && (ATTACHMENT_REFERENCE.test(low)||low.length<=32)) return {...candidates.find(x=>x.source==='attachment'),candidates}
  if(appContext && APP_REFERENCE_ACTION.test(low)) return {...candidates.find(x=>x.source==='app_context'),candidates}
  const visualRef=/\b(esse|essa|este|esta|botao|botão|parte|imagem|print|tela|canto|lado|ali|aqui)\b/.test(low)
  if(visualRef&&candidates.some(x=>x.source==='visual_context')&&!attachmentCount) return {...candidates.find(x=>x.source==='visual_context'),candidates}
  if(FOLLOWUP_LEAD.test(low)&&previous) return {...candidates.find(x=>x.source==='conversation'),candidates}
  const vague=/^(isso|isto|aqui|ali|ele|ela|esse|essa|esta parte|essa parte|esse botao|essa tela)[!.?\s]*$/.test(low)
  if(vague){const best=candidates.sort((a,b)=>b.confidence-a.confidence)[0];if(best&&best.confidence>=.72)return {...best,candidates};return {source:'unresolved',confidence:best?.confidence||.25,candidates,reason:'referência vaga sem evidência suficiente'}}
  return {source:'explicit_message',confidence:1,candidates:[]}
}

export function resolveConversationReference(args={}){
  const base=resolveConversationReferenceBase(args)
  return refineReference31({...args,baseReference:base})
}

export function classifyConversationTurn({ message, messages = [], product = 'auto', mode = 'auto', attachments = [], appContext = null } = {}) {
  const raw=String(message||'').trim(), low=strip(raw)
  if(!raw)throw new Error('Mensagem vazia.')
  const prevUser=lastUser(messages), prevAssistant=lastAssistant(messages)
  const similarity=Math.max(jaccard(raw,prevUser),jaccard(raw,prevAssistant))
  const previousProject=PROJECT_TERMS.test(strip(`${prevUser} ${prevAssistant}`))
  const attachmentCount=attachmentCountOf(attachments)
  const reference=resolveConversationReference({message:raw,attachments,appContext,messages})
  const requestedProduct=inferProduct(raw,product,appContext)
  let intent='smalltalk', confidence=.7, reason='conversa geral'
  if(ANALYSIS_JOB.test(low)){intent='analysis_job';confidence=.98;reason='pedido explícito de análise do produto real'}
  else if(attachmentCount>0 && reference.source==='attachment'){intent='attachment_analysis';confidence=.99;reason='mensagem curta referencia anexo atual'}
  else if(appContext && reference.source==='app_context' && EXECUTE.test(low)){intent='app_context_reference';confidence=.97;reason='pedido referencia a tela/entidade atual do aplicativo'}
  else if(reference.source==='visual_context'){intent='visual_follow_up';confidence=.94;reason='pedido referencia evidência visual estruturada de turno anterior'}
  else if(GREETING.test(low)){intent='greeting';confidence=.99;reason='saudação isolada'}
  else if(THANKS.test(low)){intent='thanks';confidence=.98;reason='agradecimento isolado'}
  else if(PERSONAL.test(low)){intent='personal_emotional';confidence=.96;reason='pergunta pessoal/emocional'}
  else if(mode==='work'||(EXECUTE.test(low)&&(PROJECT_TERMS.test(low)||normalizeAppProduct(appContext)))){intent='execute_task';confidence=.96;reason='pedido explícito de execução no projeto'}
  else if(PROJECT_TERMS.test(low)&&PROJECT_LOCATOR.test(low)){intent='project_question';confidence=.94;reason='pergunta técnica sobre implementação/projeto'}
  else if(DEFINITION.test(low)){intent='general_question';confidence=.91;reason='pergunta conceitual/definição'}
  else if(messages.length&&FOLLOWUP_LEAD.test(low)&&(similarity>=.08||previousProject)){intent='follow_up';confidence=.88;reason='continuação curta do tópico anterior'}
  else if(/[?]$/.test(raw)||/^(como|o que|qual|quais|por que|porque|quem|onde|quando|me explique|explique|me diga)\b/.test(low)){intent=PROJECT_TERMS.test(low)?'project_question':'general_question';confidence=.83;reason=PROJECT_TERMS.test(low)?'pergunta relacionada ao produto':'pergunta geral'}
  else if(PROJECT_TERMS.test(low)){intent='project_question';confidence=.78;reason='menção técnica ao produto'}

  const explicitFollowup=FOLLOWUP_LEAD.test(low)
  const freshDefinition=isFreshDefinition(raw)
  const topicShift = ['greeting','thanks','personal_emotional','attachment_analysis','app_context_reference'].includes(intent) || (messages.length>0 && (freshDefinition || (similarity<.06&&!explicitFollowup&&intent!=='execute_task'&&!(intent==='project_question'&&previousProject))))
  let contextMessages=0
  if(intent==='follow_up')contextMessages=8
  else if(intent==='execute_task')contextMessages=8
  else if(intent==='analysis_job')contextMessages=6
  else if(intent==='project_question')contextMessages=6
  else if(intent==='attachment_analysis')contextMessages=2
  else if(intent==='visual_follow_up')contextMessages=4
  else if(intent==='app_context_reference')contextMessages=2
  else if(intent==='smalltalk'&&similarity>=.24)contextMessages=2
  if(intent==='general_question')contextMessages=0
  if(topicShift && !['attachment_analysis','app_context_reference'].includes(intent))contextMessages=0

  const includeProjectAwareness = ['project_question','analysis_job','execute_task','app_context_reference'].includes(intent) || (intent==='follow_up'&&previousProject)
  const selfReference = PERSONAL.test(low) || explicitSelfReference(low)
  const perspectiveNote = selfReference
    ? 'Pronomes de primeira pessoa (eu, me, meu/minha, mim) se referem ao usuário. Nunca interprete “me” como se fosse a própria RealTalent Agent.'
    : 'Mantenha a perspectiva normal: “você/tu” tende a se referir à RealTalent Agent e primeira pessoa ao usuário.'
  const maxAnswerChars = intent==='greeting'||intent==='thanks' ? 260 : intent==='personal_emotional' ? 1800 : intent==='general_question' ? 2600 : intent==='analysis_job' ? 7000 : intent==='project_question' ? 4200 : intent==='attachment_analysis'||intent==='visual_follow_up' ? 5000 : 3200
  const cannedReply = intent==='greeting' ? 'Oi! Como posso ajudar?' : intent==='thanks' ? 'Por nada. O que você quer fazer agora?' : null
  return {
    version:'2.3', intent, confidence, reason, topicShift, similarity:Number(similarity.toFixed(3)), contextMessages,
    includeConversationMemory:contextMessages>0, includeProjectAwareness, requestedProduct:requestedProduct||null,
    previousProjectContext:previousProject, perspectiveNote, maxAnswerChars, cannedReply,
    resolvedUserRequest:resolveUserRequest(raw,intent,{attachments,appContext}), freshDefinition, guardPerspective:Boolean(selfReference||freshDefinition||intent==='personal_emotional'),
    reference, attachmentCount, appContextUsed:Boolean(appContext&&reference.source==='app_context'),
    mode:mode==='work'?'work':mode==='ask'?'ask':'auto'
  }
}

export function contextWindowForTurn({ conversation, turnPlan, attachments = [], appContext = null } = {}) {
  const all=Array.isArray(conversation?.messages)?conversation.messages:[]
  const history=all.length&&all.at(-1)?.role==='user' ? all.slice(0,-1) : all
  const keep=Math.max(0,Math.min(12,Number(turnPlan?.intelligenceCore?.context?.messageLimit||turnPlan?.contextMessages||0)))
  const query=all.length&&all.at(-1)?.role==='user'?String(all.at(-1)?.content||''):String(turnPlan?.resolvedUserRequest||'')
  const recent=keep?selectPrecisionContext({messages:history,query,limit:keep,topicShift:Boolean(turnPlan?.topicShift)}):[]
  const attachmentText=(attachments||[]).filter((a)=>a?.text).map((a)=>({name:a.name,type:a.type,text:String(a.text).slice(0,12000)}))
  const visualContext=turnPlan?.reference?.source==='visual_context' ? [...history].reverse().find((m)=>m?.metadata?.visualEvidence?.version==='2.5')?.metadata?.visualEvidence||null : null
  return {
    conversation_memory:turnPlan?.includeConversationMemory ? (conversation?.memory||null) : null,
    recent_messages:recent,
    requested_scope:conversation?.productScope||'auto', attachments:attachmentText,
    app_context: appContext || null,
    visual_context: visualContext,
    resolved_reference: turnPlan?.reference || null,
    conversation_intelligence:turnPlan||null
  }
}

const paragraphKey = (value='') => strip(value).replace(/[`*_#>\-]/g,' ').replace(/\s+/g,' ').trim()
const dedupProseSentences = (block='') => {
  // Preserve Markdown structure; only deduplicate plain prose lines.
  if(/(^|\n)\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```)/.test(block)) return block
  const parts=String(block).split(/(?<=[.!?])\s+/).map((x)=>x.trim()).filter(Boolean)
  if(parts.length<2)return block
  const seen=new Set(); const out=[]
  for(const part of parts){const key=paragraphKey(part);if(!key||seen.has(key))continue;seen.add(key);out.push(part)}
  return out.join(' ')
}
export function polishResponseText(text, turnPlan={}) {
  let value=String(text||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim()
  if(!value)return value
  const blocks=value.split(/\n\n+/).map((x)=>dedupProseSentences(x.trim())).filter(Boolean)
  const seen=[]; const out=[]
  for(const block of blocks){
    const key=paragraphKey(block); if(!key)continue
    const duplicate=seen.some((prev)=>prev===key||(key.length>90&&prev.length>90&&(prev.includes(key)||key.includes(prev))))
    if(duplicate)continue
    seen.push(key);out.push(block)
  }
  value=out.join('\n\n')
  const limit=Math.max(180,Number(turnPlan?.maxAnswerChars||3200))
  if(value.length>limit){const cut=value.slice(0,limit);const boundary=Math.max(cut.lastIndexOf('\n\n'),cut.lastIndexOf('. '),cut.lastIndexOf('? '),cut.lastIndexOf('! '));value=(boundary>Math.floor(limit*.6)?cut.slice(0,boundary+1):cut.trimEnd()+'…').trim()}
  value=naturalizeResponse(value,turnPlan?.quality?.style||{})
  return value
}

export function conversationIntelligenceSummary() {
  return {version:'2.3',enabled:true,intents:['greeting','thanks','general_question','personal_emotional','follow_up','project_question','analysis_job','execute_task','attachment_analysis','visual_follow_up','app_context_reference','smalltalk'],features:{intentRouter:true,intentRouter4:true,attachmentAwareRouting:true,referenceResolver:true,appContextBridge:true,contextRelevanceGate:true,topicShiftDetection:true,perspectiveGuard:true,projectAwarenessGate:true,responseQualityLayer:true,answerLengthControl:true,antiRepetition:true,relevanceContextEngine:true,referenceConfidence:true,contextPrecision2:true,referenceResolution2:true,naturalConversation:true}}
}
