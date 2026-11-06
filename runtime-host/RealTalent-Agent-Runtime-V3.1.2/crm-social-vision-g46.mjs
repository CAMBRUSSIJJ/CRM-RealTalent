// G4.6 optional screenshot analysis, exclusively through local Ollama.
// The image is user-supplied, never fetched via unauthorized Instagram endpoints,
// never written to disk and never used to auto-approve a CRM signal.
const byteLimit=2_100_000
const clean=(s,n=500)=>String(s||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n)
export function validateLocalScreenshotG46(input){
  if(!input||typeof input!=='object')return {ok:false,error:'invalid_image'}
  const mime=String(input.mime||'')
  const raw=String(input.imageBase64||'')
  if(!['image/png','image/jpeg','image/webp'].includes(mime)||
    raw.length<100||raw.length>2_900_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)||
    raw.length%4!==0)return {ok:false,error:'invalid_image'}
  const bytes=Buffer.from(raw,'base64')
  if(bytes.length>byteLimit||bytes.length<64)return {ok:false,error:'image_too_large_or_empty'}
  const detected=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    ?'image/png'
    :bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff
      ?'image/jpeg'
      :bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'
        ?'image/webp':''
  if(detected!==mime)return {ok:false,error:'unsupported_image'}
  return {ok:true,bytes,base64:raw,mime}
}
export async function analyzeLocalScreenshotG46(payload,{
  fetcher=fetch,ollamaUrl='http://127.0.0.1:11434',
  model=process.env.REALTALENT_OLLAMA_VISION_MODEL||'qwen2.5vl:3b',
}={}){
  const screenshot=validateLocalScreenshotG46(payload)
  if(!screenshot.ok)return {ok:false,error:screenshot.error}
  const company=clean(payload.company,120),question=clean(payload.question,400)
  if(company.length<3)return {ok:false,error:'invalid_company'}
  let tags
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),100000)
  try{
    const check=await fetcher(ollamaUrl+'/api/tags',{signal:ctrl.signal})
    if(!check.ok)return {ok:false,error:'ollama_unavailable'}
    tags=await check.json()
    const available=Array.isArray(tags.models)&&tags.models.some(x=>x.model===model||x.name===model)
    if(!available)return {ok:false,error:'vision_model_missing',model}
    const schema={type:'object',additionalProperties:false,properties:{
      answer:{type:'string'},visibleObservations:{type:'array',maxItems:5,items:{type:'string'}},
      commercialHypotheses:{type:'array',maxItems:3,items:{type:'string'}},
      limitations:{type:'array',maxItems:3,items:{type:'string'}},
    },required:['answer','visibleObservations','commercialHypotheses','limitations']}
    const response=await fetcher(ollamaUrl+'/api/chat',{
      method:'POST',signal:ctrl.signal,headers:{'content-type':'application/json'},
      body:JSON.stringify({
        model,stream:false,format:schema,keep_alive:0, // release vision model VRAM after each analysis
        messages:[{role:'system',content:[
          'Você analisa uma captura de tela fornecida pelo usuário, sem acesso ao Instagram.',
          'Identifique somente texto e conteúdo realmente visíveis na imagem. Responda em português.',
          'Não presuma que a imagem é atual, pertence à empresa mencionada ou representa todo o perfil.',
          'Separe observações visíveis de possíveis hipóteses comerciais a confirmar.',
          'Não invente comentários, seguidores, datas, vendas ou necessidades confirmadas.',
          'Não tente acessar links, não execute ações e não solicite credenciais.'
        ].join(' ')},{role:'user',content:'Empresa indicada: '+company+
          '. Pergunta: '+(question||'Analise o que está visível e identifique hipóteses comerciais.')+
          '. A imagem foi fornecida pelo usuário e não é uma fonte verificada.',
          images:[screenshot.base64]}],
        options:{temperature:0.15,num_predict:700,num_ctx:3800},
      })
    })
    if(!response.ok)return {ok:false,error:'vision_inference_failed'}
    const json=await response.json()
    let result
    try{result=JSON.parse(String(json.message?.content||'{}'))}catch{return {ok:false,error:'vision_invalid_response'}}
    const list=(arr,max)=>Array.isArray(arr)?arr.filter(x=>typeof x==='string').slice(0,max).map(x=>clean(x,260)):[]
    if(typeof result.answer!=='string'||result.answer.trim().length<12)return {ok:false,error:'vision_invalid_response'}
    return {ok:true,kind:'screenshot',answer:clean(result.answer,1250),
      visibleObservations:list(result.visibleObservations,5),
      commercialHypotheses:list(result.commercialHypotheses,3),
      limitations:[...list(result.limitations,3),
        'Análise de captura enviada pelo usuário; identidade e atualidade não verificadas.'].slice(0,4),
      evidence:'user_supplied_image',model,stored:false}
  }catch(e){
    return {ok:false,error:e?.name==='AbortError'?'vision_timeout':'ollama_unavailable'}
  }finally{clearTimeout(timer)}
}
