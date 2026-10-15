# RealTalent CRM V101.5.6 — Visual Consistency Hotfix

Hotfix orientado pelas capturas reais de uso da V101.5.5 no Linux.

## Corrigido
- Verde removido como cor de ação primária; CTA, seleção e foco passam a usar azul RealTalent.
- Sidebar clara perde o fundo/seleção esverdeados e adota branco/neutro + azul.
- Sidebar acompanha integralmente o tema escuro, eliminando a faixa branca lateral.
- Topbar, busca, botões secundários, inputs, modais e drawers seguem a mesma paleta no modo escuro.
- Garimpo deixa de exibir grandes ilhas brancas no modo escuro em tabs, métricas, fontes e filas.
- Lead Workspace/drawer passa a respeitar superfícies escuras e CTA azul.
- Botões vistos nas capturas — Novo lead, Nova captura, Salvar perfil, Ligar, Executar agora e Próximo — passam a herdar o mesmo azul primário.
- Cores semânticas de sucesso/atenção/erro continuam restritas a status e feedback, não a ações principais.

## Linux port hotfix
A porta padrão local foi alterada de 4190 para 4188 porque o Firefox bloqueia 4190 como porta restrita.
