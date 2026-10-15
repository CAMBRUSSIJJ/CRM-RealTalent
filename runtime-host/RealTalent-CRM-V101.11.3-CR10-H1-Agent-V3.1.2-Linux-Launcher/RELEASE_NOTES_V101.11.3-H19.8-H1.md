# V101.11.3-H19.8-H1 — WhatsApp Runtime Recovery

Base: **V101.11.3-H19.8 — WhatsApp Continuous Chat & Settings Control Center**.

## Adicionado

- Runtime Control local para diagnóstico e recuperação autenticada do Communications Gateway.
- Endpoint local de reinício de Communications usado pelas Configurações do WhatsApp.
- Watchdog no launcher para detectar indisponibilidade persistente do Gateway e executar recuperação automática.
- Watchdog no supervisor para reiniciar o processo do Gateway quando o healthcheck falhar repetidamente.
- Estado operacional de Gateway e Supervisor em **Configurações > WhatsApp > Diagnóstico**.
- Ação **Reiniciar serviço** no diagnóstico.
- Recuperação do Gateway antes da geração de QR quando o serviço estiver indisponível.

## Melhorado

- O launcher não abandona mais o supervisor do Communications quando a primeira readiness falha; o CRM pode abrir em modo degradado enquanto o watchdog continua tentando recuperar o serviço.
- A inicialização do Gateway agora passa por healthcheck de versão antes de ser considerada pronta.
- A tela de configurações distingue canal desconectado de serviço local indisponível.
- Erros de rede do navegador não são exibidos como `NetworkError` para o usuário.

## Preservado

- H19.7 WhatsApp Pure Chat.
- H19.8 WhatsApp Control Center e sua organização visual.
- QR local/assistido, Cloud API, templates, equipe e diagnóstico.
- Autenticação por runtime token e comportamento fail-closed das APIs locais.
- 54 migrations sem alteração.

## Removido

- Nenhuma capacidade de negócio foi removida.
- O pacote final não inclui `node_modules`, `dist` legado nem sessão local do WhatsApp.

## Limitações verificadas

- `npm ci` não pôde ser concluído neste ambiente: o acesso ao `registry.npmjs.org` não respondeu dentro da janela de teste. Por isso `typecheck`, Vitest e Vite build oficial não são classificados como PASS nesta execução.
- O build independente transpila 299 módulos, porém produz o HTML legado; o auditor o recusou e o `dist` foi removido do release.
