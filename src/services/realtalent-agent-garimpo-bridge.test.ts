import {describe,it,expect,vi} from 'vitest'
import type {WorkspaceSnapshot} from '../domain/types'
import type {ProspectingAgentJob} from './prospecting-linux-agent'
import type {ProspectRecord} from './prospecting-workspace'
import {handleGarimpoFromMainAgent,isModelPlan,wantsGarimpoNativeTool,segmentStatedByUser,type GarimpoBridgeInput,type GarimpoBridgeDependencies} from './realtalent-agent-garimpo-bridge'

const snapshot={workspace:{id:'ws',role:'owner'},leads:[],companies:[],stages:[]} as unknown as WorkspaceSnapshot
const job=(overrides:Record<string,unknown>={}):ProspectingAgentJob=>({
  id:'job-1',workspaceId:'ws',status:'completed',createdAt:'2026-10-29T09:00:00Z',
  input:{segment:'Barbearia',regions:['Rio Grande, RS'],targetQuantity:10,
    areaMode:'radius',radiusKm:15,searchMode:'fast',categoryMode:'exact',targetMode:'quantity'},
  stats:{unique:6},results:[],...overrides
} as unknown as ProspectingAgentJob)
const params=(prompt:string):GarimpoBridgeInput=>({
  prompt,route:'prospecting',workspaceId:'ws',currentUserId:'u1',
  snapshot,history:[],canView:true,canSearch:true,onNavigateToGarimpo:vi.fn(),
})
const plan=(intent:string='search',overrides:Record<string,unknown>={})=>({
  intent,segment:'Jardinagem',city:'Rio Grande, RS',quantity:40,
  confidence:0.95,answer:'Planejei a busca.',...overrides
})
const mockDeps=(p=plan(),jobs:ProspectingAgentJob[]=[job()])=>{
  const createJob=vi.fn(async(_input:Parameters<GarimpoBridgeDependencies['createJob']>[0])=>job({id:'new-job',status:'queued',
    input:{...job().input,segment:'Jardinagem',targetQuantity:40}}))
  const listJobs=vi.fn(async()=>jobs)
  const health=vi.fn(async()=>({ok:true}))
  const fetcher=vi.fn(async()=>({ok:true,json:async()=>({ok:true,plan:p})}))
  const localState=vi.fn(()=>({prospects:[],history:[],lastExtensionSyncAt:null}))
  return {createJob,listJobs,health,fetcher,localState}
}
describe('RealTalent principal Agent -> Garimpo G3 native bridge',()=>{
  it('intercepts explicit search even though generic AI would answer hypothetically',()=>{
    expect(wantsGarimpoNativeTool('eu quero que tu ache no garimpo 40 empresas de jardinagem','prospecting')).toBe(true)
    expect(wantsGarimpoNativeTool('resuma minhas tarefas de hoje','prospecting')).toBe(false)
    expect(wantsGarimpoNativeTool('procure oportunidades no pipeline','pipeline')).toBe(false)
  })
  it('keeps the user-stated sector instead of the previous Barber shop search',async()=>{
    expect(segmentStatedByUser('quero que tu ache no Garimpo 40 empresas de jardinagem')).toBe('jardinagem')
    const deps=mockDeps(plan('search',{segment:'Barbearia'}))
    await handleGarimpoFromMainAgent(params('ache no Garimpo 40 empresas de jardinagem'),deps as never)
    expect(deps.createJob.mock.calls[0][0].segment).toBe('jardinagem')
  })
  it('never starts a search when user explicitly says not to',()=>{
    expect(wantsGarimpoNativeTool('não busque empresas no Garimpo','prospecting')).toBe(false)
  })
  it('converts a mistaken generic answer into a real request when parameters are verified',async()=>{
    const deps=mockDeps(plan('answer',{segment:'Barbearia',answer:'Sugestões hipotéticas'}))
    const result=await handleGarimpoFromMainAgent(params('ache no Garimpo 40 empresas de jardinagem'),deps as never)
    expect(deps.createJob).toHaveBeenCalledTimes(1)
    expect(result?.title).toBe('Busca iniciada no Garimpo')
  })
  it('reports real engine progress rather than claiming target quantity found',async()=>{
    const deps=mockDeps(plan('answer'),[job({status:'running',stats:{unique:6},results:[]})])
    const result=await handleGarimpoFromMainAgent(params('quantas empresas encontrou no garimpo?'),deps as never)
    expect(result?.text).toContain('6 empresa(s) única(s)')
    expect(result?.text).toContain('A meta solicitada é 10')
  })
  it('checks typed structured model plan',()=>{
    expect(isModelPlan(plan())).toBe(true)
    expect(isModelPlan(plan('executar_whatsapp'))).toBe(false)
  })
  it('starts a real territorial job with the previous geographic context and precise target',async()=>{
    const deps=mockDeps()
    const input=params('ache no Garimpo 40 empresas de jardinagem')
    const answer=await handleGarimpoFromMainAgent(input,deps as never)
    expect(deps.createJob).toHaveBeenCalledTimes(1)
    expect(deps.createJob.mock.calls[0][0]).toMatchObject({
      workspaceId:'ws',segment:'jardinagem',regions:['Rio Grande, RS'],targetQuantity:40,
      searchMode:'coverage',categoryMode:'exact',areaMode:'radius',
    })
    expect(input.onNavigateToGarimpo).toHaveBeenCalledWith(false)
    expect(answer?.text).toContain('Iniciei uma pesquisa REAL')
    expect(answer?.text).not.toContain('40 empresas encontradas')
  })
  it('does not start a second job while the engine is already searching',async()=>{
    const deps=mockDeps(plan(),[job({status:'running',stats:{unique:3},results:[]})])
    const answer=await handleGarimpoFromMainAgent(params('pesquise 40 empresas no garimpo'),deps as never)
    expect(deps.createJob).not.toHaveBeenCalled()
    expect(answer?.text).toContain('3 registro(s)')
  })
  it('rejects search without permission',async()=>{
    const deps=mockDeps()
    const answer=await handleGarimpoFromMainAgent({...params('ache no garimpo 40 empresas'),canSearch:false},deps as never)
    expect(deps.createJob).not.toHaveBeenCalled()
    expect(answer?.text).toContain('não iniciar pesquisas')
  })
  it('asks for city instead of creating hypothetical firms',async()=>{
    const deps=mockDeps(plan('clarify',{city:'',answer:'Qual cidade?'}),[])
    const answer=await handleGarimpoFromMainAgent(params('ache no garimpo 40 empresas'),deps as never)
    expect(deps.createJob).not.toHaveBeenCalled()
    expect(answer?.text).toContain('Qual cidade?')
  })
  it('reports model outages without pretending to search',async()=>{
    const deps=mockDeps()
    deps.fetcher=vi.fn(async()=>({ok:false,json:async()=>({})})) as never
    const answer=await handleGarimpoFromMainAgent(params('ache no garimpo 40 empresas'),deps as never)
    expect(deps.createJob).not.toHaveBeenCalled()
    expect(answer?.text).toContain('Nenhuma lista foi inventada')
  })
  it('never invents a territory on an explicit search without region',async()=>{
    const deps=mockDeps(plan('answer',{city:'',segment:'jardinagem',answer:'Aqui tem lista hipotética'}),[])
    const answer=await handleGarimpoFromMainAgent(params('ache no garimpo 40 empresas de jardinagem'),deps as never)
    expect(deps.createJob).not.toHaveBeenCalled()
    expect(answer?.text).not.toContain('Aqui tem lista hipotética')
  })
  it('grounds ranking in actual candidates rather than fabricated records',async()=>{
    const deps=mockDeps(plan('rank'),[job({results:[{company:'Jardins Reais',city:'Rio Grande',qualityStatus:'attention'}]})])
    const answer=await handleGarimpoFromMainAgent(params('quais empresas do garimpo devo revisar?'),deps as never)
    expect(answer?.text).toContain('Jardins Reais')
    expect(answer?.text).not.toContain('Jardim Arteiro')
  })
})
