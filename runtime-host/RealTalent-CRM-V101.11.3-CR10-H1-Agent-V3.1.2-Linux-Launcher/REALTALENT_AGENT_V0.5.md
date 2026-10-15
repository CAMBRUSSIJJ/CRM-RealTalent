# RealTalent Agent V0.5 — Unified Agent Core

A V0.5 consolida o Assistant do CRM, o Agent do Blue Ocean, Browser QA e Builder sob uma única identidade operacional: **RealTalent Agent**.

## Modos internos
- ASK — responde e orienta.
- ANALYZE — analisa o contexto atual sem mutação.
- ACT — propõe uma tool comercial do CRM; a aplicação revalida IDs/permissões e exige confirmação.
- BUILD — propõe `system.run_builder`; após confirmação, o runtime usa patch limitado a `src/`, backup, gates, rollback e Browser QA.
- QA — propõe `system.run_qa`; usa Chromium gerenciado em loopback, modo `observe` por padrão.

## Memória compartilhada
O runtime mantém um histórico textual resumido entre CRM e Blue Ocean em `~/.local/state/realtalent-agent/unified-memory.json` (ou `XDG_STATE_HOME`). Não persiste snapshots completos do CRM nem do Service Graph. Padrões de API key/token/senha são redigidos antes da gravação. A memória pode ser consultada ou limpa com `./memoria-agent.sh` no bundle completo.

## Builder no mesmo chat
O drawer do CRM entende planos `run_builder` e `run_qa`. O Builder só recebe workspaces previamente registrados pelo launcher V0.5 e não aceita paths fornecidos pelo navegador.

## Segurança
Sem delete tools, pagamento, envio autônomo de mensagem, sudo, shell livre, alteração de `.env`, Supabase/RLS, Auth, migrations, permissões, lockfiles ou infraestrutura. Escrita comercial e Builder exigem confirmação humana.

## Browser QA
CRM: CDP `127.0.0.1:9223`. O QA compartilha a mesma sessão do Chromium gerenciado e permanece em loopback.
