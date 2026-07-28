# Observabilidade — V100.41

A migration `202607270002_v100_41_production_observability.sql` adiciona `system_health_events` com isolamento por organização.

O frontend mantém a contingência local e envia eventos ao backend sem bloquear a operação. A Edge Function exige sessão válida e o RLS confirma a participação do usuário na organização.

Não são enviados tokens, senhas, gravações ou conteúdo integral de conversas. O contexto é limitado a versão, rota, referência e identificação técnica do navegador.
