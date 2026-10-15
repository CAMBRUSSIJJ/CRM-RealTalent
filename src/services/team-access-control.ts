import type {
  MemberAccessAssignment, TeamAccessAction, TeamAccessProfile, TeamAccessResource, TeamAccessRule,
  TeamAccessScope, TeamApprovalPolicy, TeamFieldAccessLevel, TeamMembership, TeamSensitiveField, WorkspaceRole,
} from '../domain/types'
import { createId } from '../lib/id'
import { safeStorage } from '../lib/storage'
import { getSupabaseClient } from '../lib/supabase'

export interface TeamAccessSnapshot {
  profiles: TeamAccessProfile[]
  assignments: MemberAccessAssignment[]
}

export interface EffectiveMemberAccess {
  workspaceId: string
  userId: string | null
  role: WorkspaceRole
  profile: TeamAccessProfile
  teamIds: string[]
  peerUserIds: string[]
}

const resources: TeamAccessResource[] = ['contacts','pipeline','tasks','communications','proposals','prospecting','goals','settings']
const actions: TeamAccessAction[] = ['view','create','edit','delete','export','assign','approve']
const timestamp = () => new Date().toISOString()

const sensitiveFields: TeamSensitiveField[] = ['contact_phone','contact_email','deal_value','proposal_discount','proposal_margin','proposal_cost','proposal_total','revenue_amount']
const fullFieldAccess = ():Record<TeamSensitiveField,TeamFieldAccessLevel> => Object.fromEntries(sensitiveFields.map((field)=>[field,'edit'])) as Record<TeamSensitiveField,TeamFieldAccessLevel>
const fieldDefaults = (systemKey:TeamAccessProfile['systemKey']):Record<TeamSensitiveField,TeamFieldAccessLevel> => {
  const fields=fullFieldAccess()
  if(systemKey==='administrator'||systemKey==='manager') return fields
  if(systemKey==='seller') return {...fields, proposal_margin:'view', proposal_cost:'hidden', proposal_total:'view', revenue_amount:'view'}
  if(systemKey==='sdr') return {...fields, deal_value:'view', proposal_discount:'hidden', proposal_margin:'hidden', proposal_cost:'hidden', proposal_total:'hidden', revenue_amount:'hidden'}
  if(systemKey==='viewer') return {...fields, contact_phone:'view', contact_email:'view', deal_value:'view', proposal_discount:'hidden', proposal_margin:'hidden', proposal_cost:'hidden', proposal_total:'view', revenue_amount:'view'}
  return {...fields, proposal_margin:'view', proposal_cost:'hidden', proposal_total:'view', revenue_amount:'view'}
}
const approvalDefaults = (systemKey:TeamAccessProfile['systemKey']):TeamApprovalPolicy => {
  if(systemKey==='administrator'||systemKey==='manager') return {proposalDiscountPercent:null,proposalMinMarginPercent:null,proposalTotalValue:null,exportRequiresApproval:false}
  if(systemKey==='seller') return {proposalDiscountPercent:15,proposalMinMarginPercent:20,proposalTotalValue:50000,exportRequiresApproval:true}
  if(systemKey==='sdr') return {proposalDiscountPercent:5,proposalMinMarginPercent:25,proposalTotalValue:10000,exportRequiresApproval:true}
  if(systemKey==='viewer') return {proposalDiscountPercent:0,proposalMinMarginPercent:100,proposalTotalValue:0,exportRequiresApproval:true}
  return {proposalDiscountPercent:15,proposalMinMarginPercent:20,proposalTotalValue:50000,exportRequiresApproval:true}
}
const normalizeFieldAccess=(value:Partial<Record<TeamSensitiveField,TeamFieldAccessLevel>>|null|undefined,systemKey:TeamAccessProfile['systemKey'])=>{
  const defaults=fieldDefaults(systemKey)
  return Object.fromEntries(sensitiveFields.map((field)=>[field, value?.[field] && ['hidden','view','edit'].includes(value[field] as string) ? value[field] : defaults[field]])) as Record<TeamSensitiveField,TeamFieldAccessLevel>
}
const normalizeApprovalPolicy=(value:Partial<TeamApprovalPolicy>|null|undefined,systemKey:TeamAccessProfile['systemKey']):TeamApprovalPolicy=>{
  const defaults=approvalDefaults(systemKey)
  const numberOrNull=(candidate:unknown,fallback:number|null)=>candidate===null?null:Number.isFinite(Number(candidate))?Number(candidate):fallback
  return {proposalDiscountPercent:numberOrNull(value?.proposalDiscountPercent,defaults.proposalDiscountPercent),proposalMinMarginPercent:numberOrNull(value?.proposalMinMarginPercent,defaults.proposalMinMarginPercent),proposalTotalValue:numberOrNull(value?.proposalTotalValue,defaults.proposalTotalValue),exportRequiresApproval:Boolean(value?.exportRequiresApproval ?? defaults.exportRequiresApproval)}
}
const storageKey = (workspaceId: string) => `realtalent:${workspaceId}:team-access:v1`

