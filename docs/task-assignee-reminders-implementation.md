# RealTalent — lembretes de tarefas por responsável (fase 1)

**Estado: PR pronta para revisão; não habilitar envios externos sem verificar credenciais, consentimento e canais.**

## Experiência prevista

1. O gestor cria uma tarefa no CRM e atribui a um usuário do workspace.
2. O gatilho PostgreSQL cria eventos duráveis (`assigned` imediatamente e `due_soon` uma hora antes do prazo) para três canais.
3. O worker usa somente credenciais de serviço protegidas e consulta as preferências pessoais do destinatário.
4. Dentro do CRM, o aviso aparece como `seller_notifications` com `user_id` do responsável e rota `tasks`.
5. Para e-mail, o aviso é enviado ao **e-mail verificado de autenticação** do responsável, se ele tiver optado por receber lembretes e o serviço transacional Resend estiver configurado.
6. Para WhatsApp, a mensagem sai **do número oficial WhatsApp Business configurado no RealTalent**, não do WhatsApp pessoal do gestor. O destinatário é o **número próprio** do responsável, apenas após opt-in e verificação independente. O modelo Meta `pt_BR` deve estar aprovado e receber **três variáveis no corpo**, na ordem: título da tarefa, prazo e link do CRM. Não existem envios via WhatsApp Web/QR nesta funcionalidade.

O link direciona a `/#/tasks` e requer login; ele não libera acesso anônimo nem acessa tarefas de outros membros.

## Segurança
- O front-end não acessa a fila e **nunca** recebe token Meta, chave Resend ou chave `service_role`.
- Tabela `task_notification_outbox` privada por RLS e grants; seleção de destinatário feita pelo trigger com `organization_members`; worker revalida vínculo e status antes de enviar.
- Preferências são individuais, gravadas sob a identidade Supabase autenticada, isoladas por workspace.
- O opt-in **não** realiza verificação de telefone. O serviço só envia WhatsApp se houver registro de telefone verificado em `task_notification_verified_phones`, preenchido exclusivamente por um processo de verificação servidor (não implementado nesta fase).
- Tarefas concluídas, canceladas, reassumidas por outro usuário ou com prazo alterado têm avisos pendentes cancelados. O worker também valida isso antes de enviar.
- Nenhuma credencial foi escrita no repositório.
- E-mail usa `Idempotency-Key` do envio no Resend; WhatsApp não é repetido automaticamente em falhas com resultado ambíguo.
- A fila registra `sent` quando a API aceita a mensagem, **não** garante recebimento ou leitura no telefone. Para isso, integrar webhooks de status oficiais.

## Dependências antes de produção

1. Aplicar e validar `supabase/migrations/202611020001_task_assignee_notification_outbox.sql` num banco de preview/staging.
2. Verificar e aprovar policies RLS para preferências e servidor; executar teste com dois workspaces e dois membros (tarefa atribuída, reatribuída, cancelada, alterada, vencida).
3. Habilitar a função `task-reminder-dispatch` com `verify_jwt=false` SOMENTE porque ela exige `x-task-reminder-secret` forte, configurado no servidor, e nunca enviado a clientes.
4. Variáveis do Supabase Edge Function:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (servidor);
   - `TASK_REMINDER_CRON_SECRET` (mínimo 32 caracteres);
   - `TASK_REMINDER_APP_URL` (URL do CRM);
   - para e-mail: `RESEND_API_KEY`, `TASK_REMINDER_FROM_EMAIL` (domínio verificado);
   - para WhatsApp: `TASK_REMINDER_META_TOKEN`, `TASK_REMINDER_META_PHONE_ID`, `TASK_REMINDER_META_GRAPH_VERSION`, `TASK_REMINDER_META_TEMPLATE_NAME`.
5. Ativar scheduler a cada minuto (Supabase Cron + pg_net, com segredo no Vault, ou agendamento Railway equivalente); **não há scheduler automático nesta PR**. Os módulos `pg_cron` e `pg_net` não estavam habilitados no projeto consultado, então não configurá-los implicitamente.
6. Confirmar o status/aprovação do modelo Meta e a categoria apropriada com a conta de negócio. Requer autorização expressa do empregado.
7. Criar fluxo de verificação de telefone (OTP ou equivalente) antes de habilitar WhatsApp; até lá a fila marcará o envio como bloqueado.
8. Confirmar retorno de webhooks de entrega para distinguir `accepted`, `delivered` e `read`.
9. Não alterar produção Vercel/Railway enquanto os erros de autenticação 401 entre os serviços da release anterior persistirem.

## Operação segura

O worker processa até 25 eventos por execução, faz claim atômico de status, registra o retorno por canal e mantém status `blocked` em falta de configuração/consentimento. `blocked` exige revisão ou replanejamento seguro: não reativar em massa sem confirmar os destinatários e os eventos.

**Critérios mínimos de aceite:** atribuir → alerta do CRM; opt-in e-mail → e-mail recebido; reassumir/concluir → avisos futuros cancelados; dois workspaces → isolamento; opt-in WhatsApp sem telefone verificado → zero envios; telefone verificado e modelo aprovado → API aceita e webhook informa entrega.
