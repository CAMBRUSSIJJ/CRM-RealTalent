import { NativeSelectionSelect } from '../../components/selection'
import '../../styles/buyer-room-v10066.css'
import { useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2, Clipboard, ExternalLink, FilePlus2, Link2, Plus, RefreshCcw, Trash2, UsersRound } from 'lucide-react'
import { useAppActions, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { StatusPill } from '../../components/ui/status-pill'
import type { BuyerRoom, BuyerRoomStepOwner, BuyerRoomStepStatus, ProposalRecord } from '../../domain/types'
import { createId } from '../../lib/id'
import { copyTextToClipboard, openExternalUrl } from '../../lib/browser-actions'
import { buyerRoomProgress, buyerRoomPublicUrl, buyerRoomStatusFromProgress } from '../../services/buyer-room'
import { effectiveDataMode } from '../../lib/env'

const statusLabel: Record<BuyerRoom['status'], string> = { draft: 'Rascunho', shared: 'Compartilhada', active: 'Em andamento', completed: 'Concluída', archived: 'Arquivada' }
const statusTone: Record<BuyerRoom['status'], 'neutral' | 'info' | 'warning' | 'success'> = { draft: 'neutral', shared: 'info', active: 'warning', completed: 'success', archived: 'neutral' }
const stepStatusLabel: Record<BuyerRoomStepStatus, string> = { pending: 'Pendente', in_progress: 'Em andamento', completed: 'Concluída', blocked: 'Bloqueada' }
const ownerLabel: Record<BuyerRoomStepOwner, string> = { seller: 'RealTalent', buyer: 'Comprador', shared: 'Compartilhada' }
const localDate = (value: string | null) => value ? value.slice(0, 10) : ''

interface Props { open: boolean; room: BuyerRoom | null; proposal: ProposalRecord | null; onClose(): void }

export function BuyerRoomModal({ open, room, proposal, onClose }: Props) {
  const { snapshot, canWrite } = useAppWorkspace()
  const { updateBuyerRoom, rotateBuyerRoomToken, recordBuyerRoomActivity, deleteBuyerRoom } = useAppActions()
  const { confirmAction, notify } = useAppUi()
  const [stepTitle, setStepTitle] = useState('')
  const [stepOwner, setStepOwner] = useState<BuyerRoomStepOwner>('shared')
  const [stepDue, setStepDue] = useState('')
  const [documentTitle, setDocumentTitle] = useState('')
  const [documentUrl, setDocumentUrl] = useState('')
  const [participantId, setParticipantId] = useState('')
  const [saving, setSaving] = useState(false)
  const progress = room ? buyerRoomProgress(room) : 0
  const shareUrl = room ? buyerRoomPublicUrl(room.shareToken) : ''
  const availableContacts = useMemo(() => {
    if (!snapshot || !room) return []
    return snapshot.contacts.filter((contact) => (room.companyId ? contact.companyId === room.companyId : contact.leadIds.includes(room.leadId)) && !room.participants.some((participant) => participant.contactId === contact.id))
  }, [room, snapshot])

  if (!room || !proposal || !snapshot) return null

  const patchRoom = async (patch: Parameters<typeof updateBuyerRoom>[1], activity?: { description: string; metadata?: Record<string, string | number | boolean | null> }) => {
    if (!canWrite) return
    setSaving(true)
    try {
      const next = await updateBuyerRoom(room.id, patch)
      if (activity) await recordBuyerRoomActivity(room.id, { type: 'status_changed', actorName: 'Equipe RealTalent', description: activity.description, metadata: activity.metadata ?? {} })
      return next
    } finally { setSaving(false) }
  }

  const updateStep = async (stepId: string, patch: Partial<BuyerRoom['steps'][number]>) => {
    const steps = room.steps.map((step) => step.id === stepId ? { ...step, ...patch, completedAt: patch.status === 'completed' ? step.completedAt ?? new Date().toISOString() : patch.status ? null : step.completedAt } : step)
    const draft = { ...room, steps }
    const status = buyerRoomStatusFromProgress(draft)
    await patchRoom({ steps, status })
    await recordBuyerRoomActivity(room.id, { type: 'step_updated', actorName: 'Equipe RealTalent', description: `Etapa "${steps.find((step) => step.id === stepId)?.title ?? 'Plano'}" atualizada.`, metadata: { stepId } })
  }

  const addStep = async () => {
    if (!stepTitle.trim()) return
    const steps = [...room.steps, { id: createId('room-step'), title: stepTitle.trim(), description: '', owner: stepOwner, ownerContactId: null, dueAt: stepDue || null, status: 'pending' as const, completedAt: null, order: room.steps.length + 1 }]
    await patchRoom({ steps, status: buyerRoomStatusFromProgress({ ...room, steps }) })
    await recordBuyerRoomActivity(room.id, { type: 'step_updated', actorName: 'Equipe RealTalent', description: `Etapa adicionada: ${stepTitle.trim()}.`, metadata: {} })
    setStepTitle(''); setStepDue('')
  }

  const removeStep = async (stepId: string) => {
    const steps = room.steps.filter((step) => step.id !== stepId).map((step, index) => ({ ...step, order: index + 1 }))
    await patchRoom({ steps, status: buyerRoomStatusFromProgress({ ...room, steps }) })
  }

  const addParticipant = async () => {
    const contact = snapshot.contacts.find((item) => item.id === participantId); if (!contact) return
    await patchRoom({ participants: [...room.participants, { id: createId('room-participant'), contactId: contact.id, name: contact.name, email: contact.email, jobTitle: contact.jobTitle, decisionRole: contact.decisionRole, side: 'buyer', required: ['decision_maker','economic_buyer','finance','procurement'].includes(contact.decisionRole), acknowledgedAt: null }] })
    setParticipantId('')
  }

  const addDocument = async () => {
    if (!documentTitle.trim() || !/^https?:\/\//i.test(documentUrl.trim())) { notify('error', 'Informe título e URL pública válida para o documento.'); return }
    await patchRoom({ documents: [...room.documents, { id: createId('room-document'), kind: 'link', title: documentTitle.trim(), url: documentUrl.trim(), proposalId: null, visible: true, addedAt: new Date().toISOString() }] })
    setDocumentTitle(''); setDocumentUrl('')
  }

  const toggleShare = async () => {
    const shareEnabled = !room.shareEnabled
    const nextStatus = shareEnabled ? (room.viewCount ? 'active' : 'shared') : 'draft'
    await patchRoom({ shareEnabled, status: room.status === 'completed' ? 'completed' : nextStatus }, { description: shareEnabled ? 'Buyer Room compartilhada com o cliente.' : 'Compartilhamento público desativado.' })
  }

  const copyLink = async () => { const copied = await copyTextToClipboard(shareUrl); notify(copied.ok ? 'success' : 'error', copied.ok ? 'Link copiado para a área de transferência.' : (copied.reason ?? 'Não foi possível copiar o link.')) }
  const openShareLink = () => { const opened = openExternalUrl(shareUrl); if (!opened.ok) notify('error', opened.reason ?? 'Não foi possível abrir a Buyer Room.') }
  const removeRoom = async () => {
    const ok = await confirmAction({ title: 'Excluir Buyer Room?', description: 'O link público será invalidado e o plano compartilhado será removido. A proposta não será excluída.', confirmLabel: 'Excluir Buyer Room', tone: 'danger' })
    if (!ok) return; await deleteBuyerRoom(room.id); onClose()
  }

  return <Modal open={open} onClose={onClose} size="xl" title="Buyer Room" subtitle={`${proposal.proposalNumber} · ${proposal.title}`} footer={<><Button variant="ghost" disabled={!canWrite} onClick={() => void removeRoom()}><Trash2 size={15}/> Excluir sala</Button><span className="modal__footer-spacer"/><Button variant="secondary" onClick={onClose}>Fechar</Button></>}>
    <div className="buyer-room-admin">
      <section className="buyer-room-admin__hero"><div><span className="eyebrow">Mutual Action Plan</span><h3>{room.title}</h3><p>{room.welcomeMessage}</p><div className="buyer-room-admin__meta"><StatusPill tone={statusTone[room.status]}>{statusLabel[room.status]}</StatusPill><span>{room.viewCount} abertura(s)</span>{room.lastOpenedAt ? <span>Última abertura {new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(room.lastOpenedAt))}</span> : null}</div></div><div className="buyer-room-admin__progress"><strong>{progress}%</strong><span>concluído</span><div><i style={{width:`${progress}%`}}/></div></div></section>

      <section className="buyer-room-admin__section"><header><div><span className="eyebrow">Compartilhamento</span><h3>Link privado do comprador</h3></div><Button size="sm" variant={room.shareEnabled ? 'secondary' : 'primary'} disabled={!canWrite || saving} onClick={() => void toggleShare()}><Link2 size={14}/>{room.shareEnabled ? 'Desativar link' : 'Ativar link'}</Button></header>{effectiveDataMode === 'local' ? <div className="buyer-room-admin__warning">No modo local, o link funciona somente neste navegador/computador. Para compartilhar externamente, publique o CRM conectado ao Supabase.</div> : null}<div className="buyer-room-admin__share"><label className="form-field"><span>Link</span><div className="buyer-room-admin__share-url"><input readOnly value={shareUrl}/><Button size="sm" variant="secondary" disabled={!room.shareEnabled} onClick={() => void copyLink()}><Clipboard size={14}/> Copiar</Button><Button size="sm" variant="secondary" disabled={!room.shareEnabled} onClick={openShareLink}><ExternalLink size={14}/></Button></div></label><label className="form-field"><span>Expira em</span><input type="date" value={localDate(room.expiresAt)} onChange={(event) => void patchRoom({ expiresAt: event.target.value ? `${event.target.value}T23:59:59.999Z` : null })}/></label></div><div style={{marginTop:10}}><Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => void rotateBuyerRoomToken(room.id)}><RefreshCcw size={14}/> Regenerar link</Button></div></section>

      <div className="buyer-room-admin__sections">
        <section className="buyer-room-admin__section"><header><div><span className="eyebrow">Plano conjunto</span><h3>Etapas até o fechamento</h3></div><CheckCircle2 size={18}/></header><div className="buyer-room-admin__steps">{room.steps.map((step) => <div className="buyer-room-admin__step" key={step.id}><div><strong>{step.title}</strong><small>{step.description || `Responsável: ${ownerLabel[step.owner]}`}</small></div><NativeSelectionSelect value={step.owner} disabled={!canWrite} onChange={(event) => void updateStep(step.id,{owner:event.target.value as BuyerRoomStepOwner})}><option value="seller">RealTalent</option><option value="buyer">Comprador</option><option value="shared">Em conjunto</option></NativeSelectionSelect><NativeSelectionSelect value={step.status} disabled={!canWrite} onChange={(event) => void updateStep(step.id,{status:event.target.value as BuyerRoomStepStatus})}><option value="pending">Pendente</option><option value="in_progress">Em andamento</option><option value="completed">Concluída</option><option value="blocked">Bloqueada</option></NativeSelectionSelect><button type="button" disabled={!canWrite} onClick={() => void removeStep(step.id)} aria-label="Remover etapa"><Trash2 size={14}/></button></div>)}</div><div className="buyer-room-admin__add"><input value={stepTitle} onChange={(event)=>setStepTitle(event.target.value)} placeholder="Nova etapa"/><NativeSelectionSelect value={stepOwner} onChange={(event)=>setStepOwner(event.target.value as BuyerRoomStepOwner)}><option value="shared">Em conjunto</option><option value="buyer">Comprador</option><option value="seller">RealTalent</option></NativeSelectionSelect><input type="date" value={stepDue} onChange={(event)=>setStepDue(event.target.value)}/><Button size="sm" disabled={!canWrite || !stepTitle.trim()} onClick={() => void addStep()}><Plus size={14}/>Adicionar</Button></div></section>

        <section className="buyer-room-admin__section"><header><div><span className="eyebrow">Buying committee</span><h3>Participantes</h3></div><UsersRound size={18}/></header><div className="buyer-room-admin__people">{room.participants.map((person) => <div key={person.id}><span><strong>{person.name}</strong><small>{person.jobTitle || person.decisionRole}</small></span>{person.side === 'seller' ? <em>RealTalent</em> : <button type="button" disabled={!canWrite} onClick={() => void patchRoom({participants:room.participants.filter((item)=>item.id!==person.id)})}>Remover</button>}</div>)}</div>{availableContacts.length ? <div className="buyer-room-admin__add"><NativeSelectionSelect value={participantId} onChange={(event)=>setParticipantId(event.target.value)}><option value="">Adicionar stakeholder…</option>{availableContacts.map((contact)=><option value={contact.id} key={contact.id}>{contact.name} · {contact.jobTitle || contact.decisionRole}</option>)}</NativeSelectionSelect><Button size="sm" disabled={!participantId || !canWrite} onClick={()=>void addParticipant()}><Plus size={14}/>Adicionar</Button></div> : null}</section>
      </div>

      <div className="buyer-room-admin__sections">
        <section className="buyer-room-admin__section"><header><div><span className="eyebrow">Materiais</span><h3>Documentos compartilhados</h3></div><FilePlus2 size={18}/></header><div className="buyer-room-admin__docs">{room.documents.map((doc) => <div key={doc.id}><span><strong>{doc.title}</strong><small>{doc.kind === 'proposal' ? 'Proposta vinculada automaticamente' : doc.url}</small></span>{doc.kind !== 'proposal' ? <button type="button" disabled={!canWrite} onClick={() => void patchRoom({documents:room.documents.filter((item)=>item.id!==doc.id)})}>Remover</button> : null}</div>)}</div><div className="buyer-room-admin__add"><input value={documentTitle} onChange={(event)=>setDocumentTitle(event.target.value)} placeholder="Título do documento"/><input value={documentUrl} onChange={(event)=>setDocumentUrl(event.target.value)} placeholder="https://..."/><Button size="sm" disabled={!canWrite} onClick={()=>void addDocument()}><Plus size={14}/>Adicionar</Button></div></section>

        <section className="buyer-room-admin__section"><header><div><span className="eyebrow">Engajamento</span><h3>Atividade recente</h3></div><CalendarClock size={18}/></header><div className="buyer-room-admin__activity">{room.activity.slice().reverse().slice(0,10).map((event)=><div key={event.id}><span><strong>{event.description}</strong><small>{event.actorName}</small></span><small>{new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(event.occurredAt))}</small></div>)}</div>{!room.activity.length ? <div className="buyer-room-admin__empty">A atividade do comprador aparecerá aqui.</div> : null}</section>
      </div>
    </div>
  </Modal>
}
