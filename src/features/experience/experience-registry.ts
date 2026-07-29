import type { AppRoute } from '../../domain/types'

export interface ExperienceSectionDefinition {
  id: string
  label: string
  description: string
  selector: string
  required?: boolean
}

export const pageSectionRegistry: Record<AppRoute, ExperienceSectionDefinition[]> = {
  dashboard: [
    { id: 'hero', label: 'Abertura do dia', description: 'Saudação e início da rotina comercial.', selector: '.workday-hero', required: true },
    { id: 'health', label: 'Saúde comercial', description: 'SLA, fila, Pipeline e meta atual.', selector: '.health-strip' },
    { id: 'score', label: 'Lead Score', description: 'Prioridades e alertas de qualidade.', selector: '.lead-score-overview' },
    { id: 'execution', label: 'Execução principal', description: 'Próxima ação e fila inteligente.', selector: '.dashboard-execution-grid', required: true },
    { id: 'summary', label: 'Resumo comercial', description: 'Indicadores consolidados da operação.', selector: '.commercial-summary-grid' },
    { id: 'insights', label: 'Análises complementares', description: 'Riscos, desempenho e continuidade.', selector: '.dashboard-bottom-grid' },
  ],
  leads: [
    { id: 'health', label: 'Indicadores de Leads', description: 'Ativos, atrasados, sem ação e recentes.', selector: '.lead-health-strip' },
    { id: 'views', label: 'Visualizações salvas', description: 'Atalhos para recortes frequentes.', selector: '.lead-view-tabs' },
    { id: 'toolbar', label: 'Busca e ações', description: 'Pesquisa, filtros, importação e criação.', selector: '.leads-toolbar', required: true },
    { id: 'filters', label: 'Filtros avançados', description: 'Painel detalhado de segmentação.', selector: '.leads-advanced-filters, .lead-filter-chips' },
    { id: 'data', label: 'Base de Leads', description: 'Tabela ou cards com os registros.', selector: '.leads-data-panel', required: true },
  ],
  'commercial-map': [
    { id: 'map', label: 'Mapa comercial', description: 'Mapa, filtros territoriais e lista lateral.', selector: '#commercial-map-root', required: true },
  ],
  pipeline: [
    { id: 'summary', label: 'Resumo do Pipeline', description: 'Volume, valor, previsão e conversão.', selector: '.pipeline-summary-v1008' },
    { id: 'attention', label: 'Fila de atenção', description: 'Negócios críticos e sem próxima ação.', selector: '.pipeline-action-center' },
    { id: 'toolbar', label: 'Busca e ações', description: 'Filtros, visões, cards e criação.', selector: '.pipeline-toolbar-v1008', required: true },
    { id: 'views', label: 'Modos de visualização', description: 'Kanban, lista, forecast, agenda e funil.', selector: '.pipeline-view-switcher', required: true },
    { id: 'filters', label: 'Filtros avançados', description: 'Critérios comerciais adicionais.', selector: '.advanced-filters--pipeline, .pipeline-saved-strip' },
    { id: 'content', label: 'Conteúdo do Pipeline', description: 'Negócios da visualização selecionada.', selector: '.pipeline-board, .pipeline-list-view, .pipeline-forecast-view, .pipeline-calendar-view, .pipeline-funnel-view', required: true },
  ],
  followups: [
    { id: 'command', label: 'Comando da fila', description: 'Busca, filtros e início da execução.', selector: '.followup-command-bar, .followups-toolbar', required: true },
    { id: 'views', label: 'Visualizações', description: 'Fila, quadro, calendário e cadências.', selector: '.followup-view-tabs' },
    { id: 'filters', label: 'Filtros ativos', description: 'Recortes aplicados à rotina.', selector: '.followup-filter-chips' },
    { id: 'workspace', label: 'Área de execução', description: 'Fila e contexto do lead.', selector: '.followup-workspace-layout, .followup-board, .followup-calendar, .cadence-dashboard, .followup-performance', required: true },
  ],
  calls: [
    { id: 'command', label: 'Comando de ligações', description: 'Preparação da sessão e ações principais.', selector: '.calls-command-bar', required: true },
    { id: 'summary', label: 'Resumo da operação', description: 'Indicadores rápidos da rotina.', selector: '.calls-summary-strip' },
    { id: 'views', label: 'Visualizações', description: 'Fila, histórico e desempenho.', selector: '.calls-view-tabs' },
    { id: 'toolbar', label: 'Filtros da Central', description: 'Pesquisa, resultado e preferências.', selector: '.calls-toolbar' },
    { id: 'workspace', label: 'Central de execução', description: 'Fila, roteiro e área de ligação.', selector: '.calls-operations-layout, .calls-history-layout', required: true },
    { id: 'performance', label: 'Desempenho', description: 'Indicadores e diagnóstico das chamadas.', selector: '.calls-performance-grid', required: true },
  ],
  proposals: [
    { id: 'command', label: 'Comando de propostas', description: 'Filtros, ações e criação.', selector: '.proposals-command-bar, .proposals-toolbar', required: true },
    { id: 'summary', label: 'Indicadores financeiros', description: 'Receita, forecast e propostas.', selector: '.proposal-metrics, .proposals-summary-grid' },
    { id: 'views', label: 'Áreas comerciais', description: 'Propostas, catálogo, receita e forecast.', selector: '.proposal-tabs, .proposals-view-tabs' },
    { id: 'content', label: 'Conteúdo principal', description: 'Área selecionada de propostas e receita.', selector: '.proposals-content, .proposal-list, .product-grid, .forecast-dashboard', required: true },
  ],
  agenda: [
    { id: 'command', label: 'Comando da Agenda', description: 'Período, visualização e novo compromisso.', selector: '.agenda-command-bar, .calendar-toolbar', required: true },
    { id: 'summary', label: 'Resumo da Agenda', description: 'Compromissos, conflitos e lembretes.', selector: '.agenda-summary, .calendar-summary-strip' },
    { id: 'calendar', label: 'Calendário', description: 'Grade principal de compromissos.', selector: '.calendar-shell, .agenda-workspace', required: true },
  ],
  playbooks: [
    { id: 'command', label: 'Busca e categorias', description: 'Pesquisa, filtros e novo conteúdo.', selector: '.playbooks-toolbar, .playbook-command-bar', required: true },
    { id: 'library', label: 'Biblioteca', description: 'Scripts, objeções e modelos.', selector: '.playbook-grid, .playbooks-layout, .playbook-list', required: true },
  ],
  goals: [
    { id: 'command', label: 'Comando de metas', description: 'Período, escopo e criação.', selector: '.goals-command-bar', required: true },
    { id: 'views', label: 'Visualizações', description: 'Geral, equipe e histórico.', selector: '.goals-view-tabs' },
    { id: 'summary', label: 'Resumo de metas', description: 'Progresso, ritmo e projeção.', selector: '.goals-summary-grid, .goal-metrics-grid' },
    { id: 'content', label: 'Metas e desempenho', description: 'Cards, equipe ou histórico.', selector: '.goals-grid, .team-goals-panel, .goals-history-panel', required: true },
  ],
  automations: [
    { id: 'toolbar', label: 'Comando de automações', description: 'Busca, filtros, teste e criação.', selector: '.automations-toolbar', required: true },
    { id: 'health', label: 'Saúde operacional', description: 'Ativas, falhas, fila e execuções.', selector: '.automation-health-grid' },
    { id: 'content', label: 'Área de automações', description: 'Regras, modelos, webhooks, operação e histórico.', selector: '.automation-rule-list, .automation-recipes-grid, .automation-webhooks-page, .automation-operations, .automation-history-panel', required: true },
  ],
  prospecting: [
    { id: 'command', label: 'Comando do Garimpo', description: 'Origem, busca, importação e extensão.', selector: '.prospecting-command', required: true },
    { id: 'metrics', label: 'Indicadores do fluxo', description: 'Capturados, em análise, aprovados e enviados.', selector: '.prospecting-metrics' },
    { id: 'workspace', label: 'Fluxo operacional', description: 'Busca, processamento, revisão e resultados.', selector: '.prospecting-search-layout, .prospecting-processing-layout, .prospecting-results-panel, .prospecting-kanban, .prospecting-history-panel', required: true },
    { id: 'integration', label: 'Integração com CRM', description: 'Confirmação de envio e continuidade.', selector: '.prospecting-footer-callout' },
  ],
  metrics: [
    { id: 'command', label: 'Comando de métricas', description: 'Período, filtros, exportação e comparação.', selector: '.metrics-command-bar', required: true },
    { id: 'views', label: 'Áreas analíticas', description: 'Visão geral, funil, perdas, atividades e forecast.', selector: '.metrics-view-tabs' },
    { id: 'alerts', label: 'Alertas executivos', description: 'Mudanças relevantes e pontos de atenção.', selector: '.metrics-alerts, .metrics-alert-strip' },
    { id: 'kpis', label: 'Indicadores principais', description: 'KPIs do recorte selecionado.', selector: '.metrics-kpi-strip, .metrics-executive-grid, .metrics-forecast-hero, .metrics-forecast-grid' },
    { id: 'analysis', label: 'Análises detalhadas', description: 'Gráficos, diagnóstico e recomendações.', selector: '.metrics-overview-grid, .metrics-funnel-grid, .metrics-summary-banner', required: true },
  ],
  settings: [
    { id: 'hero', label: 'Resumo administrativo', description: 'Prontidão e contexto das configurações.', selector: '.settings-v16__hero' },
    { id: 'content', label: 'Configurações', description: 'Navegação e conteúdo administrativo.', selector: '.settings-v16__body', required: true },
  ],
}
