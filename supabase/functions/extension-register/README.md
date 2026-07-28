# extension-register

Registra ou atualiza uma instalação autenticada da extensão RealTalent e devolve a configuração remota da organização.

## Ações

- `register`: registra navegador, versão, capacidades e instalação.
- `heartbeat`: atualiza último sinal, fila local e erro recente.

A função usa o token do usuário autenticado e respeita as políticas por organização. Nenhum token administrativo é enviado à extensão.
