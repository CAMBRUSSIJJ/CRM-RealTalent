# RealTalent CRM V101.8.0 — RealTalent Connect MVP

Esta release transforma o RealTalent Connect em um fluxo funcional de chamadas assistidas entre o CRM no Linux e um celular na mesma rede local.

## Entregas
- Pairing por workspace com código temporário de 6 dígitos e QR Code gerado localmente, sem serviço externo.
- Código de pairing rotaciona após uso e pode ser regenerado pelo CRM.
- RealTalent Phone companion móvel com contexto de contato, empresa, objetivo e playbook.
- Envio de ligação CRM → Connect → celular e abertura do discador nativo via `tel:`.
- Sincronização de estados `connecting/ringing/connected/failed/ended` por WebSocket, com polling como fallback.
- Device Manager com estado online/offline, seleção do celular padrão e revogação.
- Atualização automática da presença do celular enquanto a configuração está aberta, sem exigir recarregar a tela após o pareamento.
- Tokens locais persistidos com permissão 0600 e vínculo opcional ao workspace.
- Configuração simplificada em quatro passos; providers e Caller ID permanecem em Configuração avançada.
- Twilio Agent Bridge continua disponível como opção PSTN, mas não é necessário para o RealTalent Phone.

## Limites deliberados do MVP
O companion não grava nem controla áudio de uma chamada SIM nativa. iPhone/Android exigem ação do usuário para iniciar a chamada pelo discador. Gravação, transcrição e coaching em áudio ficam para uma etapa posterior, depois de estabilizar o transporte e o registro comercial.
