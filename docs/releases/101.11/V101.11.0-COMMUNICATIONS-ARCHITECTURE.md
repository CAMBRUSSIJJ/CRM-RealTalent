# RealTalent CRM V101.11.0 — Communications Architecture

## Objetivo
Consolidar a borda cloud de WhatsApp, Gmail e Microsoft sem alterar a experiência do usuário e sem desativar URLs existentes.

## Adicionado
- `supabase/functions/communications-gateway/` como entrada cloud unificada.
- core compartilhado de comunicações com correlation ID, logging estruturado, payload bounds, HMAC/SHA-256 e tratamento de erros.
- adapters específicos para WhatsApp Cloud, Gmail Pub/Sub e Microsoft Graph.
- health surface do gateway.

## Melhorado
- idempotência Microsoft deixa de usar timestamp como fallback e passa a usar digest estável.
- consulta de subscriptions Microsoft é agrupada por request.
- Gmail usa comparação de segredo em tempo constante e fail-closed explícito quando o segredo não está configurado.
- erros de persistência dos webhooks retornam 5xx, permitindo retry do provider em vez de falso sucesso.
- correlation ID percorre jobs/metadados quando aplicável.

## Compatibilidade
As Edge Functions `whatsapp-webhook`, `gmail-pubsub-webhook` e `microsoft-communications-webhook` continuam existindo e agora são wrappers finos sobre o core compartilhado. Nenhuma troca imediata de URL é exigida.

## Não alterado
- UX da Central de Comunicação;
- composer;
- gateway local QR;
- RealTalent Connect;
- schema/migrations;
- outbox existente e workers Google/Microsoft;
- dados do CRM.

## Corrigido
- notices Microsoft sem `subscriptionId` são rejeitados com segurança antes da consulta de subscriptions.
- health do gateway usa identidade própria e não se apresenta como resposta Gmail.
- audits históricos de WhatsApp/linhagem reconhecem os wrappers e a V101.11.0 sem reduzir a cobertura funcional.
- README e CHANGELOG passam a identificar a release atual.

## Removido / substituído
- nenhuma URL pública foi removida;
- lógica duplicada nos três entrypoints cloud foi substituída por wrappers finos + adapters compartilhados;
- nenhuma feature, migration ou dado foi removido.

## Limitações conhecidas desta validação
- o ambiente de build não possui a árvore real de `node_modules` e o registry npm está indisponível (`EAI_AGAIN`), então typecheck/Vitest/Vite/npm audit oficiais não são marcados como PASS;
- Deno não está instalado aqui e nenhuma Edge Function foi implantada em um Supabase real nesta execução;
- antes de retirar URLs legados em uma release futura, validar webhooks reais de Meta, Google Pub/Sub e Microsoft Graph no ambiente de implantação.
