/** Honest integration states, without fetching or mutating external services. */
export function hostedCalendarConnectionAvailable(mode:'local'|'supabase'):boolean{
  return mode==='supabase'
}
export function whatsappGatewayIsHealthy(health:{ok?:boolean}|null|undefined,
  _runtime?:{services?:{communications?:boolean}}|null):boolean{
  // A supervisor may be alive while the gateway endpoint is not reachable.
  return health?.ok===true
}
export function describeLocalServiceError(status:number,source:'supervisor'|'gateway'):string{
  if(status===502)return source==='supervisor'?
    'HTTP 502: o proxy local não conseguiu acessar o supervisor. Verifique o inicializador e o log no terminal.':
    'HTTP 502: o proxy local não conseguiu acessar o gateway. Verifique a porta e a inicialização do serviço.'
  if(status===503)return 'HTTP 503: serviço temporariamente indisponível. Confira o supervisor local.'
  return 'Falha HTTP '+status+'. Consulte o diagnóstico do serviço.'
}
