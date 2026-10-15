# RealTalent Agent V2.0 — Reliability & Evaluation Platform

## Adicionado
- benchmark fixo de 1.000 pontos;
- 10 categorias de qualidade;
- pisos mínimos por categoria;
- baseline aceita explicitamente;
- histórico das últimas avaliações;
- release gate que bloqueia regressão total ou por categoria;
- perfil rápido e perfil completo;
- Grounding & Hallucination Guard com fixture real;
- aba `Avaliação` no Modo técnico;
- CLI `avaliacao-agent.sh`;
- endpoints `/evaluation`, `/evaluation/run` e `/evaluation/baseline/accept`;
- integração de acesso à Avaliação nos drawers do CRM e Blue Ocean.

## Melhorado
- roteamento de `corrija`/`corrigir` para Autonomous Engineering quando há investigação + correção + validação;
- o perfil completo agora bloqueia a release quando qualquer self-test adicional falha;
- auditoria estrutural do runtime ampliada.

## Corrigido durante a validação
O benchmark encontrou um bug real: `Investigue por que o WhatsApp duplica mensagens, corrija e valide` era classificado como `workflow`. A expressão de intenção de mutação foi corrigida e o caso passou a ser classificado como `engineering`.

## Mantido
- IA local/Ollama;
- Conversation Intelligence;
- Project Brain;
- Deep Visual QA;
- Autonomous Engineering;
- Identity & Team Governance;
- Continuous Agent;
- checkpoints humanos para escrita/promoção/deploy.

## Limites
- o benchmark determinístico mede o sistema ao redor do modelo; não equivale a uma avaliação humana completa da qualidade de texto do modelo local;
- os launchers de CRM e Blue Ocean continuam sem `node_modules`, então typecheck/test/build completos não são declarados como aprovados nesta embalagem;
- a baseline é local ao estado da Agent e precisa ser aceita pelo operador.
