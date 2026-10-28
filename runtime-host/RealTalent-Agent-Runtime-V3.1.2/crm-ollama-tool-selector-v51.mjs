import { validateToolSelection } from './crm-tool-selection-v51.mjs'

// Side-effect-free selection: never executes CRM tools.
export async function selectOllamaToolsV51({prompt,capabilities,model,ollamaUrl,conversationContext='',timeoutMs=18000,fetcher=fetch}) {
  const ids=[...new Set(capabilities.map(item=>item.id))].slice(0,140)
  if(ids.length<2)return null
  const schema={type:'object',additionalProperties:false,properties:{
    capabilityIds:{type:'array',minItems:2,maxItems:8,items:{type:'string',enum:ids}},
    confidence:{type:'number',minimum:0,maximum:1},rationale:{type:'string'},
  },required:['capabilityIds','confidence','rationale']}
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),timeoutMs)
  try{
    const response=await fetcher(ollamaUrl+'/api/chat',{
      method:'POST',signal:controller.signal,
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        model,stream:false,think:false,format:schema,
        messages:[
          {role:'system',content:'Classifique o pedido do CRM em ferramentas permitidas. Retorne uma lista ordenada de IDs para cobrir todas as etapas da solicitação, sem executar ações ou criar IDs. Responda só JSON.'},
          {role:'user',content:JSON.stringify({request:String(prompt).slice(0,1800),context:String(conversationContext).slice(0,1200),tools:capabilities.map(x=>({id:x.id,title:x.title,module:x.module,description:x.description}))})},
        ],
        options:{temperature:0,num_predict:420},
      }),
    })
    if(!response.ok)return null
    const payload=await response.json()
    const parsed=JSON.parse(String(payload.message?.content||'{}'))
    return validateToolSelection(parsed,capabilities,{compound:true})
  }catch{return null}finally{clearTimeout(timer)}
}
