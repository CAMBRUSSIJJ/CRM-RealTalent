# RealTalent Agent V0.7 — Autonomous Workflows

A V0.7 mantém uma única RealTalent Agent compartilhada com o Blue Ocean e adiciona workflows multi-etapas no CRM.

## Comportamento

- `WORKFLOW` entra como modo interno ao lado de ASK, ANALYZE, ACT, BUILD e QA.
- O Agent pode transformar um objetivo amplo em até 8 etapas.
- `ANALYZE` e `QA` podem avançar automaticamente.
- `ACT` e `Builder` sempre param em checkpoint antes de escrita.
- A ação de negócio é revalidada com o snapshot atual do CRM antes de ser executada.
- Workflows são persistidos no runtime, mas snapshots do CRM não são persistidos.
- Ao reabrir o drawer, um workflow ativo pode ser reanexado e continuar com contexto atual.
- Reinício durante Builder entra em `NEEDS_USER` por segurança; QA pode ser refeito automaticamente.

## Limite atual

Cada workflow opera um produto por vez. CRM e Blue Ocean compartilham memória operacional, mas uma mutação com IDs do outro produto exige abrir aquele produto para obter contexto atual.
