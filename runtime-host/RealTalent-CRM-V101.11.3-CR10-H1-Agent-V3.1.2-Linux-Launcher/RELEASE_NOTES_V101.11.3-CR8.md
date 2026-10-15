# V101.11.3-CR8 — Commercial Launch Gate & First Customer Readiness

Base: V101.11.3-CR7.

## Entregas
- Gate final GO / NO-GO para comercialização.
- Política declarativa em `ops/launch-gate.cr8.json`.
- Runner `runtime:commercial-readiness:cr8` com 10 evidências obrigatórias.
- Runbook do primeiro cliente: workspace, equipe, convites, permissões, first value, suporte, incidente e rollback.
- Checklist de prontidão jurídica/privacidade sem alegar substituir revisão jurídica.
- Definição de métricas de ativação com minimização de dados.
- Template `.env.cr8.example` sem segredos.
- Preservação da linhagem CR7 e marker CR8 no launcher.
- Capability Matrix e Release Manifest atualizados.

## Regra de lançamento
A ausência de qualquer evidência obrigatória mantém `NO-GO`. O gate não considera documentação estática como prova de produção.

## Estado desta execução
- Static CR8 audit: PASS 32/32.
- Runtime sem evidências reais: NO-GO 0/10 (comportamento esperado).
- Runtime com valores sintéticos de teste: GO 10/10 (somente teste da lógica; não é prova de produção).
- Produção real/staging/restore/legal/support/first customer: ainda não comprovados neste ambiente.
