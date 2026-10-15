import type { WorkspaceSnapshot } from '../domain/types'

export type FunctionalCapabilityStatus = 'functional' | 'partial' | 'visual_only' | 'not_implemented'
export type FunctionalCapabilityArea = 'Operação' | 'Inteligência' | 'Integrações' | 'Administração'

export interface FunctionalCapabilityAuditContext {
  repositoryMode: 'local' | 'supabase'
  hasSupabaseConfig: boolean
  extensionEnabled: boolean
  assistedWhatsapp: boolean
  assistedEmail: boolean
  snapshot: WorkspaceSnapshot | null
}

export interface FunctionalCapabilityItem {
  id: string
  area: FunctionalCapabilityArea
  name: string
  status: FunctionalCapabilityStatus
  summary: string
  limitation: string
  nextStep: string
  technicalEvidence: string[]
}

export const functionalCapabilityStatusLabel: Record<FunctionalCapabilityStatus, string> = {
  functional: 'Funcional',
  partial: 'Parcial',
  visual_only: 'Visual apenas',
  not_implemented: 'Não implementado',
}

export const buildFunctionalCapabilityAudit = (context: FunctionalCapabilityAuditContext): FunctionalCapabilityItem[] => {
  const online = context.repositoryMode === 'supabase' && context.hasSupabaseConfig
  const leadCount = context.snapshot?.leads.length ?? 0
  const stageCount = context.snapshot?.stages.length ?? 0

  return [
    {
      id: 'dashboard-workday', area: 'Operação', name: 'Meu Dia e fila comercial', status: 'functional',
      summary: `Fila diária, prioridades, risco, próximos contatos, metas e inteligência usam dados reais do workspace${leadCount ? ` (${leadCount} lead(s) carregado(s))` : ''}.`,
      limitation: 'A qualidade das recomendações depende do preenchimento de atividades, datas, valores e responsáveis.',
      nextStep: 'Executar QA específico da personalização e simplificar quais blocos aparecem por perfil.',
      technicalEvidence: ['features/dashboard/dashboard-page.tsx', 'services/workday.ts', 'services/lead-scoring.ts', 'services/deal-intelligence.ts'],
    },
    {
      id: 'dashboard-customization', area: 'Operação', name: 'Personalizar visualização', status: 'functional',
      summary: 'O Meu Dia possui composição Essencial/Equilibrada/Completa, ocultação e reordenação de blocos, escopo individual/equipe e posicionamento dedicado da Visualização Inteligente.',
      limitation: 'A Visualização Inteligente só é renderizada quando Deal Intelligence estiver habilitado; em Supabase, a sincronização entre dispositivos depende da sessão e do backend disponíveis.',
      nextStep: 'Usar a personalização como base estável e avançar para padronização dos controles do Pipeline.',
      technicalEvidence: ['features/experience/page-customization-drawer.tsx', 'features/experience/experience-context.tsx', 'features/experience/experience-registry.ts', 'features/experience/page-experience-boundary.tsx'],
    },
    {
      id: 'leads-crud', area: 'Operação', name: 'Leads, edição, importação e dados comerciais', status: 'functional',
      summary: 'Cadastro, edição, exclusão, ações em massa, importação e estrutura comercial estão ligadas ao repositório real.',
      limitation: 'Importações grandes e qualidade dos dados ainda precisam de testes de volume.',
      nextStep: 'Manter como base estável e usar nos testes de regressão das próximas versões.',
      technicalEvidence: ['features/leads/leads-page.tsx', 'repositories/crm-repository.ts', 'services/lead-csv.ts', 'services/commercial-structure.ts'],
    },
    {
      id: 'account-360', area: 'Inteligência', name: 'Account 360 e mapa de decisores', status: 'functional',
      summary: 'Stakeholders, relações, contatos, organograma por nível decisório, status de contato, oportunidades relacionadas e ações rápidas possuem implementação e persistência.',
      limitation: 'A qualidade do organograma depende do cadastro correto de papéis, influência e relações entre as pessoas.',
      nextStep: 'Manter o Account 360 como fonte de cobertura decisória e evoluir automações/recomendações sobre gaps da conta.',
      technicalEvidence: ['features/leads/account-360-modal.tsx', 'features/leads/account-relationship-graph.tsx', 'services/account-intelligence.ts'],
    },
    {
      id: 'territory-map', area: 'Operação', name: 'Mapa / Território', status: 'functional',
      summary: online ? 'Mapa comercial usa coordenadas do CRM, mapas-base reais, filtros territoriais e de risco da conta, geocodificação/diagnóstico e acesso ao organograma decisório.' : 'Mapa comercial opera com coordenadas existentes, mapas-base reais, estimativas locais identificadas, correção manual e filtros de risco/cobertura da conta.',
      limitation: online ? 'A precisão da geocodificação automática continua dependente do provedor externo e da qualidade do endereço.' : 'Sem Edge Function de geocodificação, novas posições automáticas podem ser aproximadas; coordenadas manuais permanecem exatas.',
      nextStep: 'Monitorar qualidade geográfica e manter a fila de localização como rotina de higiene de dados.',
      technicalEvidence: ['features/commercial-map/commercial-map-page.tsx', 'services/geocoding.ts', 'public/commercial-map-runtime.js', 'supabase/functions/geocode-lead/index.ts'],
    },
    {
      id: 'pipeline-core', area: 'Operação', name: 'Pipeline e movimentação de oportunidades', status: 'functional',
      summary: `Kanban, movimentação, filtros, políticas por etapa, inteligência e ações rápidas padronizadas estão implementados${stageCount ? ` em ${stageCount} etapa(s)` : ''}.`,
      limitation: 'A qualidade operacional ainda depende de valores, responsáveis e próximas ações bem preenchidos.',
      nextStep: 'Manter o Pipeline como base estável e avançar para o refinamento dos Follow-ups.',
      technicalEvidence: ['features/pipeline/pipeline-page.tsx', 'services/pipeline-intelligence.ts', 'features/pipeline/pipeline-settings-modal.tsx'],
    },
    {
      id: 'pipeline-views', area: 'Operação', name: 'Visualizações do Pipeline', status: 'functional',
      summary: 'Kanban, Lista, Previsão, Calendário e Funil possuem orientação contextual; a última visualização/densidade é persistida e as visões salvas preservam filtros, modo e escopo.',
      limitation: 'Não há Gantt nesta versão atual e Calendário/Funil ainda são mais analíticos do que operacionais.',
      nextStep: 'Avaliar Gantt somente se houver ganho real de execução; manter os cinco modos atuais como padrão principal.',
      technicalEvidence: ['features/pipeline/pipeline-page.tsx', 'features/pipeline/pipeline-preferences.ts'],
    },
    {
      id: 'followups', area: 'Operação', name: 'Follow-ups e cadências', status: 'functional',
      summary: 'Fila, atividades, cadências, resultados, pausa/retomada e regras de continuidade estão implementados; cards agora destacam prazo, atraso, canal, responsável, etapa e cadência.',
      limitation: 'A qualidade da fila depende de responsável, prioridade e datas corretamente preenchidos; cadências externas continuam sujeitas à disponibilidade dos canais.',
      nextStep: 'Manter Follow-ups como base operacional e avançar para a evolução do Mapa de Contas e território.',
      technicalEvidence: ['features/followups/followups-page.tsx', 'services/followup-workspace.ts', 'services/sales-engagement.ts'],
    },
    {
      id: 'calls-workspace', area: 'Operação', name: 'Sessões de ligação e Modo Foco', status: 'functional',
      summary: 'Preparação, fila, Modo Foco, roteiro, sinais, wrap-up, histórico e inteligência de chamadas têm implementação.',
      limitation: 'A execução da chamada telefônica depende do provedor/dispositivo disponível.',
      nextStep: 'Preservar o workspace e testar cada provedor real separadamente.',
      technicalEvidence: ['features/calls/calls-page.tsx', 'features/calls/call-workspace-modal.tsx', 'services/call-workspace.ts', 'services/calling-intelligence-workspace.ts'],
    },
    {
      id: 'voice-dialer', area: 'Integrações', name: 'RealTalent Voice / Discador', status: 'partial',
      summary: 'Existe camada de provedores, Device Manager, Caller ID e controles condicionados por capacidade.',
      limitation: 'Browser Voice e SIP não são simulados; precisam de configuração real. RealTalent Connect só é considerado disponível quando detectado.',
      nextStep: 'Validar dispositivo por dispositivo e manter status real de disponibilidade na interface.',
      technicalEvidence: ['services/voice-dialer.ts', 'features/calls/voice-dialer-settings-modal.tsx', 'services/realtalent-connect-contract.ts'],
    },
    {
      id: 'proposals', area: 'Operação', name: 'Propostas, versões e Proposal 360', status: 'functional',
      summary: 'Criação, edição de rascunho, versionamento, envio, aceite, recusa e fechamento estão ligados ao repositório; o workspace operacional agora é sincronizado com a etapa de Proposta do Pipeline.',
      limitation: 'Propostas fora da etapa operacional permanecem preservadas no histórico, Buyer Rooms, Receita e Forecast, mas deixam de aparecer na fila ativa de Propostas.',
      nextStep: 'Acompanhar o uso real e evoluir templates, aprovação e assinatura conforme a operação exigir.',
      technicalEvidence: ['features/proposals/proposals-page.tsx', 'features/proposals/proposal-360-modal.tsx', 'repositories/crm-repository.ts'],
    },
    {
      id: 'catalog', area: 'Operação', name: 'Catálogo de produtos/serviços', status: 'functional',
      summary: 'Catálogo possui criação, edição, busca, filtros, duplicação, ativação/desativação, proteção de exclusão e uso direto nos itens de proposta.',
      limitation: 'Ainda não há tabelas de preço, bundles ou regras avançadas de aprovação/desconto.',
      nextStep: 'Validar a operação atual antes de acrescentar price books, bundles e governança comercial.',
      technicalEvidence: ['features/proposals/proposals-page.tsx', 'repositories/crm-repository.ts'],
    },
    {
      id: 'revenue', area: 'Inteligência', name: 'Receita e Revenue Intelligence', status: 'functional',
      summary: 'Receita realizada, receita prevista registrada, bookings, pipeline ponderado, forecast RealTalent, MRR, win rate e cortes por responsável, origem e produto são calculados separadamente.',
      limitation: 'Receita por origem/produto depende do lançamento estar vinculado a lead/proposta; negócios perdidos ainda usam updatedAt quando não existe data de perda dedicada.',
      nextStep: 'Validar a disciplina operacional de competência e vínculos antes de introduzir faturamento, invoice ou integração financeira.',
      technicalEvidence: ['services/revenue-intelligence.ts', 'services/revenue-forecast.ts', 'features/revenue-intelligence/revenue-intelligence-panel.tsx'],
    },
    {
      id: 'agenda-local', area: 'Operação', name: 'Agenda interna', status: 'functional',
      summary: 'Eventos, reuniões, lembretes e alterações usam dados persistidos pelo repositório do CRM.',
      limitation: 'Sincronização externa é uma camada separada.',
      nextStep: 'Manter Agenda interna como fonte operacional e testar conflitos/sincronização na integração externa.',
      technicalEvidence: ['features/agenda/agenda-page.tsx', 'services/agenda-workspace.ts', 'repositories/crm-repository.ts'],
    },
    {
      id: 'calendar-external', area: 'Integrações', name: 'Google Calendar / Microsoft Calendar', status: 'partial',
      summary: online ? 'OAuth PKCE, seleção de calendário, sync bidirecional, fila idempotente, webhooks, lembretes, deduplicação e conflitos estão implementados.' : 'A arquitetura completa de sincronização existe, mas o modo local não conecta contas externas de verdade.',
      limitation: 'Exige Supabase, credenciais OAuth e Edge Functions implantadas; contas Google antigas podem precisar reconectar para liberar leitura da lista de calendários.',
      nextStep: 'Conectar uma conta real e validar criação, alteração, cancelamento, lembretes e conflitos ponta a ponta.',
      technicalEvidence: ['features/settings/calendar-integration-panel.tsx', 'services/calendar-integration.ts', 'supabase/functions/integration-calendar-catalog/index.ts', 'supabase/functions/_shared/integration-runtime.ts'],
    },
    {
      id: 'goals', area: 'Operação', name: 'Metas', status: 'functional',
      summary: 'Criação, edição, exclusão, metas individuais/equipe, ritmo por dias úteis, projeção, comparação histórica e filtros gerenciais estão implementados.',
      limitation: 'O calendário de ritmo considera dias úteis padrão (segunda a sexta) e ainda não desconta feriados regionais.',
      nextStep: 'Evoluir depois para calendários comerciais/feriados por workspace e cascata de quotas por equipe.',
      technicalEvidence: ['features/goals/goals-page.tsx', 'services/goals-workspace.ts', 'services/metrics.ts'],
    },
    {
      id: 'automations-core', area: 'Operação', name: 'Automações comerciais', status: 'functional',
      summary: 'Motor real com criação guiada Quando → Se → Então, templates, sugestões contextuais, simulação, preflight obrigatório para execução real, duplicação e histórico operacional.',
      limitation: 'A qualidade da automação continua dependente da cobertura dos eventos emitidos pelo CRM e das integrações externas configuradas.',
      nextStep: 'Ampliar sugestões por conversão, adicionar analytics por template e cobrir novos eventos externos sem reduzir as proteções de segurança.',
      technicalEvidence: ['features/automations/automations-page.tsx', 'features/automations/automation-modal.tsx', 'services/automation-readiness.ts', 'services/automation-engine.ts', 'services/automation-event-executor.ts'],
    },
    {
      id: 'automations-external', area: 'Integrações', name: 'Webhooks e ações externas de automação', status: 'partial',
      summary: online ? 'Há Edge Functions e infraestrutura de dispatch para webhooks e comunicações.' : 'No modo local, webhooks externos são simulados para impedir saída silenciosa de dados.',
      limitation: 'Entrega real exige backend implantado e credenciais/autorização adequadas.',
      nextStep: 'Testar webhooks, retries, idempotência e erros em ambiente Supabase conectado.',
      technicalEvidence: ['services/automation-webhooks.ts', 'supabase/functions/automation-webhook-dispatch/index.ts', 'supabase/functions/automation-runner/index.ts'],
    },
    {
      id: 'prospecting', area: 'Operação', name: 'Garimpo no CRM', status: 'partial',
      summary: context.extensionEnabled ? 'Busca automática paginada no Google Places, consulta CNPJ, captura multinavegador, revisão guiada, Data Layer, deduplicação, histórico, RT Capture e envio controlado ao CRM estão integrados; com o gateway Places configurado, o Garimpo pode buscar até 100 resultados únicos por execução.' : 'O Garimpo mantém busca automática no Google Places quando o gateway está configurado, consulta CNPJ, importação, Data Layer e captura universal; a entrada RT Capture está desativada nas preferências.',
      limitation: 'Instagram e outras fontes sem API oficial de descoberta continuam assistidas; o CRM não executa scraping irrestrito ou automação que dependa de contornar proteções dos sites.',
      nextStep: 'Medir custo por consulta, cobertura por região e taxa de aprovação dos lotes automáticos para ajustar metas e limites por workspace.',
      technicalEvidence: ['features/prospecting/prospecting-page.tsx', 'services/prospecting-search-automation.ts', 'services/prospecting-workspace.ts', 'services/prospecting-data-layer.ts', 'services/prospecting-provider-gateway.ts', 'supabase/functions/prospecting-search/index.ts', 'supabase/functions/extension-ingest/index.ts'],
    },
    {
      id: 'assistant', area: 'Inteligência', name: 'RealTalent Assistant 2.0', status: 'functional',
      summary: 'O Assistant usa contexto real do lead/proposta/tela atual, resume histórico, prepara ligações, recomenda próxima ação, sugere mensagens e gera planos controlados de follow-up.',
      limitation: 'O motor atual continua determinístico e local; não produz linguagem generativa aberta nem envia dados para um modelo externo.',
      nextStep: 'Conectar a futura RealTalent AI mantendo o Context Engine, permissões, confirmação de ações e trilha de auditoria desta versão.',
      technicalEvidence: ['services/realtalent-assistant.ts', 'services/realtalent-assistant-provider.ts', 'features/assistant/assistant-drawer.tsx', 'services/deal-intelligence.ts'],
    },
    {
      id: 'assistant-own-ai', area: 'Inteligência', name: 'Camada própria RealTalent AI', status: 'functional',
      summary: 'O RealTalent AI possui gateway proprietário, Context Engine, memória comercial derivada do CRM, catálogo de tools, política de permissões e trilha de auditoria local.',
      limitation: 'O provider ativo continua determinístico e local. A camada proprietária de IA está pronta para receber modelos generativos por gateway, mas esta versão não treina nem hospeda um LLM próprio.',
      nextStep: 'Conectar um provider generativo opcional ao gateway com política de minimização de dados, credenciais server-side e avaliação de qualidade antes de habilitar linguagem aberta.',
      technicalEvidence: ['services/realtalent-ai-gateway.ts', 'services/realtalent-ai-context.ts', 'services/realtalent-ai-memory.ts', 'services/realtalent-ai-tools.ts', 'services/realtalent-ai-audit.ts', 'features/settings/realtalent-ai-panel.tsx'],
    },
    {
      id: 'notifications', area: 'Administração', name: 'Notificações', status: 'functional',
      summary: 'A Central usa um motor único de regras, possui configuração por evento, canal interno e navegador/desktop, frequência e horário silencioso por usuário.',
      limitation: 'E-mail e WhatsApp continuam dependentes das integrações oficiais; alteração granular de etapa do Pipeline aguarda histórico específico de transições.',
      nextStep: 'Conectar canais externos oficiais e adicionar eventos de mudança de etapa quando o event log granular estiver disponível.',
      technicalEvidence: ['services/notification-engine.ts', 'features/experience/notification-center.tsx', 'features/experience/browser-notification-watcher.tsx', 'features/settings/settings-page.tsx'],
    },
    {
      id: 'whatsapp-assisted', area: 'Integrações', name: 'WhatsApp assistido / botões rápidos', status: 'functional',
      summary: context.assistedWhatsapp ? 'Leads, Contatos, Pipeline, Follow-ups e Propostas usam um compositor único com templates internos, código do país, política de contato e registro opcional de atividade.' : 'O recurso está implementado e padronizado, mas foi desativado nas preferências atuais.',
      limitation: 'O modo assistido abre WhatsApp/WhatsApp Web e registra a intenção no CRM, mas não confirma entrega, leitura ou resposta.',
      nextStep: 'Validar a experiência em desktop e celular; usar WhatsApp Business oficial quando forem necessários webhook e status de entrega.',
      technicalEvidence: ['services/whatsapp-workspace.ts', 'features/pipeline/sales-message-modal.tsx', 'features/settings/whatsapp-integration-panel.tsx', 'features/leads/account-360-modal.tsx'],
    },
    {
      id: 'whatsapp-cloud', area: 'Integrações', name: 'WhatsApp Business Cloud API', status: 'partial',
      summary: online ? 'O backend possui OAuth Meta, sincronização de conta/templates, envio oficial e webhook de mensagens/status.' : 'A infraestrutura existe no código, mas não funciona como conexão oficial enquanto o backend/credenciais Meta não estiverem configurados.',
      limitation: 'Exige app Meta, WABA, número, tokens/secrets, webhook público e Supabase implantado.',
      nextStep: 'Configurar ambiente Meta e validar envio, recebimento, templates e status de entrega ponta a ponta.',
      technicalEvidence: ['supabase/functions/integration-whatsapp-worker/index.ts', 'supabase/functions/official-communication-send/index.ts', 'supabase/functions/whatsapp-webhook/index.ts', 'supabase/functions/communications-gateway/index.ts'],
    },
    {
      id: 'communications-center', area: 'Operação', name: 'Central de Comunicação', status: 'functional',
      summary: 'O Omnichannel Inbox reúne WhatsApp, e-mail, Instagram, Facebook, LinkedIn, ligação, reunião, atividades locais e eventos oficiais em conversas centradas no contato, com não lidas, respostas pendentes e ações rápidas.',
      limitation: online ? 'A timeline oficial depende da sincronização das contas externas; ações assistidas registram preparação/abertura do canal, não entrega ou leitura.' : 'No modo local a Central usa atividades, ligações e Agenda do CRM; eventos oficiais de Gmail, Outlook e WhatsApp Cloud não ficam disponíveis sem backend conectado.',
      nextStep: 'Validar contas reais Google/Microsoft/WhatsApp, manter redes sociais em modo assistido quando a API não oferecer mensagens e evoluir anexos/threads oficiais por capability.',
      technicalEvidence: ['features/communications/communications-page.tsx', 'services/communication-workspace.ts', 'features/pipeline/sales-message-modal.tsx', 'supabase/migrations/202607270003_v100_42_official_communications.sql'],
    },
    {
      id: 'social-omnichannel', area: 'Integrações', name: 'Instagram / Facebook / LinkedIn no Inbox', status: 'functional',
      summary: 'Instagram, Facebook e LinkedIn possuem filtros próprios, perfil do lead, compositor assistido e registro confirmado pelo vendedor dentro da mesma caixa de entrada.',
      limitation: 'Ações assistidas não afirmam envio, leitura ou recebimento automático. Mensagens oficiais Meta só podem ser tratadas como sincronizadas quando a conta expuser capability específica; LinkedIn permanece assistido.',
      nextStep: 'Ativar ingestão oficial somente para capabilities aprovadas pelo provedor e manter fallback assistido por contato.',
      technicalEvidence: ['features/communications/communications-page.tsx', 'services/communication-workspace.ts', 'supabase/migrations/202609240002_v100_94_omnichannel_inbox.sql'],
    },
    {
      id: 'email', area: 'Integrações', name: 'E-mail Gmail / Outlook', status: 'partial',
      summary: online ? 'OAuth, leitura/sync, envio oficial e webhooks têm infraestrutura backend.' : 'No modo local o CRM prepara e-mail assistido, mas não sincroniza uma caixa externa real.',
      limitation: 'A operação oficial depende de OAuth, Supabase e Edge Functions.',
      nextStep: 'Conectar conta de teste, validar envio/entrada, threads, idempotência e associação ao lead.',
      technicalEvidence: ['services/integration-framework.ts', 'supabase/functions/integration-google-worker/index.ts', 'supabase/functions/integration-microsoft-worker/index.ts', 'supabase/functions/official-communication-send/index.ts'],
    },
    {
      id: 'metrics', area: 'Inteligência', name: 'Métricas e análise comercial', status: 'functional',
      summary: 'KPIs, funil, perdas, atividades e forecast são derivados do snapshot real do workspace.',
      limitation: 'Os indicadores só são confiáveis quando a equipe registra corretamente resultados e datas.',
      nextStep: 'Adicionar alertas de qualidade de dados junto dos KPIs mais sensíveis.',
      technicalEvidence: ['features/metrics/metrics-page.tsx', 'services/metrics.ts', 'services/revenue-intelligence.ts'],
    },
    {
      id: 'help', area: 'Administração', name: 'Ajuda, onboarding e tutorial do CRM', status: 'functional',
      summary: 'A Central de Ajuda é pesquisável, oferece ajuda contextual por tela, tours guiados e usa a mesma base consultada pelo RealTalent Assistant.',
      limitation: 'A documentação é embarcada nesta versão; vídeos e conteúdo remoto versionado ainda não fazem parte do produto.',
      nextStep: 'Adicionar analytics de dúvidas, tooltips ancorados em controles específicos e documentação remota com versionamento.',
      technicalEvidence: ['features/help/quick-help-modal.tsx', 'features/help/guided-tour-overlay.tsx', 'services/help-center.ts', 'features/onboarding/local-onboarding.tsx', 'services/realtalent-assistant.ts'],
    },
    {
      id: 'backup-security', area: 'Administração', name: 'Backup, auditoria e integridade', status: 'functional',
      summary: 'Backup/restauração, logs, diagnósticos, validações de integridade e proteção de ações críticas estão implementados.',
      limitation: context.repositoryMode === 'local' ? 'No modo local, os dados permanecem no navegador e exigem backup antes de limpar/trocar o ambiente.' : 'Em produção, a segurança final também depende das políticas RLS e do ambiente Supabase implantado.',
      nextStep: 'Manter essa suíte como gate obrigatório das próximas versões.',
      technicalEvidence: ['services/data-integrity.ts', 'services/workspace-backup-restore.ts', 'lib/diagnostics.ts', 'features/settings/settings-page.tsx'],
    },
  ]
}

export const summarizeFunctionalCapabilityAudit = (items: FunctionalCapabilityItem[]) => {
  const counts: Record<FunctionalCapabilityStatus, number> = { functional: 0, partial: 0, visual_only: 0, not_implemented: 0 }
  for (const item of items) counts[item.status] += 1
  const weighted = items.length ? Math.round(items.reduce((total, item) => total + ({ functional: 1, partial: .55, visual_only: .2, not_implemented: 0 }[item.status]), 0) / items.length * 100) : 0
  return { counts, total: items.length, weighted }
}
