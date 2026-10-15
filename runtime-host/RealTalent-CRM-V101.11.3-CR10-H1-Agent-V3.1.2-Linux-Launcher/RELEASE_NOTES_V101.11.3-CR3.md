# RealTalent CRM V101.11.3-CR3 — End-to-End Commercial Workflow Validation

## Objetivo
Provar a cadeia comercial completa em staging real, usando JWTs reais do Supabase e as policies H22.

## Fluxo CR3
1. Login de Vendedor/Gestor.
2. Criação de contato e lead.
3. Criação/vínculo da oportunidade.
4. Follow-up e tarefa relacionada à oportunidade.
5. Thread + evento de comunicação.
6. Proposta via `save_sales_proposal`.
7. Envio e aceite via `set_sales_proposal_status`.
8. Fechamento via `close_opportunity_from_proposal`.
9. Verificação de pós-venda automático.
10. Prova negativa: Vendedor não reconhece valor de receita.
11. Prova positiva: Gestor reconhece receita.

## Gates
- `npm run qa:commercial-readiness:cr3` — valida arquitetura do fluxo e instrumentação.
- `npm run runtime:commercial-readiness:cr3` — executa o cenário contra staging real.

## Segurança
O probe foi desenhado apenas para workspace descartável de homologação. Registros sintéticos usam prefixo `CR3`. O cleanup é best-effort e não força bypass de RLS.

## Migrations
Nenhuma migration foi adicionada: permanecem 58/58. CR3 é validação e instrumentação, não alteração de schema.
