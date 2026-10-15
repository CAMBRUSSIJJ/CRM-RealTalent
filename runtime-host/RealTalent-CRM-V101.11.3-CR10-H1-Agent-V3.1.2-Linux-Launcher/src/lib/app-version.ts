export const APP_VERSION = '101.11.3'
export const APP_VERSION_LABEL = 'V101.11.3'
export const BACKUP_SCHEMA_VERSION = '100.54'

// V101.7.0 — Workspace Simplification & Unified Filter Engine: remove o banner global de IA, consolida filtros em popovers com portal e transforma exibições em recortes persistentes baseados em filtros.

// V101.7.1 — Metrics & Calling Structural Redesign: reestrutura Métricas, Funil, Ligações, preparação e Modo Foco com layouts realmente distintos.

// V101.7.1 Hotfix 2 — Interaction Surfaces 2.0: unifica Filter Builder, Sort, Display, menus e drawers sem alterar dados.

// V101.7.1 Hotfix 3 — UX Consolidation: reduz densidade, corrige feedback duplicado e consolida busca, Meu Dia, Pipeline, Propostas e Calling.
// V101.8.0 — RealTalent Connect MVP: pareamento seguro por workspace, QR local, companion móvel, tempo real WebSocket + fallback, revogação e contexto comercial da chamada.

// V101.8.1 — RealTalent Connect Setup & Reliability: corrige CORS do Phone API, separa bridge/celular/discador, melhora LAN e adiciona diagnóstico + chamada de teste.

// V101.8.2 — RealTalent Connect Fast Dial & Power Queue: auto-dispatch no CRM, abertura assistida do discador no Phone e avanço automático de fila.

// V101.8.3 — RealTalent Connect One-Tap para iPhone: companion web/PWA, presença explícita, abertura tel: imediata, fallback único e estado One-Tap no CRM.

// V101.8.4 — Official Communications: Gmail/Outlook/WhatsApp Cloud dentro da Central de Comunicação com composer inline, sync sob demanda e vínculo Lead ↔ ContactRecord.

// V101.9.0 — Core Metadata Foundation: ObjectRegistry, FieldRegistry, RelationRegistry e adapters compatíveis com a UI legada.

// V101.9.1 — Universal View Engine: ViewDefinition persistente, Filter AST AND/OR/NOT e adapters transparentes para Contatos + Pipeline.

// V101.9.2 — Universal Record Page: RecordPageShell + widgets universais, migrando Contato/Pessoa sem remover Deal Intelligence, Account 360 ou Comunicação.

// V101.9.3 — Person / Company / Opportunity Canonical Model: Pessoa, Empresa e Oportunidade viram autoridades; Lead permanece como projection de compatibilidade.

// V101.9.4 — Global Event Bus: eventos de domínio unificam mutações locais, Supabase Realtime, Communications SSE e projeções operacionais.

// V101.9.5 — Workflow Runtime 3.0: scheduler persistente, wait/branch, retries, idempotência e inspector de execuções.

// V101.9.6 — Permission Matrix: autorização unificada por objeto, campo, ação e escopos de integração.

// V101.9.7 — Extension Registry: manifests, providers, commands/actions, feature flags e lifecycle hooks centralizam integrações plugáveis.

// V101.9.8 — Design System Consolidation: tokens e primitives canônicos convergem a UI sem remover prematuramente o CSS legado.

// V101.9.9-H3 — UX Recovery & Operational Fixes: recupera shell visual, proposal wizard e Garimpo multinavegador.

// V101.9.9-H4 — Workspace Appearance & Theme Personalization: remove a topbar verde obrigatória e permite personalizar topbar, sidebar, canvas, surfaces e accent por workspace.

// V101.10.0 — Settings Experience 2.0: navegação, busca, botões, save bar e progressive disclosure padronizam a Central de Configurações.

// V101.10.1 — Prospecting Search Automation: busca paginada, multi-região, deduplicação e progresso do Garimpo.

// V101.10.2-H1 — Prospecting Agent UX & Launch Flow: formulário principal, painel local e reconexão resiliente.
// V101.10.2-H2 — CSS Build Hotfix: corrige escapes literais de newline que quebravam o Lightning CSS.
// V101.10.2 — Prospecting Agent for Linux: fila local persistente, OpenStreetMap/Overpass, crawler público, enrichment e campanhas.

// V101.10.2-H3 — Prospecting Search Runtime Fix: OSM resiliente, busca web pública e diagnóstico de rede.

// V101.10.3 — Garimpo Search & Processing Engine: campanhas territoriais, células adaptativas, expansão de consultas, saturação, resolver, evidências e qualidade antes da Revisão.

// V101.10.3-H1 — Drawn Territory Search: seleção por polígono controla células, filtragem geográfica e cobertura real do Garimpo.

// V101.10.3-H5 — Independent Enrichment Jobs: Website/CNPJ/Contact/Social Discovery persistentes, retries e reprocessamento isolado.

// V101.10.3-H6 — Progressive Processing: empresas prontas entram na Revisão durante a campanha com cursor/ACK persistente.

// V101.10.3-H7 — Review Workspace 2.0: Revisão Lista | Guiada, filtros de qualidade/duplicidade, operações em lote e reprocessamento seletivo.

