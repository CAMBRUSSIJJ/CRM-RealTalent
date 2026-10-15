import fs from 'node:fs'
import vm from 'node:vm'
import ts from '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js'

const source=fs.readFileSync('src/services/team-access-control.ts','utf8')
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
const module={exports:{}}
const fakeStorage={getItem(){return null},setItem(){}}
const requireStub=(id)=>{
  if(id==='../lib/id') return {createId:(prefix='id')=>`${prefix}-runtime`}
  if(id==='../lib/storage') return {safeStorage:fakeStorage}
  if(id==='../lib/supabase') return {getSupabaseClient:()=>null}
  throw new Error(`Unexpected runtime dependency: ${id}`)
}
vm.runInNewContext(`(function(require,module,exports){${js}\n})`,{console,Date,JSON,Set,Map,Array,Object,Boolean,String,Error,CustomEvent:class {}})(requireStub,module,module.exports)
const api=module.exports
const memberships=[
  {id:'m1',workspaceId:'w1',teamId:'t1',userId:'manager',role:'leader'},
  {id:'m2',workspaceId:'w1',teamId:'t1',userId:'seller-a',role:'member'},
  {id:'m3',workspaceId:'w1',teamId:'t1',userId:'seller-b',role:'member'},
  {id:'m4',workspaceId:'w1',teamId:'t2',userId:'outsider',role:'member'},
  {id:'m5',workspaceId:'w1',teamId:'t1',userId:'sdr-a',role:'member'},
]
const custom={
  id:'custom-cross',workspaceId:'w1',name:'Operação customizada',description:'runtime',systemKey:null,isSystem:false,
  rules:[
    {resource:'contacts',scope:'none',actions:[]},{resource:'pipeline',scope:'none',actions:[]},{resource:'tasks',scope:'none',actions:[]},
    {resource:'communications',scope:'team',actions:['view','edit']},
    {resource:'proposals',scope:'none',actions:[]},
    {resource:'prospecting',scope:'own',actions:['view','create','edit','export']},
    {resource:'goals',scope:'own',actions:['view']},
    {resource:'settings',scope:'none',actions:[]},
  ],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
}
const snapshot={profiles:[...api.defaultAccessProfiles('w1'),custom],assignments:[{workspaceId:'w1',userId:'custom-user',profileId:'custom-cross',updatedAt:new Date().toISOString()},{workspaceId:'w1',userId:'sdr-a',profileId:'system-sdr',updatedAt:new Date().toISOString()}]}
const seller=api.resolveMemberAccess('w1','seller-a','member',snapshot,memberships)
const manager=api.resolveMemberAccess('w1','manager','member',snapshot,memberships)
const sdr=api.resolveMemberAccess('w1','sdr-a','member',snapshot,memberships)
const viewer=api.resolveMemberAccess('w1','viewer-user','viewer',snapshot,memberships)
const customUser=api.resolveMemberAccess('w1','custom-user','member',snapshot,[...memberships,{id:'m6',workspaceId:'w1',teamId:'t1',userId:'custom-user',role:'member'}])
const checks=[]
const ok=(name,value)=>checks.push([name,Boolean(value)])
const denied=(fn)=>{try{fn();return false}catch{return true}}

ok('seller sees own communication',api.accessRecordAllowed(seller,'communications','seller-a'))
ok('seller cannot see peer communication under own scope',!api.accessRecordAllowed(seller,'communications','seller-b'))
ok('seller can edit communications',api.accessActionAllowed(seller,'edit','communications'))
ok('seller sees own proposal',api.accessRecordAllowed(seller,'proposals','seller-a'))
ok('seller cannot see outsider proposal',!api.accessRecordAllowed(seller,'proposals','outsider'))
ok('seller can create proposals',api.accessActionAllowed(seller,'create','proposals'))
ok('manager sees peer communication',api.accessRecordAllowed(manager,'communications','seller-b'))
ok('manager sees peer proposal',api.accessRecordAllowed(manager,'proposals','seller-a'))
ok('manager cannot see outsider goal',!api.accessRecordAllowed(manager,'goals','outsider'))
ok('manager sees team goal by team id',api.accessRecordAllowed(manager,'goals',null,'t1'))
ok('SDR can use prospecting',api.accessActionAllowed(sdr,'create','prospecting'))
ok('SDR cannot view proposals',!api.accessActionAllowed(sdr,'view','proposals'))
ok('viewer can view communications',api.accessActionAllowed(viewer,'view','communications'))
ok('viewer cannot edit communications',!api.accessActionAllowed(viewer,'edit','communications'))
ok('viewer cannot export prospecting',!api.accessActionAllowed(viewer,'export','prospecting'))
ok('custom can edit team communications',api.accessActionAllowed(customUser,'edit','communications') && api.accessRecordAllowed(customUser,'communications','seller-a'))
ok('custom cannot create new communication',!api.accessActionAllowed(customUser,'create','communications'))
ok('custom has no proposals',!api.accessActionAllowed(customUser,'view','proposals'))
ok('custom prospecting own is visible',api.accessRecordAllowed(customUser,'prospecting','custom-user'))
ok('custom prospecting peer is hidden',!api.accessRecordAllowed(customUser,'prospecting','seller-a'))
ok('custom may export own prospecting',api.accessActionAllowed(customUser,'export','prospecting'))
ok('custom goals own only',api.accessRecordAllowed(customUser,'goals','custom-user') && !api.accessRecordAllowed(customUser,'goals','seller-a'))
ok('assertAccess denies seller peer proposal',denied(()=>api.assertAccess(seller,'edit','proposals','seller-b')))
ok('assertAccess denies custom proposal view',denied(()=>api.assertAccess(customUser,'view','proposals','custom-user')))
ok('assertAccess denies custom peer prospect export',denied(()=>api.assertAccess(customUser,'export','prospecting','seller-a')))

let failed=0
for(const [name,value] of checks){console.log(`${value?'OK  ':'FAIL'} ${name}`); if(!value) failed++}
console.log(`\nH22.2 Cross-Module Access runtime: ${checks.length-failed}/${checks.length} PASS`)
if(failed) process.exit(1)
