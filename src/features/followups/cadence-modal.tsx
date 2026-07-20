import { CalendarDays, Check, ChevronLeft, ChevronRight, Layers3, Minus, Plus, Search, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { createId } from '../../lib/id'
import { DEFAULT_CADENCE_TEMPLATES, channelLabel, type CadenceStepInput, type CadenceTemplateInput, type FollowupChannel } from '../../services/followup-workspace'

const defaultStart = () => {
  const date = new Date(); date.setHours(date.getHours() + 1, 0, 0, 0)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const cloneTemplate = (template: CadenceTemplateInput): CadenceTemplateInput => JSON.parse(JSON.stringify(template)) as CadenceTemplateInput
const channelType = (channel: FollowupChannel): CadenceStepInput['type'] => channel === 'call' ? 'call' : channel === 'meeting' ? 'meeting' : 'followup'

interface Props {
  open: boolean
  onClose(): void
  initialLeadIds?: string[]
}

export function CadenceModal({ open, onClose, initialLeadIds = [] }: Props) {
  const { snapshot, createCadence, notify } = useApp()
  const [screen, setScreen] = useState<'template' | 'configure' | 'leads'>('template')
  const [template, setTemplate] = useState<CadenceTemplateInput>(() => cloneTemplate(DEFAULT_CADENCE_TEMPLATES[0]))
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([])
  const [leadQuery, setLeadQuery] = useState('')
  const [startAt, setStartAt] = useState(defaultStart())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setScreen('template')
    setTemplate(cloneTemplate(DEFAULT_CADENCE_TEMPLATES[0]))
    setSelectedLeadIds(initialLeadIds)
    setLeadQuery('')
    setStartAt(defaultStart())
  }, [initialLeadIds, open])

  const activeLeads = useMemo(() => {
    const query = leadQuery.trim().toLowerCase()
    return (snapshot?.leads ?? []).filter((lead) => lead.status === 'active' && (!query || `${lead.name} ${lead.company} ${lead.city} ${lead.phone}`.toLowerCase().includes(query)))
  }, [leadQuery, snapshot])

  const selectTemplate = (item: CadenceTemplateInput) => { setTemplate(cloneTemplate(item)); setScreen('configure') }
  const updateStep = (id: string, patch: Partial<CadenceStepInput>) => setTemplate((current) => ({ ...current, steps: current.steps.map((item) => item.id === id ? { ...item, ...patch } : item) }))
  const removeStep = (id: string) => setTemplate((current) => ({ ...current, steps: current.steps.filter((item) => item.id !== id) }))
  const addStep = () => setTemplate((current) => ({ ...current, steps: [...current.steps, { id: createId('step'), title: 'Nova etapa', offsetDays: (current.steps.at(-1)?.offsetDays ?? 0) + 2, channel: 'whatsapp', type: 'followup', objective: 'Defina o objetivo desta tentativa.', script: 'Defina a orientação ou mensagem sugerida.' }] }))
  const toggleLead = (leadId: string) => setSelectedLeadIds((current) => current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId])

  const submit = async () => {
    if (!selectedLeadIds.length) { notify('error', 'Selecione pelo menos um lead.'); return }
    if (!template.name.trim()) { notify('error', 'Informe o nome da cadência.'); return }
    if (!template.steps.length) { notify('error', 'Inclua pelo menos uma etapa.'); return }
    if (template.steps.some((item) => !item.title.trim() || item.offsetDays < 0)) { notify('error', 'Revise os títulos e intervalos das etapas.'); return }
    setBusy(true)
    try {
      await createCadence(selectedLeadIds, new Date(startAt).toISOString(), { ...template, name: template.name.trim(), steps: [...template.steps].sort((a, b) => a.offsetDays - b.offsetDays) })
      onClose()
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível iniciar a cadência.') }
    finally { setBusy(false) }
  }

  const subtitle = screen === 'template' ? 'Escolha uma estratégia pronta ou personalize antes de aplicar.' : screen === 'configure' ? 'Defina canais, intervalos, objetivos e orientação de cada etapa.' : 'Selecione os leads que entrarão na sequência.'

  return <Modal open={open} onClose={onClose} title="Iniciar cadência profissional" subtitle={subtitle} size="lg" footer={<>
    {screen !== 'template' ? <Button variant="ghost" onClick={() => setScreen(screen === 'leads' ? 'configure' : 'template')}><ChevronLeft size={16} /> Voltar</Button> : null}
    <span className="modal__footer-spacer" />
    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
    {screen === 'configure' ? <Button onClick={() => setScreen('leads')}>Selecionar leads <ChevronRight size={16} /></Button> : null}
    {screen === 'leads' ? <Button loading={busy} onClick={() => void submit()}><Layers3 size={16} /> Iniciar em {selectedLeadIds.length} lead(s)</Button> : null}
  </>}>
    {screen === 'template' ? <div className="cadence-template-grid">
      {DEFAULT_CADENCE_TEMPLATES.map((item) => <button type="button" key={item.id} className="cadence-template-card" onClick={() => selectTemplate(item)}>
        <span className="cadence-template-card__icon"><Layers3 size={20} /></span>
        <span className="cadence-template-card__category">{item.category}</span>
        <strong>{item.name}</strong>
        <p>{item.description}</p>
        <footer><span>{item.steps.length} etapas</span><span>{item.steps.at(-1)?.offsetDays ?? 0} dias</span><ChevronRight size={16} /></footer>
      </button>)}
    </div> : null}

    {screen === 'configure' ? <div className="cadence-builder">
      <section className="cadence-builder__settings">
        <label className="field"><span>Nome da cadência</span><input value={template.name} maxLength={80} onChange={(event) => setTemplate((current) => ({ ...current, name: event.target.value }))} /></label>
        <label className="field"><span>Categoria</span><input value={template.category} maxLength={50} onChange={(event) => setTemplate((current) => ({ ...current, category: event.target.value }))} /></label>
        <label className="field field--span-2"><span>Descrição</span><input value={template.description} maxLength={180} onChange={(event) => setTemplate((current) => ({ ...current, description: event.target.value }))} /></label>
        <label className="cadence-weekend-toggle field--span-2"><input type="checkbox" checked={template.skipWeekends} onChange={(event) => setTemplate((current) => ({ ...current, skipWeekends: event.target.checked }))} /><span><strong>Pausar em finais de semana</strong><small>As etapas que caírem no sábado ou domingo serão movidas para o próximo dia útil.</small></span></label>
      </section>

      <div className="cadence-builder__heading"><div><span className="eyebrow">Sequência</span><h3>{template.steps.length} etapas configuradas</h3></div><Button size="sm" variant="secondary" onClick={addStep}><Plus size={15} /> Adicionar etapa</Button></div>
      <div className="cadence-step-list">
        {template.steps.map((item, index) => <article className="cadence-step-editor" key={item.id}>
          <span className="cadence-step-editor__number">{index + 1}</span>
          <div className="cadence-step-editor__content">
            <div className="cadence-step-editor__row">
              <label className="field"><span>Título</span><input value={item.title} onChange={(event) => updateStep(item.id, { title: event.target.value })} /></label>
              <label className="field"><span>Canal</span><select value={item.channel} onChange={(event) => { const channel = event.target.value as FollowupChannel; updateStep(item.id, { channel, type: channelType(channel) }) }}>{Object.entries(channelLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field cadence-offset-field"><span>Dia</span><input type="number" min="0" max="365" value={item.offsetDays} onChange={(event) => updateStep(item.id, { offsetDays: Math.max(0, Number(event.target.value) || 0) })} /></label>
              <button type="button" className="icon-button" disabled={template.steps.length === 1} onClick={() => removeStep(item.id)} aria-label="Remover etapa"><Minus size={17} /></button>
            </div>
            <label className="field"><span>Objetivo comercial</span><input value={item.objective} onChange={(event) => updateStep(item.id, { objective: event.target.value })} /></label>
            <label className="field"><span>Orientação, script ou mensagem sugerida</span><textarea rows={2} value={item.script} onChange={(event) => updateStep(item.id, { script: event.target.value })} /></label>
          </div>
        </article>)}
      </div>
    </div> : null}

    {screen === 'leads' ? <div className="cadence-lead-picker">
      <section className="cadence-start-card">
        <div><CalendarDays size={21} /><span><strong>Primeira execução</strong><small>Os demais contatos serão distribuídos pelos intervalos configurados.</small></span></div>
        <input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
      </section>
      <div className="cadence-lead-picker__toolbar">
        <label className="search-field"><Search size={18} /><input value={leadQuery} onChange={(event) => setLeadQuery(event.target.value)} placeholder="Buscar lead, empresa ou cidade..." /></label>
        <Button size="sm" variant="secondary" onClick={() => setSelectedLeadIds(activeLeads.map((lead) => lead.id))}><UsersRound size={15} /> Selecionar visíveis</Button>
        {selectedLeadIds.length ? <Button size="sm" variant="ghost" onClick={() => setSelectedLeadIds([])}>Limpar</Button> : null}
      </div>
      <div className="cadence-selected-summary"><strong>{selectedLeadIds.length} lead(s) selecionado(s)</strong><span>{template.name} · {template.steps.length} etapas · até D+{template.steps.at(-1)?.offsetDays ?? 0}</span></div>
      <div className="cadence-lead-list">
        {activeLeads.map((lead) => <button type="button" key={lead.id} className={selectedLeadIds.includes(lead.id) ? 'is-selected' : ''} onClick={() => toggleLead(lead.id)}>
          <span className="cadence-lead-list__check">{selectedLeadIds.includes(lead.id) ? <Check size={15} /> : null}</span>
          <span><strong>{lead.name}</strong><small>{lead.company || 'Sem empresa'} · {lead.city || 'Cidade não informada'}</small></span>
          <span className={`priority-dot priority-dot--${lead.priority}`} />
        </button>)}
      </div>
    </div> : null}
  </Modal>
}
