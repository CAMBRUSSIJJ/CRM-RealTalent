import { BookOpenText, Clock3, Eye, History, Mic2, RotateCcw, ShieldQuestion, SlidersHorizontal, StickyNote, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Modal } from '../../components/ui/modal'
import {
  DEFAULT_CALL_DISPLAY_PREFERENCES,
  callDisplayPreferenceGroups,
  normalizeCallDisplayPreferences,
  type CallDisplayPreferences,
} from '../../services/call-display-preferences'
import './call-display-reference.css'

const visibleOptions = [
  { heading:'1. Roteiro e Execução', items:[
    { key:'showScriptProgress' as const, label:'Guia passo a passo (Script)', icon:BookOpenText },
    { key:'showObjections' as const, label:'Apoio a objeções', icon:ShieldQuestion },
  ] },
  { heading:'2. Informações do Contato', items:[
    { key:'showHistory' as const, label:'Histórico de interações', icon:History },
    { key:'showNotes' as const, label:'Notas importantes (Fixadas)', icon:StickyNote },
  ] },
  { heading:'3. Ferramentas de Apoio', items:[
    { key:'showTimer' as const, label:'Cronômetro da chamada', icon:Clock3 },
    { key:'showRecording' as const, label:'Controle de gravação', icon:Mic2 },
  ] },
]

export function CallDisplayPreferencesModal({ open, value, onClose, onSave }: {
  open: boolean
  value: CallDisplayPreferences
  onClose(): void
  onSave(value: CallDisplayPreferences): void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { if (open) setDraft(normalizeCallDisplayPreferences(value)) }, [open, value])
  const toggle = (key: keyof CallDisplayPreferences) => {
    if (key === 'queueDensity') return
    setDraft((current) => ({ ...current, [key]: !current[key] }))
  }
  const script = draft.showScriptProgress
  const objections = draft.showObjections
  const history = draft.showHistory
  const notes = draft.showNotes

  return <Modal open={open} title="Personalizar Modo Foco" onClose={onClose} className="rt-call-display-reference-dialog" size="xl">
    <div className="rt-call-display-reference" data-realtalent-display-preview="live-v1">
      <section className="rt-call-display-reference__settings">
        <header><h2>Personalizar Modo Foco</h2><button type="button" onClick={onClose} aria-label="Fechar personalização"><X size={20}/></button></header>
        <div className="rt-call-display-reference__options">
          {visibleOptions.map((group) => <section key={group.heading}>
            <h3>{group.heading}</h3>
            {group.items.map((item) => <label className="rt-call-display-reference__option" key={item.key}>
              <span>{item.label}</span>
              <input type="checkbox" checked={draft[item.key]} onChange={() => toggle(item.key)}/>
            </label>)}
          </section>)}
          <details className="rt-call-display-reference__extra">
            <summary><SlidersHorizontal size={15}/> Outras opções de visualização</summary>
            <div>
              <section><h3>Densidade da fila</h3><div className="rt-call-display-reference__density">
                <button type="button" className={draft.queueDensity === 'compact' ? 'is-active' : ''} onClick={() => setDraft((current) => ({ ...current, queueDensity:'compact' }))}>Compacta</button>
                <button type="button" className={draft.queueDensity === 'comfortable' ? 'is-active' : ''} onClick={() => setDraft((current) => ({ ...current, queueDensity:'comfortable' }))}>Confortável</button>
              </div></section>
              {callDisplayPreferenceGroups.map((group) => <section key={group.title}><h3>{group.title}</h3>
                {group.items.filter((item) => !visibleOptions.some((v) => v.items.some((shown) => shown.key === item.key))).map((item) => <label key={item.key} className="rt-call-display-reference__option"><span>{item.label}<small>{item.description}</small></span><input type="checkbox" checked={Boolean(draft[item.key])} onChange={() => toggle(item.key)}/></label>)}
              </section>)}
            </div>
          </details>
        </div>
        <footer>
          <button type="button" className="rt-call-display-reference__reset" onClick={() => setDraft({ ...DEFAULT_CALL_DISPLAY_PREFERENCES })}><RotateCcw size={15}/> Restaurar</button>
          <button type="button" className="rt-call-display-reference__finish" onClick={() => onSave(normalizeCallDisplayPreferences(draft))}>Concluir</button>
        </footer>
      </section>
      <aside className="rt-call-display-reference__preview">
        <h3>Prévia do Layout</h3>
        <div className="rt-call-display-reference__wireframe">
          <div className="rt-call-display-reference__wireframe-header">
            <div><i className="is-avatar"/><i className="is-title"/></div>
            <div>{draft.showRecording ? <span className="is-recording">REC</span> : null}{draft.showTimer ? <span className="is-timer">02:45</span> : null}</div>
          </div>
          <div className="rt-call-display-reference__wireframe-body">
            {script || objections ? <div className="rt-call-display-reference__wireframe-main">
              {script ? <div className="is-script"><i/><section><i/><i/><i/></section></div> : null}
              {objections ? <div className="is-objection"><i/></div> : null}
            </div> : null}
            {history || notes ? <div className="rt-call-display-reference__wireframe-side">
              {history ? <div className="is-history"><i/><i/><i/></div> : null}
              {notes ? <div className="is-notes"><i/></div> : null}
            </div> : null}
            {!script && !objections && !history && !notes ? <div className="rt-call-display-reference__minimal"><Eye size={19}/> Layout mínimo</div> : null}
          </div>
        </div>
        <p>As alterações aparecem nesta prévia antes de serem aplicadas à sessão.</p>
      </aside>
    </div>
  </Modal>
}
