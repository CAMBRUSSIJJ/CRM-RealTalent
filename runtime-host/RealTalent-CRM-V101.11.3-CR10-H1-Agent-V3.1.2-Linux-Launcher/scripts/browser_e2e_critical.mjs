import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
const root=process.cwd(); const flows=JSON.parse(fs.readFileSync(path.join(root,'qa/critical-browser-flows.json'),'utf8')).flows??[]
if(!fs.existsSync(path.join(root,'dist/index.html'))){console.error('E2E browser exige dist/. Execute npm run build primeiro.');process.exit(2)}
const candidates=[process.env.CHROMIUM_BIN,'chromium','chromium-browser','google-chrome'].filter(Boolean)
let browser=null;for(const c of candidates){const r=spawnSync(c,['--version'],{stdio:'ignore'});if(r.status===0){browser=c;break}}
if(!browser){console.error('E2E browser não executado: Chromium/Chrome não encontrado.');process.exit(2)}
const port=4199;const preview=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port',String(port)],{cwd:root,stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms));await sleep(1200);let failed=0
try{for(const flow of flows.filter(f=>f.critical)){const url=`http://127.0.0.1:${port}/${flow.route}`;const r=spawnSync(browser,['--headless=new','--no-sandbox','--disable-gpu','--virtual-time-budget=2500','--dump-dom',url],{encoding:'utf8',maxBuffer:8*1024*1024});const ok=r.status===0&&r.stdout.includes('id="root"')&&!/Application error|Cannot GET/i.test(r.stdout);console.log(`${ok?'OK  ':'FAIL'} ${flow.id} ${url}`);if(!ok)failed++}}finally{preview.kill('SIGTERM')}
if(failed)process.exit(1)
