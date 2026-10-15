# RealTalent CRM V101.11.3-H11 — Proposal & Catalog Pricing 3.0

Base: **V101.11.3-H10 — Progressive Data & Virtualized Canvas**.

## Objetivo

Consolidar Catálogo → Precificação → Proposta → Forecast/Revenue como um fluxo comercial coerente, corrigindo a tabela de propostas, tornando o vínculo com catálogo explícito e preservando o histórico financeiro de cada proposta.

## Alterações principais

- Corrigida a célula de identidade da tabela de propostas que era comprimida por um seletor legado de botão.
- Nova camada operacional de CSS reduz a largura mínima da tabela e normaliza tipografia, truncamento e badge oficial no azul do CRM.
- Novo `proposal-pricing.ts` centraliza subtotal, desconto, imposto, MRR, ARR e TCV; `revenue-forecast.ts` reutiliza o mesmo motor.
- Selecionar um produto cria snapshot de preço de tabela, custo, desconto padrão e origem de pricing.
- Voltar para **Item manual** realmente remove o vínculo `productId` e a origem de catálogo.
- Alterações em preço/desconto/imposto/cobrança de item do catálogo passam a ser identificadas como **Preço negociado** e podem ser restauradas para os valores do catálogo.
- Guardrails por produto: desconto máximo recomendado e margem mínima recomendada.
- Proposta mostra margem e alerta quando a negociação sai da política comercial.
- Datas de contrato suportam fim automático por início + duração ou data personalizada.
- Renovação automática/manual e seleções relevantes deixam de depender de checkbox nativo.
- Catálogo redesenhado como workspace comercial com preço, custo, margem, política, uso e status.
- Uso do produto separa propostas vigentes de usos históricos/revisões.
- Editor de produto reorganizado em Identidade, Preço e margem, Cobrança e Política comercial.

## Persistência

Nova migration `202610070001_v101_11_3_h11_proposal_catalog_pricing.sql`.

Produtos recebem:
- `max_discount_percent`
- `min_margin_percent`

Itens de proposta recebem:
- `pricing_source`
- `catalog_unit_price`
- `unit_cost_snapshot`
- `catalog_discount_percent`
- `pricing_overridden`

As RPCs `save_sales_proposal` e `create_sales_proposal_revision` preservam esses snapshots para que alterações futuras no catálogo não reescrevam a leitura histórica de preço/custo da proposta.

## Compatibilidade

- H10 progressive hydration e virtualized canvas preservados.
- Propostas antigas continuam válidas; a migration faz backfill defensivo para itens ligados ao catálogo.
- Itens manuais continuam suportados.
- Nenhuma alteração de rota ou remoção de Proposal 360, Buyer Rooms, Revenue Intelligence ou Receita realizada.
