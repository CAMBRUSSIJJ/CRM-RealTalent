# Recuperação de desastre — V100.46.3

1. Restaurar o banco e aplicar todas as migrations, inclusive `202607280004_v100_46_2_lead_map.sql`.
2. Reconfigurar `GOOGLE_MAPS_API_KEY` e `MAPS_WORKER_SECRET`; secrets não pertencem ao backup de usuário.
3. Publicar `geocode-lead`, `lead-geocode-worker` e `maps-diagnostics`.
4. Recriar o cron `realtalent-lead-geocoding`.
5. Executar o diagnóstico do mapa.
6. Reenfileirar somente leads com `pending`, `approximate` ou `not_found`; coordenadas manuais devem ser preservadas.
7. Conferir `lead_location_history` antes de qualquer correção em massa.
