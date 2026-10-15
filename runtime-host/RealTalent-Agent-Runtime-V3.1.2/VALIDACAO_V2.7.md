# Validação — RealTalent Agent V2.7

## Resultado
**APROVADA com limitações explicitamente não atestadas.**

## Gates comprovados
| Gate | Resultado |
|---|---:|
| Runtime contract audit | 275/275 PASS |
| Advanced Reasoning self-test | 9/9 PASS |
| V2.7 integration self-test | 8/8 PASS |
| MJS runtime self-tests | 32/32 PASS |
| Reliability Benchmark full | 1000/1000 PASS |
| Known-Failure Regression | PASS |
| CRM Agent V2.7 audit | 5/5 PASS |
| Blue Ocean Agent V2.7 audit | 5/5 PASS |
| Browser QA | PASS |
| Deep Visual QA | PASS |
| Builder sandbox | PASS |
| CRM TypeScript parser | PASS |
| Blue Ocean TypeScript parser | PASS |
| Shell syntax | 84/84 PASS |
| MJS syntax | 516/516 PASS |
| Python compile | 18/18 PASS |

## Comportamentos V2.7 validados
1. tarefas simples permanecem no fast path;
2. tarefas profundas recebem protocolo de raciocínio estruturado;
3. Planner define critérios de sucesso, hipóteses e checkpoints sem expor cadeia de pensamento;
4. Critic detecta lacuna material;
5. Finalizer pode solicitar exatamente um replanejamento;
6. uma segunda verificação encerra o ciclo, impedindo loop infinito;
7. Tool-First, grounding, RAG, Vision e Learning continuam preservados;
8. o regression dataset contém caso V2.7 que exige `reasoningEnabled=true`, tarefa `compare` e `maxReplans=1`.

## Browser Chat E2E
**UNVERIFIED**. A execução foi tentada e falhou antes do carregamento da aplicação:

`Page.goto: net::ERR_BLOCKED_BY_ADMINISTRATOR at http://localhost:<porta>/chat`

Browser QA e Deep Visual QA passam porque usam um caminho de teste compatível; o E2E do chat é bloqueado especificamente pela política administrativa de navegação do Chromium instalado neste ambiente.

## Build completo dos produtos
Os pacotes de CRM e Blue Ocean não incluem `node_modules`. Por isso não se declara `vite build`, Vitest ou typecheck semântico completo como PASS. Foi executado `tsc --noEmit --noCheck` nos dois produtos com resultado PASS, além dos audits de integração.
