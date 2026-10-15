# RealTalent CRM V101.8.4 — Comunicações Oficiais

Esta versão fecha o uso de **Gmail/Outlook/WhatsApp Cloud dentro da Central de Comunicação**. O CRM contém o código de envio, recepção, OAuth, renovação de token, sincronização, webhooks, status e timeline. Para operar contra contas reais, ainda é obrigatório criar os aplicativos OAuth nos provedores e fornecer suas próprias credenciais.

## O que funciona na aplicação

- Composer de **E-mail** e **WhatsApp** dentro da conversa da Central de Comunicação.
- Seleção da conta conectada.
- Envio oficial por Gmail API, Microsoft Graph e WhatsApp Cloud API.
- Dispatch imediato após o clique quando o worker está configurado; `pg_cron` continua como fallback.
- Recepção/sincronização de Gmail e Outlook e ingestão de mensagens/status do WhatsApp via webhook.
- Vínculo de mensagens de entrada com `Lead` e `ContactRecord` por e-mail/telefone.
- Status `queued`, `sent`, `delivered`, `read`, `received`, `failed` e `cancelled` na timeline.
- OAuth com PKCE e cofre de tokens no backend.
- Descoberta automática de Business Manager → WABA → número/`phone_number_id` durante a conexão do WhatsApp.
- Assinatura do app no WABA quando a conta Meta permitir.

## 1. Pré-requisitos

- Projeto Supabase com CLI configurada.
- Domínio/URL pública do CRM para callbacks OAuth.
- Para Gmail: projeto Google Cloud, Gmail API habilitada e OAuth Web Client.
- Para Outlook: App Registration Microsoft Entra com Microsoft Graph.
- Para WhatsApp: Meta App com produto WhatsApp Business Platform e número disponível no WABA.

## 2. Configuração automatizada do backend

No diretório do CRM:

```bash
chmod +x configure-communications.sh
./configure-communications.sh
```

O script salva as credenciais como **Supabase Secrets**, aplica as migrations e publica as Edge Functions. Nenhum Client Secret deve ser colocado no frontend ou em `.env` do Vite.

## 3. Redirect URI OAuth

Cadastre nos provedores exatamente o callback da Edge Function:

```text
https://SEU-PROJECT-REF.supabase.co/functions/v1/integration-oauth-callback
```

No Google, habilite os escopos Gmail necessários ao envio/leitura e publique/configure a tela de consentimento conforme o tipo de aplicação. No Microsoft Entra, use permissões delegadas `Mail.Send`, `Mail.Read`, `offline_access`, `openid`, `profile` e `email` (além das permissões de calendário se a integração de agenda continuar habilitada).

## 4. WhatsApp webhook

No painel Meta configure:

```text
Callback URL:
https://SEU-PROJECT-REF.supabase.co/functions/v1/whatsapp-webhook
```

Use o mesmo valor informado ao script como `WHATSAPP_WEBHOOK_VERIFY_TOKEN` e assine os eventos de mensagens. A função valida também `X-Hub-Signature-256` usando `META_APP_SECRET`.

Durante o OAuth, a V101.8.4 procura automaticamente Business Managers, WABAs e números disponíveis e grava `waba_id` e `phone_number_id` na conta conectada. Se houver vários números, a primeira opção retornada fica ativa inicialmente e as opções descobertas permanecem em `metadata.whatsapp_candidates`.

## 5. Sincronização e workers

Execute no SQL Editor do Supabase, depois de definir as settings exigidas pelo arquivo:

```text
supabase/cron/CONFIGURAR-COMMUNICATION-RUNNERS.sql
```

Os runners cuidam de mail pull, renovação de subscriptions, renovação de tokens, health checks e fila de saída. O botão **Sincronizar** da Central também chama `communication-sync-now` para disparar uma sincronização sob demanda.

## 6. Uso no CRM

1. Abra **Configurações → Integrações**.
2. Conecte Google e/ou Microsoft.
3. Abra **Configurações → WhatsApp** e conecte WhatsApp Business.
4. Execute **Testar** em cada conta.
5. Abra **Comunicação**.
6. Selecione um contato.
7. No rodapé da conversa, escolha **E-mail** ou **WhatsApp**, a conta e envie sem sair do CRM.
8. Use **Sincronizar** para forçar atualização de Gmail/Outlook; WhatsApp recebido chega pelo webhook.

## 7. Limites externos

O código do CRM não substitui aprovação/verificação dos provedores. Google pode exigir verificação adicional para apps que usam escopos sensíveis/restritos. WhatsApp segue as regras de janela de atendimento e templates oficiais da Meta; mensagens fora das condições permitidas podem exigir template aprovado. Microsoft/Google também podem impor políticas do tenant/organização.
