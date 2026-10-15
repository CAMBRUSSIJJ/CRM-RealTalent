# RealTalent CRM V101.8.4-H13 — WhatsApp Real History Bridge

## Problema corrigido

A sessão QR podia ficar autenticada/READY e ainda assim não trazer os chats reais porque a H12 dependia de `whatsapp-web.js#getChats()`. Com versões recentes do WhatsApp Web, essa API pode lançar erros de execução Puppeteer (`r: r`) ou retornar lista vazia mesmo com a sessão conectada.

## Correção

- leitura primária de chats pela store já materializada do próprio WhatsApp Web (`WAWebCollections.Chat`);
- serialização mínima e defensiva, sem chamar `Chat.serialize()`;
- leitura dos últimos modelos de mensagem já presentes em `chat.msgs`;
- suporte ao identificador moderno `$1` além de `_serialized`;
- `client.getChats()` permanece apenas como fallback;
- atraso inicial de 5s antes da primeira importação para permitir materialização da store;
- `historyEngine` registrado no diagnóstico (`wa-store-direct` ou `wwebjs-getChats`).

O QR Local continua não oficial/experimental e depende do que o WhatsApp Web disponibiliza ao dispositivo vinculado.
