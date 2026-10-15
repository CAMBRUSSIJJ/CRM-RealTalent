# Validação — RealTalent Agent V2.4

Data da validação: 2026-10-14

## Gates executados

| Gate | Resultado |
|---|---:|
| Runtime structural contracts | 250/250 PASS |
| Memory & Knowledge core | 8/8 PASS |
| Gateway V2.4 integration | 10/10 PASS |
| Intelligence Core V2.3 | 10/10 PASS |
| Conversation Intelligence V2.3 | 11/11 PASS |
| Intelligence Orchestration V2.3 | 15/15 PASS |
| V2.3 compatibility | 11/11 PASS |
| V2.2 Grounded App Intelligence | 25/25 PASS |
| Chat Experience V2.4 | 10/10 PASS |
| Local AI | 7/7 PASS |
| CRM Agent V2.4 integration | 5/5 PASS |
| Blue Ocean Agent V2.4 integration | 5/5 PASS |
| Shell syntax | PASS |
| Python compile | PASS |
| Browser Conversation E2E | UNVERIFIED — ambiente bloqueia localhost no Chromium |

## Browser E2E

O teste foi realmente executado. O gateway iniciou, mas a navegação do Chromium falhou antes de carregar `/chat`:

```text
Page.goto: net::ERR_BLOCKED_BY_ADMINISTRATOR at http://localhost:<porta>/chat
```

A política instalada no ambiente contém:

```json
{"URLBlocklist":["*"]}
```

Arquivo observado: `/etc/chromium/policies/managed/000_policy_merge.json`.

Portanto este gate é reportado como **UNVERIFIED**, não como falha do produto e não como PASS.

## O que os testes V2.4 comprovam

- indexação de conhecimento via gateway;
- recuperação RAG;
- escopo por produto;
- memória explícita persistente;
- pesquisa semântica;
- Project Memory com índice semântico;
- política `explicit-only`;
- reset independente de conhecimento e memória;
- fallback local quando Ollama de embeddings não está disponível;
- compatibilidade com Tool-First, App Context e Intelligence Core.

## Gates não atestados como build completo

A integração dos aplicativos foi auditada por contratos específicos V2.4. Isso não substitui `npm ci` + typecheck + suíte de testes + build completo em uma máquina com todas as dependências instaladas. A release não marca esses gates como PASS sem execução real.
