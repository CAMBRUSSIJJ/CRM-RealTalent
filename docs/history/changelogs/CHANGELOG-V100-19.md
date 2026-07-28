# Changelog V100.19 — Vendedor Pro

## Confiabilidade

- correção da exclusão operacional parcial;
- persistência de áudio local e remoção de gravações órfãs;
- consentimento de gravação persistido;
- rollback de séries da Agenda e das automações agendadas;
- regras de automação iguais na interface e no runner;
- correções de CSV, métricas, recorrência mensal e armazenamento de fallback;
- endurecimento da RPC de próxima ação e inclusão de Playbooks no Realtime.

## Experiência do vendedor

- preenchimento comercial assistido;
- indicador de completude do lead;
- padrões de temperatura, prioridade, tags, follow-up e lembrete aplicados na operação;
- motivo de perda estruturado;
- agenda alinhada ao expediente configurado;
- filtros ampliados e relatório comercial exportável;
- preferências e Garimpo sincronizados por workspace.

## Banco

Aplique `supabase/migrations/202607190004_v100_19_hardening.sql` após as migrations anteriores.
