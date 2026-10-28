import {get as httpsGet} from 'node:https'
import {lookup as dnsLookup} from 'node:dns/promises'
import {isIP} from 'node:net'

export function isPublicIpV60(ip){
  if(isIP(ip)===4){
    const a=ip.split('.').map(Number),[x,y]=a
    if(x===0||x===10||x===127||x>=224||x===169&&y===254||
       x===172&&y>=16&&y<=31||x===192&&y===168||
       x===100&&y>=64&&y<=127||x===192&&(y===0||y===88&&a[2]===99||y===0&&a[2]===2)||
       x===198&&(y===18||y===19||y===51&&a[2]===100)||
       x===203&&y===0&&a[2]===113||x===192&&y===0&&a[2]===2)return false
    return true
  }
  if(isIP(ip)===6){
    const value=ip.toLowerCase()
    // Only globally routable 2000::/3. Deny documentation and special mappings.
    if(!/^[23][0-9a-f]{0,3}:/.test(value)||value.startsWith('2001:db8:'))return false
    return true
  }
  return false
}

export function validResearchUrlV60(raw){
  try{
    const url=new URL(raw)
    if(url.protocol!=='https:'||url.username||url.password||
      (url.port&&url.port!=='443')||url.href.length>1300||
      !url.hostname.includes('.')||url.hostname.endsWith('.local')||
      url.hostname.endsWith('.internal')||url.hostname.endsWith('.localhost')||
      url.hostname.endsWith('.test')||url.hostname.endsWith('.invalid')||
      url.hostname.endsWith('.example')||url.hostname==='localhost'||
      isIP(url.hostname))return null
    url.hash=''
    return url
  }catch{return null}
}
const decode=(text)=>text.replace(/&(?:amp|quot|apos|lt|gt|nbsp|#(\d+)|#x([0-9a-f]+));/gi,(full,d,h)=>{
  if(d||h){const cp=Number.parseInt(d||h,d?10:16);return cp>31&&cp<=0x10ffff?String.fromCodePoint(cp):' '}
  return {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[full.slice(1,-1).toLowerCase()]||' '
})
export function extractReadableV60(html,limit=6500){
  if(typeof html!=='string')return {title:'',text:''}
  const title=decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'').replace(/<[^>]+>/g,'').trim().slice(0,160)
  let text=html.replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<(script|style|noscript|svg|header|footer|nav|form|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
    .replace(/<br\b[^>]*>|<\/(?:p|div|li|section|article|h[1-6]|tr)>/gi,'\n')
    .replace(/<[^>]+>/g,' ')
  text=decode(text).split('\n').map(x=>x.replace(/\s+/g,' ').trim())
    .filter(x=>x.length>=18 && !/^(?:cookie settings|privacy policy|aceitar cookies)$/i.test(x))
    .join('\n').slice(0,limit)
  return {title,text}
}
const MAX_BYTES=380_000
export async function pinnedHttpsV60(url,{resolve=dnsLookup,request=httpsGet}={}){
  return new Promise((yes,no)=>{
    const req=request(url,{
      headers:{'user-agent':'RealTalent-Research/1.0 (+local browser; no login)','accept':'text/html,text/plain;q=0.8'},
      timeout:8500,
      lookup:(host,opts,callback)=>{
        Promise.resolve(resolve(host,{all:true,verbatim:true})).then(addresses=>{
          const allowed=(Array.isArray(addresses)?addresses:[]).find(item=>isPublicIpV60(item.address))
          if(!allowed)return callback(new Error('private_address_blocked'))
          callback(null,allowed.address,allowed.family)
        }).catch(callback)
      }
    },res=>{
      const type=String(res.headers['content-type']||'')
      if([301,302,303,307,308].includes(res.statusCode)){
        res.resume();yes({redirect:String(res.headers.location||'')});return
      }
      if(res.statusCode!==200 || !/text\/(?:html|plain)/i.test(type)){
        res.resume();no(new Error('non_html_response'));return
      }
      const buffers=[];let bytes=0
      res.on('data',chunk=>{
        bytes+=chunk.length
        if(bytes>MAX_BYTES){req.destroy(new Error('page_too_large'));return}
        buffers.push(chunk)
      })
      res.once('end',()=>yes({html:Buffer.concat(buffers).toString('utf8')}))
      res.once('error',no)
    })
    req.once('timeout',()=>req.destroy(new Error('page_timeout')))
    req.once('error',no)
  })
}
export async function readPublicPageV60(raw,{requestPage=pinnedHttpsV60,maxRedirects=2}={}){
  let url=validResearchUrlV60(raw)
  if(!url)return {ok:false,error:'unsupported_url'}
  const seen=new Set()
  for(let redirect=0;redirect<=maxRedirects;redirect++){
    if(seen.has(url.href))return {ok:false,error:'redirect_loop'}
    seen.add(url.href)
    try{
      const result=await requestPage(url)
      if(result.redirect){
        url=validResearchUrlV60(new URL(result.redirect,url).href)
        if(!url)return {ok:false,error:'unsafe_redirect'}
        continue
      }
      const page=extractReadableV60(result.html)
      if(page.text.length<180)return {ok:false,error:'insufficient_content'}
      return {ok:true,url:url.href,title:page.title,text:page.text}
    }catch(err){
      return {ok:false,error:err instanceof Error?err.message.slice(0,85):'read_failed'}
    }
  }
  return {ok:false,error:'too_many_redirects'}
}
