// Explicit local, per-contact opt-in. No queued/bulk sending, no persistence of activation.
// The same event is consumed at most once, even if the WAHA connection retries.
export const DIRECT_CHAT=/^[A-Za-z0-9_-]{5,70}@(c\.us|lid)$/
const ID_PATTERN=/^[A-Za-z0-9@_.:-]{5,250}$/
const HOUR=3600000, COOLDOWN=120000, FRESH_MS=120000, SEEN_TTL=3600000
const MAX_CHAT_HOUR=3, MAX_GLOBAL_HOUR=10
const OPT_OUT=/^\s*(?:pare|parar|stop|cancelar|não\s+(?:me\s+)?(?:mande|envie|responda)|não\s+quero\s+mensagens|sair)\s*[.!]?\s*$/i
const ALLOWED_MEDIA=new Set(['audio/ogg','audio/mpeg','audio/mp4','audio/wav'])
const CONTROL=/[\u0000-\u001f\u007f]/g

export function safeAutoReplyText(raw){
  if(typeof raw!=='string')return null
  const text=raw.replace(CONTROL,' ').trim()
    .replace(/^["“]|["”]$/g,'').trim()
  if(text.length<15||text.length>480||/\b(?:R\$\s*\d|US\$\s*\d|https?:\/\/|pix\b|cpf\b|senha\b)\b/i.test(text))
    return null
  // Explicitly refuse unverified claims and promises, including payment or deadlines.
  if(/(?:garantimos|prometo|confirmad[oa]|desconto de \d+|entrega(?:remos)? em \d+|marcado para|agendad[oa] para)/i.test(text))
    return null
  return text
}
function nowTimestamp(raw,now){
  const t=Number(raw)
  if(!Number.isFinite(t)||t<=0)return NaN
  return t>1e12?t:t*1000
}
function latestMessage(raw){
  if(!Array.isArray(raw))return null
  const entries=raw.filter(x=>x&&typeof x==='object'&&typeof x.id==='string')
  return entries.sort((a,b)=>Number(b.timestamp||0)-Number(a.timestamp||0))[0]||null
}
export function createAutoReplyController({readMessages,buildReply,send,now=()=>Date.now(),delay=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  if(typeof readMessages!=='function'||typeof buildReply!=='function'||typeof send!=='function')
    throw Error('Controlador de atendimento IA incompleto')
  const enabled=new Set(),seen=new Map(),inFlight=new Set(),lastSent=new Map(),
    perChatSent=new Map(),globalSent=[]
  const states=new Map()
  function trim(){
    const t=now()
    for(const [id,expires] of seen)if(expires<=t)seen.delete(id)
    while(globalSent.length&&globalSent[0]<=t-HOUR)globalSent.shift()
    for(const [id,items] of perChatSent){
      const recent=items.filter(x=>x>t-HOUR)
      if(recent.length)perChatSent.set(id,recent);else perChatSent.delete(id)
    }
    if(seen.size>1000)for(const k of [...seen.keys()].slice(0,200))seen.delete(k)
  }
  function eligible(chatId){
    trim()
    const t=now()
    const items=perChatSent.get(chatId)||[]
    return enabled.has(chatId)&&!inFlight.has(chatId)&&
      items.length<MAX_CHAT_HOUR&&globalSent.length<MAX_GLOBAL_HOUR&&
      t-(lastSent.get(chatId)||0)>COOLDOWN
  }
  function status(chatId){
    if(!DIRECT_CHAT.test(chatId||''))return {enabled:false,available:false,reason:'Apenas conversas privadas'}
    trim()
    return {enabled:enabled.has(chatId),available:true,
      remainingHour:Math.max(0,MAX_CHAT_HOUR-(perChatSent.get(chatId)||[]).length),
      maxChatHour:MAX_CHAT_HOUR,maxGlobalHour:MAX_GLOBAL_HOUR,
      busy:inFlight.has(chatId),
      lastOutcome:states.get(chatId)?.outcome||'idle',
      // Activation is deliberately memory-only; restart always disables automation.
      survivesRestart:false}
  }
  function setEnabled(chatId,value){
    if(!DIRECT_CHAT.test(chatId||'')||typeof value!=='boolean'){
      const e=new Error('Atendimento automático disponível apenas em conversas privadas');e.status=400;throw e
    }
    if(value)enabled.add(chatId)
    else enabled.delete(chatId)
    states.set(chatId,{outcome:value?'enabled':'disabled'})
    return status(chatId)
  }
  async function onMessage(event){
    if(event?.event!=='message'||!event?.payload||event.session&&event.session!=='realtalent')return {outcome:'ignored'}
    const m=event.payload
    const chatId=typeof m.chatId==='string'?m.chatId:m.from
    if(!DIRECT_CHAT.test(chatId||'')||m.fromMe!==false||typeof m.id!=='string'||
      !ID_PATTERN.test(m.id)||!enabled.has(chatId))return {outcome:'ignored'}
    const time=nowTimestamp(m.timestamp,now())
    if(!Number.isFinite(time)||Math.abs(now()-time)>FRESH_MS)return {outcome:'stale'}
    const text=typeof m.body==='string'?m.body.trim():''
    if(OPT_OUT.test(text)){setEnabled(chatId,false);return {outcome:'opt_out'}}
    const media=String(m.media?.mimetype||'').split(';')[0].toLowerCase()
    if(m.hasMedia===true&&!ALLOWED_MEDIA.has(media))return {outcome:'unsupported_media'}
    if(m.hasMedia!==true&&(!text||text.length>1800))return {outcome:'empty_or_long'}
    trim()
    if(seen.has(m.id))return {outcome:'duplicate'}
    // Mark before network requests. Never retry a possibly-sent message.
    seen.set(m.id,now()+SEEN_TTL)
    if(!eligible(chatId))return {outcome:'limited'}
    inFlight.add(chatId)
    try{
      await delay(4000)
      if(!enabled.has(chatId))return {outcome:'disabled'}
      let history=await readMessages(chatId)
      const latest=latestMessage(history)
      if(!latest||latest.id!==m.id||latest.fromMe!==false)return {outcome:'superseded'}
      const reply=safeAutoReplyText(await buildReply({chatId,trigger:m,messages:history}))
      if(!reply)return {outcome:'review_required'}
      // Reconfirm no newer inbound/outbound message appeared while generating.
      if(!enabled.has(chatId)||!eligibleWithoutFlight(chatId))return {outcome:'disabled_or_limited'}
      history=await readMessages(chatId)
      const newest=latestMessage(history)
      if(!newest||newest.id!==m.id||newest.fromMe!==false)return {outcome:'superseded'}
      const textToSend=reply+'\n\n— Assistente virtual RealTalent'
      // Record attempt BEFORE sending: unknown HTTP outcomes are not retried.
      const sentAt=now()
      perChatSent.set(chatId,[...(perChatSent.get(chatId)||[]),sentAt])
      globalSent.push(sentAt)
      lastSent.set(chatId,sentAt)
      states.set(chatId,{outcome:'attempted'})
      await send(chatId,textToSend)
      states.set(chatId,{outcome:'sent'})
      return {outcome:'sent'}
    }catch{
      states.set(chatId,{outcome:'failed'})
      return {outcome:'failed'}
    }finally{inFlight.delete(chatId)}
  }
  function eligibleWithoutFlight(chatId){
    trim()
    return enabled.has(chatId)&&
      (perChatSent.get(chatId)||[]).length<MAX_CHAT_HOUR&&
      globalSent.length<MAX_GLOBAL_HOUR&&now()-(lastSent.get(chatId)||0)>COOLDOWN
  }
  return {status,setEnabled,onMessage}
}
