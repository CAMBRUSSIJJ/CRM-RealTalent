import { env,effectiveDataMode } from '../lib/env'
import { createUuid } from '../lib/id'
import { getSupabaseClient } from '../lib/supabase'
import { safeStorage } from '../lib/storage'
import { commandForJob, extensionLifecycle, providerExtensionId, providerManifest, type OAuthExtensionProviderId } from '../platform/extensions'
import type { Database, Json } from '../lib/supabase.types'
import { beginGatewayOAuth, gatewayAccountAction, loadCommunicationsGatewayHealth, loadGatewayAccounts, syncGatewayCommunications, testGatewayAccount } from './local-communications-gateway'
import {offlineIntegrationAccountView} from '../lib/integration-availability-s34'

// Never route a deliberately local workspace to Supabase merely because
// credentials happen to remain in an .env file from another installation.
const integrationClient=()=>effectiveDataMode==='local'?null:getSupabaseClient()

export type OAuthProvider = OAuthExtensionProviderId
export type ConnectedAccountStatus = 'demo' | 'connected' | 'attention' | 'expired' | 'paused' | 'revoked' | 'error'
export type IntegrationAccountAccessMode = 'personal' | 'shared' | 'organization' | 'restricted'
export type IntegrationConnectionMode = 'live' | 'demo'
export type DiagnosticStatus = 'pass' | 'warn' | 'fail'
export type SyncJobStatus = 'queued' | 'processing' | 'retry' | 'succeeded' | 'failed' | 'dead_letter' | 'cancelled'
export type SyncAttemptStatus = 'succeeded' | 'failed' | 'retry_scheduled'
export type ExtensionProductKey = 'realtalent_capture' | 'realtalent_social' | 'realtalent_linkedin_assistant' | 'realtalent_maps_capture'
export type ExtensionInstallationStatus = 'connected' | 'paused' | 'revoked' | 'error' | 'outdated'
export type ExtensionCaptureJobStatus = 'captured' | 'queued' | 'processing' | 'review' | 'duplicate' | 'approved' | 'sent' | 'discarded' | 'retry' | 'failed' | 'dead_letter' | 'cancelled'
export type ExtensionEventStatus = 'processed' | 'attention' | 'failed' | 'skipped'

