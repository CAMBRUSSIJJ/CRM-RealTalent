import type { CrmCapabilityDefinition } from './realtalent-crm-capabilities'
import { CRM_CAPABILITIES } from './realtalent-crm-capabilities'

export const UNIVERSAL_EXTRA_CAPABILITIES: CrmCapabilityDefinition[] = [
  { id: 'contacts.relationship_create', module: 'leads', title: 'Criar relação entre contatos', description: 'Cria uma relação de influência, reporte, parceria ou outra relação entre dois contatos da mesma empresa.', action: 'create', risk: 'medium', execution: 'native', reversible: false, resource: 'contacts', permissionAction: 'edit', argumentHints: ['from_contact_query', 'to_contact_query', 'company_query', 'relationship_type', 'strength', 'notes'] },
  { id: 'contacts.relationship_update', module: 'leads', title: 'Atualizar relação entre contatos', description: 'Atualiza tipo, força ou observações de uma relação entre contatos.', action: 'update', risk: 'medium', execution: 'native', reversible: false, resource: 'contacts', permissionAction: 'edit', argumentHints: ['record_query', 'relationship_type', 'strength', 'notes'] },
  { id: 'contacts.relationship_delete', module: 'leads', title: 'Excluir relação entre contatos', description: 'Exclui uma relação cadastrada entre contatos.', action: 'delete', risk: 'high', execution: 'native', reversible: false, resource: 'contacts', permissionAction: 'delete', argumentHints: ['record_query'] },

  { id: 'leads.bulk_move', module: 'pipeline', title: 'Mover oportunidades em lote', description: 'Move vários leads/oportunidades selecionados para outra etapa do pipeline.', action: 'update', risk: 'high', execution: 'native', reversible: false, resource: 'pipeline', permissionAction: 'edit', argumentHints: ['record_queries', 'stage_query', 'loss_reason'] },
  { id: 'leads.merge', module: 'leads', title: 'Mesclar leads duplicados', description: 'Mescla um lead duplicado dentro de um lead principal.', action: 'execute', risk: 'high', execution: 'native', reversible: false, resource: 'contacts', permissionAction: 'edit', argumentHints: ['primary_query', 'duplicate_query'] },
  { id: 'leads.bulk_update', module: 'leads', title: 'Atualizar leads em lote', description: 'Atualiza vários leads com os mesmos campos comerciais.', action: 'update', risk: 'high', execution: 'native', reversible: false, resource: 'contacts', permissionAction: 'edit', argumentHints: ['record_queries', 'priority', 'temperature', 'owner_id', 'owner_name', 'next_action_at', 'status', 'notes'] },
  { id: 'leads.reclassify', module: 'leads', title: 'Reclassificar leads', description: 'Reclassifica prioridade e temperatura de vários leads.', action: 'update', risk: 'medium', execution: 'native', reversible: false, resource: 'contacts', permissionAction: 'edit', argumentHints: ['record_queries', 'priority', 'temperature'] },
  { id: 'leads.bulk_tag', module: 'leads', title: 'Adicionar tag em lote', description: 'Adiciona a mesma tag a vários leads.', action: 'update', risk: 'medium', execution: 'native', reversible: false, resource: 'contacts', permissionAction: 'edit', argumentHints: ['record_queries', 'tag'] },
  { id: 'leads.bulk_delete', module: 'leads', title: 'Excluir leads em lote', description: 'Exclui vários leads selecionados.', action: 'delete', risk: 'high', execution: 'native', reversible: false, resource: 'contacts', permissionAction: 'delete', argumentHints: ['record_queries'] },

  { id: 'activities.update', module: 'followups', title: 'Atualizar atividade', description: 'Atualiza título, conteúdo, prazo, responsável ou estado de uma atividade/follow-up.', action: 'update', risk: 'medium', execution: 'native', reversible: false, resource: 'tasks', permissionAction: 'edit', argumentHints: ['record_query', 'title', 'description', 'due_at', 'assigned_to', 'resolution_status', 'resolution_reason'] },
  { id: 'activities.register_outcome', module: 'followups', title: 'Registrar resultado de atividade', description: 'Registra o desfecho comercial de uma atividade e pode criar a próxima ação.', action: 'execute', risk: 'medium', execution: 'native', reversible: false, resource: 'tasks', permissionAction: 'edit', argumentHints: ['record_query', 'outcome', 'result_title', 'result_description', 'create_next', 'next_type', 'next_title', 'next_description', 'next_at', 'stage_query'] },
  { id: 'cadences.create', module: 'followups', title: 'Criar cadência comercial', description: 'Cria uma cadência de follow-up para um ou vários leads.', action: 'create', risk: 'medium', execution: 'native', reversible: false, resource: 'tasks', permissionAction: 'create', argumentHints: ['record_queries', 'first_due_at', 'template_name'] },
  { id: 'cadences.update_state', module: 'followups', title: 'Pausar, retomar ou encerrar cadência', description: 'Atualiza o estado de uma cadência existente.', action: 'update', risk: 'medium', execution: 'native', reversible: false, resource: 'tasks', permissionAction: 'edit', argumentHints: ['cadence_id', 'action', 'lead_query'] },

  { id: 'calls.register_outcome', module: 'calls', title: 'Registrar desfecho completo da ligação', description: 'Registra uma ligação e aplica o fluxo comercial de próxima ação, retorno ou reunião.', action: 'execute', risk: 'medium', execution: 'native', reversible: false, resource: 'contacts', permissionAction: 'edit', argumentHints: ['record_query', 'contact_query', 'outcome', 'duration_seconds', 'notes', 'started_at', 'ended_at', 'schedule_next', 'next_at', 'meeting_duration_minutes'] },
  { id: 'calls.delete', module: 'calls', title: 'Excluir registro de ligação', description: 'Exclui um registro de ligação existente.', action: 'delete', risk: 'high', execution: 'native', reversible: false, resource: 'contacts', permissionAction: 'delete', argumentHints: ['record_query'] },

  { id: 'proposals.update', module: 'proposals', title: 'Atualizar proposta', description: 'Atualiza dados comerciais gerais de uma proposta, além do status.', action: 'update', risk: 'medium', execution: 'native', reversible: false, resource: 'proposals', permissionAction: 'edit', argumentHints: ['record_query', 'title', 'probability', 'valid_until', 'expected_close_at', 'contract_start_at', 'contract_end_at', 'contract_term_months', 'auto_renew', 'notes', 'terms'] },
  { id: 'proposals.create_revision', module: 'proposals', title: 'Criar revisão de proposta', description: 'Cria uma nova revisão/versionamento de uma proposta existente.', action: 'create', risk: 'medium', execution: 'native', reversible: false, resource: 'proposals', permissionAction: 'edit', argumentHints: ['record_query'] },
  { id: 'catalog.reconcile_proposal_items', module: 'proposals', title: 'Vincular item legado ao catálogo', description: 'Substitui referências legadas de item de proposta por um produto real do catálogo.', action: 'execute', risk: 'high', execution: 'native', reversible: false, resource: 'proposals', permissionAction: 'edit', argumentHints: ['legacy_name', 'product_query'] },

  { id: 'buyer_rooms.create', module: 'proposals', title: 'Criar Buyer Room', description: 'Cria uma sala de negociação compartilhável vinculada a uma proposta.', action: 'create', risk: 'medium', execution: 'native', reversible: false, resource: 'proposals', permissionAction: 'create', argumentHints: ['proposal_query', 'title', 'welcome_message', 'share_enabled', 'expires_at'] },
  { id: 'buyer_rooms.update', module: 'proposals', title: 'Atualizar Buyer Room', description: 'Atualiza título, mensagem, status, compartilhamento ou validade de uma Buyer Room.', action: 'update', risk: 'medium', execution: 'native', reversible: false, resource: 'proposals', permissionAction: 'edit', argumentHints: ['record_query', 'title', 'welcome_message', 'status', 'share_enabled', 'expires_at'] },
  { id: 'buyer_rooms.rotate_token', module: 'proposals', title: 'Gerar novo link da Buyer Room', description: 'Rotaciona o token/link de compartilhamento de uma Buyer Room.', action: 'execute', risk: 'high', execution: 'native', reversible: false, resource: 'proposals', permissionAction: 'edit', argumentHints: ['record_query'] },
  { id: 'buyer_rooms.delete', module: 'proposals', title: 'Excluir Buyer Room', description: 'Exclui uma Buyer Room existente.', action: 'delete', risk: 'high', execution: 'native', reversible: false, resource: 'proposals', permissionAction: 'delete', argumentHints: ['record_query'] },

  { id: 'automations.create', module: 'automations', title: 'Criar automação', description: 'Cria uma regra de automação comercial básica e segura.', action: 'create', risk: 'high', execution: 'native', reversible: false, resource: 'settings', permissionAction: 'edit', argumentHints: ['name', 'trigger_type', 'enabled', 'conditions_json', 'actions_json'] },
  { id: 'automations.simulate', module: 'automations', title: 'Simular automação', description: 'Simula uma regra de automação para um lead sem executar mutações reais.', action: 'read', risk: 'read', execution: 'native', reversible: false, resource: 'settings', permissionAction: 'view', argumentHints: ['record_query', 'lead_query'] },
  { id: 'automations.run_checks', module: 'automations', title: 'Executar verificações de automação', description: 'Executa a varredura das regras automáticas elegíveis do workspace.', action: 'execute', risk: 'high', execution: 'native', reversible: false, resource: 'settings', permissionAction: 'edit', argumentHints: [] },
  { id: 'automations.undo_run', module: 'automations', title: 'Desfazer execução de automação', description: 'Desfaz uma execução de automação reversível pelo ID ou referência da execução.', action: 'execute', risk: 'high', execution: 'native', reversible: false, resource: 'settings', permissionAction: 'edit', argumentHints: ['run_query'] },

  { id: 'workspace.create', module: 'settings', title: 'Criar workspace', description: 'Cria um novo workspace do CRM.', action: 'create', risk: 'high', execution: 'native', reversible: false, resource: 'settings', permissionAction: 'edit', argumentHints: ['name'] },
  { id: 'workspace.select', module: 'settings', title: 'Trocar workspace', description: 'Troca o workspace atual usando um ID já conhecido.', action: 'execute', risk: 'medium', execution: 'native', reversible: false, resource: 'settings', permissionAction: 'view', argumentHints: ['workspace_id'] },
  { id: 'workspace.members', module: 'teams', title: 'Listar membros do workspace', description: 'Lista os membros e seus papéis no workspace atual.', action: 'read', risk: 'read', execution: 'native', reversible: false, resource: 'settings', permissionAction: 'view', argumentHints: [] },
  { id: 'workspace.invites', module: 'teams', title: 'Listar convites do workspace', description: 'Lista convites pendentes e recentes do workspace.', action: 'read', risk: 'read', execution: 'native', reversible: false, resource: 'settings', permissionAction: 'view', argumentHints: [] },
  { id: 'workspace.audit_logs', module: 'settings', title: 'Consultar auditoria', description: 'Lista eventos recentes de auditoria do workspace.', action: 'read', risk: 'read', execution: 'native', reversible: false, resource: 'settings', permissionAction: 'view', argumentHints: ['limit'] },
  { id: 'workspace.sync_structure', module: 'settings', title: 'Sincronizar estrutura comercial', description: 'Reconstrói/sincroniza Company, Contact e Opportunity a partir da estrutura comercial atual.', action: 'execute', risk: 'high', execution: 'native', reversible: false, resource: 'settings', permissionAction: 'edit', argumentHints: [] },
  { id: 'workspace.clear_operational_data', module: 'settings', title: 'Limpar dados operacionais', description: 'Remove dados operacionais do workspace atual. Ação destrutiva e sempre sujeita a confirmação.', action: 'delete', risk: 'high', execution: 'native', reversible: false, resource: 'settings', permissionAction: 'delete', argumentHints: [] },

  { id: 'backup.restore_workspace', module: 'settings', title: 'Restaurar backup', description: 'Restaura um backup do workspace a partir de um arquivo fornecido pelo usuário.', action: 'execute', risk: 'high', execution: 'guided', reversible: false, resource: 'settings', permissionAction: 'edit', argumentHints: ['file'] },
  { id: 'backup.import_legacy', module: 'settings', title: 'Importar backup legado', description: 'Importa um backup legado fornecido pelo usuário.', action: 'execute', risk: 'high', execution: 'guided', reversible: false, resource: 'settings', permissionAction: 'edit', argumentHints: ['file'] },
  { id: 'backup.import_leads', module: 'settings', title: 'Importar arquivo de leads', description: 'Importa leads de um arquivo fornecido pelo usuário.', action: 'execute', risk: 'high', execution: 'guided', reversible: false, resource: 'contacts', permissionAction: 'create', argumentHints: ['file'] },
]

export const UNIVERSAL_CRM_CAPABILITIES: CrmCapabilityDefinition[] = [
  ...CRM_CAPABILITIES,
  ...UNIVERSAL_EXTRA_CAPABILITIES.filter((candidate) => !CRM_CAPABILITIES.some((base) => base.id === candidate.id)),
]

export const universalCrmCapabilityById = (id: string) => UNIVERSAL_CRM_CAPABILITIES.find((capability) => capability.id === id) ?? null

export const universalCrmCapabilityCatalogForModel = () => UNIVERSAL_CRM_CAPABILITIES
  .filter((capability) => capability.execution === 'native')
  .map((capability) => ({
    id: capability.id,
    module: capability.module,
    title: capability.title,
    description: capability.description,
    action: capability.action,
    risk: capability.risk,
    reversible: capability.reversible,
    arguments: capability.argumentHints,
  }))