const rule = (resource: TeamAccessResource, scope: TeamAccessScope, allowed: TeamAccessAction[]): TeamAccessRule => ({ resource, scope, actions: allowed })
const operational = (scope: TeamAccessScope, allowed: TeamAccessAction[]): TeamAccessRule[] => [
  rule('contacts',scope,allowed), rule('pipeline',scope,allowed), rule('tasks',scope,allowed), rule('communications',scope,allowed),
  rule('proposals',scope,allowed), rule('prospecting',scope,allowed), rule('goals',scope,allowed),
]

export const defaultAccessProfiles = (workspaceId: string): TeamAccessProfile[] => {
  const now = timestamp()
  const full = [...actions]
  const commonWrite: TeamAccessAction[] = ['view','create','edit','assign','approve']
  const sellerWrite: TeamAccessAction[] = ['view','create','edit']
  return [
    { id:'system-administrator', workspaceId, name:'Administrador', description:'Controle total do workspace, equipes, dados e configurações.', systemKey:'administrator', isSystem:true, rules:[...resources.map((resource)=>rule(resource,'all',full))], fieldAccess:fieldDefaults('administrator'), approvalPolicy:approvalDefaults('administrator'), createdAt:now, updatedAt:now },
    { id:'system-manager', workspaceId, name:'Gestor', description:'Opera e acompanha todos os registros das equipes das quais participa.', systemKey:'manager', isSystem:true, rules:[...operational('team',commonWrite), rule('settings','team',['view'])], fieldAccess:fieldDefaults('manager'), approvalPolicy:approvalDefaults('manager'), createdAt:now, updatedAt:now },
    { id:'system-seller', workspaceId, name:'Vendedor', description:'Trabalha a própria carteira, tarefas, conversas e propostas.', systemKey:'seller', isSystem:true, rules:[...operational('own',sellerWrite), rule('prospecting','team',['view','create','edit']), rule('settings','none',[])], fieldAccess:fieldDefaults('seller'), approvalPolicy:approvalDefaults('seller'), createdAt:now, updatedAt:now },
    { id:'system-sdr', workspaceId, name:'SDR', description:'Prospecção e qualificação com acesso restrito à própria carteira.', systemKey:'sdr', isSystem:true, rules:[rule('contacts','own',sellerWrite),rule('pipeline','own',['view','create','edit']),rule('tasks','own',sellerWrite),rule('communications','own',sellerWrite),rule('prospecting','team',['view','create','edit']),rule('proposals','none',[]),rule('goals','own',['view']),rule('settings','none',[])], fieldAccess:fieldDefaults('sdr'), approvalPolicy:approvalDefaults('sdr'), createdAt:now, updatedAt:now },
    { id:'system-viewer', workspaceId, name:'Somente leitura', description:'Consulta os registros permitidos sem criar, editar, excluir ou exportar.', systemKey:'viewer', isSystem:true, rules:[...resources.map((resource)=>rule(resource, resource==='settings'?'none':'team',['view']))], fieldAccess:fieldDefaults('viewer'), approvalPolicy:approvalDefaults('viewer'), createdAt:now, updatedAt:now },
  ]
}

