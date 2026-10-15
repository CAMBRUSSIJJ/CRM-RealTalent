# Release Notes — RealTalent Agent V2.8

## Adicionado

- Execution Intelligence central.
- Execution Plan persistente para ações propostas pelo modelo ou API.
- Classificação de risco e blast radius por etapa.
- Preview de leitura automática versus escrita que exige confirmação.
- Confirmação explícita por plano/etapa.
- Idempotency key por etapa.
- Dispatch de escrita para CRM/Blue Ocean sem falso sucesso.
- Receipt externo e verificação de pós-condição.
- Rollback preview/compensação quando aplicável.
- CLI `executar` / `execution`.
- Caso permanente no Known-Failure Dataset para impedir escrita silenciosa.

## Melhorado

- `/agent` agora converte ação de negócio em Execution Plan V2.8.
- `/tools/execute` preserva compatibilidade e retorna plano/preview ao bloquear escrita.
- `/health` expõe Execution Intelligence.
- Runtime, CRM e Blue Ocean identificam a V2.8 mantendo um único cérebro central.

## Preservado

Tool-First, App Context, Reasoning V2.7, Learning V2.6, Vision V2.5, RAG/Memory V2.4 e Intelligence Core V2.3.

## Segurança

A V2.8 não permite escrita silenciosa. Uma mutação planejada ou despachada não é tratada como concluída até existir receipt e verificação da pós-condição.
