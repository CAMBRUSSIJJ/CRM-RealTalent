# RealTalent CRM V101.11.3-CR10-H1 — CSS Cascade Governance Hotfix

## Correção

A otimização CR6 retirava CSS canônico de Contatos, Garimpo e Propostas do boot global. Embora reduzisse o conjunto inicial de estilos, isso alterava zonas históricas da cascata e fazia o gate `css:governance` falhar.

Este hotfix restaura os oito estilos sensíveis à cascata exatamente nas posições canônicas anteriores e mantém as otimizações seguras da CR6: lazy loading de JavaScript, prefetch ocioso/deduplicado, observabilidade e budgets.

## Segurança

- Nenhuma migration nova.
- Nenhuma alteração de schema ou dados.
- CR10 staging bootstrap preservado.
- Não duplica CSS nos loaders de rota.
