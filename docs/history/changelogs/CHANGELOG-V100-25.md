# Changelog V100.25 — Automação Comercial Pós-Captura

## Adicionado

- área **Automações → Operação** com fila, filtros, erros, avisos internos e mensagens preparadas;
- fluxo pós-captura configurável na integração da Extensão RealTalent;
- cadência comercial com etapas de qualificação e retomada;
- rascunhos assistidos de WhatsApp e e-mail;
- avisos acionáveis para o responsável do lead;
- tentativas progressivas, recuperação de trava, fila de intervenção e reprocessamento administrativo;
- tabelas `seller_notifications` e `contact_drafts` com RLS;
- funções seguras para reprocessar e cancelar eventos;
- testes da persistência e idempotência das operações assistidas.

## Alterado

- `extension-ingest` passa contexto do fluxo e prioridade para `automation_events`;
- `automation-runner` executa o pacote pós-captura mesmo sem regra personalizada ativa;
- ações `internal_alert`, `assisted_whatsapp` e `assisted_email` agora geram artefatos operacionais próprios;
- o limite padrão da fila passou para cinco tentativas, com espera exponencial e intervenção após esgotamento.

## Segurança

- mensagens externas continuam assistidas e nunca são disparadas automaticamente;
- alterações da fila exigem papel administrativo e passam por funções `security definer` com validação de workspace;
- registros são isolados por organização e protegidos por RLS.
