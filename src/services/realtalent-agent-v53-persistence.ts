import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from '../lib/supabase'
import { isValidWork, type AgentWorkDocument } from './realtalent-agent-v53-work'

const storageKey=(workspaceId:string,userId:string)=>'realtalent:agent:work:v53:'+workspaceId+':'+userId
export type WorkPersistenceState='cloud'|'local'|'unavailable'
const readLocal=(key:string):AgentWorkDocument|null=>{
  try{
    const raw=localStorage.getItem(key)
    if(!raw)return null
    const parsed:unknown=JSON.parse(raw)
    return isValidWork(parsed)?parsed:null
  }catch{return null}
}
const writeLocal=(key:string,work:AgentWorkDocument|null)=>{
  try{
    if(work)localStorage.setItem(key,JSON.stringify(work))
    else localStorage.removeItem(key)
    return true
  }catch{return false}
}
async function identity(){
  const client=getSupabaseClient()
  if(!client)return null
  const {data,error}=await client.auth.getUser()
  if(error||!data.user)return null
  return {client:client as unknown as SupabaseClient,userId:data.user.id}
}
export async function loadAgentWork(workspaceId:string,userId:string):Promise<{document:AgentWorkDocument|null;state:WorkPersistenceState}>{
  if(!workspaceId||!userId)return {document:null,state:'unavailable'}
  const key=storageKey(workspaceId,userId),fallback=readLocal(key)
  try{
    const auth=await identity()
    if(!auth||auth.userId!==userId)return {document:fallback,state:fallback?'local':'unavailable'}
    const {data,error}=await auth.client.from('agent_work_documents')
      .select('document').eq('workspace_id',workspaceId).eq('user_id',userId).maybeSingle()
    if(error)return {document:fallback,state:fallback?'local':'unavailable'}
    const remote:unknown=data?.document
    // Null means no cloud state; never resurrect a deleted document from a stale tab.
    const document=isValidWork(remote)?remote:null
    if(document)writeLocal(key,document)
    return {document,state:'cloud'}
  }catch{return {document:fallback,state:fallback?'local':'unavailable'}}
}
export async function saveAgentWork(workspaceId:string,userId:string,work:AgentWorkDocument|null):Promise<WorkPersistenceState>{
  if(!workspaceId||!userId)return 'unavailable'
  const key=storageKey(workspaceId,userId)
  const savedLocally=writeLocal(key,work)
  try{
    const auth=await identity()
    if(!auth||auth.userId!==userId)return savedLocally?'local':'unavailable'
    const {error}=await auth.client.from('agent_work_documents').upsert({
      workspace_id:workspaceId,user_id:userId,document:work,updated_at:new Date().toISOString(),
    },{onConflict:'workspace_id,user_id'})
    if(!error)return 'cloud'
  }catch{/* retain local work */}
  return savedLocally?'local':'unavailable'
}
