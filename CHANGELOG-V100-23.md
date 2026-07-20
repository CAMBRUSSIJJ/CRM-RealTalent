# Changelog V100.23 — Integrações e Automação Confiável

## Nova experiência

- Central de Integrações profissional em Configurações;
- cartões com estados conectado, assistido, atenção, desconectado e planejado;
- configuração guiada da Extensão RealTalent em conexão, destino, tratamento e automação;
- histórico de lotes e falhas por workspace;
- distinção clara entre recursos reais, assistidos e futuros.

## Extensão e segurança

- endpoint `extension-ingest` autenticado por token revogável;
- tokens armazenados somente como SHA-256 e exibidos uma única vez;
- rotação, revogação, limite de 100 itens, limite de 1 MB e idempotência por lote;
- destino Garimpo ou CRM, com etapa, responsável, prioridade, temperatura e etiquetas;
- regras de duplicidade: ignorar, atualizar ou criar;
- próxima ação automática para leads enviados diretamente ao CRM.

## Automação

- fila persistente `automation_events` para eventos externos;
- runner processa `lead_imported` sem navegador aberto, mantendo simulação, cooldown, limite diário, prevenção de duplicidade e rollback;
- nova receita segura “Lead da extensão pronto para contato”.

## Banco e implantação

- migration `202607190007_v100_23_integration_hub.sql`;
- tabelas de conexões, credenciais, histórico e fila;
- RLS, privilégios mínimos, auditoria de rotação/revogação e validação exclusiva da `service_role`;
- roteiro de deploy e verificações SQL atualizados.
