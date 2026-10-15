# Validação — RealTalent Agent V2.6

Data da validação: 2026-10-14

## Resultado
A V2.6 foi validada como evolução do núcleo de inteligência/aprendizado, mantendo as capacidades das versões V2.2–V2.5 e sem adicionar novas mutações de negócio nos produtos.

| Gate | Resultado |
|---|---:|
| Runtime contract audit | 267/267 PASS |
| Learning & Evaluation core | 11/11 PASS |
| V2.6 integration | 9/9 PASS |
| Broad self-test files | 29/29 PASS |
| Reliability Benchmark FULL | 1000/1000 (100%) PASS |
| Known-Failure Regression | PASS |
| V2.5 multimodal regression | 8/8 PASS |
| V2.4 Memory & Knowledge regression | 10/10 PASS |
| V2.3 Intelligence Core regression | 11/11 PASS |
| V2.2 Grounded App Intelligence | 25/25 PASS |
| Chat Experience | 10/10 PASS |
| CRM V2.6 learning integration | 5/5 PASS |
| Blue Ocean V2.6 learning integration | 5/5 PASS |
| CRM TypeScript parser (`tsc --noCheck`) | PASS |
| Blue Ocean TypeScript parser (`tsc --noCheck`) | PASS |
| Shell syntax | 82/82 PASS |
| Runtime MJS syntax | 53/53 PASS |
| Runtime Python compile | PASS |

## Browser Conversation E2E
**UNVERIFIED neste ambiente.**

A execução foi tentada com Playwright, mas o Chromium administrado bloqueou a navegação antes de a página do Agent carregar:

```text
Page.goto: net::ERR_BLOCKED_BY_ADMINISTRATOR
http://localhost:<porta>/chat
```

Isso não é registrado como PASS nem como falha funcional da aplicação. O script permanece no pacote para execução em um Chromium sem essa política.

## Produtos — build completo
Os ZIPs de fonte não incluem `node_modules`. Nesta rodada foram executados parser TypeScript e audits de integração. `npm run typecheck`, Vitest e Vite build completos dos produtos **não são declarados PASS** nesta validação porque as dependências dos produtos não foram instaladas neste ambiente.

## Reliability + Learning Gate
O benchmark agregado fechou 1000/1000, mas a V2.6 não aceita esse score sozinho. O gate também exige replay das falhas conhecidas. Nesta validação:

```text
Reliability Benchmark: 1000/1000 PASS
Known-Failure Regression V2.6: PASS
```

## Limpeza da distribuição
- `node_modules`: não incluído.
- estado local de Learning/Failure Memory: não incluído.
- pixels/data URLs de testes: não incluídos.
- arquivos de memória/regressão são criados no diretório de estado do usuário em runtime.
