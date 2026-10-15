# RealTalent CRM V101.8.4-H4 — GateFix1 Runtime Dependency Policy

Correção de QA para preservar o contrato histórico V100.60.1 depois da inclusão deliberada das dependências do WhatsApp QR Local.

## Problema
O audit `v100_60_1_performance_audit.mjs` exigia igualdade exata com as quatro dependências runtime existentes na V100.60.1. A H4 adicionou, de forma intencional, `@whiskeysockets/baileys` e `qrcode`, fazendo o gate falhar apesar de não existir regressão de performance ou dependência acidental.

## Correção
- Mantidas como obrigatórias as quatro dependências-base da V100.60.1.
- Criada política explícita de dependências runtime aprovadas.
- `@whiskeysockets/baileys` e `qrcode` são aprovadas exclusivamente para o WhatsApp QR Local.
- Qualquer dependência runtime adicional não aprovada continua falhando o gate.
- Novo audit `qa:v101.8.4:h4-gatefix1` incluído no gate completo.

Nenhuma funcionalidade do CRM, Connect, Identity Sync, Communications Gateway ou WhatsApp QR foi alterada por este hotfix.
