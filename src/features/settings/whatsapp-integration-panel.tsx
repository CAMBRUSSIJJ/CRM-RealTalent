import { NativeSelectionSelect } from '../../components/selection'
import {
  Activity, CheckCircle2, Cloud, Copy, LayoutDashboard, ListChecks, MessageCircle, MessageSquareText,
  Pencil, Plus, QrCode, RefreshCw, RotateCcw, Save, Search, Settings2, ShieldCheck, Trash2, Unplug,
  UsersRound, X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppActions, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { openExternalUrl } from '../../lib/browser-actions'
import { effectiveDataMode } from '../../lib/env'
import { safeStorage } from '../../lib/storage'
import {
  configureGatewayWhatsApp, disconnectGatewayWhatsAppQr, loadCommunicationsGatewayHealth, loadGatewayWhatsAppQrStatus,
  startGatewayWhatsAppQr, type CommunicationsGatewayHealth, type WhatsAppQrStatus,
} from '../../services/local-communications-gateway'
import { beginOAuthConnection, loadIntegrationFramework, testConnectedAccount, updateConnectedAccount } from '../../services/integration-framework'
import { loadRuntimeStatus, restartCommunicationsRuntime, type RuntimeStatus } from '../../services/runtime-control'
import { loadWorkManagement, type WorkManagementSnapshot } from '../../services/work-management'
import {
  loadWhatsAppTemplates, resetWhatsAppTemplates, saveWhatsAppTemplates,
  type WhatsAppTemplate, type WhatsAppTemplatePurpose,
} from '../../services/whatsapp-workspace'
import type { WorkspaceMember } from '../../domain/types'
import type { CrmPreferences } from './preferences-context'
import {whatsappGatewayIsHealthy} from '../../lib/integration-availability-s34'

const purposeLabels: Record<WhatsAppTemplatePurpose, string> = {
  first_contact: 'Primeiro contato', followup: 'Follow-up', proposal: 'Proposta', meeting: 'Reunião', post_sale: 'Pós-venda', custom: 'Personalizado',
}

type SectionId = 'overview' | 'accounts' | 'messages' | 'templates' | 'team' | 'diagnostics'

interface WhatsAppControlPreferences {
  referenceTeamId: string
  templateFilter: WhatsAppTemplatePurpose | 'all'
}

const defaultControlPreferences: WhatsAppControlPreferences = { referenceTeamId: '', templateFilter: 'all' }
const controlStorageKey = (workspaceId: string) => `realtalent:${workspaceId}:whatsapp-control-center:v1`
const loadControlPreferences = (workspaceId: string): WhatsAppControlPreferences => {
  try {
    const parsed = JSON.parse(safeStorage.getItem(controlStorageKey(workspaceId)) || '{}') as Partial<WhatsAppControlPreferences>
    return {
      referenceTeamId: typeof parsed.referenceTeamId === 'string' ? parsed.referenceTeamId : '',
      templateFilter: parsed.templateFilter && (parsed.templateFilter === 'all' || parsed.templateFilter in purposeLabels) ? parsed.templateFilter : 'all',
    }
  } catch { return defaultControlPreferences }
}

const emptyWorkManagement = (): WorkManagementSnapshot => ({ teams: [], memberships: [], tasks: [], relations: [], checklistItems: [], comments: [] })

export function WhatsappIntegrationPanel({ preferences, onPreferencesChange }: { preferences: CrmPreferences['integrations']; onPreferencesChange(patch: Partial<CrmPreferences['integrations']>): void }) {
  const { currentWorkspace, repositoryMode } = useAppWorkspace()
  const { listWorkspaceMembers } = useAppActions()
  const { notify } = useAppUi()
  const workspaceId = currentWorkspace?.id ?? 'default'
  const localGatewayMode = effectiveDataMode === 'local'
  const [section, setSection] = useState<SectionId>('overview')
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>(() => loadWhatsAppTemplates(workspaceId))
  const [accounts, setAccounts] = useState<Awaited<ReturnType<typeof loadIntegrationFramework>>['accounts']>([])
  const [busy, setBusy] = useState('')
  const [showLocalSetup, setShowLocalSetup] = useState(false)
  const [accessToken, setAccessToken] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [wabaId, setWabaId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [qrStatus, setQrStatus] = useState<WhatsAppQrStatus | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [templateQuery, setTemplateQuery] = useState('')
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null)
  const [controlPreferences, setControlPreferences] = useState<WhatsAppControlPreferences>(() => loadControlPreferences(workspaceId))
  const [workManagement, setWorkManagement] = useState<WorkManagementSnapshot>(() => emptyWorkManagement())
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [gatewayHealth, setGatewayHealth] = useState<CommunicationsGatewayHealth | null>(null)
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null)
  const [gatewayError, setGatewayError] = useState<string>('')

  const saveControlPreferences = (patch: Partial<WhatsAppControlPreferences>) => {
    setControlPreferences((current) => {
      const next = { ...current, ...patch }
      safeStorage.setItem(controlStorageKey(workspaceId), JSON.stringify(next))
      return next
    })
  }

  const refreshAccounts = async () => {
    const state = await loadIntegrationFramework(workspaceId)
    setAccounts(state.accounts.filter((item) => item.provider === 'whatsapp_cloud'))
  }

  const refreshRuntimeState = async () => {
    if (!localGatewayMode) return true
    let runtime: RuntimeStatus | null = null
    try { runtime = await loadRuntimeStatus(); setRuntimeStatus(runtime) }
    catch { setRuntimeStatus(null) }
    try {
      const health = await loadCommunicationsGatewayHealth()
      if(!health.ok)throw Error('O gateway respondeu, mas não está saudável.')
      setGatewayHealth(health)
      setGatewayError('')
      return true
    } catch (error) {
      setGatewayHealth(null)
      setGatewayError(error instanceof Error?error.message:'O gateway não respondeu.')
      // A supervisor process may be alive without a usable HTTP gateway.
      // Never present it as connected without a successful health request.
      return false
    }
  }

  const recoverGateway = async (showNotice = true) => {
    if (!localGatewayMode) return true
    setBusy('runtime-recovery')
    try {
      const result = await restartCommunicationsRuntime()
      setRuntimeStatus(result.status)
      if (!result.ok || !result.status.services.communications) throw new Error('O serviço do WhatsApp não ficou pronto. Abra Diagnóstico para verificar o estado do gateway.')
      const health = await loadCommunicationsGatewayHealth()
      if(!health.ok)throw Error('O gateway não respondeu ao teste de saúde após a recuperação.')
      setGatewayHealth(health)
      setGatewayError('')
      if (showNotice) notify('success', result.recovered ? 'Gateway recuperado. Agora você pode gerar o QR Code.' : 'Gateway está respondendo. Agora você pode gerar o QR Code.')
      return true
    } catch (error) {
      setGatewayHealth(null)
      const reason=error instanceof Error?error.message:'Não foi possível recuperar o serviço do WhatsApp.'
      setGatewayError(reason)
      if (showNotice) notify('error', 'Recuperação não concluída. Consulte os detalhes nesta tela.')
      return false
    } finally { setBusy('') }
  }

  const ensureGatewayReady = async () => {
    if (!localGatewayMode) return true
    try{
      const health=await loadCommunicationsGatewayHealth()
      if(!health.ok)return false
      setGatewayHealth(health);setGatewayError('')
      return true
    }catch{return false}
  }

  const refreshDiagnostics = async () => {
    setBusy('diagnostics')
    try {
      const gatewayReady = await refreshRuntimeState()
      if (gatewayReady) {
        try { await refreshAccounts() } catch { setAccounts([]) }
        if (localGatewayMode) {
          try { setQrStatus(await loadGatewayWhatsAppQrStatus(workspaceId)) } catch { setQrStatus(null) }
        }
      } else {
        setQrStatus(null)
      }
      notify(gatewayReady ? 'success' : 'info', gatewayReady ? 'Gateway respondeu ao teste de saúde.' : 'Gateway não respondeu. Veja o aviso no topo desta página.')
    } catch { notify('error', 'Não foi possível atualizar o diagnóstico do WhatsApp.') }
    finally { setBusy('') }
  }

  useEffect(() => {
    setTemplates(loadWhatsAppTemplates(workspaceId))
    setControlPreferences(loadControlPreferences(workspaceId))
    void refreshAccounts().catch(() => setAccounts([]))
    void refreshRuntimeState()
  }, [workspaceId])

  useEffect(() => {
    let active = true
    void loadWorkManagement(repositoryMode, workspaceId).then((next) => { if (active) setWorkManagement(next) }).catch(() => { if (active) setWorkManagement(emptyWorkManagement()) })
    void listWorkspaceMembers().then((next) => { if (active) setMembers(next) }).catch(() => { if (active) setMembers([]) })
    return () => { active = false }
  }, [repositoryMode, workspaceId, listWorkspaceMembers])

  useEffect(() => {
    if (!localGatewayMode || !showQr) return
    let active = true
    const tick = async () => {
      try {
        const next = await loadGatewayWhatsAppQrStatus(workspaceId)
        if (!active) return
        setQrStatus(next)
        if (next.state === 'connected') {
          await refreshAccounts()
          notify('success', `WhatsApp QR conectado${next.phone ? `: +${next.phone}` : ''}.`)
          setShowQr(false)
        }
      } catch {}
    }
    void tick()
    const id = window.setInterval(() => void tick(), 1500)
    return () => { active = false; window.clearInterval(id) }
  }, [localGatewayMode, showQr, workspaceId])

  const selectedAccount = useMemo(
    () => accounts.find((item) => item.id === preferences.whatsappOfficialAccountId) ?? accounts.find((item) => item.status === 'connected') ?? null,
    [accounts, preferences.whatsappOfficialAccountId],
  )
  const connectedAccounts = accounts.filter((item) => item.status === 'connected')
  const qrConnected = qrStatus?.state === 'connected'
  const overallConnected = qrConnected || connectedAccounts.length > 0
  const gatewayReady = !localGatewayMode || whatsappGatewayIsHealthy(gatewayHealth,runtimeStatus)
  const persistTemplates = (next: WhatsAppTemplate[]) => { setTemplates(next); saveWhatsAppTemplates(workspaceId, next) }
  const activeTeams = workManagement.teams.filter((item) => item.active !== false)
  const selectedTeam = activeTeams.find((item) => item.id === controlPreferences.referenceTeamId) ?? null
  const memberById = useMemo(() => new Map(members.map((member) => [member.userId, member])), [members])
  const selectedTeamMembers = selectedTeam
    ? workManagement.memberships.filter((item) => item.teamId === selectedTeam.id).map((item) => memberById.get(item.userId)).filter((item): item is WorkspaceMember => Boolean(item))
    : []
  const filteredTemplates = templates.filter((template) => {
    const categoryMatches = controlPreferences.templateFilter === 'all' || template.purpose === controlPreferences.templateFilter
    const q = templateQuery.trim().toLowerCase()
    return categoryMatches && (!q || template.name.toLowerCase().includes(q) || template.body.toLowerCase().includes(q))
  })

  const connect = async () => {
    if (localGatewayMode) { setShowLocalSetup((value) => !value); return }
    setBusy('connect')
    try {
      const result = await beginOAuthConnection(workspaceId, 'whatsapp_cloud')
      if (result.url) { const opened = openExternalUrl(result.url); if (!opened.ok) throw new Error(opened.reason) }
      else notify('info', result.message)
      await refreshAccounts()
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível iniciar a conexão.') }
    finally { setBusy('') }
  }

  const saveLocalConnection = async () => {
    if (!accessToken.trim() || !phoneNumberId.trim()) return notify('info', 'Informe o Access Token e o Phone Number ID do WhatsApp Cloud.')
    setBusy('local-connect')
    try {
      const result = await configureGatewayWhatsApp({ workspaceId, accessToken: accessToken.trim(), phoneNumberId: phoneNumberId.trim(), wabaId: wabaId.trim(), displayName: displayName.trim() })
      setAccessToken(''); setShowLocalSetup(false); await refreshAccounts()
      onPreferencesChange({ whatsappMode: 'official', whatsappOfficialAccountId: result.account.id })
      notify('success', result.message)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível validar o WhatsApp Business.') }
    finally { setBusy('') }
  }

  const startQr = async () => {
    setBusy('qr-start')
    const ready = await ensureGatewayReady()
    if (!ready) { setBusy(''); setShowQr(false); notify('info', 'Recupere o gateway no topo desta página antes de solicitar um QR Code.'); return }
    setShowQr(true)
    try { setQrStatus(await startGatewayWhatsAppQr(workspaceId, 'WhatsApp QR Local')) }
    catch (error) { setShowQr(false); notify('error', error instanceof Error ? error.message : 'Não foi possível iniciar o QR Code.') }
    finally { setBusy('') }
  }
  const disconnectQr = async () => {
    setBusy('qr-disconnect')
    try { await disconnectGatewayWhatsAppQr(workspaceId); setQrStatus(null); setShowQr(false); await refreshAccounts(); notify('success', 'Sessão WhatsApp QR removida deste computador.') }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível desconectar o WhatsApp QR.') }
    finally { setBusy('') }
  }
  const test = async () => {
    if (!selectedAccount) return
    setBusy('test')
    try { const result = await testConnectedAccount(workspaceId, selectedAccount); notify(result.status === 'fail' ? 'error' : result.status === 'warn' ? 'info' : 'success', result.message) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Falha no teste.') }
    finally { setBusy('') }
  }
  const disconnect = async () => {
    if (!selectedAccount) return
    setBusy('disconnect')
    try { await updateConnectedAccount(workspaceId, selectedAccount.id, 'disconnect'); await refreshAccounts(); onPreferencesChange({ whatsappMode: 'assisted', whatsappOfficialAccountId: '' }); notify('success', 'Conta WhatsApp revogada.') }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível revogar a conta.') }
    finally { setBusy('') }
  }

  const newTemplate = () => setEditingTemplate({ id: `custom-${Date.now()}`, name: 'Novo template', purpose: 'custom', body: 'Olá, {{name}}!', active: true })
  const duplicateTemplate = (template: WhatsAppTemplate) => {
    const clone = { ...template, id: `custom-${Date.now()}`, name: `${template.name} — cópia` }
    persistTemplates([...templates, clone])
    notify('success', 'Template duplicado.')
  }
  const saveEditingTemplate = () => {
    if (!editingTemplate) return
    if (!editingTemplate.name.trim() || !editingTemplate.body.trim()) return notify('info', 'Informe nome e mensagem do template.')
    const exists = templates.some((item) => item.id === editingTemplate.id)
    persistTemplates(exists ? templates.map((item) => item.id === editingTemplate.id ? editingTemplate : item) : [...templates, editingTemplate])
    setEditingTemplate(null)
    notify('success', 'Template salvo.')
  }

  const sections: Array<{ id: SectionId; label: string; description: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: 'Visão geral', description: 'Status e atalhos', icon: LayoutDashboard },
    { id: 'accounts', label: 'Contas e conexão', description: 'QR e Cloud API', icon: Cloud },
    { id: 'messages', label: 'Mensagens', description: 'Modo e registro', icon: MessageSquareText },
    { id: 'templates', label: 'Templates', description: 'Biblioteca do CRM', icon: ListChecks },
    { id: 'team', label: 'Equipe', description: 'Referência do canal', icon: UsersRound },
    { id: 'diagnostics', label: 'Diagnóstico', description: 'Saúde e webhook', icon: Activity },
  ]

  return <section className="whatsapp-control-center-h198">
    <header className="whatsapp-control-center-h198__hero whatsapp-control-hero-s3">
      <div className="whatsapp-control-hero-s3__intro"><h2>Canal WhatsApp</h2><p>Conexões, mensagens e equipe em uma única área.</p></div>
      <div className={`whatsapp-control-status-h198 whatsapp-control-status-s3 ${gatewayReady && overallConnected?'is-connected':''}`} aria-live="polite">
        <i/><span><strong>{!gatewayReady?'Serviço indisponível':overallConnected?'Conectado':'Sem conta conectada'}</strong><small>{!gatewayReady?'Gateway de comunicação offline':qrConnected?'Conectado via QR':connectedAccounts.length?'Cloud API':'Configure sua conexão'}</small></span>
      </div>
      {!gatewayReady&&localGatewayMode?
        <Button size="sm" variant="secondary" disabled={Boolean(busy)&&busy!=='runtime-recovery'} loading={busy==='runtime-recovery'} onClick={()=>void recoverGateway()}><RefreshCw size={15}/> Recuperar gateway</Button>:
        !overallConnected?<Button variant="secondary" size="sm" onClick={()=>setSection('accounts')}><Cloud size={15}/> Configurar conexão</Button>:null}
    </header>
    {localGatewayMode&&!gatewayReady?<div className="whatsapp-service-alert-s34" role="status">
      <Activity size={19}/>
      <div><strong>Gateway local do WhatsApp indisponível</strong>
        <p>A recuperação utiliza o supervisor local do RealTalent. Se não funcionar, abra o CRM pelo inicializador com diagnóstico e consulte o log de execução.</p>
        {gatewayError?<details><summary>Detalhes técnicos</summary><p>{gatewayError}</p>
          {runtimeStatus?.communications.logTail?<pre>{runtimeStatus.communications.logTail.slice(-2400)}</pre>:null}
        </details>:null}
      </div>
    </div>:null}

    <div className="whatsapp-control-layout-h198 whatsapp-control-layout-s3">
      <nav className="whatsapp-control-nav-h198 whatsapp-control-nav-s3" aria-label="Configurações do WhatsApp">
        {sections.map(item=>{const Icon=item.icon;return <button type="button" key={item.id}
          className={section===item.id?'is-active':''} aria-current={section===item.id?'page':undefined}
          title={item.description} onClick={()=>setSection(item.id)}><Icon size={16}/><span><strong>{item.label}</strong></span></button>})}
      </nav>

      <main className="whatsapp-control-content-h198 whatsapp-control-content-s3">
        {section === 'overview' ? <div className="whatsapp-settings-section-h198">
          <header><span className="eyebrow">Visão geral</span><h3>WhatsApp no RealTalent</h3><p>Veja a situação do canal e acesse rapidamente a configuração necessária.</p></header>
          <div className="whatsapp-overview-grid-h198">
            <article><span>Conexão</span><strong>{!gatewayReady ? 'Serviço offline' : overallConnected ? 'Conectado' : 'Desconectado'}</strong><small>{!gatewayReady ? 'Recuperação disponível em Diagnóstico' : qrConnected ? `QR${qrStatus?.phone ? ` · +${qrStatus.phone}` : ''}` : selectedAccount?.displayName || 'Nenhuma conta ativa'}</small></article>
            <article><span>Modo padrão</span><strong>{preferences.whatsappMode === 'official' ? 'Business oficial' : 'Assistido'}</strong><small>Código do país +{preferences.whatsappCountryCode || '55'}</small></article>
            <article><span>Templates</span><strong>{templates.filter((item) => item.active).length} ativos</strong><small>{templates.length} cadastrados</small></article>
            <article><span>Equipe</span><strong>{selectedTeam?.name || 'Não definida'}</strong><small>{selectedTeamMembers.length} membro(s)</small></article>
          </div>
          <section className="whatsapp-overview-account-h198"><div><span className={`whatsapp-overview-account-h198__icon ${overallConnected ? 'is-live' : ''}`}><MessageCircle size={20}/></span><span><small>Canal principal</small><strong>{selectedAccount?.displayName || (qrConnected ? 'WhatsApp QR Local' : 'WhatsApp')}</strong><em>{overallConnected ? 'Pronto para conversar' : 'Aguardando conexão'}</em></span></div><Button variant="secondary" onClick={() => setSection('accounts')}>{overallConnected ? 'Gerenciar conexão' : 'Conectar agora'}</Button></section>
          <div className="whatsapp-overview-shortcuts-h198">
            <button type="button" onClick={() => setSection('accounts')}><Cloud size={17}/><span><strong>Contas e conexão</strong><small>QR Code ou Cloud API</small></span></button>
            <button type="button" onClick={() => setSection('templates')}><ListChecks size={17}/><span><strong>Templates</strong><small>Editar biblioteca de mensagens</small></span></button>
            <button type="button" onClick={() => setSection('messages')}><Settings2 size={17}/><span><strong>Mensagens</strong><small>Modo e registro no CRM</small></span></button>
            <button type="button" onClick={() => setSection('diagnostics')}><Activity size={17}/><span><strong>Diagnóstico</strong><small>Testar canal e webhook</small></span></button>
          </div>
        </div> : null}

        {section === 'accounts' ? <div className="whatsapp-settings-section-h198">
          <header><span className="eyebrow">Contas e conexão</span><h3>Conectar WhatsApp</h3><p>Mantenha QR Local e Cloud API no mesmo lugar, com ações separadas e estado claro.</p></header>
          {localGatewayMode ? <section className="whatsapp-setting-card-h198"><div className="whatsapp-setting-card-h198__heading"><span><QrCode size={20}/></span><div><strong>WhatsApp por QR Code</strong><small>Conexão local por WhatsApp Web/Chromium.</small></div><StatusPill tone={gatewayReady && qrConnected ? 'success' : 'neutral'}>{!gatewayReady ? 'Serviço offline' : qrConnected ? 'Conectado' : qrStatus?.state || 'Desconectado'}</StatusPill></div><p>A sessão fica neste computador. Use para operação local e testes; para equipes e produção, prefira a Cloud API.</p>{!gatewayReady ? <div className="integration-note"><Activity size={18}/><span><strong>Conexão por QR indisponível.</strong> Use “Recuperar gateway” no topo da página antes de gerar um código.</span></div> : null}<div className="settings-actions"><Button disabled={!gatewayReady||Boolean(busy)&&busy!=='qr-start'} loading={busy === 'qr-start'} onClick={() => void startQr()}><QrCode size={16}/> {qrConnected ? 'Gerar novo QR' : 'Gerar QR Code'}</Button><Button variant="ghost" disabled={!gatewayReady} loading={busy === 'qr-disconnect'} onClick={() => void disconnectQr()}><Unplug size={15}/> Remover sessão</Button></div>{showQr ? <div className="whatsapp-qr-panel-h198">{qrStatus?.qrDataUrl ? <img src={qrStatus.qrDataUrl} alt="QR Code para conectar o WhatsApp" width={260} height={260}/> : <div className="integration-note"><QrCode size={18}/><span><strong>Preparando QR...</strong> Aguarde alguns segundos.</span></div>}<small>Motor: WhatsApp Web (Chromium) · Status: {qrStatus?.state ?? 'starting'}{qrStatus?.lastError ? ` · ${qrStatus.lastError}` : ''}</small></div> : null}</section> : null}
          <section className="whatsapp-setting-card-h198"><div className="whatsapp-setting-card-h198__heading"><span><Cloud size={20}/></span><div><strong>WhatsApp Cloud API</strong><small>Integração oficial da Meta para operação comercial.</small></div><StatusPill tone={selectedAccount?.status === 'connected' ? 'success' : 'neutral'}>{selectedAccount?.status === 'connected' ? 'Conectado' : 'Sem conta'}</StatusPill></div>{selectedAccount ? <div className="whatsapp-account-v85 whatsapp-account-h198"><div><strong>{selectedAccount.displayName}</strong><small>{selectedAccount.externalAccountId}</small></div><div className="settings-actions"><Button size="sm" variant="secondary" loading={busy === 'test'} onClick={() => void test()}>Testar conexão</Button><Button size="sm" variant="ghost" loading={busy === 'disconnect'} onClick={() => void disconnect()}><Unplug size={15}/> Revogar</Button></div></div> : <p>Nenhuma conta oficial conectada. O QR Local continua disponível quando o gateway local estiver ativo.</p>}<div className="settings-actions"><Button loading={busy === 'connect'} onClick={() => void connect()}><Plus size={16}/> {localGatewayMode ? 'Configurar Cloud API' : 'Conectar WhatsApp Business'}</Button>{accounts.filter((item) => item.status === 'connected').map((account) => <button type="button" key={account.id} className={preferences.whatsappOfficialAccountId === account.id ? 'whatsapp-account-option is-active' : 'whatsapp-account-option'} onClick={() => onPreferencesChange({ whatsappOfficialAccountId: account.id, whatsappMode: 'official' })}><CheckCircle2 size={14}/>{account.displayName}</button>)}</div>{localGatewayMode && showLocalSetup ? <div className="settings-form-grid settings-form-grid--2 whatsapp-cloud-form-h198"><label className="field"><span>Access Token permanente</span><input type="password" autoComplete="off" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} placeholder="EAAG..."/></label><label className="field"><span>Phone Number ID</span><input value={phoneNumberId} onChange={(event) => setPhoneNumberId(event.target.value.replace(/\D/g, ''))} placeholder="123456789..."/></label><label className="field"><span>WhatsApp Business Account ID</span><input value={wabaId} onChange={(event) => setWabaId(event.target.value.replace(/\D/g, ''))} placeholder="Opcional"/></label><label className="field"><span>Nome da conta</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="RealTalent Comercial"/></label><div className="settings-actions"><Button loading={busy === 'local-connect'} onClick={() => void saveLocalConnection()}><ShieldCheck size={16}/> Validar e conectar</Button><Button variant="ghost" onClick={() => setShowLocalSetup(false)}>Cancelar</Button></div></div> : null}</section>
        </div> : null}

        {section === 'messages' ? <div className="whatsapp-settings-section-h198">
          <header><span className="eyebrow">Mensagens</span><h3>Comportamento do canal</h3><p>Defina como o CRM abre, registra e identifica as conversas do WhatsApp.</p></header>
          <section className="whatsapp-setting-card-h198"><div className="whatsapp-setting-card-h198__heading"><span><MessageSquareText size={20}/></span><div><strong>Modo operacional</strong><small>Escolha entre operação assistida e envio oficial.</small></div></div><div className="settings-choice-grid"><label className={`settings-choice ${preferences.whatsappMode === 'assisted' ? 'is-active' : ''}`}><input type="radio" name="whatsapp-mode" checked={preferences.whatsappMode === 'assisted'} onChange={() => onPreferencesChange({ whatsappMode: 'assisted' })}/><strong>Assistido</strong><span>Abre o WhatsApp com a mensagem preparada quando não houver envio oficial disponível.</span></label><label className={`settings-choice ${preferences.whatsappMode === 'official' ? 'is-active' : ''}`}><input type="radio" name="whatsapp-mode" checked={preferences.whatsappMode === 'official'} onChange={() => onPreferencesChange({ whatsappMode: 'official' })}/><strong>Business oficial</strong><span>Envia pela Cloud API e registra o evento oficial na Central de Comunicação.</span></label></div></section>
          <section className="whatsapp-setting-card-h198"><div className="whatsapp-setting-card-h198__heading"><span><Settings2 size={20}/></span><div><strong>Registro no CRM</strong><small>Preferências já utilizadas pelo fluxo atual de WhatsApp.</small></div></div><div className="settings-form-grid settings-form-grid--3"><label className="field"><span>Código do país padrão</span><input value={preferences.whatsappCountryCode} onChange={(event) => onPreferencesChange({ whatsappCountryCode: event.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="55"/></label><label className="settings-toggle"><input type="checkbox" checked={preferences.whatsappRegisterActivity} onChange={(event) => onPreferencesChange({ whatsappRegisterActivity: event.target.checked })}/><span><strong>Registrar atividade</strong><small>Cria uma atividade WhatsApp ao abrir/enviar uma conversa pelo CRM.</small></span></label><label className="settings-toggle"><input type="checkbox" checked={preferences.whatsappUseLeadOwnerName} onChange={(event) => onPreferencesChange({ whatsappUseLeadOwnerName: event.target.checked })}/><span><strong>Usar nome do responsável</strong><small>Preenche {'{{owner}}'} com o responsável comercial do contato.</small></span></label></div></section>
        </div> : null}

        {section === 'templates' ? <div className="whatsapp-settings-section-h198">
          <header className="whatsapp-template-heading-h198"><div><span className="eyebrow">Templates</span><h3>Biblioteca de mensagens</h3><p>Templates internos do CRM ficam separados dos templates oficiais aprovados pela Meta.</p></div><Button onClick={newTemplate}><Plus size={16}/> Novo template</Button></header>
          <div className="whatsapp-template-toolbar-h198"><label><Search size={15}/><input value={templateQuery} onChange={(event) => setTemplateQuery(event.target.value)} placeholder="Buscar template..."/></label><NativeSelectionSelect value={controlPreferences.templateFilter} onChange={(event) => saveControlPreferences({ templateFilter: event.target.value as WhatsAppTemplatePurpose | 'all' })}><option value="all">Todas as categorias</option>{Object.entries(purposeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelectionSelect><Button variant="ghost" onClick={() => { setTemplates(resetWhatsAppTemplates(workspaceId)); notify('success', 'Templates restaurados.') }}><RotateCcw size={15}/> Restaurar padrões</Button></div>
          <div className="whatsapp-template-grid-h198">{filteredTemplates.map((template) => <article key={template.id} className={!template.active ? 'is-inactive' : ''}><div className="whatsapp-template-grid-h198__top"><span><strong>{template.name}</strong><small>{purposeLabels[template.purpose]}</small></span><StatusPill tone={template.active ? 'success' : 'neutral'}>{template.active ? 'Ativo' : 'Inativo'}</StatusPill></div><p>{template.body}</p><footer><button type="button" onClick={() => setEditingTemplate({ ...template })}><Pencil size={14}/> Editar</button><button type="button" onClick={() => duplicateTemplate(template)}><Copy size={14}/> Duplicar</button><button type="button" className="is-danger" onClick={() => persistTemplates(templates.filter((item) => item.id !== template.id))}><Trash2 size={14}/> Excluir</button></footer></article>)}</div>
          {!filteredTemplates.length ? <div className="whatsapp-template-empty-h198"><MessageCircle size={28}/><strong>Nenhum template encontrado</strong><span>Ajuste a busca ou a categoria selecionada.</span></div> : null}
          <div className="whatsapp-template-meta-h198"><Save size={14}/><span>Salvamento automático neste workspace/dispositivo. Variáveis: {'{{name}}'}, {'{{company}}'}, {'{{owner}}'}, {'{{stage}}'}, {'{{value}}'}, {'{{proposal}}'}, {'{{date}}'} e {'{{time}}'}.</span></div>
        </div> : null}

        {section === 'team' ? <div className="whatsapp-settings-section-h198">
          <header><span className="eyebrow">Equipe</span><h3>Referência operacional do canal</h3><p>Use as equipes reais do CRM para organizar quem responde pelo WhatsApp. Esta versão define a equipe de referência; distribuição automática de conversas continua fora deste controle.</p></header>
          <section className="whatsapp-setting-card-h198"><div className="whatsapp-setting-card-h198__heading"><span><UsersRound size={20}/></span><div><strong>Equipe de referência</strong><small>Dados carregados do módulo Equipes.</small></div></div><label className="field whatsapp-team-select-h198"><span>Equipe</span><NativeSelectionSelect value={controlPreferences.referenceTeamId} onChange={(event) => saveControlPreferences({ referenceTeamId: event.target.value })}><option value="">Sem equipe definida</option>{activeTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</NativeSelectionSelect></label>{!activeTeams.length ? <div className="integration-note"><UsersRound size={18}/><span><strong>Nenhuma equipe cadastrada.</strong> Crie uma equipe no módulo Equipes para utilizá-la como referência do WhatsApp.</span></div> : selectedTeam ? <div className="whatsapp-team-members-h198"><header><strong>{selectedTeam.name}</strong><span>{selectedTeamMembers.length} membro(s)</span></header>{selectedTeamMembers.length ? selectedTeamMembers.map((member) => <article key={member.userId}><span>{member.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{member.displayName}</strong><small>{member.email}</small></div></article>) : <p>Esta equipe ainda não possui membros vinculados.</p>}</div> : null}</section>
        </div> : null}

        {section === 'diagnostics' ? <div className="whatsapp-settings-section-h198">
          <header className="whatsapp-template-heading-h198"><div><span className="eyebrow">Diagnóstico</span><h3>Saúde da integração</h3><p>Informação técnica fica aqui, longe da conversa do vendedor.</p></div><Button variant="secondary" loading={busy === 'diagnostics'} onClick={() => void refreshDiagnostics()}><RefreshCw size={15}/> Atualizar status</Button></header>
          <div className="whatsapp-diagnostic-grid-h198"><article><span>Gateway</span><strong>{gatewayReady ? 'Online' : 'Offline'}</strong><small>{runtimeStatus?.communications.version || gatewayHealth?.version || 'Aguardando serviço'}</small></article><article><span>Supervisor</span><strong>{runtimeStatus?.communications.supervisorRunning ? 'Ativo' : gatewayReady ? 'Gerenciado' : 'Parado'}</strong><small>{runtimeStatus?.communications.recovering ? 'Recuperando agora' : runtimeStatus?.communications.gatewayRunning ? 'Gateway em execução' : 'Watchdog automático'}</small></article><article><span>QR Local</span><strong>{qrStatus?.state || 'Sem sessão'}</strong><small>{qrStatus?.phone ? `+${qrStatus.phone}` : 'Nenhum telefone reportado'}</small></article><article><span>Cloud API</span><strong>{connectedAccounts.length ? 'Operacional' : 'Sem conta'}</strong><small>{connectedAccounts.length} conta(s) conectada(s)</small></article></div>
          <section className="whatsapp-setting-card-h198"><div className="whatsapp-setting-card-h198__heading"><span><ShieldCheck size={20}/></span><div><strong>Testes e manutenção</strong><small>O runtime monitora o gateway e tenta recuperar automaticamente após falhas consecutivas.</small></div></div><div className="settings-actions">{localGatewayMode?<span className="settings-copy">A recuperação do gateway fica no topo desta página. Aqui você pode apenas consultar o diagnóstico.</span>:null}<Button variant="secondary" disabled={!selectedAccount || !gatewayReady} loading={busy === 'test'} onClick={() => void test()}>Testar Cloud API</Button>{localGatewayMode ? <Button variant="secondary" onClick={() => void startQr()}><QrCode size={15}/> Gerar QR</Button> : null}</div>{localGatewayMode && !gatewayReady ? <div className="integration-note"><Activity size={18}/><span><strong>Communications Gateway indisponível.</strong> O chat continua acessível para histórico; envio e QR voltam quando o serviço estiver online.</span></div> : null}</section>
          <section className="whatsapp-setting-card-h198"><div className="whatsapp-setting-card-h198__heading"><span><Activity size={20}/></span><div><strong>Webhook</strong><small>Recebimento de mensagens oficiais.</small></div></div><p>O gateway expõe <code>/webhooks/whatsapp</code>. Para receber eventos da Meta em uma instalação local, publique esse endpoint por HTTPS com URL estável. O envio oficial pode funcionar sem publicar o webhook.</p></section>
        </div> : null}
      </main>
    </div>

    {editingTemplate ? <div className="whatsapp-template-editor-layer-h198" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditingTemplate(null) }}><section className="whatsapp-template-editor-h198" role="dialog" aria-modal="true" aria-label="Editar template do WhatsApp"><header><div><span className="eyebrow">Template do CRM</span><h3>Editar mensagem</h3></div><button type="button" aria-label="Fechar" onClick={() => setEditingTemplate(null)}><X size={18}/></button></header><div className="whatsapp-template-editor-h198__body"><label className="field"><span>Nome</span><input value={editingTemplate.name} onChange={(event) => setEditingTemplate({ ...editingTemplate, name: event.target.value })}/></label><label className="field"><span>Categoria</span><NativeSelectionSelect value={editingTemplate.purpose} onChange={(event) => setEditingTemplate({ ...editingTemplate, purpose: event.target.value as WhatsAppTemplatePurpose })}>{Object.entries(purposeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelectionSelect></label><label className="field"><span>Mensagem</span><textarea rows={8} value={editingTemplate.body} onChange={(event) => setEditingTemplate({ ...editingTemplate, body: event.target.value })}/></label><label className="settings-toggle"><input type="checkbox" checked={editingTemplate.active} onChange={(event) => setEditingTemplate({ ...editingTemplate, active: event.target.checked })}/><span><strong>Template ativo</strong><small>Templates inativos continuam salvos, mas não devem ser sugeridos para uso.</small></span></label><div className="whatsapp-template-variables-h198"><strong>Variáveis disponíveis</strong><span>{['{{name}}','{{company}}','{{owner}}','{{stage}}','{{value}}','{{proposal}}','{{date}}','{{time}}'].map((item) => <code key={item}>{item}</code>)}</span></div></div><footer><Button variant="ghost" onClick={() => setEditingTemplate(null)}>Cancelar</Button><Button onClick={saveEditingTemplate}><Save size={15}/> Salvar template</Button></footer></section></div> : null}
  </section>
}
