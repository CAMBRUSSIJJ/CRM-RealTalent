# Proposal & Catalog Pricing 3.0 — arquitetura H11

## Fonte de verdade

`ProductRecord` define preço/custo/política de tabela. Ao entrar em uma proposta, o item recebe um snapshot comercial em `ProposalLineItem`; negociações podem divergir sem alterar o produto original.

```text
Catálogo
  ↓
ProductRecord
  ↓ selecionar
Pricing snapshot da proposta
  ↓
Proposal Pricing Engine
  ├─ subtotal
  ├─ desconto
  ├─ imposto
  ├─ MRR / ARR
  ├─ TCV
  └─ margem / guardrails
  ↓
Proposta / Forecast / Revenue Intelligence
```

## Estados do preço

- **Preço de tabela**: produto vinculado e valores iguais ao catálogo.
- **Preço negociado**: produto vinculado, mas preço/desconto/imposto/cobrança divergiu.
- **Item manual**: sem `productId`; preço livre.

## Histórico

Os snapshots de `catalogUnitPrice`, `unitCostSnapshot` e `catalogDiscountPercent` são mantidos por revisão. Alterar o catálogo depois não altera a margem histórica da proposta existente.

## Política comercial

Cada produto pode definir `maxDiscountPercent` e `minMarginPercent`. Na proposta, a política é informativa nesta release: fora do limite gera alerta/revisão, sem bloquear o vendedor.

## Condições contratuais

O fim do contrato pode ser automático. Para um início em 27/10/2026 e 12 meses, a data automática termina em 26/10/2027. O usuário pode optar por prazo personalizado.
