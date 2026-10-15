# RealTalent CRM V101.10.0-H1 — Settings Registry Preflight Hotfix

Hotfix sobre a V101.10.0 para corrigir o Linux release preflight depois da migração para Settings Experience 2.0.

## Correção

O Experience Registry ainda expunha os seletores legados `.settings-v16__hero` e `.settings-v16__body`. A interface atual utiliza `.settings-v1100__header` e `.settings-v1100__body`. O registro foi atualizado para apontar aos alvos reais sem reintroduzir o layout antigo.

## Garantias

- Settings Experience 2.0 preservado;
- preflight continua detectando seletores órfãos;
- nenhuma migration nova;
- V101.9.9-H1/H2/H3/H4 preservadas;
- sessão de Comunicação pode ser migrada diretamente da V101.10.0.
