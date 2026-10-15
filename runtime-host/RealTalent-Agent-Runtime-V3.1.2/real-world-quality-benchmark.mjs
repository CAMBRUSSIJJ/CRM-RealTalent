import fs from 'node:fs'
import {fileURLToPath} from 'node:url'
import {classifyConversationTurn} from './conversation-intelligence.mjs'
import {refineReference31,rankToolsForRequest,naturalizeResponse,buildResponseStyleProfile,selectPrecisionContext,buildLatencyBudget} from './intelligence-quality.mjs'
import {nativeAppToolCatalog} from './app-tools.mjs'
import {classifyVisualIntent} from './multimodal-intelligence.mjs'
import {rag2Thresholds} from './memory-knowledge.mjs'
const dataset=JSON.parse(fs.readFileSync(fileURLToPath(new URL('./REAL_WORLD_QUALITY_DATASET_V3.1.json',import.meta.url)),'utf8'))
const result=[]
const messagesFrom=(arr=[])=>arr.map((content,i)=>({role:i%2===0?'user':'assistant',content}))
for(const c of dataset.cases){let ok=false,actual=null
  try{
    if(c.category==='intent'){actual=classifyConversationTurn({message:c.message,messages:[],product:'auto',attachments:c.attachments||[],appContext:c.appContext||null});ok=actual.intent===c.expect.intent}
    else if(c.category==='reference'){const cs=(c.baseCandidates||[]).map(([source,confidence])=>({source,confidence}));actual=refineReference31({message:c.message,attachments:c.attachments||[],baseReference:{source:cs[0]?.source||'explicit_message',confidence:cs[0]?.confidence||1,candidates:cs}});ok=actual.source===c.expect.source}
    else if(c.category==='tool'){actual=rankToolsForRequest({message:c.message,tools:nativeAppToolCatalog(c.product),product:c.product});ok=actual.rankedTools[0]?.name===c.expect.tool}
    else if(c.category==='style'){if(c.input){actual=naturalizeResponse(c.input,{avoidGenericPreamble:true,avoidGenericClosing:true,maxHeadings:2});ok=c.expect.outputStarts?actual.startsWith(c.expect.outputStarts):!actual.includes(c.expect.notContains)}else{actual=buildResponseStyleProfile({turnPlan:{intent:c.intent},complexity:{tier:c.tier||'standard'}});ok=actual.maxHeadings===c.expect.maxHeadings}}
    else if(c.category==='context'){actual=selectPrecisionContext({messages:messagesFrom(c.messages),query:c.query,limit:3,topicShift:Boolean(c.topicShift)});const joined=actual.map(x=>x.content).join(' ');ok=c.expect.count!=null?actual.length===c.expect.count:joined.includes(c.expect.contains)&&(!c.expect.notContains||!joined.includes(c.expect.notContains))}
    else if(c.category==='latency'){actual=buildLatencyBudget({complexity:{tier:c.tier}});ok=actual.maxOutputTokens===c.expect.maxOutputTokens}
    else if(c.category==='visual'){const attachments=Array.from({length:c.imageCount},(_,i)=>({name:`x${i}.png`,type:'image/png',dataUrl:'data:image/png;base64,AA=='}));actual=classifyVisualIntent({prompt:c.message,attachments});ok=actual.kind===c.expect.kind}
    else if(c.category==='rag'){actual=rag2Thresholds(c.query);ok=Object.entries(c.expect).every(([k,v])=>actual[k]===v)}
  }catch(e){actual={error:e.message}}
  result.push({id:c.id,category:c.category,ok,actual})
}
const by={};for(const r of result){by[r.category]??={pass:0,total:0};by[r.category].total++;if(r.ok)by[r.category].pass++}
const pass=result.filter(x=>x.ok).length,total=result.length,score=Math.round(pass/total*1000)
for(const [k,v] of Object.entries(by))console.log(`${v.pass===v.total?'PASS':'FAIL'} ${k}: ${v.pass}/${v.total}`)
for(const r of result.filter(x=>!x.ok))console.log(`  FAIL ${r.id}: ${JSON.stringify(r.actual)}`)
console.log(`\nReal-world Quality V3.1: ${pass}/${total} · ${score}/1000`)
if(pass!==total)process.exit(1)
