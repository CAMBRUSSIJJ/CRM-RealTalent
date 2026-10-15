# RealTalent CRM V100.85.0 — WhatsApp 2.0

## Objetivo

Padronizar o WhatsApp como canal comercial dentro do CRM sem confundir o modo assistido (deep link) com a integração oficial WhatsApp Business Platform.

## Entregas

- nova área **Configurações → WhatsApp**;
- dois modos operacionais: **Assistido** e **Business oficial**;
- código do país configurável;
- registro opcional de atividade ao abrir/enfileirar uma conversa;
- templates internos editáveis por workspace/dispositivo;
- variáveis `{{name}}`, `{{company}}`, `{{owner}}`, `{{stage}}`, `{{value}}`, `{{proposal}}`, `{{date}}` e `{{time}}`;
- compositor unificado em Leads, Contatos/Account 360, Pipeline, Follow-ups, Propostas e Meu Dia;
- vínculo da atividade ao `contactId` quando a ação parte de um stakeholder específico;
- respeito a `doNotContact` do lead e do contato;
- seleção/teste/revogação de conta WhatsApp Business já suportada pela camada de integrações;
- envio oficial usa a Edge Function `official-communication-send` e somente contas live conectadas;
- templates internos do CRM são explicitamente diferenciados de templates oficiais aprovados pela Meta.

## Compatibilidade

- nenhuma migration nova;
- `BACKUP_SCHEMA_VERSION` permanece `100.54`;
- infraestrutura oficial Meta/WhatsApp Cloud existente foi reaproveitada sem remover o modo assistido.

## Limites conhecidos

- modo assistido não confirma entrega, leitura ou resposta;
- modo oficial exige Supabase, app Meta/WABA, número, credenciais e webhooks configurados;
- regras da janela de atendimento e templates oficiais continuam sob as políticas da plataforma Meta.
