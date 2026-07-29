import {
  AlertTriangle, ArrowDown, ArrowUp, Building2, CalendarClock, CheckCircle2, Clipboard,
  Download, Eye, EyeOff, FileJson, Gauge, KeyRound, LayoutGrid, Link2, LockKeyhole, Palette, Plus,
  RefreshCw, RotateCcw, Save, ShieldCheck, SlidersHorizontal, Trash2, Upload, UserCog, UserPlus, Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { useApp } from '../../app/app-context'
import { navigationItems } from '../../components/layout/navigation'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { formatDateTime } from '../../domain/formatters'
import type { AppRoute, AuditLog, PipelineStage, WorkspaceInvite, WorkspaceMember, WorkspaceRole } from '../../domain/types'
import { env, hasSupabaseConfig } from '../../lib/env'
import { APP_VERSION, APP_VERSION_LABEL, BACKUP_SCHEMA_VERSION } from '../../lib/app-version'
import { clearDiagnostics, listDiagnostics } from '../../lib/diagnostics'
import { inspectWorkspaceIntegrity } from '../../services/data-integrity'
import { useAuth } from '../auth/auth-context'
import { type CrmPreferences, usePreferences } from './preferences-context'
import { IntegrationCenter } from './integration-center'

const roleLabels: Record<WorkspaceRole, string> = { owner: 'Proprietário', admin: 'Administrador', member: 'Membro', viewer: 'Somente leitura' }
const actionLabels: Record<string, string> = { insert: 'Criou', update: 'Atualizou', delete: 'Excluiu', lead_merged: 'Mesclou duplicados', invite_created: 'Criou convite', invite_revoked: 'Revogou convite', invite_accepted: 'Aceitou convite', member_role_updated: 'Alterou permissão', member_removed: 'Removeu membro' }
const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

type SettingsTab = 'account' | 'company' | 'navigation' | 'team' | 'commercial' | 'integrations' | 'data'

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

function StageRow({ stage }: { stage: PipelineStage }) {
  const app = useApp()
  const [name, setName] = useState(stage.name)
  const [color, setColor] = useState(stage.color)
  const [probability, setProbability] = useState(stage.probability)
  const [kind, setKind] = useState(stage.isWon ? 'won' : stage.isLost ? 'lost' : 'open')

  useEffect(() => {
    setName(stage.name); setColor(stage.color); setProbability(stage.probability); setKind(stage.isWon ? 'won' : stage.isLost ? 'lost' : 'open')
  }, [stage])

  return <div className="settings-stage-row">
    <input aria-label={`Cor de ${stage.name}`} type="color" value={color} onChange={(event) => setColor(event.target.value)} />
    <input aria-label="Nome da etapa" value={name} onChange={(event) => setName(event.target.value)} />
    <label><span>Probabilidade</span><input type="number" min="0" max="100" value={probability} onChange={(event) => setProbability(Number(event.target.value))} /></label>
    <select aria-label="Tipo da etapa" value={kind} onChange={(event) => setKind(event.target.value)}><option value="open">Aberta</option><option value="won">Ganha</option><option value="lost">Perdida</option></select>
    <Button size="sm" variant="secondary" onClick={() => void app.updateStage(stage.id, { name, color, probability: Math.max(0, Math.min(100, probability)), isWon: kind === 'won', isLost: kind === 'lost' })}><Save size={15} /> Salvar</Button>
    <button className="icon-button" type="button" aria-label={`Excluir ${stage.name}`} onClick={() => void (async () => { if (await app.confirmAction({ title: `Excluir a etapa ${stage.name}?`, description: 'A etapa precisa estar sem leads para ser removida do Pipeline.', confirmLabel: 'Excluir etapa', tone: 'danger' })) await app.deleteStage(stage.id) })()}><Trash2 size={16} /></button>
  </div>
}

export function SettingsPage() {
  const app = useApp()
  const auth = useAuth()
  const { preferences, savePreferences, resetPreferences } = usePreferences()
  const { repositoryMode, health, currentWorkspace, snapshot, importLegacyBackup, restoreWorkspaceBackup, notify, refresh } = app
  const [activeTab, setActiveTab] = useState<SettingsTab>('account')
  const [draft, setDraft] = useState<CrmPreferences>(preferences)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [invites, setInvites] = useState<WorkspaceInvite[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [teamLoading, setTeamLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [profileName, setProfileName] = useState(auth.user?.displayName ?? '')
  const [newStageName, setNewStageName] = useState('')
  const [newStageProbability, setNewStageProbability] = useState(10)
  const [restoreWarnings, setRestoreWarnings] = useState<string[]>([])
  const [restoring, setRestoring] = useState(false)
  const [dangerText, setDangerText] = useState('')
  const [clearing, setClearing] = useState(false)
  const [diagnostics, setDiagnostics] = useState(() => listDiagnostics())
  const logoRef = useRef<HTMLInputElement>(null)
  const restoreRef = useRef<HTMLInputElement>(null)
  const canManageTeam = currentWorkspace?.role === 'owner' || currentWorkspace?.role === 'admin'
  const canWrite = currentWorkspace?.role !== 'viewer'
  const dirty = JSON.stringify(draft) !== JSON.stringify(preferences)
  const integrity = useMemo(() => snapshot ? inspectWorkspaceIntegrity(snapshot) : null, [snapshot])

  useEffect(() => setDraft(preferences), [preferences])
  useEffect(() => setProfileName(auth.user?.displayName ?? ''), [auth.user?.displayName])

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

  const saveDraft = () => { if (!canWrite) { notify('info', 'Seu perfil possui acesso somente para leitura.'); return }; savePreferences(draft); notify('success', 'Configurações aplicadas ao workspace.') }
  const patchDraft = <K extends Exclude<keyof CrmPreferences, 'version'>>(section: K, patch: Partial<CrmPreferences[K]>) => setDraft((current) => ({ ...current, [section]: { ...current[section], ...patch } }))
  const patchLeadScoring = (patch: Partial<CrmPreferences['commercial']['leadScoring']>) => patchDraft('commercial', { leadScoring: { ...draft.commercial.leadScoring, ...patch } })
  const patchLeadScoringWeights = (patch: Partial<CrmPreferences['commercial']['leadScoring']['weights']>) => patchLeadScoring({ weights: { ...draft.commercial.leadScoring.weights, ...patch } })
  const patchLeadScoringThresholds = (patch: Partial<CrmPreferences['commercial']['leadScoring']['thresholds']>) => patchLeadScoring({ thresholds: { ...draft.commercial.leadScoring.thresholds, ...patch } })

  const createInvite = async () => {
    const invite = await app.createWorkspaceInvite(inviteEmail, inviteRole)
    setInviteEmail(''); await loadProductionData()
    const link = `${window.location.origin}${window.location.pathname}?invite=${invite.token}`
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link).then(() => notify('success', 'Convite criado e link copiado.')).catch(() => notify('success', 'Convite criado.'))
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
      if (parsed.preferences) savePreferences(parsed.preferences)
      const result = parsed.workspace?.snapshot || parsed.snapshot ? await restoreWorkspaceBackup(file) : await importLegacyBackup(file)
      setRestoreWarnings(result.warnings)
      notify('success', `${result.imported} registro(s) restaurado(s); preferências aplicadas quando disponíveis.`)
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
      for (const rule of snapshot.automationRules) await app.deleteAutomationRule(rule.id)
      for (const goal of snapshot.goals) await app.deleteGoal(goal.id)
      for (const playbook of snapshot.playbooks) await app.deletePlaybook(playbook.id)
      for (const event of snapshot.events) await app.deleteCalendarEvent(event.id)
      for (const call of snapshot.calls) await app.deleteCall(call.id)
      for (const activity of snapshot.activities) await app.deleteActivity(activity.id)
      if (snapshot.leads.length) await app.bulkDeleteLeads(snapshot.leads.map((lead) => lead.id))
      setDangerText(''); notify('success', 'Dados operacionais do workspace removidos. Estrutura e configurações foram preservadas.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível limpar os dados.') }
    finally { setClearing(false) }
  }

  const tabItems: Array<{ id: SettingsTab; label: string; icon: typeof UserCog }> = [
    { id: 'account', label: 'Minha conta', icon: UserCog }, { id: 'company', label: 'Empresa', icon: Building2 },
    { id: 'navigation', label: 'Navegação', icon: LayoutGrid }, { id: 'team', label: 'Equipe', icon: Users },
    { id: 'commercial', label: 'Comercial', icon: SlidersHorizontal }, { id: 'integrations', label: 'Integrações', icon: Link2 },
    { id: 'data', label: 'Dados e segurança', icon: ShieldCheck },
  ]

  return <div className="settings-v16">
    <section className="panel settings-v16__hero">
      <div><span className="eyebrow"><ShieldCheck size={15} /> {APP_VERSION_LABEL} consolidada</span><h2>Configurações, segurança e diagnóstico</h2><p>Personalize a operação, verifique a integridade dos dados e prepare o CRM para produção.</p></div>
      <div className="readiness-score"><strong>{readiness}%</strong><span>prontidão</span></div>
    </section>

    <div className="settings-v16__body">
      <aside className="settings-v16__nav panel" aria-label="Seções de configurações">
        {tabItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={activeTab === id ? 'is-active' : ''} onClick={() => setActiveTab(id)}><Icon size={18} /><span>{label}</span></button>)}
        <div className="settings-v16__nav-status"><StatusPill tone={dirty ? 'warning' : 'success'}>{dirty ? 'Alterações pendentes' : 'Tudo salvo'}</StatusPill></div>
      </aside>

      <main className="settings-v16__content page-stack">
        {activeTab === 'account' ? <>
          <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Conta</span><h3>Perfil e recuperação</h3></div><KeyRound size={22} /></div>
            <div className="settings-form-grid settings-form-grid--2"><label className="field"><span>Nome exibido</span><input value={profileName} onChange={(event) => setProfileName(event.target.value)} /></label><label className="field"><span>E-mail</span><input value={auth.user?.email ?? 'Modo local'} disabled /></label></div>
            <div className="settings-actions"><Button onClick={async () => { await auth.updateProfile(profileName); notify('success', 'Perfil atualizado.') }}><Save size={17} /> Salvar perfil</Button><Button variant="secondary" onClick={async () => { if (!auth.user?.email) return notify('info', 'A recuperação de senha fica disponível após conectar o Supabase.'); await auth.requestPasswordReset(auth.user.email); notify('success', 'E-mail de recuperação enviado.') }}><KeyRound size={17} /> Trocar senha</Button></div>
          </article>
          <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Aparência</span><h3>Tema e densidade</h3></div><Palette size={22} /></div>
            <div className="settings-choice-grid">
              <label className={`settings-choice ${draft.appearance.theme === 'light' ? 'is-active' : ''}`}><input type="radio" name="theme" checked={draft.appearance.theme === 'light'} onChange={() => patchDraft('appearance', { theme: 'light' })} /><strong>Claro</strong><span>Maior contraste em ambientes iluminados.</span></label>
              <label className={`settings-choice ${draft.appearance.theme === 'dark' ? 'is-active' : ''}`}><input type="radio" name="theme" checked={draft.appearance.theme === 'dark'} onChange={() => patchDraft('appearance', { theme: 'dark' })} /><strong>Escuro</strong><span>Interface escura para uso prolongado.</span></label>
              <label className={`settings-choice ${draft.appearance.theme === 'system' ? 'is-active' : ''}`}><input type="radio" name="theme" checked={draft.appearance.theme === 'system'} onChange={() => patchDraft('appearance', { theme: 'system' })} /><strong>Automático</strong><span>Acompanha o tema do dispositivo.</span></label>
            </div>
            <div className="settings-form-grid settings-form-grid--3"><label className="field"><span>Densidade</span><select value={draft.appearance.density} onChange={(event) => patchDraft('appearance', { density: event.target.value as CrmPreferences['appearance']['density'] })}><option value="comfortable">Confortável</option><option value="compact">Compacta</option></select></label><label className="field"><span>Menu lateral</span><select value={draft.appearance.sidebar} onChange={(event) => patchDraft('appearance', { sidebar: event.target.value as CrmPreferences['appearance']['sidebar'] })}><option value="expanded">Expandido</option><option value="compact">Compacto</option></select></label><label className="settings-toggle"><input type="checkbox" checked={draft.appearance.reduceMotion} onChange={(event) => patchDraft('appearance', { reduceMotion: event.target.checked })} /><span><strong>Reduzir animações</strong><small>Remove movimentos não essenciais.</small></span></label></div>
          </article>
        </> : null}

        {activeTab === 'company' ? <>
          <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Identidade</span><h3>Empresa e marca</h3></div><Building2 size={22} /></div>
            <div className="brand-editor"><button type="button" className="brand-editor__logo" onClick={() => logoRef.current?.click()}>{draft.company.logoDataUrl ? <img src={draft.company.logoDataUrl} alt="Prévia da logo" /> : <Building2 size={28} />}<span>Alterar logo</span></button><input ref={logoRef} hidden type="file" accept="image/*" onChange={handleLogo} /><div className="settings-form-grid settings-form-grid--2"><label className="field"><span>Nome exibido no CRM</span><input value={draft.company.name} onChange={(event) => patchDraft('company', { name: event.target.value })} /></label><label className="field"><span>Fuso horário</span><select value={draft.company.timezone} onChange={(event) => patchDraft('company', { timezone: event.target.value })}><option value="America/Sao_Paulo">Brasília / São Paulo</option><option value="America/Manaus">Manaus</option><option value="America/Rio_Branco">Rio Branco</option><option value="UTC">UTC</option></select></label><label className="field field--color"><span>Cor principal</span><div><input type="color" value={draft.company.accentColor} onChange={(event) => patchDraft('company', { accentColor: event.target.value })} /><input value={draft.company.accentColor} onChange={(event) => patchDraft('company', { accentColor: event.target.value })} /></div></label><label className="field field--color"><span>Cor da navegação</span><div><input type="color" value={draft.company.navigationColor} onChange={(event) => patchDraft('company', { navigationColor: event.target.value })} /><input value={draft.company.navigationColor} onChange={(event) => patchDraft('company', { navigationColor: event.target.value })} /></div></label></div></div>
            {draft.company.logoDataUrl ? <Button variant="ghost" onClick={() => patchDraft('company', { logoDataUrl: '' })}><Trash2 size={16} /> Remover logo</Button> : null}
          </article>
          <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Prévia</span><h3>Identidade aplicada</h3></div><Palette size={22} /></div><div className="brand-preview" style={{ '--preview-accent': draft.company.accentColor, '--preview-nav': draft.company.navigationColor } as CSSProperties}><div><span>{draft.company.logoDataUrl ? <img src={draft.company.logoDataUrl} alt="" /> : <Building2 size={20} />}</span><strong>{draft.company.name || 'Nome da empresa'}</strong></div><button>Botão principal</button></div></article>
        </> : null}

        {activeTab === 'navigation' ? <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Experiência</span><h3>Abas visíveis, nomes e ordem</h3></div><LayoutGrid size={22} /></div><p className="settings-copy">Configurações permanece sempre acessível para evitar bloqueio administrativo.</p><div className="navigation-editor">{draft.navigation.order.map((route, index) => { const item = navigationItems.find((candidate) => candidate.route === route); if (!item) return null; const visible = draft.navigation.visibleRoutes.includes(route); return <div className="navigation-editor__row" key={route}><span className="navigation-editor__drag">{index + 1}</span><item.icon size={18} /><input aria-label={`Nome da aba ${item.label}`} value={draft.navigation.labels[route] ?? item.label} onChange={(event) => patchDraft('navigation', { labels: { ...draft.navigation.labels, [route]: event.target.value } })} /><button type="button" className="icon-button" aria-label={visible ? `Ocultar ${item.label}` : `Mostrar ${item.label}`} disabled={route === 'settings'} onClick={() => patchDraft('navigation', { visibleRoutes: visible ? draft.navigation.visibleRoutes.filter((value) => value !== route) : [...draft.navigation.visibleRoutes, route] })}>{visible ? <Eye size={16} /> : <EyeOff size={16} />}</button><button type="button" className="icon-button" aria-label="Mover para cima" disabled={index === 0} onClick={() => { const order = [...draft.navigation.order]; [order[index - 1], order[index]] = [order[index], order[index - 1]]; patchDraft('navigation', { order }) }}><ArrowUp size={16} /></button><button type="button" className="icon-button" aria-label="Mover para baixo" disabled={index === draft.navigation.order.length - 1} onClick={() => { const order = [...draft.navigation.order]; [order[index + 1], order[index]] = [order[index], order[index + 1]]; patchDraft('navigation', { order }) }}><ArrowDown size={16} /></button></div> })}</div><div className="settings-actions"><Button variant="secondary" onClick={() => patchDraft('navigation', { visibleRoutes: navigationItems.map((item) => item.route), order: navigationItems.map((item) => item.route), labels: {} })}><RotateCcw size={16} /> Restaurar navegação</Button></div></article> : null}

        {activeTab === 'team' ? <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Equipe</span><h3>Membros e permissões</h3></div><Users size={22} /></div>
          {repositoryMode === 'local' ? <div className="integration-note"><AlertTriangle size={18} /><span><strong>Simulação local:</strong> os convites geram links para testes, mas não enviam e-mail nem criam usuários reais. A equipe real será ativada quando o Supabase estiver conectado.</span></div> : null}
          {canManageTeam ? <div className="invite-form"><label className="field"><span>E-mail</span><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="vendedor@empresa.com" /></label><label className="field"><span>Permissão</span><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as typeof inviteRole)}><option value="admin">Administrador</option><option value="member">Membro</option><option value="viewer">Somente leitura</option></select></label><Button disabled={!inviteEmail.trim()} onClick={() => void createInvite()}><UserPlus size={17} /> Criar convite</Button></div> : <p className="settings-copy">Somente administradores podem alterar a equipe.</p>}
          <div className="member-list" aria-busy={teamLoading}>{members.map((member) => <div className="member-row" key={member.userId}><div className="member-identity"><span className="avatar avatar--small">{member.displayName.slice(0, 2).toUpperCase()}</span><div><strong>{member.displayName}</strong><small>{member.email}</small></div></div>{canManageTeam && member.role !== 'owner' ? <div className="member-actions"><select aria-label={`Permissão de ${member.displayName}`} value={member.role} onChange={async (event) => { await app.updateWorkspaceMemberRole(member.userId, event.target.value as 'admin' | 'member' | 'viewer'); await loadProductionData() }}><option value="admin">Administrador</option><option value="member">Membro</option><option value="viewer">Somente leitura</option></select><button className="icon-button" type="button" aria-label={`Remover ${member.displayName}`} onClick={async () => { if (await app.confirmAction({ title: `Remover ${member.displayName}?`, description: 'A pessoa perderá o acesso a este workspace e aos dados da equipe.', confirmLabel: 'Remover membro', tone: 'danger' })) { await app.removeWorkspaceMember(member.userId); await loadProductionData() } }}><Trash2 size={17} /></button></div> : <StatusPill tone={member.role === 'owner' ? 'success' : 'info'}>{roleLabels[member.role]}</StatusPill>}</div>)}</div>
          {canManageTeam && invites.some((invite) => !invite.acceptedAt && !invite.revokedAt) ? <div className="invite-list"><h4>Convites pendentes</h4>{invites.filter((invite) => !invite.acceptedAt && !invite.revokedAt).map((invite) => { const link = `${window.location.origin}${window.location.pathname}?invite=${invite.token}`; return <div className="member-row" key={invite.id}><div><strong>{invite.email}</strong><small>{roleLabels[invite.role]} · expira {new Date(invite.expiresAt).toLocaleDateString('pt-BR')}</small></div><div className="member-actions"><button className="icon-button" type="button" aria-label="Copiar link" onClick={() => navigator.clipboard?.writeText(link).then(() => notify('success', 'Link copiado.'))}><Clipboard size={17} /></button><button className="icon-button" type="button" aria-label="Revogar convite" onClick={async () => { await app.revokeWorkspaceInvite(invite.id); await loadProductionData() }}><Trash2 size={17} /></button></div></div> })}</div> : null}
        </article> : null}

        {activeTab === 'commercial' ? <>
          <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Operação</span><h3>Horários, SLA e regras comerciais</h3></div><CalendarClock size={22} /></div><div className="business-days">{dayLabels.map((label, day) => <button type="button" key={label} className={draft.commercial.businessDays.includes(day) ? 'is-active' : ''} onClick={() => patchDraft('commercial', { businessDays: draft.commercial.businessDays.includes(day) ? draft.commercial.businessDays.filter((value) => value !== day) : [...draft.commercial.businessDays, day].sort() })}>{label}</button>)}</div><div className="settings-form-grid settings-form-grid--3"><label className="field"><span>Início do expediente</span><input type="time" value={draft.commercial.businessStart} onChange={(event) => patchDraft('commercial', { businessStart: event.target.value })} /></label><label className="field"><span>Fim do expediente</span><input type="time" value={draft.commercial.businessEnd} onChange={(event) => patchDraft('commercial', { businessEnd: event.target.value })} /></label><label className="field"><span>Follow-up padrão</span><input type="number" min="0" max="30" value={draft.commercial.defaultFollowupDays} onChange={(event) => patchDraft('commercial', { defaultFollowupDays: Number(event.target.value) })} /></label><label className="field"><span>SLA do primeiro contato (min)</span><input type="number" min="5" max="1440" value={draft.commercial.firstContactSlaMinutes} onChange={(event) => patchDraft('commercial', { firstContactSlaMinutes: Number(event.target.value) })} /></label><label className="field"><span>Lead parado após (dias)</span><input type="number" min="1" max="90" value={draft.commercial.staleLeadDays} onChange={(event) => patchDraft('commercial', { staleLeadDays: Number(event.target.value) })} /></label><label className="field"><span>Revisar proposta após (dias)</span><input type="number" min="1" max="30" value={draft.commercial.proposalFollowupDays} onChange={(event) => patchDraft('commercial', { proposalFollowupDays: Number(event.target.value) })} /></label><label className="field"><span>Limite de tentativas</span><input type="number" min="1" max="20" value={draft.commercial.maxCallAttempts} onChange={(event) => patchDraft('commercial', { maxCallAttempts: Number(event.target.value) })} /></label><label className="field"><span>Lembrete de reunião</span><select value={draft.commercial.meetingReminderMinutes} onChange={(event) => patchDraft('commercial', { meetingReminderMinutes: Number(event.target.value) })}><option value="10">10 minutos antes</option><option value="30">30 minutos antes</option><option value="60">1 hora antes</option><option value="1440">1 dia antes</option></select></label><label className="field"><span>Prioridade inicial</span><select value={draft.commercial.defaultLeadPriority} onChange={(event) => patchDraft('commercial', { defaultLeadPriority: event.target.value as CrmPreferences['commercial']['defaultLeadPriority'] })}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label></div><p className="settings-copy">Esses limites alimentam a fila inteligente do Meu Dia. Toda recomendação mostra o motivo e pode ser ajustada sem alterar o histórico.</p></article>
          <article className="panel lead-score-settings">
            <div className="panel__heading"><div><span className="eyebrow">Inteligência comercial</span><h3>Prioridade e Lead Score</h3><p>Configure como perfil, comportamento e potencial influenciam a fila inteligente.</p></div><Gauge size={22} /></div>
            <div className="lead-score-settings__toggles">
              <label className="settings-toggle"><input type="checkbox" checked={draft.commercial.leadScoring.enabled} onChange={(event) => patchLeadScoring({ enabled: event.target.checked })} /><span><strong>Ativar Lead Score</strong><small>Calcula uma pontuação explicável de 0 a 100 para cada lead ativo.</small></span></label>
              <label className="settings-toggle"><input type="checkbox" checked={draft.commercial.leadScoring.autoReclassify} disabled={!draft.commercial.leadScoring.enabled} onChange={(event) => patchLeadScoring({ autoReclassify: event.target.checked })} /><span><strong>Reclassificar automaticamente</strong><small>Atualiza prioridade e temperatura quando o score muda.</small></span></label>
            </div>
            <div className="lead-score-settings__section"><strong>Peso dos critérios</strong><div className="settings-form-grid settings-form-grid--3">
              <label className="field"><span>Perfil</span><input type="number" min="0" max="100" value={draft.commercial.leadScoring.weights.profile} onChange={(event) => patchLeadScoringWeights({ profile: Number(event.target.value) })} /><small>Dados, ICP, cidade e origem.</small></label>
              <label className="field"><span>Comportamento</span><input type="number" min="0" max="100" value={draft.commercial.leadScoring.weights.behavior} onChange={(event) => patchLeadScoringWeights({ behavior: Number(event.target.value) })} /><small>Respostas, reuniões e atividades.</small></label>
              <label className="field"><span>Potencial</span><input type="number" min="0" max="100" value={draft.commercial.leadScoring.weights.potential} onChange={(event) => patchLeadScoringWeights({ potential: Number(event.target.value) })} /><small>Valor, etapa e previsão de fechamento.</small></label>
            </div></div>
            <div className="lead-score-settings__section"><strong>Faixas de classificação</strong><div className="settings-form-grid settings-form-grid--3">
              <label className="field"><span>Prioridade média</span><input type="number" min="1" max="90" value={draft.commercial.leadScoring.thresholds.medium} onChange={(event) => patchLeadScoringThresholds({ medium: Number(event.target.value) })} /></label>
              <label className="field"><span>Prioridade alta</span><input type="number" min="2" max="95" value={draft.commercial.leadScoring.thresholds.high} onChange={(event) => patchLeadScoringThresholds({ high: Number(event.target.value) })} /></label>
              <label className="field"><span>Prioridade crítica</span><input type="number" min="3" max="100" value={draft.commercial.leadScoring.thresholds.urgent} onChange={(event) => patchLeadScoringThresholds({ urgent: Number(event.target.value) })} /></label>
              <label className="field"><span>Temperatura morna</span><input type="number" min="1" max="95" value={draft.commercial.leadScoring.thresholds.warm} onChange={(event) => patchLeadScoringThresholds({ warm: Number(event.target.value) })} /></label>
              <label className="field"><span>Temperatura quente</span><input type="number" min="2" max="100" value={draft.commercial.leadScoring.thresholds.hot} onChange={(event) => patchLeadScoringThresholds({ hot: Number(event.target.value) })} /></label>
              <label className="field"><span>Lead parado após</span><input type="number" min="1" max="180" value={draft.commercial.leadScoring.staleDays} onChange={(event) => patchLeadScoring({ staleDays: Number(event.target.value) })} /><small>Dias sem interação.</small></label>
            </div></div>
            <div className="lead-score-settings__section"><strong>Potencial financeiro e perfil ideal</strong><div className="settings-form-grid settings-form-grid--3">
              <label className="field"><span>Valor relevante</span><input type="number" min="0" step="500" value={draft.commercial.leadScoring.mediumValue} onChange={(event) => patchLeadScoring({ mediumValue: Number(event.target.value) })} /></label>
              <label className="field"><span>Alto valor</span><input type="number" min="0" step="500" value={draft.commercial.leadScoring.highValue} onChange={(event) => patchLeadScoring({ highValue: Number(event.target.value) })} /></label>
              <label className="field"><span>Cidades prioritárias</span><textarea rows={4} value={joinList(draft.commercial.leadScoring.targetCities)} onChange={(event) => patchLeadScoring({ targetCities: splitList(event.target.value) })} placeholder={'Canoas\nPorto Alegre'} /></label>
              <label className="field"><span>Origens preferenciais</span><textarea rows={4} value={joinList(draft.commercial.leadScoring.preferredSources)} onChange={(event) => patchLeadScoring({ preferredSources: splitList(event.target.value) })} /></label>
              <label className="field"><span>Tags do cliente ideal</span><textarea rows={4} value={joinList(draft.commercial.leadScoring.idealTags)} onChange={(event) => patchLeadScoring({ idealTags: splitList(event.target.value) })} /></label>
            </div></div>
            <p className="settings-copy">O score é recalculado com os dados atuais e sempre mostra os critérios que aumentaram a prioridade. A reclassificação não altera etapas nem cria atividades.</p>
          </article>
          <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Pipeline</span><h3>Etapas e probabilidades</h3></div><Gauge size={22} /></div><div className="settings-stage-list">{snapshot?.stages.map((stage) => <StageRow stage={stage} key={stage.id} />)}</div><div className="settings-new-stage"><input value={newStageName} onChange={(event) => setNewStageName(event.target.value)} placeholder="Nome da nova etapa" /><input type="number" min="0" max="100" value={newStageProbability} onChange={(event) => setNewStageProbability(Number(event.target.value))} /><Button disabled={!newStageName.trim()} onClick={async () => { await app.createStage({ name: newStageName, color: '#64748b', probability: newStageProbability, isWon: false, isLost: false }); setNewStageName(''); setNewStageProbability(10) }}><Plus size={16} /> Adicionar etapa</Button></div><label className="settings-toggle"><input type="checkbox" checked={draft.commercial.requireNextActionForActiveLeads} onChange={(event) => patchDraft('commercial', { requireNextActionForActiveLeads: event.target.checked })} /><span><strong>Exigir próxima ação nos negócios ativos</strong><small>Impede avanço no funil sem data e próximo passo. Prazos e critérios detalhados são configurados no menu de cada coluna do Pipeline.</small></span></label></article>
          <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Cadastros</span><h3>Motivos, etiquetas e atividades</h3></div><SlidersHorizontal size={22} /></div><div className="settings-form-grid settings-form-grid--3"><label className="field"><span>Motivos de perda</span><textarea rows={8} value={joinList(draft.commercial.lossReasons)} onChange={(event) => patchDraft('commercial', { lossReasons: splitList(event.target.value) })} /></label><label className="field"><span>Etiquetas padrão</span><textarea rows={8} value={joinList(draft.commercial.tags)} onChange={(event) => patchDraft('commercial', { tags: splitList(event.target.value) })} /></label><label className="field"><span>Tipos de atividade</span><textarea rows={8} value={joinList(draft.commercial.activityTypes)} onChange={(event) => patchDraft('commercial', { activityTypes: splitList(event.target.value) })} /></label></div></article>
        </> : null}

        {activeTab === 'integrations' ? <IntegrationCenter preferences={draft.integrations} members={members} onPreferencesChange={(patch) => patchDraft('integrations', patch)} /> : null}

        {activeTab === 'data' ? <>
          <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Backup</span><h3>Exportação e restauração</h3></div><FileJson size={22} /></div><p className="settings-copy">O pacote da {APP_VERSION_LABEL} inclui preferências, leads, atividades, ligações, Agenda, playbooks, metas e automações. A restauração valida duplicidades, remapeia etapas e mantém automações importadas desativadas até revisão. Arquivos de áudio não fazem parte do JSON.</p><div className="settings-actions"><Button onClick={() => void exportBackup()}><Download size={17} /> Exportar backup completo</Button><input ref={restoreRef} hidden type="file" accept="application/json,.json" onChange={(event) => void restoreBackup(event.target.files?.[0])} /><Button variant="secondary" loading={restoring} onClick={() => restoreRef.current?.click()}><Upload size={17} /> Restaurar backup</Button><Button variant="secondary" onClick={() => void refresh()}><RefreshCw size={17} /> Verificar dados</Button></div>{restoreWarnings.length ? <div className="warning-box"><strong>Avisos da restauração</strong>{restoreWarnings.slice(0, 10).map((warning) => <span key={warning}>{warning}</span>)}</div> : null}</article>
          <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Proteção</span><h3>Regras administrativas</h3></div><LockKeyhole size={22} /></div><div className="settings-form-grid settings-form-grid--3"><label className="settings-toggle"><input type="checkbox" checked={draft.security.confirmCriticalActions} onChange={(event) => patchDraft('security', { confirmCriticalActions: event.target.checked })} /><span><strong>Confirmar ações críticas</strong><small>Solicita confirmação em exclusões e limpezas.</small></span></label><label className="settings-toggle"><input type="checkbox" checked={draft.security.autoBackupReminder} onChange={(event) => patchDraft('security', { autoBackupReminder: event.target.checked })} /><span><strong>Lembrete de backup</strong><small>Recomenda exportação antes de mudanças grandes.</small></span></label><label className="field"><span>Retenção de auditoria</span><select value={draft.security.auditRetentionDays} onChange={(event) => patchDraft('security', { auditRetentionDays: Number(event.target.value) })}><option value="30">30 dias</option><option value="90">90 dias</option><option value="180">180 dias</option><option value="365">1 ano</option></select></label></div></article>
          <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Diagnóstico operacional local</span><h3>Falhas recentes</h3></div><AlertTriangle size={22} /></div><p className="settings-copy">Registra no próprio navegador erros inesperados e perda de conexão, com referência para suporte. Não envia dados para terceiros.</p><div className="settings-actions"><Button variant="secondary" onClick={() => setDiagnostics(listDiagnostics())}><RefreshCw size={16} /> Atualizar</Button><Button variant="secondary" disabled={!diagnostics.length} onClick={() => downloadJson(`realtalent-diagnostico-${new Date().toISOString().slice(0, 10)}.json`, diagnostics)}><Download size={16} /> Exportar diagnóstico</Button><Button variant="ghost" disabled={!diagnostics.length} onClick={() => { clearDiagnostics(); setDiagnostics([]) }}><Trash2 size={16} /> Limpar</Button></div><div className="audit-list">{diagnostics.length ? diagnostics.slice(0, 10).map((item) => <div className="audit-row" key={item.id}><span><strong>{item.reference}</strong> {item.message} <em>{item.source}</em></span><time>{formatDateTime(item.createdAt)}</time></div>) : <p className="settings-copy">Nenhuma falha operacional registrada neste navegador.</p>}</div></article>
          {canManageTeam ? <article className="panel"><div className="panel__heading"><div><span className="eyebrow">Auditoria</span><h3>Alterações recentes</h3></div><ShieldCheck size={22} /></div><div className="audit-list">{auditLogs.length ? auditLogs.map((log) => <div className="audit-row" key={log.id}><span><strong>{log.userName}</strong> {actionLabels[log.action] ?? log.action} <em>{log.entityType}</em></span><time>{formatDateTime(log.createdAt)}</time></div>) : <p className="settings-copy">Nenhuma alteração auditada ainda.</p>}</div></article> : null}
          {canManageTeam ? <article className="panel danger-zone"><div className="panel__heading"><div><span className="eyebrow">Zona de risco</span><h3>Limpeza e restauração visual</h3></div><Trash2 size={22} /></div><div className="danger-zone__grid"><div><strong>Restaurar configurações</strong><p>Volta tema, marca, navegação e regras comerciais ao padrão do workspace. Os leads não são alterados.</p><Button variant="secondary" onClick={() => void (async () => { if (await app.confirmAction({ title: 'Restaurar configurações?', description: 'Tema, marca, navegação e regras comerciais voltarão ao padrão. Os leads não serão alterados.', confirmLabel: 'Restaurar padrões', tone: 'warning' })) { resetPreferences(); notify('success', 'Configurações restauradas.') } })()}><RotateCcw size={16} /> Restaurar padrões</Button></div><div><strong>Limpar dados operacionais</strong><p>Remove leads, atividades, ligações, agenda, playbooks, metas e automações. Mantém o workspace, equipe, Pipeline e configurações.</p><label className="field"><span>Digite APAGAR para confirmar</span><input value={dangerText} onChange={(event) => setDangerText(event.target.value)} /></label><Button variant="danger" loading={clearing} disabled={dangerText !== 'APAGAR'} onClick={() => void clearWorkspace()}><Trash2 size={16} /> Limpar dados</Button></div></div></article> : null}
        </> : null}

        {dirty ? <div className="settings-savebar"><div><strong>Existem alterações não aplicadas</strong><span>{canWrite ? 'Revise e salve para atualizar o CRM.' : 'Seu perfil pode consultar, mas não alterar o workspace.'}</span></div><Button variant="secondary" onClick={() => setDraft(preferences)}><RotateCcw size={16} /> Descartar</Button><Button disabled={!canWrite} onClick={saveDraft}><Save size={16} /> Aplicar configurações</Button></div> : null}
      </main>

      <aside className="settings-v16__aside">
        <article className="panel diagnostic-card"><h3>Prontidão para produção</h3><div className="production-checks">{checks.map((check) => <div className="production-check" key={check.label}>{check.ok ? <CheckCircle2 className="text-success" /> : <AlertTriangle className="text-warning" />}<div><strong>{check.label}</strong><small>{check.detail}</small></div></div>)}</div></article>
        <article className="panel diagnostic-card"><div className="panel__heading"><div><span className="eyebrow">Diagnóstico {APP_VERSION_LABEL}</span><h3>Integridade dos dados</h3></div>{integrity ? <StatusPill tone={integrity.errors ? 'danger' : integrity.warnings ? 'warning' : 'success'}>{integrity.score}%</StatusPill> : null}</div>{integrity?.issues.length ? <div className="production-checks">{integrity.issues.slice(0, 6).map((issue) => <div className="production-check" key={issue.code}>{issue.severity === 'error' ? <AlertTriangle className="text-danger" /> : issue.severity === 'warning' ? <AlertTriangle className="text-warning" /> : <Eye className="text-muted" />}<div><strong>{issue.label}</strong><small>{issue.detail}</small></div></div>)}</div> : <div className="production-check"><CheckCircle2 className="text-success" /><div><strong>Base consistente</strong><small>Nenhuma referência quebrada, data inválida ou conflito crítico identificado.</small></div></div>}</article>
        <article className="panel diagnostic-card"><h3>Ambiente</h3><dl className="detail-list"><div><dt>Versão</dt><dd>{APP_VERSION_LABEL}</dd></div><div><dt>Repositório</dt><dd>{repositoryMode}</dd></div><div><dt>Supabase</dt><dd>{hasSupabaseConfig ? 'configurado' : 'não configurado'}</dd></div><div><dt>Última verificação</dt><dd>{formatDateTime(health?.checkedAt ?? null)}</dd></div><div><dt>Leads</dt><dd>{snapshot?.leads.length ?? 0}</dd></div><div><dt>Atividades</dt><dd>{snapshot?.activities.length ?? 0}</dd></div><div><dt>Automações</dt><dd>{snapshot?.automationRules.length ?? 0}</dd></div></dl><div className="config-list"><div><code>VITE_DATA_MODE</code><span>{env.dataMode}</span></div><div><code>VITE_SUPABASE_URL</code><span>{hasSupabaseConfig ? 'configurada' : 'não configurada'}</span></div></div></article>
      </aside>
    </div>
  </div>
}
