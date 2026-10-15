# RealTalent CRM V100.71.0 — Calling UI Standardization

## Objetivo

Padronizar a interface das áreas de ligações para que abas, botões, seletores e ações sigam a mesma hierarquia visual e comportamental em toda a experiência de Calling.

## Entregas

- Abas principais **Operação / Histórico / Inteligência** migradas para um padrão único.
- Abas de **Preparar Ligações** alinhadas ao mesmo componente visual.
- Abas **Roteiro / Descoberta / Notas** e painel de apoio do Modo Foco unificados.
- Seletores de período do Histórico e da Inteligência convertidos para um segmented control consistente.
- Sessões rápidas passaram a usar cards acionáveis sem competir visualmente com CTAs primários.
- Escolha de modo **Focus / Power assistido** recebeu estado selecionado e `aria-pressed` padronizados.
- Ações principais usam `Button` e a hierarquia `primary / secondary / ghost / danger`.
- Ações destrutivas e botões somente com ícone receberam padrão visual e foco de teclado consistente.
- Adicionados `role="tablist"`, `role="tab"`, `aria-selected`, `aria-pressed` e `focus-visible`.

## Compatibilidade

A V100.71.0 preserva integralmente a lógica de fila e preparação da V100.70.0 e o Modo Foco da V100.69.0. Nenhuma migration de banco foi adicionada.
