# Operação em produção — V100.46.4

## Secrets obrigatórios

- `GOOGLE_MAPS_API_KEY`: usada somente no backend para Google Geocoding.
- `MAPS_WORKER_SECRET`: protege o worker de geocodificação.

Restrinja a chave do Google às APIs necessárias e monitore quota e faturamento.

## Worker

Execute `supabase/cron/CONFIGURAR-INTEGRATION-RUNNERS.sql`. O job `realtalent-lead-geocoding` chama o worker a cada minuto.

## Monitoramento

Acompanhe:

- trabalhos `queued`, `processing`, `retry` e `failed`;
- cobertura de leads localizados;
- endereços incompletos ou não encontrados;
- volume diário de geocodificação;
- repetição de falhas por endereço.

O botão **Diagnóstico do Maps** apresenta um resumo operacional por workspace.
