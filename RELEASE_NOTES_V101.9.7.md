# RealTalent CRM V101.9.7 — Extension Registry

## Escopo

Consolidação das integrações em uma plataforma plugável sem marketplace público. A release preserva as telas atuais e move contratos dispersos de providers para manifests registrados.

## Entregue

- `ExtensionManifest` e `ExtensionRegistry` como fonte única de providers;
- manifests nativos para Google Workspace, Microsoft 365, Meta Business, WhatsApp Cloud, RealTalent Connect e RealTalent Capture;
- catálogo central de scopes, capacidades e jobs;
- `ExtensionCommandRegistry` para commands/actions declarativos;
- feature flags por extensão com overrides de runtime;
- lifecycle hooks (`beforeConnect`, `afterConnect`, `beforeSync`, `afterSync`, `onError`, `onEnable`, `onDisable`);
- OAuth e sync do Integration Framework publicam eventos de lifecycle;
- RealTalent Connect registra e valida `realtalent_connect.call`;
- Permission Matrix deriva scopes diretamente do Extension Registry;
- aba **Registro** na Central de Integrações;
- inspector `window.__REALTALENT_EXTENSIONS__`;
- nenhuma migration SQL nova; as 48 existentes permanecem intactas.

## Compatibilidade

`ConnectedAccount`, filas de sync, Central de Extensões, OAuth, Communications Gateway e RealTalent Connect continuam com os mesmos contratos externos. A mudança é arquitetural e mantém a UX principal.

## Próxima etapa

V101.9.8 — Design System Consolidation.
