# RealTalent CRM V101.10.9-H2 — Contacts & Account 360 CSS Consolidation

## Escopo
Consolidação controlada dos estilos de Contatos, ficha do contato, Contact Intelligence e Account 360. Nenhuma regra de negócio, schema, migration, integração ou fluxo funcional foi alterado.

## Folhas canônicas
- `contact-record.css`: preserva `contacts-views-record-v1016.css` + `contacts-experience-completion-v10161.css`.
- `contacts.css`: preserva `contact-views-v10163.css` + `contact-data-grid-view-settings-v10164.css` + `contact-custom-properties-v10165.css`.
- `contact-intelligence.css`: preserva `contact-intelligence-v101105-h3.css`.
- `account-360.css`: preserva `account-intelligence.css`, incluindo mapa de papéis/decisores e organograma operacional do Account 360.

## Segurança de cascade
As quatro folhas canônicas ocupam as mesmas posições relativas das fontes anteriores. Os arquivos históricos continuam no pacote para rollback e auditoria, mas não são carregados pelo runtime atual.

## Resultado
Os imports CSS diretos de `src/main.tsx` caem de 59 para 56. O build registry-independent também exclui as fontes H2 superseded para evitar duplicação de regras.
