import type {Lead} from '../domain/types'
import type {Database} from '../lib/supabase.types'
import {getSupabaseClient} from '../lib/supabase'
import {effectiveDataMode} from '../lib/env'
import type {ProspectRecord} from './prospecting-workspace'
import {
  type TriggerCandidateG4,type TriggerReviewRecordG4,type TriggerSourceG4,
} from './prospecting-triggers-g4'

type EventRow=Database['public']['Tables']['prospecting_trigger_events']['Row']
const normalize=(text:string)=>text.trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR')
const allowed=(value:string,limit:number)=>value.trim().slice(0,limit)
const isHttps=(value:string)=>{
  try{
    const u=new URL(value)
    const host=u.hostname.toLowerCase()
    return u.protocol==='https:'&&host.includes('.')&&
      !host.endsWith('.local')&&!host.endsWith('.localhost')&&
      host!=='localhost'&&!/^(?:\d+\.){3}\d+$/.test(host)&&!host.includes(':')
  }catch{return false}
}
export function isTriggerCloudModeG43():boolean{return effectiveDataMode==='supabase'}
/**
 * Production G4.3 requires a verified migration and explicit release opt-in.
 * Until then hide its cloud UI and skip requests for non-existent tables.
 * Local G4 continues to work without a cloud connection or schema changes.
 */
export function allowTriggerCloudReleaseG43(
  mode:'local'|'supabase',flag:string|undefined,
):boolean{return mode==='local'||flag==='true'}
export function isTriggerCloudEnabledG43():boolean{
  return allowTriggerCloudReleaseG43(effectiveDataMode,import.meta.env.VITE_G43_CLOUD_ENABLED)
}