const normalizeProfile = (profile: Partial<TeamAccessProfile>, workspaceId: string): TeamAccessProfile => {
  const defaults = defaultAccessProfiles(workspaceId).find((item)=>item.id===profile.id)
  const now = timestamp()
  return {
    id: String(profile.id ?? createId('access-profile')),
    workspaceId,
    name: String(profile.name ?? defaults?.name ?? 'Perfil personalizado'),
    description: String(profile.description ?? defaults?.description ?? ''),
    systemKey: profile.systemKey ?? defaults?.systemKey ?? null,
    isSystem: Boolean(profile.isSystem ?? defaults?.isSystem),
    rules: resources.map((resource)=>{
      const source = profile.rules?.find((item)=>item.resource===resource) ?? defaults?.rules.find((item)=>item.resource===resource)
      return rule(resource, source?.scope ?? 'none', (source?.actions ?? []).filter((action): action is TeamAccessAction => actions.includes(action as TeamAccessAction)))
    }),
    fieldAccess: normalizeFieldAccess(profile.fieldAccess, profile.systemKey ?? defaults?.systemKey ?? null),
    approvalPolicy: normalizeApprovalPolicy(profile.approvalPolicy, profile.systemKey ?? defaults?.systemKey ?? null),
    createdAt: String(profile.createdAt ?? now), updatedAt: String(profile.updatedAt ?? now),
  }
}

const readLocal = (workspaceId: string): TeamAccessSnapshot => {
  const defaults = defaultAccessProfiles(workspaceId)
  const raw = safeStorage.getItem(storageKey(workspaceId))
  if (!raw) return { profiles: defaults, assignments: [] }
  try {
    const parsed = JSON.parse(raw) as Partial<TeamAccessSnapshot>
    const custom = (parsed.profiles ?? []).filter((item)=>!item.isSystem).map((item)=>normalizeProfile(item,workspaceId))
    return { profiles:[...defaults,...custom], assignments:Array.isArray(parsed.assignments)?parsed.assignments:[] }
  } catch { return { profiles:defaults, assignments:[] } }
}

const writeLocal = (workspaceId: string, snapshot: TeamAccessSnapshot) => safeStorage.setItem(storageKey(workspaceId), JSON.stringify({ profiles:snapshot.profiles.filter((item)=>!item.isSystem), assignments:snapshot.assignments }))

const mapProfile = (row: any, workspaceId: string): TeamAccessProfile => normalizeProfile({
  id:row.profile_key, workspaceId, name:row.name, description:row.description ?? '', systemKey:row.system_key ?? null,
  isSystem:Boolean(row.is_system), rules:Array.isArray(row.rules)?row.rules:row.rules ?? [], fieldAccess:row.field_access ?? undefined, approvalPolicy:row.approval_policy ?? undefined, createdAt:row.created_at, updatedAt:row.updated_at,
},workspaceId)
const mapAssignment = (row:any): MemberAccessAssignment => ({ workspaceId:row.organization_id, userId:row.user_id, profileId:row.profile_key, updatedAt:row.updated_at })

export async function loadTeamAccessControl(mode:'local'|'supabase', workspaceId:string): Promise<TeamAccessSnapshot> {
  if (mode==='local') return readLocal(workspaceId)
  const client=getSupabaseClient() as any
  if(!client) return readLocal(workspaceId)
  const [profiles,assignments]=await Promise.all([
    client.from('access_profiles').select('*').eq('organization_id',workspaceId).order('is_system',{ascending:false}).order('name'),
    client.from('member_access_profiles').select('*').eq('organization_id',workspaceId),
  ])
  if(profiles.error) throw new Error(profiles.error.message || 'Falha ao carregar perfis de acesso.')
  if(assignments.error) throw new Error(assignments.error.message || 'Falha ao carregar perfis dos membros.')
  const loaded=(profiles.data??[]).map((row:any)=>mapProfile(row,workspaceId))
  const defaults=defaultAccessProfiles(workspaceId)
  const byId=new Map(loaded.map((item)=>[item.id,item]))
  return { profiles:[...defaults.filter((item)=>!byId.has(item.id)),...loaded], assignments:(assignments.data??[]).map(mapAssignment) }
}

