# V100.55.0 — Conversation Workspace

Esta release transforma Sessões de Ligação em uma Central de Ligações orientada à conversa e à conta.

## O que entrou

- Preparação de sessão com objetivo comercial explícito.
- Modos Focus e Power assistido; o modo Power prepara o próximo contato, mas nunca inicia chamadas paralelas ou automáticas sem controle do vendedor.
- Objetivos disponíveis: primeira reunião, mapear decisão, qualificação, proposta e recuperação de oportunidade.
- Stakeholder ativo dentro da mesma empresa; chamadas são registradas com `contactId` da pessoa correta.
- Account Intelligence durante a ligação: cobertura, relacionamento, gaps e recomendação da conta.
- Mapa de stakeholders dentro da sessão, com histórico de interação e troca de contato sem sair do workspace.
- Inclusão rápida de pessoa mencionada durante a conversa.
- Área central com Roteiro, Descoberta e Notas.
- Discovery Checklist: problema, impacto, processo atual, decisão, orçamento, timing e próximo passo.
- Sinais rápidos para dor, concorrente, decisor, orçamento, timing, solução atual e interesse.
- Assistente de conversa contextual sem dependência de IA.
- Battlecards contextuais para explorar solução/processo atual sem ataques a concorrentes.
- Proposta ativa exibida como contexto durante follow-up de proposta, sem abandonar a ligação.
- Placar ao vivo da sessão: tentativas, conversas, reuniões e propostas.
- Preservação do wrap-up, automações, gravação/transcrição opcional e RealTalent Connect.

## O que não foi fingido

Não existe Parallel Dialer real nesta release. Essa funcionalidade exige infraestrutura própria de telefonia/múltiplas linhas/detecção de atendimento. O layout e os contratos foram preparados para evolução futura, mas o produto não apresenta uma função simulada como se fosse telefonia paralela real.

## Compatibilidade

- Nenhuma nova migration é necessária sobre a V100.54.
- O schema de backup permanece `100.54`.
- A migration Account Intelligence da V100.54 continua sendo pré-requisito para persistir `contactId` no Supabase.
