# RealTalent Agent V1.9 — Autonomous Engineering

## Objetivo
Unificar investigação, Project Brain, Root Cause, Builder Sandbox, recuperação limitada e Deep Visual QA em um único caso de engenharia auditável.

## Fluxo
1. Investigar antes de escrever.
2. Criar hipóteses e análise de impacto — hipótese não é causa confirmada.
3. Executar Browser QA de baseline em modo somente observação.
4. Pedir aprovação humana explícita para Builder.
5. Aplicar mudança em sandbox com até 3 ciclos de recuperação.
6. Executar gates locais e QA final.
7. Comparar evidências Antes × Depois.
8. Promover somente conforme os checkpoints já existentes; falha de QA preserva rollback do Builder.

## Segurança
- escrita continua governada;
- autorização é vinculada à operação/target;
- não há sudo, credenciais, auth/RLS ou ações destrutivas novas;
- hipóteses não são tratadas como fatos;
- máximo de 3 ciclos de recuperação;
- evidência final continua separada de alegação do modelo.
