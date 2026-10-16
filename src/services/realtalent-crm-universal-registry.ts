import type { CrmCapabilityDefinition } from './realtalent-crm-capabilities'
import { UNIVERSAL_CRM_CAPABILITIES } from './realtalent-crm-universal-capabilities'

export const SALES_INTELLIGENCE_CAPABILITIES: CrmCapabilityDefinition[] = [
  { id: 'sales.analyze_deal', module: 'pipeline', title: 'Analisar saúde da oportunidade', description: 'Analisa uma oportunidade usando os sinais reais do CRM e devolve Deal Health, momentum, riscos, cobertura de stakeholders, probabilidade RealTalent e a próxima melhor ação.', action: 'read', risk: 'read', execution: 'native', reversible: false, resource: 'pipeline', permissionAction: 'view', argumentHints: ['record_query'] },
  { id: 'sales.next_best_action', module: 'pipeline', title: 'Calcular próxima melhor ação', description: 'Calcula a próxima melhor ação comercial para um lead ou oportunidade com base em atividade, stakeholders, proposta, timing, engajamento e riscos atuais.', action: 'read', risk: 'read', execution: 'native', reversible: false, resource: 'pipeline', permissionAction: 'view', argumentHints: ['record_query'] },
  { id: 'sales.coach_conversation', module: 'pipeline', title: 'Preparar coaching de venda', description: 'Prepara como conduzir uma ligação ou reunião usando etapa, stakeholders, riscos, histórico real, Playbooks, catálogo vinculado e aprendizado comercial verificado, sem inventar fatos ausentes no CRM.', action: 'read', risk: 'read', execution: 'native', reversible: false, resource: 'pipeline', permissionAction: 'view', argumentHints: ['record_query', 'conversation_type'] },
  { id: 'sales.live_call_coach', module: 'calls', title: 'Coaching durante a ligação', description: 'Analisa sinais explícitos disponíveis na transcrição/notas da ligação e recomenda o próximo movimento sem criar fatos ou mutações.', action: 'read', risk: 'read', execution: 'native', reversible: false, resource: 'contacts', permissionAction: 'view', argumentHints: ['record_query', 'transcript', 'notes'] },
  { id: 'sales.post_call_review', module: 'calls', title: 'Revisar ligação concluída', description: 'Revisa a última ligação registrada, separa o que o fluxo comercial já persistiu e recomenda apenas próximos movimentos ainda necessários.', action: 'read', risk: 'read', execution: 'native', reversible: false, resource: 'contacts', permissionAction: 'view', argumentHints: ['record_query', 'call_query'] },
]

export const UNIVERSAL_ADMIN_CAPABILITIES: CrmCapabilityDefinition[] = [
  { id: 'teams.create_member', module: 'teams', title: 'Criar membro do workspace', description: 'Cria diretamente um membro no workspace quando a política administrativa permitir.', action: 'create', risk: 'high', execution: 'native', reversible: false, resource: 'settings', permissionAction: 'edit', argumentHints: ['display_name', 'email', 'role'] },
  { id: 'teams.revoke_invite', module: 'teams', title: 'Revogar convite', description: 'Revoga um convite pendente do workspace.', action: 'delete', risk: 'high', execution: 'native', reversible: false, resource: 'settings', permissionAction: 'edit', argumentHints: ['invite_query'] },
  { id: 'automations.update', module: 'automations', title: 'Atualizar automação', description: 'Atualiza nome, gatilho, estado, condições ou ações de uma regra de automação.', action: 'update', risk: 'high', execution: 'native', reversible: false, resource: 'settings', permissionAction: 'edit', argumentHints: ['record_query', 'name', 'trigger_type', 'enabled', 'conditions_json', 'actions_json'] },
  { id: 'workspace.export', module: 'settings', title: 'Exportar workspace', description: 'Prepara uma exportação completa do workspace. A entrega do arquivo permanece uma etapa guiada da interface.', action: 'read', risk: 'read', execution: 'guided', reversible: false, resource: 'settings', permissionAction: 'view', argumentHints: [] },
  { id: 'calls.recording_url', module: 'calls', title: 'Abrir gravação da ligação', description: 'Obtém a URL temporária da gravação de uma ligação quando houver gravação disponível e permissão.', action: 'read', risk: 'read', execution: 'native', reversible: false, resource: 'contacts', permissionAction: 'view', argumentHints: ['record_query'] },
]

export const REALTALENT_UNIVERSAL_CAPABILITIES: CrmCapabilityDefinition[] = [
  ...UNIVERSAL_CRM_CAPABILITIES,
  ...SALES_INTELLIGENCE_CAPABILITIES.filter((candidate) => !UNIVERSAL_CRM_CAPABILITIES.some((item) => item.id === candidate.id)),
  ...UNIVERSAL_ADMIN_CAPABILITIES.filter((candidate) => !UNIVERSAL_CRM_CAPABILITIES.some((item) => item.id === candidate.id) && !SALES_INTELLIGENCE_CAPABILITIES.some((item) => item.id === candidate.id)),
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