import type {Lead} from '../domain/types'

/**
 * Win-specific evidence, authored by a person and linked to an EXISTING won CRM record.
 * This first preview is deliberately browser-local, isolated by workspace.
 * It does not auto-infer triggers from conversations or collect public-company data.
 */
export type WonTriggerCategory='negative_experience'|'transition'|'new_awareness'|'other'
export type WonTriggerEvidence='customer_statement'|'document'|'public_source'|'team_observation'|'hypothesis'
export interface WonSalesRecord{
  leadId:string
  category:WonTriggerCategory
  trigger:string
  happenedAt:string
  discoveredAt:string
  whyUs:string
  previousAlternative:string
  evidence:WonTriggerEvidence
  evidenceNote:string
  evidenceUrl:string
  createdAt:string
  updatedAt:string
}
export const TRIGGER_CATEGORIES:Record<WonTriggerCategory,string>={
  negative_experience:'Experiência insatisfatória',
  transition:'Mudança ou transição',
  new_awareness:'Nova necessidade ou percepção',
  other:'Outro acontecimento',
}
export const TRIGGER_SUGGESTIONS:Record<WonTriggerCategory,string[]>={
  negative_experience:['Problemas com fornecedor','Insatisfação de clientes','Baixo desempenho','Rotatividade de pessoal','Retrabalho ou atrasos'],
  transition:['Mudança de liderança','Contratação ou expansão da equipe','Abertura de filial','Fusão ou aquisição','Nova exigência regulatória','Mudança de estratégia'],
  new_awareness:['Nova meta de crescimento','Identificação de lacuna de competências','Oportunidade de mercado','Revisão de processos','Nova tecnologia'],
  other:['Outro evento documentado'],
}
export const EVIDENCE_LABELS:Record<WonTriggerEvidence,string>={
  customer_statement:'Relato do comprador',
  document:'Documento verificável',
  public_source:'Fonte pública',
  team_observation:'Observação da equipe',
  hypothesis:'Hipótese não confirmada',
}
export type WonSalesInput=Pick<WonSalesRecord,'category'|'trigger'|'happenedAt'|'discoveredAt'|'whyUs'|'previousAlternative'|'evidence'|'evidenceNote'|'evidenceUrl'>
const STORE_VERSION=1
const CHANGE_EVENT='realtalent:won-sales:changed'
const MAX_RECORDS=700
const clean=(value:unknown,limit:number)=>typeof value==='string'
  ?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,limit):''