export async function saveAccessProfile(mode:'local'|'supabase', workspaceId:string, input:Pick<TeamAccessProfile,'name'|'description'|'rules'|'fieldAccess'|'approvalPolicy'> & {id?:string}): Promise<TeamAccessProfile> {
  const current=await loadTeamAccessControl(mode,workspaceId)
  const existing=input.id ? current.profiles.find((item)=>item.id===input.id) : null
  if(existing?.isSystem) throw new Error('Perfis padrão não podem ser alterados. Duplique o perfil para personalizar.')
  const profile=normalizeProfile({ id:input.id ?? createId('profile'), name:input.name.trim(), description:input.description.trim(), rules:input.rules, fieldAccess:input.fieldAccess, approvalPolicy:input.approvalPolicy, isSystem:false, systemKey:null, createdAt:existing?.createdAt, updatedAt:timestamp() },workspaceId)
  if(profile.name.length<2) throw new Error('Informe o nome do perfil.')
  if(mode==='local' || !getSupabaseClient()) {
    const next={ ...current, profiles:[...current.profiles.filter((item)=>item.id!==profile.id),profile] }
    writeLocal(workspaceId,next); return profile
  }
  const client=getSupabaseClient() as any
  const result=await client.from('access_profiles').upsert({ organization_id:workspaceId, profile_key:profile.id, name:profile.name, description:profile.description, system_key:null, is_system:false, rules:profile.rules, field_access:profile.fieldAccess, approval_policy:profile.approvalPolicy, updated_at:profile.updatedAt }).select('*').single()
  if(result.error) throw new Error(result.error.message || 'Falha ao salvar o perfil de acesso.')
  return mapProfile(result.data,workspaceId)
}

export async function deleteAccessProfile(mode:'local'|'supabase', workspaceId:string, profileId:string): Promise<void> {
  const current=await loadTeamAccessControl(mode,workspaceId)
  const profile=current.profiles.find((item)=>item.id===profileId)
  if(!profile || profile.isSystem) throw new Error('Perfis padrão não podem ser excluídos.')
  if(current.assignments.some((item)=>item.profileId===profileId)) throw new Error('Este perfil ainda está atribuído a membros.')
  if(mode==='local' || !getSupabaseClient()) { writeLocal(workspaceId,{ profiles:current.profiles.filter((item)=>item.id!==profileId), assignments:current.assignments }); return }
  const result=await (getSupabaseClient() as any).from('access_profiles').delete().eq('organization_id',workspaceId).eq('profile_key',profileId)
  if(result.error) throw new Error(result.error.message || 'Falha ao excluir o perfil de acesso.')
}

export async function assignMemberAccessProfile(mode:'local'|'supabase', workspaceId:string, userId:string, profileId:string): Promise<void> {
  const current=await loadTeamAccessControl(mode,workspaceId)
  if(!current.profiles.some((item)=>item.id===profileId)) throw new Error('Perfil de acesso inexistente.')
  const assignment:MemberAccessAssignment={workspaceId,userId,profileId,updatedAt:timestamp()}
  if(mode==='local' || !getSupabaseClient()) {
    writeLocal(workspaceId,{...current,assignments:[...current.assignments.filter((item)=>item.userId!==userId),assignment]});
  } else {
    const result=await (getSupabaseClient() as any).from('member_access_profiles').upsert({organization_id:workspaceId,user_id:userId,profile_key:profileId,updated_at:assignment.updatedAt})
    if(result.error) throw new Error(result.error.message || 'Falha ao atribuir o perfil de acesso.')
  }
  if(typeof window!=='undefined') window.dispatchEvent(new CustomEvent('realtalent:team-access-changed',{detail:{workspaceId,userId}}))
}

export const defaultProfileIdFor = (role:WorkspaceRole, userId:string|null, memberships:TeamMembership[]) => {
  if(role==='owner'||role==='admin') return 'system-administrator'
  if(role==='viewer') return 'system-viewer'
  if(userId && memberships.some((item)=>item.userId===userId && item.role==='leader')) return 'system-manager'
  return 'system-seller'
}

export function resolveMemberAccess(workspaceId:string, userId:string|null, role:WorkspaceRole, snapshot:TeamAccessSnapshot, memberships:TeamMembership[]): EffectiveMemberAccess {
  const assignment=snapshot.assignments.find((item)=>item.userId===userId)
  const profileId=assignment?.profileId ?? defaultProfileIdFor(role,userId,memberships)
  const profile=snapshot.profiles.find((item)=>item.id===profileId) ?? defaultAccessProfiles(workspaceId).find((item)=>item.id===defaultProfileIdFor(role,userId,memberships))!
  const teamIds=userId ? memberships.filter((item)=>item.userId===userId).map((item)=>item.teamId) : []
  const peerUserIds=Array.from(new Set(memberships.filter((item)=>teamIds.includes(item.teamId)).map((item)=>item.userId)))
  return {workspaceId,userId,role,profile,teamIds,peerUserIds}
}

