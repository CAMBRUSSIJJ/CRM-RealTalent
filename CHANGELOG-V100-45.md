# Changelog V100.45 — Fundação de Integrações

- removida a central antiga duplicada;
- migrado o histórico legado para `integration_audit_events`;
- adicionados modos de acesso por conta e autorização de usuários;
- implantados PKCE S256 e estado OAuth de uso único;
- implantados refresh, rotação e revogação de tokens;
- segregados workers e allowlists por provedor;
- implantados leases, recuperação de locks e dead letter;
- adicionados diagnóstico, teste de conexão e painel de capacidades;
- ampliada a validação de secrets e a configuração dos runners;
- removida a dependência da extensão em `integration_connections` e `integration_events`.
- bloqueada a escrita direta do frontend em contas conectadas;
- corrigidos enfileiramento service-role, gateway do callback OAuth e CORS dos endpoints;
- adicionadas revogação no provedor e validação HMAC do webhook do WhatsApp.
