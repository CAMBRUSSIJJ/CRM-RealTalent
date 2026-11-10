// G5.6: small-business public-source discovery. Search hits are not evidence.
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()
const categories = new Set(['barbearia','barbearias','barber','barbershop','barberia','salao','saloes',
  'salon','studio','estudio','clinica','escola','colegio','loja','academia','restaurante','hotel',
  'padaria','oficina','mercado','farmacia','servicos','servico'])
const stop = new Set(['de','da','do','dos','das','em','no','na','e','rio','grande',
  'rs','ltda','mei','me','comercio','empresa'])
const barber = new Set(['barbearia','barbearias','barber','barbershop','barberia'])
const escapeRx = value => String(value).replace(/[^a-zA-Z0-9]/g,'\\$&')
const tokens = raw => normalize(raw).split(' ').filter(Boolean)

export function canonicalBusinessNameG56(rawName,city=''){
  let name=String(rawName||'').replace(/\s+/g,' ').trim().slice(0,120)
  const cityName=String(city||'').split(',')[0].trim()
  if(cityName.length>=4){
    // "Lelo Barbershop Barbearia em Rio Grande" includes an SEO suffix.
    const tail=new RegExp('\\s+(?:barbearia|barber|barbershop|salao|loja|empresa|servicos?)\\s+(?:em|no|na)\\s+'+escapeRx(cityName)+'\\s*$','i')
    name=name.replace(tail,'')
    const locationTail=new RegExp('\\s+[–—|-]\\s*'+escapeRx(cityName)+'(?:\\s*[-,]?\\s*[A-Z]{2})?\\s*$','i')
    name=name.replace(locationTail,'')
  }
  return name.trim()||String(rawName||'').trim()
}

const categoryGroup = token => barber.has(token)?'barber':categories.has(token)?token:null
const brandTokens = name => tokens(name).filter(token=>token.length>=3&&!stop.has(token)&&!categories.has(token))
const matchedCategory=(name,content)=>{
  const requested=[...new Set(tokens(name).map(categoryGroup).filter(Boolean))]
  if(!requested.length)return true
  const actual=new Set(tokens(content).map(categoryGroup).filter(Boolean))
  return requested.some(category=>actual.has(category))
}
// Reject a person named "Matheus" as a match for "Barbearia Matheus".
// A passing result is only a search candidate; page identity is checked again.
export function businessNameMatchG56(name,content,city=''){
  const brand=canonicalBusinessNameG56(name,city)
  const hay=' '+normalize(content)+' '
  const distinct=brandTokens(brand)
  if(!distinct.length||!distinct.every(token=>hay.includes(' '+token+' ')))return false
  if(distinct.length===1&&!matchedCategory(brand,content))return false
  return true
}

export function buildBusinessQueriesG56(name,city=''){
  const brand=canonicalBusinessNameG56(name,city)
  const place=String(city||'').slice(0,100).replace(/\s+/g,' ').trim()
  const shortCity=place.split(',')[0].trim()
  const variants=[
    '"'+brand.replace(/"/g,' ')+'" '+place,
    brand+' '+place,
    'site:instagram.com "'+brand.replace(/"/g,' ')+'" '+shortCity,
  ]
  const out=[],seen=new Set()
  for(const value of variants){
    const query=value.replace(/\s+/g,' ').trim().slice(0,160)
    const key=normalize(query)
    if(!query||seen.has(key))continue
    seen.add(key);out.push(query)
  }
  return out.slice(0,3)
}
export function publicBusinessSourceKindG56(raw){
  try{
    const url=new URL(raw)
    const host=url.hostname.toLowerCase().replace(/^www\./,'')
    const path=url.pathname.toLowerCase().split('/').filter(Boolean)
    if(host==='instagram.com'){
      const excluded=['p','reel','reels','stories','explore','accounts','direct','about','tv','challenge']
      return path.length===1&&!excluded.includes(path[0])?'social_profile':'social_post'
    }
    if(host==='facebook.com'||host==='m.facebook.com'||host==='fb.com'){
      return path.length===1&&!['watch','posts','groups','events','reel','share','photo'].includes(path[0])?'social_profile':'social_post'
    }
    return 'website'
  }catch{return 'invalid'}
}
const priority = (candidate,city) => {
  const kind=publicBusinessSourceKindG56(candidate.url)
  const location=normalize(String(city||'').split(',')[0])
  const label=normalize(candidate.title+' '+candidate.snippet)
  return (kind==='website'?5:kind==='social_profile'?2:-10)+(location&&label.includes(location)?3:0)
}
export function rankBusinessSourcesG56(candidates,city=''){
  const seen=new Set()
  return (Array.isArray(candidates)?candidates:[])
    .filter(item=>{
      if(!item||typeof item.url!=='string'||seen.has(item.url))return false
      seen.add(item.url)
      return publicBusinessSourceKindG56(item.url)!=='invalid'
    })
    .sort((a,b)=>priority(b,city)-priority(a,city))
}