export function isMissingG43Migration(error:unknown):boolean{
  const e=error as {code?:string;message?:string}
  return e?.code==='42P01'||e?.code==='PGRST205'||
    Boolean(e?.message?.includes("prospecting_trigger_events")&&e.message?.includes('schema cache'))
}
const clientRequired=()=>{
  const client=getSupabaseClient()
  if(!client)throw new Error('Supabase indisponível. A autenticação do CRM é necessária para sincronizar os sinais G4.3.')
  return client
}
const failed=(error:{code?:string;message:string})=>{
  if(isMissingG43Migration(error))
    throw new Error('G4.3 ainda não está habilitado no Supabase. A migração de segurança precisa ser validada e aplicada antes de sincronizar.')
  throw new Error(error.message||'Não foi possível sincronizar os eventos-gatilho.')
}
export function mapRemoteTriggerG43(row:EventRow):TriggerReviewRecordG4{
  return {
    id:row.id,workspaceId:row.organization_id,prospectId:row.prospect_id,
    category:row.category,event:row.event_label,quote:row.source_quote,
    sourceUrl:row.source_url,sourceExcerpt:row.source_excerpt,sourceCheck:'not_verified',
    dateQuote:row.date_quote,hypothesis:row.hypothesis,rationale:row.rationale,
    suggestedQuestion:row.suggested_question,
    status:'needs_review',investigationPriority:0,
    reviewStatus:row.review_status,sourceConfirmed:row.source_confirmed,
    reviewerNote:row.reviewer_note,reviewedAt:row.reviewed_at,reviewedBy:row.reviewed_by,
    updatedAt:row.updated_at,crmLeadId:row.crm_lead_id,
  }
}
export async function readRemoteTriggerReviewsG43(
  workspaceId:string,prospectId:string
):Promise<TriggerReviewRecordG4[]>{
  if(!workspaceId||!prospectId)return []
  const client=clientRequired()
  const {data,error}=await client.from('prospecting_trigger_events').select('*')
    .eq('organization_id',workspaceId).eq('prospect_id',prospectId)
    .order('updated_at',{ascending:false}).limit(100)
  if(error)failed(error)
  return (data||[]).map(mapRemoteTriggerG43)
}
export async function appendRemoteTriggersG43(workspaceId:string,prospect:ProspectRecord,
  candidates:TriggerCandidateG4[],source:TriggerSourceG4
):Promise<TriggerReviewRecordG4[]>{
  if(!workspaceId||prospect.workspaceId!==workspaceId)throw new Error('Empresa fora do workspace atual.')
  if(!isHttps(source.sourceUrl)||source.excerpt.trim().length<35)
    throw new Error('Informe uma fonte pública HTTPS e seu trecho literal.')
  const existing=await readRemoteTriggerReviewsG43(workspaceId,prospect.id)
  const keys=new Set(existing.map(x=>normalize(x.sourceUrl)+'|'+normalize(x.quote)))
  const inserted:TriggerReviewRecordG4[]=[]
  const client=clientRequired()
  for(const event of candidates.slice(0,3)){
    if(event.status!=='needs_review'||event.sourceCheck!=='not_verified'||
      !isHttps(event.sourceUrl)||normalize(event.sourceUrl)!==normalize(source.sourceUrl)||
      !normalize(source.excerpt).includes(normalize(event.quote))||
      event.quote.trim().length<18||
      !['negative_experience','transition','new_awareness'].includes(event.category))continue
    const key=normalize(event.sourceUrl)+'|'+normalize(event.quote)
    if(keys.has(key))continue
    const {data,error}=await client.from('prospecting_trigger_events').insert({
      id:crypto.randomUUID(),organization_id:workspaceId,prospect_id:prospect.id,
      category:event.category,event_label:allowed(event.event,160),
      source_url:allowed(event.sourceUrl,500),source_excerpt:allowed(source.excerpt,5400),
      source_quote:allowed(event.quote,340),date_quote:event.dateQuote||null,
      hypothesis:allowed(event.hypothesis,420),rationale:allowed(event.rationale,420),
      suggested_question:allowed(event.suggestedQuestion,250),review_status:'needs_review',
      crm_lead_id:typeof prospect.rawData?.crmLeadId==='string'?prospect.rawData.crmLeadId:null,
    }).select('*').single()
    if(error){
      if(error.code==='23505'){keys.add(key);continue}
      failed(error)
    }
    if(data){inserted.push(mapRemoteTriggerG43(data));keys.add(key)}
  }
  return inserted
}
export async function reviewRemoteTriggerG43(
  workspaceId:string,prospectId:string,eventId:string,
  decision:'approved'|'rejected',confirmed:boolean,note:string
):Promise<TriggerReviewRecordG4>{
  if(decision==='approved'&&!confirmed)
    throw new Error('Confira publicação, trecho e empresa antes da aprovação.')
  if(decision==='rejected'&&note.trim().length<3)
    throw new Error('Informe o motivo da rejeição.')
  const client=clientRequired()
  const {data,error}=await client.from('prospecting_trigger_events')
    .update({review_status:decision,source_confirmed:decision==='approved'&&confirmed,reviewer_note:allowed(note,450)})
    .eq('id',eventId).eq('organization_id',workspaceId)
    .eq('prospect_id',prospectId).eq('review_status','needs_review').select('*').maybeSingle()
  if(error)failed(error)
  if(!data)throw new Error('Sinal já revisado ou indisponível. Atualize a lista.')
  return mapRemoteTriggerG43(data)
}
export async function linkRemoteTriggerLeadG43(
  workspaceId:string,prospectId:string,leadId:string
):Promise<number>{
  if(!workspaceId||!prospectId||!leadId)return 0
  const client=clientRequired()
  const {data,error}=await client.from('prospecting_trigger_events')
    .update({crm_lead_id:leadId}).eq('organization_id',workspaceId)
    .eq('prospect_id',prospectId).is('crm_lead_id',null).select('id')
  if(error)failed(error)
  return data?.length??0
}
export interface TriggerPipelineSignalG43 {
  id:string;leadId:string;event:string;category:TriggerReviewRecordG4['category'];
  sourceUrl:string;quote:string;hypothesis:string;reviewedAt:string|null
}
export async function loadApprovedPipelineTriggersG43(
  workspaceId:string,visibleLeads:Pick<Lead,'id'>[]
):Promise<TriggerPipelineSignalG43[]>{
  const ids=[...new Set(visibleLeads.map(x=>x.id))].slice(0,200)
  if(!workspaceId||!ids.length)return []
  const client=clientRequired()
  const {data,error}=await client.from('prospecting_trigger_events')
    .select('id,crm_lead_id,event_label,category,source_url,source_quote,hypothesis,reviewed_at')
    .eq('organization_id',workspaceId).eq('review_status','approved')
    .in('crm_lead_id',ids).order('reviewed_at',{ascending:false}).limit(200)
  if(error)failed(error)
  return (data||[]).filter(row=>Boolean(row.crm_lead_id)).map(row=>({
    id:row.id,leadId:row.crm_lead_id!,event:row.event_label,category:row.category,
    sourceUrl:row.source_url,quote:row.source_quote,hypothesis:row.hypothesis,
    reviewedAt:row.reviewed_at,
  }))
}
export function loadLocalApprovedPipelineTriggersG43(
  workspaceId:string,leads:Pick<Lead,'id'>[],prospects:ProspectRecord[],records:TriggerReviewRecordG4[]
):TriggerPipelineSignalG43[]{
  const permitted=new Set(leads.map(lead=>lead.id))
  const prospectById=new Map(prospects.map(prospect=>[prospect.id,prospect]))
  return records.filter(record=>record.workspaceId===workspaceId&&record.reviewStatus==='approved'&&record.sourceConfirmed)
    .flatMap(record=>{
      const prospect=prospectById.get(record.prospectId)
      const leadId=prospect?.rawData?.crmLeadId
      if(!prospect||prospect.workspaceId!==workspaceId||typeof leadId!=='string'||!permitted.has(leadId))return []
      return [{id:record.id,leadId,event:record.event,category:record.category,
        sourceUrl:record.sourceUrl,quote:record.quote,hypothesis:record.hypothesis,
        reviewedAt:record.reviewedAt}]
    })
}
