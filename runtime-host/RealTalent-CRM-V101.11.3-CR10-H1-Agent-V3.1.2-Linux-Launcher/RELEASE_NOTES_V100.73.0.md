# V100.73.0 — RealTalent Voice & Dialer

## Objetivo
Transformar o Calling de um fluxo que apenas abre o discador em uma camada de orquestração de voz, sem fingir recursos telefônicos que ainda não estejam conectados.

## Entregue
- Voice Provider Layer com `RealTalent Connect`, `Discador do dispositivo`, `Browser Voice` e `SIP`.
- Contrato `RealTalent Voice API v1` para capabilities, criação de chamadas, comandos e eventos.
- Probe do RealTalent Connect em `http://localhost:3001` por padrão, configurável por workspace.
- Fallback externo preservado via `tel:`.
- Device Manager com bridge Connect e dispositivos de áudio locais detectáveis.
- Caller ID Manager com identidades de saída por provedor.
- Call State Engine: ready, connecting, ringing, connected, held, ended e failed.
- Controles condicionais: mute, hold, DTMF, transfer e voicemail drop só aparecem habilitados quando o provedor declara a capability.
- Inbound Call UI global baseada em eventos versionados.
- Eventos via CustomEvent/postMessage com validação de schema e restrição de origem local/same-origin.
- Contexto do canal de voz incluído no registro comercial da chamada.

## Segurança e honestidade operacional
Browser Voice e SIP permanecem `não configurados` até existir um provedor real. O CRM não simula controle de áudio/telefonia. O RealTalent Connect só é tratado como disponível quando responde ao contrato de capabilities V1.
