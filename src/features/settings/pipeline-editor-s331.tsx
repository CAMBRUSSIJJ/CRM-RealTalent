import {useEffect,useMemo,useRef,useState} from 'react'
import {ArrowDown,ArrowUp,ChevronDown,ChevronUp,GripVertical,Plus,Save,Trash2,Workflow,X} from 'lucide-react'
import {useApp} from '../../app/app-context'
import {Button} from '../../components/ui/button'
import {NativeSelectionSelect} from '../../components/selection'
import {StatusPill} from '../../components/ui/status-pill'
import type {PipelineStage,Lead,OpportunityRecord,AutomationRule} from '../../domain/types'
import {StageModal} from '../pipeline/stage-modal'
import {
  PIPELINE_PRESETS, type PipelinePresetId,type StageDraft, type StageKind,
  draftStage,validStage,toStagePatch,stageIsChanged,moveStageOrder,stageUsage,missingPresetStages,
  validateStageOrder,orphanStageOpportunityIds,
} from './pipeline-editor-model'
import {commitStageOrder} from './pipeline-editor-order'
import '../../styles/settings-s331.css'

type StageEditorProps={
  stages:PipelineStage[]
  leads:Lead[]
  opportunities:OpportunityRecord[]
  rules:AutomationRule[]
  workspaceId:string
  canWrite:boolean
  onDirtyChange?:(dirty:boolean)=>void
}
const kindLabel=(kind:StageKind)=>kind==='won'?'Ganha':kind==='lost'?'Perdida':'Aberta'
const code=(e:unknown)=>e instanceof Error?e.message:'Erro não identificado'
const stageColor=(color:string)=>/^#[a-f\d]{6}$/i.test(color)?color:'#64748B'

