import { env } from '../lib/env'
import { loadCommunicationsGatewayHealth } from './local-communications-gateway'
export type IntegrationProbeStatus = 'online' | 'protected' | 'missing' | 'unavailable' | 'attention'
export interface IntegrationProbe { id: string; label: string; status: IntegrationProbeStatus; detail: string; action: string }
export const requiredIntegrationFunctions = [
  ['integration-oauth-start', 'Google / Microsoft · Conectar'],
  ['integration-account-test', 'Contas externas · Testar'],
  ['integration-calendar-catalog', 'Google / Microsoft · Calendários'],
  ['official-communication-send', 'E-mail / WhatsApp · Enviar'],
  ['automation-webhook-dispatch', 'Automações · Webhooks'],
] as const
/** Read-only HEAD: never sends messages, starts OAuth or triggers webhooks. */
export async function checkIntegrationEdgeFunction(name: string, label: string, supabaseUrl: string, fetcher: typeof fetch = fetch): Promise<IntegrationProbe> {
  const base: IntegrationProbe = { id: name, label, status: 'attention', detail: '', action: '' }
  if (!supabaseUrl) return { ...base, status: 'missing', detail: 'URL do Supabase ausente.', action: 'Configure a URL e chave pública no ambiente.' }
  try {
    const url = new URL('/functions/v1/' + encodeURIComponent(name), supabaseUrl)
    const res = await fetcher(url.href, { method: 'HEAD', cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(6500) })
    if (res.status === 404) return { ...base, status: 'missing', detail: 'Edge Function retornou HTTP 404.', action: 'Implante a função no Supabase; o botão depende desse serviço.' }
    if ([401,403].includes(res.status)) return { ...base, status: 'protected', detail: 'Endpoint protegido; acesso completo não validado.', action: 'Teste com conta autenticada e confirme permissões.' }
    if ((res.status >= 200 && res.status < 400) || res.status === 405) return { ...base, status: 'online', detail: 'Endpoint respondeu ao teste sem executar operações.', action: 'Teste o fluxo completo antes de usar com dados reais.' }
    return { ...base, status: 'unavailable', detail: 'HTTP ' + res.status, action: 'Inspecione logs e implantação do serviço.' }
  } catch (reason) {
    return { ...base, status: 'unavailable', detail: reason instanceof Error ? reason.message.slice(0,160) : 'Falha de rede.', action: 'Verifique rede e configuração da função.' }
  }
}
export async function probeIntegrationInfrastructure(fetcher: typeof fetch = fetch): Promise<IntegrationProbe[]> {
  const checks = await Promise.all(requiredIntegrationFunctions.map(([id,label]) => checkIntegrationEdgeFunction(id,label,env.supabaseUrl || '',fetcher)))
  try {
    const g = await loadCommunicationsGatewayHealth()
    checks.unshift({ id:'communications-gateway', label:'Gateway de Comunicações', status:g.ok?'online':'unavailable', detail:g.ok?'Runtime respondeu, versão '+g.version+'.':'Gateway sem saúde.', action:'Configure URLs e tokens somente no servidor.' })
    for (const [key,label] of [['google','Google'],['microsoft','Microsoft'],['whatsapp','WhatsApp']] as const) {
      checks.push({ id:'gateway-'+key, label:label+' no Gateway', status:g.ok && g.providers?.[key]?'online':'attention', detail:g.providers?.[key]?'Provedor habilitado; conta ainda não comprovada.':'Provedor não habilitado.', action:'Configure credenciais e conecte uma conta real.' })
    }
  } catch {
    checks.unshift({ id:'communications-gateway', label:'Gateway de Comunicações', status:'unavailable', detail:'Runtime não respondeu ao teste autenticado.', action:'Verifique upstream, autenticação e proxy Vercel → runtime.' })
  }
  return checks
}
export function describeIntegrationBackendError(name: string, error: unknown, statusOverride?: number): string {
  const obj = error && typeof error === 'object' ? error as { message?: string; context?: {status?:number};status?:number } : {}
  const status = statusOverride ?? obj.context?.status ?? obj.status
  if (status === 404) return 'Integração indisponível: a função ' + name + ' não está implantada no Supabase. Configure o backend antes de continuar.'
  if (status === 401 || status === 403) return 'Sem autorização para executar ' + name + '. Confira sessão e permissões.'
  if (status === 429) return 'Limite de requisições de ' + name + '. Tente novamente mais tarde.'
  if (status && status >= 500) return 'Serviço ' + name + ' indisponível (HTTP '+status+'). Verifique implantação e logs.'
  return obj.message ? 'Falha em ' + name + ': ' + obj.message.slice(0,220) : 'Falha em '+name+'. Consulte o diagnóstico de integrações.'
}
