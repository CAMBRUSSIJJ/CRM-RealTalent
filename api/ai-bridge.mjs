const sendJson=(res,status,body)=>{res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(body))}

const bearer=(req)=>{const raw=String(req.headers.authorization||'').trim();return raw.toLowerCase().startsWith('bearer ')?raw.slice(7).trim():''}
const runtimeOidc=(req)=>String(req.headers['x-vercel-oidc-token']||process.env.VERCEL_OIDC_TOKEN||'').trim()

export default async function handler(req,res){
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end()}
  const bridgeToken=String(process.env.REALTALENT_AI_BRIDGE_TOKEN||'').trim()
  if(!bridgeToken||bearer(req)!==bridgeToken)return sendJson(res,401,{ok:false,error:'unauthorized_ai_bridge'})
  const oidc=runtimeOidc(req)
  if(req.method==='GET'){
    return sendJson(res,200,{ok:true,service:'realtalent-ai-bridge',gateway:'vercel-ai-gateway',model:String(process.env.REALTALENT_AI_GATEWAY_MODEL||'openai/gpt-5.6-sol'),oidcConfigured:Boolean(oidc)})
  }
  if(req.method!=='POST')return sendJson(res,405,{ok:false,error:'method_not_allowed'})
  if(!oidc)return sendJson(res,503,{ok:false,error:'vercel_oidc_not_configured'})
  let payload=req.body
  if(Buffer.isBuffer(payload))payload=payload.toString('utf8')
  if(typeof payload==='string'){
    try{payload=JSON.parse(payload)}catch{return sendJson(res,400,{ok:false,error:'invalid_json'})}
  }
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return sendJson(res,400,{ok:false,error:'invalid_payload'})
  const model=String(process.env.REALTALENT_AI_GATEWAY_MODEL||'openai/gpt-5.6-sol').trim()
  const upstreamPayload={...payload,model}
  try{
    const upstream=await fetch('https://ai-gateway.vercel.sh/v1/responses',{
      method:'POST',
      headers:{authorization:`Bearer ${oidc}`,'content-type':'application/json'},
      body:JSON.stringify(upstreamPayload),
      signal:AbortSignal.timeout(55_000),
    })
    const body=Buffer.from(await upstream.arrayBuffer())
    res.statusCode=upstream.status
    res.setHeader('content-type',upstream.headers.get('content-type')||'application/json; charset=utf-8')
    res.setHeader('cache-control','no-store')
    res.setHeader('x-realtalent-ai-provider','vercel-ai-gateway')
    return res.end(body)
  }catch(error){return sendJson(res,502,{ok:false,error:'ai_gateway_unavailable',message:String(error?.message||error).slice(0,240)})}
}
