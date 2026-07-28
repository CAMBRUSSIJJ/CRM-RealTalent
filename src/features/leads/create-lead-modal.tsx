import { useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { LeadForm, type LeadFormValue } from './lead-form'

export function CreateLeadModal({ open, onClose, initialStageId }: { open: boolean; onClose(): void; initialStageId?: string }) {
  const { createLead } = useApp()
  const [saving, setSaving] = useState(false)
  const formId = 'create-lead-form'
  const submit = async (value: LeadFormValue) => {
    setSaving(true)
    try {
      await createLead(value)
      onClose()
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      open={open}
      title="Novo lead"
      subtitle="Cadastre a oportunidade e envie diretamente para a etapa correta."
      onClose={onClose}
      size="lg"
      footer={<><Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form={formId} loading={saving}>Salvar lead</Button></>}
    >
      <LeadForm formId={formId} initialStageId={initialStageId} onSubmit={submit} />
    </Modal>
  )
}
