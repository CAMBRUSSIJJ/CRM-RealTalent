# Integração da Extensão — V100.15

A extensão pode entregar registros ao CRM local por uma das formas abaixo.

## Mensagem em tempo real

A página do CRM escuta mensagens com o tipo `REALTALENT_PROSPECTS` e um array em `payload`.

Campos aceitos: `name/nome`, `company/empresa/nome_fantasia`, `phone/telefone/whatsapp`, `email`, `city/cidade`, `address/endereco`, `cnpj`, `instagram/perfil`, `website/site`, `bookingUrl/agendamento`, `systemName/sistema`, `description/descricao`, `followers/seguidores`, `source/origem` e `notes/observacoes`.

## Caixa de entrada local

Chave: `realtalent-extension-inbox-v1`.

O valor deve ser um array JSON ou um objeto contendo `payload`, `leads` ou `results`. Depois da sincronização, a caixa é limpa para impedir reenvio.

## Evolução para produção

A migration V100.15 cria tabelas protegidas por RLS para lotes, prospects e eventos. Em uma implantação hospedada, a extensão deve autenticar o usuário e usar um endpoint Supabase/Edge Function para gravar os lotes com segurança.
