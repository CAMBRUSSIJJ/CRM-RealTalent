import type {ProspectRecord} from './prospecting-workspace'

export type TriggerCategoryG4='negative_experience'|'transition'|'new_awareness'
export type TriggerReviewG4='needs_review'|'approved'|'rejected'
export const triggerLabelsG4:Record<TriggerCategoryG4,string>={
  negative_experience:'Experiência negativa',
  transition:'Mudança ou transição',
  new_awareness:'Nova consciência de necessidade',
}
export interface TriggerCandidateG4 {
  category:TriggerCategoryG4
  event:string
  quote:string
  dateQuote:string|null
  hypothesis:string
  rationale:string
  suggestedQuestion:string
  status:'needs_review'
  sourceUrl:string
  sourceCheck:'not_verified'
  investigationPriority:number
}
export interface TriggerReviewRecordG4 extends TriggerCandidateG4 {
  id:string
  workspaceId:string
  prospectId:string
  reviewStatus:TriggerReviewG4
  reviewerNote:string
  sourceConfirmed:boolean
  reviewedAt:string|null
  updatedAt:string
}
export interface TriggerSourceG4 {company:string;city:string;sector:string;sourceUrl:string;excerpt:string}
const PREFIX='realtalent:garimpo:triggers:g4:v1:'
const validCategory=(s:unknown):s is TriggerCategoryG4=>
  s==='negative_experience'||s==='transition'||s==='new_awareness'
