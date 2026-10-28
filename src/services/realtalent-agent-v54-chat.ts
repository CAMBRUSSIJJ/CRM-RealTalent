import type { AssistantAnswer,AssistantContext } from './realtalent-assistant'
import { runtimeFetch } from './realtalent-runtime-transport'
import { env } from '../lib/env'
import { streamLocalConversation } from './realtalent-agent-v61-stream'

const normalized=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
/** Conversations must not invoke a CRM write merely because a request is unknown. */
export function isConversationalPrompt(prompt:string):boolean{
  const text=normalized(prompt)
  if(!text || text.length>2000)return false
  // Explicit actions are reserved for the existing permission-gated executor.
  if(/\b(crie|criar|registre|registrar|agende|agendar|envie|enviar|salve|salvar|delete|exclua|excluir|mova|mover|cadastre|cadastrar|atualize|atualizar|dispare|disparar)\b/.test(text))return false
  // Read-only operational requests should still use verified CRM data.
  if(/\b(meu pipeline|minhas tarefas|minhas propostas|meus contatos|minha agenda|meus leads|quais oportunidades|negocios em risco|quantos clientes|faturamento real)\b/.test(text))return false
  return /^(?:oi\b|ola\b|bom dia\b|boa tarde\b|boa noite\b|me explique\b|explique\b|me conte\b|me ajuda a entender\b|pode explicar\b|quero entender\b|como\b|por que\b|porque\b|o que\b|qual a diferenca\b|quais as diferencas\b|o que voce acha\b|vamos conversar\b|vamos pensar\b|qual a melhor abordagem\b|qual seria a melhor abordagem\b|compare\b|analise o mercado\b|me de ideias\b|me sugira\b)/.test(text)
    || /\b(o que acha|faz sentido|quais estrategias|como funciona|quais alternativas|melhor abordagem|qual estrategia)\b/.test(text)
    // General analysis and open conversation must reach a language model,
    // not fall back to rigid CRM capability keyword matching.
    || text.length>=8
}
export interface ConversationalReply { text:string;model:string|null }
export type NaturalChatTransport=(prompt:string,history:string)=>Promise<ConversationalReply|null>
export const queryOllamaConversation:NaturalChatTransport=async(prompt,history)=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),70000)
  try{
    const response=await runtimeFetch(env.agentGatewayUrl+'/tools/chat',{
      method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
      body:JSON.stringify({prompt:prompt.slice(0,1800),history:history.slice(-4800)}),
    })
    if(!response.ok)return null
    const payload=await response.json() as {ok?:boolean;reply?:unknown;model?:unknown}
    if(payload.ok!==true||typeof payload.reply!=='string'||payload.reply.trim().length<8)return null
    return {text:payload.reply.trim().slice(0,9000),model:typeof payload.model==='string'?payload.model:null}
  }catch{return null}
  finally{clearTimeout(timer)}
}
export async function answerConversationalPrompt(
  prompt:string,context:AssistantContext={},transport:NaturalChatTransport=queryOllamaConversation,
):Promise<AssistantAnswer|null>{
  if(!isConversationalPrompt(prompt))return null
  const result=context.onChatDelta
    ? await streamLocalConversation(prompt,context.conversationContext||'',context.onChatDelta)
    : await transport(prompt,context.conversationContext||'').catch(()=>null)
  if(!result)return {
    id:'chat:unavailable:'+Date.now(),intent:'unknown',title:'Conversa indisponível',
    text:'O modelo conversacional não respondeu. O painel do CRM está disponível, mas o Ollama precisa estar conectado ao novo runtime para conversarmos livremente. Não vou substituir sua pergunta por um comando genérico.',
    items:[],facts:[],suggestedPrompts:[],generatedAt:new Date().toISOString(),
  }
  return {
    id:'chat:ollama:'+Date.now(),intent:'unknown',title:'RealTalent',
    text:result.text,items:[],facts:[],
    suggestedPrompts:[],generatedAt:new Date().toISOString(),
  }
}
