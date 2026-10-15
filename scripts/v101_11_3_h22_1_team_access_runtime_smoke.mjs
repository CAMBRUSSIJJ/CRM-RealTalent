import fs from 'node:fs'
import vm from 'node:vm'
import ts from '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js'

const source = fs.readFileSync('src/services/team-access-control.ts','utf8')
const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
const module={exports:{}}
const fakeStorage={ getItem(){return null}, setItem(){} }
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
]
const snapshot={profiles:api.defaultAccessProfiles('w1'),assignments:[]}
const seller=api.resolveMemberAccess('w1','seller-a','member',snapshot,memberships)
const manager=api.resolveMemberAccess('w1','manager','member',snapshot,memberships)
const viewer=api.resolveMemberAccess('w1','viewer-user','viewer',snapshot,memberships)
const checks=[]
const ok=(name,value)=>checks.push([name,Boolean(value)])
ok('seller receives Vendedor profile',seller.profile.systemKey==='seller')
ok('seller can view contacts',api.accessActionAllowed(seller,'view','contacts'))
ok('seller cannot delete contacts',!api.accessActionAllowed(seller,'delete','contacts'))
ok('seller cannot reassign contacts',!api.accessActionAllowed(seller,'assign','contacts'))
ok('seller sees own contact',api.accessRecordAllowed(seller,'contacts','seller-a'))
ok('seller cannot see peer contact under own scope',!api.accessRecordAllowed(seller,'contacts','seller-b'))
ok('manager receives Gestor profile',manager.profile.systemKey==='manager')
ok('manager sees peer in same team',api.accessRecordAllowed(manager,'pipeline','seller-b'))
ok('manager can reassign pipeline inside team',api.accessActionAllowed(manager,'assign','pipeline') && api.accessRecordAllowed(manager,'pipeline','seller-b'))
ok('manager cannot see outsider team record',!api.accessRecordAllowed(manager,'pipeline','outsider'))
ok('viewer can read tasks',api.accessActionAllowed(viewer,'view','tasks'))
ok('viewer cannot edit tasks',!api.accessActionAllowed(viewer,'edit','tasks'))
let denied=false
try{api.assertAccess(seller,'delete','contacts','seller-a')}catch{denied=true}
ok('assertAccess denies forbidden action',denied)
const custom={...snapshot,profiles:[...snapshot.profiles,{id:'custom-team-reader',workspaceId:'w1',name:'Leitor time',description:'',systemKey:null,isSystem:false,rules:[{resource:'contacts',scope:'team',actions:['view']},{resource:'pipeline',scope:'none',actions:[]},{resource:'tasks',scope:'none',actions:[]},{resource:'communications',scope:'none',actions:[]},{resource:'proposals',scope:'none',actions:[]},{resource:'prospecting',scope:'none',actions:[]},{resource:'goals',scope:'none',actions:[]},{resource:'settings',scope:'none',actions:[]}],createdAt:'x',updatedAt:'x'}],assignments:[{workspaceId:'w1',userId:'seller-a',profileId:'custom-team-reader',updatedAt:'x'}]}
const customAccess=api.resolveMemberAccess('w1','seller-a','member',custom,memberships)
ok('custom assignment overrides default profile',customAccess.profile.id==='custom-team-reader')
ok('custom team scope sees teammate',api.accessRecordAllowed(customAccess,'contacts','seller-b'))
ok('custom team scope blocks outsider',!api.accessRecordAllowed(customAccess,'contacts','outsider'))
ok('custom read-only team profile cannot reassign',!api.accessActionAllowed(customAccess,'assign','contacts'))
let failed=0
for(const [name,value] of checks){console.log(`${value?'OK  ':'FAIL'} ${name}`);if(!value)failed++}
console.log(`\nH22.1 Team Access Runtime: ${checks.length-failed}/${checks.length} PASS`)
if(failed)process.exit(1)
