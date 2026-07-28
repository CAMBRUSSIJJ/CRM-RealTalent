# Operação de produção — V100.41

## Ambientes

- desenvolvimento: dados locais ou Supabase local;
- staging: projeto Supabase e domínio próprios;
- produção: credenciais e projeto exclusivos, protegidos por GitHub Environment.

## Promoção

A promoção usa `.github/workflows/promote-production.yml`, exige confirmação explícita, executa o gate de código, cria backup, publica o frontend e valida o health da release.

## Observabilidade

Erros autenticados do navegador são enviados à Edge Function `client-diagnostics` e gravados em `system_health_events`. Somente administradores da organização podem consultar e resolver esses eventos.

## Indicadores operacionais mínimos

- erros críticos abertos;
- filas em dead-letter;
- tokens expirados;
- última comunicação de Connect e extensões;
- versão e commit publicados;
- data do último backup aprovado.
