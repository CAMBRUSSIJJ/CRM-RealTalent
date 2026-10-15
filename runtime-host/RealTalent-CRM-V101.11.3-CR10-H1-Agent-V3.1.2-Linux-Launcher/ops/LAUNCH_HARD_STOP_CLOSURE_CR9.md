# CR9 — Launch Hard-Stop Closure

## Objetivo
Fechar o GO / NO-GO comercial com evidência executável, sem transformar ausência de credenciais em falso PASS.

## Sequência única
1. Validar staging com o probe CR3 e contas reais Admin/Gestor/Vendedor.
2. Validar produção com o probe CR7: HTTPS, liveness/readiness, headers e Supabase Auth.
3. Executar backup e **restore drill em staging**, nunca começar o primeiro exercício destrutivo em produção.
4. Publicar Termos e Privacidade em HTTPS, confirmar canal de suporte e responsáveis de incidente/onboarding.
5. Executar `npm run runtime:commercial-readiness:cr9`.
6. Somente ativar o primeiro cliente quando `CR9 LAUNCH CLOSURE: GO` e o CR8 também estiver 10/10.

## Evidências
O orquestrador grava saídas sanitizadas em `ops/evidence/` e produz `CR9_LATEST.json` e `CR9_LATEST.md`.
Credenciais, chaves e conteúdo comercial não devem ser copiados manualmente para estes arquivos.

## Variáveis
Use as variáveis CR3/CR7/CR8 já documentadas e marque `CR9_BACKUP_RESTORE_DRILL_PASS=1` apenas depois de um restore drill real e verificado em staging.

## Política de decisão
Qualquer hard stop mantém o resultado como NO-GO. Não existe override automático para cliente pagante.
