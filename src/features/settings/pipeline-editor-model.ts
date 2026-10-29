import type {PipelineStage,Lead,OpportunityRecord,AutomationRule} from '../../domain/types'
import type {UpdateStageInput} from '../../repositories/crm-repository'

export type StageKind='open'|'won'|'lost'
export interface StageDraft{
  id:string;name:string;color:string;probability:number;kind:StageKind
}
export interface PipelinePresetStage{ name:string;color:string;probability:number;kind:StageKind }
export type PipelinePresetId='prospecting'|'consultative'|'afterSales'
export const PIPELINE_PRESETS:Record<PipelinePresetId,{title:string;description:string;stages:PipelinePresetStage[]}>={
  prospecting:{title:'Prospecção',description:'Qualificação e avanço comercial desde o primeiro contato.',stages:[
    {name:'Novo lead',color:'#4361EE',probability:10,kind:'open'},
    {name:'Primeiro contato',color:'#3483FA',probability:25,kind:'open'},
    {name:'Qualificação',color:'#8454E9',probability:40,kind:'open'},
    {name:'Proposta',color:'#F59E0B',probability:65,kind:'open'},
    {name:'Negociação',color:'#F97316',probability:80,kind:'open'},
    {name:'Fechado',color:'#16A34A',probability:100,kind:'won'},
  ]},
  consultative:{title:'Venda consultiva',description:'Diagnóstico e proposta baseada em necessidades.',stages:[
    {name:'Diagnóstico',color:'#4374EE',probability:15,kind:'open'},
    {name:'Descoberta de necessidades',color:'#6C67E9',probability:30,kind:'open'},
    {name:'Solução apresentada',color:'#8258D9',probability:50,kind:'open'},
    {name:'Proposta',color:'#F59E0B',probability:70,kind:'open'},
    {name:'Negociação',color:'#F97316',probability:85,kind:'open'},
    {name:'Fechado',color:'#16A34A',probability:100,kind:'won'},
  ]},
  afterSales:{title:'Pós-venda',description:'Acompanhamento do serviço e expansão do relacionamento.',stages:[
    {name:'Onboarding',color:'#3483FA',probability:10,kind:'open'},
    {name:'Implantação',color:'#6366F1',probability:35,kind:'open'},
    {name:'Acompanhamento',color:'#8B5CF6',probability:55,kind:'open'},
    {name:'Renovação',color:'#F59E0B',probability:80,kind:'open'},
  ]},
}
export const draftStage=(stage:PipelineStage):StageDraft=>({
  id:stage.id,name:stage.name,color:stage.color,probability:stage.probability,
  kind:stage.isWon?'won':stage.isLost?'lost':'open',
})
export const validStage=(draft:StageDraft,all:StageDraft[]):string|null=>{
  const name=draft.name.trim()
  if(!name)return 'Informe o nome da etapa.'
  if(!/^#[0-9a-f]{6}$/i.test(draft.color))return 'Selecione uma cor válida.'
  if(!Number.isFinite(draft.probability)||draft.probability<0||draft.probability>100)
    return 'A probabilidade precisa ficar entre 0 e 100%.'
  if(all.some(other=>other.id!==draft.id&&other.name.trim().toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))
    return 'Há duas etapas com o mesmo nome.'
  return null
}
export const toStagePatch=(draft:StageDraft):UpdateStageInput=>({
  name:draft.name.trim(),color:draft.color,probability:Math.round(draft.probability),
  isWon:draft.kind==='won',isLost:draft.kind==='lost',
})
export function stageIsChanged(before:PipelineStage,draft:StageDraft):boolean{
  return before.name!==draft.name.trim()||before.color.toLowerCase()!==draft.color.toLowerCase()||
    before.probability!==Math.round(draft.probability)||
    (before.isWon?'won':before.isLost?'lost':'open')!==draft.kind
}
export function moveStageOrder(ids:string[],fromId:string,toId:string):string[]{
  if(fromId===toId||!ids.includes(fromId)||!ids.includes(toId))return [...ids]
  const result=ids.filter(id=>id!==fromId)
  result.splice(result.indexOf(toId),0,fromId)
  return result
}
export interface StageUsage{leads:number;opportunities:number;automations:number;total:number}
export function stageUsage(id:string,leads:Lead[],opportunities:OpportunityRecord[],rules:AutomationRule[]):StageUsage{
  const leadCount=leads.filter(x=>x.stageId===id).length
  const opportunityCount=opportunities.filter(x=>x.stageId===id).length
  const ruleCount=rules.filter(x=>x.actions.some(a=>a.type==='move_stage'&&a.value===id)).length
  return {leads:leadCount,opportunities:opportunityCount,automations:ruleCount,
    total:leadCount+opportunityCount+ruleCount}
}
/** Stage templates are additive only. Never reset or remap existing opportunities. */
export function missingPresetStages(stages:PipelineStage[],id:PipelinePresetId):PipelinePresetStage[]{
  const known=new Set(stages.map(stage=>stage.name.trim().toLocaleLowerCase('pt-BR')))
  return PIPELINE_PRESETS[id].stages.filter(stage=>!known.has(stage.name.toLocaleLowerCase('pt-BR')))
}
export function isPureOrderingChange(before:StageDraft,after:StageDraft):boolean{
  return JSON.stringify(before)===JSON.stringify(after)
}
export function validateStageOrder(ids:string[],stages:PipelineStage[]):boolean{
  return ids.length===stages.length&&new Set(ids).size===ids.length&&
    stages.every(stage=>ids.includes(stage.id))
}
export interface AuxItemUpdate{kind:'add'|'rename'|'delete'|'move';before:string[];after:string[]}
/** Normalizes lists without silently removing a user-controlled entry. */
export function normalizeAuxItems(values:string[]):string[]{
  return [...new Set(values.map(x=>x.trim()).filter(Boolean))].slice(0,100)
}
