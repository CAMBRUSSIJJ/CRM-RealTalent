# Operação de produção — V100.42

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


## Comunicações oficiais

- Publique os workers `communication-dispatch-worker` e `communication-sync-worker`.
- Configure os webhooks Google, Microsoft e WhatsApp exclusivamente nas URLs de produção.
- Cadastre `COMMUNICATION_WORKER_SECRET`, credenciais OAuth e dados da Meta no cofre do ambiente.
- Acompanhe filas, assinaturas e falhas por organização antes de liberar envio real.
