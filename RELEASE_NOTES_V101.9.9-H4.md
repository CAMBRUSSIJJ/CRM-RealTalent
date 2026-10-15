# V101.9.9-H4 — Workspace Appearance & Theme Personalization

Hotfix visual sobre V101.9.9-H3. Esta release remove a topbar verde obrigatória e transforma a aparência do CRM em uma configuração persistente por workspace, preservando a estrutura funcional e o Design System consolidado.

## Padrão visual

O preset padrão passa a ser **Minimal**:

- topbar branca;
- sidebar branca;
- canvas neutro `#F5F6F4`;
- cards brancos;
- accent azul discreto `#2F59DB`.

O verde RealTalent continua disponível como identidade/accent e como preset opcional, mas não é mais imposto à barra superior.

## Configurações → Aparência

Nova área dedicada com:

- tema Claro / Escuro / Automático;
- presets Minimal, RealTalent, Grafite, Azul, Verde e Areia;
- modo Personalizado;
- cor de destaque;
- cor da topbar;
- cor da sidebar;
- fundo das páginas;
- cor de cards/painéis;
- densidade;
- comportamento do menu lateral;
- redução de animações;
- restaurar visual padrão.

As alterações são mostradas em **prévia ao vivo** e só são persistidas quando o usuário aplica as configurações. Ao sair da área sem salvar, o tema salvo é restaurado.

## Contraste automático

`src/platform/design-system/appearance-theme.ts` resolve automaticamente texto, ícones, bordas e superfícies ativas com base na luminância da cor escolhida. Uma topbar clara recebe texto escuro; uma topbar escura recebe texto branco.

## Persistência

As novas preferências fazem parte de `CrmPreferences.appearance`, usando a infraestrutura de preferências já existente. Portanto a configuração é persistida **por workspace**, com normalização retrocompatível para workspaces criados antes da H4.

## Design System

O accent escolhido alimenta os tokens canônicos (`--rt-color-brand` e aliases legados). Topbar, sidebar, canvas e superfícies usam variáveis próprias, evitando CSS de cor hardcoded por módulo.

## Banco

Nenhuma migration H4 nova. Permanecem **49/49 migrations**, incluindo a migration canônica da H2.

## QA executado nesta montagem

- H4 Workspace Appearance: 22/22;
- H3 UX Recovery: 21/21;
- H2 Canonical Merge: 13/13;
- H1 Realtime Type: 6/6;
- V101.9.9 base: 19/19;
- Release Manifest: 26/26;
- Capability Matrix: 15 capacidades / 32 evidências / 25 executáveis;
- Repository parity: Local 96/96 + Supabase 96/96;
- Browser E2E Contract: 7/7;
- sintaxe: 381 arquivos;
- integração: 354 arquivos;
- migrations: 49/49;
- typecheck isolado do Design System V101.9.8: OK;
- typecheck isolado de `appearance-theme.ts`: OK;
- `check:legacy`: PASS;
- `bash -n start-linux.sh`: OK.

O ambiente de montagem não possui `node_modules`; portanto o typecheck global, a suíte Vitest completa e o build não são declarados como executados aqui. O `start-linux.sh` mantém esses gates no Linux após instalar as dependências.
