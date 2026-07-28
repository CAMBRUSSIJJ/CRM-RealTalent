import {
  AlertTriangle, Bot, Check, CheckCircle2, Clock3, Copy, Database, ExternalLink, KeyRound, Link2,
  Mail, MessageCircle, Phone, PlugZap, RefreshCw, RotateCw, Save, ShieldCheck, Unplug, Webhook,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { formatDateTime } from '../../domain/formatters'
import type { WorkspaceMember } from '../../domain/types'
import {
  defaultExtensionConfig, extensionEndpoint, findExtensionConfig, loadIntegrationWorkspace, normalizeExtensionConfig,
  revokeExtensionToken, rotateExtensionToken, saveExtensionConnection, testExtensionConnection,
  type ExtensionIntegrationConfig, type IntegrationProvider, type IntegrationStatus, type IntegrationWorkspaceState,
} from '../../services/integration-workspace'
import type { CrmPreferences } from './preferences-context'
import { IntegrationFrameworkPanel } from './integration-framework-panel'

interface IntegrationCenterProps {
  preferences: CrmPreferences['integrations']
  members: WorkspaceMember[]
  onPreferencesChange(patch: Partial<CrmPreferences['integrations']>): void
}

const statusPresentation: Record<IntegrationStatus, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  connected: { label: 'Conectado', tone: 'success' }, disconnected: { label: 'Desconectado', tone: 'neutral' },
  attention: { label: 'Requer atenção', tone: 'warning' }, error: { label: 'Com erro', tone: 'danger' },
  assisted: { label: 'Assistido', tone: 'info' }, planned: { label: 'Planejado', tone: 'neutral' },
}
const providerLabels: Record<IntegrationProvider, string> = {
  extension: 'Extensão RealTalent', supabase: 'Supabase', whatsapp: 'WhatsApp', instagram: 'Instagram', email: 'E-mail',
  google_calendar: 'Google Calendar', outlook: 'Outlook', telephony: 'Telefonia', webhook: 'Webhook',
}
const eventStatus = {
  processed: { label: 'Processado', tone: 'success' as const }, partial: { label: 'Parcial', tone: 'warning' as const },
  failed: { label: 'Falhou', tone: 'danger' as const }, skipped: { label: 'Ignorado', tone: 'neutral' as const },
}

