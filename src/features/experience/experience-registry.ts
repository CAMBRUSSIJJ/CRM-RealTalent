import type { AppRoute } from '../../domain/types'

export type ExperienceBlockSize = 's' | 'm' | 'l' | 'full'

export interface ExperienceSectionDefinition {
  id: string
  label: string
  description: string
  selector: string
  required?: boolean
  sizeOptions?: ExperienceBlockSize[]
  defaultSize?: ExperienceBlockSize
}

export const pageSectionRegistry: Record<AppRoute, ExperienceSectionDefinition[]> = {
  dashboard: [
    { id: 'day', label: 'Central do dia', description: 'Home operacional fixa: saudação, início da rotina, próximos passos e relance do dia.', selector: '.myday-v1016', required: true, sizeOptions: ['full'], defaultSize: 'full' },
    { id: 'day-health', label: 'Resumo do dia', description: 'Prioridades, atrasos, Pipeline e meta atual dentro da Central do dia.', selector: '.health-strip', required: true, sizeOptions: ['full'], defaultSize: 'full' },
  ],
  leads: [
    { id: 'health', label: 'Indicadores de Contatos', description: 'Ativos, atrasados, sem ação e recentes.', selector: '.contacts-summary-strip-h20' },
    { id: 'views', label: 'Visualizações salvas', description: 'Atalhos para recortes frequentes.', selector: '.lead-view-tabs' },
    { id: 'toolbar', label: 'Busca e ações', description: 'Pesquisa, filtros, importação e criação.', selector: '.leads-toolbar', required: true },
    { id: 'filters', label: 'Filtros avançados', description: 'Painel detalhado de segmentação.', selector: '.contact-view-settings-v10164__filters, .lead-filter-chips' },
    { id: 'data', label: 'Base de Contatos', description: 'Tabela ou cards com os registros.', selector: '.leads-data-panel', required: true },
  ],
  tasks: [
    { id: 'header', label: 'Cabeçalho de Tarefas', description: 'Título, contexto e criação de tarefas.', selector: '.tasks-page-header-h223h1', required: true },
    { id: 'summary', label: 'Resumo de Tarefas', description: 'Abertas, hoje, atrasadas e bloqueadas.', selector: '.tasks-summary-strip-h223h1' },
    { id: 'views', label: 'Visualizações de Tarefas', description: 'Lista, quadro, hoje, atrasadas e concluídas.', selector: '.tasks-view-strip-h223h1' },
    { id: 'toolbar', label: 'Busca e filtros de Tarefas', description: 'Busca, responsável, equipe e prioridade.', selector: '.work-toolbar', required: true },
    { id: 'content', label: 'Execução de Tarefas', description: 'Lista ou quadro operacional das tarefas.', selector: '.work-task-list, .work-task-board', required: true },
  ],
  teams: [
    { id: 'header', label: 'Cabeçalho de Equipes', description: 'Título, contexto e criação de equipes.', selector: '.teams-page-header-h223h1', required: true },
    { id: 'directory', label: 'Diretório de Equipes', description: 'Lista das equipes do workspace.', selector: '.teams-directory', required: true },
    { id: 'detail', label: 'Detalhe da Equipe', description: 'Visão geral, pessoas, performance e acesso.', selector: '.team-detail', required: true },
    { id: 'access', label: 'Perfis e acesso', description: 'Governança, permissões, aprovações e auditoria.', selector: '.team-access-h22' },
  ],
  'commercial-map': [
    { id: 'map', label: 'Mapa comercial', description: 'Mapa, filtros territoriais e lista lateral.', selector: '#commercial-map-root', required: true },
  ],
  pipeline: [
    { id: 'summary', label: 'Resumo do Pipeline', description: 'Volume, valor, previsão e conversão.', selector: '.pipeline-summary-strip-h20' },
    { id: 'attention', label: 'Fila de atenção', description: 'Negócios críticos e sem próxima ação.', selector: '.pipeline-action-center' },
    { id: 'toolbar', label: 'Busca e ações', description: 'Filtros, visões, cards e criação.', selector: '.pipeline-single-action-bar-v101113', required: true },
    { id: 'views', label: 'Modos de visualização', description: 'Kanban, lista, forecast, agenda e funil.', selector: '.pipeline-view-switcher', required: true },
    { id: 'filters', label: 'Filtros avançados', description: 'Critérios comerciais adicionais.', selector: '.pipeline-filter-drawer-v10168, .pipeline-filter-chips-v10168, .workspace-filter-trigger-v10170' },
    { id: 'content', label: 'Conteúdo do Pipeline', description: 'Negócios da visualização selecionada.', selector: '.pipeline-board, .pipeline-list-view, .pipeline-forecast-view, .pipeline-calendar-view, .pipeline-funnel-view', required: true },
  ],
  followups: [
    { id: 'command', label: 'Comando da fila', description: 'Busca, filtros e início da execução.', selector: '.followup-page-header-v10167', required: true },
    { id: 'views', label: 'Visualizações', description: 'Fila, quadro, calendário e cadências.', selector: '.followup-view-strip-h20' },
    { id: 'filters', label: 'Filtros ativos', description: 'Recortes aplicados à rotina.', selector: '.followup-active-filters-v10167' },
    { id: 'workspace', label: 'Área de execução', description: 'Fila e contexto do contato.', selector: '.followup-workspace-layout, .followup-board, .followup-calendar, .cadence-dashboard, .performance-dashboard', required: true },
  ],
  calls: [
    { id: 'command', label: 'Comando de ligações', description: 'Preparação da sessão e ações principais.', selector: '.calls-page-header-h20', required: true },
    { id: 'summary', label: 'Resumo da operação', description: 'Indicadores rápidos da rotina.', selector: '.calls-summary-strip-h20' },
    { id: 'views', label: 'Visualizações', description: 'Operação, histórico, inteligência e configurações.', selector: '.calls-area-view-strip-h20' },
    { id: 'toolbar', label: 'Filtros da Central', description: 'Pesquisa, resultado e preferências.', selector: '.calls-operation-command-h20, .calls-history-command-h20' },
    { id: 'workspace', label: 'Central de execução', description: 'Fila, roteiro e área de ligação.', selector: '.calls-operations-layout, .calls-history-panel', required: true },
    { id: 'performance', label: 'Desempenho', description: 'Indicadores e diagnóstico das chamadas.', selector: '.calls-intelligence-workspace', required: true },
  ],
  communications: [
    { id: 'hero', label: 'Resumo da comunicação', description: 'Status dos canais, pendências e contexto do workspace.', selector: '.omnichannel-hero' },
    { id: 'kpis', label: 'Filtros da caixa de entrada', description: 'Busca, não lidas, respostas pendentes, período e direção.', selector: '.workspace-command-bar-v10169, .workspace-filter-trigger-v10170' },
    { id: 'workspace', label: 'Omnichannel Inbox', description: 'Canais, conversas, contato em foco e histórico unificado.', selector: '.omnichannel-shell', required: true },
  ],
  proposals: [
    { id: 'command', label: 'Comando de propostas', description: 'Filtros, ações e criação.', selector: '.proposal-page-header-h20', required: true },
    { id: 'summary', label: 'Indicadores financeiros', description: 'Receita, forecast e propostas.', selector: '.proposal-summary-strip-h20' },
    { id: 'views', label: 'Áreas comerciais', description: 'Propostas, catálogo, receita e forecast.', selector: '.proposal-area-view-strip-h20' },
    { id: 'content', label: 'Conteúdo principal', description: 'Área selecionada de propostas e receita.', selector: '.proposal-table-panel, .buyer-room-workspace, .catalog-workspace, .revenue-workspace-v10081, .revenue-intelligence-v10081', required: true },
    { id: 'catalog-insights', label: 'Catálogo · Indicadores', description: 'Itens ativos, recorrência, margem média e adoção nas propostas.', selector: '.catalog-insights-professional' },
    { id: 'catalog-list', label: 'Catálogo · Itens', description: 'Produtos e serviços com preço, custo, margem e uso.', selector: '.catalog-table-wrap' },
    { id: 'forecast-command', label: 'Forecast · Período e contexto', description: 'Cabeçalho do Revenue Intelligence e seletor do mês.', selector: '.ri-command' },
    { id: 'forecast-definitions', label: 'Forecast · Definições', description: 'Explica receita realizada, bookings, pipeline ponderado e Forecast RealTalent.', selector: '.ri-definition-strip' },
    { id: 'forecast-kpis', label: 'Forecast · Indicadores principais', description: 'Receita, bookings, pipeline, forecast e gap de meta.', selector: '.ri-kpi-grid' },
    { id: 'forecast-scenarios', label: 'Forecast · Cenários', description: 'Commit, Best Case e demais cenários de previsão.', selector: '.ri-scenarios' },
    { id: 'forecast-coverage', label: 'Forecast · Cobertura e receita', description: 'Pipeline coverage, recorrência e série de receita.', selector: '.ri-two-columns' },
    { id: 'forecast-risks', label: 'Forecast · Riscos', description: 'Alertas que podem reduzir a previsão.', selector: '.ri-risk-panel' },
    { id: 'forecast-owners', label: 'Forecast · Responsáveis', description: 'Contribuição da equipe e atingimento individual.', selector: '.ri-owner-panel' },
    { id: 'forecast-breakdowns', label: 'Forecast · Origem e produto', description: 'Distribuição da receita por origem e mix comercial.', selector: '.ri-breakdown-grid' },
    { id: 'forecast-conversion', label: 'Forecast · Conversão', description: 'Ganhos, perdas, ticket médio e receita sem vínculo.', selector: '.ri-conversion-panel' },
    { id: 'forecast-deals', label: 'Forecast · Negócios', description: 'Negócios que formam a previsão e seus sinais.', selector: '.ri-deals-panel' },
  ],
  agenda: [
    { id: 'command', label: 'Comando da Agenda', description: 'Período, visualização e novo compromisso.', selector: '.agenda-toolbar', required: true },
    { id: 'summary', label: 'Resumo da Agenda', description: 'Compromissos, conflitos e lembretes.', selector: '.agenda-summary-strip-h20' },
    { id: 'calendar', label: 'Calendário', description: 'Grade principal de compromissos.', selector: '.agenda-workspace-layout', required: true },
  ],
  playbooks: [
    { id: 'command', label: 'Busca e categorias', description: 'Pesquisa, filtros e novo conteúdo.', selector: '.playbooks-command-bar', required: true },
    { id: 'library', label: 'Biblioteca', description: 'Scripts, objeções e modelos.', selector: '.playbook-grid, .playbook-execution-shell, .coaching-dashboard-grid', required: true },
  ],
  goals: [
    { id: 'command', label: 'Comando de metas', description: 'Período, escopo e criação.', selector: '.workspace-command-bar-v10169', required: true },
    { id: 'views', label: 'Visualizações', description: 'Geral, equipe e histórico.', selector: '.workspace-view-strip-v10169' },
    { id: 'summary', label: 'Resumo de metas', description: 'Progresso, ritmo e projeção.', selector: '.goals-metric-grid, .goals-strategy-panel' },
    { id: 'content', label: 'Metas e desempenho', description: 'Cards, equipe ou histórico.', selector: '.goals-grid, .team-goals-panel', required: true },
  ],
  automations: [
    { id: 'toolbar', label: 'Comando de automações', description: 'Busca, filtros, teste e criação.', selector: '.automations-page-header-v10167', required: true },
    { id: 'health', label: 'Saúde operacional', description: 'Ativas, falhas, fila e execuções.', selector: '.automation-health-grid-v10167' },
    { id: 'content', label: 'Área de automações', description: 'Regras, modelos, webhooks, operação e histórico.', selector: '.automation-rule-grid, .automation-recipe-grid, .automation-webhooks-page, .automation-operations, .automation-history-panel', required: true },
  ],
  prospecting: [
    { id: 'command', label: 'Comando do Garimpo', description: 'Origem, busca, importação e extensão.', selector: '.prospecting-page-header-h20', required: true },
    { id: 'metrics', label: 'Indicadores do fluxo', description: 'Capturados, em análise, aprovados e enviados.', selector: '.prospecting-summary-strip-h20' },
    { id: 'workspace', label: 'Fluxo operacional', description: 'Busca, processamento, revisão e resultados.', selector: '.prospecting-search-layout, .prospecting-processing-layout, .prospecting-results-panel, .prospecting-kanban, .prospecting-history-panel', required: true },
    { id: 'integration', label: 'Integração com CRM', description: 'Confirmação de envio e continuidade.', selector: '.prospecting-footer-callout' },
  ],
  metrics: [
    { id: 'command', label: 'Comando de métricas', description: 'Período, filtros, exportação e comparação.', selector: '.metrics-page-header-v10167', required: true },
    { id: 'views', label: 'Áreas analíticas', description: 'Visão geral, funil, perdas, atividades e forecast.', selector: '.workspace-view-strip-v10169' },
    { id: 'alerts', label: 'Alertas executivos', description: 'Mudanças relevantes e pontos de atenção.', selector: '.metrics-alert-panel' },
    { id: 'kpis', label: 'Indicadores principais', description: 'KPIs do recorte selecionado.', selector: '.metrics-kpi-strip, .metrics-executive-grid, .metrics-forecast-hero, .metrics-forecast-grid' },
    { id: 'analysis', label: 'Análises detalhadas', description: 'Gráficos, diagnóstico e recomendações.', selector: '.metrics-overview-grid, .metrics-funnel-professional, .metrics-summary-banner', required: true },
  ],
  settings: [
    { id: 'hero', label: 'Resumo administrativo', description: 'Prontidão, busca e contexto das configurações.', selector: '.rt-workspace-page-header, .settings-command-bar-h20', required: true },
    { id: 'content', label: 'Configurações', description: 'Navegação agrupada e conteúdo administrativo.', selector: '.settings-v1100__body', required: true },
  ],
}
