export interface InvestigationSourceG53 {
  title:string
  url:string
  reading:'page'|'snippet'
  identity:'compatible'|'partial'|'unconfirmed'
  origin:string
  excerpt:string
  engine?:string
  readError?:string|null
  sourceKind?:'website'|'social_profile'|'social_post'
}

export interface GroupedInvestigationSourceG53 {
  domain:string
  count:number
  primary:InvestigationSourceG53
  urls:string[]
}

// Website variants count as a single domain. Repetitions are still accessible
// via the original URL list. Unverified sources never become verified merely
// because they share a domain with a verified source.
export function groupInvestigationSourcesG53(sources:InvestigationSourceG53[]=[]):GroupedInvestigationSourceG53[]{
  const groups=new Map<string,GroupedInvestigationSourceG53>()
  const preference=(item:InvestigationSourceG53)=>
    (item.reading==='page'?4:0)+(item.identity==='compatible'?2:item.identity==='partial'?1:0)
    +(item.engine==='crawl4ai'?1:0)
  for(const source of sources){
    let domain='',key=''
    try{
      const url=new URL(source.url)
      domain=url.protocol==='https:'?url.hostname.toLowerCase().replace(/^www\./,''):''
      key=source.sourceKind==='social_profile'&&url.pathname.split('/').filter(Boolean).length
        ?domain+'|'+url.pathname.split('/').filter(Boolean)[0].toLowerCase():domain
    }catch{/* invalid link */}
    if(!domain)continue
    const existing=groups.get(key)
    if(existing){
      existing.count++
      if(!existing.urls.includes(source.url))existing.urls.push(source.url)
      if(preference(source)>preference(existing.primary))existing.primary=source
    }else{
      groups.set(key,{domain,count:1,primary:source,urls:[source.url]})
    }
  }
  return [...groups.values()]
}
