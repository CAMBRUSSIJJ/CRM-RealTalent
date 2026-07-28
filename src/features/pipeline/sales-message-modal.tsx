import { Check, Copy, Mail, MessageCircle, PhoneCall, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { Lead } from '../../domain/types'
import { suggestSalesMessage, type SalesMessageChannel } from '../../services/sales-messages'
import { usePreferences } from '../settings/preferences-context'

const digits = (value: string) => value.replace(/\D/g, '')

export function SalesMessageModal({ lead, stageName, open, onClose }: { lead: Lead | null; stageName: string; open: boolean; onClose(): void }) {
  const { preferences } = usePreferences()
  const [channel, setChannel] = useState<SalesMessageChannel>('whatsapp')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [objective, setObjective] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    setChannel(preferences.integrations.assistedWhatsapp ? 'whatsapp' : preferences.integrations.assistedEmail ? 'email' : 'call')
  }, [open, preferences.integrations.assistedEmail, preferences.integrations.assistedWhatsapp])

  useEffect(() => {
    if (!open || !lead) return
    const suggestion = suggestSalesMessage(lead, stageName, channel)
    setSubject(suggestion.subject); setBody(suggestion.body); setObjective(suggestion.objective); setCopied(false)
  }, [channel, lead, open, stageName])

  const copy = async () => {
    const content = channel === 'email' ? `${subject}\n\n${body}` : body
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(content)
    else {
      const textarea = document.createElement('textarea'); textarea.value = content; textarea.style.position = 'fixed'; textarea.style.opacity = '0'
      document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove()
    }
    setCopied(true)
  }
  const openChannel = () => {
    if (!lead) return
    if (channel === 'whatsapp') {
      const phone = digits(lead.phone); if (!phone) return
      window.open(`https://wa.me/${phone.startsWith('55') ? phone : `55${phone}`}?text=${encodeURIComponent(body)}`, '_blank', 'noopener,noreferrer')
    } else if (channel === 'email') {
      if (!lead.email) return
      window.location.href = `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    } else {
      const phone = digits(lead.phone); if (phone) window.location.href = `tel:${phone}`
    }
  }
  const unavailable = !lead || (channel === 'email' ? !lead.email : !lead.phone)

  return <Modal open={open} title="Contato assistido" subtitle={lead ? `${lead.name} · ${stageName}` : undefined} size="lg" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Fechar</Button><span className="modal__footer-spacer" /><Button variant="secondary" onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copiado' : 'Copiar'}</Button><Button disabled={unavailable} onClick={openChannel}><Send size={16} /> Abrir canal</Button></>}>
    <div className="sales-message-assistant">
      <div className="sales-message-assistant__tabs">
        <button type="button" disabled={!preferences.integrations.assistedWhatsapp} className={channel === 'whatsapp' ? 'is-active' : ''} onClick={() => setChannel('whatsapp')}><MessageCircle size={16} /> WhatsApp</button>
        <button type="button" disabled={!preferences.integrations.assistedEmail} className={channel === 'email' ? 'is-active' : ''} onClick={() => setChannel('email')}><Mail size={16} /> E-mail</button>
        <button type="button" className={channel === 'call' ? 'is-active' : ''} onClick={() => setChannel('call')}><PhoneCall size={16} /> Ligação</button>
      </div>
      <div className="seller-guidance"><strong>Objetivo desta abordagem</strong><span>{objective}</span></div>
      {channel === 'email' ? <label className="field"><span>Assunto</span><input value={subject} onChange={(event) => setSubject(event.target.value)} /></label> : null}
      <label className="field"><span>{channel === 'call' ? 'Roteiro sugerido' : 'Mensagem sugerida'}</span><textarea rows={10} value={body} onChange={(event) => setBody(event.target.value)} /></label>
      {unavailable ? <small className="text-danger">Preencha {channel === 'email' ? 'o e-mail' : 'o telefone'} do lead para abrir este canal.</small> : <small>Revise a sugestão antes de enviar. O CRM não dispara mensagens automaticamente.</small>}
    </div>
  </Modal>
}