export interface ConnectedAccount {
  id: string; workspaceId: string; provider: OAuthProvider; externalAccountId: string; displayName: string
  status: ConnectedAccountStatus; scopes: string[]; hasCredential: boolean; tokenExpiresAt: string | null
  lastSyncAt: string | null; nextSyncAt: string | null; syncCursor: string | null; lastError: string | null
  ownerUserId: string | null; accessMode: IntegrationAccountAccessMode; allowedUserIds: string[]; allowedRoles: string[]
  capabilities: Record<string, boolean>; connectionMode: IntegrationConnectionMode; credentialVersion: number
  tokenRefreshedAt: string | null; revokedAt: string | null; lastTestedAt: string | null
  lastTestStatus: DiagnosticStatus | null; lastTestLatencyMs: number | null; metadata: Record<string, unknown>
  createdAt: string; updatedAt: string
}
export interface IntegrationSyncJob {
  id: string; workspaceId: string; accountId: string | null; provider: OAuthProvider; jobType: string; workerKey: string | null
  status: SyncJobStatus; priority: number; attempts: number; maxAttempts: number; availableAt: string; lockedAt: string | null
  lockedBy: string | null; leaseExpiresAt: string | null; recoveredCount: number; completedAt: string | null
  idempotencyKey: string; payload: Record<string, unknown>; lastError: string | null; createdAt: string; updatedAt: string
}
export interface IntegrationSyncAttempt { id: string; workspaceId: string; jobId: string; attemptNumber: number; status: SyncAttemptStatus; responseCode: number | null; durationMs: number | null; errorMessage: string | null; createdAt: string }
export interface IntegrationDiagnostic { id: string; workspaceId: string; accountId: string | null; provider: OAuthProvider | 'extension' | 'framework'; runId: string; checkKey: string; status: DiagnosticStatus; message: string; latencyMs: number | null; details: Record<string, unknown>; createdAt: string }
export interface IntegrationAuditEvent { id: string; workspaceId: string; accountId: string | null; provider: string; eventType: string; severity: 'info'|'warning'|'error'|'security'; actorUserId: string | null; correlationId: string | null; message: string; metadata: Record<string, unknown>; createdAt: string }
export interface ExtensionInstallation { id:string; workspaceId:string; userId:string|null; productKey:ExtensionProductKey; installationKey:string; displayName:string; browser:string; browserVersion:string; platform:string; appVersion:string; manifestVersion:number; status:ExtensionInstallationStatus; permissions:string[]; capabilities:string[]; lastSeenAt:string; lastSyncAt:string|null; pendingItems:number; capturedToday:number; totalCaptured:number; lastError:string|null; metadata:Record<string,unknown>; createdAt:string; updatedAt:string }
export interface ExtensionProductSettings { workspaceId:string; productKey:ExtensionProductKey; enabled:boolean; destination:'garimpo'|'crm'; requireConfirmation:boolean; duplicatePolicy:'skip'|'update'|'create'; minimumVersion:string; recommendedVersion:string; maxBatchSize:number; processIntervalMs:number; closeTabAfterAnalysis:boolean; allowedSources:string[]; settings:Record<string,unknown>; configVersion:number; updatedBy:string|null; updatedAt:string }
export interface ExtensionCaptureJob { id:string; workspaceId:string; installationId:string|null; userId:string|null; productKey:ExtensionProductKey; source:string; sourceUrl:string|null; externalId:string|null; status:ExtensionCaptureJobStatus; attempts:number; maxAttempts:number; availableAt:string; idempotencyKey:string; itemCount:number; payload:Record<string,unknown>; result:Record<string,unknown>; lastError:string|null; startedAt:string|null; completedAt:string|null; createdAt:string; updatedAt:string }
export interface ExtensionEvent { id:string; workspaceId:string; installationId:string|null; jobId:string|null; eventType:string; status:ExtensionEventStatus; correlationId:string|null; payload:Record<string,unknown>; createdAt:string }
export interface IntegrationFrameworkState { accounts:ConnectedAccount[]; jobs:IntegrationSyncJob[]; attempts:IntegrationSyncAttempt[]; diagnostics:IntegrationDiagnostic[]; auditEvents:IntegrationAuditEvent[]; extensions:ExtensionInstallation[]; extensionSettings:ExtensionProductSettings[]; extensionJobs:ExtensionCaptureJob[]; extensionEvents:ExtensionEvent[] }

