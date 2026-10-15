import { NativeSelectionSelect } from '../../components/selection'
import { Check, Copy, Mail, MessageCircle, PhoneCall, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAppActions, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { ContactRecord, Lead } from '../../domain/types'
import { copyTextToClipboard } from '../../lib/browser-actions'
import { suggestSalesMessage, type SalesMessageChannel } from '../../services/sales-messages'
import { contactBlockedMessage } from '../../services/contact-policy'
import { usePreferences } from '../settings/preferences-context'
import { connectedWhatsAppAccounts, loadWhatsAppTemplates, normalizeWhatsAppPhone, openAssistedWhatsApp, pickWhatsAppTemplate, renderWhatsAppTemplate, sendOfficialWhatsApp, templateContextFromLead, whatsappActivityDescription, type WhatsAppTemplate, type WhatsAppTemplatePurpose } from '../../services/whatsapp-workspace'
import { connectedAccountLabel, loadCommunicationChannelState, sendOfficialEmail } from '../../services/communication-workspace'
import type { ConnectedAccount } from '../../services/integration-framework'

const digits = (value: string) => value.replace(/\D/g, '')

export function SalesMessageModal({ lead, contact = null, recordActivity = true, templatePurpose, proposalLabel = '', initialChannel, stageName, open, onClose }: { lead: Lead | null; contact?: ContactRecord | null; recordActivity?: boolean; templatePurpose?: WhatsAppTemplatePurpose; proposalLabel?: string; initialChannel?: SalesMessageChannel; stageName: string; open: boolean; onClose(): void }) {
  const { preferences } = usePreferences()
  const { notify } = useAppUi()
  const { currentWorkspace } = useAppWorkspace()
  const { createActivity } = useAppActions()
  const [channel, setChannel] = useState<SalesMessageChannel>('whatsapp')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [objective, setObjective] = useState('')
  const [copied, setCopied] = useState(false)
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [templateId, setTemplateId] = useState('')
  const [sending, setSending] = useState(false)
  const [emailMode, setEmailMode] = useState<'assisted' | 'official'>('assisted')
  const [emailAccounts, setEmailAccounts] = useState<ConnectedAccount[]>([])
  const [emailAccountId, setEmailAccountId] = useState('')

  useEffect(() => {
    if (!open) return
    setChannel(initialChannel ?? (preferences.integrations.assistedWhatsapp ? 'whatsapp' : preferences.integrations.assistedEmail ? 'email' : 'call'))
  }, [initialChannel, open, preferences.integrations.assistedEmail, preferences.integrations.assistedWhatsapp])


  useEffect(() => {
    if (!open || !currentWorkspace?.id) return
    let cancelled = false
    void loadCommunicationChannelState(currentWorkspace.id).then((state) => {
      if (cancelled) return
      setEmailAccounts(state.emailAccounts)
      setEmailAccountId((current) => current && state.emailAccounts.some((item) => item.id === current) ? current : state.emailAccounts[0]?.id ?? '')
      if (!state.emailAccounts.length) setEmailMode('assisted')
    }).catch(() => { if (!cancelled) { setEmailAccounts([]); setEmailAccountId(''); setEmailMode('assisted') } })
    return () => { cancelled = true }
  }, [currentWorkspace?.id, open])

  const targetName = contact?.name || lead?.name || ''
  const targetPhone = contact?.phone || lead?.phone || ''
  const targetEmail = contact?.email || lead?.email || ''
  const templateOwner = preferences.integrations.whatsappUseLeadOwnerName ? (lead?.ownerName || 'equipe RealTalent') : 'equipe RealTalent'

  useEffect(() => {
    if (!open || !lead) return
    const loaded = loadWhatsAppTemplates(currentWorkspace?.id ?? 'default')
    setTemplates(loaded)
    const purpose: WhatsAppTemplatePurpose = templatePurpose ?? (/proposta|proposal|orçamento|quote/i.test(stageName) ? 'proposal' : /reuni|meeting|agenda/i.test(stageName) ? 'meeting' : /follow|retomar|cadência/i.test(stageName) ? 'followup' : 'first_contact')
    const preferred = pickWhatsAppTemplate(loaded, purpose)
    setTemplateId(preferred?.id ?? '')
    const suggestion = suggestSalesMessage(lead, stageName, channel)
    if (channel === 'whatsapp' && preferred) setBody(renderWhatsAppTemplate(preferred.body, templateContextFromLead(lead, { name: targetName, owner: templateOwner, stage: stageName, proposal: proposalLabel })))
    else setBody(suggestion.body)
    setSubject(suggestion.subject); setObjective(suggestion.objective); setCopied(false)
  }, [channel, currentWorkspace?.id, lead, open, proposalLabel, stageName, targetName, templateOwner, templatePurpose])

  const copy = async () => {
    const content = channel === 'email' ? `${subject}\n\n${body}` : body
    const result = await copyTextToClipboard(content)
    setCopied(result.ok)
    if (!result.ok) notify('error', result.reason ?? 'Não foi possível copiar a mensagem.')
  }
  const openChannel = async () => {
    if (!lead || lead.doNotContact || contact?.doNotContact) return
    if (channel === 'whatsapp') {
      const phone = digits(targetPhone); if (!phone) return
      setSending(true)
      try {
        const selectedTemplate = templates.find((item) => item.id === templateId)
        const mode = preferences.integrations.whatsappMode
        if (mode === 'official') {
          const accounts = await connectedWhatsAppAccounts(currentWorkspace?.id ?? 'default')
          const account = accounts.find((item) => item.id === preferences.integrations.whatsappOfficialAccountId) ?? accounts[0]
          if (!account) throw new Error('Conecte uma conta WhatsApp Business oficial em Configurações → WhatsApp.')
          await sendOfficialWhatsApp({ workspaceId: currentWorkspace?.id ?? '', leadId: lead.id, accountId: account.id, recipient: normalizeWhatsAppPhone(phone, preferences.integrations.whatsappCountryCode), body })
          notify('success', 'Mensagem oficial colocada na fila do WhatsApp Business.')
        } else {
          const result = openAssistedWhatsApp(phone, body, preferences.integrations.whatsappCountryCode)
          if (!result.ok) throw new Error(result.reason ?? 'Não foi possível abrir o WhatsApp.')
        }
        if (recordActivity && preferences.integrations.whatsappRegisterActivity) await createActivity({ leadId: lead.id, contactId: contact?.id ?? null, type: 'whatsapp', title: mode === 'official' ? 'WhatsApp oficial enviado' : 'WhatsApp assistido aberto', description: whatsappActivityDescription(mode, body, selectedTemplate?.name), dueAt: null, completedAt: new Date().toISOString(), assignedTo: lead.ownerId })
      } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível concluir a ação no WhatsApp.') } finally { setSending(false) }
    } else if (channel === 'email') {
      if (!targetEmail) return
      setSending(true)
      try {
        if (emailMode === 'official') {
          const account = emailAccounts.find((item) => item.id === emailAccountId) ?? emailAccounts[0]
          if (!account) throw new Error('Conecte uma conta Google ou Microsoft com permissão de envio em Configurações → Integrações.')
          await sendOfficialEmail({ workspaceId: currentWorkspace?.id ?? '', leadId: lead.id, accountId: account.id, recipient: targetEmail, subject, body })
          notify('success', 'E-mail oficial colocado na fila de envio.')
        } else {
          window.location.href = `mailto:${targetEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
          if (recordActivity) await createActivity({ leadId: lead.id, contactId: contact?.id ?? null, type: 'email', title: 'E-mail assistido preparado', description: `Cliente de e-mail aberto pelo CRM.

Assunto: ${subject}

${body}`.slice(0, 4000), dueAt: null, completedAt: new Date().toISOString(), assignedTo: lead.ownerId })
        }
      } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível concluir a ação de e-mail.') } finally { setSending(false) }
    } else {
      const phone = digits(targetPhone); if (phone) window.location.href = `tel:${phone}`
    }
  }
  const leadBlockedMessage = lead ? contactBlockedMessage(lead, channel) : null
  const blockedMessage = contact?.doNotContact ? `${contact.name} está marcado como não contatar.` : leadBlockedMessage
  const unavailable = !lead || Boolean(blockedMessage) || (channel === 'email' ? !targetEmail : !targetPhone)

  return <Modal open={open} title="Contato assistido" subtitle={lead ? `${targetName}${contact ? ` · ${lead.company || lead.name}` : ''} · ${stageName}` : undefined} size="lg" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Fechar</Button><span className="modal__footer-spacer" /><Button variant="secondary" onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copiado' : 'Copiar'}</Button><Button loading={sending} disabled={unavailable || sending} onClick={() => void openChannel()}><Send size={16} /> {(channel === 'whatsapp' && preferences.integrations.whatsappMode === 'official') || (channel === 'email' && emailMode === 'official') ? 'Enviar oficial' : 'Abrir canal'}</Button></>}>
    <div className="sales-message-assistant">
      <div className="sales-message-assistant__tabs">
        <button type="button" disabled={!preferences.integrations.assistedWhatsapp} className={channel === 'whatsapp' ? 'is-active' : ''} onClick={() => setChannel('whatsapp')}><MessageCircle size={16} /> WhatsApp</button>
        <button type="button" disabled={!preferences.integrations.assistedEmail} className={channel === 'email' ? 'is-active' : ''} onClick={() => setChannel('email')}><Mail size={16} /> E-mail</button>
        <button type="button" className={channel === 'call' ? 'is-active' : ''} onClick={() => setChannel('call')}><PhoneCall size={16} /> Ligação</button>
      </div>
      <div className="seller-guidance"><strong>Objetivo desta abordagem</strong><span>{objective}</span></div>
      {channel === 'whatsapp' && templates.length ? <label className="field"><span>Template interno</span><NativeSelectionSelect value={templateId} onChange={(event) => { const id = event.target.value; setTemplateId(id); const template = templates.find((item) => item.id === id); if (template && lead) setBody(renderWhatsAppTemplate(template.body, templateContextFromLead(lead, { name: targetName, owner: templateOwner, stage: stageName, proposal: proposalLabel }))) }}>{templates.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelectionSelect></label> : null}
      {channel === 'email' ? <div className="form-grid form-grid--2"><label className="field"><span>Modo de e-mail</span><NativeSelectionSelect value={emailMode} onChange={(event) => setEmailMode(event.target.value as 'assisted' | 'official')}><option value="assisted">Assistido · abrir cliente de e-mail</option><option value="official" disabled={!emailAccounts.length}>Oficial · enviar pelo CRM{emailAccounts.length ? '' : ' (conecte uma conta)'}</option></NativeSelectionSelect></label>{emailMode === 'official' ? <label className="field"><span>Conta de envio</span><NativeSelectionSelect value={emailAccountId} onChange={(event) => setEmailAccountId(event.target.value)}>{emailAccounts.map((account) => <option key={account.id} value={account.id}>{connectedAccountLabel(account)}</option>)}</NativeSelectionSelect></label> : <div/>}</div> : null}
      {channel === 'email' ? <label className="field"><span>Assunto</span><input value={subject} onChange={(event) => setSubject(event.target.value)} /></label> : null}
      <label className="field"><span>{channel === 'call' ? 'Roteiro sugerido' : 'Mensagem sugerida'}</span><textarea rows={10} value={body} onChange={(event) => setBody(event.target.value)} /></label>
      {blockedMessage ? <small className="text-danger">{blockedMessage}</small> : unavailable ? <small className="text-danger">Preencha {channel === 'email' ? 'o e-mail' : 'o telefone'} do contato para abrir este canal.</small> : <small>{channel === 'whatsapp' && preferences.integrations.whatsappMode === 'official' ? 'O envio oficial usa a conta configurada e registra o evento no backend.' : channel === 'email' && emailMode === 'official' ? 'O e-mail será enfileirado pela conta Google/Microsoft selecionada e aparecerá no histórico oficial.' : 'Revise a sugestão antes de abrir o canal. O modo assistido registra a preparação, mas não confirma entrega ou leitura.'}</small>}
    </div>
  </Modal>
}
