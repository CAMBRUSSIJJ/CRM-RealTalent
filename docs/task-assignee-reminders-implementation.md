# RealTalent — lembretes de tarefas por responsável (fase 1)

**Estado em 02/11/2026: tabelas e gatilho aplicados no Supabase principal; duas Edge Functions publicadas, porém sem agenda nem disparos externos habilitados. PR aberta para revisão e interface ainda fora do CRM em produção.**

## Experiência prevista

1. O gestor cria uma tarefa no CRM e atribui a um usuário do workspace.
2. O gatilho PostgreSQL cria eventos duráveis (`assigned` imediatamente e `due_soon` uma hora antes do prazo) para três canais.
3. O worker usa somente credenciais de serviço protegidas e consulta as preferências pessoais do destinatário.
4. Dentro do CRM, o aviso aparece como `seller_notifications` com `user_id` do responsável e rota `tasks`.
5. Para e-mail, o aviso é enviado ao **e-mail verificado de autenticação** do responsável, se ele tiver optado por receber lembretes e o serviço transacional Resend estiver configurado.
6. Para WhatsApp, a mensagem sai **do número oficial WhatsApp Business configurado no RealTalent**, não do WhatsApp pessoal do gestor. O destinatário é o **número próprio** do responsável, apenas após opt-in e verificação independente. O modelo Meta `pt_BR` deve estar aprovado e receber **três variáveis no corpo**, na ordem: título da tarefa, prazo e link do CRM. Não existem envios via WhatsApp Web/QR nesta funcionalidade.

O link direciona à URL HTTPS do CRM configurada em `TASK_REMINDER_APP_URL` e exige login; o responsável abre a aba Tarefas. Não há acesso anônimo nem links que contornam permissões.

## Segurança
- O front-end não acessa a fila e **nunca** recebe token Meta, chave Resend ou chave `service_role`.
- Tabela `task_notification_outbox` privada por RLS e grants; seleção de destinatário feita pelo trigger com `organization_members`; worker revalida vínculo e status antes de enviar.
- Preferências são individuais, gravadas sob a identidade Supabase autenticada, isoladas por workspace.
- O opt-in **não** realiza verificação de telefone. O serviço só envia WhatsApp se houver registro de telefone verificado em `task_notification_verified_phones`, preenchido exclusivamente por um processo de verificação servidor (não implementado nesta fase).
- Tarefas concluídas, canceladas, reassumidas por outro usuário ou com prazo alterado têm avisos pendentes cancelados. O worker também valida isso antes de enviar.
- Nenhuma credencial foi escrita no repositório.
- E-mail usa `Idempotency-Key` do envio no Resend; WhatsApp não é repetido automaticamente em falhas com resultado ambíguo.
- A fila registra `sent` quando a API aceita a mensagem, **não** garante recebimento ou leitura no telefone. Para isso, integrar webhooks de status oficiais.

## Implantado sem envio automático

1. Migração SQL aplicada ao projeto Supabase principal. Testes transacionais com rollback validaram atribuição (3 avisos) e conclusão de tarefa (0 pendentes); nenhuma mensagem externa foi enviada.
2. Função `task-reminder-readiness` (JWT obrigatório) está ACTIVE, versão 2, para leitura autenticada do estado de configuração sem retornar segredos.
3. Função `task-reminder-dispatch` (autenticação independente por `x-task-reminder-secret`) está ACTIVE, versão 2, porém sem agendamento; na ausência do segredo forte retorna 503. Dois kill switches ficam desligados até configuração e homologação.
4. Interface passa a consultar os avisos persistidos dos próprios responsáveis, com isolamento por RLS; a mudança de interface ainda depende da promoção da PR.

## Pendências antes de liberar avisos

1. Testar com contas autenticadas de dois workspaces, registrar autorização de cada responsável, testar reatribuição e cancelamento na UI.
2. Configurar o segredo de agendamento e o Cron; o agendador não está ativo. O worker sem segredo não pode processar envios.
4. Variáveis do Supabase Edge Function:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (servidor);
   - `TASK_REMINDER_CRON_SECRET` (mínimo 32 caracteres);
   - `TASK_REMINDER_APP_URL` (URL HTTPS verificada do CRM);
   - `TASK_REMINDER_INTERNAL_ENABLED=true` para ativar **somente os avisos internos**, sem enviar a provedores externos;
   - `TASK_REMINDER_DELIVERY_ENABLED=true` somente **após** o teste de provedores, destinatários, consentimento e confirmação de habilitação;
   - para e-mail: `RESEND_API_KEY`, `TASK_REMINDER_FROM_EMAIL` (domínio verificado);
   - para WhatsApp: `TASK_REMINDER_META_TOKEN`, `TASK_REMINDER_META_PHONE_ID`, `TASK_REMINDER_META_GRAPH_VERSION`, `TASK_REMINDER_META_TEMPLATE_NAME`.
5. Configurar scheduler a cada minuto (Supabase Cron + pg_net, com segredo no Vault, ou agendamento Railway equivalente); **não há scheduler automático nesta PR**. Os módulos `pg_cron` e `pg_net` não estavam habilitados no projeto consultado, então não configurá-los implicitamente.
6. Confirmar o status/aprovação do modelo Meta e a categoria apropriada com a conta de negócio. Requer autorização expressa do empregado.
7. Criar fluxo de verificação de telefone (OTP ou equivalente) antes de habilitar WhatsApp; até lá a fila marcará o envio como bloqueado.
8. Confirmar retorno de webhooks de entrega para distinguir `accepted`, `delivered` e `read`.
9. Não alterar produção Vercel/Railway enquanto os erros de autenticação 401 entre os serviços da release anterior persistirem.

## Operação segura

O worker processa até 25 eventos por execução, faz claim atômico de status, registra o retorno por canal e mantém status `blocked` em falta de configuração/consentimento. `blocked` exige revisão ou replanejamento seguro: não reativar em massa sem confirmar os destinatários e os eventos.

**Critérios mínimos de aceite:** atribuir → alerta do CRM; opt-in e-mail → e-mail recebido; reassumir/concluir → avisos futuros cancelados; dois workspaces → isolamento; opt-in WhatsApp sem telefone verificado → zero envios; telefone verificado e modelo aprovado → API aceita e webhook informa entrega.

## Resultado verificado

- Supabase: 3 tabelas com RLS configurado, gatilho criado e 2 Edge Functions ACTIVE. Não houve dados de teste persistidos.
- Teste SQL com rollback: criação de tarefa com prazo de duas horas enfileirou 6 notificações (atribuição e antecedência, 3 canais cada). Ao concluir, 0 avisos pendentes e 6 cancelados. Nenhum disparo externo.
- GitHub Actions valida contratos de segurança, regressão, typecheck e build. O status da PR deverá ser verificado no commit de release.
- E-mail real e WhatsApp real seguem bloqueados por falta de credenciais homologadas; não presumir domínio, número comercial ou telefone dos funcionários.
