import type { AppRoute } from '../domain/types'

export type HelpCategory = 'Começando' | 'Operação' | 'Comunicação' | 'Gestão' | 'Inteligência' | 'Configurações'

export interface HelpArticle {
  id: string
  title: string
  summary: string
  category: HelpCategory
  route?: AppRoute
  keywords: string[]
  steps: string[]
  tips?: string[]
  related?: string[]
}

export interface GuidedTourStep {
  id: string
  route: AppRoute
  title: string
  description: string
  action: string
}

export interface GuidedTour {
  id: string
  title: string
  description: string
  audience: string
  steps: GuidedTourStep[]
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'start-day', title: 'Começar o dia no Meu Dia', category: 'Começando', route: 'dashboard',
    summary: 'Use o Meu Dia para decidir o que merece atenção agora e executar a próxima ação sem procurar em várias abas.',
    keywords: ['meu dia', 'prioridades', 'começar', 'hoje', 'visualização inteligente', 'personalizar'],
    steps: ['Abra Meu Dia.', 'Revise atrasados, atividades de hoje e oportunidades em risco.', 'Use a Visualização Inteligente para entender o motivo da prioridade.', 'Execute a ação recomendada ou abra o negócio.', 'Use Personalizar visualização para ajustar blocos e ordem.'],
    tips: ['Prefira começar por itens vencidos e negócios com próxima ação ausente.', 'As preferências do Meu Dia ficam salvas no workspace.'],
    related: ['followup-daily', 'pipeline-work', 'assistant-context'],
  },
  {
    id: 'create-lead', title: 'Cadastrar ou importar leads', category: 'Começando', route: 'leads',
    summary: 'Centralize identidade, contato, empresa, origem, responsável e próxima ação antes de iniciar a execução comercial.',
    keywords: ['lead', 'novo lead', 'cadastrar', 'importar', 'csv', 'contato', 'empresa'],
    steps: ['Abra Contatos.', 'Use Novo contato para cadastro individual ou Importar para arquivo estruturado.', 'Revise telefone, e-mail, empresa, origem e responsável.', 'Verifique duplicidades antes de criar registros paralelos.', 'Defina a próxima ação para o contato entrar no fluxo operacional.'],
    related: ['account-360', 'prospecting-review'],
  },
  {
    id: 'account-360', title: 'Usar o Account 360 e decisores', category: 'Operação', route: 'leads',
    summary: 'Concentre empresa, contatos, decisores, relacionamentos, oportunidades e histórico em uma visão de conta.',
    keywords: ['account 360', 'conta', 'decisor', 'stakeholder', 'contatos', 'organograma'],
    steps: ['Abra um lead e entre no Account 360.', 'Revise contatos vinculados à empresa.', 'Classifique papel decisório e força de relacionamento.', 'Identifique lacunas: decisor econômico, champion ou influenciadores ainda não mapeados.', 'Use ações rápidas de ligação, WhatsApp ou e-mail quando permitido.'],
    related: ['territory-map', 'assistant-context'],
  },
  {
    id: 'pipeline-work', title: 'Trabalhar o Pipeline', category: 'Operação', route: 'pipeline',
    summary: 'Use Kanban, Lista, Previsão, Calendário ou Funil conforme a decisão que precisa tomar.',
    keywords: ['pipeline', 'kanban', 'lista', 'previsão', 'forecast', 'funil', 'etapa', 'negócio'],
    steps: ['Abra Pipeline.', 'Escolha a visualização adequada ao objetivo.', 'Filtre Meus negócios ou Todos os negócios.', 'Use as ações rápidas para ligar, enviar mensagem, criar follow-up ou proposta.', 'Mova a etapa somente quando o critério comercial correspondente tiver sido atendido.'],
    tips: ['Kanban é melhor para fluxo; Lista para operação em volume; Previsão para risco e receita.'],
    related: ['proposal-create', 'revenue-forecast'],
  },
  {
    id: 'followup-daily', title: 'Organizar Follow-ups', category: 'Operação', route: 'followups',
    summary: 'Mantenha cada oportunidade com uma próxima ação clara, responsável e data válida.',
    keywords: ['follow-up', 'followup', 'retorno', 'atividade', 'atrasado', 'reagendar', 'cadência'],
    steps: ['Abra Follow-ups.', 'Comece pelos atrasados e bloqueados.', 'Confira canal, responsável, prioridade e cadência.', 'Conclua a atividade registrando o resultado.', 'Quando necessário, use +2h, Amanhã útil ou Próximo dia útil para reagendar rapidamente.'],
    related: ['cadence', 'notifications'],
  },
  {
    id: 'calling-focus', title: 'Executar uma ligação em Modo Foco', category: 'Comunicação', route: 'calls',
    summary: 'Prepare contexto, roteiro e objetivo antes de ligar; durante a conversa registre somente o essencial.',
    keywords: ['ligação', 'ligar', 'modo foco', 'discador', 'calling', 'telefone'],
    steps: ['Abra Ligações e escolha o contato.', 'Revise preparação, objetivo e roteiro sugerido.', 'Inicie o Modo Foco.', 'Registre resultado, notas e próxima ação.', 'Finalize a sessão para o histórico e a inteligência comercial receberem o desfecho.'],
    related: ['playbook-execute', 'assistant-context'],
  },
  {
    id: 'communications', title: 'Usar a Central de Comunicação', category: 'Comunicação', route: 'communications',
    summary: 'Use uma caixa de entrada centrada no contato para WhatsApp, e-mail, Instagram, Facebook, LinkedIn, ligações e reuniões.',
    keywords: ['comunicação', 'omnichannel', 'inbox', 'whatsapp', 'email', 'e-mail', 'instagram', 'facebook', 'linkedin', 'timeline', 'histórico'],
    steps: ['Abra Comunicação.', 'Use Canais para filtrar WhatsApp, E-mail, Instagram, Facebook, LinkedIn, Ligações ou Reuniões.', 'Use Não lidas e Responder para priorizar conversas.', 'Selecione uma conversa ou vá direto para um contato.', 'Nos canais sociais assistidos, abra o perfil e registre somente o que realmente aconteceu.', 'Diferencie eventos oficiais/sincronizados de ações assistidas.'],
    related: ['whatsapp', 'calendar-sync'],
  },
  {
    id: 'social-inbox', title: 'Trabalhar Instagram, Facebook e LinkedIn', category: 'Comunicação', route: 'communications',
    summary: 'As redes sociais entram no Omnichannel Inbox com execução assistida e registro explícito da interação.',
    keywords: ['instagram', 'facebook', 'linkedin', 'rede social', 'dm', 'mensagem', 'perfil', 'assistido'],
    steps: ['Abra Comunicação e selecione a rede social no painel de Canais.', 'Escolha o contato.', 'Use Abrir perfil para executar a ação na rede.', 'Copie ou ajuste a mensagem sugerida quando necessário.', 'Registre como enviada ou recebida somente depois de confirmar o que ocorreu.', 'Quando uma capability oficial de mensagens estiver disponível e conectada, eventos sincronizados aparecem como oficiais.'],
    tips: ['O CRM não simula entrega/leitura em canais assistidos.', 'LinkedIn permanece assistido para evitar dependência de automações frágeis ou não permitidas.'],
    related: ['communications', 'whatsapp'],
  },
  {
    id: 'whatsapp', title: 'Enviar mensagem pelo WhatsApp', category: 'Comunicação', route: 'communications',
    summary: 'Use modo Assistido para abrir WhatsApp/Web ou Business oficial quando uma conta Cloud estiver conectada.',
    keywords: ['whatsapp', 'mensagem', 'template', 'business', 'cloud', 'assistido'],
    steps: ['Abra Comunicação ou use um botão WhatsApp no CRM.', 'Revise destinatário e template interno.', 'Edite a mensagem antes de executar.', 'No modo Assistido, o CRM abre o WhatsApp sem afirmar entrega.', 'No modo oficial, o envio depende de uma conta WhatsApp Cloud conectada.'],
    related: ['communications', 'notifications'],
  },
  {
    id: 'proposal-create', title: 'Criar e acompanhar propostas', category: 'Operação', route: 'proposals',
    summary: 'Propostas trabalham vinculadas à etapa de proposta do Pipeline e preservam histórico de versões.',
    keywords: ['proposta', 'orçamento', 'quote', 'catálogo', 'produto', 'preço'],
    steps: ['Coloque o negócio na etapa Proposta ou inicie a criação pela própria área de Propostas.', 'Selecione produtos/serviços do Catálogo.', 'Revise valores, condições e versão.', 'Envie ou compartilhe pelos canais permitidos.', 'Acompanhe status, Buyer Room, receita e forecast.'],
    related: ['pipeline-work', 'revenue-forecast'],
  },
  {
    id: 'calendar-sync', title: 'Configurar Google Agenda ou Microsoft Calendar', category: 'Configurações', route: 'settings',
    summary: 'Conecte uma conta externa, escolha o calendário e a direção de sincronização.',
    keywords: ['google agenda', 'calendar', 'microsoft', 'oauth', 'agenda externa', 'sincronizar'],
    steps: ['Abra Configurações → Agenda externa.', 'Conecte Google ou Microsoft via OAuth.', 'Escolha o calendário alvo.', 'Defina sincronização bidirecional, somente entrada ou somente saída.', 'Execute Testar conexão e depois Sincronizar agora.'],
    tips: ['Contas Google antigas podem precisar reconexão para conceder leitura da lista de calendários.'],
  },
  {
    id: 'territory-map', title: 'Usar Território e Mapa comercial', category: 'Operação', route: 'commercial-map',
    summary: 'Visualize carteira, risco, cobertura decisória e qualidade geográfica por território.',
    keywords: ['mapa', 'território', 'cidade', 'região', 'risco', 'cobertura'],
    steps: ['Abra Território.', 'Escolha o mapa-base Claro, Ruas ou Escuro.', 'Filtre região, responsável e risco.', 'Abra uma conta no mapa para acessar o Account 360.', 'Use cobertura decisória para identificar contas sem decisor mapeado.'],
    related: ['account-360'],
  },
  {
    id: 'playbook-execute', title: 'Executar um Roteiro comercial', category: 'Operação', route: 'playbooks',
    summary: 'Roteiros podem ser usados em Passo a passo, Checklist, Ligação ou Reunião.',
    keywords: ['roteiro', 'playbook', 'script', 'objeção', 'discovery', 'checklist'],
    steps: ['Abra Playbooks.', 'Escolha um roteiro compatível com etapa, segmento ou persona.', 'Clique Executar.', 'Escolha Passo a passo, Checklist, Ligação ou Reunião.', 'Use discovery e objeções como apoio, não como leitura mecânica.'],
    related: ['calling-focus'],
  },
  {
    id: 'goals', title: 'Criar e acompanhar Metas', category: 'Gestão', route: 'goals',
    summary: 'Acompanhe metas individuais ou de equipe por ritmo esperado, dias úteis e projeção.',
    keywords: ['meta', 'metas', 'objetivo', 'ritmo', 'projeção', 'equipe'],
    steps: ['Abra Metas.', 'Crie uma meta Individual ou de Equipe.', 'Escolha métrica e período.', 'Compare realizado, ritmo esperado e projeção.', 'Filtre metas em risco para priorizar gestão.'],
  },
  {
    id: 'revenue-forecast', title: 'Entender Revenue Intelligence', category: 'Gestão', route: 'proposals',
    summary: 'Separe Receita realizada, Receita prevista, Bookings, Pipeline ponderado e Forecast RealTalent.',
    keywords: ['receita', 'forecast', 'bookings', 'pipeline ponderado', 'ticket médio', 'win rate'],
    steps: ['Abra Propostas e Forecast.', 'Use Receita realizada para competência reconhecida.', 'Use Revenue Intelligence para forecast e pipeline ponderado.', 'Revise win rate, ticket médio e cortes por responsável, origem e produto.', 'Investigue receita sem vínculo comercial antes de confiar no forecast.'],
    related: ['proposal-create', 'goals'],
  },
  {
    id: 'automations', title: 'Criar uma Automação com segurança', category: 'Inteligência', route: 'automations',
    summary: 'Monte regras no formato Quando → Se → Então e teste antes de permitir execução real.',
    keywords: ['automação', 'quando', 'se', 'então', 'gatilho', 'ação', 'teste'],
    steps: ['Abra Automações.', 'Defina QUANDO a regra deve iniciar.', 'Adicione SE apenas quando houver uma condição necessária.', 'Escolha ENTÃO e revise os limites de segurança.', 'Execute o teste/preflight.', 'Somente depois promova para Execução real e confirme.'],
    tips: ['Qualquer mudança relevante invalida o preflight anterior.'],
  },
  {
    id: 'prospecting-review', title: 'Revisar Garimpo e enviar ao CRM', category: 'Operação', route: 'prospecting',
    summary: 'Use o Garimpo para executar buscas automáticas pelo Agent Linux, Google Places quando configurado, captura assistida e deduplicação antes de enviar registros aprovados.',
    keywords: ['garimpo', 'prospecção', 'data layer', 'duplicidade', 'enriquecimento', 'aprovar', 'google places', 'cnpj', 'rt capture'],
    steps: ['Abra Garimpo → Busca.', 'Informe segmento, uma ou mais regiões separadas por ponto e vírgula e a meta.', 'Se o Prospecting Agent Linux estiver conectado, use Garimpar automaticamente no Linux; ele usa OpenStreetMap/Overpass, sites públicos e enrichment cadastral. Google Places continua disponível com meta de 20 a 100 resultados quando configurado; nesse modo use Iniciar busca automática.', 'Você pode pausar, cancelar ou fechar o CRM; o job persiste no Agent e os resultados retornam para Revisão quando o CRM abrir novamente.', 'Para Instagram e fontes sem API oficial de descoberta, continue usando busca assistida, RT Capture ou Capturador Universal.', 'Revise e aprove os registros antes de Enviar ao CRM.'],
    tips: ['Google Places exige uma chave própria no gateway; sem ela o CRM mantém a busca assistida.', 'A busca automática para ao atingir a meta, esgotar páginas/regiões ou chegar ao limite seguro de consultas.', 'A consulta CNPJ é individual e não é usada para crawling ou varredura em massa.'],
    related: ['create-lead'],
  },
  {
    id: 'assistant-context', title: 'Usar o RealTalent Assistant e RealTalent AI', category: 'Inteligência',
    summary: 'O Assistant usa contexto, memória e tools controladas pelo RealTalent AI Gateway; escrita exige confirmação.',
    keywords: ['assistant', 'ia', 'realtalent ai', 'próxima ação', 'resumo', 'briefing', 'como faço'],
    steps: ['Abra o Assistant pelo ícone de robô ou Ctrl/⌘ + J.', 'Quando estiver em um negócio, o contexto atual é carregado automaticamente.', 'Peça resumo, preparação de ligação, próxima ação, reunião ou mensagem.', 'Para dúvidas de produto, pergunte “como faço … no CRM?”.', 'Revise qualquer ação mutável antes de confirmar.'],
    tips: ['O provider atual é local e determinístico; providers futuros passam pelo mesmo gateway e políticas.'],
  },
  {
    id: 'notifications', title: 'Configurar Notificações', category: 'Configurações', route: 'settings',
    summary: 'Escolha alertas internos e de navegador, frequência, horário silencioso e antecedências.',
    keywords: ['notificação', 'alerta', 'desktop', 'navegador', 'follow-up atrasado', 'meta em risco'],
    steps: ['Abra Configurações → Notificações.', 'Ative No CRM e, se desejar, Navegador/Desktop.', 'Escolha os tipos de alerta.', 'Configure frequência e horário silencioso.', 'Conceda a permissão do navegador quando solicitada.'],
  },
  {
    id: 'functional-audit', title: 'Ver o que realmente funciona no CRM', category: 'Configurações', route: 'settings',
    summary: 'A Auditoria funcional diferencia recurso funcional, parcial, apenas visual ou não implementado.',
    keywords: ['auditoria', 'funciona', 'parcial', 'diagnóstico', 'qa', 'ferramentas'],
    steps: ['Abra Configurações → Auditoria funcional.', 'Filtre por status ou área.', 'Leia limitação e próximo passo.', 'Use evidência técnica para diagnóstico.', 'Exporte o JSON quando precisar revisar a matriz fora do CRM.'],
  },
  {
    id: 'backup', title: 'Fazer backup antes de trocar de computador', category: 'Configurações', route: 'settings',
    summary: 'No modo local, os dados ficam no navegador; exporte um backup antes de limpar dados ou trocar de computador.',
    keywords: ['backup', 'restaurar', 'local', 'computador', 'dados', 'exportar'],
    steps: ['Abra Configurações.', 'Localize Backup/Exportação.', 'Exporte o arquivo completo.', 'Guarde o arquivo em local seguro.', 'No novo ambiente, use Restaurar e valide os dados antes de continuar.'],
  },
]

