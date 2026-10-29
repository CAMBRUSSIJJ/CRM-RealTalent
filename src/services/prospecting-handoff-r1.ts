import type {ProspectRecord} from './prospecting-workspace'
import {prospectDataQuality} from './prospecting-data-layer'

export interface ProspectingHandoffMetrics{
  collected:number
  toReview:number
  approved:number
  transferable:number
  blocked:number
  sent:number
  transferredCompanies:number
  linkedOpportunities:number
}
export interface ProspectingHandoffReceipt{
  id:string
  company:string
  prospectId:string
  status:'transferred'|'skipped'|'failed'
  crmCompanyId?:string
  crmContactId?:string
  crmLeadId?:string
  note:string
}
export interface ProspectingBatchReceipt{
  id:string
  createdAt:string
  rows:ProspectingHandoffReceipt[]
  activityWarnings:number
}
export function isProspectTransferable(prospect:ProspectRecord):boolean{
  return prospect.status==='approved' &&
    prospectDataQuality(prospect).readiness!=='blocked' &&
    prospect.duplicateLevel!=='confirmed'
}
export function transferableProspectIds(prospects:ProspectRecord[]):string[]{
  return prospects.filter(isProspectTransferable).map(row=>row.id)
}
/** Counters are derived from actual persisted prospect records rather than
 * assuming that an AI proposal or a requested target means completed work. */
export function buildProspectingHandoffMetrics(prospects:ProspectRecord[]):ProspectingHandoffMetrics{
  const active=prospects.filter(p=>p.status!=='discarded'&&p.status!=='sent')
  const sent=prospects.filter(p=>p.status==='sent')
  return {
    collected:prospects.length,
    toReview:active.filter(p=>p.status!=='approved').length,
    approved:active.filter(p=>p.status==='approved').length,
    transferable:active.filter(isProspectTransferable).length,
    blocked:active.filter(p=>p.status==='approved'&&!isProspectTransferable(p)).length,
    sent:sent.length,
    transferredCompanies:sent.filter(p=>typeof p.rawData.crmCompanyId==='string'&&p.rawData.crmCompanyId).length,
    linkedOpportunities:sent.filter(p=>typeof p.rawData.crmLeadId==='string'&&p.rawData.crmLeadId).length,
  }
}
export function linkedCrmLeadId(prospect:ProspectRecord,leadIds:Set<string>):string|null{
  const id=prospect.rawData.crmLeadId
  return typeof id==='string'&&leadIds.has(id)?id:null
}
export function linkedCrmCompanyId(prospect:ProspectRecord,companyIds:Set<string>):string|null{
  const id=prospect.rawData.crmCompanyId
  return typeof id==='string'&&companyIds.has(id)?id:null
}
export function summarizeHandoffReceipt(receipt:ProspectingBatchReceipt){
  const transferred=receipt.rows.filter(row=>row.status==='transferred').length
  const skipped=receipt.rows.filter(row=>row.status==='skipped').length
  const failed=receipt.rows.filter(row=>row.status==='failed').length
  const opportunities=receipt.rows.filter(row=>row.status==='transferred'&&row.crmLeadId).length
  return {transferred,skipped,failed,opportunities}
}
