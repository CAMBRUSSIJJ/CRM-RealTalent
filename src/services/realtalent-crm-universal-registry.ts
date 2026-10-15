import type { CrmCapabilityDefinition } from './realtalent-crm-capabilities'
import { UNIVERSAL_CRM_CAPABILITIES } from './realtalent-crm-universal-capabilities'

export const UNIVERSAL_ADMIN_CAPABILITIES: CrmCapabilityDefinition[] = [
  { id: 'teams.create_member', module: 'teams', title: 'Criar membro do workspace', description: 'Cria diretamente um membro no workspace quando a política administrativa permitir.', action: 'create', risk: 'high', execution: 'native', reversible: false, resource: 'settings', permissionAction: 'edit', argumentHints: ['display_name', 'email', 'role'] },
  { id: 'teams.revoke_invite', module: 'teams', title: 'Revogar convite', description: 'Revoga um convite pendente do workspace.', action: 'delete', risk: 'high', execution: 'native', reversible: false, resource: 'settings', permissionAction: 'edit', argumentHints: ['invite_query'] },
  { id: 'workspace.export', module: 'settings', title: 'Exportar workspace', description: 'Prepara uma exportação completa do workspace. A entrega do arquivo permanece uma etapa guiada da interface.', action: 'read', risk: 'read', execution: 'guided', reversible: false, resource: 'settings', permissionAction: 'export', argumentHints: [] },
  { id: 'calls.recording_url', module: 'calls', title: 'Abrir gravação da ligação', description: 'Obtém a URL temporária da gravação de uma ligação quando houver gravação disponível e permissão.', action: 'read', risk: 'read', execution: 'native', reversible: false, resource: 'contacts', permissionAction: 'view', argumentHints: ['record_query'] },
]

export const REALTALENT_UNIVERSAL_CAPABILITIES: CrmCapabilityDefinition[] = [
  ...UNIVERSAL_CRM_CAPABILITIES,
  ...UNIVERSAL_ADMIN_CAPABILITIES.filter((candidate) => !UNIVERSAL_CRM_CAPABILITIES.some((item) => item.id === candidate.id)),
]

export const universalCrmCapabilityById = (id: string) => REALTALENT_UNIVERSAL_CAPABILITIES.find((item) => item.id === id) ?? null

export const universalCrmCapabilityCatalogForModel = () => REALTALENT_UNIVERSAL_CAPABILITIES
  .filter((item) => item.execution === 'native')
  .map((item) => ({
    id: item.id,
    module: item.module,
    title: item.title,
    description: item.description,
    action: item.action,
    risk: item.risk,
    reversible: item.reversible,
    arguments: item.argumentHints,
  }))
