import { ChevronDown, PhoneCall, Plus, RefreshCw } from 'lucide-react'
import { useRef, useState } from 'react'
import { useAppActions } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { Lead } from '../../domain/types'
import { LeadForm, type LeadFormValue } from './lead-form'

export type LeadCreateNextAction = 'close' | 'open' | 'call' | 'followup' | 'another'

export function CreateLeadModal({ open, onClose, initialStageId, onCreated, mode = 'contact' }: { open: boolean; onClose(): void; initialStageId?: string; onCreated?(lead: Lead, action: LeadCreateNextAction): void; mode?: 'contact' | 'opportunity' }) {
  const { createLead } = useAppActions()
  const [saving, setSaving] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const intentRef = useRef<LeadCreateNextAction>('open')
  const formId = `create-lead-form-${formKey}`
  const submit = async (value: LeadFormValue) => {
    setSaving(true)
    try {
      const lead = await createLead(value)
      const action = intentRef.current
      onCreated?.(lead, action)
      if (action === 'another') {
        setFormKey((current) => current + 1)
        intentRef.current = 'open'
      } else onClose()
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      open={open}
      title={mode === 'opportunity' ? 'Nova oportunidade' : 'Novo contato'}
      subtitle={mode === 'opportunity' ? 'Crie a oportunidade junto do contato principal; o RealTalent mantém os dois registros vinculados.' : 'Cadastre em segundos e complete o restante quando fizer sentido para a venda.'}
      onClose={onClose}
      size="lg"
      footer={<div className="lead-create-footer"><Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button><div className="lead-create-split"><Button type="submit" form={formId} loading={saving} onClick={() => { intentRef.current = 'open' }}>{mode === 'opportunity' ? 'Criar oportunidade' : 'Salvar e trabalhar'}</Button><details><summary aria-label="Outras opções"><ChevronDown size={16} /></summary><div className="lead-create-menu"><button type="submit" form={formId} onClick={() => { intentRef.current = 'close' }}>Salvar e fechar</button><button type="submit" form={formId} onClick={() => { intentRef.current = 'call' }}><PhoneCall size={15}/> Salvar e ligar</button><button type="submit" form={formId} onClick={() => { intentRef.current = 'followup' }}><RefreshCw size={15}/> Salvar e criar follow-up</button><button type="submit" form={formId} onClick={() => { intentRef.current = 'another' }}><Plus size={15}/> Salvar e adicionar outro</button></div></details></div></div>}
    >
      <LeadForm key={formKey} formId={formId} initialStageId={initialStageId} onSubmit={submit} defaultExpanded={false} mode={mode} />
    </Modal>
  )
}
