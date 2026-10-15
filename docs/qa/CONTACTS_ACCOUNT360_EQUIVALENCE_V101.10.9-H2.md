# Equivalência — V101.10.9-H2 Contacts & Account 360

A H2 é uma consolidação de empacotamento CSS, não um redesign.

- Nenhum seletor legado foi renomeado.
- Nenhuma declaração CSS das fontes consolidadas foi removida ou reescrita.
- A ordem interna de cada fonte foi preservada byte a byte (desconsiderando apenas o `trim` de borda no contêiner canônico).
- `contact-record.css` permanece antes de `app-shell.css`.
- `contacts.css` permanece depois de `app-shell.css` e antes de `workspace-ui.css`.
- `contact-intelligence.css` permanece depois de `selection-controls.css`.
- `account-360.css` continua sendo carregado pelo módulo `leads-page.tsx`, exatamente no ownership anterior de `account-intelligence.css`.
- As fontes históricas permanecem fisicamente no projeto para rollback/auditoria.
- Não há migration H2, alteração de schema, repository contract ou API.
