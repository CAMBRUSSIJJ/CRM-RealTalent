import {buildExecutionPlan,confirmExecutionPlan,executionPreview,markExecutionStarted,recordExecutionResult,verifyExecutionPlan,rollbackPreview,cancelExecutionPlan,executionIntelligenceInfo} from './execution-intelligence.mjs'
let ok=0,total=0;const t=(n,p)=>{total++;console.log(`${p?'OK  ':'FAIL'} ${n}`);if(p)ok++}
const plan=buildExecutionPlan({objective:'Atualize Ana e depois envie mensagem',product:'crm',actions:[
  {tool:'crm.contacts.get',capability:'read',args:{id:'c1'}},
  {tool:'crm.contacts.update',capability:'write',args:{id:'c1',name:'Ana Maria'},postconditions:['nome atualizado']},
  {tool:'crm.communications.sendMessage',capability:'write',args:{threadId:'t1',text:'Olá'},postconditions:['mensagem registrada']}
]})
t('manifest V2.8',executionIntelligenceInfo.version==='2.8'&&executionIntelligenceInfo.features.maxSilentWriteActions===0)
t('plano classifica risco e side effects',plan.version==='2.8'&&plan.risk.level==='high'&&plan.risk.writeSteps===2&&plan.blastRadius.externalSideEffects===true)
t('leitura automática e escrita bloqueada',plan.steps[0].autoExecutable===true&&plan.steps[1].requiresConfirmation===true&&plan.steps[2].requiresConfirmation===true)
const preview=executionPreview(plan);t('preview separa automático de confirmação',preview.automatic.length===1&&preview.requiresConfirmation.length===2&&preview.warnings.length===1)
confirmExecutionPlan(plan,{stepIds:[plan.steps[1].id],actor:{id:'u1',role:'admin'}});t('confirmação pode ser por etapa',plan.status==='awaiting_confirmation'&&plan.steps[1].confirmation?.confirmed===true&&!plan.steps[2].confirmation)
confirmExecutionPlan(plan,{stepIds:'all',actor:{id:'u1',role:'admin'}});t('confirmação total aprova plano',plan.status==='approved'&&plan.approvals.confirmedStepIds.length===2)
markExecutionStarted(plan);recordExecutionResult(plan,{stepId:'step_1',ok:true,result:{id:'c1'}});recordExecutionResult(plan,{stepId:'step_2',ok:true,result:{updated:true}});recordExecutionResult(plan,{stepId:'step_3',ok:true,status:'delegated',receipt:{provider:'crm'}});t('recibos e idempotência registrados',plan.execution.receipts.length===3&&plan.execution.receipts.every(r=>r.idempotencyKey))
let rb=rollbackPreview(plan);t('rollback admite parcial e alerta irreversível',rb.possible===true&&rb.full===false&&Boolean(rb.warning))
verifyExecutionPlan(plan,{checks:[{stepId:'step_2',pass:true,evidence:'contato relido'},{stepId:'step_3',pass:true,evidence:'provider confirmou'}]});t('verificação fecha execução',plan.status==='completed'&&plan.verification.status==='passed')
const empty=buildExecutionPlan({objective:'nada',actions:[]});cancelExecutionPlan(empty,'usuário cancelou');t('cancelamento explícito',empty.status==='cancelled')
console.log(`\nExecution Intelligence V2.8: ${ok}/${total} testes aprovados.`);if(ok!==total)process.exit(1)
