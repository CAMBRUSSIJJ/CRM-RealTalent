# RealTalent CRM V101.11.3-H20.7-H1 — Appearance & Sidebar Truth

Base: V101.11.3-H20.7 — Global UI Final Pass.

## Objetivo

Corrigir regressões visuais identificadas no runtime renderizado de Configurações: as cores escolhidas em Aparência não governavam integralmente topbar/sidebar após o cascade guard H20; a busca global podia receber um fundo branco interno por conflito com o primitive Input; e Configurações ainda participava da navegação ordenável em vez de permanecer como utilitário fixo do rodapé.

## Corrigido

- O cascade guard H20 agora usa tokens canônicos apenas como fallback. Preferências aplicadas pelo workspace não são reescritas quando CSS lazy é carregado.
- `Destaque`, `Barra superior`, `Barra lateral`, `Fundo das páginas` e `Cards e painéis` voltam a ser a fonte real das respectivas superfícies.
- Topbar usa `--rt-shell-topbar`, e não mais `--rt-color-brand` forçado.
- Sidebar usa `--rt-shell-sidebar`, com contraste automático e estados ativos derivados do accent escolhido.
- Busca global passa a ser um único controle visual; o primitive `Input` interno é transparente e não cria uma caixa branca sobre a topbar.
- Preset RealTalent passa a representar a identidade oficial azul: accent `#315BD8` e topbar `#17264A`.
- Preset Verde continua disponível, mas é opcional.
- Campos de cor em `Empresa e marca` foram sincronizados com `Minha experiência > Aparência`, removendo a segunda fonte de verdade visual.
- `Configurações` foi removida da ordem configurável da sidebar e fixada no rodapé.
- O editor de navegação deixa explícito que Configurações é uma utilidade fixa e não pode ser movida para `Mais ferramentas`.
- No mobile, Configurações também deixa a lista genérica e recebe posição fixa no menu `Mais`.

## Preservado

- H20.7 Global UI Final Pass.
- H20.6 Pipeline, Contatos e Agenda.
- H20.5 Configurações e Ligações.
- H19.13 WhatsApp Work Management e Pure Chat.
- 54 migrations existentes; nenhuma migration nova.

## Marcadores de runtime

A linhagem H20.7 continua em:

`rt_cohesion=101.11.3-h20-7-global-ui-final-pass`

O hotfix é identificado adicionalmente por:

`rt_hotfix=101.11.3-h20-7-h1-appearance-sidebar-truth`
