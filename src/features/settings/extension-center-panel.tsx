import { Activity, AlertTriangle, CheckCircle2, Clock3, Monitor, Pause, Play, Puzzle, RefreshCw, RotateCw, Save, Settings2, ShieldCheck, Unplug } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { formatDateTime } from '../../domain/formatters'
import {
  defaultExtensionProductSettings, extensionIngestEndpoint, extensionProductLabel, retryExtensionCaptureJob, revokeExtensionToken, rotateExtensionToken, saveExtensionProductSettings,
  updateExtensionInstallation, type ExtensionCaptureJobStatus, type ExtensionInstallationStatus,
  type ExtensionProductSettings, type IntegrationFrameworkState,
} from '../../services/integration-framework'

interface ExtensionCenterPanelProps {
  state: IntegrationFrameworkState
  loading: boolean
  canManage: boolean
  onRefresh(): Promise<void>
}

type ExtensionTab = 'installations' | 'settings' | 'queue' | 'events'

const installationTone: Record<ExtensionInstallationStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  connected: 'success', paused: 'neutral', revoked: 'neutral', error: 'danger', outdated: 'warning',
}
const installationLabel: Record<ExtensionInstallationStatus, string> = {
  connected: 'Conectada', paused: 'Pausada', revoked: 'Revogada', error: 'Erro', outdated: 'Desatualizada',
}
const jobTone: Record<ExtensionCaptureJobStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  captured: 'info', queued: 'info', processing: 'info', review: 'warning', duplicate: 'warning', approved: 'success', sent: 'success',
  discarded: 'neutral', retry: 'warning', failed: 'danger', dead_letter: 'danger', cancelled: 'neutral',
}
const jobLabel: Record<ExtensionCaptureJobStatus, string> = {
  captured: 'Capturado', queued: 'Na fila', processing: 'Processando', review: 'Revisar', duplicate: 'Possível duplicado', approved: 'Aprovado',
  sent: 'Enviado', discarded: 'Descartado', retry: 'Nova tentativa', failed: 'Falhou', dead_letter: 'Revisão técnica', cancelled: 'Cancelado',
}
const sourceLabels: Record<string, string> = {
  google_maps: 'Google Maps', google_search: 'Pesquisa Google', instagram: 'Instagram', cnpj: 'CNPJ', extension: 'Extensão', unknown: 'Não informado',
}
const allSources = ['google_maps', 'google_search', 'instagram', 'cnpj']

