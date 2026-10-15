# V101.11.3-H20.3 — Global UI & Product Cohesion

- Design System Truth: azul canônico para interação e verde semântico para sucesso.
- CSS Cascade Recovery: camada H20 final + runtime guard contra CSS lazy tardio.
- Global Workspace Shell criado e aplicado em Tarefas, Equipes e Follow-ups.
- Regressões visuais históricas de Follow-ups corrigidas.
- H19.13 WhatsApp Work Management preservado.
- Sem migrations novas.

# V101.11.3-H19.8-H1 — WhatsApp Runtime Recovery

- Communications Gateway passa a ter recuperação ativa no runtime local.
- Supervisor monitora healthcheck e reinicia gateway sem resposta.
- Runtime Control expõe status, diagnóstico e reinício autenticado de Communications.
- Configurações > WhatsApp permite reiniciar o serviço sem fechar o CRM.
- QR tenta recuperar o gateway antes de iniciar a sessão.
- Erros crus de rede deixam de aparecer para o usuário.

# V101.11.3-H19.8 — WhatsApp Continuous Chat & Settings Control Center

- Corrige a descontinuidade visual do chat: header, histórico e composer passam a ocupar um único canvas contínuo.
- Mantém o WhatsApp Pure Chat sem proposta, respostas rápidas, estado comercial ou ações CRM dentro da conversa.
- Reorganiza Configurações > WhatsApp em Visão geral, Contas e conexão, Mensagens, Templates, Equipe e Diagnóstico.
- Preserva QR Local e Cloud API, modo assistido/oficial, templates internos, webhook e diagnósticos existentes.
- Templates passam de formulários extensos para biblioteca com busca, filtro, edição, duplicação, ativação e restauração.
- Integra a seção Equipe aos dados reais do módulo Equipes sem anunciar roteamento automático ainda inexistente.

# V101.11.3-H19.6 — WhatsApp Native UX & Follow-up Focus

- WhatsApp mantém o seletor de canal no topo, mas o corpo passa a se comportar como mensageiro: conversa compacta, histórico contínuo e composer leve.
- Estado desconectado deixa de dominar a conversa; conexão vira aviso operacional compacto e acionável.
- O estado técnico de realtime deixa de aparecer como “Ao vivo” ao lado de um WhatsApp desconectado.
- Follow-ups ganham navegação e toolbar condensadas, cards de leitura rápida e ações secundárias sob demanda.
- Metadados internos `[[CRM_COMMERCIAL_ACTION:...]]` são sanitizados antes de chegar à UI.
- Eventos com a mesma origem técnica (`sourceType:sourceId`) são deduplicados com segurança, sem mesclar reuniões apenas por semelhança textual.
- Meu Dia permanece inalterado.

# V101.11.3-H19.5 — Channel Workspaces & Collaborative Tasks

- Central de Comunicação passa a abrir no WhatsApp e reduz a navegação primária a WhatsApp/E-mail.
- E-mail ganha workspace dedicado com thread, assunto, conta remetente e envio oficial Gmail/Outlook pelo motor existente.
- Tarefas passam a relacionar Equipe e Pessoa pelos memberships reais do CRM.
- Checklist textual é substituído por checklist item a item, com progresso, edição, conclusão, remoção, ocultação e reordenação por arraste.
- Preserva Connection Center, WhatsApp Sales Workspace, Lead Context Drawer e as 54 migrations.

# V101.11.3-H19.4 — Communication Focus Experience

- Remove o Contexto CRM fixo da terceira coluna e deixa Conversas + Conversa como superfície principal.
- Move contato, negócio e histórico para Lead Context Drawer sob demanda.
- Compacta estado comercial e amplia a área útil do chat.

# V101.11.3-H19.3 — WhatsApp Sales Workspace