const STORAGE_PREFIX='realtalent-v10045-integrations:'
const now=()=>new Date().toISOString()
const key=(workspaceId:string)=>`${STORAGE_PREFIX}${workspaceId}`
const objectValue=(value:Json|unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
const booleanMap=(value:Json|unknown):Record<string,boolean>=>Object.fromEntries(Object.entries(objectValue(value)).map(([k,v])=>[k,Boolean(v)]))

export const providerLabel=(provider:OAuthProvider)=>providerManifest(provider).label
export const extensionProductLabel=(product:ExtensionProductKey)=>({realtalent_capture:'RealTalent Capture',realtalent_social:'RealTalent Social',realtalent_linkedin_assistant:'Assistente LinkedIn',realtalent_maps_capture:'Captura Google Maps'}[product])
export const defaultScopes=(provider:OAuthProvider)=>providerManifest(provider).scopes.map((scope)=>scope.id)
export const providerCapabilities=(provider:OAuthProvider):Record<string,string>=>Object.fromEntries(providerManifest(provider).capabilities.map((capability)=>[capability.id,capability.label]))
export const allowedJobTypesForProvider=(provider:OAuthProvider)=>providerManifest(provider).jobs.map((job)=>job.id)
export const defaultJobTypeForProvider=(provider:OAuthProvider)=>providerManifest(provider).jobs.find((job)=>job.default)?.id??providerManifest(provider).jobs[0]?.id??'account_health_check'

export const defaultExtensionProductSettings=(workspaceId:string,productKey:ExtensionProductKey='realtalent_capture'):ExtensionProductSettings=>({workspaceId,productKey,enabled:true,destination:'garimpo',requireConfirmation:true,duplicatePolicy:'skip',minimumVersion:'',recommendedVersion:'',maxBatchSize:50,processIntervalMs:1200,closeTabAfterAnalysis:true,allowedSources:['google_maps','google_search','instagram','cnpj'],settings:{},configVersion:1,updatedBy:null,updatedAt:now()})
const blank=():IntegrationFrameworkState=>({accounts:[],jobs:[],attempts:[],diagnostics:[],auditEvents:[],extensions:[],extensionSettings:[],extensionJobs:[],extensionEvents:[]})
const normalizeAccount=(item:Partial<ConnectedAccount>&Pick<ConnectedAccount,'id'|'workspaceId'|'provider'|'externalAccountId'|'displayName'>):ConnectedAccount=>({
  status:item.connectionMode==='demo'?'demo':item.status||'attention',scopes:item.scopes||[],hasCredential:Boolean(item.hasCredential),tokenExpiresAt:item.tokenExpiresAt||null,lastSyncAt:item.lastSyncAt||null,nextSyncAt:item.nextSyncAt||null,syncCursor:item.syncCursor||null,lastError:item.lastError||null,
  ownerUserId:item.ownerUserId||null,accessMode:item.accessMode||'personal',allowedUserIds:item.allowedUserIds||[],allowedRoles:item.allowedRoles||[],capabilities:item.capabilities||Object.fromEntries(Object.keys(providerCapabilities(item.provider)).map(k=>[k,true])),connectionMode:item.connectionMode||'live',credentialVersion:item.credentialVersion||1,tokenRefreshedAt:item.tokenRefreshedAt||null,revokedAt:item.revokedAt||null,lastTestedAt:item.lastTestedAt||null,lastTestStatus:item.lastTestStatus||null,lastTestLatencyMs:item.lastTestLatencyMs??null,metadata:item.metadata||{},createdAt:item.createdAt||now(),updatedAt:item.updatedAt||now(),
  id:item.id,workspaceId:item.workspaceId,provider:item.provider,externalAccountId:item.externalAccountId,displayName:item.displayName,
})
const readLocal=(workspaceId:string):IntegrationFrameworkState=>{const raw=safeStorage.getItem(key(workspaceId));if(!raw)return blank();try{const value=JSON.parse(raw) as Partial<IntegrationFrameworkState>;return{accounts:Array.isArray(value.accounts)?value.accounts.map(item=>normalizeAccount(item)):[],jobs:Array.isArray(value.jobs)?value.jobs.slice(0,250):[],attempts:Array.isArray(value.attempts)?value.attempts.slice(0,500):[],diagnostics:Array.isArray(value.diagnostics)?value.diagnostics.slice(0,500):[],auditEvents:Array.isArray(value.auditEvents)?value.auditEvents.slice(0,500):[],extensions:Array.isArray(value.extensions)?value.extensions:[],extensionSettings:Array.isArray(value.extensionSettings)?value.extensionSettings:[],extensionJobs:Array.isArray(value.extensionJobs)?value.extensionJobs.slice(0,300):[],extensionEvents:Array.isArray(value.extensionEvents)?value.extensionEvents.slice(0,500):[]}}catch{return blank()}}
const writeLocal=(workspaceId:string,state:IntegrationFrameworkState)=>safeStorage.setItem(key(workspaceId),JSON.stringify({...state,jobs:state.jobs.slice(0,250),attempts:state.attempts.slice(0,500),diagnostics:state.diagnostics.slice(0,500),auditEvents:state.auditEvents.slice(0,500),extensionJobs:state.extensionJobs.slice(0,300),extensionEvents:state.extensionEvents.slice(0,500)}))

type AccountRow=Database['public']['Tables']['integration_connected_accounts']['Row'];type JobRow=Database['public']['Tables']['integration_sync_jobs']['Row'];type AttemptRow=Database['public']['Tables']['integration_sync_attempts']['Row'];type DiagnosticRow=Database['public']['Tables']['integration_diagnostics']['Row'];type AuditRow=Database['public']['Tables']['integration_audit_events']['Row'];type ExtensionInstallationRow=Database['public']['Tables']['extension_installations']['Row'];type ExtensionSettingsRow=Database['public']['Tables']['extension_product_settings']['Row'];type ExtensionJobRow=Database['public']['Tables']['extension_capture_jobs']['Row'];type ExtensionEventRow=Database['public']['Tables']['extension_events']['Row']
const mapAccount=(row:AccountRow):ConnectedAccount=>normalizeAccount({id:row.id,workspaceId:row.organization_id,provider:row.provider as OAuthProvider,externalAccountId:row.external_account_id,displayName:row.display_name,status:row.connection_mode==='demo'?'demo':row.status as ConnectedAccountStatus,scopes:row.scopes,hasCredential:row.has_credential,tokenExpiresAt:row.token_expires_at,lastSyncAt:row.last_sync_at,nextSyncAt:row.next_sync_at,syncCursor:row.sync_cursor,lastError:row.last_error,ownerUserId:row.connected_by_user_id,accessMode:row.access_mode as IntegrationAccountAccessMode,allowedUserIds:row.allowed_user_ids,allowedRoles:row.allowed_roles,capabilities:booleanMap(row.capabilities),connectionMode:row.connection_mode as IntegrationConnectionMode,credentialVersion:row.credential_version,tokenRefreshedAt:row.token_refreshed_at,revokedAt:row.revoked_at,lastTestedAt:row.last_tested_at,lastTestStatus:row.last_test_status as DiagnosticStatus|null,lastTestLatencyMs:row.last_test_latency_ms,metadata:objectValue(row.metadata),createdAt:row.created_at,updatedAt:row.updated_at})
const mapJob=(row:JobRow):IntegrationSyncJob=>({id:row.id,workspaceId:row.organization_id,accountId:row.account_id,provider:row.provider as OAuthProvider,jobType:row.job_type,workerKey:row.worker_key,status:row.status as SyncJobStatus,priority:row.priority,attempts:row.attempts,maxAttempts:row.max_attempts,availableAt:row.available_at,lockedAt:row.locked_at,lockedBy:row.locked_by,leaseExpiresAt:row.lease_expires_at,recoveredCount:row.recovered_count,completedAt:row.completed_at,idempotencyKey:row.idempotency_key,payload:objectValue(row.payload),lastError:row.last_error,createdAt:row.created_at,updatedAt:row.updated_at})
const mapAttempt=(row:AttemptRow):IntegrationSyncAttempt=>({id:row.id,workspaceId:row.organization_id,jobId:row.job_id,attemptNumber:row.attempt_number,status:row.status as SyncAttemptStatus,responseCode:row.response_code,durationMs:row.duration_ms,errorMessage:row.error_message,createdAt:row.created_at})
const mapDiagnostic=(row:DiagnosticRow):IntegrationDiagnostic=>({id:row.id,workspaceId:row.organization_id,accountId:row.account_id,provider:row.provider as IntegrationDiagnostic['provider'],runId:row.run_id,checkKey:row.check_key,status:row.status as DiagnosticStatus,message:row.message,latencyMs:row.latency_ms,details:objectValue(row.details),createdAt:row.created_at})
const mapAudit=(row:AuditRow):IntegrationAuditEvent=>({id:row.id,workspaceId:row.organization_id,accountId:row.account_id,provider:row.provider,eventType:row.event_type,severity:row.severity as IntegrationAuditEvent['severity'],actorUserId:row.actor_user_id,correlationId:row.correlation_id,message:row.message,metadata:objectValue(row.metadata),createdAt:row.created_at})
const mapExtension=(row:ExtensionInstallationRow):ExtensionInstallation=>({id:row.id,workspaceId:row.organization_id,userId:row.user_id,productKey:row.product_key as ExtensionProductKey,installationKey:row.installation_key,displayName:row.display_name,browser:row.browser,browserVersion:row.browser_version,platform:row.platform,appVersion:row.app_version,manifestVersion:row.manifest_version,status:row.status as ExtensionInstallationStatus,permissions:row.permissions,capabilities:row.capabilities,lastSeenAt:row.last_seen_at,lastSyncAt:row.last_sync_at,pendingItems:row.pending_items,capturedToday:row.captured_today,totalCaptured:Number(row.total_captured),lastError:row.last_error,metadata:objectValue(row.metadata),createdAt:row.created_at,updatedAt:row.updated_at})
const mapExtensionSettings=(row:ExtensionSettingsRow):ExtensionProductSettings=>({workspaceId:row.organization_id,productKey:row.product_key as ExtensionProductKey,enabled:row.enabled,destination:row.destination as 'garimpo'|'crm',requireConfirmation:row.require_confirmation,duplicatePolicy:row.duplicate_policy as 'skip'|'update'|'create',minimumVersion:row.minimum_version,recommendedVersion:row.recommended_version,maxBatchSize:row.max_batch_size,processIntervalMs:row.process_interval_ms,closeTabAfterAnalysis:row.close_tab_after_analysis,allowedSources:row.allowed_sources,settings:objectValue(row.settings),configVersion:row.config_version,updatedBy:row.updated_by,updatedAt:row.updated_at})
const mapExtensionJob=(row:ExtensionJobRow):ExtensionCaptureJob=>({id:row.id,workspaceId:row.organization_id,installationId:row.installation_id,userId:row.user_id,productKey:row.product_key as ExtensionProductKey,source:row.source,sourceUrl:row.source_url,externalId:row.external_id,status:row.status as ExtensionCaptureJobStatus,attempts:row.attempts,maxAttempts:row.max_attempts,availableAt:row.available_at,idempotencyKey:row.idempotency_key,itemCount:row.item_count,payload:objectValue(row.payload),result:objectValue(row.result),lastError:row.last_error,startedAt:row.started_at,completedAt:row.completed_at,createdAt:row.created_at,updatedAt:row.updated_at})
const mapExtensionEvent=(row:ExtensionEventRow):ExtensionEvent=>({id:row.id,workspaceId:row.organization_id,installationId:row.installation_id,jobId:row.job_id,eventType:row.event_type,status:row.status as ExtensionEventStatus,correlationId:row.correlation_id,payload:objectValue(row.payload),createdAt:row.created_at})

export async function loadIntegrationFramework(workspaceId:string):Promise<IntegrationFrameworkState>{
  const local=readLocal(workspaceId);const client=integrationClient();if(!client){
    if(!local.extensionSettings.some(i=>i.productKey==='realtalent_capture'))local.extensionSettings.push(defaultExtensionProductSettings(workspaceId))
    try {
      const gatewayAccounts=await loadGatewayAccounts(workspaceId)
      const localById=new Map(local.accounts.map((item)=>[item.id,item]))
      local.accounts=gatewayAccounts.map((item)=>{const existing=localById.get(item.id);return existing?{...item,accessMode:existing.accessMode,allowedUserIds:existing.allowedUserIds,allowedRoles:existing.allowedRoles}:item})
    } catch {
      // Outage must not erase cached accounts from localStorage. Return a
      // degraded read-only view, without persisting a false disconnect.
      return {...local,accounts:offlineIntegrationAccountView(local.accounts)}
    }
    writeLocal(workspaceId,local);return local
  }
  const [accounts,jobs,attempts,diagnostics,audit,extensions,settings,extensionJobs,extensionEvents]=await Promise.all([
    client.from('integration_connected_accounts').select('*').eq('organization_id',workspaceId).order('updated_at',{ascending:false}),client.from('integration_sync_jobs').select('*').eq('organization_id',workspaceId).order('created_at',{ascending:false}).limit(250),client.from('integration_sync_attempts').select('*').eq('organization_id',workspaceId).order('created_at',{ascending:false}).limit(500),client.from('integration_diagnostics').select('*').eq('organization_id',workspaceId).order('created_at',{ascending:false}).limit(500),client.from('integration_audit_events').select('*').eq('organization_id',workspaceId).order('created_at',{ascending:false}).limit(500),client.from('extension_installations').select('*').eq('organization_id',workspaceId).order('last_seen_at',{ascending:false}),client.from('extension_product_settings').select('*').eq('organization_id',workspaceId).order('updated_at',{ascending:false}),client.from('extension_capture_jobs').select('*').eq('organization_id',workspaceId).order('created_at',{ascending:false}).limit(300),client.from('extension_events').select('*').eq('organization_id',workspaceId).order('created_at',{ascending:false}).limit(500),
  ])
  if([accounts,jobs,attempts,diagnostics,audit,extensions,settings,extensionJobs,extensionEvents].some(result=>result.error))return local
  const extensionSettings=(settings.data||[]).map(mapExtensionSettings);if(!extensionSettings.some(i=>i.productKey==='realtalent_capture'))extensionSettings.push(defaultExtensionProductSettings(workspaceId))
  const state:IntegrationFrameworkState={accounts:(accounts.data||[]).map(mapAccount),jobs:(jobs.data||[]).map(mapJob),attempts:(attempts.data||[]).map(mapAttempt),diagnostics:(diagnostics.data||[]).map(mapDiagnostic),auditEvents:(audit.data||[]).map(mapAudit),extensions:(extensions.data||[]).map(mapExtension),extensionSettings,extensionJobs:(extensionJobs.data||[]).map(mapExtensionJob),extensionEvents:(extensionEvents.data||[]).map(mapExtensionEvent)};writeLocal(workspaceId,state);return state
}

export async function beginOAuthConnection(workspaceId:string,provider:OAuthProvider){
  const extensionId=providerExtensionId(provider)
  await extensionLifecycle.emit(extensionId,'beforeConnect',{provider},{workspaceId})
  try{
    const client=integrationClient()
    if(!client||!env.supabaseUrl){
      const result=await beginGatewayOAuth(workspaceId,provider)
      await extensionLifecycle.emit(extensionId,'afterConnect',{provider,mode:result.mode,hasUrl:Boolean(result.url)},{workspaceId})
      return result
    }
    const{data:sessionData}=await client.auth.getSession();const token=sessionData.session?.access_token;if(!token)throw new Error('Sessão expirada. Entre novamente antes de conectar uma integração.')
    const response=await fetch(`${env.supabaseUrl.replace(/\/$/,'')}/functions/v1/integration-oauth-start`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({organizationId:workspaceId,provider})});const payload=await response.json().catch(()=>({})) as {authorizationUrl?:string;error?:string};if(!response.ok||!payload.authorizationUrl)throw new Error(payload.error||'Não foi possível iniciar o OAuth.');
    await extensionLifecycle.emit(extensionId,'afterConnect',{provider,mode:'oauth',hasUrl:true},{workspaceId})
    return{mode:'oauth' as const,url:payload.authorizationUrl,message:'Autorização iniciada com PKCE.'}
  }catch(error){
    await extensionLifecycle.emit(extensionId,'onError',{provider,operation:'connect',message:error instanceof Error?error.message:String(error)},{workspaceId})
    throw error
  }
}

