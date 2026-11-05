import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, Laptop, LoaderCircle, QrCode, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react'
import { useAppNavigation, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { getSupabaseClient } from '../../lib/supabase'

type BridgeState = 'checking' | 'offline' | 'missing' | 'close' | 'connecting' | 'open' | 'error'
interface SessionResult {
  state?: BridgeState
  online?: boolean
  qr?: string | null
  expiresIn?: number
  message?: string | null
  error?: string
  verified?: boolean
  queued?: boolean
}
const messages: Record<string, string> = {
  local_bridge_not_enabled: 'O modo local ainda não foi ativado no Supabase.',
  local_bridge_migration_missing: 'O banco ainda não recebeu a migração do conector local.',
  local_connector_offline: 'Ligue o Linux e inicie o Docker do WhatsApp.',
  local_connector_command_failed: 'A solicitação não chegou ao computador. Consulte o Docker.',
  sign_in_required: 'Entre novamente no CRM.',
  invalid_session: 'Sua sessão expirou. Entre novamente.',
  workspace_access_denied: 'Você não tem acesso a este workspace.',
  admin_required: 'Somente administradores podem conectar ou desconectar o WhatsApp.',
  save_your_phone_and_consent_first: 'Salve seu número e autorize os avisos em Configurações → Notificações.',
  pair_whatsapp_before_verifying_phone: 'Conecte o WhatsApp pelo QR antes de verificar seu número.',
  team_phone_changed_confirm_again: 'Seu número mudou em Equipes. Confira-o nas Notificações.',
  verification_rate_limited: 'Limite de códigos atingido. Aguarde 90 segundos; são permitidos até 5 por dia.',
  invalid_or_expired_code: 'Código incorreto, não recebido ou expirado. Solicite outro.',
  phone_verification_unavailable: 'Serviço de verificação indisponível.',
}
const labelFor = (state: BridgeState) => ({
  checking: 'Verificando conector...', offline: 'Computador desconectado',
  missing: 'Ainda não configurado', close: 'WhatsApp desconectado',
  connecting: 'Aguardando leitura do QR', open: 'WhatsApp conectado', error: 'Erro no conector local',
}[state])

export function WhatsappLocalBridgePanel() {
  const { currentWorkspace, currentUserId } = useAppWorkspace()
  const { navigate } = useAppNavigation()
  const workspaceId = currentWorkspace?.id
  const [state, setState] = useState<BridgeState>('checking')
  const [qr, setQr] = useState<string | null>(null)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState('')
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState('')

  async function invoke(action: string, more: Record<string, unknown> = {}): Promise<SessionResult> {
    const client = getSupabaseClient()
    if (!client || !workspaceId) throw new Error('Configure o Supabase e selecione seu workspace.')
    const { data, error } = await client.functions.invoke('whatsapp-session', {
      body: { organizationId: workspaceId, action, ...more },
    })
    if (error || !data || data.error) {
      const key = String(data?.error || '')
      throw new Error(messages[key] || (error ? 'Não foi possível comunicar com o Supabase.' : key || 'Falha na conexão.'))
    }
    return data as SessionResult
  }

  async function refresh() {
    if (!workspaceId) return
    try {
      const next = await invoke('status')
      setState(next.state || 'offline')
      setQr(next.qr || null)
      setProblem(next.message || '')
    } catch (error) {
      setState('offline')
      setQr(null)
      setProblem(error instanceof Error ? error.message : 'Conector indisponível.')
    }
  }

  useEffect(() => {
    if (!workspaceId) return
    let active = true
    let running = false
    const poll = async () => {
      if (!active || running || document.visibilityState === 'hidden') return
      running = true
      try { await refresh() } finally { running = false }
    }
    setState('checking')
    void poll()
    const id = window.setInterval(() => { void poll() }, 4_000)
    const visible = () => { if (document.visibilityState === 'visible') void poll() }
    window.addEventListener('focus', visible)
    document.addEventListener('visibilitychange', visible)
    return () => {
      active = false
      window.clearInterval(id)
      window.removeEventListener('focus', visible)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [workspaceId])

  async function run(action: 'connect' | 'disconnect' | 'verify-start') {
    setBusy(action)
    setProblem('')
    setNotice('')
    try {
      await invoke(action)
      setNotice(action === 'connect'
        ? 'Solicitação enviada. O QR aparecerá aqui quando o computador preparar a sessão.'
        : action === 'disconnect'
          ? 'Desconexão solicitada ao computador.'
          : 'Código solicitado. Confira o WhatsApp do número cadastrado e informe-o abaixo.')
      await refresh()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Não foi possível concluir a solicitação.')
    } finally { setBusy('') }
  }

  async function confirmCode(event: FormEvent) {
    event.preventDefault()
    if (!/^[0-9]{6}$/.test(code)) { setProblem('Informe os seis dígitos recebidos.'); return }
    setBusy('verify-confirm')
    setProblem('')
    try {
      await invoke('verify-confirm', { code })
      setCode('')
      setNotice('Telefone confirmado. Com consentimento e regra de tarefa ativados, os avisos podem ser enviados.')
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Código inválido.')
    } finally { setBusy('') }
  }

  const connected = state === 'open'
  const online = !['offline', 'checking'].includes(state)
  return <article className="panel" aria-label="WhatsApp sem Railway">
    <div className="panel__heading">
      <div>
        <span className="eyebrow">Conector local · Supabase</span>
        <h3>WhatsApp do RealTalent</h3>
        <p>Conecte seu telefone uma vez. O CRM funciona na nuvem; o WhatsApp e os avisos são processados no Linux pelo Docker.</p>
      </div>
      <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 600 }}>
        {state === 'checking' ? <LoaderCircle size={17}/> : connected ? <CheckCircle2 size={17} color="#198754"/> :
          online ? <QrCode size={17}/> : <WifiOff size={17}/>}
        {labelFor(state)}
      </span>
    </div>
    {problem ? <div role="alert" className="settings-copy" style={{ padding: 12, borderRadius: 8 }}>{problem}</div> : null}
    {notice ? <p role="status" className="settings-copy">{notice}</p> : null}
    <div className="settings-actions" style={{ flexWrap: 'wrap', gap: 10 }}>
      <Button onClick={() => void run('connect')} disabled={!online || connected || Boolean(busy)} loading={busy === 'connect'}>
        <QrCode size={16}/> {connected ? 'WhatsApp conectado' : 'Gerar QR Code'}
      </Button>
      <Button variant="secondary" onClick={() => void refresh()} disabled={Boolean(busy)}><RefreshCw size={16}/> Atualizar</Button>
      {connected ? <Button variant="secondary" onClick={() => void run('disconnect')} disabled={Boolean(busy)}>
        Desconectar
      </Button> : null}
    </div>
    {qr && state !== 'open' ? <div style={{ padding: 18, display: 'inline-flex', flexDirection: 'column',
      alignItems: 'center', gap: 10, background: 'white', borderRadius: 12, marginTop: 14 }}>
      <img src={qr} width={264} height={264} alt="QR Code para vincular o WhatsApp ao RealTalent" style={{ maxWidth: '100%', objectFit: 'contain' }}/>
      <span style={{ color: '#25344a', fontSize: 13 }}>No celular: WhatsApp → Dispositivos conectados → Conectar dispositivo.</span>
    </div> : null}
    {!online ? <div className="settings-copy" style={{ marginTop: 14 }}>
      <Laptop size={16}/> Inicie o Docker no computador do conector. Nenhuma porta externa precisa ser aberta.
    </div> : null}

    <div style={{ marginTop: 24, borderTop: '1px solid var(--border, #d5deea)', paddingTop: 18 }}>
      <h4 style={{ margin: '0 0 6px' }}><ShieldCheck size={16}/> Notificações de tarefas</h4>
      <p className="settings-copy">
        Para receber avisos, cadastre seu WhatsApp em Notificações, autorize o envio e marque
        o canal WhatsApp nas regras da tarefa. Depois confirme o número com um código.
      </p>
      <div className="settings-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Button variant="secondary" onClick={() => navigate('settings', { filter: 'notifications' })}>
          Configurar meus avisos
        </Button>
        <Button variant="secondary" onClick={() => void run('verify-start')}
          disabled={!connected || !currentUserId || Boolean(busy)}
          loading={busy === 'verify-start'}>Enviar código de verificação</Button>
      </div>
      <form onSubmit={(event) => void confirmCode(event)} className="settings-actions"
        style={{ display: 'flex', gap: 8, alignItems: 'end', marginTop: 12 }}>
        <label className="field" style={{ maxWidth: 210 }}>
          <span>Código de 6 dígitos</span>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))}
            placeholder="000000"/>
        </label>
        <Button type="submit" disabled={!connected || code.length !== 6 || Boolean(busy)}
          loading={busy === 'verify-confirm'}>Confirmar número</Button>
      </form>
    </div>
    {workspaceId ? <p className="settings-copy" style={{ marginTop: 20 }}>
      Identificador do workspace para o conector Linux: <code>{workspaceId}</code>
    </p> : null}
  </article>
}
