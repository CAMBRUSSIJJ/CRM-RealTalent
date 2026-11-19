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
  // Mensagem para quem usa o CRM: o que aconteceu e o que fazer. O código técnico vai no fim, para o suporte.
  if(status===502)return source==='supervisor'?
    'O serviço de comunicação deste computador não respondeu. Abra o RealTalent Connect e tente sincronizar de novo. (código 502 · supervisor)':
    'Não conseguimos falar com o serviço de mensagens agora. Confira se o RealTalent Connect está aberto e tente sincronizar de novo. (código 502 · gateway)'
  if(status===503)return 'O serviço de mensagens está temporariamente indisponível. Tente de novo em alguns instantes. (código 503)'
  return 'Não foi possível concluir a comunicação com o serviço. Tente de novo; se continuar, fale com o administrador. (código '+status+')'
}

/** Do not delete previously discovered accounts when an HTTP gateway check
 * fails. Show the cached record as needing attention, not connected.
 * This is a read-only projection: callers must not persist the degraded copy. */
export function offlineIntegrationAccountView<T extends {status:string}>(accounts:T[]):T[]{
  return accounts.map(account=>({...account,status:account.status==='connected'?'attention':account.status}))
}
