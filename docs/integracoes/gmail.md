# Gmail no RealTalent CRM — configuração do administrador

Fase 2 do PRD (Canais conectados). Depois desta configuração, **cada vendedor conecta o próprio Gmail** em
**Configurações › Integrações › Seu e-mail** e passa a enviar e-mails pelo CRM. As respostas dos contatos aparecem no
histórico de cada contato.

O que o CRM faz com a conta de cada pessoa:

- **Envia** e-mails pelo endereço dela (a mensagem fica também na pasta Enviados do Gmail).
- **Lê só as conversas com contatos que já estão no CRM.** O resto da caixa de entrada não é baixado nem guardado.
  A leitura acontece a cada 5 minutos.
- Guarda os tokens criptografados no banco. A pessoa pode desconectar no CRM ou em
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

Esta configuração é feita **uma vez**, por quem administra o CRM.

## 1. Criar o app no Google Cloud

1. Em [console.cloud.google.com](https://console.cloud.google.com), crie um projeto (ex.: `RealTalent CRM`).
2. Em **APIs e serviços › Biblioteca**, ative a **Gmail API** e a **Google Calendar API**.
3. Em **Google Auth Platform › Branding** (tela de consentimento OAuth):
   - Tipo de usuário: **Externo**. Se todos usam Google Workspace do mesmo domínio, escolha **Interno**: assim não há
     limite de usuários de teste nem verificação.
   - Nome do app: `RealTalent CRM`, e-mail de suporte e logo.
4. Em **Data Access** (escopos), adicione:
   - `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/calendar.events` (usado pela agenda, próxima etapa da Fase 2)
5. Em **Audience › Usuários de teste**, adicione o Gmail de cada vendedor (até 100). Enquanto o app estiver em modo de
   teste, só esses endereços conseguem conectar.
6. Em **Clients › Criar cliente**: tipo **Aplicativo da Web**, com este **URI de redirecionamento autorizado**:

   ```
   https://iwnopediexyvyjcepact.supabase.co/functions/v1/integration-oauth-callback
   ```

   Guarde o **Client ID** e o **Client secret**.

## 2. Cadastrar os segredos no Supabase

Em **Supabase › Edge Functions › Secrets** do projeto `CRM-RealTalent` (os internos já foram cadastrados em 20/11/2026; faltam só as duas chaves do Google):

| Nome | Valor |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID do passo 1.6 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Client secret do passo 1.6 |
| `APP_PUBLIC_URL` | Endereço público do CRM, sem barra no final (para onde a pessoa volta depois do Google) |
| `INTEGRATION_TOKEN_ENCRYPTION_KEY` | Texto aleatório com 32 ou mais caracteres. **Nunca troque depois**: os tokens salvos deixam de abrir |
| `INTEGRATION_WORKER_SECRET` | Texto aleatório com 32 ou mais caracteres |
| `COMMUNICATION_WORKER_SECRET` | Outro texto aleatório com 32 ou mais caracteres |
| `GOOGLE_GMAIL_PUBSUB_TOPIC` | Opcional. Só para receber e-mails em tempo real; sem ele, a leitura é a cada 5 minutos |

Para gerar um texto aleatório: `openssl rand -hex 32`.

## 3. Publicar no Supabase

1. Aplicar a migration `supabase/migrations/202611200001_v101_gmail_personal_accounts.sql`.
2. Publicar as funções `integration-oauth-start`, `integration-oauth-callback`, `integration-account-revoke`,
   `integration-account-test`, `integration-google-worker`, `communication-dispatch-worker`,
   `official-communication-send` e `gmail-pubsub-webhook`.
3. Rodar `supabase/cron/CONFIGURAR-GMAIL.sql` no SQL Editor, com os mesmos valores de `INTEGRATION_WORKER_SECRET`
   e `COMMUNICATION_WORKER_SECRET`. A última consulta do script deve responder sem `skipped`.

## 4. Testar com uma conta real

1. Entre no CRM com um usuário cujo Gmail está na lista de usuários de teste.
2. **Configurações › Integrações › Seu e-mail › Conectar Gmail**. Na tela do Google, deixe marcadas as opções de ler e
   enviar e-mails.
3. De volta ao CRM, a mensagem "Gmail conectado" aparece e o cartão mostra a conta.
4. Abra um contato com e-mail cadastrado › **E-mails › Escrever e-mail** › Enviar. Em até um minuto o status muda de
   "Na fila" para "Enviado", e a mensagem aparece na pasta Enviados do Gmail.
5. Responda esse e-mail pela conta do contato. Em até 5 minutos a resposta aparece no histórico do contato.

Esse é o portão da Fase 2 para o e-mail: uma conta real funcionando de ponta a ponta.

## Limites do modo de teste e caminho para produção

- **Usuários de teste:** no máximo 100, cadastrados à mão no passo 1.5.
- **Reconexão semanal:** em modo de teste, o Google invalida a autorização depois de 7 dias. O cartão "Seu e-mail"
  passa a mostrar "Precisa de atenção" e a pessoa clica em **Conectar de novo**.
- **Verificação do Google:** para sair do modo de teste, o app precisa ser verificado. `gmail.send` e
  `calendar.events` são escopos sensíveis (verificação simples). `gmail.readonly` é um escopo **restrito**: exige
  também uma avaliação de segurança anual feita por um laboratório credenciado (CASA), que tem custo.
- **Domínio:** a verificação exige que o URI de redirecionamento esteja num domínio da empresa. Antes de pedir a
  verificação, publique o callback num domínio próprio (domínio personalizado no Supabase ou um redirecionamento no
  domínio do CRM).
- **Alternativa sem avaliação de segurança:** tirar `gmail.readonly` e manter só o envio. O CRM continua enviando e
  registrando os e-mails enviados por ele, mas deixa de trazer as respostas automaticamente.
- **Google Workspace:** se todos os vendedores usam o mesmo domínio do Workspace, o app **Interno** dispensa a
  verificação e não tem o limite de 7 dias.
