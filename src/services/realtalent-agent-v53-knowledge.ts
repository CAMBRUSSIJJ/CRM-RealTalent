import type { WorkspaceSnapshot } from '../domain/types'
import type { AssistantContext } from './realtalent-assistant'
const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const terms=(v:string)=>[...new Set(normalize(v).split(/[^a-z0-9]+/).filter(w=>w.length>=4))]
/** Source-aware, permission-gated local retrieval.
 * Vector similarity can be plugged in later, but this routine must never
 * imply that an external source was searched. */
export function retrieveAgentKnowledge(prompt:string,snapshot:WorkspaceSnapshot,context:AssistantContext={}):string[]{
  if(!context.canReadPlaybooks)return []
  const wanted=terms(prompt)
  return snapshot.playbooks
    .filter(book=>typeof book.content==='string'&&book.content.trim())
    .map(book=>{
      const tokens=terms(book.title+' '+book.content.slice(0,2400))
      const score=tokens.filter(t=>wanted.includes(t)).length
      return {book,score}
    })
    .filter(row=>row.score>0)
    .sort((a,b)=>b.score-a.score)
    .slice(0,3)
    .map(({book})=>'[Playbook CRM '+book.id+'] '+book.title+': '+book.content.slice(0,650))
}
