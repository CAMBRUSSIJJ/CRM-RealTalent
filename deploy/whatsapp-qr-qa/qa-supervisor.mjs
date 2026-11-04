import http from 'node:http'
import { spawn } from 'node:child_process'
import { timingSafeEqual } from 'node:crypto'

const PORT = Number(process.env.PORT || 8080)
const GATEWAY_PORT = 3002
const GATEWAY_BASE = `http://127.0.0.1:${GATEWAY_PORT}`
const TOKEN = String(process.env.REALTALENT_RUNTIME_TOKEN || '')
const WORKSPACE = String(process.env.REALTALENT_QA_WORKSPACE_ID || '')
const VALID_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

if (TOKEN.length < 32 || !VALID_UUID.test(WORKSPACE)) {
  console.error('[qa] Credencial isolada ou workspace de teste ausente.')
  process.exit(1)
}

const safeEqual = (supplied) => {
  const a = Buffer.from(String(supplied || ''))
  const b = Buffer.from(TOKEN)
  return a.length === b.length && timingSafeEqual(a, b)
}
const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(data))
}
const gatewayFetch = (route, { method = 'GET', body } = {}) =>
  fetch(GATEWAY_BASE + route, {
    method,
    headers: { 'x-realtalent-runtime-token': TOKEN, ...(body ? { 'content-type':'application/json' } : {}) },
    ...(body ? { body:JSON.stringify(body) } : {}),
    signal:AbortSignal.timeout(5_000),
  })
const child = spawn(process.execPath,
  ['/app/launcher/scripts/realtalent-communications-gateway.mjs'],
  { env: { ...process.env, REALTALENT_COMMUNICATIONS_HOST:'127.0.0.1', REALTALENT_COMMUNICATIONS_PORT:String(GATEWAY_PORT) }, stdio:'inherit' })
child.on('exit', (code, signal) => {
  console.error('[qa] Gateway encerrou:', code, signal)
  process.exit(code || 1)
})

