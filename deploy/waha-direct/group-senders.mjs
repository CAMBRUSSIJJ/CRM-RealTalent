// GOWS group messages have a participant id, which is not necessarily a display name.
// Resolve only identified members, without leaking contact data to external services.
const memberIdPattern=/^[A-Za-z0-9_-]{5,80}@(c\.us|lid)$/
export function groupSenderId(message){
  if(!message||message.fromMe===true)return ''
  const fields=[message.participant,message.author,message.senderId,message._data?.participant,
    message._data?.author,message._data?.Info?.Sender]
  for(const field of fields){
    const candidate=typeof field==='string'?field:typeof field?.id==='string'?field.id:''
    if(memberIdPattern.test(candidate))return candidate
  }
  const from=typeof message.from==='string'?message.from:''
  return memberIdPattern.test(from)?from:''
}
const clean=(v)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,90):''
export function directGroupSenderName(message){
  const fields=[message.senderName,message.notifyName,message.pushName,message.pushname,
    message._data?.notifyName,message._data?.pushName,message._data?.pushname]
  for(const field of fields){
    const name=clean(field)
    if(name&&!memberIdPattern.test(name))return name
  }
  return ''
}
export function senderFallback(id){
  if(!memberIdPattern.test(id))return 'Participante não identificado'
  if(id.endsWith('@lid'))return 'Participante • '+id.slice(0,-4).slice(-4)
  return '+'+id.split('@')[0]
}
export function createGroupSenderEnricher({lookup,now=()=>Date.now()}){
  if(typeof lookup!=='function')throw new Error('Resolução de contatos indisponível')
  const cache=new Map()
  async function resolve(id){
    if(!memberIdPattern.test(id))return ''
    const prior=cache.get(id)
    if(prior&&prior.expires>now())return prior.name
    let name=''
    try{
      const contact=await lookup(id)
      name=clean(contact?.name)||clean(contact?.pushname)||clean(contact?.pushName)||clean(contact?.shortName)
    }catch{/* Fallback to participant ID when WAHA contact cannot be resolved. */}
    cache.set(id,{name,expires:now()+(name?20*60_000:90_000)})
    if(cache.size>500)cache.delete(cache.keys().next().value)
    return name
  }
  return async function enrich(messages,chatId){
    if(!Array.isArray(messages))return []
    if(typeof chatId!=='string'||!chatId.endsWith('@g.us'))return messages
    const ids=[...new Set(messages.filter(m=>m&&!m.fromMe&&!directGroupSenderName(m))
      .map(groupSenderId).filter(Boolean))].slice(0,24)
    // Limit concurrency and total lookups to avoid overloading WAHA.
    const resolved=new Map()
    for(let i=0;i<ids.length;i+=4){
      await Promise.all(ids.slice(i,i+4).map(async id=>resolved.set(id,await resolve(id))))
    }
    return messages.map(m=>{
      if(!m||typeof m!=='object')return m
      if(m.fromMe)return {...m,senderName:'Você'}
      const id=groupSenderId(m)
      const name=directGroupSenderName(m)||resolved.get(id)||senderFallback(id)
      return {...m,senderId:id||null,senderName:name}
    })
  }
}
