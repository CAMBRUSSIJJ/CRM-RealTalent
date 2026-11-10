#!/usr/bin/env node
// Read-only G5.3 end-to-end diagnosis for a public organization.
// Makes no CRM writes, sends or opportunity approvals.
const target='http://127.0.0.1:8791'
const company=process.argv[2]||'Universidade Federal do Rio Grande FURG'
const city=process.argv[3]||'Rio Grande, RS'
const website=process.argv[4]||'https://www.furg.br'
try{
  const statusResponse=await fetch(target+'/tools/prospect-investigate/status',{signal:AbortSignal.timeout(5000)})
  const status=await statusResponse.json()
  if(!statusResponse.ok||status.investigationReaderBuild!=='g53-qwen-diagnostics'||!status.openSourceEnabled){
    console.error('Agent G5.3 não está carregado ou Crawl4AI está desativado.')
    console.error('Status:',JSON.stringify(status))
    process.exit(2)
  }
  console.log('Agent G5.3 confirmado. Investigando fontes públicas com Qwen local...')
  const response=await fetch(target+'/tools/prospect-investigate',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({company,city,website,segment:'Educação Superior'}),
    signal:AbortSignal.timeout(240000),
  })
  const data=await response.json()
  console.log('\n===== DIAGNÓSTICO DA INVESTIGAÇÃO =====')
  console.log(JSON.stringify({
    httpStatus:response.status,ok:data.ok,pageRead:data.pageRead,quality:data.quality,
    searchStatus:data.searchStatus,modelStatus:data.modelStatus||'não_informado',
    modelHttpStatus:data.modelHttpStatus??null,modelDoneReason:data.modelDoneReason??null,
    modelElapsedMs:data.modelElapsedMs??null,modelEvidenceCount:data.modelEvidenceCount??null,
    summary:data.summary||null,events:(data.candidateEvents||[]).length,
    sources:(data.sources||[]).map(x=>({url:x.url,engine:x.engine,
      reading:x.reading,identity:x.identity,readError:x.readError})),
    caveats:data.caveats||[],
  },null,2))
  if(!response.ok||data.ok!==true||data.modelStatus!=='completed')
    process.exitCode=3
}catch(error){
  console.error('Falha na consulta local:',error?.name==='TimeoutError'?'request_timeout':String(error?.cause?.code||error?.name||'network_error'))
  process.exitCode=4
}
