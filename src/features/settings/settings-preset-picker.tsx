import {useState} from 'react'
import {ArrowRight,CheckCircle2,SlidersHorizontal} from 'lucide-react'
import {Button} from '../../components/ui/button'
import type {SettingsFieldChange} from './settings-smart-forms'

export interface SettingsPresetOption<Id extends string>{
  id:Id;title:string;description:string
}
/** A preset is always inspected first. The Apply action is separate and
 * cannot be mistaken for a read-only suggestion or a model-generated action. */
export function SettingsPresetPicker<Id extends string>({
  title,description,options,changesFor,onApply,applyLabel,confirmationNote,disabled=false,
}:{
  title:string;description:string;options:SettingsPresetOption<Id>[]
  changesFor:(preset:Id)=>SettingsFieldChange[]
  onApply:(preset:Id)=>void;applyLabel:string;confirmationNote:string;disabled?:boolean
}){
  const [selected,setSelected]=useState<Id|null>(null)
  const changes=selected?changesFor(selected):[]
  return <section className="settings-presets-s33" aria-label={title}>
    <header className="settings-presets-s33__heading"><span><SlidersHorizontal size={19}/></span>
      <div><strong>{title}</strong><p>{description}</p></div>
    </header>
    <div className="settings-presets-s33__cards">
      {options.map(option=><button key={option.id} type="button" disabled={disabled}
        className={'settings-presets-s33__option'+(selected===option.id?' is-selected':'')}
        aria-pressed={selected===option.id} onClick={()=>setSelected(p=>p===option.id?null:option.id)}>
        <strong>{option.title}</strong><span>{option.description}</span>
      </button>)}
    </div>
    {selected?<div className="settings-presets-s33__review">
      <div className="settings-presets-s33__review-header"><strong>Prévia das alterações</strong><span>{changes.length} campo(s) serão modificados</span></div>
      {changes.length?<div className="settings-presets-s33__changes" aria-live="polite">
        {changes.map(change=><div key={change.field}><strong>{change.field}</strong><span>{change.before}</span><ArrowRight size={14}/><b>{change.after}</b></div>)}
      </div>:<p className="settings-presets-s33__same"><CheckCircle2 size={16}/> Este modelo já corresponde às suas opções.</p>}
      <div className="settings-presets-s33__footer"><small>{confirmationNote}</small>
        <Button disabled={disabled||!changes.length} onClick={()=>{onApply(selected);setSelected(null)}}>{applyLabel} <ArrowRight size={15}/></Button>
      </div>
    </div>:null}
  </section>
}
