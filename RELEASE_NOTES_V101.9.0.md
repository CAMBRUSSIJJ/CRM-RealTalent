# RealTalent CRM V101.9.0 — Core Metadata Foundation

## Escopo

Primeira etapa do ciclo de consolidação arquitetural V101.9.x. A release **não redesenha a UX principal** e não remove nenhum módulo da V101.8.4-H15.

## Entregue

- `ObjectRegistry` para `Lead`, `ContactRecord`, `CompanyRecord` e `OpportunityRecord`;
- `FieldRegistry` tipado com campos essenciais e campos relacionais;
- `RelationRegistry` com relações Lead ↔ Company, Lead ↔ Contact e Lead ↔ Opportunity;
- adapters compatíveis com os modelos legados;
- `PlatformRecord` como representação universal interna;
- validação não destrutiva de IDs, workspace e relações;
- `WorkspaceSnapshot` existente passa pelo adapter metadata antes do render;
- inspector interno somente leitura em `window.__REALTALENT_METADATA__.inspect()`;
- testes de regressão para preservar IDs, contagens e shape legado;
- nenhuma migration SQL nova: as 46 migrations existentes permanecem intactas e verificadas.

## Compatibilidade

A UI continua consumindo `WorkspaceSnapshot`, `Lead`, `ContactRecord`, `CompanyRecord` e `OpportunityRecord`. A metadata é uma camada adicional e reversível nesta versão; nenhuma tela precisa migrar para `PlatformRecord` ainda.

## Próxima etapa

V101.9.1 — Universal View Engine.
