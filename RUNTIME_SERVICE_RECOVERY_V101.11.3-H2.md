# V101.11.3-H2 — Runtime Service Recovery

Hotfix de runtime sobre a V101.11.3-H1. Não altera Pipeline, dados, schema ou migrations.

## Adicionado
- preflight e recovery seguro do RealTalent Connect na porta 3001;
- inventário de processos `realtalent-connect-server.mjs` por PID/cwd;
- diagnóstico automático de porta, processo e `.realtalent-connect.log`;
- `npm run doctor` com diagnóstico Connect não destrutivo;
- smoke executável `runtime:connect-recovery`;
- modo degradado para Connect e Communications.

## Corrigido
- Connect órfão de uma release anterior não bloqueia mais a inicialização quando for comprovadamente dono da porta 3001;
- porta 3001 ocupada por processo desconhecido não é encerrada; o CRM abre sem Calling/One-Tap e mostra a causa;
- Connect deixa de encerrar todo o launcher ao falhar no health check.

## Preservado
- V101.11.3 Actionable Pipeline Experience;
- Communications Gateway Recovery H1;
- Teams & Tasks; Login; Garimpo; 50 migrations.

## Política de segurança
A recuperação automática só atua no processo da release atual ou em processo RealTalent de outra release comprovadamente associado à porta alvo. Outros processos são preservados.


## Security/CORS fix confirmado antes do fechamento
- rotas do Connect agora rejeitam `Origin` externo com `403` antes de avaliar token de runtime;
- o Phone API aceita as origens CRM já presentes em `REALTALENT_CONNECT_ALLOWED_ORIGINS`/defaults, além da própria origem do Connect;
- o header `Access-Control-Allow-Origin` continua sendo emitido somente para origens explicitamente allowlisted;
- os smokes históricos de Connect resilience, MVP e Setup voltaram a passar junto com One-Tap.
