# V100.73.1 — Focus Mode Simplification

Patch de UX do módulo de Ligações focado em reduzir carga visual durante a execução da chamada.

## Alterações

- adiciona a aba **Configurações** na página de Ligações;
- centraliza RealTalent Voice, Device Manager, Caller ID e status dos provedores fora do Modo Foco;
- adiciona configuração do RealTalent Voice na etapa **Preparar ligações > Configurações**, antes da sessão;
- remove do Modo Foco os seletores de provedor, dispositivo e número de saída;
- remove os atalhos de configuração `Voz` e `Personalizar` do cabeçalho da conversa;
- substitui o painel grande de Voice por um resumo compacto e somente leitura;
- transforma Pré-call Brief + Call Health em um resumo compacto com detalhes recolhíveis;
- preserva Next Best Question, Live Conversation Signals, fila, roteiro, Discovery, notas, controles de chamada e wrap-up;
- adiciona uma visão explícita de quais recursos estão disponíveis, indisponíveis ou ainda não configurados.

Não há migrations novas e o schema de backup permanece `100.54`.
