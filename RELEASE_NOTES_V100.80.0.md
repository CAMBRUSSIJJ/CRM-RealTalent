# RealTalent CRM V100.80.0 — Metas 2.0

## Gestão por resultado
- Ritmo das metas passa a considerar **dias úteis (segunda a sexta)** em vez de progresso por calendário corrido.
- Corrige a referência de “hoje” para usar a data local do navegador, evitando mudança antecipada de dia em fusos como Brasil.
- Cada meta mostra progresso real, ritmo esperado, gap contra o ritmo, necessidade diária e projeção final.
- A projeção indica explicitamente se a meta tende a atingir 100% no ritmo atual.
- Comparação com o período anterior usa o **mesmo ponto temporal** do período atual para evitar comparação injusta com um período completo.

## Configuração e acompanhamento
- Nova criação de metas com presets Hoje, Semana, Mês, **Trimestre**, **Ano** e Personalizado.
- Escopo de meta fica explícito como **Equipe** ou **Individual**.
- Filtros por responsável, métrica e saúde da meta.
- Saúde pode ser filtrada por Atingida, No ritmo, Atenção, Em risco e Projeção abaixo da meta.
- Preferências da visão (aba e filtros) são preservadas localmente por workspace.
- Cards exibem dias úteis transcorridos/total e comparação com o período anterior.
- Visão de equipe inclui quantidade projetada para atingir a meta.

## Compatibilidade
- Nenhuma migration nova.
- `BACKUP_SCHEMA_VERSION` permanece `100.54`.
- A métrica de Metas permanece classificada como Funcional na Auditoria Funcional.
- O calendário comercial ainda não desconta feriados regionais; isso fica como evolução futura.