const idempotencyPart=(value:unknown)=>String(value??'').replace(/[^a-zA-Z0-9._:-]+/g,'-').slice(0,90)
export const integrationJobIdempotencyKey=(account:Pick<ConnectedAccount,'provider'|'id'>,jobType:string,payload:Record<string,unknown>={})=>{
  const requestKey=idempotencyPart(payload.requestKey)
  if(requestKey)return `${account.provider}:${account.id}:${jobType}:${requestKey}`.slice(0,240)
  const eventId=idempotencyPart(payload.eventId)
  if(eventId){const mutation=idempotencyPart(payload.mutation||'update');const eventValue=(payload.event&&typeof payload.event==='object')?payload.event as Record<string,unknown>:{};const version=idempotencyPart(payload.eventVersion||eventValue.updatedAt||eventValue.updated_at||new Date().toISOString());return `${account.provider}:${account.id}:${jobType}:${eventId}:${mutation}:${version}`.slice(0,240)}
  return `${account.provider}:${account.id}:${jobType}:${new Date().toISOString().slice(0,16)}`
}
export async function enqueueIntegrationSync(workspaceId:string,account:ConnectedAccount,jobType=defaultJobTypeForProvider(account.provider),payload:Record<string,unknown>={}){
  if(account.connectionMode==='demo'||account.status==='demo')throw new Error('Contas de demonstração não executam sincronizações externas.')
  if(!allowedJobTypesForProvider(account.provider).includes(jobType))throw new Error('Tipo de trabalho não permitido para este provedor.')
  const extensionId=providerExtensionId(account.provider);const command=commandForJob(account.provider,jobType)
  await extensionLifecycle.emit(extensionId,'beforeSync',{provider:account.provider,jobType,commandId:command?.id??null},{workspaceId,accountId:account.id})
  try{
    const client=integrationClient();const idempotencyKey=integrationJobIdempotencyKey(account,jobType,payload)
    if(client){const{data,error}=await client.rpc('enqueue_integration_sync_job',{p_organization_id:workspaceId,p_account_id:account.id,p_job_type:jobType,p_idempotency_key:idempotencyKey,p_payload:{requested_by:'crm',requested_at:now(),command_id:command?.id??null,...payload}});if(error)throw new Error(`Não foi possível colocar a sincronização na fila: ${error.message}`);await extensionLifecycle.emit(extensionId,'afterSync',{provider:account.provider,jobType,jobId:String(data),queued:true},{workspaceId,accountId:account.id});return String(data)}
    const started=now();await syncGatewayCommunications(workspaceId,account.id);const state=readLocal(workspaceId);const job:IntegrationSyncJob={id:createUuid(),workspaceId,accountId:account.id,provider:account.provider,jobType,workerKey:'local-communications-gateway',status:'succeeded',priority:100,attempts:1,maxAttempts:1,availableAt:started,lockedAt:null,lockedBy:null,leaseExpiresAt:null,recoveredCount:0,completedAt:now(),idempotencyKey,payload:{mode:'local-gateway',commandId:command?.id??null,...payload},lastError:null,createdAt:started,updatedAt:now()};writeLocal(workspaceId,{...state,jobs:[job,...state.jobs]});await extensionLifecycle.emit(extensionId,'afterSync',{provider:account.provider,jobType,jobId:job.id,queued:false},{workspaceId,accountId:account.id});return job.id
  }catch(error){
    await extensionLifecycle.emit(extensionId,'onError',{provider:account.provider,operation:'sync',jobType,message:error instanceof Error?error.message:String(error)},{workspaceId,accountId:account.id})
    throw error
  }
}

