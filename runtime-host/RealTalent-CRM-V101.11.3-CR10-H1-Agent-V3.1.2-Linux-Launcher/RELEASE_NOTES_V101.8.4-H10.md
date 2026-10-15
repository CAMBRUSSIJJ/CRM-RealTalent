# RealTalent CRM V101.8.4-H10 — Communications Gateway Resilience

## Objetivo

Impedir o cenário em que o CRM permanece aberto em `127.0.0.1:4188`, mas o gateway local de comunicações na porta `3002` encerra silenciosamente e a interface passa a exibir “Gateway local de comunicações indisponível”.

## Correções

- novo `realtalent-communications-supervisor.mjs` reinicia o gateway se o processo encerrar inesperadamente;
- `start-linux.sh` aguarda o health da versão H10 por até 15 segundos antes de servir o CRM;
- sessão/configuração da H9 é migrada automaticamente para H10;
- gateway registra `unhandledRejection` e `uncaughtException` antes de reiniciar pelo supervisor;
- sincronização de background não deixa Promises rejeitadas escaparem do timer;
- shutdown por SIGTERM encerra sessões WhatsApp Web/Chromium antes do processo;
- listeners `message`, `message_create`, `message_ack` e `ready` do QR browser foram protegidos contra exceções assíncronas;
- cliente HTTP do CRM repete GETs transitórios até três vezes durante reinício rápido do gateway;
- mensagem de erro deixa de afirmar incorretamente que o CRM não foi iniciado por `./start-linux.sh`.

## Preservado

- WhatsApp QR Local e sessão Chromium/LocalAuth;
- importação de histórico H8;
- chat do WhatsApp H7;
- persistência/deduplicação H9;
- Gmail, Outlook e WhatsApp Cloud;
- Contact Identity Sync e RealTalent Connect One-Tap.
