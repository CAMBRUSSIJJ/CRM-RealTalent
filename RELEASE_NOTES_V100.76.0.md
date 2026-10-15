# RealTalent CRM V100.76.0 — Pipeline 2.0

Data: 2026-09-20

## Objetivo

Transformar o Pipeline em uma área mais operacional e consistente, reduzindo botões ambíguos e aproximando Kanban, Lista e Previsão do mesmo fluxo de execução comercial.

## Entregas

- ações rápidas padronizadas para oportunidades: **Ligar, Mensagem, Follow-up, Proposta, Cadência e Abrir**;
- cards do Kanban usam botões com rótulos no modo confortável e compactação automática no modo compacto;
- Lista ganhou coluna fixa de ações rápidas, mantendo operação disponível durante rolagem horizontal;
- Previsão de fechamento ganhou ações rápidas por oportunidade sem obrigar abertura prévia da ficha;
- cinco modos do Pipeline agora possuem orientação contextual: Kanban, Lista, Previsão, Calendário e Funil;
- última visualização e densidade ficam persistidas por workspace;
- visões salvas agora preservam também o escopo **Meus negócios / Todos os negócios**;
- preferências antigas são migradas com fallback seguro para Kanban confortável;
- Auditoria funcional atualizada para refletir a padronização do Pipeline.

## Compatibilidade

- sem migration nova;
- `BACKUP_SCHEMA_VERSION` permanece `100.54`;
- preferências existentes do Pipeline continuam válidas;
- nenhuma integração externa foi alterada nesta versão.
