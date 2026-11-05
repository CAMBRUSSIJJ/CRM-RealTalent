import { useEffect, useState } from 'react'
import { CheckCircle2, LoaderCircle, MessageCircle, WifiOff } from 'lucide-react'
import { useAppNavigation, useAppWorkspace } from '../../app/app-context'
import { getSupabaseClient } from '../../lib/supabase'
import { loadCommunicationsGatewayHealth, loadGatewayWhatsAppQrStatus } from '../../services/local-communications-gateway'

type ConnectionState = 'checking' | 'connected' | 'disconnected' | 'unavailable'
const bridgeMode = import.meta.env.VITE_WHATSAPP_CONNECTION_MODE === 'bridge'

/**
 * Passive, workspace-scoped status. Never starts a connection or launches an
 * external process automatically. This is safe on the hosted CRM and shows a
 * direct path to its existing WhatsApp setup screen.
 */
export function WhatsAppQuickAccess() {
  const { currentWorkspace, repositoryMode } = useAppWorkspace()
  const { navigate } = useAppNavigation()
  const workspaceId = currentWorkspace?.id
  const [state, setState] = useState<ConnectionState>('checking')

  useEffect(() => {
    if (!workspaceId) { setState('checking'); return }
    let active = true
    let inFlight = false
    setState('checking')

    const refresh = async () => {
      if (!active || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      try {
        let next: ConnectionState
        if (bridgeMode && repositoryMode === 'supabase') {
          const client = getSupabaseClient()
          if (!client) throw new Error('Supabase não configurado')
          const { data, error } = await client.functions.invoke('whatsapp-session', {
            body: { organizationId: workspaceId, action: 'status' },
          })
          if (error || !data || data.error) throw new Error('Conector não respondeu')
          next = data.state === 'open' ? 'connected' : data.state === 'offline' ? 'unavailable' : 'disconnected'
        } else {
          const health = await loadCommunicationsGatewayHealth()
          if (!health.ok) throw new Error('Gateway indisponível')
          const status = await loadGatewayWhatsAppQrStatus(workspaceId)
          next = status.state === 'connected' ? 'connected' : 'disconnected'
        }
        if (active) setState(next)
      } catch {
        if (active) setState('unavailable')
      } finally {
        inFlight = false
      }
    }

    void refresh()
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    const timer = window.setInterval(() => { void refresh() }, 45_000)
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [workspaceId, repositoryMode])

  if (!workspaceId) return null

  const connected = state === 'connected'
  const label = state === 'checking' ? 'WhatsApp: verificando'
    : connected ? 'WhatsApp conectado'
    : state === 'unavailable' ? 'WhatsApp indisponível'
    : 'Conectar WhatsApp'
  const detail = connected
    ? bridgeMode ? 'Ver a conexão e os avisos de tarefas' : 'Abrir conversas do WhatsApp'
    : state === 'unavailable'
      ? 'Ver diagnóstico ou iniciar o conector no computador'
      : 'Abrir QR Code nas configurações'
  const Icon = state === 'checking' ? LoaderCircle : connected ? CheckCircle2
    : state === 'unavailable' ? WifiOff : MessageCircle

  return <button
    type="button"
    className="rt-whatsapp-quick-access"
    aria-label={`${label}. ${detail}`}
    title={detail}
    onClick={() => connected && !bridgeMode
      ? navigate('communications')
      : navigate('settings', { filter: 'whatsapp' })}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      minHeight: 34, padding: '5px 10px', border: '1px solid var(--border, #d5deea)',
      borderRadius: 9, background: 'transparent', color: 'inherit',
      cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap', maxWidth: 210,
    }}
  >
    <Icon size={16} aria-hidden="true" color={connected ? '#198754' : undefined} />
    <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
  </button>
}
