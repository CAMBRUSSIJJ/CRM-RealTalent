// Company-name query variants and safe HTML/RSS result extraction.
// Search results are candidates, not verified business identities.
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR')
const clean=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()
const aliases=new Set(['barbearia','barber','escola','colegio','clinica','academia','restaurante',
  'padaria','mercado','loja','studio','salao','oficina','farmacia','hotel','pousada'])
export function buildCompanySearchQueries(company,city){
  const name=clean(company).slice(0,120)
  const location=clean(city).slice(0,100)
  if(!name)return []
  const terms=name.split(/\s+/).filter(Boolean)
  const candidates=[name+' '+location]
  const loc=location.split(',').map(s=>s.trim()).filter(Boolean).join(' ')
  if(terms.length>=2&&terms.length<=5){
    const first=normalize(terms[0]),last=normalize(terms.at(-1))
    if(aliases.has(first))candidates.push([...terms.slice(1),terms[0]].join(' ')+' '+loc)
    if(aliases.has(last))candidates.push([terms.at(-1),...terms.slice(0,-1)].join(' ')+' '+loc)
    candidates.push(terms.filter(term=>!aliases.has(normalize(term))).join(' ')+' '+loc)
  }
  candidates.push('"'+name.replace(/"/g,' ')+'" '+loc)
  const seen=new Set()
  return candidates.map(x=>x.trim().replace(/\s+/g,' ')).filter(x=>{
    const key=normalize(x)
    if(!key||seen.has(key))return false
    seen.add(key);return true
  }).slice(0,4)
}
const decode=value=>String(value||'').replace(/&(?:amp|quot|apos|lt|gt|nbsp|#(\d+)|#x([a-f0-9]+));/gi,(all,d,h)=>{
  if(d||h){const p=parseInt(d||h,d?10:16);return p>31&&p<=0x10ffff?String.fromCodePoint(p):' '}
  return {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[all.slice(1,-1).toLowerCase()]||' '
})
const tagText=value=>decode(String(value||'').replace(/<(?:script|style)[^>]*>[\s\S]*?<\/(?:script|style)>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim())
function safeResultUrl(raw,base){
  try{
    const u=new URL(decode(raw),base)
    const nested=(u.hostname==='duckduckgo.com'||u.hostname==='www.duckduckgo.com')?u.searchParams.get('uddg'):null
    const target=nested?new URL(nested):u
    const h=target.hostname.toLowerCase()
    if(target.protocol!=='https:'||target.username||target.password||h.endsWith('.local')||h.endsWith('.localhost')||
      h.endsWith('.internal')||h.endsWith('.test')||h.endsWith('.example')||
      !h.includes('.')||/^\d+\.\d+\.\d+\.\d+$/.test(h)||h.includes(':')||
      /(^|\.)(duckduckgo\.com|google\.[a-z.]+|bing\.com)$/.test(h))return null
    target.hash=''
    return target.href.slice(0,800)
  }catch{return null}
}
function attr(attributes,name){
  const match=String(attributes).match(new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(["\\x27])([\\s\\S]*?)\\1','i'))
  return match?.[2]||''
}
export function parseSearchHtmlResults(html,baseUrl,limit=8){
  const results=[],seen=new Set()
  const rx=/<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let match
  while((match=rx.exec(String(html||'')))&&results.length<limit){
    const classes=attr(match[1],'class')
    if(!/(^|\s)(?:result__a|result-link)(?:\s|$)/i.test(classes))continue
    const url=safeResultUrl(attr(match[1],'href'),baseUrl)
    if(!url||seen.has(url))continue
    const title=tagText(match[2]).slice(0,180)
    if(!title)continue
    const excerpt=String(html||'').slice(rx.lastIndex,rx.lastIndex+2600)
    const snippetMatch=excerpt.match(/<(?:a|div|span)\b([^>]*)>([\s\S]*?)<\/(?:a|div|span)>/gi)||[]
    let snippet=''
    for(const part of snippetMatch){
      const open=part.match(/^<\w+\b([^>]*)>/)?.[1]||''
      if(/(?:^|\s)(?:result__snippet|result-snippet)(?:\s|$)/i.test(attr(open,'class'))){
        snippet=tagText(part).slice(0,500);break
      }
    }
    seen.add(url);results.push({title,url,snippet})
  }
  return results
}
export function parseBingRssResults(xml,limit=8){
  const results=[],seen=new Set()
  for(const item of String(xml||'').match(/<item\b[^>]*>[\s\S]*?<\/item>/gi)||[]){
    const title=tagText(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||'').slice(0,180)
    const url=safeResultUrl(tagText(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1]||''),'https://www.bing.com/')
    const snippet=tagText(item.match(/<description>([\s\S]*?)<\/description>/i)?.[1]||'').slice(0,500)
    if(!title||!url||seen.has(url))continue
    seen.add(url);results.push({title,url,snippet})
    if(results.length>=limit)break
  }
  return results
}
export function isSearchChallenge(html){
  const content=String(html||'')
  return /(anomaly\.js|challenge-form|verify you are human|are you a human|captcha|unusual traffic|robot check|unusual activity)/i.test(content)
}