export function PipelineEditorS331({stages,leads,opportunities,rules,workspaceId,canWrite,onDirtyChange}:StageEditorProps){
  const app=useApp()
  const [drafts,setDrafts]=useState<Record<string,StageDraft>>(()=>
    Object.fromEntries(stages.map(stage=>[stage.id,draftStage(stage)])))
  const [order,setOrder]=useState(()=>[...stages].sort((a,b)=>a.order-b.order).map(s=>s.id))
  const [editing,setEditing]=useState<string|null>(null)
  const [saving,setSaving]=useState(false)
  const [adding,setAdding]=useState(false)
  const [newName,setNewName]=useState('')
  const [newProbability,setNewProbability]=useState(10)
  const [newKind,setNewKind]=useState<StageKind>('open')
  const [selectedTemplate,setSelectedTemplate]=useState<PipelinePresetId|null>(null)
  const [advancedStage,setAdvancedStage]=useState<PipelineStage|null>(null)
  const [migration,setMigration]=useState<string|null>(null)
  const [migrationTarget,setMigrationTarget]=useState('')
  const dragSource=useRef<string|null>(null)
  const sortedStages=useMemo(()=>[...stages].sort((a,b)=>a.order-b.order),[stages])
  const safeOrder=validateStageOrder(order,stages)?order:sortedStages.map(s=>s.id)
  const changes=stages.filter(s=>drafts[s.id]&&stageIsChanged(s,drafts[s.id]))
  const orderChanged=safeOrder.some((id,index)=>id!==sortedStages[index]?.id)
  const isDirty=changes.length>0||orderChanged
  useEffect(()=>{onDirtyChange?.(isDirty)},[isDirty,onDirtyChange])
  useEffect(()=>{
    if(saving)return
    setDrafts(Object.fromEntries(stages.map(stage=>[stage.id,draftStage(stage)])))
    setOrder([...stages].sort((a,b)=>a.order-b.order).map(s=>s.id))
  },[stages,saving])
  const update=(id:string,patch:Partial<StageDraft>)=>
    setDrafts(current=>({...current,[id]:{...current[id],...patch}}))
  const reset=()=>{
    setDrafts(Object.fromEntries(stages.map(stage=>[stage.id,draftStage(stage)])))
    setOrder(sortedStages.map(s=>s.id));setEditing(null)
  }
  const persist=async()=>{
    if(!canWrite||saving||!isDirty)return
    for(const stage of stages){
      const d=drafts[stage.id];if(!d)continue
      const issue=validStage(d,Object.values(drafts))
      if(issue){app.notify('warning',issue+' '+stage.name);setEditing(stage.id);return}
      const impacted=stageUsage(stage.id,leads,opportunities,rules)
      const newKind=d.kind
      const oldKind=stage.isWon?'won':stage.isLost?'lost':'open'
      if(newKind!==oldKind&&impacted.leads+impacted.opportunities>0){
        const ok=await app.confirmAction({
          title:'Alterar situação da etapa '+stage.name+'?',
          description:'A mudança afetará '+impacted.leads+' lead(s) e '+impacted.opportunities+
            ' oportunidade(s) vinculada(s). O CRM poderá atualizar seus estados de ganho/perda. Confirme somente se esta alteração é desejada.',
          confirmLabel:'Confirmar mudança de situação',tone:'warning',
        })
        if(!ok)return
      }
    }
    setSaving(true)
    try{
      // Each native action confirms its own write; this interface does not
      // pretend multi-step operations are a database transaction.
      let completed=0
      for(const stage of stages){
        const current=drafts[stage.id]
        if(current&&stageIsChanged(stage,current)){
          await app.updateStage(stage.id,toStagePatch(current),{quiet:true});completed++
        }
      }
      if(orderChanged){
        const result=await commitStageOrder(stages,safeOrder,
          (id,position)=>app.updateStage(id,{order:position},{quiet:true}))
        if(!result.saved)throw Error(result.error)
      }
      app.notify('success','Alterações confirmadas: '+completed+' etapa(s) e'+
        (orderChanged?' nova ordem.':' ordem preservada.'))
      setEditing(null)
    }catch(error){
      app.notify('error','O salvamento foi interrompido: '+code(error)+
        ' Confira as etapas persistidas antes de tentar novamente.')
    }finally{setSaving(false);await app.refresh()}
  }
  const create=async()=>{
    if(!canWrite||saving)return
    const candidate=newName.trim()
    if(!candidate||!Number.isFinite(newProbability)||newProbability<0||newProbability>100){
      app.notify('warning','Informe nome e probabilidade de 0 a 100%.');return
    }
    if(stages.some(s=>s.name.toLocaleLowerCase('pt-BR')===candidate.toLocaleLowerCase('pt-BR'))){
      app.notify('warning','Já existe uma etapa com este nome.');return
    }
    setSaving(true)
    try{
      await app.createStage({name:candidate,probability:Math.round(newProbability),
        color:'#4361EE',isWon:newKind==='won',isLost:newKind==='lost'})
      setAdding(false);setNewName('');setNewProbability(10);setNewKind('open')
    }catch(error){app.notify('error',code(error))}
    finally{setSaving(false);await app.refresh()}
  }
  const applyPreset=async()=>{
    if(!selectedTemplate||saving||!canWrite||isDirty)return
    const missing=missingPresetStages(stages,selectedTemplate)
    if(!missing.length){app.notify('info','Todas as etapas deste modelo já existem.');return}
    const ok=await app.confirmAction({title:'Adicionar etapas do modelo?',
      description:'Serão adicionadas '+missing.length+' etapa(s). Nenhuma etapa atual será removida, renomeada ou movimentada. Os registros existentes permanecem onde estão.',
      confirmLabel:'Adicionar etapas',tone:'warning'})
    if(!ok)return
    setSaving(true)
    let created=0
    try{
      for(const stage of missing){
        await app.createStage({name:stage.name,color:stage.color,probability:stage.probability,
          isWon:stage.kind==='won',isLost:stage.kind==='lost'})
        created++
      }
      app.notify('success',created+' etapa(s) adicionada(s) sem alterar oportunidades.')
      setSelectedTemplate(null)
    }catch(error){app.notify('error',created+' etapa(s) já adicionada(s); operação interrompida: '+code(error))}
    finally{setSaving(false);await app.refresh()}
  }
  const remove=async(stage:PipelineStage)=>{
    if(!canWrite||saving||isDirty)return
    const impact=stageUsage(stage.id,leads,opportunities,rules)
    if(impact.total){
      setMigration(stage.id);setMigrationTarget('')
      app.notify('warning','Esta etapa tem vínculos. Revise os impactos antes de excluir.');return
    }
    if(stages.length<=1||stage.isWon&&!stages.some(s=>s.isWon&&s.id!==stage.id)){
      app.notify('warning','O Pipeline precisa preservar uma etapa e pelo menos uma etapa de ganho.');return
    }
    if(!await app.confirmAction({title:'Excluir '+stage.name+'?',
      description:'Nenhuma oportunidade, lead ou automação está vinculada na visualização atual. O servidor verificará novamente antes de excluir.',
      confirmLabel:'Excluir etapa',tone:'danger'}))return
    setSaving(true)
    try{await app.deleteStage(stage.id);app.notify('success','Etapa excluída.')}
    catch(error){app.notify('error',code(error))}
    finally{setSaving(false);await app.refresh()}
  }
  const migrate=async(stage:PipelineStage)=>{
    const impact=stageUsage(stage.id,leads,opportunities,rules)
    if(!migrationTarget||migrationTarget===stage.id)return
    if(impact.automations>0){app.notify('warning','Ajuste as automações vinculadas a esta etapa antes de migrar.');return}
    // A source may have opportunity-only records. Do not claim that moving
    // the lead IDs also moves these independent opportunity records.
    const orphanIds=orphanStageOpportunityIds(stage.id,leads,opportunities)
    if(orphanIds.length){
      app.notify('warning','Há '+orphanIds.length+' oportunidade(s) não vinculadas aos leads selecionados. Revise essas oportunidades no Pipeline antes de mover.');return
    }
    const ids=leads.filter(l=>l.stageId===stage.id).map(l=>l.id)
    if(!ids.length){app.notify('info','Não há leads para migrar automaticamente.');return}
    const target=stages.find(s=>s.id===migrationTarget)
    if(!target)return
    const confirm=await app.confirmAction({
      title:'Mover '+ids.length+' negócio(s) para '+target.name+'?',
      description:'Esta ação muda a etapa dos negócios e pode disparar automações do Pipeline. Nenhuma etapa será excluída automaticamente. Confira os resultados antes de excluir a origem.',
      confirmLabel:'Mover negócios',tone:'warning'})
    if(!confirm)return
    setSaving(true)
    try{
      const moved=await app.bulkMoveLeads(ids,target.id)
      app.notify('success',moved.length+' negócio(s) movimentado(s). Reavalie os vínculos antes de excluir a etapa.')
      setMigration(null);setMigrationTarget('')
    }catch(error){app.notify('error','Movimentação não confirmada: '+code(error))}
    finally{setSaving(false);await app.refresh()}
  }
  const rowById=new Map(stages.map(s=>[s.id,s]))
  const selectedMigrationStage=migration?rowById.get(migration):undefined
  return <section id="settings-commercial-pipeline" className="panel settings-pipeline-s331" aria-label="Editor inteligente do Pipeline">
    <header className="settings-pipeline-s331__header">
      <div><span className="eyebrow">Pipeline</span><h3>Etapas e probabilidades</h3>
        <p>Arraste para ordenar ou use as setas. Clique em uma etapa para editar.</p></div>
      <StatusPill tone={isDirty?'warning':'success'}>{isDirty?'Alterações pendentes':'Ordem atualizada'}</StatusPill>
    </header>
    <div className="settings-pipeline-s331__list" role="list" aria-label="Ordem das etapas comerciais">
      {safeOrder.map((id,index)=>{
        const stage=rowById.get(id);if(!stage)return null
        const d=drafts[id]??draftStage(stage)
        const isOpen=editing===id
        const usage=stageUsage(stage.id,leads,opportunities,rules)
        const changed=stageIsChanged(stage,d)
        return <div role="listitem" className={'settings-pipeline-s331__item'+(isOpen?' is-editing':'')} key={id}
          onDragOver={event=>{if(canWrite&&!saving)event.preventDefault()}}
          onDrop={event=>{event.preventDefault();if(canWrite&&!saving&&dragSource.current)setOrder(o=>moveStageOrder(o,dragSource.current!,id));dragSource.current=null}}>
          <div className="settings-pipeline-s331__row">
            <span className="settings-pipeline-s331__grip" title="Arraste para reordenar"
              draggable={canWrite&&!saving} onDragStart={event=>{dragSource.current=id;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id)}}
              onDragEnd={()=>{dragSource.current=null}}><GripVertical size={17}/></span>
            <span className="settings-pipeline-s331__color" style={{background:stageColor(d.color)}}/>
            <button type="button" className="settings-pipeline-s331__name" onClick={()=>setEditing(x=>x===id?null:id)}>
              <strong>{d.name||'Etapa sem nome'}</strong><small>{usage.leads} lead(s) · {usage.opportunities} oportunidade(s)</small>
            </button>
            <span className="settings-pipeline-s331__prob">{d.probability}%</span>
            <span className={'settings-pipeline-s331__kind is-'+d.kind}>{kindLabel(d.kind)}</span>
            <div className="settings-pipeline-s331__position">
              <button type="button" disabled={!canWrite||saving||index===0} aria-label={'Mover '+stage.name+' para cima'} onClick={()=>setOrder(o=>moveStageOrder(o,id,safeOrder[index-1]))}><ArrowUp size={15}/></button>
              <button type="button" disabled={!canWrite||saving||index===safeOrder.length-1} aria-label={'Mover '+stage.name+' para baixo'} onClick={()=>setOrder(o=>moveStageOrder(o,safeOrder[index+1],id))}><ArrowDown size={15}/></button>
            </div>
            <button type="button" className="settings-pipeline-s331__expand" aria-expanded={isOpen}
              aria-label={'Editar '+stage.name} onClick={()=>setEditing(x=>x===id?null:id)}>
              {isOpen?<ChevronUp size={17}/>:<ChevronDown size={17}/>}
            </button>
          </div>
          {isOpen?<div className="settings-pipeline-s331__edit">
            <label><span>Nome</span><input disabled={!canWrite||saving} value={d.name} onChange={e=>update(id,{name:e.target.value})}/></label>
            <label><span>Cor</span><input type="color" disabled={!canWrite||saving} value={stageColor(d.color)} onChange={e=>update(id,{color:e.target.value})}/></label>
            <label><span>Probabilidade (%)</span><input type="number" min="0" max="100" disabled={!canWrite||saving} value={d.probability} onChange={e=>update(id,{probability:Number(e.target.value)})}/></label>
            <label><span>Situação</span><NativeSelectionSelect disabled={!canWrite||saving} value={d.kind} onChange={e=>update(id,{kind:e.target.value as StageKind})}>
              <option value="open">Aberta</option><option value="won">Ganha</option><option value="lost">Perdida</option>
            </NativeSelectionSelect></label>
            <div className="settings-pipeline-s331__edit-actions">
              {changed?<StatusPill tone="warning">Não salvo</StatusPill>:null}
              <Button variant="secondary" disabled={saving||isDirty} onClick={()=>setAdvancedStage(stage)}><Workflow size={15}/> Critérios e regras</Button>
              <Button variant="ghost" disabled={!canWrite||saving} onClick={()=>void remove(stage)}><Trash2 size={15}/> Excluir</Button>
            </div>
          </div>:null}
        </div>
      })}
    </div>
    {selectedMigrationStage?(()=>{
      const usage=stageUsage(selectedMigrationStage.id,leads,opportunities,rules)
      return <div className="settings-pipeline-s331__impact" role="alert">
        <div><strong>Esta etapa possui vínculos</strong><p>{usage.leads} lead(s), {usage.opportunities} oportunidade(s) e {usage.automations} automação(ões). Não é possível excluí-la com esses vínculos.</p>
          <p>Para mover negócios, selecione o destino e confirme. A etapa de origem continuará no Pipeline até você excluí-la separadamente.</p></div>
        <label><span>Destino dos negócios</span><NativeSelectionSelect value={migrationTarget} onChange={e=>setMigrationTarget(e.target.value)}>
          <option value="">Escolha uma etapa…</option>
          {stages.filter(s=>s.id!==selectedMigrationStage.id).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </NativeSelectionSelect></label>
        <Button disabled={!canWrite||saving||!migrationTarget||usage.automations>0||isDirty||orphanStageOpportunityIds(selectedMigrationStage.id,leads,opportunities).length>0} onClick={()=>void migrate(selectedMigrationStage)}>Mover negócios com confirmação</Button>
        <Button variant="ghost" onClick={()=>{setMigration(null);setMigrationTarget('')}}>Cancelar</Button>
        {usage.automations>0?<small>Altere primeiro as automações que utilizam esta etapa como destino.</small>:null}
        {orphanStageOpportunityIds(selectedMigrationStage.id,leads,opportunities).length>0?
          <small>Há oportunidades sem lead correspondente na etapa. Resolva esses vínculos no Pipeline antes da migração.</small>:null}
      </div>
    })():null}
    <div className="settings-pipeline-s331__footer">
      <div><strong>{stages.length} etapas</strong><small>{changes.length} edição(ões) · {orderChanged?'Ordem modificada':'Ordem preservada'}</small></div>
      <Button variant="secondary" disabled={!isDirty||saving} onClick={reset}>Descartar</Button>
      <Button disabled={!canWrite||!isDirty||saving} loading={saving} onClick={()=>void persist()}><Save size={15}/> Salvar alterações nas etapas</Button>
    </div>
    {adding?<div className="settings-pipeline-s331__create">
      <label><span>Nome da nova etapa</span><input autoFocus value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Ex.: Proposta enviada"/></label>
      <label><span>Probabilidade (%)</span><input type="number" min="0" max="100" value={newProbability} onChange={e=>setNewProbability(Number(e.target.value))}/></label>
      <label><span>Situação</span><NativeSelectionSelect value={newKind} onChange={e=>setNewKind(e.target.value as StageKind)}>
        <option value="open">Aberta</option><option value="won">Ganha</option><option value="lost">Perdida</option>
      </NativeSelectionSelect></label>
      <Button disabled={!newName.trim()||saving||!canWrite||isDirty} onClick={()=>void create()}><Plus size={15}/> Criar etapa</Button>
      <Button variant="ghost" onClick={()=>setAdding(false)}><X size={15}/> Cancelar</Button>
    </div>:<Button variant="secondary" disabled={!canWrite||saving||isDirty} onClick={()=>setAdding(true)}><Plus size={16}/> Adicionar etapa</Button>}
    <details className="settings-pipeline-s331__templates">
      <summary>Modelos de Pipeline</summary>
      <p>Acrescente etapas ausentes sem alterar ou substituir as oportunidades existentes.</p>
      <div className="settings-pipeline-s331__template-cards">
        {(Object.keys(PIPELINE_PRESETS) as PipelinePresetId[]).map(id=><button className={selectedTemplate===id?'is-active':''} key={id} type="button"
          aria-pressed={selectedTemplate===id} onClick={()=>setSelectedTemplate(t=>t===id?null:id)}>
          <strong>{PIPELINE_PRESETS[id].title}</strong><small>{PIPELINE_PRESETS[id].description}</small>
        </button>)}
      </div>
      {selectedTemplate?<div className="settings-pipeline-s331__template-preview">
        <strong>{missingPresetStages(stages,selectedTemplate).length} etapa(s) que ainda não existem:</strong>
        <div>{missingPresetStages(stages,selectedTemplate).map(s=><span key={s.name}><i style={{background:s.color}}/>{s.name}</span>)}</div>
        <Button disabled={!canWrite||saving||isDirty||!missingPresetStages(stages,selectedTemplate).length} onClick={()=>void applyPreset()}>Adicionar somente as etapas ausentes</Button>
        {isDirty?<small>Salve ou descarte as mudanças pendentes antes de aplicar um modelo.</small>:null}
      </div>:null}
    </details>
    <StageModal open={Boolean(advancedStage)} stage={advancedStage} leadCount={advancedStage?stageUsage(advancedStage.id,leads,opportunities,rules).leads:0}
      workspaceId={workspaceId} stageIndex={advancedStage?stages.findIndex(s=>s.id===advancedStage.id):stages.length}
      stageTotal={stages.length} onClose={()=>setAdvancedStage(null)}/>
  </section>
}

