# RealTalent CRM V100.98.2 — RealTalent Calling 3.0

## Objetivo
Reduzir a carga cognitiva durante ligações, vincular a sessão ao Playbook antes da discagem e transformar o RealTalent Connect em um bridge local operacional, sem declarar recursos que o provider não implementa.

## RealTalent Connect
- Serviço local `scripts/realtalent-connect-server.mjs` em `127.0.0.1:3001`.
- Contrato RealTalent Voice API v1 com health, capabilities, criação de chamada, consulta de estado e hangup.
- Provider inicial real: **Twilio Agent Bridge**.
- Fluxo: o Connect chama o telefone do vendedor; ao atender, a Twilio inicia a perna do lead.
- Consulta de estado diferencia **perna do agente** e **perna do lead** usando o `ParentCallSid`, reduzindo falsos estados de “conectado”.
- Telefones são normalizados para E.164; o código de país padrão é configurável e inicia em `55`.
- Credenciais permanecem em `.env.local`, nunca no frontend.
- Sem credenciais PSTN o serviço continua saudável, mas declara `not_configured`; o fallback do discador do dispositivo continua disponível.

## Segurança local
- Connect escuta em localhost por padrão.
- CORS não usa wildcard: o navegador precisa vir da origem local autorizada do CRM.
- Requisições POST exigem `application/json`.
- Configurador não passa o Auth Token como argumento de linha de comando para o processo Python.
- `.env.local` recebe permissão `600` quando possível.

## Preparação da sessão
- Playbook da sessão é resolvido antes de abrir o Modo Foco.
- Fila, objetivo, Playbook, telefonia e comportamento da sessão ficam na preparação.
- Se nenhum Playbook ativo existir, o roteiro padrão RealTalent continua disponível.

## Modo Foco simplificado
A experiência foi dividida em quatro estados:
1. **Antes de ligar** — objetivo, Playbook, abertura e contexto essencial.
2. **Conectando** — estado da telefonia sem ruído adicional.
3. **Em conversa** — fala sugerida, pergunta, coaching curto e respostas do Playbook.
4. **Depois da ligação** — resultado, notas e próxima ação.

O Assistant funciona como copiloto compacto. Objeções, contexto adicional e ferramentas avançadas permanecem recolhidos por padrão.

## Linux
- CRM: `http://127.0.0.1:4183`
- RealTalent Connect: `http://127.0.0.1:3001`
- Configuração de telefonia real: `./configure-realtalent-connect.sh`

## Limite conhecido
O Twilio Agent Bridge usa o telefone do vendedor para o áudio. Esta release não anuncia mute, espera, teclado DTMF, transferência, voicemail drop, inbound ou WebRTC dentro do navegador como capacidades desse provider. A ativação futura desses controles exige um adapter que realmente os implemente.