- Transforma o chat WhatsApp em superfície de execução comercial dentro da Central de Comunicação.
- Adiciona estados **Aguardando você / Aguardando cliente / Resolvido** com reinferência quando chega evento novo.
- Permite converter mensagens em Follow-up, Tarefa e Nota usando o repositório de atividades existente.
- Adiciona respostas rápidas comerciais e compartilhamento de proposta pelo composer com Buyer Room.
- A proposta só muda para enviada depois do sucesso do envio WhatsApp; o compartilhamento é registrado no Buyer Room.
- Preserva QR/Cloud, Gateway, histórico, realtime e 54 migrations; sem migration nova.

# V101.11.3-H19.2 — Communication Workspace & WhatsApp Connection Center

- Organiza Comunicações por canal e em três áreas: Conversas, Conversa e Contexto CRM.
- Aplica identidade RealTalent ao chat e reserva verde para semântica do WhatsApp/sucesso.
- Adiciona Connection Center no próprio chat para QR local e WhatsApp Cloud API.
- Preserva a infraestrutura omnichannel e de recovery existente.

# V101.11.3-H11 — Proposal & Catalog Pricing 3.0

- Corrige a tabela de propostas que era comprimida por CSS legado e normaliza o estado Oficial para o azul do CRM.
- Centraliza subtotal, desconto, imposto, MRR, ARR e TCV em um Proposal Pricing Engine reutilizado por Forecast.
- Liga itens de proposta ao catálogo com snapshot histórico de preço/custo/desconto e estado explícito de preço negociado.
- Corrige o retorno para Item manual, removendo de verdade o vínculo com o produto.
- Adiciona guardrails de desconto máximo e margem mínima por produto.
- Padroniza seleções de Propostas/Catálogo sem checkbox nativo.
- Reconstrói Catálogo como workspace profissional com preço, custo, margem, política, uso vigente/histórico e status.
- Adiciona migration H11; total passa a 51 migrations.

# V101.11.3-H6 — Playbook Studio 2.0

- Playbook passa a ter Visual Conversation Builder com mapa editável.
- Nós tipados, caminhos, ramificações, Inspector e templates.
- Visualizações Mapa, Estrutura, Script e Execução.
- Playbooks legados ganham conversão compatível para conversationGraph.
- Execution engine passa a derivar passos do grafo, preservando o editor clássico.
- Sem migration nova.

# V101.11.3-H2 — Runtime Service Recovery

- Recovery seguro do RealTalent Connect na porta 3001, seguindo a mesma política já aplicada ao Communications Gateway.
- Connect e Communications passam a ser serviços opcionais do launcher: falha gera diagnóstico observável e modo degradado, sem bloquear a UI.
- Porta/PID/cwd/log são exibidos quando um serviço não sobe. Processos desconhecidos não são encerrados.

# V101.11.3-H1 — Communications Gateway Recovery

- Detecta processos antigos `realtalent-communications-supervisor.mjs` e `realtalent-communications-gateway.mjs` antes de iniciar a porta 3002.
- Encerra somente processos reconhecidos dentro de pastas RealTalent; listeners desconhecidos nunca são mortos automaticamente.
- Reutiliza um Communications Gateway saudável quando ele já está ativo com o token/runtime esperado.
- Mostra diagnóstico de porta, PID e as últimas linhas de `.realtalent-communications.log` diretamente no terminal.
- Se o Gateway continuar indisponível, o CRM inicia em modo degradado; apenas Comunicações fica temporariamente indisponível.
- `npm run doctor` passa a mostrar processos/porta/log de Communications sem modificar o runtime.
- Preserva integralmente a V101.11.3 — Actionable Pipeline Experience, Teams & Tasks, login e arquitetura omnichannel.

# V101.11.3 — Actionable Pipeline Experience

- KPIs do Pipeline agora são acionáveis e orientados à meta.
- Smart Views, busca, filtros, ordenação, densidade e criação foram consolidados em uma Single Action Bar.
- Kanban Card 3.0 reduz o card a negócio, contato, valor e próxima ação.
- Deal Rotting usa borda/fundo visual em vez de texto de alerta longo.
- Hover Actions expõem Ligar, Mensagem/E-mail e Concluir próxima tarefa sem abrir o registro.

