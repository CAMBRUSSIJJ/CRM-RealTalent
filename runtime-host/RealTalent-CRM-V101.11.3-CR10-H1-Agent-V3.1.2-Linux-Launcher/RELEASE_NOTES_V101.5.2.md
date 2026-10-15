# RealTalent CRM V101.5.2 — UI Runtime QA & Accessibility

Release de hardening visual e de interação sobre a V101.5.1. Não amplia o escopo comercial; corrige comportamento de interface, semântica de interação, foco, legibilidade e responsividade.

## Principais mudanças

- focus trap compartilhado para drawers que usam `useOverlayDialog`, com Escape apenas no overlay superior e restauração do foco ao fechar;
- Lead Workspace migrado para o overlay compartilhado e identificado por `data-overlay-id`;
- tabs Contexto/Histórico/Notas com `role=tab`, `aria-selected`, `aria-controls`, `tabpanel` e navegação por setas/Home/End;
- tabela de Leads deixa de depender de `<tr onClick>`; abertura da ficha passa por botão semântico;
- cards de Leads deixam de depender de `<article onClick>`; a identidade do lead passa a ser o alvo semântico de abertura;
- estado Tabela/Cartões exposto com `aria-pressed`;
- funil detalhado de Métricas migra de `<article onClick>` para botão semântico com estado `aria-pressed`;
- linhas de Follow-ups deixam o container estrutural neutro e expõem uma região de abertura ativável por Enter/Espaço;
- abas da Central de Comunicação e de Ligações passam a usar `role=tab`, `aria-selected`, roving `tabIndex` e setas/Home/End;
- nova camada CSS V101.5.2 aumenta microtipografia crítica do Lead Workspace e preserva a ideia de divulgação progressiva;
- touch targets de 44 px em mobile/coarse pointer nas ações prioritárias;
- tratamento de safe-area, `100dvh`, overscroll e scroll chaining para drawers/modais mobile;
- comportamento de `prefers-reduced-motion` reforçado;
- primeiro teste `.test.tsx` de componente da linha atual, cobrindo contrato acessível do Modal;
- teste unitário para navegação roving de teclado.

## Preservado

Todo o hardening de dados da V101.5.1 permanece intacto: Calling isolado por workspace/usuário/tentativa, gravação incremental, owner canônico e resolução segura Lead → Conta → Contato.
