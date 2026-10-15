# RealTalent CRM V101.9.9-H1 — Realtime Type Hotfix

Hotfix sobre a V101.9.9 para corrigir o contrato de tipo entre o Global Event Bus e o painel de WhatsApp.

## Correção

`RealtimeTransportState` possui quatro estados válidos: `connecting`, `live`, `offline` e `disabled`. O `WhatsAppChatPanel` ainda aceitava apenas o contrato antigo `CommunicationsRealtimeState` (`connecting | live | offline`), causando TS2322 no typecheck quando `communications-page.tsx` passava o estado global.

O painel agora consome `RealtimeTransportState` diretamente e apresenta `disabled` como **Tempo real desativado**.

## Prevenção de regressão

Foi adicionado `qa:v101.9.9:h1` ao `qa:architecture`, verificando o alinhamento de tipos entre o Event Bus e a Central de Comunicação.

Nenhuma migration SQL nova. Nenhuma mudança de dados, layout ou fluxo comercial.