export function ExtensionCenterPanel({ state, loading, canManage, onRefresh }: ExtensionCenterPanelProps) {
  const { currentWorkspace, repositoryMode, notify, confirmAction } = useApp()
  const [tab, setTab] = useState<ExtensionTab>('installations')
  const [busy, setBusy] = useState('')
  const [revealedToken, setRevealedToken] = useState('')
  const savedSettings = state.extensionSettings.find((item) => item.productKey === 'realtalent_capture')
  const [settings, setSettings] = useState<ExtensionProductSettings>(() => savedSettings ?? defaultExtensionProductSettings(currentWorkspace?.id ?? 'local'))

  useEffect(() => {
    setSettings(savedSettings ?? defaultExtensionProductSettings(currentWorkspace?.id ?? 'local'))
  }, [currentWorkspace?.id, savedSettings?.configVersion, savedSettings?.updatedAt])

  const metrics = useMemo(() => ({
    connected: state.extensions.filter((item) => item.status === 'connected').length,
    pending: state.extensionJobs.filter((item) => ['captured', 'queued', 'processing', 'retry'].includes(item.status)).reduce((total, item) => total + Math.max(1, item.itemCount), 0),
    review: state.extensionJobs.filter((item) => ['review', 'duplicate', 'failed', 'dead_letter'].includes(item.status)).length,
    today: state.extensions.reduce((total, item) => total + item.capturedToday, 0),
  }), [state.extensionJobs, state.extensions])

  const installationAction = async (installationId: string, action: 'pause' | 'resume' | 'revoke') => {
    if (!currentWorkspace || !canManage) return notify('info', 'Somente administradores podem controlar extensões.')
    if (action === 'revoke' && !await confirmAction({ title: 'Revogar instalação?', description: 'A extensão perderá a autorização atual e precisará ser autenticada novamente.', confirmLabel: 'Revogar instalação', tone: 'danger' })) return
    setBusy(`installation-${action}-${installationId}`)
    try {
      await updateExtensionInstallation(currentWorkspace.id, installationId, action)
      await onRefresh()
      notify('success', action === 'pause' ? 'Extensão pausada.' : action === 'resume' ? 'Extensão reativada.' : 'Extensão revogada.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível atualizar a extensão.') }
    finally { setBusy('') }
  }

  const retryJob = async (jobId: string) => {
    if (!currentWorkspace || !canManage) return
    setBusy(`retry-${jobId}`)
    try { await retryExtensionCaptureJob(currentWorkspace.id, jobId); await onRefresh(); notify('success', 'Nova tentativa agendada.') }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível reagendar a captura.') }
    finally { setBusy('') }
  }

  const saveSettings = async () => {
    if (!currentWorkspace || !canManage) return notify('info', 'Somente administradores podem alterar a configuração.')
    setBusy('save-settings')
    try {
      const saved = await saveExtensionProductSettings(currentWorkspace.id, { ...settings, workspaceId: currentWorkspace.id })
      setSettings(saved)
      await onRefresh()
      notify('success', 'Configuração remota da extensão salva.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar a configuração.') }
    finally { setBusy('') }
  }

  const rotateToken = async () => {
    if (!currentWorkspace || !canManage) return
    setBusy('rotate-token')
    try { setRevealedToken(await rotateExtensionToken(currentWorkspace.id)); notify('success', 'Novo token gerado. Copie agora; ele não será exibido novamente.') }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível rotacionar o token.') }
    finally { setBusy('') }
  }
  const revokeToken = async () => {
    if (!currentWorkspace || !canManage) return
    if (!await confirmAction({ title: 'Revogar token de ingestão?', description: 'A extensão deixará de enviar dados até que um novo token seja gerado e configurado.', confirmLabel: 'Revogar token', tone: 'danger' })) return
    setBusy('revoke-token')
    try { await revokeExtensionToken(currentWorkspace.id); setRevealedToken(''); notify('success', 'Token revogado.') }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível revogar o token.') }
    finally { setBusy('') }
  }

  const toggleSource = (source: string) => setSettings((current) => ({
    ...current,
    allowedSources: current.allowedSources.includes(source) ? current.allowedSources.filter((item) => item !== source) : [...current.allowedSources, source],
  }))

  return <section className="extension-center-v10040">
    <article className="panel extension-center-v10040__hero">
      <div><span className="eyebrow"><Puzzle size={15} /> Central de Extensões</span><h3>Instalações, capturas e configuração remota</h3><p>Administre versões, permissões, filas e resultados das extensões RealTalent sem expor chaves no navegador.</p></div>
      <div className="extension-center-v10040__metrics"><span><strong>{metrics.connected}</strong> conectadas</span><span><strong>{metrics.today}</strong> capturados hoje</span><span><strong>{metrics.pending}</strong> pendentes</span><span className={metrics.review ? 'has-attention' : ''}><strong>{metrics.review}</strong> atenção</span><Button size="sm" variant="secondary" loading={loading} onClick={() => void onRefresh()}><RefreshCw size={15} /> Atualizar</Button></div>
    </article>

    <nav className="extension-center-v10040__tabs" aria-label="Áreas da central de extensões">
      {([['installations','Instalações'],['settings','Configuração'],['queue','Fila de captura'],['events','Eventos']] as Array<[ExtensionTab,string]>).map(([key,label]) => <button type="button" key={key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>{label}</button>)}
    </nav>

    {tab === 'installations' ? <article className="panel integration-framework__table-card">
      <div className="panel__heading"><div><span className="eyebrow">Navegadores vinculados</span><h3>Extensões da organização</h3></div><Monitor size={21} /></div>
      {state.extensions.length ? <div className="integration-account-list">{state.extensions.map((installation) => <div className="integration-account-row extension-installation-row" key={installation.id}>
        <div><strong>{installation.displayName}</strong><small>{extensionProductLabel(installation.productKey)} · {installation.browser} {installation.browserVersion} · versão {installation.appVersion || 'não informada'}</small></div>
        <StatusPill tone={installationTone[installation.status]}>{installationLabel[installation.status]}</StatusPill>
        <div><small>Último sinal</small><strong>{formatDateTime(installation.lastSeenAt)}</strong></div>
        <div><small>Fila local</small><strong>{installation.pendingItems} pendente(s)</strong></div>
        <div><small>Capturas</small><strong>{installation.capturedToday} hoje · {installation.totalCaptured} total</strong></div>
        <div className="integration-row-actions">
          {installation.status === 'paused' ? <Button size="sm" variant="ghost" disabled={!canManage} loading={busy === `installation-resume-${installation.id}`} onClick={() => void installationAction(installation.id, 'resume')}><Play size={14} /> Retomar</Button> : <Button size="sm" variant="ghost" disabled={!canManage || ['revoked','outdated'].includes(installation.status)} loading={busy === `installation-pause-${installation.id}`} onClick={() => void installationAction(installation.id, 'pause')}><Pause size={14} /> Pausar</Button>}
          <Button size="sm" variant="ghost" disabled={!canManage || installation.status === 'revoked'} loading={busy === `installation-revoke-${installation.id}`} onClick={() => void installationAction(installation.id, 'revoke')}><Unplug size={14} /> Revogar</Button>
        </div>
        {installation.lastError ? <p className="integration-row-error"><AlertTriangle size={14} /> {installation.lastError}</p> : null}
      </div>)}</div> : <div className="integration-framework__empty"><Puzzle size={22} /><div><strong>Nenhuma extensão vinculada</strong><p>Instale a RealTalent Capture e entre com a mesma conta do CRM. A instalação aparecerá aqui após o primeiro registro ou teste de conexão.</p></div></div>}
    </article> : null}

    {tab === 'settings' ? <div className="extension-settings-grid">
      <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Política operacional</span><h3>RealTalent Capture</h3></div><Settings2 size={21} /></div>
        <div className="settings-form-grid settings-form-grid--3">
          <label className="settings-toggle"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))} /><span><strong>Integração ativa</strong><small>Bloqueia ou libera todos os envios desta extensão.</small></span></label>
          <label className="settings-toggle"><input type="checkbox" checked={settings.requireConfirmation} onChange={(event) => setSettings((current) => ({ ...current, requireConfirmation: event.target.checked }))} /><span><strong>Exigir revisão</strong><small>O vendedor confirma antes de enviar ao CRM.</small></span></label>
          <label className="settings-toggle"><input type="checkbox" checked={settings.closeTabAfterAnalysis} onChange={(event) => setSettings((current) => ({ ...current, closeTabAfterAnalysis: event.target.checked }))} /><span><strong>Fechar abas analisadas</strong><small>Reduz o consumo durante o processamento em massa.</small></span></label>
          <label className="field"><span>Destino padrão</span><select value={settings.destination} onChange={(event) => setSettings((current) => ({ ...current, destination: event.target.value as 'garimpo' | 'crm' }))}><option value="garimpo">Revisão no Garimpo</option><option value="crm">Direto para Leads</option></select></label>
          <label className="field"><span>Duplicidades</span><select value={settings.duplicatePolicy} onChange={(event) => setSettings((current) => ({ ...current, duplicatePolicy: event.target.value as 'skip' | 'update' | 'create' }))}><option value="skip">Ignorar duplicado</option><option value="update">Atualizar existente</option><option value="create">Criar mesmo assim</option></select></label>
          <label className="field"><span>Máximo por lote</span><input type="number" min="1" max="100" value={settings.maxBatchSize} onChange={(event) => setSettings((current) => ({ ...current, maxBatchSize: Math.max(1, Math.min(100, Number(event.target.value) || 1)) }))} /></label>
          <label className="field"><span>Intervalo entre páginas (ms)</span><input type="number" min="300" max="60000" step="100" value={settings.processIntervalMs} onChange={(event) => setSettings((current) => ({ ...current, processIntervalMs: Math.max(300, Math.min(60000, Number(event.target.value) || 1200)) }))} /></label>
          <label className="field"><span>Versão mínima</span><input value={settings.minimumVersion} placeholder="Ex.: 8.6.0" onChange={(event) => setSettings((current) => ({ ...current, minimumVersion: event.target.value }))} /></label>
          <label className="field"><span>Versão recomendada</span><input value={settings.recommendedVersion} placeholder="Ex.: 8.6.0" onChange={(event) => setSettings((current) => ({ ...current, recommendedVersion: event.target.value }))} /></label>
        </div>
        <div className="extension-source-options"><span>Fontes permitidas</span>{allSources.map((source) => <label className="form-check" key={source}><input className="form-check-input" type="checkbox" checked={settings.allowedSources.includes(source)} onChange={() => toggleSource(source)} /><span className="form-check-label">{sourceLabels[source]}</span></label>)}</div>
        <div className="settings-actions"><Button disabled={!canManage} loading={busy === 'save-settings'} onClick={() => void saveSettings()}><Save size={16} /> Salvar configuração</Button><StatusPill tone={repositoryMode === 'local' ? 'info' : 'success'}>{repositoryMode === 'local' ? 'Salvo neste navegador' : `Configuração ${settings.configVersion}`}</StatusPill></div>
      </article>
      <article className="panel extension-security-card"><ShieldCheck size={22} /><h4>Configuração remota segura</h4><p>A extensão recebe apenas regras operacionais. Tokens de serviço e credenciais administrativas não são enviados ao navegador.</p><ul><li>Identificação única da instalação</li><li>Bloqueio de versões antigas</li><li>Revogação por organização</li><li>Idempotência por lote</li></ul></article>
      <article className="panel extension-security-card"><ShieldCheck size={22} /><h4>Credencial de ingestão</h4><p>Endpoint: <code>{extensionIngestEndpoint() || 'Disponível após conectar o Supabase'}</code></p>{revealedToken ? <div className="warning-box"><strong>Copie o novo token agora</strong><code>{revealedToken}</code></div> : null}<div className="settings-actions"><Button size="sm" variant="secondary" disabled={!canManage || repositoryMode === 'local'} loading={busy === 'rotate-token'} onClick={() => void rotateToken()}><RotateCw size={14} /> Rotacionar token</Button><Button size="sm" variant="ghost" disabled={!canManage || repositoryMode === 'local'} loading={busy === 'revoke-token'} onClick={() => void revokeToken()}><Unplug size={14} /> Revogar token</Button></div></article>
    </div> : null}

    {tab === 'queue' ? <article className="panel integration-framework__table-card">
      <div className="panel__heading"><div><span className="eyebrow">Processamento</span><h3>Fila central de capturas</h3></div><Clock3 size={21} /></div>
      {state.extensionJobs.length ? <div className="extension-job-list">{state.extensionJobs.map((job) => <div className="extension-job-row" key={job.id}>
        <div><strong>{sourceLabels[job.source] ?? job.source} · {job.itemCount} item(ns)</strong><small>{extensionProductLabel(job.productKey)} · {job.idempotencyKey}</small></div>
        <StatusPill tone={jobTone[job.status]}>{jobLabel[job.status]}</StatusPill><span>{job.attempts}/{job.maxAttempts} tentativa(s)</span><time>{formatDateTime(job.createdAt)}</time>
        {['failed','dead_letter'].includes(job.status) ? <Button size="sm" variant="secondary" disabled={!canManage} loading={busy === `retry-${job.id}`} onClick={() => void retryJob(job.id)}><RotateCw size={14} /> Tentar novamente</Button> : <span />}
        {job.lastError ? <p><AlertTriangle size={14} /> {job.lastError}</p> : null}
      </div>)}</div> : <div className="integration-framework__empty"><CheckCircle2 size={22} /><div><strong>Fila vazia</strong><p>Nenhum lote da extensão está aguardando processamento.</p></div></div>}
    </article> : null}

    {tab === 'events' ? <article className="panel integration-framework__table-card">
      <div className="panel__heading"><div><span className="eyebrow">Auditoria</span><h3>Eventos das extensões</h3></div><Activity size={21} /></div>
      {state.extensionEvents.length ? <div className="extension-event-list">{state.extensionEvents.map((event) => <div className="extension-event-row" key={event.id}><div><strong>{event.eventType.replaceAll('_',' ')}</strong><small>{event.correlationId || 'Sem correlação'}</small></div><StatusPill tone={event.status === 'processed' ? 'success' : event.status === 'attention' ? 'warning' : event.status === 'failed' ? 'danger' : 'neutral'}>{event.status === 'processed' ? 'Processado' : event.status === 'attention' ? 'Atenção' : event.status === 'failed' ? 'Falhou' : 'Ignorado'}</StatusPill><time>{formatDateTime(event.createdAt)}</time></div>)}</div> : <div className="integration-framework__empty"><CheckCircle2 size={22} /><div><strong>Nenhum evento registrado</strong><p>Testes, sincronizações, pausas e revogações aparecerão aqui.</p></div></div>}
    </article> : null}
  </section>
}
