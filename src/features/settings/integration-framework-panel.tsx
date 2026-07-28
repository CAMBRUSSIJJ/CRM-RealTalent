import { AlertTriangle, CheckCircle2, Clock3, CloudCog, ExternalLink, KeyRound, Laptop, Link2, Pause, Play, Puzzle, RefreshCw, RotateCw, ShieldCheck, Unplug } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { formatDateTime } from '../../domain/formatters'
import { ExtensionCenterPanel } from './extension-center-panel'
import {
  beginOAuthConnection, enqueueIntegrationSync, loadIntegrationFramework, providerLabel, retryIntegrationJob,
  updateConnectedAccount, updateConnectDevice, type ConnectedAccountStatus, type IntegrationFrameworkState, type OAuthProvider, type SyncJobStatus,
} from '../../services/integration-framework'

const providers: Array<{ provider: OAuthProvider; description: string; use: string }> = [
  { provider: 'google', description: 'Google Calendar e Gmail oficiais.', use: 'OAuth, push e sincronização incremental' },
  { provider: 'microsoft', description: 'Outlook Mail e Calendar pelo Microsoft Graph.', use: 'OAuth, webhooks e renovação de token' },
  { provider: 'meta', description: 'Facebook, Instagram e Lead Ads.', use: 'OAuth, webhooks e filas' },
  { provider: 'whatsapp_cloud', description: 'WhatsApp Business Platform oficial.', use: 'Mensagens, status de entrega e webhooks' },
]
const statusTone: Record<ConnectedAccountStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  connected: 'success', attention: 'warning', expired: 'warning', paused: 'neutral', revoked: 'neutral', error: 'danger',
}
const statusLabel: Record<ConnectedAccountStatus, string> = {
  connected: 'Conectada', attention: 'Atenção', expired: 'Expirada', paused: 'Pausada', revoked: 'Revogada', error: 'Erro',
}
const jobTone: Record<SyncJobStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  queued: 'info', processing: 'info', retry: 'warning', succeeded: 'success', failed: 'danger', dead_letter: 'danger', cancelled: 'neutral',
}
const jobLabel: Record<SyncJobStatus, string> = {
  queued: 'Na fila', processing: 'Processando', retry: 'Nova tentativa', succeeded: 'Concluída', failed: 'Falhou', dead_letter: 'Revisão manual', cancelled: 'Cancelada',
}

type Tab = 'overview' | 'accounts' | 'devices' | 'extensions' | 'queue' | 'logs' | 'security'

