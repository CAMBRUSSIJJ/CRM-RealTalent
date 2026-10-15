# V101.11.3-H10 — Progressive Data & Virtualized Canvas

Hotfix de escala e performance sobre a V101.11.3-H9. Não redesenha o CRM, não altera schema e não adiciona migrations.

## Objetivo
Reduzir memória e trabalho de renderização em duas frentes: hidratação progressiva do workspace e canvas do Playbook escalável.

## Hidratação progressiva do workspace
- o bootstrap deixa de materializar o `WorkspaceSnapshot` completo por padrão;
- o shell inicial carrega somente identidade comercial/índices e stages, preservando busca global e navegação;
- históricos e módulos especializados são hidratados por rota;
- troca de rota carrega somente slices ainda ausentes;
- refresh atualiza apenas slices já carregados/relevantes para a rota;
- ações que precisam de dados fora da rota solicitam snapshots escopados explicitamente;
- histórico de ligações passa a usar `listCallsPage(..., 500)` no slice inicial em vez de `listCalls` ilimitado;
- o formato legado de `WorkspaceSnapshot` é preservado para compatibilidade, com arrays vazios para slices ainda não hidratados.

Esta H10 é uma fundação progressiva: a identidade comercial ainda é mantida aquecida porque busca global, relações e navegação dependem dela. Paginação por entidade de Contatos/Atividades pode ser adicionada depois sem reescrever as páginas novamente.

## Drag fora do React durante o movimento
- `pointermove` não grava mais posições no `conversationGraph`;
- cards/grupos são movidos diretamente no DOM com `translate3d` durante o gesto;
- o estado React é confirmado uma única vez no `pointerup`;
- multi-drag e drag de fases seguem a mesma política;
- snap-to-grid é aplicado no commit final.

## Virtualização do Playbook
- o workspace mede o viewport com `ResizeObserver` e scroll passivo;
- somente nodes/grupos dentro do viewport + overscan são montados;
- somente edges cujos dois endpoints estão na janela virtual são renderizados, evitando fan-out invisível;
- seleção atual permanece montada mesmo fora da janela para preservar Inspector/edição;
- contador `visíveis` expõe o orçamento real de DOM.

## Preservado
- H9 FPS monitor, partículas adaptativas do login, cores/grid/snap;
- H8 seleção múltipla, grupos/fases e conexões manuais;
- H7 workspace full-page e as quatro views;
- H6 `conversationGraph` como fonte única;
- H2 runtime recovery e H1 Communications recovery;
- 50 migrations e contratos Local/Supabase.
