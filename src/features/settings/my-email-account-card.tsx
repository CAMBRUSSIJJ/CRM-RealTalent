import { CheckCircle2, Mail, RefreshCw, ShieldCheck, TestTube2, Unplug } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { formatDateTime } from '../../domain/formatters'
import { disconnectMyEmailAccount, loadMyEmailAccount, startEmailConnection, testMyEmailAccount, type MyEmailAccount } from '../../services/email-account'

const statusLabel: Record<MyEmailAccount['status'], string> = { connected: 'Conectado', attention: 'Precisa de atenção', expired: 'Expirado', paused: 'Pausado', error: 'Com erro' }
const statusTone: Record<MyEmailAccount['status'], 'success' | 'warning' | 'danger' | 'neutral'> = { connected: 'success', attention: 'warning', expired: 'warning', paused: 'neutral', error: 'danger' }

// Caminho de cada vendedor para colocar o próprio Gmail no CRM. Não exige ser administrador.
export function MyEmailAccountCard() {
  const { currentWorkspace, repositoryMode, notify, confirmAction } = useApp()
  const [account, setAccount] = useState<MyEmailAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [notConfigured, setNotConfigured] = useState<string | null>(null)
  const isAdmin = currentWorkspace?.role === 'owner' || currentWorkspace?.role === 'admin'

  const refresh = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try { setAccount(await loadMyEmailAccount(currentWorkspace.id)) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível carregar sua conta de e-mail.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [currentWorkspace?.id])

  const connect = async () => {
    if (!currentWorkspace) return
    setBusy('connect'); setNotConfigured(null)
    try {
      const result = await startEmailConnection(currentWorkspace.id, 'google')
      if (result.kind === 'redirect') { window.location.assign(result.url); return }
      if (result.kind === 'not_configured') setNotConfigured(result.message)
      else notify('info', result.message)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível iniciar a conexão.') }
    finally { setBusy('') }
  }
  const test = async () => {
    if (!currentWorkspace || !account) return
    setBusy('test')
    try {
      const result = await testMyEmailAccount(currentWorkspace.id, account.id)
      notify(result.status === 'pass' ? 'success' : result.status === 'warn' ? 'info' : 'error', result.status === 'pass' ? 'Seu Gmail respondeu normalmente.' : result.message)
      await refresh()
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Teste indisponível.') }
    finally { setBusy('') }
  }
  const disconnect = async () => {
    if (!currentWorkspace || !account) return
    if (!await confirmAction({ title: 'Desconectar seu Gmail?', description: 'O CRM para de enviar e de ler e-mails por esta conta. Os e-mails já registrados nos contatos continuam no histórico.', confirmLabel: 'Desconectar', tone: 'danger' })) return
    setBusy('disconnect')
    try { await disconnectMyEmailAccount(currentWorkspace.id, account.id); notify('success', 'Gmail desconectado.'); await refresh() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível desconectar.') }
    finally { setBusy('') }
  }

  const hosted = repositoryMode === 'supabase'
  return <article className="panel my-email-card">
    <div className="panel__heading">
      <div><span className="eyebrow"><Mail size={15} /> Seu e-mail</span><h3>{account ? account.email : 'Conecte seu Gmail ao CRM'}</h3></div>
      {account ? <StatusPill tone={statusTone[account.status]}>{statusLabel[account.status]}</StatusPill> : null}
    </div>
    {!account ? <>
      <p className="my-email-card__lead">Envie e-mails para seus contatos sem sair do CRM. Cada vendedor conecta a própria conta.</p>
      <ul className="my-email-card__facts">
        <li><CheckCircle2 size={15} /><span>Os e-mails saem do seu endereço, como se você enviasse pelo Gmail.</span></li>
        <li><CheckCircle2 size={15} /><span>O CRM só registra conversas com contatos que já estão no CRM. O resto da sua caixa fica de fora.</span></li>
        <li><ShieldCheck size={15} /><span>Você pode desconectar quando quiser, aqui ou em myaccount.google.com/permissions.</span></li>
      </ul>
    </> : <div className="my-email-card__details">
      <div><span>Enviar e-mails</span><strong>{account.canSend ? 'Permitido' : 'Não autorizado'}</strong></div>
      <div><span>Registrar respostas</span><strong>{account.canRead ? 'Permitido' : 'Não autorizado'}</strong></div>
      <div><span>Última leitura</span><strong>{account.lastSyncAt ? formatDateTime(account.lastSyncAt) : 'Aguardando a primeira leitura'}</strong></div>
    </div>}
    {account?.lastError && account.status !== 'connected' ? <div className="warning-box"><strong>O que aconteceu</strong><span>{account.lastError}</span></div> : null}
    {account && (!account.canSend || !account.canRead) ? <div className="warning-box"><strong>Permissões incompletas</strong><span>Você desmarcou alguma opção na tela do Google. Conecte de novo e marque ler e enviar e-mails.</span></div> : null}
    {notConfigured ? <div className="warning-box"><strong>{isAdmin ? 'Falta configurar o app do Google' : 'Ainda não disponível'}</strong><span>{isAdmin ? 'Antes de alguém conectar o Gmail, crie o app OAuth no Google Cloud e cadastre as chaves no Supabase. O passo a passo está em docs/integracoes/gmail.md.' : 'O administrador do CRM ainda precisa liberar a conexão com o Gmail. Avise a pessoa responsável.'}</span></div> : null}
    {!hosted ? <div className="warning-box"><strong>Modo demonstração</strong><span>A conexão com o Gmail só funciona no CRM hospedado.</span></div> : null}
    <div className="settings-actions">
      {!account || account.status !== 'connected' || !account.canSend || !account.canRead
        ? <Button loading={busy === 'connect'} disabled={loading || !hosted} onClick={() => void connect()}><Mail size={15} /> {account ? 'Conectar de novo' : 'Conectar Gmail'}</Button>
        : null}
      {account ? <Button variant="secondary" size="sm" loading={busy === 'test'} onClick={() => void test()}><TestTube2 size={15} /> Testar</Button> : null}
      {account ? <Button variant="ghost" size="sm" loading={busy === 'disconnect'} onClick={() => void disconnect()}><Unplug size={15} /> Desconectar</Button> : null}
      <Button variant="ghost" size="sm" loading={loading} onClick={() => void refresh()} aria-label="Atualizar"><RefreshCw size={15} /></Button>
    </div>
  </article>
}
