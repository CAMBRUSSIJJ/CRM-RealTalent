# RealTalent CRM V100.56.2 — Demo Bootstrap Hotfix

## Correção crítica

A V100.56.0 removeu o produto demo **RealTalent Connect**, mas a proposta demo Diamond ainda referenciava `DEMO_PRODUCTS[2]`. Durante o carregamento de `src/domain/defaults.ts`, esse índice era `undefined` e `proposalItem()` tentava acessar `product.unitPrice`, abortando o bootstrap do React.

A V100.56.2:
- remove a linha órfã da proposta Diamond;
- usa `demoProduct(id)` em vez de índices numéricos;
- adiciona auditoria para impedir a regressão.

Nenhuma migration de banco foi alterada.
