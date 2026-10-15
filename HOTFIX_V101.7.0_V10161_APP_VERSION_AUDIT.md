# V101.7.0 Hotfix 2 — V101.6.1 APP_VERSION audit

## Problema
O gate histórico `qa:v101.6.1` validava `APP_VERSION` e, além disso, exigia que `src/lib/app-version.ts` contivesse um dos nomes de releases conhecidos somente até V101.6.9. A V101.7.0 possui versão correta (`101.7.0`), mas usa o nome `Workspace Simplification & Unified Filter Engine`, fazendo o contrato histórico falhar por lista fechada.

## Correção
O contrato `APP_VERSION acompanha pacote` agora valida diretamente as duas constantes canônicas:

- `APP_VERSION = package.json.version`
- `APP_VERSION_LABEL = V + package.json.version`

Isso preserva o objetivo do gate e evita nova falha a cada release futura apenas por mudança de nome da release.

## Escopo
Nenhuma alteração de UI, dados, migrations, filtros, views ou runtime do CRM.

## Hardening adicional
O mesmo padrão fechado existia nos gates históricos V101.6.2 a V101.6.6. Eles foram normalizados para o mesmo contrato canônico de versão, evitando uma sequência de falsos negativos após V101.7.0.

## Compatibilidade da toolbar V101.6.4
O gate histórico da toolbar aceitava apenas o botão literal `Filtro`. A V101.7.0 preserva a mesma toolbar, porém o filtro é renderizado pelo componente global `WorkspaceFilterMenu`. O contrato agora aceita tanto a implementação histórica quanto a evolução V101.7.0, mantendo obrigatórios Filtro, Classificar e Exibição.

## Compatibilidade da Agenda V101.6.6
O gate da toolbar da Agenda aceitava somente o contador de filtros renderizado inline. A V101.7.0 moveu esse comportamento para `WorkspaceFilterMenu`; o contrato histórico agora reconhece ambas as implementações sem relaxar a exigência de toolbar e busca padronizadas.

## Compatibilidade de Follow-ups V101.6.7
O filtro da toolbar de Follow-ups foi migrado para `WorkspaceFilterMenu` na V101.7.0. O gate histórico passa a reconhecer o componente global além das renderizações inline de contador usadas nas versões anteriores.
