# RealTalent Agent V0.5 — Builder + QA Agent

A V0.5 acrescenta manutenção controlada de código à arquitetura da V0.3.

## Adicionado

- `builder_agent.py` compartilhado pelo CRM e Blue Ocean.
- Endpoint `/builder/patch` com Structured Outputs.
- Seleção local de arquivos candidatos somente dentro de `src/`.
- Patches por substituições literais `old → new` com ocorrência única.
- Máximo de 5 arquivos, 8 substituições por arquivo e 2 tentativas por execução.
- Backup transacional por tentativa.
- Rollback automático em falha de gate.
- Segunda tentativa limitada alimentada pela saída real do gate/Browser QA.
- Gates fixos por produto, nunca escolhidos pelo modelo.
- Browser QA automático após gates aprovados.
- Rollback em `Browser QA: FAIL`.
- Scripts `builder-crm.sh` e `builder-blue-ocean.sh`.
- Script `preparar-builder.sh` para instalação explícita de dependências.

## Segurança

O Builder V0.5 não possui terminal livre. São bloqueados:

- arquivos fora de `src/`;
- `.env`, secrets e credenciais;
- Supabase, RLS e migrations;
- Auth, permissões e segurança;
- `package.json` e lockfiles;
- runtime/ops/infraestrutura;
- criação e exclusão de arquivos;
- `child_process`, exec/spawn, eval, sudo e comandos destrutivos.

Todo código enviado ao modelo é tratado como dado não confiável.

## Fluxo de verdade

1. Modelo propõe patch.
2. Política local valida.
3. Usuário confirma.
4. Executor cria backup e aplica.
5. Gates reais são executados.
6. Se um gate falha, rollback automático.
7. Se gates passam, Browser QA verifica a interface.
8. `FAIL` visual restaura o patch; `PASS` encerra com evidência.

## Compatibilidade preservada

- CRM: 6 tools comerciais.
- Blue Ocean: 7 tools do Service Graph.
- Browser QA em sessão Chromium compartilhada.
- Confirmação obrigatória para mutações do produto.
