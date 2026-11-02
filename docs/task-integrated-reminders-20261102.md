# RealTalent — lembretes dentro das tarefas

## Interface entregue
- Editor de tarefa → **Notificações e lembretes**, sem janela separada.
- Padrão: avisar no CRM quando responsável recebe a tarefa e uma hora antes do prazo.
- Por tarefa: ativar/desativar, canais CRM/e-mail/WhatsApp oficial, notificação na atribuição, 1 dia/1 hora/15 min antes e minuto customizado (5 a 10.080).
- Salvar tarefa persiste a regra **na mesma operação de banco** de `work_tasks`, incluindo modo local.
- Lista e quadro: indicador discreto de que há lembretes configurados, que **não** implica envio confirmado.
- Histórico no editor da tarefa: canal, evento, hora programada e estado real da fila: programado/processando/enviado ao canal/falha/cancelado/etc. O status `sent` não afirma entrega ou leitura do destinatário.
- O botão de teste WhatsApp por QR saiu do cabeçalho da lista de tarefas e agora fica em **Configurações → Notificações**, com as mesmas proteções do teste manual (sessão QR ativa, responsável, consentimento, destino diferente do próprio número e nenhuma nova tentativa automática).

## Infraestrutura e segurança
- Migração `202611020003_task_reminder_rules_and_history.sql`: 5 campos em `work_tasks`, CHECK para canais e intervalos, gatilho reativo, leitura de histórico com **RLS restrita à visibilidade da própria tarefa** e somente colunas seguras.
- Não existem INSERT/UPDATE/DELETE de outbox pelo navegador. Sem acesso a telefones verificados, IDs do provedor, mensagens de erro ou segredos do worker.
- Mudança de responsável, prazo, estado ou regra cancela notificações pendentes obsoletas; prazos inferiores à antecedência escolhida não geram falsas notificações imediatas.
- Database: migração **aplicada** no projeto Supabase `bacdqruzxklfqdydijjn`. Testes SQL transacionais com rollback confirmaram: 4 eventos (2 canais × atribuição/uma hora antes); desativar regra cancela os 4; usuário com permissão vê a fila e usuário de outra identidade não vê nenhuma linha.

## Ativação real e limites
- **O processamento periódico continua DESLIGADO**, pois Cron, segredo de autenticação do worker e URL HTTPS do aplicativo não foram homologados.
- O worker `task-reminder-dispatch` continua protegido por `TASK_REMINDER_INTERNAL_ENABLED` e `TASK_REMINDER_DELIVERY_ENABLED` (falso por padrão). Envio de WhatsApp automático **NÃO** utiliza a sessão QR do chat do CRM; depende da Cloud API, template aprovado, opt-in explícito e telefone verificado.
- A conta do funcionário já possui preferências em Configurações → Notificações, mas o OTP de verificação do número **ainda não foi implementado**. Não afirmar que qualquer número registrado na tela está verificado.
- Em modo local, regras são armazenadas somente no dispositivo, **sem processamento automático**; a interface informa isso.
- Esta branch depende da PR #37 e PR #36; Vercel Production não foi alterada. Para o próximo rollout, testar com duas contas reais de workspaces diferentes e confirmar eventos de envio interno, com o botão externo desligado.
- Resumo diário, recorrência automática, atraso por gerente, ações de concluir/adiar no WhatsApp e monitoramento de entrega via webhook ainda são etapas futuras; não são oferecidas como prontas.

## Teste no CRM local
1. Atualize o repositório para `feat/task-integrated-reminders-ux-20261102` e execute `npm run start:dev`.
2. Em Tarefas → Nova tarefa, atribua um responsável do workspace, escolha prazo futuro, mantenha No CRM e escolha as antecedências. Salve.
3. Edite a tarefa para visualizar o histórico (status `Programado` enquanto o worker permanecer desligado).
4. Altere prazo ou desative os lembretes; ao reabrir, confirme o status `Cancelado` nas notificações anteriormente pendentes.
5. Para verificar o gateway QR manualmente: Configurações → Notificações → Testar envio para meu WhatsApp. Confira a conversa antes de repetir qualquer envio indeterminado.

## Validação automatizada
- `node --test scripts/task-reminder-ui-contract.test.mjs`
- `node --test scripts/task-reminder-contract.test.mjs`
- `npm run css:governance`
- `npx vitest run src`
- `npm run typecheck && npm run build`
