import {
  AlertTriangle, Building2, CalendarClock, CheckCircle2, CircleDollarSign, ContactRound, Edit3, Link2, Mail, MessageCircle, Network,
  PhoneCall, Plus, ShieldCheck, Sparkles, Trash2, UserRound, UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppActions, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { SelectionSelect } from '../../components/selection'
import { Modal } from '../../components/ui/modal'
import { formatCurrency, formatDateTime, initials } from '../../domain/formatters'
import type { ContactRecord, ContactRelationshipType, DecisionRole, Lead, RelationshipStrength, StakeholderStance } from '../../domain/types'
import { AccountRelationshipGraph } from './account-relationship-graph'
import { SalesMessageModal } from '../pipeline/sales-message-modal'
import { contactsForLead, opportunitiesForLead, relationshipsForLead } from '../../services/lead-relations-v10151'
import {
  buildAccountIntelligence, calculatedRelationshipScore, contactInteractionSummary, decisionRoleLabels,
  relationshipStrengthLabels, relationshipTypeLabels, stanceLabels,
} from '../../services/account-intelligence'

interface Props { open: boolean; lead: Lead | null; readOnly?: boolean; onClose(): void }
type AccountView = 'map' | 'cards' | 'list'

type ContactDraft = {
  name: string; jobTitle: string; phone: string; email: string; decisionRole: DecisionRole; influenceLevel: number;
  relationshipStrength: RelationshipStrength; relationshipScore: number; stance: StakeholderStance; notes: string; isPrimary: boolean;
}

const emptyContact = (): ContactDraft => ({
  name: '', jobTitle: '', phone: '', email: '', decisionRole: 'unknown', influenceLevel: 50,
  relationshipStrength: 'unknown', relationshipScore: 0, stance: 'unknown', notes: '', isPrimary: false,
})

const roleOrder: DecisionRole[] = ['economic_buyer', 'decision_maker', 'champion', 'finance', 'procurement', 'technical_evaluator', 'influencer', 'operational', 'user', 'gatekeeper', 'blocker', 'unknown']
const relationshipScoreBase: Record<RelationshipStrength, number> = { unknown: 0, weak: 25, developing: 50, strong: 75, trusted: 90 }
const influenceOptions = [{ value: 25, label: 'Baixa' }, { value: 60, label: 'Média' }, { value: 90, label: 'Alta' }]

export function Account360Modal({ open, lead, readOnly = false, onClose }: Props) {
  const { snapshot } = useAppWorkspace()
  const { confirmAction, notify } = useAppUi()
  const { createContact, updateContact, deleteContact, createContactRelationship, deleteContactRelationship, updateLead, listWorkspaceMembers } = useAppActions()
  const [editing, setEditing] = useState<ContactRecord | null>(null)
  const [contactDraft, setContactDraft] = useState<ContactDraft>(emptyContact())
  const [showContactForm, setShowContactForm] = useState(false)
  const [showAdvancedContact, setShowAdvancedContact] = useState(false)
  const [view, setView] = useState<AccountView>('map')
  const [showRelationshipForm, setShowRelationshipForm] = useState(false)
  const [relationshipFrom, setRelationshipFrom] = useState('')
  const [relationshipTo, setRelationshipTo] = useState('')
  const [relationshipType, setRelationshipType] = useState<ContactRelationshipType>('reports_to')
  const [relationshipStrength, setRelationshipStrength] = useState(60)
  const [relationshipNotes, setRelationshipNotes] = useState('')
  const [members, setMembers] = useState<Array<{ userId: string; displayName: string }>>([])
  const [busy, setBusy] = useState(false)
  const [messageContact, setMessageContact] = useState<ContactRecord | null>(null)

  useEffect(() => {
    if (!open) return
    void listWorkspaceMembers().then((items) => setMembers(items.map((item) => ({ userId: item.userId, displayName: item.displayName })))).catch(() => setMembers([]))
  }, [listWorkspaceMembers, open])

  useEffect(() => {
    if (!open) { setShowContactForm(false); setShowRelationshipForm(false); setEditing(null); setShowAdvancedContact(false); setMessageContact(null) }
  }, [open])

  const company = useMemo(() => lead && snapshot ? snapshot.companies.find((item) => item.id === lead.companyId) ?? null : null, [lead, snapshot])
  const contacts = useMemo(() => !snapshot || !lead ? [] : contactsForLead(lead, snapshot.contacts)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || roleOrder.indexOf(a.decisionRole) - roleOrder.indexOf(b.decisionRole) || Number(b.influenceLevel) - Number(a.influenceLevel)), [lead, snapshot])
  const relationships = useMemo(() => !snapshot || !lead ? [] : relationshipsForLead(lead, snapshot.contactRelationships), [lead, snapshot])
  const intelligence = useMemo(() => lead && snapshot ? buildAccountIntelligence(lead, contacts, relationships, snapshot) : null, [contacts, lead, relationships, snapshot])
  const opportunities = useMemo(() => !snapshot || !lead ? [] : opportunitiesForLead(lead, snapshot.opportunities), [lead, snapshot])
  const totalPipeline = opportunities.filter((item) => item.status === 'active').reduce((sum, item) => sum + item.value, 0)

  if (!lead || !snapshot || !intelligence) return null

  const openCreateContact = (role: DecisionRole = 'unknown') => {
    setEditing(null)
    setContactDraft({ ...emptyContact(), decisionRole: role })
    setShowAdvancedContact(false)
    setShowContactForm(true)
  }
  const openRecommendedContact = () => {
    if (intelligence.missingRoleGroups.includes('Decisão')) openCreateContact('economic_buyer')
    else if (intelligence.missingRoleGroups.includes('Financeiro/Compras')) openCreateContact('finance')
    else if (intelligence.missingRoleGroups.includes('Champion')) openCreateContact('champion')
    else openCreateContact('unknown')
  }
  const openEditContact = (contact: ContactRecord) => {
    setEditing(contact)
    setContactDraft({
      name: contact.name, jobTitle: contact.jobTitle, phone: contact.phone, email: contact.email, decisionRole: contact.decisionRole,
      influenceLevel: contact.influenceLevel, relationshipStrength: contact.relationshipStrength ?? 'unknown', relationshipScore: calculatedRelationshipScore(contact, snapshot),
      stance: contact.stance ?? 'unknown', notes: contact.notes ?? '', isPrimary: Boolean(contact.isPrimary),
    })
    setShowAdvancedContact(true)
    setShowContactForm(true)
  }

  const saveContact = async () => {
    if (!company?.id) { notify('error', 'Sincronize a estrutura comercial antes de adicionar pessoas à conta.'); return }
    if (!contactDraft.name.trim()) { notify('error', 'Informe o nome da pessoa.'); return }
    setBusy(true)
    try {
      const owner = members.find((item) => item.userId === lead.ownerId) ?? members[0]
      const input = { ...contactDraft, relationshipScore: relationshipScoreBase[contactDraft.relationshipStrength] }
      const saved = editing
        ? await updateContact(editing.id, input)
        : await createContact({
            companyId: company.id, ...input, relationshipOwnerId: owner?.userId ?? lead.ownerId ?? null, relationshipOwnerName: owner?.displayName ?? lead.ownerName,
            lastContactAt: null, nextActionAt: null, consentStatus: 'unknown', doNotContact: false, doNotContactReason: '', leadIds: [],
          })
      if (contactDraft.isPrimary) {
        await Promise.all(contacts.filter((item) => item.id !== saved.id && item.isPrimary).map((item) => updateContact(item.id, { isPrimary: false })))
        if (lead.primaryContactId !== saved.id) await updateLead(lead.id, { primaryContactId: saved.id })
      }
      setShowContactForm(false); setEditing(null); setContactDraft(emptyContact()); setShowAdvancedContact(false)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar a pessoa.') }
    finally { setBusy(false) }
  }

  const removeContact = async (contact: ContactRecord) => {
    if (!await confirmAction({ title: `Remover ${contact.name} da conta?`, description: 'O vínculo e as relações internas dessa pessoa serão removidos. O histórico comercial do contato não será apagado.', confirmLabel: 'Remover pessoa', tone: 'danger' })) return
    try { await deleteContact(contact.id) } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível remover a pessoa.') }
  }

  const saveRelationship = async () => {
    if (!company?.id || !relationshipFrom || !relationshipTo) { notify('error', 'Selecione as duas pessoas da relação.'); return }
    if (relationshipFrom === relationshipTo) { notify('error', 'Selecione duas pessoas diferentes.'); return }
    setBusy(true)
    try {
      await createContactRelationship({ companyId: company.id, fromContactId: relationshipFrom, toContactId: relationshipTo, relationshipType, strength: relationshipStrength, notes: relationshipNotes.trim() })
      setShowRelationshipForm(false); setRelationshipFrom(''); setRelationshipTo(''); setRelationshipNotes(''); setRelationshipStrength(60)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível criar a relação.') }
    finally { setBusy(false) }
  }

  const contactName = (id: string) => contacts.find((item) => item.id === id)?.name ?? 'Pessoa removida'

  const openContactChannel = (contact: ContactRecord, channel: 'call' | 'whatsapp' | 'email') => {
    if (contact.doNotContact) { notify('warning', `${contact.name} está marcado como não contatar.`); return }
    if (channel === 'email') {
      if (!contact.email) { notify('info', 'Este contato ainda não possui e-mail.'); return }
      window.location.href = `mailto:${contact.email}`
      return
    }
    if (!contact.phone) { notify('info', 'Este contato ainda não possui telefone.'); return }
    if (channel === 'call') { window.location.href = `tel:${contact.phone}`; return }
    setMessageContact(contact)
  }
  const renderCompactPerson = (contact: ContactRecord) => {
    const interactions = contactInteractionSummary(contact, snapshot)
    const score = calculatedRelationshipScore(contact, snapshot)
    return <article key={contact.id} className={`account360-person account360-person--${contact.decisionRole} ${contact.stance === 'opposed' ? 'is-opposed' : ''}`}>
      <div className="account360-person__head"><span className="lead-cell__avatar">{initials(contact.name)}</span><div><strong>{contact.name}</strong><small>{contact.jobTitle || 'Cargo não informado'}</small></div>{contact.isPrimary ? <span className="account360-primary">Principal</span> : null}</div>
      <div className="account360-person__role"><span>{decisionRoleLabels[contact.decisionRole]}</span><span>{stanceLabels[contact.stance ?? 'unknown']}</span></div>
      <div className="account360-person__meters"><span><i style={{ width: `${Math.max(4, contact.influenceLevel)}%` }} />Influência {contact.influenceLevel >= 80 ? 'alta' : contact.influenceLevel >= 45 ? 'média' : 'baixa'}</span><span><i style={{ width: `${Math.max(4, score)}%` }} />Relação {score}%</span></div>
      <div className="account360-person__meta"><span><PhoneCall size={13} /> {interactions.calls}</span><span><CalendarClock size={13} /> {interactions.meetings}</span><span><Link2 size={13} /> {relationships.filter((relation) => relation.fromContactId === contact.id || relation.toContactId === contact.id).length}</span></div>
      <small className="account360-person__last">{interactions.lastAt ? `Último contato ${formatDateTime(interactions.lastAt)}` : 'Nunca contatado'}</small>
      <div className="account360-person__channels"><button type="button" onClick={() => openContactChannel(contact, 'call')} disabled={!contact.phone || contact.doNotContact}><PhoneCall size={13}/> Ligar</button><button type="button" onClick={() => openContactChannel(contact, 'whatsapp')} disabled={!contact.phone || contact.doNotContact}><MessageCircle size={13}/> WhatsApp</button><button type="button" onClick={() => openContactChannel(contact, 'email')} disabled={!contact.email || contact.doNotContact}><Mail size={13}/> E-mail</button></div>
      {!readOnly ? <div className="account360-person__actions"><button type="button" onClick={() => openEditContact(contact)}><Edit3 size={14} /> Editar</button><button type="button" aria-label={`Remover ${contact.name}`} onClick={() => void removeContact(contact)}><Trash2 size={14} /></button></div> : null}
    </article>
  }

  return <>
    <Modal open={open} onClose={onClose} size="full" title={company?.name || lead.company || lead.name} subtitle="Account 360 · pessoas, relações e cobertura da conta"
      headerActions={!readOnly ? <div className="account360-header-actions"><Button size="sm" variant="secondary" onClick={() => setShowRelationshipForm(true)} disabled={contacts.length < 2}><Link2 size={15} /> Nova relação</Button><Button size="sm" onClick={() => openCreateContact()}><Plus size={15} /> Adicionar pessoa</Button></div> : undefined}>
      <div className="account360 account360--v10056">
        <section className="account360-hero">
          <div className="account360-hero__identity"><span className="lead-cell__avatar">{initials(company?.name || lead.company || lead.name)}</span><div><span className="eyebrow">Conta</span><h2>{company?.name || lead.company || lead.name}</h2><p>{formatCurrency(totalPipeline || lead.value)} em pipeline · {opportunities.filter((item) => item.status === 'active').length || 1} oportunidade(s) ativa(s)</p></div></div>
          <div className="account360-hero__metrics"><div><span>Cobertura</span><strong>{intelligence.coverageScore}%</strong></div><div><span>Relacionamento</span><strong>{intelligence.relationshipScore}%</strong></div><div><span>Pessoas</span><strong>{contacts.length}</strong></div></div>
          {!readOnly ? <div className="account360-hero__actions"><Button size="sm" variant="secondary" onClick={() => openCreateContact()}><Plus size={15} /> Pessoa</Button><Button size="sm" onClick={openRecommendedContact}><Sparkles size={15} /> {intelligence.recommendedAction.title}</Button></div> : null}
        </section>

        <section className={`account360-guidance account360-guidance--${intelligence.risk}`}>
          <div><Sparkles size={20} /><span><span className="eyebrow">Próximo gap recomendado</span><strong>{intelligence.recommendedAction.title}</strong><small>{intelligence.recommendedAction.explanation}</small></span></div>
          <div className="account360-guidance__coverage">
            {intelligence.strengths.slice(0, 2).map((item) => <span key={item}><CheckCircle2 size={14} /> {item}</span>)}
            {intelligence.warnings.slice(0, 2).map((item) => <span key={item} className="is-warning"><AlertTriangle size={14} /> {item}</span>)}
          </div>
        </section>

        <div className="account360-layout">
          <section className="account360-map panel">
            <header className="account360-section-header"><div><span className="eyebrow">Mapa da conta</span><h3>Organograma de decisão</h3><p>Veja quem decide, quem influencia, quem já foi contatado e quais papéis ainda estão descobertos.</p></div><div className="account360-view-switch" role="group" aria-label="Visualização do mapa da conta"><button type="button" className={view === 'map' ? 'is-active' : ''} onClick={() => setView('map')}>Organograma</button><button type="button" className={view === 'cards' ? 'is-active' : ''} onClick={() => setView('cards')}>Cards</button><button type="button" className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')}>Lista</button></div></header>

            {!contacts.length ? <div className="account360-empty"><UsersRound size={28} /><strong>Nenhum pessoa mapeado</strong><span>Adicione as pessoas que participam da decisão desta empresa.</span>{!readOnly ? <Button size="sm" onClick={() => openCreateContact()}><Plus size={15} /> Adicionar primeira pessoa</Button> : null}</div> : null}

            {contacts.length && view === 'map' ? <AccountRelationshipGraph contacts={contacts} relationships={relationships} scores={Object.fromEntries(contacts.map((contact) => [contact.id, calculatedRelationshipScore(contact, snapshot)]))} missingRoleGroups={intelligence.missingRoleGroups} readOnly={readOnly} onEdit={(contact) => !readOnly && openEditContact(contact)} onAddRole={openCreateContact} /> : null}
            {contacts.length && view === 'cards' ? <div className="account360-nodes">{contacts.map(renderCompactPerson)}</div> : null}
            {contacts.length && view === 'list' ? <div className="account360-contact-list">{contacts.map((contact) => { const interactions = contactInteractionSummary(contact, snapshot); const score = calculatedRelationshipScore(contact, snapshot); return <button type="button" key={contact.id} onClick={() => !readOnly && openEditContact(contact)}><span className="lead-cell__avatar">{initials(contact.name)}</span><span><strong>{contact.name}</strong><small>{contact.jobTitle || 'Cargo não informado'}</small></span><span>{decisionRoleLabels[contact.decisionRole]}</span><span>{stanceLabels[contact.stance ?? 'unknown']}</span><span>{interactions.total ? `${interactions.total} interações` : 'Nunca contatado'}</span><b>{score}%</b></button> })}</div> : null}

            {relationships.length ? <div className="account360-relations"><span className="eyebrow">Relações internas</span>{relationships.map((relationship) => <div key={relationship.id} className="account360-relation"><span><b>{contactName(relationship.fromContactId)}</b> {relationshipTypeLabels[relationship.relationshipType].toLowerCase()} <b>{contactName(relationship.toContactId)}</b><small>{relationship.notes || `Força ${relationship.strength}%`}</small></span><strong>{relationship.strength}%</strong>{!readOnly ? <button type="button" aria-label="Remover relação" onClick={() => void deleteContactRelationship(relationship.id)}><Trash2 size={14} /></button> : null}</div>)}</div> : null}
          </section>

          <aside className="account360-insights panel">
            <header className="account360-section-header"><div><span className="eyebrow">Cobertura</span><h3>Saúde da conta</h3></div><ShieldCheck size={22} /></header>
            <div className={`account360-risk account360-risk--${intelligence.risk}`}><span><small>Risco</small><strong>{intelligence.riskLabel.replace('Risco de relacionamento ', '').replace('Cobertura parcial da conta', 'Médio')}</strong></span><span><small>Cobertura</small><strong>{intelligence.coverageScore}%</strong></span></div>
            <div className="account360-checklist">
              {['Decisão', 'Champion', 'Financeiro/Compras', 'Influência/Operação'].map((item) => {
                const missing = intelligence.missingRoleGroups.includes(item)
                return <div key={item} className={missing ? 'is-missing' : 'is-covered'}>{missing ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}<span><strong>{item}</strong><small>{missing ? 'Ainda não mapeado' : 'Coberto'}</small></span></div>
              })}
            </div>
            <div className="account360-company-facts">
              <div><Building2 size={16} /><span><small>Empresa</small><strong>{company?.legalName || company?.name || lead.company}</strong></span></div>
              <div><CircleDollarSign size={16} /><span><small>Valor ativo</small><strong>{formatCurrency(totalPipeline || lead.value)}</strong></span></div>
              <div><ContactRound size={16} /><span><small>Pessoas mapeadas</small><strong>{contacts.length}</strong></span></div>
              <div><UserRound size={16} /><span><small>Responsável</small><strong>{lead.ownerName || 'Equipe'}</strong></span></div>
            </div>
            {opportunities.length ? <div className="account360-opportunities"><span className="eyebrow">Oportunidades relacionadas</span>{opportunities.slice(0, 4).map((opportunity) => <div key={opportunity.id}><span><strong>{opportunity.title}</strong><small>{opportunity.status === 'active' ? 'Ativa' : opportunity.status === 'won' ? 'Ganha' : 'Encerrada'}</small></span><b>{formatCurrency(opportunity.value)}</b></div>)}</div> : null}
            {company?.website ? <a className="account360-link" href={company.website} target="_blank" rel="noreferrer">Abrir site da empresa</a> : null}
          </aside>
        </div>
      </div>
    </Modal>

    <Modal open={showContactForm} onClose={() => setShowContactForm(false)} title={editing ? 'Editar pessoa' : 'Adicionar pessoa'} subtitle="Registre o papel dessa pessoa na decisão sem burocracia." size="lg"
      footer={<><Button variant="ghost" onClick={() => setShowContactForm(false)}>Cancelar</Button><Button loading={busy} onClick={() => void saveContact()}>Salvar pessoa</Button></>}>
      <div className="account360-form-grid account360-form-grid--simple">
        <label className="field"><span>Nome *</span><input autoFocus data-autofocus value={contactDraft.name} onChange={(event) => setContactDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Mariana Almeida" /></label>
        <label className="field"><span>Cargo</span><input value={contactDraft.jobTitle} onChange={(event) => setContactDraft((current) => ({ ...current, jobTitle: event.target.value }))} placeholder="Ex.: Sócia / Financeiro" /></label>
        <label className="field"><span>Telefone</span><input value={contactDraft.phone} onChange={(event) => setContactDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
        <label className="field"><span>E-mail</span><input type="email" value={contactDraft.email} onChange={(event) => setContactDraft((current) => ({ ...current, email: event.target.value }))} /></label>
        <label className="field"><span>Papel na decisão</span><SelectionSelect value={contactDraft.decisionRole} onValueChange={(value) => setContactDraft((current) => ({ ...current, decisionRole: value as DecisionRole }))} options={roleOrder.map((role) => ({ value: role, label: decisionRoleLabels[role] }))} /></label>
        <label className="field"><span>Posicionamento na compra</span><SelectionSelect value={contactDraft.stance} onValueChange={(value) => setContactDraft((current) => ({ ...current, stance: value as StakeholderStance }))} options={Object.entries(stanceLabels).map(([value, label]) => ({ value, label }))} /></label>
        <button type="button" className="account360-advanced-toggle span-2" onClick={() => setShowAdvancedContact((value) => !value)}>{showAdvancedContact ? 'Ocultar informações avançadas' : 'Mais informações'}</button>
        {showAdvancedContact ? <>
          <label className="field"><span>Influência</span><SelectionSelect value={String(contactDraft.influenceLevel)} onValueChange={(value) => setContactDraft((current) => ({ ...current, influenceLevel: Number(value) }))} options={influenceOptions.map((option) => ({ value: String(option.value), label: option.label }))} /></label>
          <label className="field"><span>Força do relacionamento</span><SelectionSelect value={contactDraft.relationshipStrength} onValueChange={(value) => setContactDraft((current) => ({ ...current, relationshipStrength: value as RelationshipStrength }))} options={Object.entries(relationshipStrengthLabels).map(([value, label]) => ({ value, label }))} /><small className="field-help">O score é calculado pelo CRM usando relacionamento e interações.</small></label>
          <label className="account360-primary-check span-2"><input type="checkbox" checked={contactDraft.isPrimary} onChange={(event) => setContactDraft((current) => ({ ...current, isPrimary: event.target.checked }))} /><span><strong>Definir como contato principal da conta</strong><small>Será a pessoa sugerida por padrão nas ações desta empresa.</small></span></label>
          <label className="field span-2"><span>Notas de relacionamento</span><textarea rows={4} value={contactDraft.notes} onChange={(event) => setContactDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="O que essa pessoa valoriza, objeções, influência e contexto interno." /></label>
        </> : null}
      </div>
    </Modal>

    <Modal open={showRelationshipForm} onClose={() => setShowRelationshipForm(false)} title="Relacionar pessoas" subtitle="Mapeie como as pessoas da conta se conectam." size="md"
      footer={<><Button variant="ghost" onClick={() => setShowRelationshipForm(false)}>Cancelar</Button><Button loading={busy} onClick={() => void saveRelationship()}>Adicionar relação</Button></>}>
      <div className="account360-form-grid">
        <label className="field"><span>De</span><SelectionSelect value={relationshipFrom} onValueChange={setRelationshipFrom} searchable placeholder="Selecionar pessoa..." options={contacts.map((item) => ({ value: item.id, label: item.name, description: item.jobTitle || decisionRoleLabels[item.decisionRole] }))} /></label>
        <label className="field"><span>Relação</span><SelectionSelect value={relationshipType} onValueChange={(value) => setRelationshipType(value as ContactRelationshipType)} options={Object.entries(relationshipTypeLabels).map(([value, label]) => ({ value, label }))} /></label>
        <label className="field"><span>Com</span><SelectionSelect value={relationshipTo} onValueChange={setRelationshipTo} searchable placeholder="Selecionar pessoa..." options={contacts.map((item) => ({ value: item.id, label: item.name, description: item.jobTitle || decisionRoleLabels[item.decisionRole] }))} /></label>
        <label className="field"><span>Força · {relationshipStrength}%</span><input type="range" min="0" max="100" value={relationshipStrength} onChange={(event) => setRelationshipStrength(Number(event.target.value))} /></label>
        <label className="field span-2"><span>Contexto</span><textarea rows={3} value={relationshipNotes} onChange={(event) => setRelationshipNotes(event.target.value)} placeholder="Ex.: Mariana participa de toda aprovação financeira junto de Carlos." /></label>
      </div>
    </Modal>

    <SalesMessageModal lead={lead} contact={messageContact} recordActivity={!readOnly} stageName="Account 360" open={Boolean(messageContact)} onClose={() => setMessageContact(null)} />
  </>
}
