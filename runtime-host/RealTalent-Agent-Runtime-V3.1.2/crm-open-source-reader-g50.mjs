// Garimpo G5: local, opt-in HTML processing with safe network read and legacy fallback.
// Public HTTPS is fetched ONLY through the pinned DNS reader; the Python worker sees offline HTML.
import {spawn} from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {extractReadableV60,pinnedHttpsV60,readPublicPageV60,validResearchUrlV60} from './crm-web-reader-v60.mjs'

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const WORKER=path.join(ROOT,'scripts/garimpo-open-source/worker.py')
const DEFAULT_PY=path.join(os.homedir(),'.local/share/realtalent-open-source-garimpo/venv/bin/python')
const MAX_HTML=380_000
const MAX_OUTPUT=180_000
let workerBusy=false
const text=(v,n)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,n)

async function readPinnedHtml(raw,{requestPage=pinnedHttpsV60}={}){
  let url=validResearchUrlV60(raw)
  if(!url)return {ok:false,error:'unsupported_url'}
  const seen=new Set()
  for(let i=0;i<=2;i++){
    if(seen.has(url.href))return {ok:false,error:'redirect_loop'}
    seen.add(url.href)
    let result
    try{result=await requestPage(url)}catch{return {ok:false,error:'read_failed'}}
    if(result.redirect){
      try{url=validResearchUrlV60(new URL(result.redirect,url).href)}
      catch{return {ok:false,error:'unsafe_redirect'}}
      if(!url)return {ok:false,error:'unsafe_redirect'}
      continue
    }
    if(typeof result.html!=='string'||Buffer.byteLength(result.html,'utf8')>MAX_HTML)
      return {ok:false,error:'invalid_html'}
    return {ok:true,url:url.href,html:result.html}
  }
  return {ok:false,error:'too_many_redirects'}
}

function invokeWorker(payload,{python=process.env.REALTALENT_GARIMPO_PYTHON||DEFAULT_PY,timeoutMs=45000}={}){
  return new Promise((resolve,reject)=>{
    let done=false,out='',err=''
    const child=spawn(python,[WORKER],{
      cwd:ROOT,stdio:['pipe','pipe','pipe'],
      env:{HOME:process.env.HOME||os.homedir(),PATH:process.env.PATH||'/usr/bin:/bin',
        PYTHONUNBUFFERED:'1',REALTALENT_OLLAMA_MODEL:process.env.REALTALENT_OLLAMA_MODEL||'qwen3:8b',
        REALTALENT_GARIMPO_SCRAPEGRAPH:process.env.REALTALENT_GARIMPO_SCRAPEGRAPH||'0'},
    })
    const finish=(error,result)=>{
      if(done)return
      done=true;clearTimeout(timer)
      if(error)reject(error);else resolve(result)
    }
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new Error('worker_timeout'))},timeoutMs)
    child.on('error',e=>finish(e))
    child.stdout.on('data',chunk=>{
      out+=chunk.toString('utf8')
      if(out.length>MAX_OUTPUT){child.kill('SIGKILL');finish(new Error('worker_output_too_large'))}
    })
    child.stderr.on('data',chunk=>{err=(err+chunk.toString('utf8')).slice(-2000)})
    child.on('close',code=>{
      if(code!==0)return finish(new Error('worker_failed'))
      try{finish(null,JSON.parse(out))}catch{finish(new Error('worker_invalid_response'))}
    })
    child.stdin.on('error',()=>{})
    child.stdin.end(JSON.stringify(payload))
  })
}

export async function readPublicPageOpenSourceG50(raw,{
  enabled=process.env.REALTALENT_GARIMPO_OPEN_SOURCE==='1',
  requestPage=pinnedHttpsV60,
  fallback=readPublicPageV60,
  worker=invokeWorker,
}={}){
  if(!enabled||workerBusy)return fallback(raw)
  workerBusy=true
  try{
    const fetched=await readPinnedHtml(raw,{requestPage})
    if(!fetched.ok)return fallback(raw)
    const original=extractReadableV60(fetched.html)
    if(original.text.length<180)return {ok:false,error:'insufficient_content'}
    const result=await worker({html:fetched.html,mode:'extract'})
    if(result?.ok!==true||typeof result.text!=='string'||result.text.length<180)
      return {ok:true,url:fetched.url,...original,engine:'legacy_fallback'}
    const processed=result.text.slice(0,6500)
    // ScrapeGraphAI output remains a suggestion until it can be matched exactly to a read page.
    const extractedFacts=(Array.isArray(result.facts)?result.facts:[])
      .filter(x=>x&&typeof x==='object')
      .map(x=>({fact:text(x.fact,200),quote:text(x.quote,300)}))
      .filter(x=>x.fact&&x.quote.length>=18&&
        (original.text.includes(x.quote)||processed.includes(x.quote))).slice(0,3)
    return {ok:true,url:fetched.url,title:original.title,text:processed,engine:'crawl4ai',
      extractedFacts}
  }catch{
    return fallback(raw)
  }finally{workerBusy=false}
}
