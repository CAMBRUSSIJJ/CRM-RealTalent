import type { ProposalLineItem, ProductRecord, TeamAccessResource, TeamApprovalKind, TeamApprovalRequest, TeamApprovalStatus } from '../domain/types'
import { createId } from '../lib/id'
import { safeStorage } from '../lib/storage'
import { getSupabaseClient } from '../lib/supabase'
import { accessCanApprove, approvalPolicyFor, type EffectiveMemberAccess } from './team-access-control'
import { proposalPricingPolicy } from './proposal-pricing'

export interface TeamSecurityAuditEvent {
  id: string
  workspaceId: string
  userId: string | null
  userName: string
  action: string
  entityType: string
  entityId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

const approvalsKey=(workspaceId:string)=>`realtalent:${workspaceId}:team-approvals:v1`
const auditKey=(workspaceId:string)=>`realtalent:${workspaceId}:team-security-audit:v1`
const now=()=>new Date().toISOString()

const readLocalApprovals=(workspaceId:string):TeamApprovalRequest[]=>{try{return JSON.parse(safeStorage.getItem(approvalsKey(workspaceId))??'[]') as TeamApprovalRequest[]}catch{return []}}
const writeLocalApprovals=(workspaceId:string,items:TeamApprovalRequest[])=>safeStorage.setItem(approvalsKey(workspaceId),JSON.stringify(items.slice(0,500)))
const readLocalAudit=(workspaceId:string):TeamSecurityAuditEvent[]=>{try{return JSON.parse(safeStorage.getItem(auditKey(workspaceId))??'[]') as TeamSecurityAuditEvent[]}catch{return []}}
const writeLocalAudit=(workspaceId:string,items:TeamSecurityAuditEvent[])=>safeStorage.setItem(auditKey(workspaceId),JSON.stringify(items.slice(0,1000)))

const mapApproval=(row:any):TeamApprovalRequest=>({id:String(row.id),workspaceId:row.organization_id,requesterId:row.requester_id??null,requesterName:row.requester_name??'',approverId:row.approver_id??null,approverName:row.approver_name??'',resource:row.resource,kind:row.kind,entityType:row.entity_type,entityId:row.entity_id??null,reason:row.reason??'',payload:row.payload??{},status:row.status,decidedAt:row.decided_at??null,createdAt:row.created_at,updatedAt:row.updated_at})

export async function recordTeamSecurityAudit(mode:'local'|'supabase',workspaceId:string,input:{userId?:string|null;userName?:string;action:string;entityType:string;entityId?:string|null;metadata?:Record<string,unknown>}):Promise<void>{
  if(mode==='local'||!getSupabaseClient()){
    const item:TeamSecurityAuditEvent={id:createId('audit'),workspaceId,userId:input.userId??null,userName:input.userName??'',action:input.action,entityType:input.entityType,entityId:input.entityId??null,metadata:input.metadata??{},createdAt:now()}
    writeLocalAudit(workspaceId,[item,...readLocalAudit(workspaceId)]);return
  }
  const result=await (getSupabaseClient() as any).rpc('rt_record_access_audit',{p_organization_id:workspaceId,p_action:input.action,p_entity_type:input.entityType,p_entity_id:input.entityId??null,p_metadata:input.metadata??{}})
  if(result.error) throw new Error(result.error.message||'Falha ao registrar auditoria de segurança.')
}

export async function listTeamSecurityAudit(mode:'local'|'supabase',workspaceId:string,limit=100):Promise<TeamSecurityAuditEvent[]>{
  if(mode==='local'||!getSupabaseClient()) return readLocalAudit(workspaceId).slice(0,limit)
  const client=getSupabaseClient() as any
  const result=await client.from('audit_logs').select('id,organization_id,user_id,action,entity_type,entity_id,after_data,created_at').eq('organization_id',workspaceId).in('action',['access_profile_saved','access_profile_assigned','access_profile_deleted','approval_requested','approval_approved','approval_rejected','sensitive_field_changed','data_exported','proposal_policy_override']).order('created_at',{ascending:false}).limit(limit)
  if(result.error) throw new Error(result.error.message||'Falha ao carregar auditoria.')
  return (result.data??[]).map((row:any)=>({id:String(row.id),workspaceId:row.organization_id,userId:row.user_id??null,userName:String(row.after_data?.actorName??''),action:row.action,entityType:row.entity_type,entityId:row.entity_id??null,metadata:row.after_data??{},createdAt:row.created_at}))
}

export async function listTeamApprovals(mode:'local'|'supabase',workspaceId:string):Promise<TeamApprovalRequest[]>{
  if(mode==='local'||!getSupabaseClient()) return readLocalApprovals(workspaceId)
  const result=await (getSupabaseClient() as any).from('access_approval_requests').select('*').eq('organization_id',workspaceId).order('created_at',{ascending:false}).limit(250)
  if(result.error) throw new Error(result.error.message||'Falha ao carregar aprovações.')
  return (result.data??[]).map(mapApproval)
}

export async function requestTeamApproval(mode:'local'|'supabase',workspaceId:string,input:{requesterId:string|null;requesterName:string;resource:TeamAccessResource;kind:TeamApprovalKind;entityType:string;entityId?:string|null;reason:string;payload?:Record<string,unknown>}):Promise<TeamApprovalRequest>{
  if(mode==='local'||!getSupabaseClient()){
    const existing=readLocalApprovals(workspaceId)
    const item:TeamApprovalRequest={id:createId('approval'),workspaceId,requesterId:input.requesterId,requesterName:input.requesterName,approverId:null,approverName:'',resource:input.resource,kind:input.kind,entityType:input.entityType,entityId:input.entityId??null,reason:input.reason,payload:input.payload??{},status:'pending',decidedAt:null,createdAt:now(),updatedAt:now()}
    writeLocalApprovals(workspaceId,[item,...existing.filter((entry)=>!(entry.status==='pending'&&entry.kind===item.kind&&entry.entityType===item.entityType&&entry.entityId===item.entityId&&entry.requesterId===item.requesterId))])
    await recordTeamSecurityAudit(mode,workspaceId,{userId:input.requesterId,userName:input.requesterName,action:'approval_requested',entityType:input.entityType,entityId:input.entityId,metadata:{resource:input.resource,kind:input.kind,reason:input.reason}})
    return item
  }
  const result=await (getSupabaseClient() as any).rpc('rt_request_access_approval',{p_organization_id:workspaceId,p_resource:input.resource,p_kind:input.kind,p_entity_type:input.entityType,p_entity_id:input.entityId??null,p_reason:input.reason,p_payload:input.payload??{}})
  if(result.error) throw new Error(result.error.message||'Falha ao solicitar aprovação.')
  const rows=await listTeamApprovals(mode,workspaceId)
  return rows.find((entry)=>String(entry.id)===String(result.data))??rows[0]
}

export async function decideTeamApproval(mode:'local'|'supabase',workspaceId:string,access:EffectiveMemberAccess|null,approvalId:string,decision:'approved'|'rejected',approverName:string):Promise<void>{
  const current=(await listTeamApprovals(mode,workspaceId)).find((entry)=>entry.id===approvalId)
  if(!current) throw new Error('Solicitação de aprovação não encontrada.')
  if(!accessCanApprove(access,current.resource)) throw new Error('Seu perfil não permite aprovar solicitações deste recurso.')
  if(mode==='local'||!getSupabaseClient()){
    const updated=readLocalApprovals(workspaceId).map((entry)=>entry.id===approvalId?{...entry,status:decision,approverId:access?.userId??null,approverName,decidedAt:now(),updatedAt:now()}:entry)
    writeLocalApprovals(workspaceId,updated)
    await recordTeamSecurityAudit(mode,workspaceId,{userId:access?.userId,userName:approverName,action:decision==='approved'?'approval_approved':'approval_rejected',entityType:current.entityType,entityId:current.entityId,metadata:{approvalId,currentStatus:current.status,resource:current.resource,kind:current.kind}})
    return
  }
  const result=await (getSupabaseClient() as any).rpc('rt_decide_access_approval',{p_approval_id:approvalId,p_decision:decision})
  if(result.error) throw new Error(result.error.message||'Falha ao decidir aprovação.')
}

export const proposalApprovalReasons=(access:EffectiveMemberAccess|null,items:ProposalLineItem[],products:ProductRecord[],totalContractValue:number):string[]=>{
  if(!access||accessCanApprove(access,'proposals')) return []
  const policy=approvalPolicyFor(access)
  const reasons:string[]=[]
  const maxDiscount=Math.max(0,...items.map((item)=>Number(item.discountPercent||0)))
  if(policy.proposalDiscountPercent!==null&&maxDiscount>policy.proposalDiscountPercent) reasons.push(`Desconto de ${maxDiscount.toFixed(1)}% acima da alçada de ${policy.proposalDiscountPercent}%.`)
  const margins=items.map((item)=>proposalPricingPolicy(item,products.find((product)=>product.id===item.productId))).filter((item)=>Number.isFinite(item.marginPercent))
  const minMargin=margins.length?Math.min(...margins.map((item)=>item.marginPercent)):100
  if(policy.proposalMinMarginPercent!==null&&minMargin<policy.proposalMinMarginPercent) reasons.push(`Margem mínima de ${minMargin.toFixed(1)}% abaixo da alçada de ${policy.proposalMinMarginPercent}%.`)
  if(policy.proposalTotalValue!==null&&totalContractValue>policy.proposalTotalValue) reasons.push(`TCV de R$ ${Math.round(totalContractValue).toLocaleString('pt-BR')} acima da alçada de R$ ${Math.round(policy.proposalTotalValue).toLocaleString('pt-BR')}.`)
  for(const item of items){const product=products.find((candidate)=>candidate.id===item.productId)??null;const guard=proposalPricingPolicy(item,product);if(guard.requiresApproval) for(const reason of guard.reasons) if(!reasons.includes(reason)) reasons.push(reason)}
  return reasons
}

export async function approvalStatusForEntity(mode:'local'|'supabase',workspaceId:string,kind:TeamApprovalKind,entityType:string,entityId:string|null):Promise<'none'|TeamApprovalStatus>{
  const matches=(await listTeamApprovals(mode,workspaceId)).filter((entry)=>entry.kind===kind&&entry.entityType===entityType&&entry.entityId===entityId)
  return matches[0]?.status??'none'
}

export async function requireExportApproval(mode:'local'|'supabase',workspaceId:string,access:EffectiveMemberAccess|null,input:{userName:string;resource:TeamAccessResource;entityType:string;count:number}):Promise<boolean>{
  const policy=approvalPolicyFor(access)
  if(accessCanApprove(access,input.resource)||!policy.exportRequiresApproval){await recordTeamSecurityAudit(mode,workspaceId,{userId:access?.userId,userName:input.userName,action:'data_exported',entityType:input.entityType,metadata:{resource:input.resource,count:input.count}});return true}
  const approvals=(await listTeamApprovals(mode,workspaceId)).filter((entry)=>entry.kind==='data_export'&&entry.resource===input.resource&&entry.entityType===input.entityType&&entry.requesterId===(access?.userId??null))
  const approved=approvals.find((entry)=>entry.status==='approved')
  if(approved){
    if(mode==='local'||!getSupabaseClient()) writeLocalApprovals(workspaceId,readLocalApprovals(workspaceId).map((entry)=>entry.id===approved.id?{...entry,status:'cancelled',updatedAt:now()}:entry))
    else { const consumed=await (getSupabaseClient() as any).rpc('rt_consume_access_approval',{p_approval_id:approved.id}); if(consumed.error) throw new Error(consumed.error.message||'Falha ao consumir a aprovação de exportação.') }
    await recordTeamSecurityAudit(mode,workspaceId,{userId:access?.userId,userName:input.userName,action:'data_exported',entityType:input.entityType,metadata:{resource:input.resource,count:input.count,approvalId:approved.id}});return true
  }
  if(!approvals.some((entry)=>entry.status==='pending')) await requestTeamApproval(mode,workspaceId,{requesterId:access?.userId??null,requesterName:input.userName,resource:input.resource,kind:'data_export',entityType:input.entityType,entityId:null,reason:`Exportação de ${input.count} registro(s) requer aprovação do gestor.`,payload:{count:input.count}})
  return false
}