# V101.11.2 — Teams & Tasks Foundation

- Adiciona as áreas **Tarefas** e **Equipes** à navegação do CRM.
- Introduz Team, TeamMembership, WorkTask, TaskRelation, checklist e comentários com persistência local e Supabase.
- Cria carga de trabalho por pessoa e relações de tarefas com contatos, empresas, oportunidades, pipeline, playbooks e reuniões.
- Mantém V101.11.1-H5, Comunicações e Login sem alteração funcional.

# V101.11.1-H5 — Full Canvas & Orbit Field

- Corrige o corte visual herdado de `core-v100.css` que limitava círculos decorativos à coluna esquerda da tela de login.
- Garante canvas contínuo `100dvh`/full-screen, sem faixa ou quebra na divisão entre showcase e formulário.
- Adiciona três órbitas de escala de página ao redor de toda a viewport, com movimento lento, pontos orbitais e profundidade azul/teal.
- Mantém as órbitas menores da logo e reaproveita o mesmo campo orbital também no splash para continuidade visual.
- Preserva Login Gate, logout, autenticação Supabase, modo local, dados e 49 migrations.
- Respeita `prefers-reduced-motion` e usa somente `transform/opacity` nos loops para reduzir custo de composição.

# V101.11.1-H4 — Transparent Logo & Optimized Motion

- Remove o fundo branco apenas da variante usada no login/splash; o ícone oficial claro continua preservado para app/PWA.
- Separa visualmente R e barras da marca para uma animação de construção com barras ascendentes, reveal do R e scan único.
- Usa a própria marca como indicador de carregamento e adiciona transição compartilhada splash → login quando o navegador suporta View Transitions.
- Otimiza a motion layer priorizando transform/opacity, reduzindo blur animado e mantendo `prefers-reduced-motion`.
- Mantém Login Gate, logout, autenticação Supabase, modo local, dados e migrations sem alteração.

# V101.11.1-H3 — Official Logo Motion

- A logo oficial enviada pelo usuário substitui o asset visual anterior do login/splash.
- A animação passa a revelar a própria marca de baixo para cima, com scan, profundidade, halo e pulse calibrados ao azul/teal do novo ícone.
- O fundo permanece full-screen e foi recalibrado para a paleta azul + teal da logo oficial.
- Login Gate, logout, Supabase, modo local, dados, schema e 49 migrations permanecem inalterados.
- `prefers-reduced-motion` continua respeitado.

# V101.11.1-H2 — Cinematic Login & Brand Motion

- O fundo de autenticação agora ocupa toda a tela em gradiente azul/teal com cores da identidade RealTalent.
- A própria logo RT ganhou reveal, profundidade, ecos, scan luminoso, pulse e movimento sutil.
- Card de entrada mantém contraste claro sobre o mesmo ambiente de marca, sem a divisão bege/verde anterior.
- Login Gate, modo local, Supabase e Sair da conta permanecem funcionais e sem alteração de dados.
- `prefers-reduced-motion` continua respeitado.

# V101.11.1-H1 — Login Gate & Logout

- Modo local deixa de abrir o workspace automaticamente em uma nova sessão do navegador.
- A animação RealTalent continua abrindo primeiro e transiciona para a tela de entrada.
- O modo local ganha um gate explícito com “Abrir workspace local”, sem criar senha falsa.
- A sessão local é mantida apenas na sessão da aba/navegador via `sessionStorage`.
- “Sair da conta” passa a existir também no modo local e retorna imediatamente à tela de entrada sem apagar dados.
- O bootstrap do workspace só ocorre depois de existir uma sessão de UI válida.

# V101.11.1 — Login Experience & Reliability

## Added
- animação de entrada RealTalent usando a logo oficial e a paleta verde/bege.
- splash de marca reutilizado no boot, validação de sessão e carregamento do workspace.
- experiência responsiva com suporte a `prefers-reduced-motion`.

