// G4.6 — Bounded reading of publicly accessible HTML. Does not log in,
// evade access controls, invoke private Instagram endpoints, or download media.
// All reads use DNS-pinned HTTPS and reject private/unsafe redirects.
import {validResearchUrlV60,pinnedHttpsV60,extractReadableV60} from './crm-web-reader-v60.mjs'

const tidy=(value,max=2500)=>String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ')
  .replace(/\s+/g,' ').trim().slice(0,max)
const decode=value=>String(value||'').replace(/&(?:amp|quot|apos|lt|gt|nbsp|#(\d+)|#x([0-9a-f]+));/gi,(m,d,h)=>{
  if(d||h){const n=parseInt(d||h,d?10:16);return n>31&&n<=0x10ffff?String.fromCodePoint(n):' '}
  return {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[m.slice(1,-1).toLowerCase()]||' '
})
const norm=value=>tidy(value,5000).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const ignored=new Set(['barbearia','barber','loja','empresa','studio','salao','escola','clinica',
  'ltda','comercio','servicos','servico','brasil','rio','grande','do','dos','das','com','de','da'])
const brandWords=value=>norm(value).split(/[^a-z0-9]+/)
  .filter(w=>w.length>=4&&!ignored.has(w)).slice(0,5)
export function evidenceMatchesCompanyG46(company,content){
  const words=brandWords(company)
  const hay=norm(content)
  if(words.length===0||!hay)return false
  // For distinct names require all words; never infer ownership from a generic
  // business category such as "barbearia", "salão" or "escola".
  return words.every(word=>hay.includes(word))
}
const attrs=tag=>{
  const obj={}
  for(const m of String(tag).matchAll(/([a-z-]+)\s*=\s*(['"])(.*?)\2/gi))
    obj[m[1].toLowerCase()]=m[3]
  return obj
}
export function publicPageMetaG46(html){
  const metadata=[]
  const title=extractReadableV60(String(html||''),3000).title
  if(title)metadata.push(title)
  for(const [tag] of String(html||'').matchAll(/<meta\b[^>]*>/gi)){
    const at=attrs(tag),kind=String(at.property||at.name||'').toLowerCase()
    if(['og:description','description','twitter:description','og:title','twitter:title'].includes(kind)
      &&at.content)metadata.push(decode(at.content))
  }
  return {title:tidy(title,160),description:tidy([...new Set(metadata)].join(' · '),700)}
}
export async function readPublicSocialEvidenceG46(source,{company,requestPage=pinnedHttpsV60}={}){
  const url=validResearchUrlV60(source?.url)
  if(!url)return {reading:'snippet',excerpt:'',readStatus:'unsafe_url'}
  let current=url
  const seen=new Set()
  for(let redirects=0;redirects<=2;redirects++){
    if(seen.has(current.href))return {reading:'snippet',excerpt:'',readStatus:'redirect_loop'}
    seen.add(current.href)
    let page
    try{page=await requestPage(current)}catch(error){
      const code=error instanceof Error?error.message:'site_unavailable'
      const status=/private_address_blocked|unsafe/i.test(code)?'unsafe_url':
        /timeout/i.test(code)?'timeout':/non_html_response/i.test(code)?'restricted_or_non_html':'unavailable'
      return {reading:'snippet',excerpt:'',readStatus:status}
    }
    if(page?.redirect){
      const destination=validResearchUrlV60(new URL(page.redirect,current).href)
      if(!destination)return {reading:'snippet',excerpt:'',readStatus:'unsafe_redirect'}
      current=destination;continue
    }
    if(typeof page?.html!=='string')return {reading:'snippet',excerpt:'',readStatus:'non_html'}
    const meta=publicPageMetaG46(page.html)
    const readable=extractReadableV60(page.html,3300)
    const pageIdentity=(meta.title+' '+meta.description+' '+readable.text.slice(0,1200))
    if(!evidenceMatchesCompanyG46(company,pageIdentity)){
      return {reading:'snippet',excerpt:'',readStatus:'identity_not_confirmed'}
    }
    const body=tidy(readable.text,2400)
    const description=meta.description
    if(body.length>=180 && !/sign in to (view|see)|log in to instagram/i.test(body.slice(0,180))){
      return {reading:'page',excerpt:body,readStatus:'read',readTitle:meta.title||readable.title,
        finalUrl:current.href}
    }
    if(description.length>=45){
      return {reading:'metadata',excerpt:description,readStatus:'metadata_only',
        readTitle:meta.title||readable.title,finalUrl:current.href}
    }
    return {reading:'snippet',excerpt:'',readStatus:'no_accessible_text'}
  }
  return {reading:'snippet',excerpt:'',readStatus:'redirect_limit'}
}
// Concurrency and budget are bounded: at most three pages, one profile, one
// publication, one other official business page; no full-feed traversal.
export async function enrichPublicSocialSourcesG46(sources,{company,reader=readPublicSocialEvidenceG46}={}){
  if(!Array.isArray(sources))return []
  const selected=new Set()
  const social=sources.filter(source=>{
    try{return /(^|\.)instagram\.com$/i.test(new URL(source.url).hostname)}catch{return false}
  })
  const profiles=social.filter(s=>/^\/[^/]+\/?$/.test(new URL(s.url).pathname))
  const posts=social.filter(s=>/^\/(?:p|reel)\//.test(new URL(s.url).pathname))
  for(const s of [profiles[0],posts[0],sources.find(x=>!social.includes(x))]){
    if(s?.url)selected.add(s.url)
  }
  return Promise.all(sources.map(async source=>{
    if(!selected.has(source.url))return {...source,reading:'snippet',excerpt:'',readStatus:'not_selected'}
    const evidence=await reader(source,{company})
    // Only explicit successful reads become evidence; unavailable Instagram
    // remains an indexed snippet and is never labeled as a fully read profile.
    return {...source,reading:evidence.reading||'snippet',excerpt:evidence.excerpt||'',
      readStatus:evidence.readStatus||'unknown',readTitle:evidence.readTitle||'',
      finalUrl:evidence.finalUrl||source.url}
  }))
}
