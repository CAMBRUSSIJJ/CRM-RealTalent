import { copyTextToClipboard } from '../../lib/browser-actions'
import {
  AlertTriangle, ArrowDown, ArrowUp, Bell, Building2, CalendarClock, CheckCircle2, Clipboard, Clock3,
  Download, Eye, EyeOff, FileJson, FileText, Gauge, KeyRound, LayoutGrid, Link2, LockKeyhole, Mail, MessageCircle, MonitorSmartphone, MoreHorizontal, Palette, Plus, Sparkles, MapPinned,
  RefreshCw, RotateCcw, Save, Search, Settings, ChevronDown, ChevronUp, ShieldCheck, SlidersHorizontal, Target, Trash2, Upload, UserCog, UserPlus, UserRoundSearch, Users, Workflow, BrainCircuit,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { useApp } from '../../app/app-context'
import { navigationItems } from '../../components/layout/navigation'
import { Button } from '../../components/ui/button'
import { NativeSelectionSelect, SelectionSelect } from '../../components/selection'
import { StatusPill } from '../../components/ui/status-pill'
import { WorkspaceCommandBar, WorkspaceCommandGroup, WorkspacePageHeader } from '../../components/workspace/workspace-shell'
import { formatDateTime } from '../../domain/formatters'
import type { AppRoute, AuditLog, WorkspaceInvite, WorkspaceMember, WorkspaceRole } from '../../domain/types'
import { env, hasSupabaseConfig } from '../../lib/env'
import { APP_VERSION, APP_VERSION_LABEL, BACKUP_SCHEMA_VERSION } from '../../lib/app-version'
import { clearDiagnostics, listDiagnostics } from '../../lib/diagnostics'
import { inspectWorkspaceIntegrity } from '../../services/data-integrity'
import { useAuth } from '../auth/auth-context'
import { applyPreferences, createDefaultPreferences, type CrmPreferences, usePreferences } from './preferences-context'
import { IntegrationCenter } from './integration-center'
import { CalendarIntegrationPanel } from './calendar-integration-panel'
import { WhatsappIntegrationPanel } from './whatsapp-integration-panel'
import { FunctionalAuditPanel } from './functional-audit-panel'
import { RealTalentAiPanel } from './realtalent-ai-panel'
import { useExperience, type ExperiencePreset, type NotificationPreferences } from '../experience/experience-context'
import { PagePersonalizationSettings } from './page-personalization-settings'
import { MapsIntegrationPanel } from './maps-integration-panel'
import { PermissionMatrixPanel } from './permission-matrix-panel'
import { AppearanceSettingsPanel } from './appearance-settings-panel'
import { SETTINGS_GUIDES } from './settings-guides'
import {collapsedGroupsForSettingsTab,type SettingsS3Group} from './settings-s3-navigation'
import {SettingsLiveDiagnostics} from './settings-live-diagnostics'
import { shouldAutoSaveSettings, validateCommercialSettingsDraft } from './settings-automation-policy'
import '../../styles/settings-automation-s1s2.css'
import '../../styles/settings-s3.css'
import '../../styles/settings-s33.css'
import '../../styles/settings-s34.css'
import {SettingsPresetPicker} from './settings-preset-picker'
import {PipelineEditorS331,AuxiliarySettingsListEditor} from './pipeline-editor-s331'
import {COMMERCIAL_FORM_PRESETS,NOTIFICATION_FORM_PRESETS,previewCommercialPreset,commercialPresetChanges,previewNotificationPreset,notificationPresetChanges} from './settings-smart-forms'

const roleLabels: Record<WorkspaceRole, string> = { owner: 'Proprietário', admin: 'Administrador', member: 'Membro', viewer: 'Somente leitura' }
const actionLabels: Record<string, string> = { insert: 'Criou', update: 'Atualizou', delete: 'Excluiu', lead_merged: 'Mesclou duplicados', invite_created: 'Criou convite', invite_revoked: 'Revogou convite', invite_accepted: 'Aceitou convite', member_role_updated: 'Alterou permissão', member_removed: 'Removeu membro' }
const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

type SettingsTab = 'account' | 'appearance' | 'experience' | 'pages' | 'notifications' | 'company' | 'navigation' | 'team' | 'commercial' | 'ai' | 'calendar' | 'whatsapp' | 'integrations' | 'maps' | 'audit' | 'data'
type SettingsGroup = SettingsS3Group
type NotificationToggleKey = 'overdueActivities' | 'upcomingActivities' | 'upcomingEvents' | 'proposalFollowups' | 'staleLeads' | 'goalsAtRisk' | 'automationFailures'

const downloadJson = (name: string, value: unknown) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

const splitList = (value: string) => value.split(/\n|,|;/).map((item) => item.trim()).filter(Boolean)
const joinList = (items: string[]) => items.join('\n')


export function SettingsPage() {
  const app = useApp()
  const auth = useAuth()
  const { preferences, savePreferencesChecked, resetPreferencesChecked } = usePreferences()
  const experience = useExperience()
  const { repositoryMode, health, currentWorkspace, snapshot, importLegacyBackup, restoreWorkspaceBackup, notify, refresh } = app
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => ['notifications', 'calendar', 'whatsapp', 'ai', 'navigation', 'pages', 'appearance', 'experience', 'maps'].includes(String(app.routeContext.filter)) ? app.routeContext.filter as SettingsTab : 'account')
  const [settingsQuery, setSettingsQuery] = useState('')
  const [navigationView,setNavigationView]=useState<'primary'|'secondary'|'hidden'|'all'>('primary')
  const [navigationToolSearch,setNavigationToolSearch]=useState('')
  const [navigationEditing,setNavigationEditing]=useState<string|null>(null)
  const [autoVisual, setAutoVisual] = useState(true)
  const [savePhase, setSavePhase] = useState<'idle'|'saving'|'saved'|'error'>('idle')
  const [saveProblem, setSaveProblem] = useState('')
  const saveBusyRef = useRef(false)
  const [collapsedGroups, setCollapsedGroups] = useState<SettingsGroup[]>(()=>collapsedGroupsForSettingsTab(activeTab))
  const settingsContentRef=useRef<HTMLElement|null>(null)
  const [diagnosticsCollapsed, setDiagnosticsCollapsed] = useState(true)
  const [draft, setDraft] = useState<CrmPreferences>(preferences)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [invites, setInvites] = useState<WorkspaceInvite[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [teamLoading, setTeamLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [localMemberName, setLocalMemberName] = useState('')
  const [localMemberEmail, setLocalMemberEmail] = useState('')
  const [localMemberRole, setLocalMemberRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [profileName, setProfileName] = useState(auth.user?.displayName ?? '')
  const [restoreWarnings, setRestoreWarnings] = useState<string[]>([])
  const [restoring, setRestoring] = useState(false)
  const [dangerText, setDangerText] = useState('')
  const [clearing, setClearing] = useState(false)
  const [diagnostics, setDiagnostics] = useState(() => listDiagnostics())
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  const logoRef = useRef<HTMLInputElement>(null)
  const restoreRef = useRef<HTMLInputElement>(null)
  const canManageTeam = app.can('manage', 'workspace')
  const canWrite = app.can('update', 'settings')
  const dirty = JSON.stringify(draft) !== JSON.stringify(preferences)
  const integrity = useMemo(() => snapshot ? inspectWorkspaceIntegrity(snapshot) : null, [snapshot])

  useEffect(() => setDraft(preferences), [preferences])
  useEffect(() => setProfileName(auth.user?.displayName ?? ''), [auth.user?.displayName])
  useEffect(() => {
    if (activeTab === 'appearance') applyPreferences({ ...preferences, appearance: draft.appearance })
    else applyPreferences(preferences)
  }, [activeTab, draft.appearance, preferences])
  useEffect(() => () => applyPreferences(preferences), [preferences])
  useEffect(() => { if (['notifications', 'calendar', 'whatsapp', 'ai', 'navigation', 'pages', 'appearance', 'experience', 'maps'].includes(String(app.routeContext.filter))) setActiveTab(app.routeContext.filter as SettingsTab) }, [app.routeContext.filter])

  const loadProductionData = async () => {
    if (!currentWorkspace) return
    setTeamLoading(true)
    try {
      const [nextMembers, nextInvites, nextLogs] = await Promise.all([
        app.listWorkspaceMembers(),
        canManageTeam ? app.listWorkspaceInvites() : Promise.resolve([]),
        canManageTeam ? app.listAuditLogs(100) : Promise.resolve([]),
      ])
      setMembers(nextMembers); setInvites(nextInvites); setAuditLogs(nextLogs)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível carregar a equipe.') }
    finally { setTeamLoading(false) }
  }

  useEffect(() => { void loadProductionData() }, [currentWorkspace?.id])

  const checks = useMemo(() => [
    { label: 'Configurações por workspace', ok: true, detail: 'Marca, navegação e regras comerciais persistidas separadamente.' },
    { label: 'Supabase configurado', ok: repositoryMode === 'local' || hasSupabaseConfig, detail: repositoryMode === 'local' ? 'Modo local persistente para testes.' : 'URL e chave publicável identificadas.' },
    { label: 'Conexão com banco', ok: Boolean(health?.connected), detail: health?.message ?? 'Ainda não verificado.' },
    { label: 'Workspace e permissões', ok: Boolean(currentWorkspace), detail: currentWorkspace ? `${currentWorkspace.name} · ${roleLabels[currentWorkspace.role]}` : 'Nenhum workspace selecionado.' },
    { label: 'Pipeline configurado', ok: Boolean(snapshot?.stages.length), detail: `${snapshot?.stages.length ?? 0} etapa(s).` },
    { label: 'Integridade operacional', ok: Boolean(integrity && integrity.errors === 0), detail: integrity ? `${integrity.score}% · ${integrity.errors} erro(s) e ${integrity.warnings} alerta(s).` : 'Aguardando dados.' },
    { label: 'Backup administrativo', ok: Boolean(currentWorkspace), detail: 'Exporta e restaura dados operacionais e preferências do workspace.' },
  ], [currentWorkspace, health, integrity, repositoryMode, snapshot])
  const readiness = Math.round((((checks.filter((check) => check.ok).length / checks.length) * 60) + ((integrity?.score ?? 0) * 0.4)))

  const saveDraft = async (next:CrmPreferences=draft,quiet=false) => {
    if(!canWrite){notify('info','Seu perfil possui acesso somente para leitura.');return}
    const issues=validateCommercialSettingsDraft(next)
    if(issues.length){setSavePhase('error');setSaveProblem(issues.join(' '));if(!quiet)notify('warning',issues[0]);return}
    if(saveBusyRef.current)return
    saveBusyRef.current=true
    setSavePhase('saving')
    setSaveProblem('')
    try{
      await savePreferencesChecked(next)
      setSavePhase('saved')
      if(!quiet)notify('success',repositoryMode==='local'?
        'Preferências salvas neste ambiente local.':'Configurações confirmadas no workspace.')
    }catch(error){
      const reason=error instanceof Error?error.message:'Não foi possível confirmar a sincronização.'
      setSavePhase('error')
      setSaveProblem(reason)
      if(!quiet)notify('error',reason)
    }finally{saveBusyRef.current=false}
  }
  useEffect(()=>{
    if(!dirty||saveBusyRef.current||!shouldAutoSaveSettings(activeTab,autoVisual,canWrite))return
    const timer=window.setTimeout(()=>void saveDraft(draft,true),1100)
    return ()=>window.clearTimeout(timer)
    // saving is deliberately scoped to cosmetic changes, not commercial,
    // access control, integrations, scoring or data destruction.
  },[activeTab,autoVisual,canWrite,dirty,draft])
  const patchDraft = <K extends Exclude<keyof CrmPreferences, 'version'>>(section: K, patch: Partial<CrmPreferences[K]>) => setDraft((current) => ({ ...current, [section]: { ...current[section], ...patch } }))
  const patchLeadScoring = (patch: Partial<CrmPreferences['commercial']['leadScoring']>) => patchDraft('commercial', { leadScoring: { ...draft.commercial.leadScoring, ...patch } })
  const patchLeadScoringWeights = (patch: Partial<CrmPreferences['commercial']['leadScoring']['weights']>) => patchLeadScoring({ weights: { ...draft.commercial.leadScoring.weights, ...patch } })
  const patchLeadScoringThresholds = (patch: Partial<CrmPreferences['commercial']['leadScoring']['thresholds']>) => patchLeadScoring({ thresholds: { ...draft.commercial.leadScoring.thresholds, ...patch } })
  const patchDealIntelligence = (patch: Partial<CrmPreferences['commercial']['dealIntelligence']>) => patchDraft('commercial', { dealIntelligence: { ...draft.commercial.dealIntelligence, ...patch } })
  const patchDealIntelligenceWeights = (patch: Partial<CrmPreferences['commercial']['dealIntelligence']['weights']>) => patchDealIntelligence({ weights: { ...draft.commercial.dealIntelligence.weights, ...patch } })

  const createLocalMember = async () => {
    if (!localMemberName.trim()) { notify('warning', 'Informe o nome do membro.'); return }
    await app.createWorkspaceMember({ displayName: localMemberName, email: localMemberEmail || undefined, role: localMemberRole })
    setLocalMemberName(''); setLocalMemberEmail(''); setLocalMemberRole('member'); await loadProductionData()
  }

  const createInvite = async () => {
    const invite = await app.createWorkspaceInvite(inviteEmail, inviteRole)
    setInviteEmail(''); await loadProductionData()
    const link = `${window.location.origin}${window.location.pathname}?invite=${invite.token}`
    const copied = await copyTextToClipboard(link)
    notify(copied.ok ? 'success' : 'info', copied.ok ? 'Convite criado e link copiado.' : 'Convite criado. O navegador bloqueou a cópia automática do link.')
  }

  const exportBackup = async () => {
    const workspace = await app.exportWorkspace()
    const slug = currentWorkspace?.slug ?? 'workspace'
    downloadJson(`realtalent-${slug}-backup-v${APP_VERSION.replaceAll('.', '-')}-${new Date().toISOString().slice(0, 10)}.json`, { version: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), preferences, workspace })
    notify('success', 'Backup administrativo exportado.')
  }

  const restoreBackup = async (file?: File) => {
    if (!file) return
    setRestoring(true); setRestoreWarnings([])
    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw) as { preferences?: CrmPreferences; workspace?: { snapshot?: unknown }; snapshot?: unknown }
      // Validate/import data FIRST. A failed import must not partially change
      // workspace appearance, scoring or security preferences.
      const result = parsed.workspace?.snapshot || parsed.snapshot ? await restoreWorkspaceBackup(file) : await importLegacyBackup(file)
      let preferencesApplied=false
      let preferenceWarning=''
      if(parsed.preferences){
        try{await savePreferencesChecked(parsed.preferences);preferencesApplied=true}
        catch(error){preferenceWarning=error instanceof Error?error.message:'Falha ao sincronizar preferências.'}
      }
      setRestoreWarnings([...result.warnings,...(preferenceWarning?[preferenceWarning]:[])])
      notify(preferenceWarning?'warning':'success',
        `${result.imported} registro(s) restaurado(s); ${preferenceWarning?'preferências pendentes de sincronização.':preferencesApplied?'preferências confirmadas.':'sem novas preferências.'}`)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível restaurar o backup.') }
    finally { setRestoring(false); if (restoreRef.current) restoreRef.current.value = '' }
  }

  const handleLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { notify('error', 'Selecione uma imagem válida.'); return }
    if (file.size > 1_200_000) { notify('error', 'A logo deve ter no máximo 1,2 MB.'); return }
    const reader = new FileReader()
    reader.onload = () => patchDraft('company', { logoDataUrl: String(reader.result ?? '') })
    reader.readAsDataURL(file)
  }

  const clearWorkspace = async () => {
    if (!snapshot || dangerText !== 'APAGAR') return
    setClearing(true)
    try {
      const result = await app.clearOperationalData()
      setDangerText(''); notify('success', `${result.total} registro(s) operacionais removidos em uma única transação. Workspace, equipe, Pipeline, produtos e configurações foram preservados.`)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível limpar os dados.') }
    finally { setClearing(false) }
  }

  const tabItems: Array<{ id: SettingsTab; label: string; description: string; keywords: string; group: SettingsGroup; icon: typeof UserCog }> = [
    { id: 'account', label: 'Minha conta', description: 'Perfil, acesso e recuperação.', keywords: 'perfil senha conta acesso email usuário', group: 'Minha experiência', icon: UserCog },
    { id: 'appearance', label: 'Aparência', description: 'Tema, cores e densidade da interface.', keywords: 'aparência cor cores tema topbar sidebar fundo página canvas accent personalizado preset', group: 'Minha experiência', icon: Palette },
    { id: 'experience', label: 'Experiência', description: 'Conforto visual e comportamento individual.', keywords: 'experiência preset acessibilidade fonte contraste visual comportamento', group: 'Minha experiência', icon: SlidersHorizontal },
    { id: 'notifications', label: 'Notificações', description: 'Canais, eventos e horários de alerta.', keywords: 'notificações alertas follow-up reunião proposta meta navegador desktop email whatsapp', group: 'Minha experiência', icon: Bell },
    { id: 'company', label: 'Empresa', description: 'Identidade do workspace, marca e fuso.', keywords: 'empresa marca logo cor identidade workspace fuso', group: 'Workspace', icon: Building2 },
    { id: 'navigation', label: 'Navegação', description: 'Sidebar, ordem e visibilidade das ferramentas.', keywords: 'menu abas navegação sidebar ordem ocultar recolhível mais ferramentas principal', group: 'Workspace', icon: LayoutGrid },
    { id: 'pages', label: 'Páginas do workspace', description: 'Blocos, ordem e densidade das páginas.', keywords: 'páginas abas blocos meu dia forecast personalizar visualização ordem esconder', group: 'Workspace', icon: SlidersHorizontal },
    { id: 'team', label: 'Equipe e permissões', description: 'Membros, convites, papéis e autorização.', keywords: 'equipe usuários membros convite permissão função acesso matriz', group: 'Workspace', icon: Users },
    { id: 'commercial', label: 'Pipeline e comercial', description: 'Etapas, SLA, scoring e regras de venda.', keywords: 'pipeline deal intelligence score scoring follow-up etapas comercial forecast sla horários', group: 'Vendas', icon: Target },
    { id: 'calendar', label: 'Agenda externa', description: 'Google Calendar, Microsoft Calendar e sincronização.', keywords: 'google agenda calendar microsoft oauth sincronização eventos follow-up', group: 'Conexões', icon: CalendarClock },
    { id: 'whatsapp', label: 'WhatsApp', description: 'QR Local, Business oficial e templates.', keywords: 'whatsapp business meta mensagens templates deep link comunicação qr', group: 'Conexões', icon: MessageCircle },
    { id: 'integrations', label: 'Integrações', description: 'Contas conectadas, providers e diagnóstico.', keywords: 'integrações google outlook email api oauth whatsapp extensões conexão', group: 'Conexões', icon: Link2 },
    { id: 'maps', label: 'Mapa e território', description: 'Mapas, geocodificação e providers.', keywords: 'mapa território maps google geocoding places openstreetmap api chave localização', group: 'Conexões', icon: MapPinned },
    { id: 'ai', label: 'RealTalent AI', description: 'Contexto, ferramentas e permissões da IA.', keywords: 'ia ai assistant context engine memória tools permissões gateway modelos auditoria', group: 'Inteligência', icon: BrainCircuit },
    { id: 'audit', label: 'Auditoria funcional', description: 'Saúde das capacidades e limitações conhecidas.', keywords: 'auditoria funcional ferramentas funciona parcial implementação status qa diagnóstico', group: 'Administração', icon: Gauge },
    { id: 'data', label: 'Dados e segurança', description: 'Backup, integridade, auditoria e proteção.', keywords: 'backup segurança auditoria dados diagnóstico restaurar exportar retenção', group: 'Administração', icon: ShieldCheck },
  ]
  const settingsGroups: SettingsGroup[] = ['Minha experiência', 'Workspace', 'Vendas', 'Conexões', 'Inteligência', 'Administração']
  const settingsSearchTargets: Array<{ id: string; tab: SettingsTab; label: string; path: string; keywords: string; anchor?: string }> = [
    ...tabItems.map((item) => ({ id: `tab-${item.id}`, tab: item.id, label: item.label, path: item.group, keywords: `${item.description} ${item.keywords}` })),
    { id: 'appearance-colors', tab: 'appearance', label: 'Cores da interface', path: 'Minha experiência › Aparência', keywords: 'cor topbar sidebar canvas fundo card accent preset', anchor: 'settings-appearance' },
    { id: 'notification-channels', tab: 'notifications', label: 'Canais de notificação', path: 'Minha experiência › Notificações', keywords: 'crm navegador desktop email whatsapp canal', anchor: 'settings-notifications-channels' },
    { id: 'notification-events', tab: 'notifications', label: 'Eventos que geram aviso', path: 'Minha experiência › Notificações', keywords: 'follow-up reunião proposta lead meta automação evento', anchor: 'settings-notifications-events' },
    { id: 'notification-schedule', tab: 'notifications', label: 'Frequência e horário silencioso', path: 'Minha experiência › Notificações', keywords: 'frequência tempo real resumo silêncio horário quiet', anchor: 'settings-notifications-schedule' },
    { id: 'navigation-sidebar', tab: 'navigation', label: 'Comportamento da Sidebar', path: 'Workspace › Navegação', keywords: 'sidebar largura expandida compacta marca grupos perfil', anchor: 'settings-navigation-sidebar' },
    { id: 'navigation-tools', tab: 'navigation', label: 'Ordem das ferramentas', path: 'Workspace › Navegação', keywords: 'ordem menu principal mais ferramentas ocultar ferramenta', anchor: 'settings-navigation-tools' },
    { id: 'team-members', tab: 'team', label: 'Membros e convites', path: 'Workspace › Equipe e permissões', keywords: 'membro convite função admin viewer usuário', anchor: 'settings-team-members' },
    { id: 'team-permissions', tab: 'team', label: 'Matriz de permissões', path: 'Workspace › Equipe e permissões', keywords: 'matriz permissões ler criar editar excluir exportar administrar', anchor: 'settings-team-permissions' },
    { id: 'commercial-operation', tab: 'commercial', label: 'SLA e operação comercial', path: 'Vendas › Pipeline e comercial', keywords: 'horários sla primeiro contato follow-up reunião', anchor: 'settings-commercial-operation' },
    { id: 'commercial-scoring', tab: 'commercial', label: 'Lead Score', path: 'Vendas › Pipeline e comercial', keywords: 'lead score prioridade peso perfil comportamento potencial', anchor: 'settings-commercial-scoring' },
    { id: 'commercial-pipeline', tab: 'commercial', label: 'Etapas do Pipeline', path: 'Vendas › Pipeline e comercial', keywords: 'etapas pipeline probabilidade ganha perdida nova etapa', anchor: 'settings-commercial-pipeline' },
    { id: 'integration-accounts', tab: 'integrations', label: 'Contas conectadas', path: 'Conexões › Integrações', keywords: 'google microsoft conta conectar oauth sincronizar', anchor: 'settings-integrations' },
    { id: 'backup', tab: 'data', label: 'Backup e restauração', path: 'Administração › Dados e segurança', keywords: 'backup exportar restaurar importar dados', anchor: 'settings-data-backup' },
    { id: 'security', tab: 'data', label: 'Regras de segurança', path: 'Administração › Dados e segurança', keywords: 'segurança confirmar ações críticas retenção auditoria', anchor: 'settings-data-security' },
  ]
  const normalizedQuery = settingsQuery.trim().toLocaleLowerCase('pt-BR')
  const filteredTabItems = normalizedQuery ? tabItems.filter((item) => `${item.label} ${item.description} ${item.keywords}`.toLocaleLowerCase('pt-BR').includes(normalizedQuery)) : tabItems
  const searchResults = normalizedQuery ? settingsSearchTargets.filter((item) => `${item.label} ${item.path} ${item.keywords}`.toLocaleLowerCase('pt-BR').includes(normalizedQuery)).slice(0, 8) : []
  const activeTabMeta = tabItems.find((item) => item.id === activeTab) ?? tabItems[0]
  const tabGuide = SETTINGS_GUIDES[activeTab]
  const navigationTools=draft.navigation.order.filter(route=>route!=='settings'&&(()=>{
    const item=navigationItems.find(candidate=>candidate.route===route)
    if(!item||!(item.label+' '+(draft.navigation.labels[route]??'')).toLocaleLowerCase('pt-BR').includes(navigationToolSearch.toLocaleLowerCase('pt-BR')))return false
    const visible=draft.navigation.visibleRoutes.includes(route)
    const primary=draft.navigation.primaryRoutes.includes(route)
    return navigationView==='all'||(navigationView==='hidden'&&!visible)||(navigationView==='primary'&&visible&&primary)||(navigationView==='secondary'&&visible&&!primary)
  })())
  useEffect(()=>{
    const group=tabItems.find(item=>item.id===activeTab)?.group
    if(group)setCollapsedGroups(current=>current.includes(group)?current.filter(value=>value!==group):current)
  },[activeTab])
  const visualAutoEligible=activeTab==='appearance'||activeTab==='navigation'
  const statusLabel=savePhase==='saving'?'Salvando…':
    savePhase==='error'?'Não foi possível aplicar':
    dirty?(visualAutoEligible&&autoVisual?'Salvamento visual pendente':'Alterações pendentes'):
    repositoryMode==='local'?'Salvo neste dispositivo':'Configuração aplicada'
  const statusTone=savePhase==='error'?'danger':savePhase==='saving'?'info':dirty?'warning':'success'
  const jumpToSetting = (tab: SettingsTab, anchor?: string) => {
    setActiveTab(tab)
    setSettingsQuery('')
    window.setTimeout(()=>{
      const target=anchor?document.getElementById(anchor):settingsContentRef.current
      target?.scrollIntoView({behavior:'smooth',block:'start'})
    },40)
  }
  const toggleSettingsGroup = (group: SettingsGroup) => setCollapsedGroups((current) => current.includes(group) ? current.filter((item) => item !== group) : [...current, group])

  return <div className="settings-v16 settings-v100682 settings-v1100 settings-page-h20 settings-s3">
    <WorkspacePageHeader className="settings-page-header-h20" eyebrow="Administração do workspace" icon={ShieldCheck} title="Configurações" description="Administre experiência, workspace, vendas e conexões em uma estrutura única e previsível." actions={<>
      <div className="settings-workspace-chip"><small>Workspace</small><strong>{currentWorkspace?.name ?? 'Local'}</strong></div>
      <button className={`settings-health-chip ${integrity?.errors ? 'has-error' : integrity?.warnings ? 'has-warning' : 'is-healthy'}`} type="button" aria-expanded={!diagnosticsCollapsed} onClick={() => setDiagnosticsCollapsed((value) => !value)}><ShieldCheck size={17}/><span><strong>{integrity?.errors ? 'Sistema requer atenção' : 'Sistema saudável'}</strong><small>{integrity ? `${integrity.score}% integridade · ${readiness}% prontidão` : `${readiness}% prontidão`}</small></span>{diagnosticsCollapsed ? <ChevronDown size={16}/> : <ChevronUp size={16}/>}</button>
    </>} />
    <WorkspaceCommandBar className="settings-command-bar-h20">
      <WorkspaceCommandGroup className="settings-search-group-h20">
        <div className="settings-search-shell">
          <label className="settings-search"><Search size={17} /><input value={settingsQuery} onChange={(event) => setSettingsQuery(event.target.value)} placeholder="Buscar configuração: pipeline, sidebar, permissões, backup..." />{settingsQuery ? <button type="button" onClick={() => setSettingsQuery('')} aria-label="Limpar busca">×</button> : null}</label>
          {normalizedQuery ? <div className="settings-search-results" role="listbox" aria-label="Resultados da busca">{searchResults.length ? searchResults.map((result) => <button key={result.id} type="button" onClick={() => jumpToSetting(result.tab, result.anchor)}><Search size={14}/><span><strong>{result.label}</strong><small>{result.path}</small></span></button>) : <div className="settings-search-empty">Nenhuma configuração encontrada. Tente outro termo.</div>}</div> : null}
        </div>
      </WorkspaceCommandGroup>
      <WorkspaceCommandGroup align="end"><StatusPill tone={statusTone}>{statusLabel}</StatusPill></WorkspaceCommandGroup>
    </WorkspaceCommandBar>

    <div className="settings-v1100__body">
      <aside className="settings-v1100__nav panel" aria-label="Seções de configurações">
        <div className="settings-v1100__nav-title"><strong>Explorar seções</strong><small>Selecione uma área</small></div>
        {settingsGroups.map((group) => {
          const items = filteredTabItems.filter((item) => item.group === group)
          if (!items.length) return null
          const collapsed = collapsedGroups.includes(group)
          return <div className="settings-nav-group" key={group}>
            <button className="settings-nav-group__header" type="button" onClick={() => toggleSettingsGroup(group)} aria-expanded={!collapsed}><span>{group}</span><ChevronDown size={14} className={collapsed ? '' : 'is-open'}/></button>
            {!collapsed ? <div className="settings-nav-group__items">{items.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={activeTab === id ? 'is-active' : ''} onClick={() => jumpToSetting(id)} aria-current={activeTab===id?'page':undefined}><Icon size={17}/><span>{label}</span></button>)}</div> : null}
          </div>
        })}
      </aside>

      <main ref={settingsContentRef} className="settings-v1100__content page-stack">
        <section className="settings-section-intro settings-v1100__page-intro">
          <div><span className="settings-s3__eyebrow">{activeTabMeta.group} · {tabGuide.scope}</span>
            <h3>{activeTabMeta.label}</h3><p>{tabGuide.description}</p></div>
          <div className="settings-s3__intro-actions">
            {visualAutoEligible?<label><input type="checkbox" checked={autoVisual}
              onChange={event=>setAutoVisual(event.target.checked)} disabled={!canWrite}/>
              Salvar automaticamente</label>:null}
          </div>
        </section>
        {savePhase==='error'?<div className="settings-save-error" role="alert"><AlertTriangle size={17}/><span>{saveProblem} As alterações continuam na tela; tente salvar novamente.</span><Button variant="secondary" size="sm" disabled={!dirty} onClick={()=>void saveDraft()}>Tentar novamente</Button></div>:null}
        {!diagnosticsCollapsed ? <section className="settings-health-panel panel"><div className="settings-health-panel__heading"><div><span className="eyebrow">Saúde do sistema</span><h3>Diagnóstico do workspace</h3><p>Informações técnicas ficam recolhidas e só aparecem quando você precisar investigar o ambiente.</p></div><Button size="sm" variant="ghost" onClick={() => setDiagnosticsCollapsed(true)}>Fechar</Button></div><div className="settings-health-metrics"><span><small>Integridade</small><strong>{integrity?.score ?? '—'}%</strong></span><span><small>Prontidão</small><strong>{readiness}%</strong></span><span><small>Banco</small><strong>{health?.connected ? 'Online' : repositoryMode === 'local' ? 'Local' : 'Atenção'}</strong></span><span><small>Repositório</small><strong>{repositoryMode}</strong></span></div><details className="settings-health-details"><summary>Ver verificações técnicas</summary><div className="production-checks">{checks.map((check) => <div className="production-check" key={check.label}>{check.ok ? <CheckCircle2 className="text-success" /> : <AlertTriangle className="text-warning" />}<div><strong>{check.label}</strong><small>{check.detail}</small></div></div>)}</div></details><SettingsLiveDiagnostics onNavigate={tab=>jumpToSetting(tab)}/></section> : null}
        {activeTab === 'account' ? <>
          <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Conta</span><h3>Perfil e recuperação</h3></div><KeyRound size={22} /></div>
            <div className="settings-form-grid settings-form-grid--2"><label className="field"><span>Nome exibido</span><input value={profileName} onChange={(event) => setProfileName(event.target.value)} /></label><label className="field"><span>E-mail</span><input value={auth.user?.email ?? 'Modo local'} disabled /></label></div>
            <div className="settings-actions"><Button onClick={async () => { await auth.updateProfile(profileName); notify('success', 'Perfil atualizado.') }}><Save size={17} /> Salvar perfil</Button><Button variant="secondary" onClick={async () => { if (!auth.user?.email) return notify('info', 'A recuperação de senha fica disponível após conectar o Supabase.'); await auth.requestPasswordReset(auth.user.email); notify('success', 'E-mail de recuperação enviado.') }}><KeyRound size={17} /> Trocar senha</Button></div>
          </article>
          <article className="panel settings-compact-link"><div><Palette size={20}/><span><strong>Deseja personalizar a interface?</strong><small>Temas, cores, fontes, densidade e menus estão reunidos em Aparência.</small></span></div><Button variant="secondary" onClick={()=>jumpToSetting('appearance')}>Abrir Aparência</Button>          </article>
        </> : null}

        {activeTab === 'appearance' ? <div id="settings-appearance"><AppearanceSettingsPanel
          value={draft.appearance}
          onChange={(patch) => patchDraft('appearance', patch)}
          onRestoreDefault={() => patchDraft('appearance', createDefaultPreferences(currentWorkspace?.name ?? 'RealTalent').appearance)}
        /></div> : null}

        {activeTab === 'experience' ? <>
          <article className="panel experience-settings-card"><div className="panel__heading"><div><span className="eyebrow">Experiência individual</span><h3>Perfil de trabalho</h3><p>Aplique uma base profissional e refine cada página pelo botão Personalizar visualização.</p></div><Palette size={22} /></div><div className="settings-choice-grid experience-settings-presets">{([['sdr', 'SDR', 'Prospecção e volume'], ['seller', 'Vendedor', 'Carteira e execução'], ['closer', 'Closer', 'Propostas e fechamento'], ['manager', 'Gerente', 'Equipe e forecast'], ['executive', 'Executivo', 'Indicadores e decisões'], ['admin', 'Administrador', 'Configuração completa']] as Array<[ExperiencePreset, string, string]>).map(([id, label, detail]) => <label key={id} className={`settings-choice ${experience.preferences.preset === id ? 'is-active' : ''}`}><input type="radio" name="experience-preset" checked={experience.preferences.preset === id} onChange={() => experience.setPreset(id)} /><strong>{label}</strong><span>{detail}</span></label>)}</div></article>
          <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Leitura e acessibilidade</span><h3>Conforto visual global</h3></div><LayoutGrid size={22} /></div><div className="settings-form-grid settings-form-grid--3"><label className="field"><span>Largura do conteúdo</span><NativeSelectionSelect value={experience.preferences.global.contentWidth} onChange={(event) => experience.updateGlobal({ contentWidth: event.target.value as typeof experience.preferences.global.contentWidth })}><option value="focused">Focada</option><option value="wide">Ampla</option><option value="fluid">Fluida</option></NativeSelectionSelect></label><label className="field"><span>Tamanho da fonte</span><NativeSelectionSelect value={experience.preferences.global.fontScale} onChange={(event) => experience.updateGlobal({ fontScale: event.target.value as typeof experience.preferences.global.fontScale })}><option value="small">Menor</option><option value="medium">Padrão</option><option value="large">Maior</option></NativeSelectionSelect></label><label className="field"><span>Contraste</span><NativeSelectionSelect value={experience.preferences.global.contrast} onChange={(event) => experience.updateGlobal({ contrast: event.target.value as typeof experience.preferences.global.contrast })}><option value="standard">Padrão</option><option value="high">Reforçado</option></NativeSelectionSelect></label><label className="settings-toggle"><input type="checkbox" checked={experience.preferences.global.stickyTopbar} onChange={(event) => experience.updateGlobal({ stickyTopbar: event.target.checked })} /><span><strong>Barra superior fixa</strong><small>Mantém busca e ações disponíveis.</small></span></label><label className="settings-toggle"><input type="checkbox" checked={experience.preferences.global.showPageSubtitle} onChange={(event) => experience.updateGlobal({ showPageSubtitle: event.target.checked })} /><span><strong>Subtítulos das páginas</strong><small>Exibe o contexto da área atual.</small></span></label><label className="settings-toggle"><input type="checkbox" checked={experience.preferences.global.reduceTransparency} onChange={(event) => experience.updateGlobal({ reduceTransparency: event.target.checked })} /><span><strong>Reduzir transparência</strong><small>Melhora a legibilidade de superfícies.</small></span></label></div></article>
          <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Preferências individuais</span><h3>Experiência e alertas separados</h3><p>Os alertas operacionais agora possuem uma área própria para eventos, canais, frequência e horários.</p></div><Bell size={22} /></div><div className="settings-actions"><Button variant="secondary" onClick={() => setActiveTab('pages')}><SlidersHorizontal size={16} /> Personalizar páginas</Button><Button variant="secondary" onClick={() => setActiveTab('notifications')}><Bell size={16} /> Configurar notificações</Button><Button variant="ghost" onClick={experience.resetAll}><RotateCcw size={16} /> Restaurar experiência individual</Button><span className="settings-copy">{experience.syncing ? 'Sincronizando preferências...' : experience.lastSyncedAt ? 'Preferências sincronizadas com seu usuário.' : 'Preferências salvas neste dispositivo.'}</span></div></article>
        </> : null}

        {activeTab === 'pages' ? <PagePersonalizationSettings /> : null}

        {activeTab === 'notifications' ? <>
          <SettingsPresetPicker title="Configurar avisos por perfil" description="Selecione uma rotina e compare as mudanças antes de confirmar. Canais conectados e permissões do navegador são preservados."
            options={NOTIFICATION_FORM_PRESETS} changesFor={id=>notificationPresetChanges(experience.preferences.notifications,id)}
            onApply={id=>experience.updateNotifications(previewNotificationPreset(experience.preferences.notifications,id))}
            applyLabel="Aplicar aos meus avisos" confirmationNote="Ao confirmar, as preferências individuais são salvas pelo sistema. Isso não envia mensagens nem solicita permissão do navegador."/>
          <article id="settings-notifications-channels" className="panel notification-settings-overview settings-step-section" data-step="1"><div className="panel__heading"><div><span className="eyebrow">Entrega</span><h3>Canais de notificação</h3><p>O CRM diferencia canais funcionais de integrações que ainda dependem de conexão externa.</p></div><Bell size={22} /></div>
            <div className="notification-channel-grid">
              <label className={`notification-channel-card ${experience.preferences.notifications.inAppEnabled ? 'is-active' : ''}`}><span><Bell size={19} /></span><div><strong>No CRM</strong><small>Campainha, contador e Central de notificações.</small><StatusPill tone="success">Funcional</StatusPill></div><input type="checkbox" checked={experience.preferences.notifications.inAppEnabled} onChange={(event) => experience.updateNotifications({ inAppEnabled: event.target.checked })} /></label>
              <label className={`notification-channel-card ${experience.preferences.notifications.browserEnabled ? 'is-active' : ''}`}><span><MonitorSmartphone size={19} /></span><div><strong>Navegador / desktop</strong><small>{browserPermission === 'granted' ? 'Permissão concedida neste navegador.' : browserPermission === 'denied' ? 'Permissão bloqueada pelo navegador.' : browserPermission === 'unsupported' ? 'Notification API indisponível.' : 'Requer sua permissão no navegador.'}</small><StatusPill tone={browserPermission === 'granted' ? 'success' : browserPermission === 'denied' || browserPermission === 'unsupported' ? 'danger' : 'warning'}>{browserPermission === 'granted' ? 'Pronto' : browserPermission === 'denied' ? 'Bloqueado' : browserPermission === 'unsupported' ? 'Indisponível' : 'Permissão pendente'}</StatusPill></div><input type="checkbox" disabled={browserPermission === 'denied' || browserPermission === 'unsupported'} checked={experience.preferences.notifications.browserEnabled} onChange={(event) => experience.updateNotifications({ browserEnabled: event.target.checked })} /></label>
              <div className="notification-channel-card is-disabled"><span><Mail size={19} /></span><div><strong>E-mail</strong><small>Será habilitado quando Gmail/Outlook estiver conectado e o backend de entrega estiver validado.</small><StatusPill tone="warning">Depende de integração</StatusPill></div></div>
              <div className="notification-channel-card is-disabled"><span><MessageCircle size={19} /></span><div><strong>WhatsApp</strong><small>Canal de notificação ficará disponível após a conexão oficial do WhatsApp Business.</small><StatusPill tone="warning">Planejado</StatusPill></div></div>
            </div>
            {browserPermission === 'default' ? <div className="settings-actions"><Button variant="secondary" onClick={() => void Notification.requestPermission().then((permission) => { setBrowserPermission(permission); if (permission === 'granted') experience.updateNotifications({ browserEnabled: true }) })}><MonitorSmartphone size={16} /> Permitir avisos no navegador</Button><span className="settings-copy">A permissão é controlada pelo navegador e pode ser revogada nas configurações do site.</span></div> : null}
          </article>

          <article id="settings-notifications-events" className="panel settings-step-section" data-step="2"><div className="panel__heading"><div><span className="eyebrow">Regras</span><h3>O que deve gerar um aviso</h3><p>As mesmas regras alimentam a campainha, a Central e o canal de navegador.</p></div><Target size={22} /></div>
            <details className="settings-advanced-section settings-s33__details"><summary>Escolher quais eventos geram avisos · ${(['overdueActivities','upcomingActivities','upcomingEvents','proposalFollowups','staleLeads','goalsAtRisk','automationFailures'] as NotificationToggleKey[]).filter(key=>Boolean(experience.preferences.notifications[key])).length} ativos</summary>
            <div className="notification-rule-grid">
              {([
                ['overdueActivities', 'Follow-up atrasado', 'Atividades vencidas e ainda não concluídas.', Clock3],
                ['upcomingActivities', 'Próxima atividade', 'Tarefas e follow-ups dentro da janela de antecedência.', CalendarClock],
                ['upcomingEvents', 'Reunião próxima', 'Reuniões e compromissos próximos.', CalendarClock],
                ['proposalFollowups', 'Proposta sem avanço', 'Propostas enviadas/visualizadas sem movimentação pelo período configurado.', FileText],
                ['staleLeads', 'Lead parado', `Negócios ativos sem contato por ${draft.commercial.staleLeadDays} dia(s) ou mais.`, UserRoundSearch],
                ['goalsAtRisk', 'Meta em risco', 'Metas ativas cujo ritmo está abaixo do esperado.', Target],
                ['automationFailures', 'Falha de automação', 'Execuções de automação com erro.', Workflow],
              ] as Array<[NotificationToggleKey, string, string, typeof Bell]>).map(([key, title, detail, Icon]) => <label className="notification-rule-card" key={String(key)}><span><Icon size={18} /></span><div><strong>{String(title)}</strong><small>{String(detail)}</small></div><input type="checkbox" checked={Boolean(experience.preferences.notifications[key as keyof typeof experience.preferences.notifications])} onChange={(event) => experience.updateNotifications({ [key]: event.target.checked } as Partial<NotificationPreferences>)} /></label>)}
              <div className="notification-rule-card is-disabled"><span><SlidersHorizontal size={18} /></span><div><strong>Alteração no Pipeline</strong><small>Será ativada quando o histórico granular de mudança de etapa estiver disponível no snapshot operacional.</small><StatusPill tone="warning">Não simulado</StatusPill></div></div>
            </div></details>
          </article>

          <article id="settings-notifications-schedule" className="panel settings-step-section" data-step="3"><div className="panel__heading"><div><span className="eyebrow">Frequência e silêncio</span><h3>Quando o CRM pode interromper você</h3><p>Essas preferências pessoais são salvas ao editar. O horário silencioso afeta avisos do navegador.</p></div><Clock3 size={22} /></div>
            <details className="settings-advanced-section settings-s33__details"><summary>Personalizar horários e frequência</summary>
            <div className="settings-form-grid settings-form-grid--3">
              <label className="field"><span>Frequência do navegador</span><NativeSelectionSelect value={experience.preferences.notifications.frequency} onChange={(event) => experience.updateNotifications({ frequency: event.target.value as typeof experience.preferences.notifications.frequency })}><option value="realtime">Tempo real</option><option value="hourly">Resumo por hora</option><option value="daily">Resumo diário</option></NativeSelectionSelect></label>
              <label className="field"><span>Janela de atividades/reuniões</span><NativeSelectionSelect value={experience.preferences.notifications.upcomingWindowHours} onChange={(event) => experience.updateNotifications({ upcomingWindowHours: Number(event.target.value) })}><option value="2">2 horas</option><option value="6">6 horas</option><option value="12">12 horas</option><option value="24">24 horas</option><option value="48">48 horas</option><option value="72">3 dias</option></NativeSelectionSelect></label>
              <label className="field"><span>Proposta sem avanço</span><NativeSelectionSelect value={experience.preferences.notifications.proposalSilenceDays} onChange={(event) => experience.updateNotifications({ proposalSilenceDays: Number(event.target.value) })}>{[1,2,3,5,7,10,14].map((days) => <option key={days} value={days}>{days} dia(s)</option>)}</NativeSelectionSelect></label>
              <label className="settings-toggle"><input type="checkbox" checked={experience.preferences.notifications.quietHoursEnabled} onChange={(event) => experience.updateNotifications({ quietHoursEnabled: event.target.checked })} /><span><strong>Horário silencioso</strong><small>Não dispara notificações do navegador neste intervalo.</small></span></label>
              <label className="field"><span>Silenciar a partir de</span><input type="time" disabled={!experience.preferences.notifications.quietHoursEnabled} value={experience.preferences.notifications.quietStart} onChange={(event) => experience.updateNotifications({ quietStart: event.target.value })} /></label>
              <label className="field"><span>Voltar a avisar às</span><input type="time" disabled={!experience.preferences.notifications.quietHoursEnabled} value={experience.preferences.notifications.quietEnd} onChange={(event) => experience.updateNotifications({ quietEnd: event.target.value })} /></label>
            </div>
            <div className="settings-actions">
                <Button variant="secondary" disabled={browserPermission!=='granted'} onClick={()=>{try{new Notification('RealTalent CRM · Teste',{body:'As notificações do navegador estão funcionando neste dispositivo.'})}catch{notify('error','O navegador não permitiu criar a notificação de teste.')}}}><Bell size={16}/> Testar aviso no navegador</Button>
                <span className="settings-copy">{experience.syncing ? 'Sincronizando preferências...' : experience.lastSyncedAt ? 'Preferências de notificação sincronizadas com seu usuário.' : 'Preferências de notificação salvas neste dispositivo.'}</span>
              </div>
            </details>
          </article>
        </> : null}

        {activeTab === 'company' ? <>
          <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Identidade</span><h3>Empresa e marca</h3></div><Building2 size={22} /></div>
            <div className="brand-editor"><button type="button" className="brand-editor__logo" onClick={() => logoRef.current?.click()}>{draft.company.logoDataUrl ? <img src={draft.company.logoDataUrl} alt="Prévia da logo" /> : <Building2 size={28} />}<span>Alterar logo</span></button><input ref={logoRef} hidden type="file" accept="image/*" onChange={handleLogo} /><div className="settings-form-grid settings-form-grid--2"><label className="field"><span>Nome exibido no CRM</span><input value={draft.company.name} onChange={(event) => patchDraft('company', { name: event.target.value })} /></label><label className="field"><span>Fuso horário</span><SelectionSelect value={draft.company.timezone} onValueChange={(value) => patchDraft('company', { timezone: value })} options={[{ value: 'America/Sao_Paulo', label: 'Brasília / São Paulo' }, { value: 'America/Manaus', label: 'Manaus' }, { value: 'America/Rio_Branco', label: 'Rio Branco' }, { value: 'UTC', label: 'UTC' }]} /></label><details className="settings-advanced-section settings-s33__brand-details"><summary>Personalizar cores da marca</summary><div className="settings-s33__brand-colors"><label className="field field--color"><span>Cor de destaque do CRM</span><div><input type="color" value={draft.appearance.accentColor} onChange={(event) => { const color = event.target.value.toUpperCase(); patchDraft('appearance', { colorPreset: 'custom', accentColor: color }); patchDraft('company', { accentColor: color }) }} /><input value={draft.appearance.accentColor} onChange={(event) => { const color = event.target.value.toUpperCase(); if (/^#[0-9A-F]{6}$/.test(color)) { patchDraft('appearance', { colorPreset: 'custom', accentColor: color }); patchDraft('company', { accentColor: color }) } }} /></div><small>Sincronizada com Minha experiência › Aparência.</small></label><label className="field field--color"><span>Cor da barra superior</span><div><input type="color" value={draft.appearance.topbarColor} onChange={(event) => { const color = event.target.value.toUpperCase(); patchDraft('appearance', { colorPreset: 'custom', topbarColor: color }); patchDraft('company', { navigationColor: color }) }} /><input value={draft.appearance.topbarColor} onChange={(event) => { const color = event.target.value.toUpperCase(); if (/^#[0-9A-F]{6}$/.test(color)) { patchDraft('appearance', { colorPreset: 'custom', topbarColor: color }); patchDraft('company', { navigationColor: color }) } }} /></div><small>Usa a mesma fonte de verdade visual da seção Aparência.</small></label></div></details></div></div>
            {draft.company.logoDataUrl ? <Button variant="ghost" onClick={() => patchDraft('company', { logoDataUrl: '' })}><Trash2 size={16} /> Remover logo</Button> : null}
          </article>
          <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Prévia em contexto</span><h3>Como a marca aparece no CRM</h3></div><Palette size={22} /></div>
            <div className="settings-s33__brand-demo" aria-label="Prévia da identidade visual" style={{'--preview-accent':draft.appearance.accentColor,'--preview-nav':draft.appearance.topbarColor} as CSSProperties}>
              <div className="settings-s33__brand-demo-top"><span>RealTalent CRM</span><span>Visão de exemplo</span></div>
              <div className="settings-s33__brand-demo-body">
                <aside><div className="settings-s33__brand-demo-logo">{draft.company.logoDataUrl?<img src={draft.company.logoDataUrl} alt="Logotipo selecionado"/>:<Building2 size={22}/>}<strong>{draft.company.name||'Sua empresa'}</strong></div>
                  <span className="is-selected"><LayoutGrid size={14}/> Meu Dia</span><span><Users size={14}/> Contatos</span><span><Target size={14}/> Pipeline</span>
                </aside>
                <div className="settings-s33__brand-demo-main"><strong>{draft.company.name||'Sua empresa'}</strong><small>As cores e a marca serão aplicadas à interface.</small><span className="settings-s33__brand-demo-button">Botão principal</span></div>
              </div>
            </div>
          </article>
        </> : null}

        {activeTab === 'navigation' ? <article id="settings-navigation-sidebar" className="panel navigation-workspace-editor">
          <div className="panel__heading"><div><span className="eyebrow">Barra lateral</span><h3>Navegação e comportamento da Sidebar</h3><p>Defina largura, modo de abertura, elementos visíveis e a posição de cada ferramenta. O modo automático compacta somente quando o espaço realmente exigir.</p></div><LayoutGrid size={22} /></div>
          <section className="sidebar-studio">
            <details className="sidebar-studio__controls settings-s33__sidebar-controls"><summary>Editar largura e comportamento da sidebar</summary>
              <label className="field"><span>Comportamento</span><SelectionSelect value={draft.appearance.sidebar} onValueChange={(value) => patchDraft('appearance', { sidebar: value as CrmPreferences['appearance']['sidebar'] })} options={[{ value: 'expanded', label: 'Sempre expandida' }, { value: 'compact', label: 'Compacta com expansão ao passar o mouse' }, { value: 'auto', label: 'Automática' }]} /><small>Compacta economiza espaço e revela os nomes ao passar o mouse. Automática compacta apenas quando necessário.</small></label>
              <label className="field"><span>Largura expandida</span><SelectionSelect value={draft.appearance.sidebarWidth} onValueChange={(value) => patchDraft('appearance', { sidebarWidth: value as CrmPreferences['appearance']['sidebarWidth'] })} options={[{ value: 'comfortable', label: 'Confortável · 224 px' }, { value: 'wide', label: 'Ampla · 252 px' }]} /><small>Evita larguras livres que poderiam quebrar páginas e topbar.</small></label>
              <label className="settings-toggle"><input type="checkbox" checked={draft.appearance.sidebarShowBrand} onChange={(event) => patchDraft('appearance', { sidebarShowBrand: event.target.checked })}/><span><strong>Marca e versão</strong><small>Exibe logo, nome do workspace e versão do CRM.</small></span></label>
              <label className="settings-toggle"><input type="checkbox" checked={draft.appearance.sidebarShowGroups} onChange={(event) => patchDraft('appearance', { sidebarShowGroups: event.target.checked })}/><span><strong>Separadores de área</strong><small>Mostra Operação, Estratégia e Sistema.</small></span></label>
              <label className="settings-toggle"><input type="checkbox" checked={draft.appearance.sidebarShowProfile} onChange={(event) => patchDraft('appearance', { sidebarShowProfile: event.target.checked })}/><span><strong>Perfil no rodapé</strong><small>Mostra usuário e acesso rápido às configurações.</small></span></label>
              <label className="settings-toggle"><input type="checkbox" checked={draft.appearance.sidebarOpenSecondary} onChange={(event) => patchDraft('appearance', { sidebarOpenSecondary: event.target.checked })}/><span><strong>Mais ferramentas aberto</strong><small>Inicia o grupo secundário expandido e lembra esta preferência.</small></span></label>
            </details>
            <div className={`sidebar-studio__preview sidebar-studio__preview--${draft.appearance.sidebar === 'compact' ? 'compact' : 'expanded'}`}>
              <div className="sidebar-studio__preview-brand">RT <span>{draft.appearance.sidebarShowBrand ? (draft.company.name || 'RealTalent') : ''}</span></div>
              <div className="sidebar-studio__preview-item is-active"><LayoutGrid size={15}/><span>Meu Dia</span></div>
              <div className="sidebar-studio__preview-item"><Users size={15}/><span>Contatos</span></div>
              <div className="sidebar-studio__preview-item"><MoreHorizontal size={15}/><span>Mais ferramentas</span></div>
              {draft.appearance.sidebarShowProfile ? <div className="sidebar-studio__preview-profile">{(auth.user?.displayName??'U').slice(0,1).toUpperCase()} <span>{auth.user?.displayName??'Usuário'}</span></div> : null}
            </div>
          </section>
          <div id="settings-navigation-tools" className="navigation-editor__subheading"><strong>Ferramentas e posição</strong><span>{draft.navigation.primaryRoutes.filter(route=>draft.navigation.visibleRoutes.includes(route)&&route!=='settings').length} no menu · {draft.navigation.visibleRoutes.filter(route=>!draft.navigation.primaryRoutes.includes(route)&&route!=='settings').length} em Mais ferramentas · {draft.navigation.order.filter(route=>!draft.navigation.visibleRoutes.includes(route)&&route!=='settings').length} ocultas</span></div>
          <div className="settings-s33__nav-toolbar">
            <label><Search size={16}/><input placeholder="Buscar ferramenta…" aria-label="Buscar ferramenta" value={navigationToolSearch} onChange={event=>setNavigationToolSearch(event.target.value)}/></label>
            <div className="settings-s33__nav-views" role="group" aria-label="Filtrar ferramentas por posição">
              {(['primary','secondary','hidden','all'] as const).map(filter=><button key={filter} type="button" aria-pressed={navigationView===filter} className={navigationView===filter?'is-active':''} onClick={()=>setNavigationView(filter)}>{filter==='primary'?'Menu principal':filter==='secondary'?'Mais ferramentas':filter==='hidden'?'Ocultas':'Todas'}</button>)}
            </div>
          </div>
          <div className="navigation-editor navigation-editor--placement">
            {navigationTools.map((route, index, editableOrder) => {
            const item = navigationItems.find((candidate) => candidate.route === route); if (!item) return null
            const visible = draft.navigation.visibleRoutes.includes(route)
            const primary = draft.navigation.primaryRoutes.includes(route)
            return <div className={`navigation-editor__row ${visible ? '' : 'is-hidden'}`} key={route}>
              <span className="navigation-editor__drag">{index + 1}</span><item.icon size={18}/>
              <div className="settings-s33__nav-name"><strong>{draft.navigation.labels[route]??item.label}</strong>
                {navigationEditing===route?<label><span className="sr-only">Novo nome de {item.label}</span><input autoFocus aria-label={`Novo nome de ${item.label}`} value={draft.navigation.labels[route]??item.label} onChange={event=>patchDraft('navigation',{labels:{...draft.navigation.labels,[route]:event.target.value}})}/></label>:null}
                <button type="button" className="settings-s33__rename" onClick={()=>setNavigationEditing(current=>current===route?null:route)}>{navigationEditing===route?'Concluir':'Renomear'}</button>
              </div>
              <button type="button" className={`navigation-placement ${primary ? 'is-primary' : 'is-secondary'}`} disabled={!visible} onClick={() => patchDraft('navigation', { primaryRoutes: primary ? draft.navigation.primaryRoutes.filter((value) => value !== route) : [...draft.navigation.primaryRoutes, route] })}>{primary ? 'Menu principal' : 'Mais ferramentas'}</button>
              <button type="button" className="icon-button" aria-label={visible ? `Ocultar ${item.label}` : `Mostrar ${item.label}`}  onClick={() => patchDraft('navigation', { visibleRoutes: visible ? draft.navigation.visibleRoutes.filter((value) => value !== route) : [...draft.navigation.visibleRoutes, route] })}>{visible ? <Eye size={16}/> : <EyeOff size={16}/>}</button>
              <button type="button" className="icon-button" aria-label="Mover para cima" disabled={index === 0} onClick={() => { const order = [...draft.navigation.order]; const currentIndex = order.indexOf(route); const previousRoute = editableOrder[index - 1]; const previousIndex = order.indexOf(previousRoute); [order[previousIndex], order[currentIndex]] = [order[currentIndex], order[previousIndex]]; patchDraft('navigation', { order }) }}><ArrowUp size={16}/></button>
              <button type="button" className="icon-button" aria-label="Mover para baixo" disabled={index === editableOrder.length - 1} onClick={() => { const order = [...draft.navigation.order]; const currentIndex = order.indexOf(route); const nextRoute = editableOrder[index + 1]; const nextIndex = order.indexOf(nextRoute); [order[nextIndex], order[currentIndex]] = [order[currentIndex], order[nextIndex]]; patchDraft('navigation', { order }) }}><ArrowDown size={16}/></button>
            </div>
          })}
          {!navigationTools.length?<div className="settings-s33__empty">Nenhuma ferramenta nesta visualização. Altere o filtro ou busque por outro nome.</div>:null}
          </div>
          <div className="navigation-fixed-utility-h207h1"><Settings size={16}/><div><strong>Configurações fica fixa no rodapé</strong><span>Essa área administrativa não participa da ordem nem do grupo “Mais ferramentas”.</span></div></div>
          <div className="navigation-placement-legend"><span><i className="is-primary"/>Menu principal</span><span><i className="is-secondary"/>Mais ferramentas</span><span><i className="is-hidden"/>Oculto</span></div>
          <div className="settings-actions"><Button variant="secondary" onClick={() => patchDraft('navigation', { visibleRoutes: navigationItems.map((item) => item.route), order: navigationItems.map((item) => item.route), labels: {}, primaryRoutes: navigationItems.filter((item) => item.priority === 'primary').map((item) => item.route) })}><RotateCcw size={16}/> Restaurar navegação</Button><Button variant="ghost" onClick={() => patchDraft('appearance', { sidebar: 'expanded', sidebarWidth: 'wide', sidebarShowBrand: true, sidebarShowGroups: true, sidebarShowProfile: true, sidebarOpenSecondary: false })}><RotateCcw size={16}/> Restaurar Sidebar</Button></div>
        </article> : null}

        {activeTab === 'team' ? <><article id="settings-team-members" className="panel settings-team-panel"><div className="panel__heading"><div><span className="eyebrow">Equipe</span><h3>Membros e permissões</h3></div><Users size={22} /></div>
          {repositoryMode === 'local' ? <div className="integration-note integration-note--success"><Users size={18} /><span><strong>Equipe local ativa:</strong> você pode cadastrar vendedores para atribuição de contatos, oportunidades, atividades e metas. Esses membros não precisam fazer login.</span></div> : null}
          {canManageTeam && repositoryMode === 'local' ? <div className="invite-form local-team-create-v101106h2"><label className="field"><span>Nome</span><input value={localMemberName} onChange={(event) => setLocalMemberName(event.target.value)} placeholder="João Silva" /></label><label className="field"><span>E-mail</span><input type="email" value={localMemberEmail} onChange={(event) => setLocalMemberEmail(event.target.value)} placeholder="joao@empresa.com (opcional)" /></label><label className="field"><span>Função</span><SelectionSelect value={localMemberRole} onValueChange={(next) => setLocalMemberRole(next as typeof localMemberRole)} options={[{ value: 'member', label: 'Vendedor', description: 'Pode receber contatos e oportunidades' }, { value: 'admin', label: 'Administrador', description: 'Pode administrar o workspace' }, { value: 'viewer', label: 'Somente leitura', description: 'Pode acompanhar sem editar' }]} /></label><Button disabled={!localMemberName.trim()} onClick={() => void createLocalMember()}><UserPlus size={17} /> Adicionar membro</Button></div> : canManageTeam ? <div className="invite-form"><label className="field"><span>E-mail</span><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="vendedor@empresa.com" /></label><label className="field"><span>Permissão</span><SelectionSelect value={inviteRole} onValueChange={(next) => setInviteRole(next as typeof inviteRole)} options={[{ value: 'admin', label: 'Administrador' }, { value: 'member', label: 'Membro' }, { value: 'viewer', label: 'Somente leitura' }]} /></label><Button disabled={!inviteEmail.trim()} onClick={() => void createInvite()}><UserPlus size={17} /> Criar convite</Button></div> : <p className="settings-copy">Somente administradores podem alterar a equipe.</p>}
          <div className="member-list" aria-busy={teamLoading}>{members.map((member) => <div className="member-row" key={member.userId}><div className="member-identity"><span className="avatar avatar--small">{member.displayName.slice(0, 2).toUpperCase()}</span><div><strong>{member.displayName}</strong><small>{member.email}</small></div></div>{canManageTeam && member.role !== 'owner' ? <div className="member-actions"><SelectionSelect ariaLabel={`Permissão de ${member.displayName}`} size="sm" value={member.role} onValueChange={async (next) => { await app.updateWorkspaceMemberRole(member.userId, next as 'admin' | 'member' | 'viewer'); await loadProductionData() }} options={[{ value: 'admin', label: 'Administrador' }, { value: 'member', label: 'Vendedor' }, { value: 'viewer', label: 'Somente leitura' }]} /><button className="icon-button" type="button" aria-label={`Remover ${member.displayName}`} onClick={async () => { if (await app.confirmAction({ title: `Remover ${member.displayName}?`, description: 'A pessoa perderá o acesso a este workspace e aos dados da equipe.', confirmLabel: 'Remover membro', tone: 'danger' })) { await app.removeWorkspaceMember(member.userId); await loadProductionData() } }}><Trash2 size={17} /></button></div> : <StatusPill tone={member.role === 'owner' ? 'success' : 'info'}>{roleLabels[member.role]}</StatusPill>}</div>)}</div>
          {canManageTeam && invites.some((invite) => !invite.acceptedAt && !invite.revokedAt) ? <div className="invite-list"><h4>Convites pendentes</h4>{invites.filter((invite) => !invite.acceptedAt && !invite.revokedAt).map((invite) => { const link = `${window.location.origin}${window.location.pathname}?invite=${invite.token}`; return <div className="member-row" key={invite.id}><div><strong>{invite.email}</strong><small>{roleLabels[invite.role]} · expira {new Date(invite.expiresAt).toLocaleDateString('pt-BR')}</small></div><div className="member-actions"><button className="icon-button" type="button" aria-label="Copiar link" onClick={async () => { const copied = await copyTextToClipboard(link); notify(copied.ok ? 'success' : 'error', copied.ok ? 'Link copiado.' : (copied.reason ?? 'Não foi possível copiar o link.')) }}><Clipboard size={17} /></button><button className="icon-button" type="button" aria-label="Revogar convite" onClick={async () => { await app.revokeWorkspaceInvite(invite.id); await loadProductionData() }}><Trash2 size={17} /></button></div></div> })}</div> : null}
        </article>
          <PermissionMatrixPanel />
        </> : null}

        {activeTab === 'commercial' ? <>
          <SettingsPresetPicker title="Modelos de operação comercial" description="Escolha uma rotina e compare o efeito sobre o SLA e o acompanhamento. Você ainda precisará salvar as alterações."
            options={COMMERCIAL_FORM_PRESETS} changesFor={id=>commercialPresetChanges(draft,id)}
            onApply={id=>setDraft(previewCommercialPreset(draft,id))}
            applyLabel="Preparar alterações" confirmationNote="Os valores entram somente no rascunho. Pesos do scoring, Pipeline e permissões não serão alterados." disabled={!canWrite}/>
          <nav className="settings-subnav" aria-label="Atalhos de Pipeline e comercial"><button type="button" onClick={() => document.getElementById('settings-commercial-operation')?.scrollIntoView({ behavior: 'smooth' })}>Operação</button><button type="button" onClick={() => document.getElementById('settings-commercial-scoring')?.scrollIntoView({ behavior: 'smooth' })}>Inteligência</button><button type="button" onClick={() => document.getElementById('settings-commercial-pipeline')?.scrollIntoView({ behavior: 'smooth' })}>Pipeline</button></nav>
          <article id="settings-commercial-operation" className="panel"><div className="panel__heading"><div><span className="eyebrow">Operação</span><h3>Horários, SLA e regras comerciais</h3></div><CalendarClock size={22} /></div>
          <div className="settings-s33__operation-summary"><span><strong>{draft.commercial.firstContactSlaMinutes} min</strong> Primeiro contato</span><span><strong>{draft.commercial.defaultFollowupDays} dia(s)</strong> Follow-up</span><span><strong>{draft.commercial.proposalFollowupDays} dia(s)</strong> Proposta</span></div>
          <details className="settings-advanced-section settings-s33__details"><summary>Personalizar horários e regras operacionais</summary>
          <div className="business-days">{dayLabels.map((label, day) => <button type="button" key={label} className={draft.commercial.businessDays.includes(day) ? 'is-active' : ''} onClick={() => patchDraft('commercial', { businessDays: draft.commercial.businessDays.includes(day) ? draft.commercial.businessDays.filter((value) => value !== day) : [...draft.commercial.businessDays, day].sort() })}>{label}</button>)}</div><div className="settings-form-grid settings-form-grid--3"><label className="field"><span>Início do expediente</span><input type="time" value={draft.commercial.businessStart} onChange={(event) => patchDraft('commercial', { businessStart: event.target.value })} /></label><label className="field"><span>Fim do expediente</span><input type="time" value={draft.commercial.businessEnd} onChange={(event) => patchDraft('commercial', { businessEnd: event.target.value })} /></label><label className="field"><span>Follow-up padrão</span><input type="number" min="0" max="30" value={draft.commercial.defaultFollowupDays} onChange={(event) => patchDraft('commercial', { defaultFollowupDays: Number(event.target.value) })} /></label><label className="field"><span>SLA do primeiro contato (min)</span><input type="number" min="5" max="1440" value={draft.commercial.firstContactSlaMinutes} onChange={(event) => patchDraft('commercial', { firstContactSlaMinutes: Number(event.target.value) })} /></label><label className="field"><span>Lead parado após (dias)</span><input type="number" min="1" max="90" value={draft.commercial.staleLeadDays} onChange={(event) => patchDraft('commercial', { staleLeadDays: Number(event.target.value) })} /></label><label className="field"><span>Revisar proposta após (dias)</span><input type="number" min="1" max="30" value={draft.commercial.proposalFollowupDays} onChange={(event) => patchDraft('commercial', { proposalFollowupDays: Number(event.target.value) })} /></label><label className="field"><span>Limite de tentativas</span><input type="number" min="1" max="20" value={draft.commercial.maxCallAttempts} onChange={(event) => patchDraft('commercial', { maxCallAttempts: Number(event.target.value) })} /></label><label className="field"><span>Lembrete de reunião</span><NativeSelectionSelect value={draft.commercial.meetingReminderMinutes} onChange={(event) => patchDraft('commercial', { meetingReminderMinutes: Number(event.target.value) })}><option value="10">10 minutos antes</option><option value="30">30 minutos antes</option><option value="60">1 hora antes</option><option value="1440">1 dia antes</option></NativeSelectionSelect></label><label className="field"><span>Prioridade inicial</span><NativeSelectionSelect value={draft.commercial.defaultLeadPriority} onChange={(event) => patchDraft('commercial', { defaultLeadPriority: event.target.value as CrmPreferences['commercial']['defaultLeadPriority'] })}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="urgent">Urgente</option></NativeSelectionSelect></label></div><p className="settings-copy">Esses limites alimentam a fila inteligente do Meu Dia. Toda recomendação mostra o motivo e pode ser ajustada sem alterar o histórico.</p>
          </details></article>
          <article id="settings-commercial-scoring" className="panel lead-score-settings">
            <div className="panel__heading"><div><span className="eyebrow">Inteligência comercial</span><h3>Prioridade e Lead Score</h3><p>Configure como perfil, comportamento e potencial influenciam a fila inteligente.</p></div><Gauge size={22} /></div>
            <div className="lead-score-settings__toggles">
              <label className="settings-toggle"><input type="checkbox" checked={draft.commercial.leadScoring.enabled} onChange={(event) => patchLeadScoring({ enabled: event.target.checked })} /><span><strong>Ativar Lead Score</strong><small>Calcula uma pontuação explicável de 0 a 100 para cada lead ativo.</small></span></label>
              <label className="settings-toggle"><input type="checkbox" checked={draft.commercial.leadScoring.autoReclassify} disabled={!draft.commercial.leadScoring.enabled} onChange={(event) => patchLeadScoring({ autoReclassify: event.target.checked })} /><span><strong>Reclassificar automaticamente</strong><small>Atualiza prioridade e temperatura quando o score muda.</small></span></label>
            </div>
            <details className="settings-advanced-section"><summary>Configurar pesos do Lead Score</summary>
            <div className="lead-score-settings__section"><strong>Peso dos critérios</strong><div className="settings-form-grid settings-form-grid--3">
              <label className="field"><span>Perfil</span><input type="number" min="0" max="100" value={draft.commercial.leadScoring.weights.profile} onChange={(event) => patchLeadScoringWeights({ profile: Number(event.target.value) })} /><small>Dados, ICP, cidade e origem.</small></label>
              <label className="field"><span>Comportamento</span><input type="number" min="0" max="100" value={draft.commercial.leadScoring.weights.behavior} onChange={(event) => patchLeadScoringWeights({ behavior: Number(event.target.value) })} /><small>Respostas, reuniões e atividades.</small></label>
              <label className="field"><span>Potencial</span><input type="number" min="0" max="100" value={draft.commercial.leadScoring.weights.potential} onChange={(event) => patchLeadScoringWeights({ potential: Number(event.target.value) })} /><small>Valor, etapa e previsão de fechamento.</small></label>
            </div></div>
            </details>
            <details className="settings-advanced-section"><summary>Limites de classificação</summary>
            <div className="lead-score-settings__section"><strong>Faixas de classificação</strong><div className="settings-form-grid settings-form-grid--3">
              <label className="field"><span>Prioridade média</span><input type="number" min="1" max="90" value={draft.commercial.leadScoring.thresholds.medium} onChange={(event) => patchLeadScoringThresholds({ medium: Number(event.target.value) })} /></label>
              <label className="field"><span>Prioridade alta</span><input type="number" min="2" max="95" value={draft.commercial.leadScoring.thresholds.high} onChange={(event) => patchLeadScoringThresholds({ high: Number(event.target.value) })} /></label>
              <label className="field"><span>Prioridade crítica</span><input type="number" min="3" max="100" value={draft.commercial.leadScoring.thresholds.urgent} onChange={(event) => patchLeadScoringThresholds({ urgent: Number(event.target.value) })} /></label>
              <label className="field"><span>Temperatura morna</span><input type="number" min="1" max="95" value={draft.commercial.leadScoring.thresholds.warm} onChange={(event) => patchLeadScoringThresholds({ warm: Number(event.target.value) })} /></label>
              <label className="field"><span>Temperatura quente</span><input type="number" min="2" max="100" value={draft.commercial.leadScoring.thresholds.hot} onChange={(event) => patchLeadScoringThresholds({ hot: Number(event.target.value) })} /></label>
              <label className="field"><span>Lead parado após</span><input type="number" min="1" max="180" value={draft.commercial.leadScoring.staleDays} onChange={(event) => patchLeadScoring({ staleDays: Number(event.target.value) })} /><small>Dias sem interação.</small></label>
            </div></div>
            </details>
            <details className="settings-advanced-section"><summary>Perfil ideal e limites financeiros</summary>
            <div className="lead-score-settings__section"><strong>Potencial financeiro e perfil ideal</strong><div className="settings-form-grid settings-form-grid--3">
              <label className="field"><span>Valor relevante</span><input type="number" min="0" step="500" value={draft.commercial.leadScoring.mediumValue} onChange={(event) => patchLeadScoring({ mediumValue: Number(event.target.value) })} /></label>
              <label className="field"><span>Alto valor</span><input type="number" min="0" step="500" value={draft.commercial.leadScoring.highValue} onChange={(event) => patchLeadScoring({ highValue: Number(event.target.value) })} /></label>
              <label className="field"><span>Cidades prioritárias</span><textarea rows={4} value={joinList(draft.commercial.leadScoring.targetCities)} onChange={(event) => patchLeadScoring({ targetCities: splitList(event.target.value) })} placeholder={'Canoas\nPorto Alegre'} /></label>
              <label className="field"><span>Origens preferenciais</span><textarea rows={4} value={joinList(draft.commercial.leadScoring.preferredSources)} onChange={(event) => patchLeadScoring({ preferredSources: splitList(event.target.value) })} /></label>
              <label className="field"><span>Tags do cliente ideal</span><textarea rows={4} value={joinList(draft.commercial.leadScoring.idealTags)} onChange={(event) => patchLeadScoring({ idealTags: splitList(event.target.value) })} /></label>
            </div></div>
            </details>
            <p className="settings-copy">O score é recalculado com os dados atuais e sempre mostra os critérios que aumentaram a prioridade. A reclassificação não altera etapas nem cria atividades.</p>
          </article>
          <article className="panel deal-intelligence-settings">
            <div className="panel__heading"><div><span className="eyebrow">Deal Intelligence</span><h3>Saúde, risco e próxima melhor ação</h3><p>O RealTalent calcula a saúde da oportunidade com regras explicáveis e usa os riscos para priorizar ações.</p></div><Sparkles size={22} /></div>
            <label className="settings-toggle"><input type="checkbox" checked={draft.commercial.dealIntelligence.enabled} onChange={(event) => patchDealIntelligence({ enabled: event.target.checked })} /><span><strong>Ativar Deal Intelligence</strong><small>Exibe Deal Health, momentum, riscos e probabilidade RealTalent no Pipeline, Meu Dia e ficha comercial.</small></span></label>
            <details className="settings-advanced-section"><summary>Configurar pesos da oportunidade</summary>
            <div className="lead-score-settings__section"><strong>Peso dos sinais</strong><div className="settings-form-grid settings-form-grid--3">
              <label className="field"><span>Atividade</span><input type="number" min="0" max="100" value={draft.commercial.dealIntelligence.weights.activity} onChange={(event) => patchDealIntelligenceWeights({ activity: Number(event.target.value) })} /><small>Recência e frequência de interações.</small></label>
              <label className="field"><span>Stakeholders</span><input type="number" min="0" max="100" value={draft.commercial.dealIntelligence.weights.stakeholders} onChange={(event) => patchDealIntelligenceWeights({ stakeholders: Number(event.target.value) })} /><small>Cobertura e força de relacionamento.</small></label>
              <label className="field"><span>Proposta</span><input type="number" min="0" max="100" value={draft.commercial.dealIntelligence.weights.proposal} onChange={(event) => patchDealIntelligenceWeights({ proposal: Number(event.target.value) })} /><small>Status, visualização e validade.</small></label>
              <label className="field"><span>Próximo passo</span><input type="number" min="0" max="100" value={draft.commercial.dealIntelligence.weights.nextStep} onChange={(event) => patchDealIntelligenceWeights({ nextStep: Number(event.target.value) })} /><small>Compromissos e atividades com data.</small></label>
              <label className="field"><span>Timing</span><input type="number" min="0" max="100" value={draft.commercial.dealIntelligence.weights.timing} onChange={(event) => patchDealIntelligenceWeights({ timing: Number(event.target.value) })} /><small>Previsão de fechamento e envelhecimento.</small></label>
              <label className="field"><span>Engajamento</span><input type="number" min="0" max="100" value={draft.commercial.dealIntelligence.weights.engagement} onChange={(event) => patchDealIntelligenceWeights({ engagement: Number(event.target.value) })} /><small>Resultados de chamadas, reuniões e proposta.</small></label>
            </div></div>
            </details>
            <details className="settings-advanced-section"><summary>Limites e alertas comerciais</summary>
            <div className="lead-score-settings__section"><strong>Limites de risco</strong><div className="settings-form-grid settings-form-grid--3">
              <label className="field"><span>Negócio parado após</span><input type="number" min="1" max="90" value={draft.commercial.dealIntelligence.staleDays} onChange={(event) => patchDealIntelligence({ staleDays: Number(event.target.value) })} /><small>Dias sem interação concluída.</small></label>
              <label className="field"><span>Follow-up de proposta</span><input type="number" min="1" max="30" value={draft.commercial.dealIntelligence.proposalFollowupDays} onChange={(event) => patchDealIntelligence({ proposalFollowupDays: Number(event.target.value) })} /><small>Dias após visualização sem retorno.</small></label>
              <label className="field"><span>Fechamento próximo</span><input type="number" min="1" max="30" value={draft.commercial.dealIntelligence.closingSoonDays} onChange={(event) => patchDealIntelligence({ closingSoonDays: Number(event.target.value) })} /><small>Janela usada para elevar risco temporal.</small></label>
              <label className="field"><span>Valor exige decisor</span><input type="number" min="0" step="500" value={draft.commercial.dealIntelligence.highValueThreshold} onChange={(event) => patchDealIntelligence({ highValueThreshold: Number(event.target.value) })} /><small>Acima deste valor, ausência de decisor vira risco alto.</small></label>
              <label className="field"><span>Valor exige multithreading</span><input type="number" min="0" step="500" value={draft.commercial.dealIntelligence.singleThreadThreshold} onChange={(event) => patchDealIntelligence({ singleThreadThreshold: Number(event.target.value) })} /><small>Acima deste valor, depender de um único contato gera alerta.</small></label>
            </div></div>
            </details>
            <p className="settings-copy">A probabilidade RealTalent não substitui a probabilidade do vendedor: ela funciona como contraponto baseado em evidências. Todo score mostra seus componentes e riscos de origem.</p>
          </article>
          <PipelineEditorS331
            stages={snapshot?.stages??[]} leads={snapshot?.leads??[]}
            opportunities={snapshot?.opportunities??[]} rules={snapshot?.automationRules??[]}
            workspaceId={currentWorkspace?.id??''} canWrite={canWrite}
          />
          <article className="panel settings-aux-s331__panel">
            <div className="panel__heading"><div><span className="eyebrow">Cadastros</span><h3>Motivos, etiquetas e atividades</h3>
              <p>Edite cada item diretamente, sem caixas de texto extensas. As alterações são salvas junto às configurações comerciais.</p></div><SlidersHorizontal size={22}/></div>
            <div className="settings-aux-s331__grid">
              <AuxiliarySettingsListEditor title="Motivos de perda" items={draft.commercial.lossReasons}
                disabled={!canWrite} onChange={lossReasons=>patchDraft('commercial',{lossReasons})}/>
              <AuxiliarySettingsListEditor title="Etiquetas padrão" items={draft.commercial.tags}
                disabled={!canWrite} onChange={tags=>patchDraft('commercial',{tags})}/>
              <AuxiliarySettingsListEditor title="Tipos de atividade" items={draft.commercial.activityTypes}
                disabled={!canWrite} onChange={activityTypes=>patchDraft('commercial',{activityTypes})}/>
            </div>
          </article>
        </> : null}

        {activeTab === 'ai' ? <RealTalentAiPanel /> : null}
        {activeTab === 'calendar' ? <CalendarIntegrationPanel /> : null}
        {activeTab === 'whatsapp' ? <WhatsappIntegrationPanel preferences={draft.integrations} onPreferencesChange={(patch) => patchDraft('integrations', patch)} /> : null}
        {activeTab === 'integrations' ? <div id="settings-integrations"><IntegrationCenter preferences={draft.integrations} members={members} onPreferencesChange={(patch) => patchDraft('integrations', patch)} /></div> : null}
        {activeTab === 'maps' ? <MapsIntegrationPanel /> : null}

        {activeTab === 'audit' ? <FunctionalAuditPanel /> : null}

        {activeTab === 'data' ? <>
          <article id="settings-data-backup" className="panel"><div className="panel__heading"><div><span className="eyebrow">Backup</span><h3>Exportação e restauração</h3></div><FileJson size={22} /></div><p className="settings-copy">O pacote da {APP_VERSION_LABEL} inclui preferências, contatos, Account 360 (stakeholders e relações), atividades, ligações, Agenda, playbooks, metas e automações. A restauração valida duplicidades, remapeia etapas e mantém automações importadas desativadas até revisão. Arquivos de áudio não fazem parte do JSON.</p><div className="settings-actions"><Button onClick={() => void exportBackup()}><Download size={17} /> Exportar backup completo</Button><input ref={restoreRef} hidden type="file" accept="application/json,.json" onChange={(event) => void restoreBackup(event.target.files?.[0])} /><Button variant="secondary" loading={restoring} onClick={() => restoreRef.current?.click()}><Upload size={17} /> Restaurar backup</Button><Button variant="secondary" onClick={() => void refresh()}><RefreshCw size={17} /> Verificar dados</Button></div>{restoreWarnings.length ? <div className="warning-box"><strong>Avisos da restauração</strong>{restoreWarnings.slice(0, 10).map((warning) => <span key={warning}>{warning}</span>)}</div> : null}</article>
          <article id="settings-data-security" className="panel"><div className="panel__heading"><div><span className="eyebrow">Proteção</span><h3>Regras administrativas</h3></div><LockKeyhole size={22} /></div><div className="settings-form-grid settings-form-grid--3"><label className="settings-toggle"><input type="checkbox" checked={draft.security.confirmCriticalActions} onChange={(event) => patchDraft('security', { confirmCriticalActions: event.target.checked })} /><span><strong>Confirmar ações críticas</strong><small>Solicita confirmação em exclusões e limpezas.</small></span></label><label className="settings-toggle"><input type="checkbox" checked={draft.security.autoBackupReminder} onChange={(event) => patchDraft('security', { autoBackupReminder: event.target.checked })} /><span><strong>Lembrete de backup</strong><small>Recomenda exportação antes de mudanças grandes.</small></span></label><label className="field"><span>Retenção de auditoria</span><NativeSelectionSelect value={draft.security.auditRetentionDays} onChange={(event) => patchDraft('security', { auditRetentionDays: Number(event.target.value) })}><option value="30">30 dias</option><option value="90">90 dias</option><option value="180">180 dias</option><option value="365">1 ano</option></NativeSelectionSelect></label></div></article>
          <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Diagnóstico operacional local</span><h3>Falhas recentes</h3></div><AlertTriangle size={22} /></div><p className="settings-copy">Registra no próprio navegador erros inesperados e perda de conexão, com referência para suporte. Não envia dados para terceiros.</p><div className="settings-actions"><Button variant="secondary" onClick={() => setDiagnostics(listDiagnostics())}><RefreshCw size={16} /> Atualizar</Button><Button variant="secondary" disabled={!diagnostics.length} onClick={() => downloadJson(`realtalent-diagnostico-${new Date().toISOString().slice(0, 10)}.json`, diagnostics)}><Download size={16} /> Exportar diagnóstico</Button><Button variant="ghost" disabled={!diagnostics.length} onClick={() => { clearDiagnostics(); setDiagnostics([]) }}><Trash2 size={16} /> Limpar</Button></div><div className="audit-list">{diagnostics.length ? diagnostics.slice(0, 10).map((item) => <div className="audit-row" key={item.id}><span><strong>{item.reference}</strong> {item.message} <em>{item.source}</em></span><time>{formatDateTime(item.createdAt)}</time></div>) : <p className="settings-copy">Nenhuma falha operacional registrada neste navegador.</p>}</div></article>
          {canManageTeam ? <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Auditoria</span><h3>Alterações recentes</h3></div><ShieldCheck size={22} /></div><div className="audit-list">{auditLogs.length ? auditLogs.map((log) => <div className="audit-row" key={log.id}><span><strong>{log.userName}</strong> {actionLabels[log.action] ?? log.action} <em>{log.entityType}</em></span><time>{formatDateTime(log.createdAt)}</time></div>) : <p className="settings-copy">Nenhuma alteração auditada ainda.</p>}</div></article> : null}
          {canManageTeam ? <article className="panel danger-zone"><div className="panel__heading"><div><span className="eyebrow">Zona de risco</span><h3>Limpeza e restauração visual</h3></div><Trash2 size={22} /></div><div className="danger-zone__grid"><div><strong>Restaurar configurações</strong><p>Volta tema, marca, navegação e regras comerciais ao padrão do workspace. Os contatos não são alterados.</p><Button variant="secondary" onClick={() => void (async () => { if (await app.confirmAction({ title: 'Restaurar configurações?', description: 'Tema, marca, navegação e regras comerciais voltarão ao padrão. Os leads não serão alterados.', confirmLabel: 'Restaurar padrões', tone: 'warning' })) { await saveDraft(createDefaultPreferences(currentWorkspace?.name??'RealTalent')); } })()}><RotateCcw size={16} /> Restaurar padrões</Button></div><div><strong>Limpar dados operacionais</strong><p>Remove contatos, atividades, ligações, agenda, playbooks, metas e automações. Mantém o workspace, equipe, Pipeline e configurações.</p><label className="field"><span>Digite APAGAR para confirmar</span><input value={dangerText} onChange={(event) => setDangerText(event.target.value)} /></label><Button variant="danger" loading={clearing} disabled={dangerText !== 'APAGAR'} onClick={() => void clearWorkspace()}><Trash2 size={16} /> Limpar dados</Button></div></div></article> : null}
        </> : null}

        {dirty ? <div className="settings-savebar" role="status"><div><strong>{savePhase==='saving'?'Confirmando gravação…':statusLabel}</strong><span>{!canWrite?'Seu perfil possui acesso somente para leitura.':visualAutoEligible&&autoVisual?'Aparência e navegação são salvas após 1,1 s sem novas alterações.':'Revise e confirme antes de atualizar o workspace.'}</span></div><Button variant="secondary" disabled={savePhase==='saving'} onClick={() => {setDraft(preferences);setSaveProblem('');setSavePhase('idle')}}><RotateCcw size={16} /> Descartar</Button><Button disabled={!canWrite||savePhase==='saving'} onClick={()=>void saveDraft()}><Save size={16} /> {savePhase==='saving'?'Salvando…':'Aplicar alterações'}</Button></div> : null}
      </main>

    </div>
  </div>
}
