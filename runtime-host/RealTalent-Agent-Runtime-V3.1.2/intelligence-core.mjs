import { buildReasoningProtocol } from './advanced-reasoning.mjs'
const norm=(v='')=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const STOP=new Set('a o os as um uma uns umas de da do das dos em no na nos nas por para pra com sem e ou que como qual quais quem onde quando porque por isso esse essa estes estas isso isto eu voce tu ele ela eles elas meu minha meus minhas seu sua seus suas me te se ao aos'.split(' '))
const tokens=(v='')=>[...new Set(norm(v).replace(/[^a-z0-9_+#.\s-]/g,' ').split(/\s+/).filter(x=>x.length>2&&!STOP.has(x)))]
const overlap=(a,b)=>{const A=new Set(tokens(a)),B=new Set(tokens(b));if(!A.size||!B.size)return 0;let hit=0;for(const x of A)if(B.has(x))hit++;return hit/Math.max(1,Math.min(A.size,B.size))}
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n))

const COMPLEX=/(compare|comparar|decida|decidir|avalie|analise|audite|diagnostique|priorize|planeje|estrategia|trade-?off|causa raiz|arquitetura|roadmap|passo a passo|multiplas|v[aá]rias|inteiro|completo|profundo|detalhado)/
const CODE=/(codigo|c[oó]digo|typescript|javascript|python|tsx|jsx|css|sql|bug|erro|stack|refator|implemente|corrija|patch|build|typecheck|vitest|endpoint|gateway)/
const REASON=/(por que|porque|causa|consequencia|implica|hipotese|evidencia|decis[aã]o|melhor op[cç][aã]o|vantag|desvantag|raciocin|critique|valid|verifique)/
const MULTISTEP=/(primeiro|depois|em seguida|por fim|etapa|passos|plano|workflow|processo|fa[cç]a tudo|resolva tudo)/
const SIMPLE=/^(oi|ola|opa|bom dia|boa tarde|boa noite|obrigad[oa]|valeu|sim|nao|ok|certo|perfeito)[!.?\s]*$/

export function scoreComplexity({message='',turnPlan={},orchestration={},attachments=[]}={}){
  const text=String(message||'').trim();const low=norm(text);let score=.16;const reasons=[]
  if(SIMPLE.test(low)){score=.03;reasons.push('mensagem simples')}
  if(text.length>240){score+=.10;reasons.push('entrada longa')}
  if(text.length>900){score+=.10;reasons.push('entrada muito longa')}
  if(COMPLEX.test(low)){score+=.20;reasons.push('análise/decisão complexa');const hits=['analise','compare','avalie','priorize','decida','arquitetura','roadmap','profund','detalhad'].filter(x=>low.includes(x)).length;if(hits>1)score+=Math.min(.18,(hits-1)*.06)}
  if(REASON.test(low)){score+=.14;reasons.push('raciocínio causal/avaliativo')}
  if(MULTISTEP.test(low)){score+=.12;reasons.push('objetivo multi-etapas')}
  if(CODE.test(low)){score+=.16;reasons.push('conteúdo técnico/código')}
  if(orchestration?.toolFirst){score+=.18;reasons.push('Tool-First/evidência obrigatória')}
  if(['analysis_job','autonomous_job','engineering_job'].includes(orchestration?.kind)){score+=.18;reasons.push(orchestration.kind)}
  if(turnPlan?.intent==='follow_up'&&Number(turnPlan?.similarity||0)<.15){score+=.06;reasons.push('referência contextual ambígua')}
  if(turnPlan?.reference?.source==='unresolved'){score+=.10;reasons.push('referência não resolvida')}
  if((attachments||[]).length){score+=.08;reasons.push('anexo presente')}
  score=clamp(score)
  const tier=score<.22?'instant':score<.52?'standard':'deep'
  return {version:'2.3',score:Number(score.toFixed(2)),tier,reasons:[...new Set(reasons)],thresholds:{instant:.22,deep:.52}}
}

export function routeCognitiveModel({message='',turnPlan={},orchestration={},attachments=[],visionAvailable=false,complexity=null}={}){
  const c=complexity||scoreComplexity({message,turnPlan,orchestration,attachments});const low=norm(message);const hasImages=(attachments||[]).some(a=>String(a?.type||'').startsWith('image/')||a?.dataUrl)
  if(hasImages&&visionAvailable)return {version:'2.3',role:'vision',taskType:'vision',reason:'imagem presente e modelo visual disponível',tier:c.tier}
  if(['engineering_job'].includes(orchestration?.kind)||CODE.test(low)&&/(corrija|implemente|refatore|patch|codigo|c[oó]digo)/.test(low))return {version:'2.3',role:'coder',taskType:'code',reason:'execução/correção de código',tier:c.tier}
  if(c.tier==='deep'||['analysis_job','autonomous_job'].includes(orchestration?.kind))return {version:'2.3',role:'reasoning',taskType:'reasoning',reason:'complexidade alta exige raciocínio deliberado',tier:c.tier}
  if(c.tier==='instant')return {version:'2.3',role:'fast',taskType:'fast',reason:'fast path',tier:c.tier}
  return {version:'2.3',role:'general',taskType:'chat',reason:'conversa/planejamento padrão',tier:c.tier}
}

export function selectRelevantMessages({messages=[],query='',limit=6,topicShift=false}={}){
  if(topicShift||!Array.isArray(messages)||!messages.length||limit<=0)return []
  const queryText=String(query||'');const scored=[];const total=messages.length
  for(let i=0;i<total;i++){
    const m=messages[i];if(!m||!['user','assistant'].includes(m.role))continue
    const content=String(m.content||'').trim();if(!content)continue
    const recency=(i+1)/Math.max(1,total);const lexical=overlap(queryText,content)
    const referenceBoost=/^(isso|ele|ela|e isso|e ele|e ela|como|por que|porque|e agora|mas e)/.test(norm(queryText))?.18:0
    const roleBoost=m.role==='user'?.04:0
    const score=lexical*.62+recency*.22+referenceBoost+roleBoost
    scored.push({i,m,score})
  }
  const picked=scored.sort((a,b)=>b.score-a.score||b.i-a.i).slice(0,Math.max(1,limit)).sort((a,b)=>a.i-b.i)
  return picked.map(({m,score})=>({role:m.role,content:String(m.content||'').slice(0,2600),at:m.at,relevance:Number(score.toFixed(3))}))
}

export function reasoningPlan({message='',complexity={},turnPlan={},orchestration={}}={}){
  const tier=complexity?.tier||'standard'
  if(tier==='instant')return {version:'2.3',mode:'fast',steps:['entender','responder'],verification:'minimal'}
  const steps=['entender o pedido','resolver referências e contexto','identificar fatos versus suposições']
  if(orchestration?.toolFirst)steps.push('coletar evidências obrigatórias antes da conclusão')
  if(tier==='deep')steps.push('decompor o problema','comparar alternativas/hipóteses','verificar cobertura e consistência')
  steps.push('produzir resposta proporcional ao pedido')
  return {version:'2.3',mode:tier==='deep'?'deep':'standard',steps,verification:tier==='deep'?'required':'selective'}
}

export function buildIntelligencePlan({message='',turnPlan={},orchestration={},attachments=[],visionAvailable=false}={}){
  const complexity=scoreComplexity({message,turnPlan,orchestration,attachments})
  const model=routeCognitiveModel({message,turnPlan,orchestration,attachments,visionAvailable,complexity})
  const reasoning=reasoningPlan({message,complexity,turnPlan,orchestration})
  const verificationRequired=complexity.tier==='deep'||Boolean(orchestration?.toolFirst)||turnPlan?.guardPerspective===true||turnPlan?.reference?.source==='unresolved'
  const contextLimit=complexity.tier==='instant'?2:complexity.tier==='standard'?6:10
  const base={version:'2.7',complexity,model,reasoning,context:{strategy:'relevance+recency',messageLimit:Math.max(contextLimit,Number(turnPlan?.contextMessages||0)),topicShift:Boolean(turnPlan?.topicShift)},verification:{required:verificationRequired,maxPasses:verificationRequired?1:0,reasons:[...(complexity.tier==='deep'?['complexidade alta']:[]),...(orchestration?.toolFirst?['evidence gate']:[]),...(turnPlan?.guardPerspective?['perspective guard']:[]),...(turnPlan?.reference?.source==='unresolved'?['referência ambígua']:[])]}};base.advancedReasoning=buildReasoningProtocol({message,intelligenceCore:base,turnPlan,orchestration});return base
}

export function verifyResponse({prompt='',answer='',turnPlan={},orchestration={},attachments=[],visionAvailable=false}={}){
  const text=String(answer||'').trim();const low=norm(text);const issues=[]
  if(!text||text.length<2)issues.push({code:'empty_answer',severity:'high'})
  if(turnPlan?.guardPerspective&&/(eu nao posso amar|eu nao sinto|como ia|nao tenho sentimentos)/.test(low)&&!/\b(voce|tu|ia|inteligencia artificial)\b/.test(norm(prompt)))issues.push({code:'perspective_failure',severity:'high'})
  const hasImages=(attachments||[]).some(a=>String(a?.type||'').startsWith('image/')||a?.dataUrl)
  if(hasImages&&!visionAvailable&&/(na imagem|no print|eu vejo|vejo que|a captura mostra|o screenshot mostra)/.test(low))issues.push({code:'unsupported_visual_claim',severity:'high'})
  if(orchestration?.kind==='chat'&&/(eu (corrigi|alterei|executei|rodei|implementei)|foi corrigido|ja alterei)/.test(low))issues.push({code:'unsupported_execution_claim',severity:'high'})
  const paras=text.split(/\n\n+/).map(x=>norm(x)).filter(x=>x.length>40);if(paras.length>2&&new Set(paras).size<paras.length)issues.push({code:'repetition',severity:'medium'})
  const qTokens=tokens(prompt);const aTokens=new Set(tokens(answer));const covered=qTokens.filter(t=>aTokens.has(t)).length/Math.max(1,qTokens.length)
  if(qTokens.length>=4&&covered<.08&&!turnPlan?.cannedReply)issues.push({code:'low_question_coverage',severity:'medium'})
  if(orchestration?.toolFirst&&/(acho|talvez|provavelmente)/.test(low)&&!/(evidencia|verific|comprov|hipotese|risco)/.test(low))issues.push({code:'weak_evidence_language',severity:'medium'})
  const hard=issues.some(x=>x.severity==='high');const confidence=clamp(.94-issues.reduce((s,x)=>s+(x.severity==='high'?.32:.14),0),.05,.99)
  return {version:'2.3',pass:!hard&&issues.length<=1,confidence:Number(confidence.toFixed(2)),issues,coverage:Number(covered.toFixed(2)),action:hard?'repair':issues.length?'review':'accept'}
}

export const intelligenceCoreInfo=Object.freeze({version:'2.7',name:'Intelligence Core',features:{complexityClassifier:true,cognitiveModelRouter:true,relevanceContextEngine:true,reasoningPlanner:true,responseVerifier:true,referenceConfidence:true,fastStandardDeepPaths:true}})
