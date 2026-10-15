import http from 'node:http'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'

const port=19600+Math.floor(Math.random()*500)
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rt-calibration-'))
const cfg=path.join(tmp,'config'),state=path.join(tmp,'state')
const models=[
 {name:'qwen3:4b',size:2600*1024*1024,details:{family:'qwen3'}},
 {name:'qwen3:8b',size:5100*1024*1024,details:{family:'qwen3'}},
 {name:'qwen2.5-coder:3b',size:2100*1024*1024,details:{family:'qwen2'}},
 {name:'gemma3:4b',size:3300*1024*1024,details:{family:'gemma3'}}
]
const reply=(model,prompt)=>{
 const p=prompt.toLowerCase()
 if(p.includes('exatamente duas frases')) return model.includes('8b')?'CRM organiza o relacionamento com clientes. Ele apoia vendas e acompanhamento comercial.':'CRM organiza informações.'
 if(p.includes('no máximo 3 bullets')) return model.includes('8b')?'- Fazer contato e confirmar o próximo passo.\n- Revisar proposta e objeções.\n- Agendar tarefa com data definida.':'- Tente novamente' 
 if(p.includes('reescreva de forma profissional')) return model.includes('8b')?'Olá, você conseguiu revisar a proposta? Podemos conversar sobre seu retorno?':'Oi.'
 if(p.includes('24 propostas')) return '6. 25% de 24 equivale a 6 propostas.'
 if(p.includes('plano a custa')) return 'Plano A: 6×60−400 = -40. Plano B: 12×60−550 = R$ 170. Plano B gera maior ganho líquido.'
 if(p.includes('ana chegou')) return 'Daniela. Ela chegou antes de Ana, que chegou antes de Bruno e Carlos.'
 if(p.includes('function sum')) return 'function sum(a, b) { return a + b; }'
 if(p.includes('normalize(value')) return "function normalize(value: string | null) { return (value ?? '').trim(); }"
 if(p.includes('postgresql')) return "SELECT * FROM opportunities WHERE updated_at < NOW() - INTERVAL '7 days' AND status <> 'closed' ORDER BY updated_at ASC;"
 if(p.includes('botão destacado')) return 'O botão diz SALVAR e fica no canto inferior direito da tela.'
 return 'Resposta curta e direta.'
}
const server=http.createServer(async(req,res)=>{
 let raw='';for await(const c of req)raw+=c
 const body=raw?JSON.parse(raw):{}
 res.setHeader('content-type','application/json')
 if(req.url==='/api/tags') return res.end(JSON.stringify({models}))
 if(req.url==='/api/ps') return res.end(JSON.stringify({models:[{name:body.model||'qwen3:8b',size:4000*1024*1024,size_vram:0}]}))
 if(req.url==='/api/generate'){
   if(body.prompt==='') return res.end(JSON.stringify({done:true,response:''}))
   const slow=String(body.model).includes('8b')?25:5;await new Promise(r=>setTimeout(r,slow))
   return res.end(JSON.stringify({done:true,response:reply(body.model,body.prompt),eval_count:30,eval_duration:String(String(body.model).includes('8b')?1_500_000_000:700_000_000),load_duration:'100000000'}))
 }
 res.statusCode=404;res.end('{}')
})
await new Promise(r=>server.listen(port,'127.0.0.1',r))
const env={...process.env,OLLAMA_URL:`http://127.0.0.1:${port}`,XDG_CONFIG_HOME:cfg,XDG_STATE_HOME:state}
function run(args){return new Promise((resolve,reject)=>{const c=spawn(process.execPath,['model-calibration.mjs',...args],{cwd:new URL('.',import.meta.url),env,stdio:['ignore','pipe','pipe']});let out='',err='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>err+=d);c.on('exit',code=>code===0?resolve(out):reject(Error(err||out)))})}
let ok=0;const t=(n,p)=>{console.log(`${p?'OK  ':'FAIL'} ${n}`);if(p)ok++}
try{
 const out=await run(['arena','all']);t('arena executes against Ollama API',/Relatório:/.test(out))
 const reportPath=path.join(state,'realtalent-agent','calibration','model-calibration-v3.1.1.json');const report=JSON.parse(fs.readFileSync(reportPath,'utf8'))
 t('four roles measured',new Set(report.results.map(x=>x.role)).size===4)
 t('general quality prefers 8b',report.recommendations.general==='qwen3:8b')
 t('reasoning calibrated',Boolean(report.recommendations.reasoning))
 t('coder calibrated',report.recommendations.coder==='qwen2.5-coder:3b')
 t('vision calibrated',report.recommendations.vision==='gemma3:4b')
 await run(['apply']);const envFile=fs.readFileSync(path.join(cfg,'realtalent-agent','agent.env'),'utf8')
 t('apply writes calibrated roles',/OLLAMA_GENERAL_MODEL=qwen3:8b/.test(envFile)&&/OLLAMA_CODER_MODEL=qwen2.5-coder:3b/.test(envFile))
 const applied=JSON.parse(fs.readFileSync(path.join(cfg,'realtalent-agent','model-calibration.json'),'utf8'));t('applied provenance recorded',applied.version==='3.1.1'&&applied.source===reportPath)
 console.log(`\nModel Calibration Integration V3.1.1: ${ok}/8 PASS`);if(ok!==8)process.exitCode=1
}finally{server.close();fs.rmSync(tmp,{recursive:true,force:true})}
