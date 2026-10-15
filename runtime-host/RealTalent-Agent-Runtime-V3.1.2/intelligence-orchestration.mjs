const norm=(v='')=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const has=(v,re)=>re.test(norm(v))

const ANALYSIS=/(analise|audite|avalie|revise|diagnostique|mapeie|priorize|o que falta|pronto para|pode ser vendido|comercializa|comercializacao|readiness|estado do crm|estado do blue)/
const WHOLE_PRODUCT=/(crm inteiro|crm todo|todo o crm|blue ocean inteiro|blue ocean todo|plataforma inteira|produto inteiro|sistema inteiro)/
const COMMERCIAL=/(comercializa|comercializacao|vender|vendido|venda|production ready|production readiness|pronto para producao|pronto para vender)/
const PROJECT=/(crm|blue ocean|service studio|whatsapp|garimpo|pipeline|contat|lead|oportunidade|proposta|blueprint|jornada|persona|whiteboard|supabase|tsx|typescript|componente|arquivo|codigo|endpoint|gateway|migration|hook|store)/
const ENGINEER=/(corrija|conserte|arrume|implemente|altere|refatore|aplique|prepare uma correcao|prepare a correcao|fixe|resolva).*(crm|blue ocean|whatsapp|garimpo|pipeline|codigo|erro|bug|tsx|typescript|css|componente)/
const AUTONOMOUS=/(deixe .*pronto|resolva tudo|prepare .* para comercializacao|corrija .* e (teste|valide)|investigue .* e (corrija|conserte)|descubra .* e (corrija|resolva))/

export function classifyOrchestration({message='',product='auto',conversationPlan={}}={}){
  const raw=String(message||'').trim();const low=norm(raw)
  const requested=conversationPlan?.requestedProduct||product||'auto'
  let kind='chat',protocol='answer',toolFirst=false,modelRole='general',evidenceRequired=[]
  let reason='resposta conversacional'
  const autonomousCombo=(/(investigue|descubra|analise)/.test(low)&&/(corrija|conserte|resolva|arrume)/.test(low)&&/(teste|valide|verifique|qa)/.test(low))
  if(AUTONOMOUS.test(low)||autonomousCombo) {kind='autonomous_job';protocol='engineering';toolFirst=true;modelRole='reasoning';reason='pedido de investigação + correção/verificação';evidenceRequired=['project_brain','root_cause','impact','baseline_qa','builder_gates','final_qa']}
  else if(ENGINEER.test(low)) {kind='engineering_job';protocol='engineering';toolFirst=true;modelRole='coder';reason='pedido explícito de alteração técnica';evidenceRequired=['project_brain','impact','builder_gates']}
  else if(conversationPlan?.intent==='app_context_reference') {kind='app_context_job';protocol='app_context';toolFirst=true;modelRole='general';reason='referência à tela/contexto ativo exige App Context Bridge';evidenceRequired=['app_context']}
  else if(conversationPlan?.intent==='attachment_analysis') {kind='attachment_analysis';protocol='attachment_analysis';toolFirst=false;modelRole='vision';reason='anexo atual define a referência primária';evidenceRequired=[]}
  else if(ANALYSIS.test(low)&&(PROJECT.test(low)||WHOLE_PRODUCT.test(low)||requested!=='auto')) {kind='analysis_job';protocol=COMMERCIAL.test(low)?'commercial_readiness':'product_analysis';toolFirst=true;modelRole='reasoning';reason='pedido exige analisar o produto real antes de responder';evidenceRequired=['project_brain','production_readiness','health_map']}
  else if(conversationPlan?.intent==='project_question') {kind='project_query';protocol='project_query';toolFirst=true;modelRole='general';reason='pergunta técnica sobre produto/projeto';evidenceRequired=['project_brain']}
  if(kind==='analysis_job'&&COMMERCIAL.test(low)) evidenceRequired.push('commercial_readiness')
  const productScope=requested==='both'?'both':requested==='blue_ocean'?'blue_ocean':requested==='crm'?'crm':(/blue ocean|service studio|blueprint|jornada|persona|whiteboard/.test(low)?'blue_ocean':(/crm|whatsapp|garimpo|pipeline|contat|lead|oportunidade|proposta|supabase/.test(low)?'crm':'auto'))
  return {version:'2.3',kind,protocol,toolFirst,modelRole,product:productScope,reason,evidenceRequired:[...new Set(evidenceRequired)],maxWords:kind==='chat'?220:kind==='project_query'?420:kind==='analysis_job'?700:500}
}

