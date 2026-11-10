#!/usr/bin/env node
// Diagnoses a single public HTTPS page using the same G5 reader as the CRM.
// Does NOT change any running Agent, CRM records, files or production state.
import {readPublicPageOpenSourceG50} from '../../runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-open-source-reader-g50.mjs'
const url=process.argv[2]||'https://www.furg.br'
const result=await readPublicPageOpenSourceG50(url,{enabled:true})
const summary={
  ok:result?.ok===true,
  url:result?.url||url,
  engine:result?.engine||'not_available',
  title:result?.title||'',
  error:result?.error||null,
  textLength:typeof result?.text==='string'?result.text.length:0,
  textPreview:typeof result?.text==='string'?result.text.replace(/\s+/g,' ').slice(0,350):'',
}
console.log(JSON.stringify(summary,null,2))
if(!summary.ok)process.exitCode=2
