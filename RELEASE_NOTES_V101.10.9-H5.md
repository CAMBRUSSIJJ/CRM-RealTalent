# RealTalent CRM V101.10.9-H5 — Dead CSS Removal

Base: **V101.10.9-H4**

## Objetivo

Remover fisicamente apenas CSS legado já comprovadamente supersedido pelas folhas canônicas das ondas V101.10.9, H1, H2, H3 e H4, sem alterar o visual, o cascade ou o comportamento funcional do CRM.

## O que foi removido

- **47 arquivos CSS legados** foram excluídos fisicamente de `src/styles`.
- `src/styles`: **119 → 72 arquivos CSS**.
- CSS versionados/legados físicos: **93 → 47**.
- O runtime permanece com **48 imports CSS**; H5 reduz dívida física, não reorganiza novamente o cascade.
- A allowlist foi reduzida para refletir somente dívida CSS ainda existente.

O manifesto `qa/dead-css-removal-v101109-h5.json` registra owner canônico, tamanho e hashes de cada fonte antes da remoção.

## Prova de equivalência

A H4 e a H5 foram reconstruídas com o builder independente e seus bundles CSS foram comparados:

```text
H4 CSS  1.253.004 bytes
H5 CSS  1.253.004 bytes

SHA-256 H4
4f3121ef8e83de2edc06fe23bcc0225a51fb3459806cc103e339461082005403

SHA-256 H5
4f3121ef8e83de2edc06fe23bcc0225a51fb3459806cc103e339461082005403
```

**Resultado: bundle CSS byte a byte idêntico.**

Além disso, `tinycss2` analisou as 72 folhas CSS restantes e o bundle final com **0 erros de parsing**.

## Correção adicional encontrada durante a limpeza

A remoção revelou um import direto escondido em `src/features/calls/call-workspace-modal.tsx` apontando para uma folha antiga de Calling. Ele foi direcionado para o owner canônico `calling-workspace.css`.

Não houve alteração de lógica de Calling.

## QA

- Source syntax: **388 arquivos — PASS**
- Integration contracts: **361 arquivos — PASS**
- Migrations: **49 checksums — PASS**
- Release Manifest: **58/58**
- Local Repository: **99/99**
- Supabase Repository: **99/99**
- CSS Governance: **65/65**
- V101.10.9: **28/28**
- H1: **45/45**
- H2: **37/37**
- H3: **38/38**
- H4: **57/57**
- H5: **22/22**
- `qa:architecture`: **PASS**
- regressão histórica segmentada: **113/113 comandos — PASS**
- build independente: **278 módulos — PASS**
- Linux preflight: **354 TS/TSX — PASS**

## Limitação do ambiente de auditoria

O sandbox não possui a árvore real de `node_modules` e não consegue acessar o registry npm. Portanto `npm run typecheck`, Vitest, build Vite oficial e `npm audit` **não são marcados como PASS** nesta auditoria. A recuperação automática do lockfile/dependências permanece no launcher para execução em um Linux com acesso ao registry.

## Fora do escopo

Nenhuma alteração de UX, dados, schema, migrations, integrações, regras comerciais, Calling, Connect, Garimpo ou Automações.
