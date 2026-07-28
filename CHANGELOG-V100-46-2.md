# V100.46.2 — Mapa de Leads

## Entrega

- Aba **Mapa de Leads** oficializada no menu principal.
- Marcadores por etapa e prioridade, agrupamento por cidade e mapa de calor.
- Filtros por cidade, etapa, responsável, prioridade, localização e atraso.
- Busca por raio, seleção de área e ações em massa.
- Card do lead com ligação, WhatsApp, rota, geocodificação e correção manual.
- Fila de localização com estados exato, manual, aproximado, pendente, incompleto e não encontrado.
- Geocodificação em fila persistente no Supabase, retry, lease e worker dedicado.
- Histórico de alterações de endereço e coordenadas.
- Diagnóstico do Maps por workspace, cobertura e estado da fila.
- Modo demonstração identificado como estimativa local.
- Google Geocoding mantido somente no backend; a chave secreta não é enviada ao navegador.

## Implantação

Configure `GOOGLE_MAPS_API_KEY` e `MAPS_WORKER_SECRET` nos secrets do Supabase e agende `lead-geocode-worker` pelo arquivo `supabase/cron/CONFIGURAR-INTEGRATION-RUNNERS.sql`.
