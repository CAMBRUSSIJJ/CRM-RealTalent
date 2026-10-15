# RealTalent CRM V101.8.4-H3 — OAuth Runtime & Test Contract Fix

Hotfix sobre a V101.8.4-H2.

## Correções

- `beginGatewayOAuth()` não acessa mais `window.location.href` diretamente. O retorno OAuth usa a URL atual do navegador quando disponível e `http://127.0.0.1:4188/` como fallback seguro em SSR/Vitest/Node.
- O contrato legado de `integration-framework.test.ts` foi atualizado: a versão local não cria mais conta `demo`; ela delega o OAuth ao Communications Gateway real.
- O teste mocka o gateway durante `npm test`, porque o `release:verify` roda Vitest antes de iniciar os serviços locais.
- Nenhuma mudança no protocolo de Gmail, Outlook, WhatsApp Cloud, Connect, identidade ou dados do CRM.
