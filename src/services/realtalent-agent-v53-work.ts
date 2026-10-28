import type { AssistantAnswer, AssistantToolOutput } from './realtalent-assistant'

export interface AgentWorkRevision {
  id: string
  requested: string
  body: string
  createdAt: string
}
export interface AgentWorkDocument {
  id: string
  title: string
  kind: 'script'
  channel: 'call'|'meeting'|'whatsapp'|'email'
  leadId: string|null
  body: string
  revisions: AgentWorkRevision[]
  strategy?: Extract<AssistantToolOutput,{kind:'script'}>['strategy']
  updatedAt: string
}
const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
const directCrmAction=/\b(crie|criar|cadastre|cadastrar|exclua|excluir|apague|apagar|envie|enviar|agende|agendar|salve|salvar|registre|registrar|mova|mover|atualize|atualizar)\s+(?:uma?\s+)?(?:tarefa|contato|proposta|oportunidade|reuniao|mensagem|playbook|follow.?up)\b/
/** An active script is an editable document, not a CRM capability.
 * For ambiguous short followups, let the model evaluate context instead of
 * re-routing to the CRM's operational action planner. */
export function isWorkContinuation(prompt:string,active:AgentWorkDocument|null):boolean{
  if(!active)return false
  const value=normalize(prompt)
  if(!value||directCrmAction.test(value))return false
  if(/\b(calcul|metas?|pipeline|negocios?|tarefas?|propostas?|agenda|contatos?)\b/.test(value)
    && !/\b(roteiro|script|texto|abordagem|reescreva|versao)\b/.test(value))return false
  return /\b(personaliz|adapt|ajust|melhor|reescrev|refac|revis|deix|mud|torn|acresc|inclu|retir|substitu|detalh|aprofunda|context|mais consultiv|mais especif|outra versao|continue|este texto|esse texto|esse roteiro|o roteiro|isso)\w*/.test(value)
    || /^(e (se|para|com|mais)|agora (com|mais|para)|pode (ser|ficar)|consegue|faz ele|refine)\b/.test(value)
}

export function workFromAnswer(answer:AssistantAnswer, request:string, active:AgentWorkDocument|null=null):AgentWorkDocument|null{
  const output=answer.toolOutput
  if(output?.kind!=='script')return null
  const body=output.body.trim()
  if(!body || body.length>25000)return null
  const stamp=new Date().toISOString()
  const revision:AgentWorkRevision={id:crypto.randomUUID(),requested:request.slice(0,1500),body,createdAt:stamp}
  const same=active?.body===body
  if(same)return active
  const revisions=(active?.revisions??[]).slice(-19)
  return {
    id:active?.id??crypto.randomUUID(),
    title:output.title.slice(0,180),
    kind:'script',channel:output.channel,leadId:output.leadId,
    body,strategy:output.strategy??active?.strategy,
    revisions:[...revisions,revision],updatedAt:stamp,
  }
}
export function restoreWorkRevision(work:AgentWorkDocument,index:number):AgentWorkDocument|null{
  const previous=work.revisions[index]
  if(!previous)return null
  const stamp=new Date().toISOString()
  return {...work,body:previous.body,updatedAt:stamp,revisions:[
    ...work.revisions.slice(-19),
    {id:crypto.randomUUID(),requested:'Restaurar versão de '+previous.createdAt,body:previous.body,createdAt:stamp},
  ]}
}
export function answerFromWork(work:AgentWorkDocument,reason='Versão recuperada'):AssistantAnswer{
  return {id:'work:'+work.id+':'+Date.now(),intent:'crm_capability',title:work.title,
    text:reason+'. O conteúdo está disponível para continuar revisando.',
    items:[],facts:[],suggestedPrompts:['Personalize para o público-alvo','Deixe mais consultivo'],
    toolOutput:{kind:'script',title:work.title,body:work.body,channel:work.channel,leadId:work.leadId,
      grounded:Boolean(work.leadId),strategy:work.strategy},
    generatedAt:new Date().toISOString()}
}
export function isValidWork(value:unknown):value is AgentWorkDocument{
  if(!value||typeof value!=='object')return false
  const item=value as Partial<AgentWorkDocument>
  return typeof item.id==='string'&&item.id.length<120
    &&item.kind==='script'&&typeof item.body==='string'&&item.body.length<=25000
    &&typeof item.title==='string'&&Array.isArray(item.revisions)
    &&item.revisions.length<=20 && item.revisions.every(r=>typeof r?.body==='string'&&r.body.length<=25000)
}
