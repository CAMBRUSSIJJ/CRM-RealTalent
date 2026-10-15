# Validação — RealTalent Agent V2.0

## Resultado principal
- Runtime contracts: 230/230 PASS
- Reliability & Evaluation self-test: 12/12 PASS
- Grounding & Hallucination Guard: 9/9 PASS
- Reliability Benchmark quick: 1000/1000 PASS
- Reliability Benchmark full: 1000/1000 PASS
- Baseline/release gate: PASS com baseline 100% e delta 0
- Endpoint assíncrono `/evaluation/run`: PASS

## CRM
- Agent V2.0 Reliability & Evaluation: 22/22 PASS
- V1.11 regression: 20/20 PASS
- source syntax audit: 425 arquivos PASS
- integration contracts: 393 arquivos PASS

## Blue Ocean
- Agent V2.0 Reliability & Evaluation: 17/17 PASS
- V1.11 regression: 15/15 PASS
- `syntax:check`: PASS

## Gates completos dos produtos
Os dois launchers não possuem `node_modules`.

CRM:
- `npm run typecheck`: BLOCKED/FAIL por dependências/tipos ausentes, começando por `Cannot find module 'react'`;
- `npm test -- --run`: BLOCKED porque `vitest` não está instalado;
- `npm run build`: BLOCKED porque `vite` não está instalado.

Blue Ocean:
- `npm run typecheck`: BLOCKED/FAIL por React/tipos ausentes e contratos TS do pacote sem dependências instaladas;
- `npm run build`: BLOCKED antes da compilação completa pelas mesmas ausências/erros de tipagem.

Esses gates não são declarados como PASS.

## Decisão
RELIABILITY & EVALUATION PLATFORM: PASS para os contratos e self-tests empacotados.
FULL PRODUCT BUILD/TYPECHECK/TEST: NÃO ATESTADO nesta embalagem sem dependências instaladas.
