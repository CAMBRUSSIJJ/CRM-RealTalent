# RealTalent V101.11.3 — conector WhatsApp local (migração controlada)

Esta integração **parte do commit real de produção da Vercel** e preserva a fila existente
`task_notification_outbox` e as notificações internas. NÃO use as duas migrations
`202611050001_task_assignment_whatsapp.sql` e `202611050002_local_whatsapp_bridge.sql`
do pacote V100.51.1: elas usam `activities` e criariam uma fila duplicada.

## Estado e limites

- Código de QR, sessão, verificação de telefone e transporte local de avisos: preparado.
- A produção continua inalterada até a aplicação consciente da migração e das configurações.
- **Chat, sincronização de conversas, imagens, áudios e arquivos ainda usam o gateway atual**;
  este pacote NÃO substitui essas rotas nem transfere automaticamente o histórico antigo.
- Não desligue Railway até validar um transporte de chat/mídia alternativo.

## Configuração controlada

1. Faça backup do Supabase da conta atual; não aplique `db reset`.
2. Aplique **somente** a migration nova
   `supabase/migrations/202611050010_v101_11_3_whatsapp_local_bridge.sql`
   sobre o schema V101.11.3, sem reaplicar as migrations de V100.51.1.
3. Publique as funções `whatsapp-session` e a versão atualizada de
   `task-reminder-dispatch`. Defina em **Edge Functions → Secrets**:
   `WHATSAPP_CONNECTION_MODE=bridge`. Não altere `TASK_REMINDER_INTERNAL_ENABLED`.
4. Configure na **prévia da Vercel**, e depois na produção quando aprovado:
   `VITE_WHATSAPP_CONNECTION_MODE=bridge`.
   O frontend usa apenas a chave pública do Supabase; nunca coloque `service_role`
   em uma variável `VITE_*`.
5. Instale Node.js 22 e Docker Engine/Compose no Linux. Na raiz do repo execute:

   ```bash
   cd deploy/local-whatsapp
   node init.mjs
   ```

   Edite o `.env` criado, com `SUPABASE_URL`, `ORGANIZATION_ID`,
   `CRM_PUBLIC_URL` e a chave **legada** `SUPABASE_SERVICE_ROLE_KEY`.
   A chave fica SOMENTE nesse Linux confiável. Não envie prints do arquivo.
   `ORGANIZATION_ID` aparece na tela de Configurações → WhatsApp do CRM.

6. Inicie:

   ```bash
   docker compose up -d --build
   docker compose ps
   docker compose logs --tail=50 connector
   ```

   `restart: unless-stopped` reinicia os containers quando o Docker voltar.
   No Linux com systemd, `sudo systemctl enable --now docker` habilita o motor no boot.
   O navegador não consegue iniciar o Docker sozinho por razões de segurança.
7. Abra **Configurações → WhatsApp → Gerar QR Code** e leia pelo telefone.
   Em **Configurações → Notificações**, salve seu próprio número com `+55` e
   autorize os avisos. Depois volte ao WhatsApp, envie um código de verificação
   para esse número, confirme-o no CRM e crie uma tarefa com canal WhatsApp
   selecionado e atribua-a a esse usuário.

## Segurança, filas e recuperação

- O bridge só sai para Supabase HTTPS; a API Evolution só abre em 127.0.0.1,
  Redis/Postgres não têm portas abertas e as credenciais não entram no site.
- Somente administradores do workspace solicitam conexão e desconexão.
- O QR é mostrado somente para administrador autenticado. A chave privada e
  as mensagens da fila não são legíveis por usuários do browser.
- Cada aviso corresponde a uma linha **já existente** de `task_notification_outbox`.
  O worker cloud deve ignorar o canal WhatsApp quando `WHATSAPP_CONNECTION_MODE=bridge`.
- O número deve corresponder ao cadastro/consentimento do próprio destinatário
  e ser verificado por código recebido no aparelho. Se for trocado, não envia.
- Se o resultado de um envio for incerto, ele é bloqueado para revisão;
  nunca reenvie automaticamente, evitando duplicação.
- Avisos de atribuição com mais de 60 min ou prazo com mais de 180 min expiram
  sem disparar em massa após reativar um PC desligado.
- Para parar temporariamente: `docker compose stop`. Para retomar:
  `docker compose up -d`. Evite `docker compose down -v`: apaga volumes.
- Para rollback da interface, remova a variável de bridge da Vercel e
  restaure o deployment anterior; a migração é aditiva.

## Verificações

```bash
node --check deploy/local-whatsapp/connector.mjs
node --test deploy/local-whatsapp/connector.test.mjs
npm run typecheck
npm run build
```

Aprovar remoção do Railway **somente depois** de validar login, QR persistente,
envio WhatsApp real, ausência de duplicações, e depois o chat, anexos,
sincronização e armazenamento de mídia sem o gateway Railway.
