import '../../styles/calls-voice-dialer-v10073.css'
import { PhoneIncoming, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppNavigation, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { readVoiceSettings, sendVoiceCommand, subscribeVoiceEvents, type VoiceCallRuntime, type VoiceEvent } from '../../services/voice-dialer'

const normalizePhone = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '')

export function VoiceInboundWatcher() {
  const { snapshot, currentWorkspace } = useAppWorkspace()
  const { navigate } = useAppNavigation()
  const workspaceId = currentWorkspace?.id ?? snapshot?.workspace.id ?? 'default'
  const [incoming, setIncoming] = useState<VoiceEvent | null>(null)
  const lead = useMemo(() => {
    if (!incoming || !snapshot) return null
    if (incoming.leadId) return snapshot.leads.find((item) => item.id === incoming.leadId) ?? null
    const phone = normalizePhone(incoming.phone)
    return snapshot.leads.find((item) => normalizePhone(item.phone) === phone) ?? snapshot.leads.find((item) => snapshot.contacts.some((contact) => contact.leadIds.includes(item.id) && normalizePhone(contact.phone) === phone)) ?? null
  }, [incoming, snapshot])

  useEffect(() => subscribeVoiceEvents((event) => {
    if (event.direction === 'inbound' && event.state === 'ringing') setIncoming(event)
    if (incoming?.callId === event.callId && ['ended', 'failed'].includes(event.state)) setIncoming(null)
  }), [incoming?.callId])

  if (!incoming) return null
  const answer = async () => {
    const settings = readVoiceSettings(workspaceId)
    const runtime: VoiceCallRuntime = { providerId: incoming.providerId, externalCallId: incoming.callId, state: incoming.state, direction: 'inbound', phone: incoming.phone, callerId: incoming.callerId, startedAt: incoming.occurredAt }
    try { await sendVoiceCommand(settings, runtime, 'answer'); navigate('calls'); setIncoming(null) } catch { navigate('calls') }
  }

  return <aside className="voice-inbound-v73" role="status" aria-live="assertive"><div className="voice-inbound-v73__icon"><PhoneIncoming size={21}/></div><div><span>Chamada recebida</span><strong>{lead?.name ?? (incoming.phone || 'Número não identificado')}</strong><small>{lead?.company ? `${lead.company} · ` : ''}{incoming.phone}</small></div><div className="voice-inbound-v73__actions"><Button size="sm" onClick={() => void answer()}>Abrir chamada</Button><button type="button" className="icon-button" aria-label="Dispensar aviso" onClick={() => setIncoming(null)}><X size={17}/></button></div></aside>
}
