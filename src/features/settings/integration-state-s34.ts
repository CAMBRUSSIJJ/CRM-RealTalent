import type {CommunicationsGatewayHealth} from '../../services/local-communications-gateway'
import type {RuntimeStatus} from '../../services/runtime-control'

/** In a local/demo workspace the hosted provider tokens are not available.
 * Do not offer connection calls that will only fail through a proxy. */
export function hostedCalendarConnectionAvailable(mode:'local'|'supabase'):boolean{
  return mode==='supabase'
}
/** A running supervisor is not proof that the communications gateway responds.
 * Only a successful endpoint healthcheck means WhatsApp QR can be requested. */
export function whatsappGatewayIsHealthy(health:CommunicationsGatewayHealth|null,
  _runtime?:RuntimeStatus|null):boolean{
  return health?.ok===true
}
export function describeLocalServiceError(status:number,source:'supervisor'|'gateway'):string{
  if(status===502)return source==='supervisor'?
    'HTTP 502: o proxy local não conseguiu acessar o supervisor. Verifique o inicializador e o log no terminal.':
    'HTTP 502: o proxy local não conseguiu acessar o gateway. Verifique a porta e a inicialização do serviço.'
  if(status===503)return 'HTTP 503: serviço temporariamente indisponível. Confira o supervisor local.'
  return 'Falha HTTP '+status+'. Consulte o diagnóstico do serviço.'
}