export function deterministicPlan(orchestration={}){
  const common=['Interpretar objetivo e escopo']
  if(orchestration.protocol==='commercial_readiness') return {version:'2.3',kind:'commercial_readiness',steps:[...common,'Sincronizar Project Brain','Ler Production Readiness e gates atestados','Ler Health Map estrutural','Coletar achados e evidências atuais','Priorizar bloqueadores por severidade/evidência','Produzir resumo executivo com limites explícitos'],successCriteria:['nenhuma afirmação de produto sem evidência','bloqueadores separados de atenção estrutural','gates não atestados marcados como bloqueados']}
  if(orchestration.protocol==='product_analysis') return {version:'2.3',kind:'product_analysis',steps:[...common,'Sincronizar Project Brain','Mapear módulos/rotas/dados relevantes','Ler Health Map estrutural','Cruzar Production Readiness e achados recentes','Priorizar problemas comprovados e riscos estruturais','Produzir resposta com evidências'],successCriteria:['contexto do produto real utilizado','distinção entre comprovado e hipótese','evidências rastreáveis']}
  if(orchestration.protocol==='project_query') return {version:'2.3',kind:'project_query',steps:[...common,'Consultar Project Brain','Selecionar arquivos/símbolos/dependências relevantes','Responder somente com contexto recuperado'],successCriteria:['caminhos reais ou ausência declarada','sem inventar arquivos']}
  if(orchestration.protocol==='engineering') return {version:'2.3',kind:'engineering',steps:[...common,'Consultar Project Brain','Investigar causa/impacto','Capturar baseline quando aplicável','Pedir aprovação antes de escrita','Executar Builder em sandbox','Rodar gates e QA final'],successCriteria:['investigação antes de escrita','checkpoint humano','evidência antes/depois']}
  if(orchestration.protocol==='app_context') return {version:'2.3',kind:'app_context',steps:[...common,'Recuperar App Context Bridge atual','Resolver a referência pela tela/entidade selecionada','Usar ferramentas nativas somente sobre dados presentes','Responder sem inferir estado ausente'],successCriteria:['app context fresco','referência resolvida por evidência','nenhuma ação de escrita sem confirmação']}
  if(orchestration.protocol==='attachment_analysis') return {version:'2.3',kind:'attachment_analysis',steps:[...common,'Usar o anexo atual como referência primária','Analisar conteúdo suportado pelo modelo disponível'],successCriteria:['anexo não tratado como smalltalk','sem alegar visão quando modelo de visão estiver indisponível']}
  return {version:'2.3',kind:'chat',steps:common,successCriteria:['resposta direta e proporcional']}
}

export function evidenceGate({orchestration={},evidence=[]}={}){
  // An evidence item explicitly marked verified:false does not satisfy the gate.
  const usable=(evidence||[]).filter(x=>x?.id&&x?.verified!==false)
  const ids=new Set(usable.map(x=>x.id))
  const missing=(orchestration.evidenceRequired||[]).filter(id=>!ids.has(id))
  return {version:'2.3',pass:!orchestration.toolFirst||missing.length===0,missing,available:[...ids],policy:orchestration.toolFirst?'tool-first-required':'not-required'}
}

export function editMarkdownResponse(text,{maxWords=500}={}){
  let value=String(text||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim()
  if(!value)return value
  const blocks=value.split(/\n\n+/).map(x=>x.trim()).filter(Boolean);const seen=new Set();const out=[]
  for(const block of blocks){const key=norm(block).replace(/[`*_#>-]/g,'').slice(0,260);if(key&&seen.has(key))continue;if(key)seen.add(key);out.push(block)}
  value=out.join('\n\n')
  const words=value.split(/\s+/);if(words.length>maxWords)value=words.slice(0,maxWords).join(' ').replace(/[,:;]$/,'')+'…'
  return value
}

export const orchestrationInfo=Object.freeze({version:'2.3',name:'Intelligence Orchestration',features:{toolFirstPolicy:true,serverEnforcedToolFirst:true,appContextBridge:true,attachmentIntent:true,evidenceGate:true,deterministicPlanner:true,contextRetrieval2:true,responseEditor:true,commercialReadinessProtocol:true,executionProgress:true,roleRouter:true}})

export function contextRetrieval2({orchestration={},conversationContext=null,projectContext=null,evidence=[]}={}){
  const out={version:'2.3',strategy:'intent-and-evidence-bounded',conversation:null,project:null,evidence:[]}
  if(['chat'].includes(orchestration.kind)) out.conversation=conversationContext
  else if(orchestration.kind==='project_query'){out.project=projectContext;out.evidence=(evidence||[]).filter(x=>x?.id==='project_brain')}
  else if(orchestration.toolFirst){out.project=projectContext;out.evidence=(evidence||[]).slice(0,12)}
  return out
}
