import type {PipelineStage} from '../../domain/types'
import {validateStageOrder} from './pipeline-editor-model'

export interface StageOrderWriteResult{
  changed:boolean
  saved:boolean
  restored:boolean
  error?:string
}
/** Two-pass ordering avoids collisions with an existing 1..N order.
 * It never deletes a stage or moves an opportunity. On write failure it
 * attempts to restore the original positions and reports uncertainty. */
export async function commitStageOrder(
  stages:PipelineStage[],
  ids:string[],
  update:(id:string,order:number)=>Promise<unknown>,
):Promise<StageOrderWriteResult>{
  if(!validateStageOrder(ids,stages))return {changed:false,saved:false,restored:true,error:'A lista de etapas mudou. Atualize o Pipeline antes de reorganizar.'}
  const previous=[...stages].sort((a,b)=>a.order-b.order)
  if(ids.every((id,index)=>id===previous[index].id))return {changed:false,saved:true,restored:true}
  const start=Math.max(...stages.map(stage=>stage.order),0)+stages.length+10
  try{
    for(let i=0;i<ids.length;i++)await update(ids[i],start+i)
    for(let i=0;i<ids.length;i++)await update(ids[i],i+1)
    return {changed:true,saved:true,restored:true}
  }catch(error){
    let restored=true
    try{
      for(let i=0;i<previous.length;i++)await update(previous[i].id,start+previous.length+i)
      for(let i=0;i<previous.length;i++)await update(previous[i].id,previous[i].order)
    }catch{restored=false}
    return {changed:true,saved:false,restored,
      error:(error instanceof Error?error.message:'Falha ao salvar ordem')+
        (restored?' A ordenação anterior foi restaurada.':' Não foi possível confirmar a restauração completa; atualize os dados antes de tentar novamente.')}
  }
}
