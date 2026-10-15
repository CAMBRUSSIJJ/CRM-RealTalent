# V101.10.3-H4 — Data Integrity & Canonical Company Bridge

Consolida Coverage Truth (H2), Identity Resolver 2.0 (H3) e Canonical Company Bridge (H4).

## Entrada no CRM
- Garimpo cria/atualiza `CompanyRecord` como entidade canônica.
- `ContactRecord` só é criado quando uma pessoa foi realmente identificada.
- Criar uma oportunidade/Lead passa a ser opcional e desativado por padrão.
- Quando criada, a oportunidade recebe `companyId` e `primaryContactId`.
- IDs canônicos retornam ao registro do Garimpo para rastreabilidade.

## Arquitetura
- CRUD de Company foi adicionado ao contrato Local/Supabase.
- Implementação local foi isolada em `local-company-repository.ts` para preservar o limite de modularidade histórico.
- Nenhuma migration nova; total permanece 49/49.
