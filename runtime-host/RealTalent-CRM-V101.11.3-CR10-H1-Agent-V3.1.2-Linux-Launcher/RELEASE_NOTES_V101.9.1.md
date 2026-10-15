# RealTalent CRM V101.9.1 — Universal View Engine

## Objetivo

Segunda etapa do ciclo arquitetural V101.9.x. A release cria uma camada única de exibições sobre a Core Metadata Foundation da V101.9.0, preservando a UX atual de Contatos e Pipeline.

## Entregue

- `ViewDefinition` canônica e versionada (`101.9.1`);
- modos universais `table`, `list`, `kanban` e `calendar`, mantendo `forecast`, `funnel`, `cards` e `compact` por compatibilidade;
- Filter AST com grupos `AND`, `OR` e `NOT`;
- validação de operadores por `FieldKind` do `FieldRegistry`;
- engine genérico de filtro, ordenação e agrupamento;
- persistência local universal com escopos `personal` e `workspace`;
- adapters transparentes para as saved views existentes de Contatos e Pipeline;
- sincronização automática: as views legadas continuam funcionando e passam a gerar uma representação universal em paralelo;
- identidade universal qualificada por `surface + id`, evitando colisão entre uma view de Contatos e uma view de Pipeline com o mesmo ID;
- reconciliação por superfície em load/save, removendo projeções universais órfãs quando a view legada deixa de existir;
- campos de metadata adicionais usados por views (`city`, `source`, `owner`, datas operacionais e outros);
- inspector interno `window.__REALTALENT_VIEWS__`;
- testes e audit específicos da V101.9.1;
- nenhuma migration SQL nova.
- launcher procura primeiro a V101.9.0 para reaproveitar a sessão de Comunicação/WhatsApp e mantém fallback para H15/hotfixes anteriores.

## Compatibilidade

A UI principal não foi redesenhada. Contatos continua usando `ContactSavedView` e Pipeline continua usando `PipelineSavedView` na superfície atual. O Universal View Engine fica abaixo dessas APIs e permite migrar cada tela gradualmente, sem big-bang rewrite.

## Inspector

```javascript
window.__REALTALENT_VIEWS__.inspect('WORKSPACE_ID')
window.__REALTALENT_VIEWS__.raw('WORKSPACE_ID')
```

## Próxima etapa

V101.9.2 — Universal Record Page.