export async function testConnectedAccount(workspaceId:string,account:ConnectedAccount){
  if(account.connectionMode==='demo')return{status:'warn' as const,message:'Conta de demonstração: nenhuma credencial externa foi testada.',latencyMs:0}
  const client=integrationClient();if(!client)return testGatewayAccount(workspaceId,account.id)
  const{data,error}=await client.functions.invoke('integration-account-test',{body:{organizationId:workspaceId,accountId:account.id}});if(error)throw new Error(error.message);return data as {status:DiagnosticStatus;message:string;latencyMs:number}
}

export async function runIntegrationDiagnostics(workspaceId:string){
  const client=integrationClient();if(!client){
    const health=await loadCommunicationsGatewayHealth();const accounts=await loadGatewayAccounts(workspaceId)
    return{runId:createUuid(),checks:[{provider:'framework',checkKey:'local_communications_gateway',status:health.ok?'pass':'fail',message:health.ok?'Gateway local de comunicações operacional.':'Gateway local indisponível.',accountId:null,details:{version:health.version,accounts:accounts.length}}]}
  }
  const{data,error}=await client.functions.invoke('integration-diagnostics',{body:{organizationId:workspaceId}});if(error)throw new Error(error.message);return data as {runId:string;checks:Array<Record<string,unknown>>}
}

