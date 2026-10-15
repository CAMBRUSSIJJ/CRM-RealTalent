import {buildLongHorizonRun,startOrAdvanceLongHorizon,approveLongHorizonCheckpoint,completeLongHorizonStage,pauseLongHorizonRun,resumeLongHorizonRun,recoverStaleLongHorizonRun,autonomyBudget,longHorizonInfo} from './long-horizon-intelligence.mjs'
let ok=0,total=0;const t=(n,p)=>{total++;console.log(`${p?'OK  ':'FAIL'} ${n}`);if(p)ok++}
const run=buildLongHorizonRun({objective:'Auditar, corrigir e verificar CRM',product:'crm',autonomyMinutes:20,leaseSeconds:60,stages:[
 {id:'observe',title:'Observar',objective:'Auditar',risk:'low',capability:'read'},
 {id:'fix',title:'Corrigir',objective:'Aplicar correção',risk:'high',capability:'write',dependsOn:['observe'],acceptanceCriteria:['build verde']},
 {id:'verify',title:'Verificar',objective:'Validar regressão',risk:'low',capability:'read',dependsOn:['fix']},
]})
t('manifest V2.9',longHorizonInfo.version==='2.9'&&longHorizonInfo.features.maxSilentWrites===0)
let a=startOrAdvanceLongHorizon(run,{owner:'worker-1'});t('leitura low-risk inicia automática',a.stage?.id==='observe'&&run.status==='running')
completeLongHorizonStage(run,'observe',{ok:true,evidence:['audit PASS']});a=startOrAdvanceLongHorizon(run,{owner:'worker-1'});t('escrita high-risk para em checkpoint',a.stage?.id==='fix'&&run.status==='awaiting_checkpoint'&&a.checkpoint?.status==='pending')
approveLongHorizonCheckpoint(run,a.checkpoint.id,{actor:'admin'});a=startOrAdvanceLongHorizon(run,{owner:'worker-1'});t('checkpoint aprovado libera etapa',a.stage?.id==='fix'&&run.status==='running')
completeLongHorizonStage(run,'fix',{ok:true,evidence:['patch receipt','build PASS']});a=startOrAdvanceLongHorizon(run,{owner:'worker-1'});t('dependência libera verificação',a.stage?.id==='verify'&&run.status==='running')
pauseLongHorizonRun(run,{reason:'janela encerrada'});const token=run.resumeToken;resumeLongHorizonRun(run,{resumeToken:token,actor:'admin'});t('pause/resume preserva run',run.status==='ready'&&run.resumeAttempts===1)
a=startOrAdvanceLongHorizon(run,{owner:'worker-1'});completeLongHorizonStage(run,'verify',{ok:true,evidence:['browser QA PASS']});startOrAdvanceLongHorizon(run,{owner:'worker-1'});t('conclusão exige todas etapas',run.status==='completed'&&run.stages.every(s=>s.status==='completed'))
const stale=buildLongHorizonRun({objective:'stale recovery',stages:[{id:'s1',objective:'long op',risk:'low'}],leaseSeconds:30});startOrAdvanceLongHorizon(stale,{owner:'worker-x'});stale.lease.expiresAt=new Date(Date.now()-1000).toISOString();const rec=recoverStaleLongHorizonRun(stale);t('lease expirado gera recovery_required',rec.recovered&&stale.status==='recovery_required'&&stale.stages[0].status==='recovery_required')
t('budget observável',autonomyBudget(run).minutes===20)
console.log(`\nLong-Horizon Intelligence V2.9: ${ok}/${total} testes aprovados.`);if(ok!==total)process.exit(1)
