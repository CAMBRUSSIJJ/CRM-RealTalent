# RealTalent CRM V101.8.2 — Connect Fast Dial & Power Queue

## Objetivo
Reduzir cliques entre CRM e celular depois que o RealTalent Phone já está pareado. Esta release não tenta substituir as restrições do sistema operacional do telefone; ela automatiza o que o CRM e o companion conseguem controlar com segurança.

## Entregas
- Fast Dial por sessão: ao entrar no Modo Foco, a primeira chamada pode ser enviada automaticamente ao RealTalent Phone.
- Power Queue: após `Salvar e próximo`, o CRM pode carregar o próximo lead e enviar a nova chamada ao celular automaticamente.
- Atraso configurável de 0 a 3 segundos antes do auto-dispatch.
- Chamadas rápidas abertas a partir de Contatos/Pipeline/Agenda/Follow-ups herdam Fast Dial quando o RealTalent Connect + Phone está selecionado.
- O payload CRM → Connect → Phone passa a carregar `fastDial`.
- RealTalent Phone ganhou `Modo rápido`, persistido no próprio celular.
- Quando `fastDial=true`, o Phone tenta abrir `tel:` automaticamente; se o navegador/sistema bloquear, o botão manual continua disponível.
- Guard de idempotência impede reabrir o discador repetidamente para o mesmo `callId`.
- Se o Connect ficar offline durante auto-dispatch, a fila pausa no CRM; o fallback para discador local não é disparado silenciosamente.
- Modo Foco mostra indicador `Fast Dial` quando a sessão está automatizada.

## Limites intencionais
- Em iPhone e alguns navegadores móveis, o sistema pode exigir confirmação antes de iniciar a chamada celular.
- O companion web não consegue detectar com precisão o término de uma chamada SIM nativa. O estado final ainda depende de confirmação/retorno do usuário até existir um companion nativo com integração de telefonia do sistema.
- A release não adiciona gravação, transcrição nem PSTN novo.