export function IntegrationCenter({ preferences, members, onPreferencesChange }: IntegrationCenterProps) {
  const { currentWorkspace, snapshot, repositoryMode, health, notify } = useApp()
  const fallback = useMemo(() => defaultExtensionConfig(snapshot?.stages.find((stage) => !stage.isWon && !stage.isLost)?.id ?? '', members[0] ? { id: members[0].userId, name: members[0].displayName } : null), [members, snapshot?.stages])
  const [workspace, setWorkspace] = useState<IntegrationWorkspaceState>({ connections: [], events: [] })
  const [config, setConfig] = useState<ExtensionIntegrationConfig>(() => fallback)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [tokenBusy, setTokenBusy] = useState(false)
  const [revealedToken, setRevealedToken] = useState('')
  const [showConfiguration, setShowConfiguration] = useState(true)
  const [copied, setCopied] = useState('')
  const canManage = currentWorkspace?.role === 'owner' || currentWorkspace?.role === 'admin'
  const endpoint = extensionEndpoint()

  const refresh = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const next = await loadIntegrationWorkspace(currentWorkspace.id)
      setWorkspace(next)
      const saved = findExtensionConfig(next, { ...fallback, enabled: preferences.extensionEnabled })
      setConfig(repositoryMode === 'local' ? { ...saved, destination: 'garimpo' } : saved)
    } finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [currentWorkspace?.id])

  const extensionConnection = workspace.connections.find((item) => item.provider === 'extension')
  const extensionStatus: IntegrationStatus = !preferences.extensionEnabled || !config.enabled
    ? 'disconnected'
    : repositoryMode === 'local'
      ? 'connected'
      : extensionConnection?.status ?? 'attention'
  const providers = [
    { provider: 'extension' as const, title: 'Extensão RealTalent', description: config.destination === 'crm' ? 'Captura e envia para o CRM com regras definidas.' : 'Captura e envia para revisão no Garimpo.', icon: PlugZap, status: extensionStatus },
    { provider: 'supabase' as const, title: 'Banco e autenticação', description: repositoryMode === 'supabase' ? (health?.message ?? 'Dados hospedados e sincronizados.') : 'Operação local neste navegador.', icon: Database, status: repositoryMode === 'supabase' && health?.connected ? 'connected' as const : 'assisted' as const },
    { provider: 'whatsapp' as const, title: 'WhatsApp', description: 'Abre a conversa com mensagem preparada; o vendedor confirma o envio.', icon: MessageCircle, status: preferences.assistedWhatsapp ? 'assisted' as const : 'disconnected' as const },
    { provider: 'email' as const, title: 'E-mail', description: 'Prepara o contato no cliente de e-mail; sem disparo oculto.', icon: Mail, status: preferences.assistedEmail ? 'assisted' as const : 'disconnected' as const },
    { provider: 'google_calendar' as const, title: 'Google Calendar', description: 'Sincronização bidirecional reservada para a próxima entrega.', icon: Clock3, status: 'planned' as const },
    { provider: 'telephony' as const, title: 'Telefonia e webhooks', description: 'Base preparada para chamadas, eventos externos e parceiros.', icon: Webhook, status: 'planned' as const },
  ]
  const connectedCount = providers.filter((item) => item.status === 'connected' || item.status === 'assisted').length
  const attentionCount = providers.filter((item) => item.status === 'attention' || item.status === 'error').length

  const patchConfig = (patch: Partial<ExtensionIntegrationConfig>) => setConfig((current) => normalizeExtensionConfig({ ...current, ...patch }, fallback))
  const copyValue = async (label: string, value: string) => {
    if (!value) return
    try { await navigator.clipboard.writeText(value); setCopied(label); window.setTimeout(() => setCopied(''), 1800); notify('success', `${label} copiado.`) }
    catch { notify('error', `Não foi possível copiar ${label.toLocaleLowerCase('pt-BR')}.`) }
  }
  const save = async () => {
    if (!currentWorkspace) return
    if (!canManage) return notify('info', 'Somente administradores podem alterar integrações.')
    if (config.destination === 'crm' && !config.defaultStageId) return notify('error', 'Escolha a etapa inicial do CRM.')
    setSaving(true)
    try {
      await saveExtensionConnection(currentWorkspace.id, config)
      onPreferencesChange({ extensionEnabled: config.enabled })
      await refresh()
      notify('success', 'Configuração da extensão salva.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar a integração.') }
    finally { setSaving(false) }
  }
  const test = async () => {
    if (!currentWorkspace) return
    setTesting(true)
    try {
      const result = await testExtensionConnection(currentWorkspace.id, config)
      notify(result.ok ? 'success' : 'error', result.message)
      await refresh()
    } finally { setTesting(false) }
  }
  const rotateToken = async () => {
    if (!currentWorkspace) return
    setTokenBusy(true); setRevealedToken('')
    try { setRevealedToken(await rotateExtensionToken(currentWorkspace.id)); await refresh(); notify('success', 'Novo token criado. Copie agora: ele não será mostrado novamente.') }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível criar o token.') }
    finally { setTokenBusy(false) }
  }
  const revokeToken = async () => {
    if (!currentWorkspace || !confirm('Revogar o token atual? A extensão deixará de enviar dados até receber um novo token.')) return
    setTokenBusy(true)
    try { await revokeExtensionToken(currentWorkspace.id); setRevealedToken(''); await refresh(); notify('success', 'Token revogado.') }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível revogar o token.') }
    finally { setTokenBusy(false) }
  }

  return <><IntegrationFrameworkPanel /><div className="integration-center integration-center--legacy" aria-busy={loading}>
    <section className="panel integration-center__hero">
      <div><span className="eyebrow"><ShieldCheck size={15} /> Operação rastreável</span><h3>Central de Integrações</h3><p>Conecte entradas ao CRM sem esconder limitações. Cada captura recebe status, histórico e regra de destino.</p></div>
      <div className="integration-center__summary"><span><strong>{connectedCount}</strong> disponíveis</span><span className={attentionCount ? 'has-attention' : ''}><strong>{attentionCount}</strong> atenção</span><Button variant="secondary" size="sm" onClick={() => void refresh()} loading={loading}><RefreshCw size={15} /> Atualizar</Button></div>
    </section>

    <section className="integration-provider-grid">
      {providers.map(({ provider, title, description, icon: Icon, status }) => <article className={`integration-provider integration-provider--${status}`} key={provider}>
        <div className="integration-provider__icon"><Icon size={21} /></div><div className="integration-provider__copy"><strong>{title}</strong><p>{description}</p></div>
        <StatusPill tone={statusPresentation[status].tone}>{statusPresentation[status].label}</StatusPill>
        {provider === 'extension' ? <button type="button" className="integration-provider__action" onClick={() => setShowConfiguration((current) => !current)}>{showConfiguration ? 'Ocultar configuração' : 'Configurar'} <ExternalLink size={14} /></button> : null}
      </article>)}
    </section>

    {showConfiguration ? <section className="panel integration-setup">
      <div className="panel__heading"><div><span className="eyebrow">Entrada oficial</span><h3>Extensão RealTalent → CRM</h3></div><StatusPill tone={statusPresentation[extensionStatus].tone}>{statusPresentation[extensionStatus].label}</StatusPill></div>
      <div className="integration-note"><ShieldCheck size={18} /><span><strong>{repositoryMode === 'supabase' ? 'Modo hospedado seguro.' : 'Modo local controlado.'}</strong> {repositoryMode === 'supabase' ? 'O endpoint exige token revogável e aceita no máximo 100 registros por lote.' : 'A captura usa a caixa deste navegador. Nenhum endpoint público ou token é simulado.'}</span></div>

      <div className="integration-setup__section">
        <div className="integration-setup__title"><span>1</span><div><strong>Conexão</strong><small>Defina como a extensão entrega os dados.</small></div></div>
        <label className="settings-toggle"><input type="checkbox" checked={config.enabled} disabled={!canManage} onChange={(event) => patchConfig({ enabled: event.target.checked })} /><span><strong>Receber capturas da extensão</strong><small>Pode ser pausado sem apagar o histórico.</small></span></label>
        {repositoryMode === 'supabase' ? <div className="integration-credential-grid">
          <label className="field"><span>Endpoint de recebimento</span><div className="copy-field"><input readOnly value={endpoint} /><button type="button" aria-label="Copiar endpoint" onClick={() => void copyValue('Endpoint', endpoint)}>{copied === 'Endpoint' ? <Check size={16} /> : <Copy size={16} />}</button></div></label>
          <div className="field"><span>Token da extensão</span><div className="integration-token-state"><KeyRound size={17} /><div><strong>{extensionConnection?.hasCredential ? 'Token ativo' : 'Nenhum token ativo'}</strong><small>Administradores podem girar ou revogar o segredo.</small></div></div><div className="settings-actions"><Button size="sm" variant="secondary" disabled={!canManage} loading={tokenBusy} onClick={() => void rotateToken()}><RotateCw size={15} /> {extensionConnection?.hasCredential ? 'Girar token' : 'Gerar token'}</Button>{extensionConnection?.hasCredential ? <Button size="sm" variant="ghost" disabled={!canManage || tokenBusy} onClick={() => void revokeToken()}><Unplug size={15} /> Revogar</Button> : null}</div></div>
        </div> : <label className="field"><span>Chave da caixa local</span><div className="copy-field"><input readOnly value={preferences.inboxKey} /><button type="button" aria-label="Copiar chave" onClick={() => void copyValue('Chave da caixa', preferences.inboxKey)}>{copied === 'Chave da caixa' ? <Check size={16} /> : <Copy size={16} />}</button></div></label>}
        {revealedToken ? <div className="one-time-secret"><AlertTriangle size={18} /><div><strong>Copie este token agora</strong><p>Ele não será exibido novamente. Cole-o nas configurações da extensão.</p><div className="copy-field"><input readOnly value={revealedToken} /><button type="button" aria-label="Copiar token" onClick={() => void copyValue('Token', revealedToken)}>{copied === 'Token' ? <Check size={16} /> : <Copy size={16} />}</button></div></div></div> : null}
        {repositoryMode === 'supabase' ? <div className="integration-client-health">
          <div><small>Instalação conectada</small><strong>{extensionConnection?.connectionName || 'Aguardando primeiro teste'}</strong></div>
          <div><small>Versão da extensão</small><strong>{extensionConnection?.clientVersion ? `V${extensionConnection.clientVersion}` : 'Ainda não informada'}</strong></div>
          <div><small>Último lote</small><strong title={extensionConnection?.lastBatchId ?? ''}>{extensionConnection?.lastBatchId || 'Nenhum lote recebido'}</strong></div>
          <div><small>Volume recebido</small><strong>{extensionConnection?.receivedCount ?? 0} lead(s) · {extensionConnection?.errorCount ?? 0} erro(s)</strong></div>
        </div> : null}
      </div>

      <div className="integration-setup__section">
        <div className="integration-setup__title"><span>2</span><div><strong>Destino e tratamento</strong><small>Controle o que acontece antes de o lead entrar no funil.</small></div></div>
        <div className="destination-options"><label className={config.destination === 'garimpo' ? 'is-selected' : ''}><input type="radio" name="extension-destination" value="garimpo" checked={config.destination === 'garimpo'} onChange={() => patchConfig({ destination: 'garimpo' })} /><Bot size={20} /><span><strong>Revisar no Garimpo</strong><small>Mais seguro: validar, enriquecer e aprovar antes do CRM.</small></span></label><label className={config.destination === 'crm' ? 'is-selected' : ''} aria-disabled={repositoryMode === 'local'}><input type="radio" name="extension-destination" value="crm" disabled={repositoryMode === 'local'} checked={config.destination === 'crm'} onChange={() => patchConfig({ destination: 'crm' })} /><Link2 size={20} /><span><strong>Enviar direto ao CRM</strong><small>{repositoryMode === 'local' ? 'Disponível no modo hospedado, com autenticação e rastreabilidade.' : 'Aplica mapeamento, duplicidade e automação automaticamente.'}</small></span></label></div>
        <div className="settings-form-grid settings-form-grid--3">
          <label className="field"><span>Regra para duplicados</span><select value={config.duplicatePolicy} onChange={(event) => patchConfig({ duplicatePolicy: event.target.value as ExtensionIntegrationConfig['duplicatePolicy'] })}><option value="skip">Ignorar e registrar</option><option value="update">Atualizar cadastro existente</option><option value="create">Criar mesmo assim</option></select></label>
          <label className="field"><span>Etapa inicial</span><select disabled={config.destination !== 'crm'} value={config.defaultStageId} onChange={(event) => patchConfig({ defaultStageId: event.target.value })}><option value="">Selecione</option>{snapshot?.stages.filter((stage) => !stage.isWon && !stage.isLost).map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</select></label>
          <label className="field"><span>Responsável</span><select disabled={config.destination !== 'crm'} value={config.defaultOwnerId ?? ''} onChange={(event) => { const member = members.find((item) => item.userId === event.target.value); patchConfig({ defaultOwnerId: member?.userId ?? null, defaultOwnerName: member?.displayName ?? '' }) }}><option value="">Sem responsável</option>{members.map((member) => <option value={member.userId} key={member.userId}>{member.displayName}</option>)}</select></label>
          <label className="field"><span>Prioridade</span><select value={config.priority} onChange={(event) => patchConfig({ priority: event.target.value as ExtensionIntegrationConfig['priority'] })}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
          <label className="field"><span>Temperatura</span><select value={config.temperature} onChange={(event) => patchConfig({ temperature: event.target.value as ExtensionIntegrationConfig['temperature'] })}><option value="cold">Frio</option><option value="warm">Morno</option><option value="hot">Quente</option></select></label>
          <label className="field"><span>Etiquetas</span><input value={config.tags.join(', ')} onChange={(event) => patchConfig({ tags: event.target.value.split(',') })} placeholder="Extensão, Prospecção" /></label>
        </div>
      </div>

      <div className="integration-setup__section">
        <div className="integration-setup__title"><span>3</span><div><strong>Fluxo pós-captura</strong><small>Entregue o lead validado, priorizado e com o primeiro contato preparado.</small></div></div>
        <div className="settings-form-grid settings-form-grid--3">
          <label className="settings-toggle"><input type="checkbox" checked={config.createNextAction} onChange={(event) => patchConfig({ createNextAction: event.target.checked })} /><span><strong>Criar próxima ação</strong><small>Evita lead novo sem tarefa.</small></span></label>
          <label className="field"><span>Prazo da ação (horas)</span><input type="number" min="1" max="720" disabled={!config.createNextAction} value={config.nextActionDelayHours} onChange={(event) => patchConfig({ nextActionDelayHours: Number(event.target.value) })} /></label>
          <label className="settings-toggle"><input type="checkbox" checked={config.startCadence} onChange={(event) => patchConfig({ startCadence: event.target.checked })} /><span><strong>Executar fluxo completo</strong><small>Cadência, aviso e mensagens entram na fila segura.</small></span></label>
          <label className="field"><span>Nome da cadência</span><input maxLength={120} disabled={!config.startCadence} value={config.cadenceName} onChange={(event) => patchConfig({ cadenceName: event.target.value })} /></label>
          <label className="settings-toggle"><input type="checkbox" disabled={!config.startCadence} checked={config.notifySeller} onChange={(event) => patchConfig({ notifySeller: event.target.checked })} /><span><strong>Avisar vendedor</strong><small>Cria um aviso interno acionável.</small></span></label>
          <label className="settings-toggle"><input type="checkbox" disabled={!config.startCadence} checked={config.prepareWhatsApp} onChange={(event) => patchConfig({ prepareWhatsApp: event.target.checked })} /><span><strong>Preparar WhatsApp</strong><small>O vendedor revisa e confirma o envio.</small></span></label>
          <label className="settings-toggle"><input type="checkbox" disabled={!config.startCadence} checked={config.prepareEmail} onChange={(event) => patchConfig({ prepareEmail: event.target.checked })} /><span><strong>Preparar e-mail</strong><small>Gera assunto e corpo sem envio oculto.</small></span></label>
        </div>
      </div>

      <div className="integration-setup__footer"><div><small>Último teste</small><strong>{formatDateTime(extensionConnection?.lastTestedAt ?? null)}</strong></div><div><small>Última entrada</small><strong>{formatDateTime(extensionConnection?.lastReceivedAt ?? null)}</strong></div><div className="settings-actions"><Button variant="secondary" loading={testing} onClick={() => void test()}><PlugZap size={16} /> Testar configuração</Button><Button loading={saving} disabled={!canManage} onClick={() => void save()}><Save size={16} /> Salvar integração</Button></div></div>
    </section> : null}

    <section className="panel integration-history">
      <div className="panel__heading"><div><span className="eyebrow">Rastreabilidade</span><h3>Histórico de integrações</h3></div><span className="integration-history__count">{workspace.events.length} evento(s)</span></div>
      {workspace.events.length ? <div className="integration-history__table"><div className="integration-history__head"><span>Origem</span><span>Evento</span><span>Itens</span><span>Status</span><span>Data</span></div>{workspace.events.slice(0, 20).map((event) => <div className="integration-history__row" key={event.id}><span><strong>{providerLabels[event.provider]}</strong><small>{event.direction === 'inbound' ? 'Entrada' : 'Saída'}{typeof event.metadata.connectionName === 'string' ? ` · ${event.metadata.connectionName}` : ''}</small></span><span>{event.eventType === 'connection_test' ? 'teste de conexão' : event.eventType.replaceAll('_', ' ')}{typeof event.metadata.clientVersion === 'string' && event.metadata.clientVersion ? <small>V{event.metadata.clientVersion}</small> : null}</span><span>{event.itemCount}</span><StatusPill tone={eventStatus[event.status].tone}>{eventStatus[event.status].label}</StatusPill><time>{formatDateTime(event.createdAt)}</time>{event.errorMessage ? <p>{event.errorMessage}</p> : null}</div>)}</div> : <div className="integration-empty"><CheckCircle2 size={24} /><div><strong>Nenhum evento recebido ainda</strong><p>Quando a extensão testar a conexão ou enviar um lote, a situação aparecerá aqui com data, origem e resultado.</p></div></div>}
    </section>

    <section className="panel assisted-channels"><div className="panel__heading"><div><span className="eyebrow">Canais comerciais</span><h3>Ações assistidas pelo vendedor</h3></div><Phone size={21} /></div><p>Esses canais preparam a abordagem, mas nunca enviam mensagens sem confirmação humana.</p><div className="settings-toggle-list"><label className="settings-toggle"><input type="checkbox" checked={preferences.assistedWhatsapp} onChange={(event) => onPreferencesChange({ assistedWhatsapp: event.target.checked })} /><span><strong>WhatsApp</strong><small>Abrir conversa com mensagem preparada.</small></span></label><label className="settings-toggle"><input type="checkbox" checked={preferences.assistedInstagram} onChange={(event) => onPreferencesChange({ assistedInstagram: event.target.checked })} /><span><strong>Instagram</strong><small>Abrir o perfil e orientar a abordagem.</small></span></label><label className="settings-toggle"><input type="checkbox" checked={preferences.assistedEmail} onChange={(event) => onPreferencesChange({ assistedEmail: event.target.checked })} /><span><strong>E-mail</strong><small>Preparar assunto e corpo no cliente de e-mail.</small></span></label></div>
    </section>
  </div></>
}
