import { Eye, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import {
  DEFAULT_CALL_DISPLAY_PREFERENCES,
  callDisplayPreferenceGroups,
  normalizeCallDisplayPreferences,
  type CallDisplayPreferences,
} from '../../services/call-display-preferences'

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

  return <Modal
    open={open}
    onClose={onClose}
    title="Personalizar Ligações"
    subtitle="Escolha o que fica visível na fila e durante a sessão."
    size="lg"
    footer={<><Button variant="ghost" onClick={() => setDraft({ ...DEFAULT_CALL_DISPLAY_PREFERENCES })}><RotateCcw size={16} /> Restaurar padrão</Button><span className="modal__footer-spacer" /><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => onSave(normalizeCallDisplayPreferences(draft))}><Eye size={16} /> Aplicar visualização</Button></>}
  >
    <div className="call-display-settings">
      <section className="call-display-density">
        <div><SlidersHorizontal size={18} /><div><strong>Densidade da fila</strong><span>Altere o espaço usado por cada contato.</span></div></div>
        <div className="segmented-control"><button type="button" className={draft.queueDensity === 'compact' ? 'is-active' : ''} onClick={() => setDraft((current) => ({ ...current, queueDensity: 'compact' }))}>Compacta</button><button type="button" className={draft.queueDensity === 'comfortable' ? 'is-active' : ''} onClick={() => setDraft((current) => ({ ...current, queueDensity: 'comfortable' }))}>Confortável</button></div>
      </section>
      {callDisplayPreferenceGroups.map((group) => <section className="call-display-group" key={group.title}><h3>{group.title}</h3><div>{group.items.map((item) => <label key={item.key} className="call-display-option"><input type="checkbox" checked={Boolean(draft[item.key])} onChange={() => toggle(item.key)} /><span><strong>{item.label}</strong><small>{item.description}</small></span></label>)}</div></section>)}
    </div>
  </Modal>
}