export const accessRuleFor = (access:EffectiveMemberAccess|null, resource:TeamAccessResource):TeamAccessRule => {
  if(!access) return rule(resource,'none',[])
  if(access.role==='owner'||access.role==='admin') return rule(resource,'all',[...actions])
  return access.profile.rules.find((item)=>item.resource===resource) ?? rule(resource,'none',[])
}

export const accessActionAllowed = (access:EffectiveMemberAccess|null, action:TeamAccessAction, resource:TeamAccessResource) => accessRuleFor(access,resource).actions.includes(action)
export const accessScopeFor = (access:EffectiveMemberAccess|null, resource:TeamAccessResource) => accessRuleFor(access,resource).scope

export const accessRecordAllowed = (access:EffectiveMemberAccess|null, resource:TeamAccessResource, ownerId:string|null|undefined, teamId?:string|null) => {
  const scope=accessScopeFor(access,resource)
  if(scope==='all') return true
  if(scope==='none'||!access?.userId) return false
  if(ownerId===access.userId) return true
  if(scope==='own') return false
  if(teamId && access.teamIds.includes(teamId)) return true
  return Boolean(ownerId && access.peerUserIds.includes(ownerId))
}

export const assertAccess = (access:EffectiveMemberAccess|null, action:TeamAccessAction, resource:TeamAccessResource, ownerId?:string|null, teamId?:string|null) => {
  if(!accessActionAllowed(access,action,resource)) throw new Error(`Permissão negada: o perfil não permite ${action} em ${resource}.`)
  if(ownerId!==undefined && !accessRecordAllowed(access,resource,ownerId,teamId)) throw new Error('Permissão negada: este registro está fora do seu escopo de visibilidade.')
}


export const sensitiveFieldLabels:Record<TeamSensitiveField,string>={contact_phone:'Telefone',contact_email:'E-mail',deal_value:'Valor da oportunidade',proposal_discount:'Desconto da proposta',proposal_margin:'Margem comercial',proposal_cost:'Custo interno',proposal_total:'Total/TCV da proposta',revenue_amount:'Receita'}
export const fieldAccessLabels:Record<TeamFieldAccessLevel,string>={hidden:'Oculto',view:'Somente leitura',edit:'Ver e editar'}
export const fieldAccessLevelFor=(access:EffectiveMemberAccess|null,field:TeamSensitiveField):TeamFieldAccessLevel=>{
  if(!access) return 'hidden'
  if(access.role==='owner'||access.role==='admin') return 'edit'
  return access.profile.fieldAccess?.[field] ?? 'hidden'
}
export const canViewSensitiveField=(access:EffectiveMemberAccess|null,field:TeamSensitiveField)=>fieldAccessLevelFor(access,field)!=='hidden'
export const canEditSensitiveField=(access:EffectiveMemberAccess|null,field:TeamSensitiveField)=>fieldAccessLevelFor(access,field)==='edit'
export const assertSensitiveField=(access:EffectiveMemberAccess|null,field:TeamSensitiveField,mode:'view'|'edit'='view')=>{
  const level=fieldAccessLevelFor(access,field)
  if(level==='hidden'||(mode==='edit'&&level!=='edit')) throw new Error(`Permissão negada: o perfil não permite ${mode==='edit'?'alterar':'visualizar'} ${sensitiveFieldLabels[field].toLowerCase()}.`)
}
export const approvalPolicyFor=(access:EffectiveMemberAccess|null):TeamApprovalPolicy=>access?.role==='owner'||access?.role==='admin'?approvalDefaults('administrator'):access?.profile.approvalPolicy ?? approvalDefaults(null)
export const accessCanApprove=(access:EffectiveMemberAccess|null,resource:TeamAccessResource)=>accessActionAllowed(access,'approve',resource)

export const accessResourceLabels:Record<TeamAccessResource,string>={ contacts:'Contatos',pipeline:'Pipeline',tasks:'Tarefas',communications:'Comunicações',proposals:'Propostas',prospecting:'Garimpo',goals:'Metas',settings:'Configurações' }
export const accessActionLabels:Record<TeamAccessAction,string>={ view:'Ver',create:'Criar',edit:'Editar',delete:'Excluir',export:'Exportar',assign:'Atribuir',approve:'Aprovar' }
export const accessScopeLabels:Record<TeamAccessScope,string>={ none:'Sem acesso',own:'Somente próprios',team:'Minha equipe',all:'Todo o workspace' }
