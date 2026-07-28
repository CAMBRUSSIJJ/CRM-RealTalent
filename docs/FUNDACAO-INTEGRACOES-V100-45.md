# Fundação de Integrações V100.45

## Fonte única

`integration_connected_accounts`, `integration_sync_jobs`, `integration_sync_attempts`, `integration_diagnostics` e `integration_audit_events` formam a central oficial. As tabelas `integration_connections` e `integration_events` permanecem somente para preservação histórica, sem acesso do frontend.

## Segurança

O início OAuth gera um verificador PKCE, armazena o estado por hash e criptografa o verificador. O callback consome esse estado uma única vez. Tokens são armazenados criptografados, renovados no backend e revogados ao desconectar.

## Permissões

Cada conta pode ser pessoal, compartilhada, organizacional ou restrita. A autorização é validada no banco antes de enfileirar sincronizações ou comunicações.

## Filas

Cada tipo de trabalho possui provedor e worker permitidos. A captura é atômica com `FOR UPDATE SKIP LOCKED`, lease e recuperação de processamento abandonado.

## Diagnóstico

A função de diagnóstico verifica secrets, contrato do banco, credenciais, validade, acesso e leases. O teste de conexão realiza uma chamada real ao provedor e registra latência e resultado.

## Revogação e webhooks

A desconexão elimina o token do cofre e tenta revogá-lo no provedor quando a API oferece essa operação. O callback OAuth é público no gateway, porém protegido por estado de uso único e PKCE. Webhooks públicos validam segredo ou assinatura do provedor; o WhatsApp exige `X-Hub-Signature-256`.

## Operação

A manutenção usa credencial service-role para renovar tokens, executar diagnósticos periódicos e recuperar leases expirados. Nenhum worker genérico pode retirar trabalhos dos provedores. Alterações de contas conectadas são feitas somente por RPCs e Edge Functions auditáveis.
