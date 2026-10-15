# RealTalent CRM V101.11.3-H20.7 — Global UI Final Pass

Base funcional: **V101.11.3-H19.13 — WhatsApp Work Management**  
Base visual imediata: **V101.11.3-H20.6 — Core Sales Workspace Cohesion**

## Objetivo

Fechar a macrofase H20 com uma camada transversal de consistência visual e comportamental, sem criar um novo design system paralelo. A H20.7 mantém `h20-product-cohesion.css` como última camada global e normaliza as superfícies que ainda escapavam aos workspaces já migrados.

## Adicionado / melhorado

### Shell global
- Topbar consolidada na cor de interação azul RealTalent.
- Verde deixa de competir como cor de navegação/interação e permanece semântico para sucesso/positivo.
- Sidebar branca com ativo azul, hover neutro, logout destrutivo e perfil/collapse padronizados.
- Busca global, workspace switcher, ícones e estado Local passam a compartilhar a mesma linguagem do header.
- Navegação lateral e móvel expõem `aria-current="page"` para a rota ativa.

### Modais e drawers
- Backdrops usam a mesma opacidade, blur e z-order visual.
- Header/body/footer, bordas, radius, superfície e sombra convergiram.
- O primitive `Drawer` agora possui:
  - portal para `document.body`;
  - Escape para fechar;
  - trap de foco por Tab/Shift+Tab;
  - restauração do foco anterior;
  - bloqueio de scroll do body;
  - registro no overlay manager.

### Formulários e controles
- Inputs, selects e textareas canônicos e campos legados passam a usar a mesma borda, radius, superfície e tipografia.
- Checkboxes/radios usam o azul de interação.
- Selection System deixa de usar verde como estado de seleção e passa a usar os tokens de brand.
- Focus, hover e disabled receberam estados globais consistentes.

### Dados e feedback
- Data grids/tabelas recebem headers, densidade, hover e foco uniformes.
- Badges/status/chips recebem piso tipográfico.
- Empty states, skeletons, toasts e paginação foram normalizados.
- Scrollbars passam a compartilhar uma aparência discreta e consistente.
- Toasts agora possuem `data-rt-primitive="toast"` para governança.

### Comunicação
- Microcopy residual de E-mail/Comunicação que ainda vinha de regras históricas de 8–9px foi elevada ao piso H20.
- Composer de e-mail recebe controles e labels coerentes com os demais formulários.

### Responsividade e acessibilidade
- Command bars empilham de forma previsível em larguras menores.
- Summary strips reduzem para 2 colunas e depois 1 coluna.
- Modais viram bottom-sheet responsivo em mobile sem perder header/footer.
- Drawers ficam limitados ao viewport.
- Toasts respeitam navegação móvel e safe area.
- `prefers-reduced-motion` reduz animações/transições.

## Correção adicional de QA

Foi corrigida uma referência quebrada herdada em `release:verify`:

```text
runtime:prospecting-strict-scope:h1   (inexistente)
```

passou para:

```text
runtime:prospecting-strict-scope
```

O smoke correto foi executado com sucesso.

## Preservado

- H19.13 WhatsApp Work Management e Pure Chat.
- H20.3 Tasks / Teams / Follow-ups.
- H20.4 Propostas / Garimpo.
- H20.5 Configurações / Ligações.
- H20.6 Pipeline / Contatos / Agenda.
- 54 migrations; nenhuma migration nova.
- Repository Local e Supabase parity.
- RealTalent Connect, One-Tap, WhatsApp rich media e segurança runtime.

## Validação

- `qa:architecture`: PASS.
- H20.7: **49/49 PASS**.
- CSS Governance: **65/65 PASS**.
- Release Manifest: **97/97 PASS**.
- Source Syntax: **418 arquivos PASS**.
- Integration Contracts: **386 arquivos PASS**.
- Linux preflight: **379 TS/TSX PASS**.
- Capability Matrix: **42 capacidades / 156 evidências / 103 executáveis**.
- Repository Local: **100/100 PASS**.
- Repository Supabase: **100/100 PASS**.
- Browser E2E contracts: **11 fluxos PASS**.
- Registry-independent transpile: **303 módulos PASS**.

## Limitação de build oficial

`npm ci` não concluiu neste ambiente e não produziu `node_modules`. Portanto:

- typecheck oficial: BLOCKED — React/Supabase/tipos ausentes;
- Vitest oficial: BLOCKED — `vitest: not found`;
- Vite build oficial: BLOCKED — `vite: not found`.

O build registry-independent gerou um `dist` de fallback apenas para auditoria. O bundle audit o recusou por `HTML legado reapareceu`, e esse `dist` foi removido do pacote final.

## Observação de validação visual

A H20.7 executa validação estrutural, CSS, contratos e runtime, mas este ambiente não permitiu subir o Vite oficial; portanto não foi classificada como uma auditoria pixel-perfect baseada em screenshots reais do navegador.