export async function updateConnectedAccountAccess(workspaceId:string,accountId:string,accessMode:IntegrationAccountAccessMode,allowedUserIds:string[]=[],allowedRoles:string[]=[]){const client=integrationClient();if(client){const{error}=await client.rpc('update_integration_account_access',{p_account_id:accountId,p_access_mode:accessMode,p_allowed_user_ids:allowedUserIds,p_allowed_roles:allowedRoles});if(error)throw new Error(`Não foi possível atualizar as permissões: ${error.message}`);return}const state=readLocal(workspaceId);writeLocal(workspaceId,{...state,accounts:state.accounts.map(i=>i.id===accountId?{...i,accessMode,allowedUserIds,allowedRoles,updatedAt:now()}:i)})}
export async function updateConnectedAccount(workspaceId:string,accountId:string,action:'pause'|'resume'|'disconnect'){
  const client=integrationClient();if(client){if(action==='disconnect'){const{error}=await client.functions.invoke('integration-account-revoke',{body:{organizationId:workspaceId,accountId}});if(error)throw new Error(`Não foi possível revogar a conta: ${error.message}`);return}const{error}=await client.rpc('update_integration_account_status',{p_account_id:accountId,p_action:action});if(error)throw new Error(`Não foi possível atualizar a conta: ${error.message}`);return}
  await gatewayAccountAction(workspaceId,accountId,action)
  const state=readLocal(workspaceId);const status:ConnectedAccountStatus=action==='pause'?'paused':action==='resume'?'connected':'revoked';writeLocal(workspaceId,{...state,accounts:state.accounts.map(i=>i.id===accountId?{...i,status,hasCredential:action==='disconnect'?false:i.hasCredential,revokedAt:action==='disconnect'?now():null,updatedAt:now()}:i)})
}