// V101.10.4 — Local Discovery Experience: Place-First Search, mapa/raio operacional, aba Local e Review 3.0.

// V101.10.5 — Selection & Filter System: Select/Combobox/MultiSelect/EntityPicker/FilterSelect/Checkbox/SelectionToolbar canônicos e rollout progressivo.

// V101.10.5-H3 — Contact Intelligence & Language Standardization: timeline compacta/codificada, notas orientadas à venda, sidebar recolhível por hover e terminologia unificada.

// V101.10.6 — Garimpo UX Consolidation: simplifica Buscar → Local → Revisar → Histórico, move processamento técnico para detalhes da campanha, torna raio manipulável no mapa e prioriza revisão por exceção.

// V101.10.6-H2 — Global Selection & Ownership Fix: rollout rico sem selects nativos nas features, OwnerPicker global e equipe local atribuível sem login.

// V101.10.7 — Security & Runtime Foundation: autenticação de gateways locais, Host/Origin hardening, pairing rate limit, webhooks fail-closed e launcher rápido com npm ci determinístico.

// V101.10.8 — Runtime & Developer Experience Consolidation: launcher Node multiplataforma, health/readiness/status locais, compatibilidade Linux e gates de runtime sem alteração da UX ou do modelo de dados.

// V101.10.9 — CSS & Design System Consolidation: congela nova dívida CSS versionada e consolida Pipeline, Follow-ups e RealTalent Connect em folhas canônicas sem alterar regras funcionais.

// V101.10.9-H1 — Global UI Consolidation: consolida App Shell e componentes globais em folhas canônicas com equivalência de cascade.

// V101.10.9-H2 — Contacts & Account 360 CSS Consolidation: consolida Contatos, ficha, inteligência e Account 360 sem alterar seletores, dados ou regras funcionais.

// V101.10.9-H3 — Calling & RealTalent Connect CSS Consolidation: consolida Ligações, Calling Intelligence e Connect em superfícies canônicas, preservando cascade e comportamento operacional.
// V101.10.9-H4 — Garimpo & Automations CSS Consolidation: consolida Automações e Garimpo em superfícies canônicas sem alterar agentes, jobs, regras, dados ou integrações.
// V101.10.9-H5 — Dead CSS Removal: remove fisicamente CSS legados comprovadamente supersededidos, preservando conteúdo/cascade nas folhas canônicas.

// V101.11.0 — Communications Architecture: gateway cloud compartilhado para WhatsApp/Gmail/Microsoft, validação específica por provider, idempotência estável, correlation IDs e wrappers legados sem big-bang.

// V101.11.1 — Login Experience & Reliability: fallback determinístico de sessão, splash RealTalent animado e login rebrandizado sem alterar autenticação local ou regras de dados.

// V101.11.1-H1 — Login Gate & Logout: modo local passa por uma sessão explícita antes do workspace e Sair da conta volta ao gate sem apagar dados.

// V101.11.1-H2 — Cinematic Login & Brand Motion: fundo full-screen azul/teal e animação cinematográfica da própria logo RT, preservando Login Gate & Logout.
// V101.11.1-H3 — Official Logo Motion: integra o ícone oficial fornecido pelo usuário e recalibra a animação/paleta ao azul + teal da marca.

// V101.11.1-H4 — Transparent Logo & Optimized Motion: remove o tile claro no login, anima R + barras em camadas, usa a própria marca como progresso e adiciona transição compartilhada otimizada.

// V101.11.2 — Teams & Tasks Foundation: equipes, membros, tarefas, relações CRM, checklist, carga de trabalho e novas áreas na navegação.

// V101.11.3 — Actionable Pipeline Experience: KPIs acionáveis, Smart Views, Single Action Bar, Kanban Card 3.0, Deal Rotting e hover actions.

// V101.11.3-H1 — Communications Gateway Recovery: recuperação segura de processos antigos, diagnóstico de porta/log e inicialização degradada sem bloquear o CRM.

// V101.11.3-H2 — Runtime Service Recovery: recupera Connect/Communications órfãos com escopo seguro, diagnóstico de porta/log e modo degradado sem bloquear o CRM.
// V101.11.3-H3 — Calling Workspace 2.0: pré-call intelligence, metas operacionais, objeções estruturadas, wrap-up 2.0 e roteiro Guiado/Completo/Mapa.

// V101.11.3-H11 — Proposal & Catalog Pricing 3.0: centraliza pricing, preserva snapshots de preço/custo, liga catálogo às propostas, adiciona guardrails comerciais e profissionaliza Catálogo/Propostas.

// V101.11.3-H12 — Commercial Product Studio & Catalog-First Proposals: catálogo como fonte de verdade, proposta baseada em produtos, Product Studio e inteligência comercial por produto.

// V101.11.3-H19.2 — Communication Workspace & WhatsApp Connection Center: sub-abas por canal, contexto CRM e conexão WhatsApp por QR dentro do workspace.

// V101.11.3-H19.12 — Communication Workspace Lineage Recovery: preserva H19.11 Pure Chat/Control Center e impede preview/source antigo de mascarar a UI atual.
