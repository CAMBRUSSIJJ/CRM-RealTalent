export type TaskViewMode = 'list' | 'board' | 'today' | 'overdue' | 'blocked' | 'completed' | 'in_progress'
export type TaskViewLayout = 'list' | 'board'
export interface TaskSavedView {
  id:string
  name:string
  owner:string
  teamId:string
  priority:string
  query:string
  view:TaskViewMode
  layout:TaskViewLayout
}
const VALID=new Set<TaskViewMode>(['list','board','today','overdue','blocked','completed','in_progress'])
const key=(workspaceId:string)=>'realtalent:tasks:saved-views:v1:'+workspaceId
const normalize=(v:unknown):TaskSavedView|null=>{
  if(!v||typeof v!=='object')return null
  const x=v as Partial<TaskSavedView>
  if(typeof x.id!=='string'||typeof x.name!=='string'||!x.name.trim()||
    typeof x.view!=='string'||!VALID.has(x.view as TaskViewMode)||
    x.layout!=='list'&&x.layout!=='board')return null
  return {
    id:x.id.slice(0,100),name:x.name.trim().slice(0,45),view:x.view as TaskViewMode,layout:x.layout,
    owner:typeof x.owner==='string'?x.owner.slice(0,120):'all',
    teamId:typeof x.teamId==='string'?x.teamId.slice(0,120):'all',
    priority:typeof x.priority==='string'?x.priority.slice(0,20):'all',
    query:typeof x.query==='string'?x.query.slice(0,150):'',
  }
}
export function readSavedTaskViews(workspaceId:string,store:Pick<Storage,'getItem'>):TaskSavedView[]{
  if(!workspaceId)return []
  try{
    const raw=store.getItem(key(workspaceId))
    if(!raw)return []
    const value:unknown=JSON.parse(raw)
    return Array.isArray(value)?value.map(normalize).filter((v):v is TaskSavedView=>v!==null).slice(0,12):[]
  }catch{return []}
}
export function writeSavedTaskViews(workspaceId:string,views:TaskSavedView[],store:Pick<Storage,'setItem'>):void{
  if(!workspaceId)throw new Error('Escolha um workspace para salvar a visão.')
  const clean=views.map(normalize).filter((v):v is TaskSavedView=>v!==null).slice(0,12)
  store.setItem(key(workspaceId),JSON.stringify(clean))
}
