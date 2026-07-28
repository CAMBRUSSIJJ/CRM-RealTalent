# V100.3 — Metas, Automações e Métricas

## Implementado

- Metas calculadas a partir dos dados reais do CRM.
- Oito métricas comerciais tipadas.
- Progresso, ritmo esperado, atenção e risco.
- Construtor de automações com gatilhos, condições e múltiplas ações.
- Execução idempotente e histórico auditável.
- Teste manual por lead e desfazer de ações reversíveis.
- Ações automáticas conectadas à criação de lead, mudança de etapa e resultado de ligação.
- Verificação de atividades vencidas.
- Métricas comerciais em 7, 30 e 90 dias.
- Funil, receita, conversão, contato, taxa de ganho, ticket e previsão ponderada.
- Realtime para metas, regras e execuções.
- Migration V100.3 com constraints, índices e view auxiliar.
- Edge Function inicial para execução agendada de atividades vencidas.
- Metas e Automações incluídas na navegação móvel.

## Segurança e confiabilidade

- `event_key` impede repetição do mesmo evento automático.
- Execuções registram entrada, saída, status, erro e mutações.
- Desfazer restaura atualizações de lead e remove atividades criadas pela execução.
- Somente ações reversíveis foram liberadas nesta etapa.
- Segredos do agendador e `service_role` permanecem fora do frontend.

## Testes

- TypeScript aprovado.
- 18 testes unitários aprovados.
- Build Vite aprovado.
- Smoke test Chromium aprovado.
- Meta criada e calculada na interface real.
- Automação executada, auditada e desfeita.
- Métricas alternadas por período.
- Desktop e celular sem erros de console ou overflow.