let lastReport = ''
const reportQr = async () => {
  try {
    const response = await gatewayFetch(`/api/integrations/whatsapp/qr/status?workspaceId=${encodeURIComponent(WORKSPACE)}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const status = await response.json()
    const report = JSON.stringify({ state:status.state, hasQr:Boolean(status.qrDataUrl), error:status.lastError || null })
    if (report !== lastReport) { console.log('[qa] Status QR:', report); lastReport=report }
  } catch(error) { console.warn('[qa] Consulta QR:', String(error.message || error)) }
}
const bootstrap = async () => {
  for(let i=0; i<24; i++){
    try {
      const health = await gatewayFetch('/api/communications/health')
      if (health.ok) {
        const payload=await health.json()
        console.log('[qa] Gateway pronto:', JSON.stringify({ version:payload.version, liveRevision:payload.whatsappLiveFixRevision }))
        if(process.env.REALTALENT_QA_AUTOSTART_QR === 'true'){
          const started = await gatewayFetch('/api/integrations/whatsapp/qr/start', { method:'POST', body:{ workspaceId:WORKSPACE, displayName:'WhatsApp QA isolado' } })
          console.log('[qa] Solicitação de QR:', started.status)
          if(!started.ok) console.warn('[qa] Inicialização rejeitada HTTP',started.status)
        }
        await reportQr()
        setInterval(reportQr, 7_000).unref()
        return
      }
    } catch {}
    await new Promise(resolve=>setTimeout(resolve, 1500))
  }
  console.error('[qa] Gateway não respondeu ao boot.')
}
void bootstrap()

const ALLOWED = new Set([
  'GET /api/communications/health',
  'GET /api/communications/revision',
  'GET /api/integrations/accounts',
  'GET /api/integrations/whatsapp/qr/status',
  'GET /api/integrations/whatsapp/qr/diagnostics',
  'POST /api/integrations/whatsapp/qr/start',
])
const server = http.createServer(async (req,res) => {
  const u = new URL(req.url || '/', 'http://localhost')
  const route = u.pathname
  if (route === '/health' && req.method === 'GET') {
    try {
      const r=await gatewayFetch('/api/communications/health')
      return json(res, r.ok ? 200:503, { ok:r.ok, service:'realtalent-whatsapp-qa', gateway:r.ok ? 'healthy':'unavailable', isolated:true })
    } catch { return json(res,503,{ok:false,service:'realtalent-whatsapp-qa',isolated:true}) }
  }
  if (route === '/qa' && req.method === 'GET') {
    res.writeHead(200, {'content-type':'text/html; charset=utf-8','cache-control':'no-store',
      'content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; frame-ancestors 'none'" })
    return res.end(PAIR_PAGE.replaceAll('__QA_WORKSPACE__', WORKSPACE))
  }
  const supplied = String(req.headers['x-realtalent-runtime-token'] || '')
  if (!safeEqual(supplied)) return json(res,401,{ok:false,error:'qa_access_denied'})
  if (route === '/qa/diagnostics' && req.method === 'GET') {
    try{
      const [h,s] = await Promise.all([
        gatewayFetch('/api/communications/health'),
        gatewayFetch(`/api/integrations/whatsapp/qr/status?workspaceId=${encodeURIComponent(WORKSPACE)}`),
      ])
      const a=await h.json(),b=await s.json()
      return json(res,200,{ok:h.ok && s.ok,version:a.version,liveRevision:a.whatsappLiveFixRevision, state:b.state, hasQr:Boolean(b.qrDataUrl), lastError:b.lastError || null})
    }catch(e){return json(res,502,{ok:false,error:String(e.message || e)})}
  }
  if (!ALLOWED.has(`${req.method} ${route}`)) return json(res,403,{ok:false,error:'qa_read_only_route'})
  const requestedWorkspace = req.method === 'GET' ? u.searchParams.get('workspaceId') : null
  if (req.method === 'GET' && route !== '/api/communications/health' && requestedWorkspace !== WORKSPACE) return json(res,403,{ok:false,error:'qa_workspace_mismatch'})
  if (req.method === 'POST') {
    let raw=''
    for await(const chunk of req) { raw+=chunk.toString(); if(raw.length>4096) return json(res,413,{ok:false,error:'too_large'}) }
    let parsed; try{parsed=JSON.parse(raw)}catch{return json(res,400,{ok:false,error:'invalid_json'})}
    if(parsed.workspaceId !== WORKSPACE) return json(res,403,{ok:false,error:'qa_workspace_mismatch'})
    const result = await gatewayFetch(route, {method:'POST',body:parsed}).catch(()=>null)
    if(!result) return json(res,502,{ok:false,error:'gateway_unavailable'})
    const rawResponse=await result.text()
    res.writeHead(result.status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'})
    return res.end(rawResponse)
  }
  try {
    const result=await gatewayFetch(route+u.search)
    res.writeHead(result.status, {'content-type':result.headers.get('content-type') || 'application/json','cache-control':'no-store'})
    return res.end(Buffer.from(await result.arrayBuffer()))
  }catch{return json(res,502,{ok:false,error:'gateway_unavailable'})}
})
server.listen(PORT, '0.0.0.0', ()=>console.log('[qa] Serviço isolado iniciado na porta', PORT))
process.on('SIGTERM',()=>{child.kill('SIGTERM'); server.close()})

const PAIR_PAGE = `<!doctype html>
<html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>RealTalent - WhatsApp QR QA</title>
<style>body{font:16px system-ui,sans-serif;margin:0;background:#f1f4fa;color:#14234c}main{max-width:640px;margin:4rem auto;background:white;padding:2rem;border-radius:16px;box-shadow:0 12px 30px #0001}label,input,button{display:block}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #b7c0d0;border-radius:8px;margin:8px 0 18px}button{background:#214ed8;color:white;border:0;border-radius:8px;padding:12px 18px;cursor:pointer}button:disabled{opacity:.5}#qr{display:none;width:320px;max-width:100%;margin:20px auto}small{color:#52617a}#message{white-space:pre-wrap}</style>
<main><h1>Teste isolado do WhatsApp QR</h1>
<p>Este ambiente não compartilha sessão nem dados com o CRM em produção. Não envia mensagens.</p>
<label>Credencial do ambiente QA<input id="secret" type="password" autocomplete="off"></label>
<button id="start">Verificar / iniciar QR</button>
<img id="qr" alt="QR temporário para pareamento de teste"><p id="message">Informe a credencial isolada para iniciar a consulta.</p>
<small>Depois de escanear, aguarde até aparecer conectado. Não use a credencial de produção.</small></main>
<script>
const ws='__QA_WORKSPACE__';
const btn=document.getElementById('start'),qr=document.getElementById('qr'),msg=document.getElementById('message'),secret=document.getElementById('secret');
let timer;
async function req(path, method='GET', body) {
  const r=await fetch(path,{method,headers:{'x-realtalent-runtime-token':secret.value,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const value=await r.json();if(!r.ok)throw Error(value.error||'HTTP '+r.status);return value;
}
async function tick(){
 try{
  const x=await req('/api/integrations/whatsapp/qr/status?workspaceId='+encodeURIComponent(ws));
  qr.style.display=x.qrDataUrl ? 'block':'none';
  if(x.qrDataUrl)qr.src=x.qrDataUrl;
  msg.textContent='Estado: '+x.state+(x.lastError?'\\n'+x.lastError:'');
  if(x.state==='connected'){clearInterval(timer);btn.disabled=false;msg.textContent='WhatsApp conectado somente ao ambiente QA.'}
 }catch(e){clearInterval(timer);btn.disabled=false;msg.textContent=String(e.message||e)}
}
btn.onclick=async()=>{
 btn.disabled=true; clearInterval(timer);
 try{
  await req('/api/integrations/whatsapp/qr/start','POST',{workspaceId:ws,displayName:'WhatsApp QA isolado'});
  await tick();timer=setInterval(tick,1600);
 }catch(e){btn.disabled=false;msg.textContent=String(e.message||e)}
};
</script></html>`
