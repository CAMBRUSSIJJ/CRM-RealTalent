# RealTalent CRM V101.10.3-H4 — Data Integrity & Canonical Company Bridge

Base: V101.10.3-H1 — Drawn Territory Search

Esta release consolida os três P0 encontrados na simulação operacional do Garimpo.

## H2 — Coverage Truth

- Cobertura não significa mais “o plano terminou”.
- O Agent separa área tentada, área pesquisada com sucesso e área com falha.
- `territoryPercent` permanece por compatibilidade, mas representa cobertura bem-sucedida.
- Células falhadas não alimentam o ganho marginal da saturação.
- Saturação passa a considerar runs válidas/falhas e expõe confiança `low`, `medium` ou `high`.
- A UI mostra cobertura com sucesso e área tentada separadamente.

Smoke controlado: 100% tentado, 98% pesquisado com sucesso, 2% com falha, saturação 89%/medium. O cenário deixa de mostrar 100% de cobertura quando há falha.

## H3 — Identity Resolver 2.0

- CNPJ e identidade estável do provider permanecem chaves fortes.
- Domínio, telefone e Instagram isolados deixam de provocar merge automático.
- Franquias, redes e filiais com site/telefone compartilhado podem permanecer unidades independentes.
- Nome, endereço e distância geográfica entram na resolução antes de merge automático.
- Merge automático exige evidência de mesma unidade física / score forte.

Smoke controlado: duas unidades “Rede Alpha” com domínio e telefone compartilhados permaneceram como 2 empresas.

## H4 — Canonical Company Bridge

O fluxo de entrada do Garimpo passa a ser:

`CompanyCandidate -> CompanyRecord -> ContactRecord (quando há pessoa) -> oportunidade opcional`

- Repository ganha `createCompany` e `updateCompany` em Local e Supabase.
- Garimpo cria/atualiza CompanyRecord antes de qualquer oportunidade.
- ContactRecord só é criado quando uma pessoa foi identificada.
- Criar oportunidade comercial fica desativado por padrão.
- Se o usuário optar pela oportunidade, o Lead recebe `companyId` e `primaryContactId` quando disponível.
- O registro do Garimpo guarda `crmCompanyId`, `crmContactId` e `crmLeadId` para rastreabilidade.
- Implementação Company local foi extraída para `local-company-repository.ts`, preservando os limites históricos de modularidade.

## Compatibilidade preservada

- Territory Engine e polígono H1 preservados.
- OSM + Web + fallback sem Nominatim preservados.
- Data Layer continua exigindo aprovação antes do envio ao CRM.
- 49/49 migrations preservadas; nenhuma migration H4 foi necessária.

## QA

- QA Architecture: PASS.
- Release Manifest: 38/38.
- Syntax audit: 385 arquivos.
- Integration audit: 358 arquivos.
- Repository parity: Local 98/98 · Supabase 98/98.
- Capability Matrix: 18 capacidades · 51 evidências · 35 executáveis.
- V101.10.3: 41/41.
- H1 Drawn Territory: 44/44.
- H2 Coverage Truth: 10/10.
- H3 Identity Resolver 2.0: 10/10.
- H4 Canonical Company Bridge: 13/13.
- Migrations: 49/49.
- Linux release preflight: PASS (351 TS/TSX).
- Regressão legada: 3.939 OK / 0 FAIL.
- Runtime coverage, identity, territory, engine e search: PASS.

## Gates globais no ambiente de montagem

O ZIP de origem não contém `node_modules`. Os três gates foram tentados, mas não podem ser concluídos neste ambiente:

- `npm run typecheck`: dependências/tipos React e Supabase ausentes.
- `npm test -- --run`: `vitest: not found`.
- `npm run build`: `vite: not found`.

O `start-linux.sh` executa `npm install --no-audit --no-fund` e, em seguida, `npm run release:verify` antes de abrir o CRM. Portanto typecheck, Vitest e Vite build permanecem gates obrigatórios no computador Linux que instalar a release.
