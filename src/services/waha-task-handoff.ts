// Explicit transfer between WAHA analysis and the native task form.
// Session-only staging; nothing is persisted as a task until the user clicks "Criar tarefa".
const KEY='realtalent.waha.task-handoff.v1'
const MAX_AGE=10*60*1000
export type WahaTaskHandoff={title:string;description:string;source:'waha-local';createdAt:number}
const clean=(x:unknown,n:number)=>typeof x==='string'
  ?x.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n):''
export function stageWahaTaskHandoff(input:{title:string;description?:string}):void{
  const title=clean(input.title,180)
  if(!title)throw new Error('Próximo passo sem título')
  const handoff:WahaTaskHandoff={title,description:clean(input.description,1200),
    source:'waha-local',createdAt:Date.now()}
  window.sessionStorage.setItem(KEY,JSON.stringify(handoff))
}
export function consumeWahaTaskHandoff():WahaTaskHandoff|null{
  let value:string|null=null
  try{value=window.sessionStorage.getItem(KEY);window.sessionStorage.removeItem(KEY)}
  catch{return null}
  if(!value)return null
  try{
    const candidate=JSON.parse(value) as Partial<WahaTaskHandoff>
    if(candidate.source!=='waha-local'||typeof candidate.createdAt!=='number'||
      !Number.isFinite(candidate.createdAt)||Date.now()-candidate.createdAt>MAX_AGE||
      candidate.createdAt>Date.now()+1000)return null
    const title=clean(candidate.title,180)
    if(!title)return null
    return {source:'waha-local',title,description:clean(candidate.description,1200),
      createdAt:candidate.createdAt}
  }catch{return null}
}
