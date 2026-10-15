# RealTalent CRM V101.9.3 — Person / Company / Opportunity Canonical Model

## Objetivo

Eliminar a ambiguidade arquitetural em que `Lead`, `ContactRecord`, `CompanyRecord` e `OpportunityRecord` podiam carregar versões concorrentes do mesmo dado.

A V101.9.3 define autoridades claras:

- **Pessoa / identidade:** `ContactRecord`;
- **Empresa / identidade empresarial:** `CompanyRecord`;
- **Oportunidade / pipeline e receita:** `OpportunityRecord`;
- **Lead:** projection comercial legada e contexto de prospecção, preservada para compatibilidade.

## Entregue

- `CanonicalCommercialGraph` para resolver Pessoa, Empresa e Oportunidade de cada Lead;
- resolução por vínculo explícito, vínculo inverso e identidade, com diagnóstico de ambiguidades;
- projection canônica do `Lead` antes do render sem alterar o shape de `WorkspaceSnapshot`;
- inspector `window.__REALTALENT_CANONICAL__.inspect()`;
- `ObjectRegistry` passa a declarar `authority: canonical | legacy-projection`;
- ficha Contato/Pessoa usa o resolver canônico da V101.9.3;
- write-through Local: edições legadas de Lead atualizam Pessoa/Empresa/Oportunidade antes da reconciliação;
- write-through Supabase para identidade empresarial e oportunidade;
- `deriveCommercialStructure()` passa a preservar valores canônicos existentes em vez de rebaixá-los para valores antigos do Lead;
- migration `202610020001_v101_9_3_canonical_commercial_model.sql` atualiza `sync_commercial_structure` para modelo canonical-first;
- 47 migrations com checksum controlado.

## Compatibilidade

Nenhum módulo é removido e a UI principal não é redesenhada. Pipeline, Contatos, Meu Dia, Ligações, Follow-ups, Propostas, Account 360, Revenue Intelligence e Comunicação continuam consumindo `Lead` quando ainda necessário, mas recebem uma projection reconciliada.

Campos próprios de prospecção — origem, temperatura, prioridade, tags, notas e contexto operacional — continuam pertencendo ao `Lead` durante esta fase.

## QA de release

- V101.9.3 Canonical Commercial Model: **31/31** contratos;
- Linux preflight: **301 arquivos TS/TSX**;
- sintaxe: **335 arquivos**;
- contratos de integração: **303 arquivos**;
- migrations: **47/47** com checksum íntegro;
- TypeScript isolado da nova arquitetura e do repository local: **OK**;
- runtime smoke do Canonical Record Graph: **OK** (Pessoa/Empresa/Oportunidade canônicas, snapshot imutável, 0 issues);
- regressão histórica: **3.728 checks OK / 0 FAIL** até o início do typecheck global.

O `npm ci` expirou por timeout de rede neste ambiente, portanto o typecheck/Vitest/build globais não puderam ser concluídos aqui. O `start-linux.sh` mantém esses gates antes de abrir o CRM.

## Próxima etapa

V101.9.4 — Global Event Bus.