export function IntegrationFrameworkPanel() {
  const { currentWorkspace, repositoryMode, notify } = useApp()
  const [state, setState] = useState<IntegrationFrameworkState>({ accounts: [], jobs: [], attempts: [], devices: [], extensions: [], extensionSettings: [], extensionJobs: [], extensionEvents: [] })
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const canManage = currentWorkspace?.role === 'owner' || currentWorkspace?.role === 'admin'

  const refresh = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try { setState(await loadIntegrationFramework(currentWorkspace.id)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [currentWorkspace?.id])

  const metrics = useMemo(() => ({
    active: state.accounts.filter((item) => item.status === 'connected').length,
    attention: state.accounts.filter((item) => ['attention', 'expired', 'error'].includes(item.status)).length,
    pending: state.jobs.filter((item) => ['queued', 'processing', 'retry'].includes(item.status)).length,
    dead: state.jobs.filter((item) => item.status === 'dead_letter' || item.status === 'failed').length,
    devices: state.devices.filter((item) => item.status === 'connected').length,
    extensions: state.extensions.filter((item) => item.status === 'connected').length,
  }), [state])

  const connect = async (provider: OAuthProvider) => {
    if (!currentWorkspace || !canManage) return notify('info', 'Somente administradores podem conectar contas.')
    setBusy(`connect-${provider}`)
    try {
      const result = await beginOAuthConnection(currentWorkspace.id, provider)
      if (result.url) window.location.assign(result.url)
      else { notify('success', result.message); await refresh() }
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível iniciar a conexão.') }
    finally { setBusy('') }
  }
  const sync = async (accountId: string) => {
    if (!currentWorkspace) return
    const account = state.accounts.find((item) => item.id === accountId)
    if (!account) return
    setBusy(`sync-${accountId}`)
    try { await enqueueIntegrationSync(currentWorkspace.id, account); notify('success', 'Sincronização adicionada à fila.'); await refresh() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível sincronizar.') }
    finally { setBusy('') }
  }
  const accountAction = async (accountId: string, action: 'pause' | 'resume' | 'disconnect') => {
    if (!currentWorkspace || !canManage) return
    if (action === 'disconnect' && !confirm('Desconectar esta conta? Os logs serão preservados.')) return
    setBusy(`${action}-${accountId}`)
    try { await updateConnectedAccount(currentWorkspace.id, accountId, action); await refresh(); notify('success', action === 'pause' ? 'Conta pausada.' : action === 'resume' ? 'Conta reativada.' : 'Conta desconectada.') }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível atualizar a conta.') }
    finally { setBusy('') }
  }
  const deviceAction = async (deviceId: string, action: 'pause' | 'resume' | 'revoke') => {
    if (!currentWorkspace || !canManage) return
    if (action === 'revoke' && !confirm('Revogar este dispositivo? Ele precisará ser liberado novamente por um administrador.')) return
    setBusy(`device-${action}-${deviceId}`)
    try {
      await updateConnectDevice(currentWorkspace.id, deviceId, action)
      await refresh()
      notify('success', action === 'pause' ? 'Dispositivo pausado.' : action === 'resume' ? 'Dispositivo reativado.' : 'Dispositivo revogado.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível atualizar o dispositivo.') }
    finally { setBusy('') }
  }

  const retry = async (jobId: string) => {
    if (!currentWorkspace || !canManage) return
    setBusy(`retry-${jobId}`)
    try { await retryIntegrationJob(currentWorkspace.id, jobId); await refresh(); notify('success', 'Nova tentativa agendada.') }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível reagendar.') }
    finally { setBusy('') }
  }

  return <section className="integration-framework" aria-busy={loading}>
    <article className="panel integration-framework__hero">
      <div><span className="eyebrow"><CloudCog size={15} /> V100.42 · Comunicações oficiais</span><h3>Contas oficiais e comunicação auditável</h3><p>Google Calendar, Gmail, Outlook e WhatsApp usam OAuth, filas, webhooks e logs isolados por organização.</p></div>
      <div className="integration-framework__metrics"><span><strong>{metrics.active}</strong> contas</span><span><strong>{metrics.devices}</strong> Connect</span><span><strong>{metrics.extensions}</strong> extensões</span><span><strong>{metrics.pending}</strong> na fila</span><span className={metrics.attention || metrics.dead ? 'has-attention' : ''}><strong>{metrics.attention + metrics.dead}</strong> atenção</span><Button size="sm" variant="secondary" loading={loading} onClick={() => void refresh()}><RefreshCw size={15} /> Atualizar</Button></div>
    </article>

    <nav className="integration-framework__tabs" aria-label="Áreas do framework">
      {([['overview','Visão geral'],['accounts','Contas conectadas'],['devices','RealTalent Connect'],['extensions','Extensões'],['queue','Fila'],['logs','Logs'],['security','Segurança']] as Array<[Tab,string]>).map(([key,label]) => <button type="button" key={key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>{label}</button>)}
    </nav>

    {tab === 'overview' ? <div className="integration-framework__catalog">
      {providers.map((item) => {
        const connected = state.accounts.filter((account) => account.provider === item.provider && account.status !== 'revoked')
        return <article className="panel integration-catalog-card" key={item.provider}>
          <div className="integration-catalog-card__top"><span className="integration-catalog-card__icon"><Link2 size={20} /></span><StatusPill tone={connected.some((account) => account.status === 'connected') ? 'success' : connected.length ? 'warning' : 'neutral'}>{connected.length ? `${connected.length} conta(s)` : 'Não conectado'}</StatusPill></div>
          <h4>{providerLabel(item.provider)}</h4><p>{item.description}</p><small>{item.use}</small>
          <Button size="sm" variant={connected.length ? 'secondary' : 'primary'} disabled={!canManage} loading={busy === `connect-${item.provider}`} onClick={() => void connect(item.provider)}>{connected.length ? <RotateCw size={15} /> : <ExternalLink size={15} />} {connected.length ? 'Conectar outra' : 'Conectar'}</Button>
        </article>
      })}
    </div> : null}

    {tab === 'accounts' ? <article className="panel integration-framework__table-card">
      <div className="panel__heading"><div><span className="eyebrow">Contas</span><h3>Conexões da organização</h3></div><ShieldCheck size={21} /></div>
      {state.accounts.length ? <div className="integration-account-list">{state.accounts.map((account) => <div className="integration-account-row" key={account.id}>
        <div><strong>{account.displayName}</strong><small>{providerLabel(account.provider)} · {account.scopes.length} permissão(ões)</small></div>
        <StatusPill tone={statusTone[account.status]}>{statusLabel[account.status]}</StatusPill>
        <div><small>Última sincronização</small><strong>{formatDateTime(account.lastSyncAt)}</strong></div>
        <div><small>Token</small><strong>{account.hasCredential ? (account.tokenExpiresAt ? `expira ${formatDateTime(account.tokenExpiresAt)}` : 'protegido') : repositoryMode === 'local' ? 'não utilizado' : 'ausente'}</strong></div>
        <div className="integration-row-actions"><Button size="sm" variant="secondary" disabled={account.status !== 'connected'} loading={busy === `sync-${account.id}`} onClick={() => void sync(account.id)}><RefreshCw size={14} /> Sincronizar</Button>{account.status === 'paused' ? <Button size="sm" variant="ghost" disabled={!canManage} onClick={() => void accountAction(account.id, 'resume')}><Play size={14} /> Retomar</Button> : <Button size="sm" variant="ghost" disabled={!canManage || account.status === 'revoked'} onClick={() => void accountAction(account.id, 'pause')}><Pause size={14} /> Pausar</Button>}<Button size="sm" variant="ghost" disabled={!canManage || account.status === 'revoked'} onClick={() => void accountAction(account.id, 'disconnect')}><Unplug size={14} /> Desconectar</Button></div>
        {account.lastError ? <p className="integration-row-error"><AlertTriangle size={14} /> {account.lastError}</p> : null}
      </div>)}</div> : <div className="integration-framework__empty"><KeyRound size={22} /><div><strong>Nenhuma conta conectada</strong><p>Use a Visão geral para iniciar um fluxo OAuth. No modo local, a conexão é apenas demonstrativa.</p></div></div>}
    </article> : null}

    {tab === 'devices' ? <article className="panel integration-framework__table-card">
      <div className="panel__heading"><div><span className="eyebrow">Aplicativo de ligações</span><h3>Dispositivos RealTalent Connect</h3></div><Laptop size={21} /></div>
      {state.devices.length ? <div className="integration-account-list">{state.devices.map((device) => <div className="integration-account-row" key={device.id}>
        <div><strong>{device.deviceName}</strong><small>{device.platform} · versão {device.appVersion}</small></div>
        <StatusPill tone={device.status === 'connected' ? 'success' : device.status === 'error' ? 'danger' : 'warning'}>{device.status === 'connected' ? 'Conectado' : device.status === 'error' ? 'Erro' : device.status === 'paused' ? 'Pausado' : 'Revogado'}</StatusPill>
        <div><small>Último sinal</small><strong>{formatDateTime(device.lastSeenAt)}</strong></div>
        <div><small>Última sincronização</small><strong>{formatDateTime(device.lastSyncAt)}</strong></div>
        <div><small>Fila local</small><strong>{device.pendingItems} pendente(s)</strong></div>
        <div className="integration-row-actions">{device.status === 'paused' ? <Button size="sm" variant="ghost" disabled={!canManage} loading={busy === `device-resume-${device.id}`} onClick={() => void deviceAction(device.id, 'resume')}><Play size={14} /> Retomar</Button> : <Button size="sm" variant="ghost" disabled={!canManage || device.status === 'revoked'} loading={busy === `device-pause-${device.id}`} onClick={() => void deviceAction(device.id, 'pause')}><Pause size={14} /> Pausar</Button>}<Button size="sm" variant="ghost" disabled={!canManage || device.status === 'revoked'} loading={busy === `device-revoke-${device.id}`} onClick={() => void deviceAction(device.id, 'revoke')}><Unplug size={14} /> Revogar</Button></div>
        {device.lastError ? <p className="integration-row-error"><AlertTriangle size={14} /> {device.lastError}</p> : null}
      </div>)}</div> : <div className="integration-framework__empty"><Laptop size={22} /><div><strong>Nenhum dispositivo vinculado</strong><p>Entre no RealTalent Connect Desktop v1.6 com a mesma conta do CRM. O computador será registrado automaticamente nesta organização.</p></div></div>}
    </article> : null}

    {tab === 'extensions' ? <ExtensionCenterPanel state={state} loading={loading} canManage={canManage} onRefresh={refresh} /> : null}

    {tab === 'queue' ? <article className="panel integration-framework__table-card">
      <div className="panel__heading"><div><span className="eyebrow">Processamento</span><h3>Fila de sincronização</h3></div><Clock3 size={21} /></div>
      {state.jobs.length ? <div className="integration-job-list">{state.jobs.map((job) => <div className="integration-job-row" key={job.id}><div><strong>{providerLabel(job.provider)} · {job.jobType.replaceAll('_',' ')}</strong><small>{job.idempotencyKey}</small></div><StatusPill tone={jobTone[job.status]}>{jobLabel[job.status]}</StatusPill><span>{job.attempts}/{job.maxAttempts} tentativa(s)</span><time>{formatDateTime(job.availableAt)}</time>{['failed','dead_letter'].includes(job.status) ? <Button size="sm" variant="secondary" disabled={!canManage} loading={busy === `retry-${job.id}`} onClick={() => void retry(job.id)}><RotateCw size={14} /> Tentar novamente</Button> : <span />}{job.lastError ? <p>{job.lastError}</p> : null}</div>)}</div> : <div className="integration-framework__empty"><CheckCircle2 size={22} /><div><strong>Fila vazia</strong><p>Nenhuma sincronização está aguardando processamento.</p></div></div>}
    </article> : null}

    {tab === 'logs' ? <article className="panel integration-framework__table-card">
      <div className="panel__heading"><div><span className="eyebrow">Tentativas</span><h3>Logs técnicos de sincronização</h3></div><Clock3 size={21} /></div>
      {state.attempts.length ? <div className="integration-attempt-list">{state.attempts.map((attempt) => <div className="integration-attempt-row" key={attempt.id}><span><strong>Tentativa {attempt.attemptNumber}</strong><small>Job {attempt.jobId.slice(0,8)}</small></span><StatusPill tone={attempt.status === 'succeeded' ? 'success' : attempt.status === 'retry_scheduled' ? 'warning' : 'danger'}>{attempt.status === 'succeeded' ? 'Sucesso' : attempt.status === 'retry_scheduled' ? 'Reagendada' : 'Falhou'}</StatusPill><span>{attempt.responseCode ?? '—'}</span><span>{attempt.durationMs ? `${attempt.durationMs} ms` : '—'}</span><time>{formatDateTime(attempt.createdAt)}</time>{attempt.errorMessage ? <p>{attempt.errorMessage}</p> : null}</div>)}</div> : <div className="integration-framework__empty"><CheckCircle2 size={22} /><div><strong>Nenhuma tentativa registrada</strong><p>Os workers registrarão duração, resposta e falha de cada execução.</p></div></div>}
    </article> : null}

    {tab === 'security' ? <div className="integration-security-grid">
      <article className="panel"><ShieldCheck size={22} /><h4>Tokens protegidos</h4><p>O navegador recebe apenas status e validade. Tokens em texto puro ficam fora das tabelas acessíveis e são criptografados pelo backend.</p></article>
      <article className="panel"><KeyRound size={22} /><h4>OAuth com estado assinado</h4><p>A autorização usa state com expiração, valida organização e impede callback reaproveitado.</p></article>
      <article className="panel"><RefreshCw size={22} /><h4>Idempotência e tentativas</h4><p>Cada sincronização possui chave única, limite de tentativas e encaminhamento para revisão manual.</p></article>
      <article className="panel"><CloudCog size={22} /><h4>Isolamento por organização</h4><p>Contas, filas, tentativas e logs são protegidos por organization_id, RLS e validação no backend.</p></article>
      <article className="panel"><Puzzle size={22} /><h4>Extensões revogáveis</h4><p>Cada navegador recebe uma identidade própria, versão mínima e configuração remota, sem compartilhar credenciais administrativas.</p></article>
    </div> : null}
  </section>
}
