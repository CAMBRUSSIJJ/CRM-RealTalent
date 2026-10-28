import type { AssistantAnswer } from './realtalent-assistant'
import type { AgentWorkDocument } from './realtalent-agent-v53-work'
import { requestsFormatting } from './realtalent-agent-v56-intents'

const clean=(v:string)=>v.replace(/\r/g,'').trim()
const cells=(v:string)=>v.replace(/\|/g,'\\|').replace(/\n/g,'<br>').trim()
export function formatWorkDocument(prompt:string,work:AgentWorkDocument):AssistantAnswer|null {
  const format=requestsFormatting(prompt)
  if(!format)return null
  const original=clean(work.body)
  if(!original)return null
  let body=''
  if(format==='plain'){
    body=original.replace(/^#{1,6}\s*/gm,'').replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm,'').replace(/\n+/g,' ').replace(/\s{2,}/g,' ').trim()
  }else if(format==='bullets'){
    body=original.split(/\n+/).map(line=>line.trim()).filter(Boolean)
      .map(line=>'- '+line.replace(/^(?:[-*•]|\d+[.)])\s*/,'')).join('\n')
  }else{
    const blocks=original.split(/\n\s*\n/g).map(clean).filter(Boolean)
    body='| Etapa / conteúdo | Descrição |\n| --- | --- |\n'+blocks.map((block,index)=>{
      const lines=block.split('\n').map(clean).filter(Boolean)
      return '| '+cells(lines.length>1?lines[0]:'Trecho '+(index+1))+' | '+cells(lines.length>1?lines.slice(1).join('\n'):lines[0])+' |'
    }).join('\n')
  }
  if(!body || body===original)return null
  return {
    id:'work-edit:format:'+Date.now(),intent:'crm_capability',title:work.title,
    text:'Reformatei o documento ativo sem alterar os dados comerciais. A versão anterior continua disponível.',
    items:[],facts:[],suggestedPrompts:['Deixe mais consultivo','Adapte para WhatsApp'],
    generatedAt:new Date().toISOString(),
    toolOutput:{kind:'script',title:work.title,body,channel:work.channel,leadId:work.leadId,
      grounded:Boolean(work.leadId),strategy:work.strategy},
  }
}