export function AuxiliarySettingsListEditor({title,items,onChange,disabled=false}:{
  title:string;items:string[];onChange:(values:string[])=>void;disabled?:boolean
}){
  const [text,setText]=useState('')
  const [editing,setEditing]=useState<number|null>(null)
  const [draft,setDraft]=useState('')
  const add=()=>{
    const value=text.trim()
    if(!value||items.some(x=>x.toLocaleLowerCase('pt-BR')===value.toLocaleLowerCase('pt-BR')))return
    onChange([...items,value]);setText('')
  }
  const rename=(index:number)=>{
    const value=draft.trim()
    if(!value||items.some((x,i)=>i!==index&&x.toLocaleLowerCase('pt-BR')===value.toLocaleLowerCase('pt-BR')))return
    onChange(items.map((x,i)=>i===index?value:x));setEditing(null)
  }
  return <section className="settings-aux-s331" aria-label={title}>
    <header><strong>{title}</strong><small>{items.length} item(ns)</small></header>
    <div className="settings-aux-s331__list">
      {items.map((item,index)=><div key={index}>
        {editing===index?<input aria-label={'Renomear '+item} autoFocus value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')rename(index);if(e.key==='Escape')setEditing(null)}}/>:
          <button type="button" className="settings-aux-s331__name" onClick={()=>{setEditing(index);setDraft(item)}} title="Clique para renomear">{item}</button>}
        {editing===index?<button type="button" onClick={()=>rename(index)} disabled={disabled}>Ok</button>:
          <button type="button" onClick={()=>{setEditing(index);setDraft(item)}} disabled={disabled} aria-label={'Editar '+item}>Editar</button>}
        <button type="button" disabled={disabled||index===0} onClick={()=>{const next=[...items];[next[index-1],next[index]]=[next[index],next[index-1]];onChange(next)}} aria-label={'Subir '+item}><ArrowUp size={14}/></button>
        <button type="button" disabled={disabled||index===items.length-1} onClick={()=>{const next=[...items];[next[index],next[index+1]]=[next[index+1],next[index]];onChange(next)}} aria-label={'Descer '+item}><ArrowDown size={14}/></button>
        <button type="button" disabled={disabled} onClick={()=>onChange(items.filter((_,i)=>i!==index))} aria-label={'Remover '+item}><X size={14}/></button>
      </div>)}
    </div>
    <form className="settings-aux-s331__add" onSubmit={e=>{e.preventDefault();add()}}>
      <input aria-label={'Novo item em '+title} disabled={disabled} placeholder="Adicionar item…" value={text} onChange={e=>setText(e.target.value)}/>
      <Button type="submit" disabled={disabled||!text.trim()||items.some(x=>x.toLocaleLowerCase('pt-BR')===text.trim().toLocaleLowerCase('pt-BR'))} variant="secondary"><Plus size={14}/> Adicionar</Button>
    </form>
  </section>
}
