import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { Lead } from '../../domain/types'
import { LeadForm, type LeadFormValue } from './lead-form'

export function EditLeadModal({ lead, open, onClose }: { lead: Lead | null; open: boolean; onClose(): void }) {
  const { updateLead, deleteLead } = useApp()
  const [saving, setSaving] = useState(false)
  const formId = 'edit-lead-form'
  if (!lead) return null

  const submit = async (value: LeadFormValue) => {
    setSaving(true)
    try {
      await updateLead(lead.id, value)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Excluir ${lead.name}? Esta ação remove o lead desta base.`)) return
    setSaving(true)
    try {
      await deleteLead(lead.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Editar lead"
      subtitle={`Atualize dados, etapa e próxima ação de ${lead.name}.`}
      onClose={onClose}
      size="lg"
      footer={<><Button variant="danger" onClick={() => void remove()} disabled={saving}><Trash2 size={17} /> Excluir</Button><span className="modal__footer-spacer" /><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" form={formId} loading={saving}>Salvar alterações</Button></>}
    >
      <LeadForm key={lead.id} formId={formId} lead={lead} onSubmit={submit} />
    </Modal>
  )
}