## Reliability
- timeout de 6 segundos na restauração inicial da sessão Supabase.
- fallback determinístico para o login quando `getSession()` falha ou trava.
- proteção contra resposta tardia sobrescrever um evento de autenticação já resolvido.
- sincronização tardia do evento `PASSWORD_RECOVERY` com a tela de recuperação.

## Preserved
- autenticação local continua sem falsa barreira de login.
- V101.11.0 Communications Architecture, schema e 49 migrations preservados.

# V101.11.0 — Communications Architecture

## Added
- Communications Gateway cloud unificado para WhatsApp, Gmail e Microsoft.
- Core compartilhado de correlation ID, logging estruturado, limites de payload e primitives criptográficas.
- Idempotência estável e compatibilidade por wrappers nos URLs legados.

## Preserved
- UX, schema, 49 migrations, filas/outbox existentes e URLs legados dos webhooks.
- V101.10.9-H5 Dead CSS Removal como base estável.

# V101.10.9 — CSS & Design System Consolidation

- Pipeline, Follow-ups e RealTalent Connect passam a usar CSS canônico sem versão no runtime.
- CSS versionado existente fica congelado por allowlist; novas folhas versionadas falham no gate de governança.
- Inventário de CSS e duplicidade passa a ser reproduzível por `npm run css:inventory`.
- Sem mudanças de schema, dados, regras comerciais ou integrações.

# V101.10.8 — Runtime & Developer Experience Consolidation

## Added
- orquestrador Node multiplataforma (`scripts/start.mjs`);
- wrappers Linux/macOS/Windows e comandos npm padronizados;
- Runtime Control local com `/health`, `/readiness` e `/status` autenticado;
- `doctor` e health CLI;
- estrutura de documentação para releases, QA, segurança e arquitetura.

## Preserved
- UX, dados, migrations, CSS e schema da V101.10.7-H1;
- Security & Runtime Foundation;
- launcher Bash anterior como fallback `--legacy`.

# V101.10.6 — Garimpo UX Consolidation

## Added
- fluxo principal Buscar → Local → Revisar → Histórico.
- barra persistente de campanha e revisão por exceção.
- manipulação direta do centro e raio no mapa.
- detalhes técnicos, ontologia e Coverage Truth preservados sob demanda.

## Preserved
- V101.10.5-H3 Contact Intelligence, Selection System e Local Discovery.
- 49/49 migrations.

# V101.10.5 — Selection & Filter System

## Added
- SelectionSelect, MultiSelection, EntityPicker, FilterSelection, SelectionCheckbox e SelectionToolbar.
- bridge visual global para controles de seleção legados.
- rollout inicial em Garimpo, Contatos, Pipeline e Meu Dia.

## Preserved
- V101.10.4 Local Discovery Experience e toda a linhagem H1-H9 do Garimpo.
- 49/49 migrations.

## Histórico preservado
# V100.88.0 — Garimpo 2.0
# V100.89.0 — RealTalent Assistant 2.0
# V100.90.0 — RealTalent AI
# V100.91.0 — Central de Ajuda + Onboarding
# V100.92.0 — Hardening & UX
# V100.93.0 — Full Page UX Audit
# V100.94.0 — Omnichannel Inbox
# V100.95.0 — Workspace Personalization

## V101.10.5-H2 — Local Discovery Dist Marker Hotfix
- preserva no `index.html` o meta `V101.10.4 — Local Discovery Experience`;
- corrige o gate pós-build do `start-linux.sh` sem relaxar a validação de linhagem;
- audit V101.10.5 passa a verificar preventivamente o marker V101.10.4;
- nenhuma lógica de Garimpo, Selection System, migrations ou runtime foi alterada.

## V101.11.3-H19.9 — WhatsApp Reliable Messaging & Groups
- Deduplicação de eventos WhatsApp e idempotência no envio.
- Mensagem otimista no chat para reduzir latência percebida.
- Novo contato dentro da Central de Comunicação.
- Criação de grupos reais pelo WhatsApp QR local e envio para threads de grupo.
