import { ArrowRight, CheckCircle2, GitMerge, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { formatCurrency } from '../../domain/formatters'
import type { DuplicatePair } from '../../services/lead-intelligence'

export function DuplicateMergeModal({ pair, open, onClose }: { pair: DuplicatePair | null; open: boolean; onClose(): void }) {
  const { snapshot, mergeLeads, notify } = useApp()
  const [primaryId, setPrimaryId] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (pair) setPrimaryId(pair.primary.id) }, [pair])
  if (!pair) return null
  const leads = [pair.primary, pair.duplicate]
  const primary = leads.find((lead) => lead.id === primaryId) ?? pair.primary
  const duplicate = leads.find((lead) => lead.id !== primary.id) ?? pair.duplicate
  const historyCount = (snapshot?.activities.filter((item) => item.leadId === duplicate.id).length ?? 0)
    + (snapshot?.calls.filter((item) => item.leadId === duplicate.id).length ?? 0)
    + (snapshot?.events.filter((item) => item.leadId === duplicate.id).length ?? 0)

  const submit = async () => {
    setSaving(true)
    try { await mergeLeads(primary.id, duplicate.id); onClose() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível mesclar os cadastros.') }
    finally { setSaving(false) }
  }

  return <Modal open={open} title="Revisar possível duplicado" subtitle={pair.reasons.join(' • ')} onClose={onClose} size="lg" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={() => void submit()}><GitMerge size={17} /> Mesclar com segurança</Button></>}>
    <div className="duplicate-merge">
      <div className="duplicate-merge__choice" role="radiogroup" aria-label="Cadastro que será mantido">
        {leads.map((lead) => <label key={lead.id} className={primary.id === lead.id ? 'is-selected' : ''}>
          <input type="radio" name="primary-lead" checked={primary.id === lead.id} onChange={() => setPrimaryId(lead.id)} />
          <span><small>{primary.id === lead.id ? 'Cadastro principal' : 'Será incorporado'}</small><strong>{lead.name}</strong><em>{lead.company || 'Sem empresa'} · {lead.phone || 'Sem telefone'}</em><em>{formatCurrency(lead.value)} · {lead.tags.join(', ') || 'Sem tags'}</em></span>
          {primary.id === lead.id ? <CheckCircle2 size={20} /> : null}
        </label>)}
      </div>
      <div className="duplicate-merge__flow"><strong>{duplicate.name}</strong><ArrowRight /><strong>{primary.name}</strong></div>
      <div className="duplicate-merge__safety"><ShieldCheck size={22} /><div><strong>Nenhum histórico será perdido</strong><p>{historyCount} registro(s) de atividade, ligação ou agenda serão transferidos. Campos vazios serão preenchidos, tags serão unidas e o maior valor será mantido para não duplicar o pipeline.</p></div></div>
    </div>
  </Modal>
}