export async function retryIntegrationJob(workspaceId:string,jobId:string){const client=integrationClient();if(client){const{error}=await client.rpc('retry_integration_sync_job',{p_job_id:jobId});if(error)throw new Error(`Não foi possível reagendar: ${error.message}`);return}const state=readLocal(workspaceId);writeLocal(workspaceId,{...state,jobs:state.jobs.map(i=>i.id===jobId?{...i,status:'retry',availableAt:now(),lastError:null,updatedAt:now()}:i)})}
export async function updateExtensionInstallation(workspaceId:string,installationId:string,action:'pause'|'resume'|'revoke'){const client=integrationClient();if(client){const{error}=await client.rpc('update_extension_installation_status',{p_installation_id:installationId,p_action:action});if(error)throw new Error(`Não foi possível atualizar a extensão: ${error.message}`);return}const state=readLocal(workspaceId);const status:ExtensionInstallationStatus=action==='pause'?'paused':action==='resume'?'connected':'revoked';writeLocal(workspaceId,{...state,extensions:state.extensions.map(i=>i.id===installationId?{...i,status,lastError:action==='revoke'?'Instalação revogada pelo administrador':null,updatedAt:now()}:i)})}
export async function retryExtensionCaptureJob(workspaceId:string,jobId:string){const client=integrationClient();if(client){const{error}=await client.rpc('retry_extension_capture_job',{p_job_id:jobId});if(error)throw new Error(`Não foi possível reagendar a captura: ${error.message}`);return}const state=readLocal(workspaceId);writeLocal(workspaceId,{...state,extensionJobs:state.extensionJobs.map(i=>i.id===jobId?{...i,status:'retry',availableAt:now(),lastError:null,completedAt:null,updatedAt:now()}:i)})}
export async function saveExtensionProductSettings(workspaceId:string,settings:ExtensionProductSettings){const client=integrationClient();if(client){const{data,error}=await client.rpc('save_extension_product_settings',{p_organization_id:workspaceId,p_product_key:settings.productKey,p_enabled:settings.enabled,p_destination:settings.destination,p_require_confirmation:settings.requireConfirmation,p_duplicate_policy:settings.duplicatePolicy,p_minimum_version:settings.minimumVersion,p_recommended_version:settings.recommendedVersion,p_max_batch_size:settings.maxBatchSize,p_process_interval_ms:settings.processIntervalMs,p_close_tab_after_analysis:settings.closeTabAfterAnalysis,p_allowed_sources:settings.allowedSources,p_settings:settings.settings as Json});if(error)throw new Error(`Não foi possível salvar a configuração da extensão: ${error.message}`);return mapExtensionSettings(data as unknown as ExtensionSettingsRow)}const state=readLocal(workspaceId);const next={...settings,configVersion:settings.configVersion+1,updatedAt:now()};writeLocal(workspaceId,{...state,extensionSettings:[next,...state.extensionSettings.filter(i=>i.productKey!==settings.productKey)]});return next}
export async function rotateExtensionToken(workspaceId:string){const client=integrationClient();if(!client)throw new Error('A rotação de token exige o modo hospedado.');const{data,error}=await client.rpc('rotate_extension_ingest_token',{p_organization_id:workspaceId});if(error)throw new Error(error.message);return String(data)}
export async function revokeExtensionToken(workspaceId:string){const client=integrationClient();if(!client)throw new Error('A revogação de token exige o modo hospedado.');const{error}=await client.rpc('revoke_extension_ingest_token',{p_organization_id:workspaceId});if(error)throw new Error(error.message)}
export const extensionIngestEndpoint=()=>env.supabaseUrl?`${env.supabaseUrl.replace(/\/$/,'')}/functions/v1/extension-ingest`:''

export function recordLocalIntegrationEvent(workspaceId:string,itemCount:number,eventType='extension_local_capture'){
  const state=readLocal(workspaceId);const date=now();const event:ExtensionEvent={id:createUuid(),workspaceId,installationId:null,jobId:null,eventType,status:'processed',correlationId:null,payload:{itemCount,mode:'local'},createdAt:date};writeLocal(workspaceId,{...state,extensionEvents:[event,...state.extensionEvents]})
}
