import { PLATFORM_CAPABILITIES, PLATFORM_BOUNDARIES } from './platform-manifest.mjs'
import { nativeAppToolCatalog } from './app-tools.mjs'

export const PLATFORM_CONTRACT_VERSION='3.0'
export const PLATFORM_KERNEL_VERSION='3.1'

const PROFILES=Object.freeze({
  instant:{id:'instant',label:'Instant',reasoning:'fast',retrieval:'minimal',verification:'selective',maxAutonomyMinutes:0,toolPolicy:'read-only-auto',maxSilentWrites:0},
  balanced:{id:'balanced',label:'Balanced',reasoning:'adaptive',retrieval:'hybrid',verification:'risk-based',maxAutonomyMinutes:0,toolPolicy:'read-auto-write-confirm',maxSilentWrites:0},
  deep:{id:'deep',label:'Deep',reasoning:'advanced',retrieval:'full',verification:'always-for-material-claims',maxAutonomyMinutes:0,toolPolicy:'read-auto-write-confirm',maxSilentWrites:0},
  autonomous:{id:'autonomous',label:'Autonomous',reasoning:'advanced',retrieval:'full',verification:'checkpointed',maxAutonomyMinutes:240,toolPolicy:'long-horizon-checkpointed',maxSilentWrites:0},
})

const APP_ADAPTERS=Object.freeze({
  crm:{id:'crm',name:'RealTalent CRM',contract:'realtalent-app-adapter-v3',contextBridge:'app-context-v2.2',toolNamespace:'crm.',dispatch:'delegated-to-app',callbackProtocol:'receipt+postcondition',supports:['context','read-tools','write-proposals','execution-receipts','screen-state']},
  blue_ocean:{id:'blue_ocean',name:'Blue Ocean Service Studio',contract:'realtalent-app-adapter-v3',contextBridge:'app-context-v2.2',toolNamespace:'blueOcean.',dispatch:'delegated-to-app',callbackProtocol:'receipt+postcondition',supports:['context','read-tools','write-proposals','execution-receipts','screen-state']},
})

const MODEL_ROLES=Object.freeze([
  {role:'fast',purpose:'classificação e respostas simples',env:'OLLAMA_FAST_MODEL',default:'qwen3:1.7b'},
  {role:'general',purpose:'conversa e síntese',env:'OLLAMA_GENERAL_MODEL',default:'qwen3:4b'},
  {role:'reasoning',purpose:'planejamento e raciocínio profundo',env:'OLLAMA_REASONING_MODEL',default:'qwen3:4b'},
  {role:'coder',purpose:'código e Builder',env:'OLLAMA_CODER_MODEL',default:'qwen2.5-coder:3b'},
  {role:'vision',purpose:'percepção multimodal',env:'OLLAMA_VISION_MODEL',default:null},
  {role:'embedding',purpose:'RAG e memória semântica',env:'OLLAMA_EMBED_MODEL',default:'nomic-embed-text'},
])

export const platformKernelInfo=Object.freeze({
  version:PLATFORM_KERNEL_VERSION,
  contractVersion:PLATFORM_CONTRACT_VERSION,
  architecture:'central-intelligence-platform',
  stableContracts:true,
  appSpecificBrains:false,
  zeroSilentWrites:true,
  capabilityDiscovery:true,
  adapterDiscovery:true,
  executionProfiles:true,
  policyEvaluation:true,
  modelRoleDiscovery:true,
})

export function capabilityRegistry(){
  return PLATFORM_CAPABILITIES.map((c)=>({
    ...c,
    contractVersion:PLATFORM_CONTRACT_VERSION,
    discoverable:true,
    invocation:c.layer==='experience'?'ui':c.layer==='execution'||c.layer==='orchestration'?'governed-runtime':'runtime',
  }))
}

export function appAdapterRegistry(){
  return Object.values(APP_ADAPTERS).map((app)=>({
    ...app,
    tools:nativeAppToolCatalog(app.id).map(t=>({name:t.name,capability:t.capability,confirmation:t.confirmation,execution:t.execution})),
  }))
}

export function modelRoleRegistry(env=process.env){
  return MODEL_ROLES.map((m)=>({...m,configured:env[m.env]||m.default||null,enabled:Boolean(env[m.env]||m.default)}))
}

export function executionProfiles(){return Object.values(PROFILES)}

export function platformContracts(){return {
  version:PLATFORM_CONTRACT_VERSION,
  endpoints:{
    discovery:['GET /v3/platform','GET /v3/capabilities','GET /v3/apps','GET /v3/models','GET /v3/profiles','GET /v3/contracts'],
    policy:['POST /v3/policy/evaluate'],
    compatibility:['GET /platform','GET /health','GET /tools/catalog','POST /tools/execute'],
  },
  appAdapter:{version:'3.0',required:['product','workspace','route'],optional:['selected','screenState','errors','actionsAllowed','data'],writeDispatch:'delegated-to-app',completionProof:'receipt+postcondition'},
  safety:{maxSilentWrites:0,externalWriteRequiresExplicitConfirmation:true,irreversibleActionsRequireExplicitConfirmation:true,productDataRollbackAutomatic:false},
}}

const riskRank={low:1,medium:2,high:3,critical:4}
export function evaluatePlatformPolicy(input={}){
  const profile=PROFILES[input.profile]||PROFILES.balanced
  const capability=input.capability==='write'?'write':'read'
  const risk=['low','medium','high','critical'].includes(input.risk)?input.risk:(capability==='write'?'high':'low')
  const role=String(input.role||'operator').toLowerCase()
  const irreversible=Boolean(input.irreversible)
  const base={contractVersion:PLATFORM_CONTRACT_VERSION,profile:profile.id,capability,risk,role,irreversible,maxSilentWrites:0}
  if(capability==='read') return {...base,decision:'allow',requiresConfirmation:false,requiresCheckpoint:false,reason:'Leitura permitida pelo perfil; sem mutação externa.'}
  if(role==='viewer') return {...base,decision:'deny',requiresConfirmation:true,requiresCheckpoint:true,reason:'Perfil viewer não possui permissão de escrita.'}
  if(risk==='critical'&&role!=='admin') return {...base,decision:'deny',requiresConfirmation:true,requiresCheckpoint:true,reason:'Escrita crítica exige papel admin.'}
  return {...base,decision:'checkpoint',requiresConfirmation:true,requiresCheckpoint:true,reason:irreversible?'Ação irreversível exige confirmação explícita.':'Toda escrita externa exige confirmação explícita.',approvalRole:riskRank[risk]>=3?'manager-or-admin':'operator-or-higher'}
}

export function platformV3Snapshot({provider=null,runtimeModels=null,runtimeState=null}={}){
  const caps=capabilityRegistry(),apps=appAdapterRegistry(),profiles=executionProfiles(),models=modelRoleRegistry()
  const layerCounts=caps.reduce((acc,c)=>{acc[c.layer]=(acc[c.layer]||0)+1;return acc},{})
  return {product:'RealTalent Intelligence Platform',version:'3.1',contractVersion:PLATFORM_CONTRACT_VERSION,kernel:platformKernelInfo,provider,capabilities:{count:caps.length,byLayer:layerCounts},apps:{count:apps.length,ids:apps.map(a=>a.id)},profiles:profiles.map(p=>p.id),models:runtimeModels||models,runtime:runtimeState||null,boundaries:PLATFORM_BOUNDARIES}
}
