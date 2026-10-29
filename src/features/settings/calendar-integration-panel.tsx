import { NativeSelectionSelect } from '../../components/selection'
import {
  AlertTriangle, ArrowDownUp, CalendarCheck2, CalendarClock, CheckCircle2, Cloud, ExternalLink, Link2,
  RefreshCw, RotateCw, Settings2, ShieldCheck, TestTube2, Unplug, UploadCloud,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { formatDateTime } from '../../domain/formatters'
import {
  beginOAuthConnection,
  providerLabel,
  testConnectedAccount,
  type ConnectedAccount,
} from '../../services/integration-framework'
import {
  listProviderCalendars,
  loadCalendarIntegrationDashboard,
  queueCalendarBackfill,
  queueCalendarPull,
  queueCalendarSubscriptionRenewal,
  resolveCalendarSyncConflict,
  saveCalendarIntegrationSettings,
  setDefaultCalendarAccount,
  type CalendarAccountSyncStatus,
  type CalendarIntegrationDashboard,
  type CalendarSyncDirection,
  type ProviderCalendarOption,
} from '../../services/calendar-integration'

const emptyDashboard: CalendarIntegrationDashboard = { accounts: [], defaultAccountId: null, conflicts: [], hosted: false }
const directionLabel: Record<CalendarSyncDirection, string> = {
  two_way: 'Bidirecional', crm_to_provider: 'CRM → Agenda externa', provider_to_crm: 'Agenda externa → CRM',
}
const accountStatusTone = (status: ConnectedAccount['status']): 'success' | 'warning' | 'danger' | 'neutral' | 'info' => status === 'connected' ? 'success' : ['attention', 'expired'].includes(status) ? 'warning' : status === 'error' ? 'danger' : status === 'demo' ? 'info' : 'neutral'
const accountStatusLabel = (status: ConnectedAccount['status']) => ({ connected: 'Conectada', attention: 'Atenção', expired: 'Expirada', error: 'Erro', demo: 'Demonstração', paused: 'Pausada', revoked: 'Revogada' }[status])
const subscriptionLabel = (value: string) => value === 'active' ? 'Webhook ativo' : value === 'not_configured' ? 'Webhook não configurado' : value
const externalTitle = (snapshot: Record<string, unknown>) => String(snapshot.summary || snapshot.subject || 'Evento externo')
const localTitle = (snapshot: Record<string, unknown>) => String(snapshot.title || 'Evento no CRM')

import {hostedCalendarConnectionAvailable} from '../../lib/integration-availability-s34'

export function CalendarIntegrationPanel() {
  const { currentWorkspace, repositoryMode, can } = useAppWorkspace()
  const { notify } = useAppUi()
  const [dashboard, setDashboard] = useState<CalendarIntegrationDashboard>(emptyDashboard)
  const [selectedId, setSelectedId] = useState('')
  const [calendarOptions, setCalendarOptions] = useState<ProviderCalendarOption[]>([])
  const [calendarId, setCalendarId] = useState('')
  const [direction, setDirection] = useState<CalendarSyncDirection>('two_way')
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const canManage = can('manage', 'integration')

  const refresh = async () => {
    if (!currentWorkspace) return
    if (!hostedCalendarConnectionAvailable(repositoryMode)) {
      // In local/demo mode there are no hosted OAuth credentials. Avoid
      // issuing gateway requests which would only trigger proxy 502 errors.
      setDashboard(emptyDashboard)
      setSelectedId('')
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const next = await loadCalendarIntegrationDashboard(currentWorkspace.id)
      setDashboard(next)
      setSelectedId((current) => current && next.accounts.some((item) => item.account.id === current) ? current : next.defaultAccountId || next.accounts[0]?.account.id || '')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível carregar a integração de agenda.') }
    finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [currentWorkspace?.id, repositoryMode])
  const selected = useMemo(() => dashboard.accounts.find((item) => item.account.id === selectedId) ?? null, [dashboard.accounts, selectedId])
  useEffect(() => {
    if (!selected) return
    setCalendarId(selected.calendarId); setDirection(selected.direction); setEnabled(selected.enabled); setCalendarOptions([])
  }, [selected?.account.id, selected?.calendarId, selected?.direction, selected?.enabled])

  const connect = async (provider: 'google' | 'microsoft') => {
    if (!hostedCalendarConnectionAvailable(repositoryMode)) return notify('info', 'A conexão real exige o workspace hospedado com OAuth configurado. A Agenda interna continua disponível no modo local.')
    if (!currentWorkspace || !canManage) return notify('info', 'Somente administradores podem conectar contas externas.')
    setBusy(`connect-${provider}`)
    try {
      const result = await beginOAuthConnection(currentWorkspace.id, provider)
      if (result.url) window.location.assign(result.url)
      else { notify('info', result.message); await refresh() }
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível iniciar o OAuth.') }
    finally { setBusy('') }
  }

  const loadCalendars = async () => {
    if (!currentWorkspace || !selected) return
    setBusy('catalog')
    try {
      const options = await listProviderCalendars(currentWorkspace.id, selected.account.id)
      setCalendarOptions(options)
      const selectedOption = options.find((item) => item.selected) ?? options.find((item) => item.primary) ?? options[0]
      if (selectedOption && (!calendarId || calendarId === 'primary' || calendarId === 'default')) setCalendarId(selectedOption.id)
      notify('success', `${options.length} calendário(s) carregado(s) diretamente do provedor.`)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível listar os calendários.') }
    finally { setBusy('') }
  }

  const save = async () => {
    if (!currentWorkspace || !selected || !canManage) return
    const option = calendarOptions.find((item) => item.id === calendarId)
    setBusy('save')
    try {
      const calendarChanged = calendarId !== selected.calendarId
      await saveCalendarIntegrationSettings(currentWorkspace.id, selected.account.id, { calendarId, calendarName: option?.name || selected.calendarName, direction, enabled })
      if (calendarChanged && selected.account.status === 'connected') {
        await queueCalendarSubscriptionRenewal(currentWorkspace.id, selected.account)
        if (enabled && direction !== 'crm_to_provider') await queueCalendarPull(currentWorkspace.id, selected.account)
      }
      notify('success', calendarChanged ? 'Calendário alterado. Cursor reiniciado e renovação/sincronização adicionadas à fila.' : 'Configuração de sincronização atualizada.'); await refresh()
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar a configuração.') }
    finally { setBusy('') }
  }

  const setDefault = async (scope: 'personal' | 'organization') => {
    if (!currentWorkspace || !selected) return
    setBusy(`default-${scope}`)
    try { await setDefaultCalendarAccount(currentWorkspace.id, selected.account.id, scope); notify('success', scope === 'personal' ? 'Conta padrão definida para você.' : 'Conta padrão definida para o workspace.'); await refresh() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível definir a conta padrão.') }
    finally { setBusy('') }
  }

  const runPull = async () => {
    if (!currentWorkspace || !selected) return
    setBusy('pull')
    try { await queueCalendarPull(currentWorkspace.id, selected.account); notify('success', 'Leitura incremental adicionada à fila do provedor.'); await refresh() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível iniciar a sincronização.') }
    finally { setBusy('') }
  }

  const runBackfill = async () => {
    if (!currentWorkspace || !selected) return
    setBusy('backfill')
    try { const count = await queueCalendarBackfill(currentWorkspace.id, selected.account.id); notify('success', `${count} evento(s) local(is) ainda não vinculados foram adicionados à fila.`); await refresh() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível publicar a agenda local.') }
    finally { setBusy('') }
  }

  const renew = async () => {
    if (!currentWorkspace || !selected) return
    setBusy('renew')
    try { await queueCalendarSubscriptionRenewal(currentWorkspace.id, selected.account); notify('success', 'Renovação do webhook adicionada à fila.'); await refresh() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível renovar a assinatura.') }
    finally { setBusy('') }
  }

  const test = async () => {
    if (!currentWorkspace || !selected) return
    setBusy('test')
    try { const result = await testConnectedAccount(currentWorkspace.id, selected.account); notify(result.status === 'pass' ? 'success' : result.status === 'fail' ? 'error' : 'info', result.message); await refresh() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Teste indisponível.') }
    finally { setBusy('') }
  }

  const resolveConflict = async (id: string, resolution: 'keep_local' | 'keep_external' | 'ignore') => {
    setBusy(`conflict-${id}`)
    try { await resolveCalendarSyncConflict(id, resolution); notify('success', resolution === 'keep_local' ? 'Versão do CRM escolhida.' : resolution === 'keep_external' ? 'Versão externa escolhida.' : 'Conflito ignorado.'); await refresh() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível resolver o conflito.') }
    finally { setBusy('') }
  }

  const connected = dashboard.accounts.filter((item) => item.account.status === 'connected' && item.account.connectionMode === 'live')
  const totalLinks = dashboard.accounts.reduce((sum, item) => sum + item.linkedEvents, 0)
  const totalPending = dashboard.accounts.reduce((sum, item) => sum + item.pendingJobs, 0)
  const totalConflicts = dashboard.conflicts.filter((item) => item.status === 'open').length

  if (!hostedCalendarConnectionAvailable(repositoryMode)) return <section className="calendar-integration-v84 calendar-integration-s34 page-stack" aria-label="Configuração de agendas externas">
    <article className="panel calendar-integration-s34__hero">
      <div><span className="eyebrow">Agenda externa</span><h3>Conectar Google Agenda ou Microsoft Calendar</h3>
        <p>Configure uma conta hospedada para sincronizar compromissos. A Agenda interna do RealTalent continua funcionando neste computador.</p></div>
      <StatusPill tone="info">Modo local · sem sincronização externa</StatusPill>
    </article>
    <article className="panel calendar-integration-s34__connection">
      <div className="calendar-integration-s34__symbol"><Cloud size={23}/></div>
      <div><h3>Nenhuma conta externa conectada</h3>
        <p>Os provedores Google e Microsoft precisam de autenticação OAuth e de serviços de sincronização configurados no ambiente hospedado. Conectar a partir desta sessão local não habilita esses serviços.</p>
        <div className="calendar-integration-s34__providers"><span><CalendarCheck2 size={17}/> Google Agenda <small>Requer configuração hospedada</small></span><span><CalendarClock size={17}/> Microsoft Calendar <small>Requer configuração hospedada</small></span></div>
      </div>
    </article>
    <details className="panel calendar-integration-s34__steps"><summary>O que falta para ativar a sincronização?</summary>
      <ol><li>Acessar um workspace hospedado com Supabase e autenticação configurados.</li><li>Implantar e configurar os serviços OAuth e sincronização do Google ou Microsoft.</li><li>Conectar a conta e autorizar os calendários desejados.</li><li>Validar a conexão antes de ativar a sincronização bidirecional.</li></ol>
      <p>O modo de demonstração não executa sincronização, não importa eventos e não cria conexões fictícias.</p>
    </details>
  </section>

  return <section className="calendar-integration-v84 page-stack">
    <article className="panel calendar-integration-v84__hero">
      <div><span className="eyebrow"><CalendarCheck2 size={15} /> V100.84 · Calendar Integration 2.0</span><h3>Google Agenda e Microsoft Calendar dentro do fluxo do CRM</h3><p>Sincronização incremental e bidirecional para reuniões, ligações, follow-ups, retornos e tarefas criados na Agenda do RealTalent. Criação, alteração, cancelamento e conflitos usam vínculos externos idempotentes.</p></div>
      <div className="calendar-integration-v84__hero-actions"><StatusPill tone={connected.length ? 'success' : repositoryMode === 'supabase' ? 'warning' : 'info'}>{connected.length ? `${connected.length} conta(s) conectada(s)` : repositoryMode === 'supabase' ? 'Aguardando conexão' : 'Demonstração local'}</StatusPill><Button variant="secondary" loading={loading} onClick={() => void refresh()}><RefreshCw size={16} /> Atualizar</Button></div>
    </article>

    <div className="calendar-integration-v84__metrics">
      <article className="panel"><Link2 size={18} /><strong>{totalLinks}</strong><span>eventos vinculados</span></article>
      <article className="panel"><RotateCw size={18} /><strong>{totalPending}</strong><span>trabalhos pendentes</span></article>
      <article className={`panel ${totalConflicts ? 'is-warning' : ''}`}><AlertTriangle size={18} /><strong>{totalConflicts}</strong><span>conflitos abertos</span></article>
      <article className="panel"><ShieldCheck size={18} /><strong>{dashboard.hosted ? 'Real' : 'Demo'}</strong><span>modo da integração</span></article>
    </div>

    {repositoryMode === 'local' ? <div className="warning-box"><strong>Modo local</strong><span>Você pode revisar a interface, mas OAuth, leitura e escrita no Google/Microsoft só funcionam com Supabase e secrets implantados.</span></div> : null}

    <article className="panel calendar-integration-v84__connect">
      <div className="panel__heading"><div><span className="eyebrow">1 · Conexão segura</span><h3>Contas de calendário</h3><p>OAuth usa PKCE, token em cofre do backend e permissões oficiais do provedor.</p></div><Cloud size={22} /></div>
      <div className="calendar-integration-v84__provider-actions">
        <Button loading={busy === 'connect-google'} disabled={!canManage} onClick={() => void connect('google')}><CalendarCheck2 size={16} /> Conectar Google Agenda</Button>
        <Button variant="secondary" loading={busy === 'connect-microsoft'} disabled={!canManage} onClick={() => void connect('microsoft')}><CalendarClock size={16} /> Conectar Microsoft Calendar</Button>
      </div>
      {dashboard.accounts.length ? <div className="calendar-integration-v84__account-list">{dashboard.accounts.map((item) => <button type="button" key={item.account.id} className={selectedId === item.account.id ? 'is-active' : ''} onClick={() => setSelectedId(item.account.id)}><span className="calendar-integration-v84__provider-icon">{item.account.provider === 'google' ? 'G' : 'M'}</span><span><strong>{item.account.displayName}</strong><small>{providerLabel(item.account.provider)} · {item.calendarName}</small></span><StatusPill tone={accountStatusTone(item.account.status)}>{item.isDefault ? 'Padrão' : accountStatusLabel(item.account.status)}</StatusPill></button>)}</div> : <div className="calendar-integration-v84__empty"><Unplug size={22} /><strong>Nenhuma agenda conectada</strong><span>Conecte o Google primeiro para liberar sincronização real.</span></div>}
    </article>

    {selected ? <>
      <article className="panel calendar-integration-v84__settings">
        <div className="panel__heading"><div><span className="eyebrow">2 · Calendário e direção</span><h3>{selected.account.displayName}</h3><p>Escolha exatamente qual calendário será usado e em qual direção os eventos podem circular.</p></div><Settings2 size={22} /></div>
        <div className="settings-form-grid settings-form-grid--3">
          <label className="field"><span>Calendário externo</span>{calendarOptions.length ? <NativeSelectionSelect value={calendarId} onChange={(event) => setCalendarId(event.target.value)}>{calendarOptions.map((item) => <option key={item.id} value={item.id} disabled={!item.writable && direction !== 'provider_to_crm'}>{item.name}{item.primary ? ' · principal' : ''}{!item.writable ? ' · somente leitura' : ''}</option>)}</NativeSelectionSelect> : <input value={calendarId} onChange={(event) => setCalendarId(event.target.value)} placeholder={selected.account.provider === 'google' ? 'primary' : 'default'} />}</label>
          <label className="field"><span>Direção</span><NativeSelectionSelect value={direction} onChange={(event) => setDirection(event.target.value as CalendarSyncDirection)}>{(Object.keys(directionLabel) as CalendarSyncDirection[]).map((key) => <option key={key} value={key}>{directionLabel[key]}</option>)}</NativeSelectionSelect></label>
          <label className="settings-toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span><strong>Sincronização ativa</strong><small>Desativar pausa pull e push sem revogar a conta.</small></span></label>
        </div>
        <div className="settings-actions"><Button variant="secondary" loading={busy === 'catalog'} disabled={selected.account.status !== 'connected'} onClick={() => void loadCalendars()}><RefreshCw size={16} /> Carregar calendários</Button><Button loading={busy === 'save'} disabled={!canManage || !calendarId.trim()} onClick={() => void save()}>Salvar integração</Button><Button variant="ghost" loading={busy === 'default-personal'} disabled={selected.isDefault} onClick={() => void setDefault('personal')}>Usar como padrão para mim</Button>{canManage ? <Button variant="ghost" loading={busy === 'default-organization'} onClick={() => void setDefault('organization')}>Padrão do workspace</Button> : null}</div>
      </article>

      <article className="panel calendar-integration-v84__operations">
        <div className="panel__heading"><div><span className="eyebrow">3 · Sincronização e saúde</span><h3>Operação do conector</h3><p>A primeira leitura busca 90 dias anteriores e 365 dias futuros. Depois, Google Sync Token ou Microsoft Delta Link trazem apenas mudanças.</p></div><ArrowDownUp size={22} /></div>
        <div className="calendar-integration-v84__health-grid">
          <div><small>Última sincronização</small><strong>{selected.lastSuccessfulJobAt ? formatDateTime(selected.lastSuccessfulJobAt) : 'Ainda não concluída'}</strong></div>
          <div><small>Subscription</small><strong>{subscriptionLabel(selected.subscriptionStatus)}</strong><span>{selected.subscriptionExpirationAt ? `até ${formatDateTime(selected.subscriptionExpirationAt)}` : 'renovação automática quando configurada'}</span></div>
          <div><small>Eventos vinculados</small><strong>{selected.linkedEvents}</strong><span>deduplicados por conta + ID externo</span></div>
          <div><small>Fila / erros</small><strong>{selected.pendingJobs} / {selected.failedJobs}</strong><span>{selected.lastFailedJobAt ? `último erro ${formatDateTime(selected.lastFailedJobAt)}` : 'sem falha recente registrada'}</span></div>
        </div>
        <div className="calendar-integration-v84__operation-actions">
          <Button loading={busy === 'pull'} disabled={!selected.enabled || selected.direction === 'crm_to_provider' || selected.account.status !== 'connected'} onClick={() => void runPull()}><ArrowDownUp size={16} /> Receber alterações agora</Button>
          <Button variant="secondary" loading={busy === 'backfill'} disabled={!selected.enabled || selected.direction === 'provider_to_crm' || selected.account.status !== 'connected'} onClick={() => void runBackfill()}><UploadCloud size={16} /> Publicar agenda local</Button>
          <Button variant="secondary" loading={busy === 'renew'} disabled={selected.account.status !== 'connected'} onClick={() => void renew()}><RotateCw size={16} /> Renovar webhook</Button>
          <Button variant="secondary" loading={busy === 'test'} disabled={selected.account.status !== 'connected'} onClick={() => void test()}><TestTube2 size={16} /> Testar conexão</Button>
        </div>
        <div className="calendar-integration-v84__rules"><CheckCircle2 size={17} /><div><strong>O que sincroniza</strong><span>Todos os tipos da Agenda RealTalent — reunião, ligação, follow-up, retorno e tarefa. Atividades da fila de Follow-ups só entram no Google quando também são registradas como compromisso da Agenda.</span></div></div>
      </article>
    </> : null}

    <article className="panel calendar-integration-v84__conflicts">
      <div className="panel__heading"><div><span className="eyebrow">Conflitos</span><h3>CRM e provedor alterados ao mesmo tempo</h3><p>O sistema não sobrescreve silenciosamente quando detecta edição concorrente. Escolha a versão a manter.</p></div><AlertTriangle size={22} /></div>
      {dashboard.conflicts.filter((item) => item.status === 'open').length ? <div className="calendar-integration-v84__conflict-list">{dashboard.conflicts.filter((item) => item.status === 'open').map((conflict) => <article key={conflict.id}><header><span><strong>{conflict.provider === 'google' ? 'Google Agenda' : 'Microsoft Calendar'}</strong><small>{conflict.conflictType.replaceAll('_', ' ')}</small></span><StatusPill tone="warning">Revisão necessária</StatusPill></header><div className="calendar-integration-v84__compare"><div><small>CRM</small><strong>{localTitle(conflict.localSnapshot)}</strong></div><div><small>Externo</small><strong>{externalTitle(conflict.externalSnapshot)}</strong></div></div><footer><Button size="sm" loading={busy === `conflict-${conflict.id}`} onClick={() => void resolveConflict(conflict.id, 'keep_local')}>Manter CRM</Button><Button size="sm" variant="secondary" loading={busy === `conflict-${conflict.id}`} onClick={() => void resolveConflict(conflict.id, 'keep_external')}>Manter externo</Button><Button size="sm" variant="ghost" loading={busy === `conflict-${conflict.id}`} onClick={() => void resolveConflict(conflict.id, 'ignore')}>Ignorar</Button></footer></article>)}</div> : <div className="calendar-integration-v84__empty"><CheckCircle2 size={22} /><strong>Nenhum conflito aberto</strong><span>Alterações sincronizadas não exigem intervenção neste momento.</span></div>}
    </article>

    <article className="panel calendar-integration-v84__technical"><ExternalLink size={18} /><div><strong>Sincronização protegida</strong><span>OAuth PKCE · tokens no backend · idempotência por evento/versão · Google PATCH · webhook renovável · conflitos com If-Match · deduplicação de primeira sincronização.</span></div></article>
  </section>
}
