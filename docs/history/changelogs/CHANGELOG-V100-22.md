# Changelog V100.22 — Pipeline de Execução e Forecast

## Pipeline

- tempo na etapa passa a usar o histórico de movimentação;
- políticas recomendadas por tipo de etapa e configuração compartilhada;
- critérios de avanço para telefone, valor, próxima ação e saltos;
- visão individual do vendedor e visão consolidada da equipe;
- fila de atenção com recortes acionáveis;
- nova saúde “Proposta sem retorno”.

## Produtividade do vendedor

- cadências prontas iniciadas diretamente no card ou por seleção em massa;
- mensagens sugeridas para WhatsApp e e-mail conforme a etapa;
- roteiro de ligação com objetivo e fechamento do próximo passo;
- novos leads atribuídos automaticamente ao usuário atual;
- previsão de fechamento disponível no cadastro.

## Forecast e automações

- forecast mensal baseado em `expectedCloseAt`, separado de `nextActionAt`;
- indicador de cobertura do forecast;
- alertas para previsão vencida;
- receitas de cadência de primeiro contato e negócio sem próxima ação;
- migration e índice parcial para `expected_close_at` no Supabase.

## Qualidade

- novos testes unitários para inteligência do Pipeline e mensagens comerciais;
- versão elevada para V100.22.
