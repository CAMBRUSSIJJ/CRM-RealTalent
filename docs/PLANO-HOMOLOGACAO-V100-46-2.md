# Plano de homologação — V100.46.2

1. Abrir a aba **Mapa de Leads** e confirmar que todos os leads ativos aparecem na lista.
2. Validar filtros por cidade, etapa, responsável, prioridade, status geográfico e atraso.
3. Confirmar marcadores, agrupamento em zoom baixo e mapa de calor.
4. Selecionar um lead e testar ligação, WhatsApp, rota e abertura da base de Leads.
5. Processar um endereço completo e validar a transição para exato ou aproximado.
6. Corrigir latitude e longitude manualmente e confirmar status `manual`.
7. Validar fila com retry, lease e recuperação de trabalho interrompido.
8. Confirmar que usuário viewer não altera localização.
9. Testar isolamento entre duas organizações.
10. Executar **Diagnóstico do Maps** e conferir cobertura e fila.
11. Validar que o modo local informa claramente que utiliza estimativas.
12. Executar `npm run homologate:portable`.
