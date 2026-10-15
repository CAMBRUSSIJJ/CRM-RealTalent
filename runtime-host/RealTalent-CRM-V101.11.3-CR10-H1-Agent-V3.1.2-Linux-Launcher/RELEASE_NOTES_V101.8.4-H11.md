# RealTalent CRM V101.8.4-H11 — WhatsApp Sync Recovery

Correção consolidada do fluxo observado em uso real após conectar o WhatsApp QR Local.

## Problemas corrigidos

- sessão QR podia aparecer como conectada no CRM enquanto o processo WhatsApp Web estava iniciando/reconectando;
- `Sincronizar` podia falhar a conta inteira se `getChats()` ou a resolução de identidade de uma única mensagem lançasse erro;
- identificadores modernos `@lid` podiam ser exibidos como números telefônicos gigantes (`+1203...`) e impedir vínculo com Contatos;
- mensagens antigas genéricas (`[Mensagem WhatsApp]`) não eram enriquecidas de forma segura quando uma sincronização posterior obtinha conteúdo melhor;
- histórico importado em versões anteriores podia continuar inflando o contador de não lidas;
- grupos entravam na varredura padrão da Central de Comunicação mesmo sem um fluxo de CRM específico para grupos;
- o aviso de falha do QR usava o texto genérico “Histórico oficial indisponível”.

## H11

1. Usa `Client.getContactLidAndPhone()` quando disponível para mapear `@lid` → número telefônico canônico.
2. Aceita como telefone apenas números plausíveis (8–15 dígitos); LIDs longos ficam como thread técnica e nunca como telefone do contato.
3. Sincronização QR aguarda/reconecta a sessão e tenta `getChats()` até 3 vezes antes de falhar.
4. Falhas de um chat/mensagem são isoladas; os demais chats continuam sincronizando.
5. Grupos ficam fora da sincronização padrão (`includeGroups:false`).
6. Sessão WhatsApp Web possui reconexão automática também quando o gateway permanece vivo.
7. `/api/integrations/accounts` reflete `liveState` real da sessão QR (`connected`, `starting`, `qr`, `disconnected`).
8. Sync manual/background aceita conta QR em `attention` para permitir recuperação automática.
9. Merge de eventos prefere conteúdo real a placeholders genéricos.
10. Parser reconhece mídia, localização, contato, enquete, respostas interativas, ligação e reação.
11. Histórico QR importado legado é tratado como lido no CRM quando identificado como history sync.
12. UI diferencia `QR Local conectado` de `QR reconectando` e não mostra LID longo como número.

Preserva integralmente H10 Gateway Resilience, H9 Communications Reliability, H8 History Sync, H7 Chat Workspace, H6 installer, H5 WhatsApp Web QR, H4 QR Local, Contact Identity Sync e Connect One-Tap.
