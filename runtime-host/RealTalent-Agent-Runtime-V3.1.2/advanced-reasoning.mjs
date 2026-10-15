const norm=(v='')=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n))

const TASKS=[
  ['diagnose',/(diagnost|causa raiz|por que.*(falh|erro|bug)|investig)/],
  ['compare',/(compare|comparar|trade-?off|vantag|desvantag|alternativas?)/],
  ['decide',/(decida|decidir|qual.*melhor|recomend|prioriz)/],
  ['plan',/(planeje|plano|roadmap|estrateg|passo a passo|como fazer)/],
  ['audit',/(audite|auditoria|avalie.*inteir|analise.*inteir|prontid|readiness)/],
  ['synthesize',/(resuma|sintetiz|consolide|junte)/],
]

export function classifyReasoningTask(message=''){
  const low=norm(message)
  for(const [kind,re] of TASKS)if(re.test(low))return kind
  return 'analyze'
}

const successCriteriaFor=(task,orchestration={})=>{
  const common=['responder ao pedido atual','separar fatos de suposições','declarar incerteza relevante']
  if(orchestration?.toolFirst)common.push('basear conclusões em evidências recuperadas')
  if(task==='compare')common.push('usar critérios consistentes entre alternativas','explicitar trade-offs materiais')
  if(task==='diagnose')common.push('distinguir sintoma, hipótese e causa confirmada','indicar como cada hipótese seria testada')
  if(task==='decide')common.push('explicitar critérios de decisão','apresentar recomendação compatível com as evidências')
  if(task==='plan')common.push('ordenar dependências e checkpoints','definir condição observável de conclusão')
  if(task==='audit')common.push('cobrir o escopo solicitado sem transformar ausência de evidência em PASS')
  return [...new Set(common)].slice(0,8)
}

export function buildReasoningProtocol({message='',intelligenceCore={},turnPlan={},orchestration={}}={}){
  const tier=intelligenceCore?.complexity?.tier||'standard'
  const task=classifyReasoningTask(message)
  const explicit=/(hipotes|alternativas?|compare|diagnost|causa raiz|decida|priorize|planeje|audite|profund|detalhad)/.test(norm(message))
  const enabled=tier==='deep'||Boolean(orchestration?.toolFirst)||explicit
  const maxHypotheses=task==='diagnose'?4:['compare','decide'].includes(task)?3:2
  const phases=enabled?[
    {id:'frame',goal:'definir objetivo, restrições e critérios de sucesso'},
    {id:'evidence',goal:'identificar e recuperar evidências necessárias'},
    {id:'candidates',goal:task==='diagnose'?'manter hipóteses concorrentes':'considerar alternativas relevantes'},
    {id:'test',goal:'testar cobertura, contradições e lacunas'},
    {id:'decision',goal:'produzir conclusão proporcional às evidências'},
    {id:'verify',goal:'criticar e finalizar a resposta'},
  ]:[]
  return {
    version:'2.7',enabled,task,mode:enabled?'planner-executor-critic-finalizer':'direct',
    objective:String(message||'').trim().slice(0,1200),
    maxHypotheses,
    phases,
    successCriteria:successCriteriaFor(task,orchestration),
    evidencePolicy:{currentEvidenceFirst:true,unknownIsNotPass:true,toolFirst:Boolean(orchestration?.toolFirst),contradictionCheck:true},
    adaptive:{maxReplans:enabled?1:0,replanOn:['material_coverage_gap','contradiction','unsupported_conclusion'],stopOn:['success_criteria_met','missing_required_evidence']},
    privacy:{storesChainOfThought:false,exposesChainOfThought:false,artifacts:['objective','criteria','hypothesis_labels','evidence_needs','step_goals','checkpoint_results']},
    turn:{intent:turnPlan?.intent||null,reference:turnPlan?.reference?.source||null}
  }
}

