import fs from 'node:fs'
import vm from 'node:vm'
import ts from '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js'

const transpile=(file)=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
const runModule=(code,requireStub)=>{const module={exports:{}};vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{console,Date,JSON,Set,Map,Array,Object,Boolean,String,Number,Math,Error,CustomEvent:class {},crypto:{randomUUID:()=>`uuid-${Date.now()}`}})(requireStub,module,module.exports);return module.exports}

const memory=new Map()
const safeStorage={getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)}
let seq=0
const idModule={createId:(prefix='id')=>`${prefix}-runtime-${++seq}`}
const storageModule={safeStorage}
const supabaseModule={getSupabaseClient:()=>null}

const access=runModule(transpile('src/services/team-access-control.ts'),(id)=>{
  if(id==='../lib/id')return idModule
  if(id==='../lib/storage')return storageModule
  if(id==='../lib/supabase')return supabaseModule
  throw new Error(`Unexpected access dependency: ${id}`)
})
const pricing=runModule(transpile('src/services/proposal-pricing.ts'),(id)=>{if(id==='../domain/types')return {};throw new Error(`Unexpected pricing dependency: ${id}`)})
const governance=runModule(transpile('src/services/team-governance.ts'),(id)=>{
  if(id==='../lib/id')return idModule
  if(id==='../lib/storage')return storageModule
  if(id==='../lib/supabase')return supabaseModule
  if(id==='./team-access-control')return access
  if(id==='./proposal-pricing')return pricing
  throw new Error(`Unexpected governance dependency: ${id}`)
})

const memberships=[
  {id:'m1',workspaceId:'w1',teamId:'t1',userId:'manager',role:'leader'},
  {id:'m2',workspaceId:'w1',teamId:'t1',userId:'seller',role:'member'},
  {id:'m3',workspaceId:'w1',teamId:'t1',userId:'sdr',role:'member'},
]
const defaults=access.defaultAccessProfiles('w1')
const snapshot={profiles:defaults,assignments:[
  {workspaceId:'w1',userId:'seller',profileId:'system-seller',updatedAt:new Date().toISOString()},
  {workspaceId:'w1',userId:'sdr',profileId:'system-sdr',updatedAt:new Date().toISOString()},
]}
const seller=access.resolveMemberAccess('w1','seller','member',snapshot,memberships)
const manager=access.resolveMemberAccess('w1','manager','member',snapshot,memberships)
const sdr=access.resolveMemberAccess('w1','sdr','member',snapshot,memberships)
const viewer=access.resolveMemberAccess('w1','viewer','viewer',{profiles:defaults,assignments:[]},memberships)

const custom={
  ...defaults.find(p=>p.id==='system-seller'),id:'custom-governance',name:'Vendedor custom',systemKey:null,isSystem:false,
  fieldAccess:{...defaults.find(p=>p.id==='system-seller').fieldAccess,proposal_cost:'view',proposal_margin:'edit'},
  approvalPolicy:{proposalDiscountPercent:8,proposalMinMarginPercent:30,proposalTotalValue:25000,exportRequiresApproval:false},
}
const customAccess=access.resolveMemberAccess('w1','custom','member',{profiles:[...defaults,custom],assignments:[{workspaceId:'w1',userId:'custom',profileId:'custom-governance',updatedAt:new Date().toISOString()}]},[...memberships,{id:'m4',workspaceId:'w1',teamId:'t1',userId:'custom',role:'member'}])

const checks=[]
const ok=(name,value)=>checks.push([name,Boolean(value)])

ok('seller sees phone',access.canViewSensitiveField(seller,'contact_phone'))
ok('seller edits phone',access.canEditSensitiveField(seller,'contact_phone'))
ok('seller cost is hidden',access.fieldAccessLevelFor(seller,'proposal_cost')==='hidden')
ok('seller margin is view only',access.fieldAccessLevelFor(seller,'proposal_margin')==='view')
ok('seller discount is editable',access.fieldAccessLevelFor(seller,'proposal_discount')==='edit')
ok('SDR proposal total hidden',access.fieldAccessLevelFor(sdr,'proposal_total')==='hidden')
ok('SDR revenue hidden',access.fieldAccessLevelFor(sdr,'revenue_amount')==='hidden')
ok('viewer cannot edit phone',!access.canEditSensitiveField(viewer,'contact_phone'))
ok('manager may approve proposals',access.accessCanApprove(manager,'proposals'))
ok('viewer may not approve proposals',!access.accessCanApprove(viewer,'proposals'))
ok('custom field override is honored',access.fieldAccessLevelFor(customAccess,'proposal_cost')==='view'&&access.fieldAccessLevelFor(customAccess,'proposal_margin')==='edit')
ok('custom approval threshold is honored',access.approvalPolicyFor(customAccess).proposalDiscountPercent===8&&access.approvalPolicyFor(customAccess).proposalTotalValue===25000)

