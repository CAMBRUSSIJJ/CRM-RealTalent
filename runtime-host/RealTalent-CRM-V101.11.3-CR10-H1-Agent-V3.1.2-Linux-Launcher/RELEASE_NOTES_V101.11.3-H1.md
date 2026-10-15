# V101.11.3-H1 — Communications Gateway Recovery

Hotfix de runtime sobre a V101.11.3. Não altera Pipeline, dados, schema ou migrations.

## Adicionado
- preflight da porta 3002 antes de iniciar o Communications Gateway;
- descoberta de processos `realtalent-communications-supervisor.mjs` e `realtalent-communications-gateway.mjs` no Linux por `/proc` + `cwd`;
- encerramento automático apenas de processos da release atual ou da release RealTalent comprovadamente dona da porta 3002;
- diagnóstico de porta/PID e tail automático de `.realtalent-communications.log`;
- preservação explícita de outros runtimes RealTalent que não estejam no escopo da porta 3002;
- carregamento lazy de `qrcode`, impedindo que o renderizador QR derrube o Gateway antes do `/health`;
- smoke executável `runtime:communications-recovery`;
- `npm run doctor` com diagnóstico não destrutivo de Communications.

## Corrigido
- um gateway/supervisor órfão de release anterior não deve mais provocar loop `EADDRINUSE` e bloquear a inicialização;
- gateway saudável já ativo com o token atual pode ser reutilizado;
- se a porta 3002 pertencer a processo desconhecido, o launcher não mata o processo.

## Comportamento degradado
Se o Communications Gateway continuar indisponível, o CRM abre normalmente. Apenas Gmail/Outlook/WhatsApp local ficam temporariamente indisponíveis e o terminal exibe a causa observável.

## Preservado
- V101.11.3 Actionable Pipeline Experience;
- Teams & Tasks;
- Login Gate e animações;
- RealTalent Connect;
- Prospecting Agent;
- 50 migrations existentes.
