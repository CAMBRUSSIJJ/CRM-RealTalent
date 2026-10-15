# RealTalent Agent V1.5 — Project Awareness & Code Intelligence

## Adicionado
- índice técnico persistente para CRM e Blue Ocean;
- Code Graph por imports resolvidos e dependências reversas;
- busca contextual por arquivos, módulos, símbolos e conteúdo;
- análise de impacto “O que pode quebrar?”;
- Root Cause Engine com hipóteses, evidências, confiança e próximos testes;
- Health Map estrutural por módulo;
- histórico técnico de investigações, Builder e Browser QA;
- endpoints `/project-awareness/*`;
- CLI `conhecimento-agent.sh` / `project-awareness-linux.sh`;
- painel `Conhecimento` no Control Center;
- ação `Explique esta tela` nos drawers do CRM e do Blue Ocean;
- Project Awareness no contexto do chat, planejamento de Workflow e Builder.

## Melhorado
- o `qwen2.5-coder:3b` recebe contexto técnico selecionado em vez de depender de grandes blocos de código;
- busca de sintomas como WhatsApp/mensagens duplicadas prioriza arquivos reais relacionados;
- análise de impacto reconhece módulos, arquivos e símbolos e percorre dependências reversas;
- o chat aceita `?product=...&prompt=...`, permitindo que CRM e Blue Ocean abram uma explicação contextual da tela atual;
- `/control/state` expõe o estado do Project Awareness e indexa workspaces registrados quando necessário.

## Segurança e precisão
- Root Cause diferencia hipótese de fato e recomenda testes antes de editar código;
- Health Map é identificado como `static-structural`, nunca como prova de runtime;
- o índice não armazena o código-fonte completo;
- Builder, Browser QA, Governança, checkpoints e confirmação de escrita permanecem ativos.

## Limitações
- efeitos dinâmicos, reflexão, rotas montadas em runtime e dependências fora do grafo estático podem não aparecer na análise de impacto;
- Root Cause não substitui reprodução, logs e testes;
- o primeiro índice de um workspace grande pode levar alguns segundos;
- os launchers não incluem `node_modules`, então gates completos que dependem das dependências locais não são declarados como aprovados quando elas estão ausentes.
