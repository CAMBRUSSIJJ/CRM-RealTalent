# RealTalent CRM V101.8.4-H12 — WhatsApp Realtime

## Objetivo

Tornar a Central de Comunicação reativa aos eventos do WhatsApp sem depender de sincronização manual.

## Arquitetura

WhatsApp Web → Communications Gateway → SSE → Central de Comunicação.

O gateway publica mudanças de store imediatamente após mensagens recebidas, enviadas, ACKs, leitura, webhooks, sync e mudanças de conta. O frontend mantém um EventSource por workspace e faz refresh silencioso com debounce curto.

## Fallback

Há refresh silencioso a cada 60 segundos caso SSE esteja temporariamente indisponível. O EventSource reconecta automaticamente após reinício do gateway.