const day=(value:unknown)=>{
  if(typeof value!=='string'||!/\d{4}-\d{2}-\d{2}/.test(value))return ''
  const d=new Date(value+'T12:00:00Z')
  return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==value?'':value
}
const storageKey=(workspaceId:string)=>'realtalent:won-sales:v1:'+workspaceId
export function validateWonSalesInput(input:WonSalesInput):WonSalesInput{
  const category=Object.keys(TRIGGER_CATEGORIES).includes(input.category)?input.category:null
  const evidence=Object.keys(EVIDENCE_LABELS).includes(input.evidence)?input.evidence:null
  const trigger=clean(input.trigger,130)
  const happenedAt=day(input.happenedAt)
  const discoveredAt=day(input.discoveredAt)
  const whyUs=clean(input.whyUs,700)
  const previousAlternative=clean(input.previousAlternative,420)
  const evidenceNote=clean(input.evidenceNote,900)
  const evidenceUrl=clean(input.evidenceUrl,380)
  if(!category||!evidence||trigger.length<4||!happenedAt||!whyUs||!evidenceNote)
    throw new Error('Informe o acontecimento, a data, o motivo da escolha e a evidência.')
  if(evidence==='public_source' && (!/^https:\/\//i.test(evidenceUrl)||!isPublicSourceUrl(evidenceUrl)))
    throw new Error('Informe um endereço HTTPS público válido para a evidência externa.')
  if(evidenceUrl&&!isPublicSourceUrl(evidenceUrl))
    throw new Error('O link de evidência deve usar HTTPS público.')
  if(happenedAt>new Date().toISOString().slice(0,10))
    throw new Error('A data do evento não pode estar no futuro.')
  if(discoveredAt && discoveredAt<happenedAt)
    throw new Error('A data da descoberta não pode ser anterior ao acontecimento.')
  return {category,trigger,happenedAt,discoveredAt,whyUs,previousAlternative,evidence,evidenceNote,evidenceUrl}
}
function isPublicSourceUrl(value:string):boolean{
  try{
    const u=new URL(value)
    if(u.protocol!=='https:'||u.username||u.password)return false
    const host=u.hostname.toLowerCase()
    if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
      /^(?:\d+\.){3}\d+$/.test(host)||host.includes(':')||!host.includes('.'))return false
    return true
  }catch{return false}
}
function validRecord(value:unknown):WonSalesRecord|null{
  if(!value||typeof value!=='object')return null
  const item=value as Partial<WonSalesRecord>
  if(typeof item.leadId!=='string'||!item.leadId||item.leadId.length>150)return null
  try{
    const v=validateWonSalesInput(item as WonSalesInput)
    return {...v,leadId:item.leadId,createdAt:clean(item.createdAt,32),updatedAt:clean(item.updatedAt,32)}
  }catch{return null}
}
export function readWonSales(workspaceId:string,store:Pick<Storage,'getItem'>):WonSalesRecord[]{
  if(!workspaceId)return []
  try{
    const raw=store.getItem(storageKey(workspaceId))
    if(!raw)return []
    const parsed=JSON.parse(raw) as {version?:number;records?:unknown[]}
    if(parsed.version!==STORE_VERSION||!Array.isArray(parsed.records))return []
    const seen=new Set<string>()
    return parsed.records.slice(0,MAX_RECORDS).map(validRecord).filter((record):record is WonSalesRecord=>{
      if(!record||seen.has(record.leadId))return false
      seen.add(record.leadId);return true
    })
  }catch{return []}
}
export function upsertWonSale(workspaceId:string,lead:Lead,input:WonSalesInput,
  store:Pick<Storage,'getItem'|'setItem'>):WonSalesRecord{
  if(!workspaceId||lead.workspaceId!==workspaceId||lead.status!=='won')
    throw new Error('Somente vendas ganhas deste workspace podem receber eventos-gatilho.')
  const validated=validateWonSalesInput(input)
  const existing=readWonSales(workspaceId,store)
  const previous=existing.find(record=>record.leadId===lead.id)
  const now=new Date().toISOString()
  const record:WonSalesRecord={
    ...validated,leadId:lead.id,createdAt:previous?.createdAt||now,updatedAt:now
  }
  const records=[record,...existing.filter(item=>item.leadId!==lead.id)].slice(0,MAX_RECORDS)
  store.setItem(storageKey(workspaceId),JSON.stringify({version:STORE_VERSION,records}))
  if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(CHANGE_EVENT,{detail:{workspaceId}}))
  return record
}
export function removeWonSale(workspaceId:string,leadId:string,
  store:Pick<Storage,'getItem'|'setItem'>):void{
  const records=readWonSales(workspaceId,store).filter(item=>item.leadId!==leadId)
  store.setItem(storageKey(workspaceId),JSON.stringify({version:STORE_VERSION,records}))
  if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(CHANGE_EVENT,{detail:{workspaceId}}))
}
export function listenWonSales(workspaceId:string,refresh:()=>void):()=>void{
  const onLocal=(event:Event)=>{
    if((event as CustomEvent<{workspaceId:string}>).detail?.workspaceId===workspaceId)refresh()
  }
  const onStorage=(event:StorageEvent)=>{if(event.key===storageKey(workspaceId))refresh()}
  window.addEventListener(CHANGE_EVENT,onLocal);window.addEventListener('storage',onStorage)
  return ()=>{window.removeEventListener(CHANGE_EVENT,onLocal);window.removeEventListener('storage',onStorage)}
}
export interface WonTriggerPattern{
  category:WonTriggerCategory
  trigger:string
  count:number
  revenue:number
  averageLagDays:number|null
  evidenceCount:number
  hypothesisCount:number
}
export function analyzeWonSales(leads:Lead[],records:WonSalesRecord[],closedWonDates:Record<string,string>={}){
  const won=leads.filter(lead=>lead.status==='won')
  const winsById=new Map(won.map(lead=>[lead.id,lead]))
  const eligible=records.filter(record=>winsById.has(record.leadId))
  const verified=eligible.filter(x=>x.evidence!=='hypothesis')
  const hypotheses=eligible.length-verified.length
  const grouped=new Map<string,{items:WonSalesRecord[];category:WonTriggerCategory;trigger:string}>()
  for(const record of eligible){
    const key=record.category+'::'+record.trigger.toLocaleLowerCase('pt-BR')
    const current=grouped.get(key)??{items:[],category:record.category,trigger:record.trigger}
    current.items.push(record);grouped.set(key,current)
  }
  const lag=(record:WonSalesRecord)=>{
    const lead=winsById.get(record.leadId)
    if(!lead)return null
    // No documented close timestamp means lag must remain unknown.
    const closedAt=closedWonDates[record.leadId]
    if(!closedAt||!Number.isFinite(Date.parse(closedAt)))return null
    const diff=Math.round((Date.parse(closedAt)-Date.parse(record.happenedAt+'T00:00:00Z'))/86400000)
    return diff>=0?diff:null
  }
  const patterns:WonTriggerPattern[]=[...grouped.values()].map(group=>{
    const confirmed=group.items.filter(item=>item.evidence!=='hypothesis')
    const lags=confirmed.map(lag).filter((x):x is number=>x!==null)
    return {
      category:group.category,trigger:group.trigger,count:group.items.length,
      revenue:confirmed.reduce((sum,item)=>sum+Math.max(0,winsById.get(item.leadId)?.value||0),0),
      averageLagDays:lags.length?Math.round(lags.reduce((a,b)=>a+b,0)/lags.length):null,
      evidenceCount:confirmed.length,hypothesisCount:group.items.length-confirmed.length
    }
  }).sort((a,b)=>b.evidenceCount-a.evidenceCount||b.count-a.count)
  return {
    wonCount:won.length,documented:eligible.length,confirmed:verified.length,hypotheses,
    unrecorded:Math.max(0,won.length-eligible.length),
    patterns,
    totalDocumentedRevenue:verified.reduce((sum,item)=>sum+Math.max(0,winsById.get(item.leadId)?.value||0),0),
    // Patterns in historical wins do not establish an uplift or conversion rate.
    limitation:'Padrões descritivos de vendas ganhas, não previsões causais nem taxas de conversão.'
  }
}
