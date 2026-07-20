import { RotateCcw, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { PipelineCardField } from './pipeline-preferences'
import { DEFAULT_CARD_FIELDS } from './pipeline-preferences'

const fields: Array<{ key: PipelineCardField; label: string; help: string }> = [
  { key: 'company', label: 'Empresa', help: 'Nome comercial do lead.' },
  { key: 'city', label: 'Cidade', help: 'Localização principal.' },
  { key: 'owner', label: 'Responsável', help: 'Pessoa que conduz a oportunidade.' },
  { key: 'priority', label: 'Prioridade', help: 'Urgente, alta, média ou baixa.' },
  { key: 'value', label: 'Valor', help: 'Valor estimado da oportunidade.' },
  { key: 'source', label: 'Origem', help: 'Canal de aquisição.' },
  { key: 'tags', label: 'Tags', help: 'Marcadores comerciais.' },
  { key: 'nextAction', label: 'Próxima ação', help: 'Data do próximo passo.' },
  { key: 'stageAge', label: 'Tempo na etapa', help: 'Dias desde a última movimentação.' },
  { key: 'lastInteraction', label: 'Última interação', help: 'Contato mais recente registrado.' },
  { key: 'attempts', label: 'Tentativas', help: 'Quantidade de ligações registradas.' },
  { key: 'health', label: 'Saúde', help: 'Risco calculado da oportunidade.' },
]

export function PipelineSettingsModal({ open, value, onClose, onSave }: { open: boolean; value: PipelineCardField[]; onClose(): void; onSave(value: PipelineCardField[]): void }) {
  const [selected, setSelected] = useState<PipelineCardField[]>(value)
  useEffect(() => { if (open) setSelected(value) }, [open, value])

  const toggle = (field: PipelineCardField) => setSelected((current) => current.includes(field) ? current.filter((item) => item !== field) : [...current, field])

  return <Modal open={open} onClose={onClose} title="Configurar cards" subtitle="Escolha as informações exibidas no Kanban. As preferências ficam salvas neste workspace." size="md" footer={<>
    <Button variant="ghost" onClick={() => setSelected(DEFAULT_CARD_FIELDS)}><RotateCcw size={16} /> Restaurar padrão</Button>
    <span className="modal__footer-spacer" />
    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
    <Button disabled={!selected.length} onClick={() => { onSave(selected); onClose() }}><Save size={16} /> Salvar</Button>
  </>}>
    <div className="pipeline-field-picker">
      {fields.map((field) => <label key={field.key} className={selected.includes(field.key) ? 'is-selected' : ''}>
        <input type="checkbox" checked={selected.includes(field.key)} onChange={() => toggle(field.key)} />
        <span><strong>{field.label}</strong><small>{field.help}</small></span>
      </label>)}
    </div>
  </Modal>
}