export const reasoningPlannerSchema={
  type:'object',additionalProperties:false,
  properties:{
    task_frame:{type:'string'},
    assumptions:{type:'array',maxItems:5,items:{type:'string'}},
    unknowns:{type:'array',maxItems:5,items:{type:'string'}},
    hypotheses:{type:'array',maxItems:4,items:{type:'object',additionalProperties:false,properties:{id:{type:'string'},label:{type:'string'},evidence_needed:{type:'array',maxItems:4,items:{type:'string'}}},required:['id','label','evidence_needed']}},
    steps:{type:'array',minItems:2,maxItems:7,items:{type:'object',additionalProperties:false,properties:{id:{type:'string'},goal:{type:'string'},kind:{type:'string',enum:['frame','evidence','analysis','comparison','calculation','synthesis','verification']},depends_on:{type:'array',maxItems:4,items:{type:'string'}},completion_signal:{type:'string'}},required:['id','goal','kind','depends_on','completion_signal']}},
    success_criteria:{type:'array',minItems:1,maxItems:8,items:{type:'string'}},
    uncertainty_level:{type:'string',enum:['low','medium','high']}
  },
  required:['task_frame','assumptions','unknowns','hypotheses','steps','success_criteria','uncertainty_level']
}

const cleanStrings=(xs,max=8)=>Array.isArray(xs)?xs.map(x=>String(x||'').trim()).filter(Boolean).slice(0,max):[]
export function normalizeReasoningPlan(plan={},protocol={}){
  const stepIds=new Set();const steps=[]
  for(const raw of Array.isArray(plan?.steps)?plan.steps:[]){
    const id=String(raw?.id||`s${steps.length+1}`).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,24)||`s${steps.length+1}`
    if(stepIds.has(id))continue;stepIds.add(id)
    steps.push({id,goal:String(raw?.goal||'').slice(0,300),kind:['frame','evidence','analysis','comparison','calculation','synthesis','verification'].includes(raw?.kind)?raw.kind:'analysis',depends_on:cleanStrings(raw?.depends_on,4).filter(x=>stepIds.has(x)),completion_signal:String(raw?.completion_signal||'etapa concluída').slice(0,240)})
  }
  if(steps.length<2){steps.push({id:'frame',goal:'Confirmar objetivo e critérios',kind:'frame',depends_on:[],completion_signal:'objetivo delimitado'});steps.push({id:'verify',goal:'Verificar cobertura e consistência',kind:'verification',depends_on:['frame'],completion_signal:'critérios avaliados'})}
  const hypotheses=(Array.isArray(plan?.hypotheses)?plan.hypotheses:[]).slice(0,protocol?.maxHypotheses||3).map((h,i)=>({id:String(h?.id||`h${i+1}`).slice(0,20),label:String(h?.label||'Hipótese').slice(0,220),evidence_needed:cleanStrings(h?.evidence_needed,4)}))
  return {version:'2.7',task_frame:String(plan?.task_frame||protocol?.objective||'').slice(0,800),assumptions:cleanStrings(plan?.assumptions,5),unknowns:cleanStrings(plan?.unknowns,5),hypotheses,steps:steps.slice(0,7),success_criteria:cleanStrings(plan?.success_criteria,8).length?cleanStrings(plan?.success_criteria,8):cleanStrings(protocol?.successCriteria,8),uncertainty_level:['low','medium','high'].includes(plan?.uncertainty_level)?plan.uncertainty_level:'medium'}
}

export function reasoningFinalizer({protocol={},verification={},attempt=0}={}){
  if(!protocol?.enabled)return {version:'2.7',action:'accept',reason:'advanced reasoning disabled',replan:false}
  const det=verification?.deterministic||verification
  const issueCodes=[...(det?.issues||[]).map(x=>x?.code),...(verification?.issues||[]).map(x=>norm(x))].filter(Boolean)
  const material=issueCodes.some(x=>['low_question_coverage','weak_evidence_language','unsupported_execution_claim'].includes(x)||String(x).includes('contrad')||String(x).includes('coverage')||String(x).includes('evid'))
  const hard=det?.pass===false||verification?.verdict==='repair'
  if(attempt<(protocol?.adaptive?.maxReplans||0)&&hard&&material)return {version:'2.7',action:'replan',reason:'critic found material gap',replan:true,issues:issueCodes.slice(0,6)}
  if(verification?.repaired)return {version:'2.7',action:'repair',reason:'critic repaired candidate',replan:false,issues:issueCodes.slice(0,6)}
  return {version:'2.7',action:'accept',reason:'success criteria sufficiently covered',replan:false,issues:issueCodes.slice(0,6)}
}

export const advancedReasoningInfo=Object.freeze({version:'2.7',name:'Advanced Reasoning & Planning',features:{plannerExecutorCriticFinalizer:true,multipleHypotheses:true,evidenceCheckpoints:true,adaptiveReplan:true,successCriteria:true,contradictionCheck:true,chainOfThoughtStored:false,chainOfThoughtExposed:false,maxReplans:1}})
