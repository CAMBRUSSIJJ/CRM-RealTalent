import type { PermissionResource, PermissionRule } from './types'

const memberOperationalResources: PermissionResource[] = [
  'lead', 'contact', 'company', 'opportunity', 'activity', 'call', 'calendar', 'playbook', 'product', 'proposal', 'revenue', 'goal', 'automation',
]

const memberMutationRules: PermissionRule[] = memberOperationalResources.flatMap((resource) => ([
  { id: `member-${resource}-create`, roles: ['member'], action: 'create', resource, effect: 'allow', reason: 'Membros podem criar registros operacionais.', priority: 30 },
  { id: `member-${resource}-update`, roles: ['member'], action: 'update', resource, effect: 'allow', reason: 'Membros podem atualizar registros operacionais.', priority: 30 },
  { id: `member-${resource}-delete`, roles: ['member'], action: 'delete', resource, effect: 'allow', reason: 'Membros podem remover registros operacionais.', priority: 30 },
]))

const rules: PermissionRule[] = [
  { id: 'owner-all', roles: ['owner'], action: '*', resource: '*', effect: 'allow', reason: 'O proprietário possui controle total do workspace.', priority: 100 },
  { id: 'admin-all', roles: ['admin'], action: '*', resource: '*', effect: 'allow', reason: 'Administradores operam e configuram o workspace.', priority: 90 },
  { id: 'member-commercial-read', roles: ['member'], action: 'read', resource: '*', effect: 'allow', reason: 'Membros podem consultar os dados operacionais do workspace.', priority: 30 },
  ...memberMutationRules,
  { id: 'member-settings-update', roles: ['member'], action: 'update', resource: 'settings', effect: 'allow', reason: 'Membros podem ajustar preferências operacionais disponíveis.', priority: 45 },
  { id: 'member-automation-execute', roles: ['member'], action: 'execute', resource: 'automation', effect: 'allow', reason: 'Membros podem executar automações autorizadas.', priority: 45 },
  { id: 'member-settings-read', roles: ['member'], action: 'read', resource: 'settings', effect: 'allow', reason: 'Membros podem consultar configurações.', priority: 45 },
  { id: 'member-admin-deny', roles: ['member'], action: '*', resource: 'workspace', effect: 'deny', reason: 'Gestão de equipe e operações administrativas exigem administrador.', priority: 80 },
  { id: 'member-audit-deny', roles: ['member'], action: '*', resource: 'audit', effect: 'deny', reason: 'Auditoria administrativa exige administrador.', priority: 80 },
  { id: 'member-integrations-manage-deny', roles: ['member'], action: 'manage', resource: 'integration', effect: 'deny', reason: 'Conectar, revogar e reconfigurar integrações exige administrador.', priority: 80 },
  { id: 'member-integrations-configure-deny', roles: ['member'], action: 'configure', resource: 'integration', effect: 'deny', reason: 'Alterar escopos de integrações exige administrador.', priority: 80 },
  { id: 'member-integrations-use', roles: ['member'], action: 'execute', resource: 'integration', effect: 'allow', reason: 'Membros podem usar integrações compartilhadas autorizadas.', priority: 50 },
  { id: 'viewer-read', roles: ['viewer'], action: 'read', resource: '*', effect: 'allow', reason: 'O perfil somente leitura pode consultar dados.', priority: 75 },
  { id: 'viewer-mutation-deny', roles: ['viewer'], action: '*', resource: '*', effect: 'deny', reason: 'O perfil somente leitura não pode alterar dados.', priority: 70 },
  { id: 'system-fields-write-deny', roles: ['owner', 'admin', 'member', 'viewer'], action: 'update', resource: '*', fields: ['id', 'workspaceId', 'createdAt', 'updatedAt'], effect: 'deny', reason: 'Campos estruturais são gerenciados pelo sistema.', priority: 120 },
]

export const permissionRegistry = Object.freeze({
  list: () => [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
})
