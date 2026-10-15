# V100.55.1 — Bugfix & Interaction Reliability

Release de manutenção da V100.55.0 com foco em confiabilidade dos botões, ações contextuais e consistência do Account 360 em toda a operação.

## Destaques

- Central de Ligações passa a resolver o stakeholder telefônico correto mesmo sem `lead.phone`.
- Stakeholder da tentativa fica bloqueado depois da discagem para impedir atribuição do histórico à pessoa errada.
- Correção do ciclo `MediaRecorder` ao encerrar/salvar chamadas rapidamente.
- Leads, Pipeline, Meu Dia, Follow-ups e Agenda usam o alvo de contato resolvido pelo Account 360.
- Pipeline, Agenda e Follow-ups abrem a Central de Ligações para preservar outcome/próxima ação em vez de bypassar o CRM.
- Agenda ganhou filtros rápidos realmente funcionais e conflitos apenas ativos/futuros.
- Reunião com lead exige outcome comercial antes de ser concluída.
- Deep links são consumidos ao fechar modais/drawers, evitando reabertura após refresh Realtime.
- “Próximo dia útil” e callbacks respeitam o calendário comercial configurado.
- Botões falsos/decorativos removidos e auditoria passa a impedir regressão de botões sem ação.

## Banco

Nenhuma migration nova. A release continua usando as 34 migrations existentes até V100.54.

## Validação

Consulte `docs/V100.55.1-BUGFIX-QA.md`.