export const GUIDED_TOURS: GuidedTour[] = [
  {
    id: 'first-sales-cycle', title: 'Primeiro ciclo comercial', audience: 'Novo usuário',
    description: 'Percorra o fluxo Lead → Pipeline → Follow-up → Ligação → Agenda → Proposta.',
    steps: [
      { id: 'day', route: 'dashboard', title: 'Comece pelo Meu Dia', description: 'O CRM organiza prioridades e riscos para reduzir procura manual.', action: 'Revise o que precisa de ação agora.' },
      { id: 'lead', route: 'leads', title: 'Conheça a base de Leads', description: 'Identidade, conta, contato, origem e próxima ação começam aqui.', action: 'Abra um lead de exemplo ou crie um novo.' },
      { id: 'pipeline', route: 'pipeline', title: 'Organize o Pipeline', description: 'A etapa representa a situação comercial real do negócio.', action: 'Compare Kanban, Lista e Previsão.' },
      { id: 'followup', route: 'followups', title: 'Nunca deixe sem próxima ação', description: 'Follow-ups concentram retornos e cadências pendentes.', action: 'Confira atrasados e próximos contatos.' },
      { id: 'call', route: 'calls', title: 'Execute a conversa', description: 'O Modo Foco reúne contexto, roteiro e registro de resultado.', action: 'Abra a preparação de uma ligação.' },
      { id: 'agenda', route: 'agenda', title: 'Transforme intenção em compromisso', description: 'Reuniões e tarefas ficam conectadas ao histórico comercial.', action: 'Veja a agenda e a integração externa.' },
      { id: 'proposal', route: 'proposals', title: 'Feche o ciclo com proposta e receita', description: 'Propostas, catálogo e forecast se conectam ao Pipeline.', action: 'Revise uma proposta ou o Revenue Intelligence.' },
    ],
  },
  {
    id: 'manager', title: 'Gestão da operação', audience: 'Gestor',
    description: 'Passe pelas telas que mostram ritmo, risco, receita e automação.',
    steps: [
      { id: 'day', route: 'dashboard', title: 'Meu Dia', description: 'Veja prioridades da operação antes de abrir relatórios.', action: 'Observe riscos e itens sem próxima ação.' },
      { id: 'pipeline', route: 'pipeline', title: 'Pipeline', description: 'Compare volume, estágio, risco e previsão.', action: 'Abra a visão Previsão.' },
      { id: 'goals', route: 'goals', title: 'Metas', description: 'Compare realizado, ritmo esperado e projeção.', action: 'Filtre metas projetadas abaixo do alvo.' },
      { id: 'metrics', route: 'metrics', title: 'Métricas', description: 'Use conversão, perdas e atividades para entender o processo.', action: 'Investigue gargalos antes de cobrar volume.' },
      { id: 'automations', route: 'automations', title: 'Automações', description: 'Padronize rotinas sem abrir mão de teste e segurança.', action: 'Revise regras pausadas e histórico de execução.' },
    ],
  },
  {
    id: 'ai', title: 'RealTalent AI com segurança', audience: 'Todos',
    description: 'Entenda como contexto, memória, Assistant e confirmação de ações trabalham juntos.',
    steps: [
      { id: 'pipeline', route: 'pipeline', title: 'Comece por um negócio real', description: 'A IA fica mais útil quando existe contexto de oportunidade.', action: 'Abra um negócio e depois o Assistant.' },
      { id: 'communications', route: 'communications', title: 'Rascunho não é envio', description: 'Mensagens sugeridas passam pela Central de Comunicação e revisão humana.', action: 'Compare canais assistidos e oficiais.' },
      { id: 'automation', route: 'automations', title: 'Automação tem preflight', description: 'Execução real depende de teste válido e confirmação.', action: 'Abra uma regra e veja Testar/Ativar.' },
      { id: 'settings', route: 'settings', title: 'Governança da RealTalent AI', description: 'Context Engine, tools, permissões e auditoria ficam visíveis em Configurações.', action: 'Abra RealTalent AI e revise o runtime.' },
    ],
  },
]

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export function searchHelpArticles(query: string, currentRoute?: AppRoute, limit = 8): HelpArticle[] {
  const normalized = normalize(query)
  if (!normalized) {
    return HELP_ARTICLES
      .map((article) => ({ article, score: article.route === currentRoute ? 4 : 0 }))
      .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title, 'pt-BR'))
      .slice(0, limit)
      .map(({ article }) => article)
  }
  const terms = normalized.split(/\s+/).filter((term) => term.length > 1)
  return HELP_ARTICLES
    .map((article) => {
      const title = normalize(article.title)
      const summary = normalize(article.summary)
      const haystack = normalize(`${article.title} ${article.summary} ${article.keywords.join(' ')} ${article.steps.join(' ')}`)
      let matchScore = 0
      if (title.includes(normalized)) matchScore += 12
      if (summary.includes(normalized)) matchScore += 7
      for (const term of terms) {
        if (title.includes(term)) matchScore += 4
        else if (article.keywords.some((keyword) => normalize(keyword).includes(term))) matchScore += 3
        else if (haystack.includes(term)) matchScore += 1
      }
      const score = matchScore > 0 ? matchScore + (article.route === currentRoute ? 2 : 0) : 0
      return { article, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title, 'pt-BR'))
    .slice(0, limit)
    .map(({ article }) => article)
}

export function findHelpArticle(id: string) { return HELP_ARTICLES.find((article) => article.id === id) ?? null }
export function getHelpArticlesForRoute(route: AppRoute, limit = 5) { return HELP_ARTICLES.filter((article) => article.route === route).slice(0, limit) }