const asText=(value:unknown,n:number)=>typeof value==='string'?value.trim().slice(0,n):''
const safeUrl=(value:unknown)=>{
  const v=asText(value,500)
  try{
    const u=new URL(v)
    const h=u.hostname.toLowerCase()
    if(u.protocol!=='https:'||u.username||u.password||!h.includes('.')||h.endsWith('.local')||
      h==='localhost'||h.endsWith('.localhost')||h.endsWith('.internal')||
      /^(\d{1,3}\.){3}\d{1,3}$/.test(h)||h.includes(':'))return ''
    return u.href
  }catch{return ''}
}
const scopeKey=(workspaceId:string)=>PREFIX+encodeURIComponent(workspaceId)
function isStored(x:unknown):x is TriggerReviewRecordG4{
  if(!x||typeof x!=='object')return false
  const v=x as Partial<TriggerReviewRecordG4>
  return typeof v.id==='string'&&typeof v.workspaceId==='string'&&
    typeof v.prospectId==='string'&&validCategory(v.category)&&
    typeof v.event==='string'&&typeof v.quote==='string'&&v.quote.length>=18&&
    Boolean(safeUrl(v.sourceUrl))&&
    ['needs_review','approved','rejected'].includes(v.reviewStatus||'')&&
    typeof v.updatedAt==='string'&&v.sourceCheck==='not_verified'
}
/** Local draft storage only. This is not a substitute for backend RLS. */
export function readTriggerReviewsG4(workspaceId:string,store:Pick<Storage,'getItem'>):TriggerReviewRecordG4[]{
  if(!workspaceId)return []
  try{
    const data:unknown=JSON.parse(store.getItem(scopeKey(workspaceId))||'[]')
    return Array.isArray(data)
      ?data.filter(isStored).filter(row=>row.workspaceId===workspaceId).slice(0,600):[]
      :[]
  }catch{return []}
}
const emit=(workspaceId:string)=>{
  if(typeof window!=='undefined'&&typeof window.dispatchEvent==='function'&&typeof CustomEvent==='function')
    window.dispatchEvent(new CustomEvent('realtalent:garimpo:g4:change',{detail:{workspaceId}}))
}
const save=(workspaceId:string,rows:TriggerReviewRecordG4[],store:Pick<Storage,'setItem'>)=>{
  store.setItem(scopeKey(workspaceId),JSON.stringify(rows.slice(0,600)))
  emit(workspaceId)
}
export function appendTriggerCandidatesG4(workspaceId:string,prospect:ProspectRecord,
  candidates:TriggerCandidateG4[],source:TriggerSourceG4,store:Pick<Storage,'getItem'|'setItem'>):TriggerReviewRecordG4[]{
  if(!workspaceId||prospect.workspaceId!==workspaceId)throw Error('Empresa fora do workspace atual.')
  const existing=readTriggerReviewsG4(workspaceId,store)
  const now=new Date().toISOString()
  const added:TriggerReviewRecordG4[]=[]
  for(const item of candidates.slice(0,3)){
    if(!validCategory(item.category)||!safeUrl(item.sourceUrl)||item.quote.trim().length<18||
      item.status!=='needs_review'||item.sourceCheck!=='not_verified'||
      safeUrl(item.sourceUrl)!==safeUrl(source.sourceUrl)||
      !source.excerpt.toLocaleLowerCase('pt-BR').replace(/\s+/g,' ')
        .includes(item.quote.toLocaleLowerCase('pt-BR').trim().replace(/\s+/g,' ')))continue
    const key=safeUrl(item.sourceUrl)+'|'+item.quote.trim().toLocaleLowerCase('pt-BR')
    if(existing.some(row=>row.prospectId===prospect.id&&
      safeUrl(row.sourceUrl)+'|'+row.quote.trim().toLocaleLowerCase('pt-BR')===key))continue
    const record:TriggerReviewRecordG4={
      id:crypto.randomUUID(),workspaceId,prospectId:prospect.id,
      category:item.category,event:asText(item.event,160),quote:asText(item.quote,340),
      dateQuote:asText(item.dateQuote,85)||null,
      hypothesis:asText(item.hypothesis,420),rationale:asText(item.rationale,420),
      suggestedQuestion:asText(item.suggestedQuestion,250),
      status:'needs_review',sourceUrl:safeUrl(item.sourceUrl),
      sourceCheck:'not_verified',investigationPriority:Math.min(65,Math.max(0,item.investigationPriority)),
      reviewStatus:'needs_review',reviewerNote:'',sourceConfirmed:false,
      reviewedAt:null,updatedAt:now,
    }
    if(!record.event||!record.hypothesis)continue
    added.push(record)
  }
  if(added.length)save(workspaceId,[...added,...existing],store)
  return added
}
export function reviewTriggerG4(workspaceId:string,prospectId:string,id:string,
  decision:'approved'|'rejected',confirmed:boolean,note:string,
  store:Pick<Storage,'getItem'|'setItem'>):TriggerReviewRecordG4{
  const rows=readTriggerReviewsG4(workspaceId,store)
  const current=rows.find(x=>x.id===id&&x.prospectId===prospectId)
  if(!current)throw Error('Sinal não encontrado neste workspace.')
  if(decision==='approved'&&!confirmed)throw Error('Confira a fonte original antes de aprovar o acontecimento.')
  if(decision==='rejected'&&note.trim().length<3)throw Error('Informe por que o sinal foi rejeitado.')
  const row:TriggerReviewRecordG4={...current,reviewStatus:decision,
    sourceConfirmed:decision==='approved'&&confirmed,reviewerNote:asText(note,450),
    reviewedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}
  save(workspaceId,rows.map(item=>item.id===id?row:item),store)
  return row
}
export function getTriggerSourceFromProspectG4(prospect:ProspectRecord):TriggerSourceG4{
  const raw=prospect.rawData||{}
  const evidence=Array.isArray(raw.evidence)?raw.evidence:(
    Array.isArray(prospect.evidence)?prospect.evidence:[])
  let sourceUrl='',excerpt=''
  for(const candidate of evidence){
    if(!candidate||typeof candidate!=='object')continue
    const v=candidate as Record<string,unknown>
    const url=safeUrl(v.sourceUrl)||safeUrl(v.url)||safeUrl(v.source)
    const value=asText(v.quote||v.excerpt||v.value,5400)
    if(url&&value.length>=35){sourceUrl=url;excerpt=value;break}
  }
  if(!sourceUrl){
    const url=safeUrl(raw.sourceUrl)||safeUrl(raw.pageUrl)||safeUrl(raw.articleUrl)
    const content=asText(raw.sourceExcerpt||raw.pageExcerpt||raw.articleExcerpt,5400)
    if(url&&content.length>=35){sourceUrl=url;excerpt=content}
  }
  // Never combine a generic marketing description with an unrelated company website:
  // manual excerpt entry is needed when there is no attached source/evidence pair.
  return {company:prospect.company||prospect.name,city:prospect.city,
    sector:asText(raw.category||raw.segment,100),sourceUrl,excerpt}
}