const product={id:'prod1',unitCost:70,maxDiscountPercent:12,minMarginPercent:25}
const item={id:'item1',productId:'prod1',quantity:1,unitPrice:100,discountPercent:18,taxRate:0,billingType:'one_time',billingInterval:null,lineSubtotal:100,lineDiscount:18,lineTax:0,lineTotal:82,unitCostSnapshot:70}
const reasons=governance.proposalApprovalReasons(seller,[item],[product],60000)
ok('seller discount over threshold requires approval',reasons.some(r=>r.includes('Desconto')))
ok('seller low margin requires approval',reasons.some(r=>r.includes('Margem')))
ok('seller TCV over threshold requires approval',reasons.some(r=>r.includes('TCV')))
ok('catalog guardrail contributes approval reason',reasons.some(r=>r.includes('limite')||r.includes('mínimo')))
ok('manager bypasses proposal thresholds',governance.proposalApprovalReasons(manager,[item],[product],60000).length===0)

ok('seller export policy requires approval',access.approvalPolicyFor(seller).exportRequiresApproval===true)
ok('manager export policy does not require approval',access.approvalPolicyFor(manager).exportRequiresApproval===false)
ok('custom can disable export approval',access.approvalPolicyFor(customAccess).exportRequiresApproval===false)

const firstExport=await governance.requireExportApproval('local','w1',seller,{userName:'Seller',resource:'contacts',entityType:'contacts_export',count:12})
ok('first seller export is blocked pending approval',firstExport===false)
let approvals=await governance.listTeamApprovals('local','w1')
const pending=approvals.find(a=>a.kind==='data_export'&&a.resource==='contacts'&&a.status==='pending')
ok('pending export approval is created',Boolean(pending))
await governance.decideTeamApproval('local','w1',manager,pending.id,'approved','Manager')
approvals=await governance.listTeamApprovals('local','w1')
ok('manager approval changes status',approvals.find(a=>a.id===pending.id)?.status==='approved')
const secondExport=await governance.requireExportApproval('local','w1',seller,{userName:'Seller',resource:'contacts',entityType:'contacts_export',count:12})
ok('approved export is released',secondExport===true)
approvals=await governance.listTeamApprovals('local','w1')
ok('export approval is single use',approvals.find(a=>a.id===pending.id)?.status==='cancelled')

const directExport=await governance.requireExportApproval('local','w1',manager,{userName:'Manager',resource:'contacts',entityType:'contacts_export',count:4})
ok('manager export proceeds without approval',directExport===true)

const proposalRequest=await governance.requestTeamApproval('local','w1',{requesterId:'seller',requesterName:'Seller',resource:'proposals',kind:'proposal_policy',entityType:'proposal',entityId:'proposal-1',reason:'Discount exceeds threshold',payload:{totalContractValue:60000}})
ok('proposal approval request is pending',proposalRequest.status==='pending')
ok('approval status helper sees pending',await governance.approvalStatusForEntity('local','w1','proposal_policy','proposal','proposal-1')==='pending')
await governance.decideTeamApproval('local','w1',manager,proposalRequest.id,'rejected','Manager')
ok('approval status helper sees rejected',await governance.approvalStatusForEntity('local','w1','proposal_policy','proposal','proposal-1')==='rejected')

const audit=await governance.listTeamSecurityAudit('local','w1',100)
ok('audit records approval requested',audit.some(e=>e.action==='approval_requested'))
ok('audit records approval approved',audit.some(e=>e.action==='approval_approved'))
ok('audit records approval rejected',audit.some(e=>e.action==='approval_rejected'))
ok('audit records exported data',audit.some(e=>e.action==='data_exported'))

let failed=0
for(const [name,value] of checks){console.log(`${value?'OK  ':'FAIL'} ${name}`);if(!value)failed++}
console.log(`\nH22.3 Field governance runtime: ${checks.length-failed}/${checks.length} PASS`)
if(failed)process.exit(1)
