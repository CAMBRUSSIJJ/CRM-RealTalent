# Recuperação — V100.46.5

- a sessão em andamento possui rascunho local e pode ser recuperada após recarregar;
- gravação parcial local é recuperada quando disponível;
- comandos vencidos do Connect são marcados como `expired`;
- chamadas em execução não são sobrescritas por um segundo comando;
- em rollback, reverta o frontend para a V100.46.4; a tabela de comandos pode permanecer sem impactar os módulos anteriores.
