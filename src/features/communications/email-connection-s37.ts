import type {CommunicationsGatewayHealth} from '../../services/local-communications-gateway'

export type EmailProviderS37='google'|'microsoft'
export interface EmailConnectGate{ready:boolean;reason:string}
/** Proposes OAuth only when the gateway and provider are actually configured.
 * Cloud mode does not depend on the laptop gateway.
 */
export function emailConnectGate(mode:'local'|'supabase',
  health:CommunicationsGatewayHealth|null,
  provider:EmailProviderS37,
  canManage:boolean):EmailConnectGate{
  if(!canManage)return {ready:false,reason:'A conexão exige permissão para gerenciar integrações.'}
  if(mode==='supabase')return {ready:true,reason:'Conectar com autorização no workspace hospedado.'}
  if(!health?.ok)return {ready:false,reason:'Gateway local indisponível.'}
  if(!health.providers[provider])return {ready:false,reason:'OAuth não configurado para este provedor.'}
  return {ready:true,reason:'Conectar com autorização oficial.'}
}
export const localOAuthCallbacks=(port:number=3012)=>({
  google:`http://127.0.0.1:${port}/oauth/google/callback`,
  microsoft:`http://localhost:${port}/oauth/microsoft/callback`,
})
