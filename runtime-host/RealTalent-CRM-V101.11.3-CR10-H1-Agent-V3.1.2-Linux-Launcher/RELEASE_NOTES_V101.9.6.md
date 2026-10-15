# RealTalent CRM V101.9.6 — Permission Matrix

## Escopo

Centralização das regras de acesso do CRM sem redesenhar a UX principal.

## Entregue

- Permission Registry e Permission Engine;
- decisões por recurso/objeto e ação;
- proteção de campos estruturais;
- scopes de integrações normalizados;
- compatibilidade com `accessMode`, `allowedUserIds` e `allowedRoles` de contas conectadas;
- `AppContext.can()` como API comum da UI;
- gestão de equipe, auditoria, export e operações críticas protegidas no AppContext;
- Topbar, shell, Pipeline, Automações, Agenda externa e Integrações usando a matriz;
- painel de permissões efetivas em Configurações > Equipe;
- inspector `window.__REALTALENT_PERMISSIONS__.inspect()`;
- testes de política para owner/admin/member/viewer;
- nenhuma migration SQL nova: permanecem 48 migrations.

## Compatibilidade

A política padrão mantém os papéis existentes. A mudança é arquitetural: as telas deixam de codificar diretamente decisões baseadas em role e consultam uma fonte única.

## QA

- Permission Matrix: **28/28** contratos;
- smoke de política: **8/8**;
- Linux preflight: **323 TS/TSX**;
- sintaxe: **357 arquivos**;
- contratos de integração: **325 arquivos**;
- migrations: **48/48**;
- TypeScript isolado do núcleo: **OK**;
- regressão histórica antes do typecheck: **3.084 OK / 0 FAIL**.

O `npm ci` não concluiu neste ambiente por timeout de rede e não criou `node_modules`.
O launcher mantém o typecheck, Vitest e build globais como gates obrigatórios no Linux.
