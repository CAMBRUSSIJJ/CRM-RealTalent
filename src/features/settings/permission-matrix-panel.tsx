import { ShieldCheck } from 'lucide-react'
import { useMemo } from 'react'
import { useAppWorkspace } from '../../app/app-context'
import { StatusPill } from '../../components/ui/status-pill'
import { inspectPermissions } from '../../platform/permissions'

const labels: Record<string, string> = {
  lead: 'Registro comercial', contact: 'Pessoa', company: 'Empresa', opportunity: 'Oportunidade', activity: 'Atividade', call: 'Ligação', calendar: 'Agenda',
  playbook: 'Playbook', product: 'Produto', proposal: 'Proposta', revenue: 'Receita', goal: 'Meta', automation: 'Automação', integration: 'Integração', workspace: 'Workspace', settings: 'Configurações', audit: 'Auditoria',
}
const actionLabels: Record<string, string> = { read: 'Ler', create: 'Criar', update: 'Editar', delete: 'Excluir', export: 'Exportar', manage: 'Administrar', execute: 'Executar', share: 'Compartilhar', configure: 'Configurar' }
const roleLabels = { owner: 'Proprietário', admin: 'Administrador', member: 'Membro', viewer: 'Somente leitura' } as const
const primaryActions = ['read', 'create', 'update', 'delete', 'manage'] as const
const advancedActions = ['export', 'execute', 'share', 'configure'] as const

export function PermissionMatrixPanel() {
  const { currentWorkspace } = useAppWorkspace()
  const inspection = useMemo(() => currentWorkspace ? inspectPermissions(currentWorkspace.role, currentWorkspace.id) : null, [currentWorkspace])
  if (!inspection || !currentWorkspace) return null

  return <section id="settings-team-permissions" className="panel permission-matrix-v10196 permission-matrix-v1100">
    <div className="panel__heading"><div><span className="eyebrow">Permissões efetivas</span><h3>O que este perfil pode fazer</h3><p>A matriz mostra primeiro as ações do dia a dia. Scopes e permissões avançadas ficam recolhidos para reduzir ruído.</p></div><div className="permission-matrix-v1100__role"><small>Perfil atual</small><StatusPill tone={currentWorkspace.role === 'owner' || currentWorkspace.role === 'admin' ? 'info' : 'neutral'}>{roleLabels[currentWorkspace.role]}</StatusPill></div></div>

    <div className="permission-matrix-v1100__table" role="table" aria-label="Permissões principais">
      <div className="permission-matrix-v1100__table-row is-header" role="row"><strong>Recurso</strong>{primaryActions.map((action) => <span key={action}>{actionLabels[action]}</span>)}</div>
      {inspection.permissions.map((item) => <div className="permission-matrix-v1100__table-row" role="row" key={item.resource}><strong>{labels[item.resource] ?? item.resource}</strong>{primaryActions.map((action) => <span key={action} className={item.actions.includes(action) ? 'is-allowed' : 'is-denied'} aria-label={`${actionLabels[action]}: ${item.actions.includes(action) ? 'permitido' : 'não permitido'}`}>{item.actions.includes(action) ? '✓' : '—'}</span>)}</div>)}
    </div>

    <details className="settings-advanced-disclosure"><summary>Ver permissões avançadas</summary><div className="permission-matrix-v1100__advanced">{inspection.permissions.map((item) => { const actions = advancedActions.filter((action) => item.actions.includes(action)); return <div key={item.resource}><strong>{labels[item.resource] ?? item.resource}</strong><span>{actions.length ? actions.map((action) => <StatusPill key={action} tone="info">{actionLabels[action]}</StatusPill>) : <StatusPill tone="neutral">Nenhuma ação avançada</StatusPill>}</span></div> })}</div></details>
    <div className="integration-note"><ShieldCheck size={17}/><span><strong>Campos estruturais protegidos:</strong> IDs, workspace e timestamps não podem ser alterados pela interface, inclusive por administradores.</span></div>
  </section>
}
