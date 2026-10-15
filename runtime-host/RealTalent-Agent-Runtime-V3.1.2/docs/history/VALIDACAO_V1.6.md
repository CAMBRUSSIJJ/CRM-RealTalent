# Validação — RealTalent Agent V1.6

## Runtime
- Runtime contracts: 170/170 PASS
- Conversation Intelligence: 11/11 PASS
- Conversation Intelligence Gateway: 12/12 PASS
- Chat Experience: 10/10 PASS
- Conversational Workbench: 6/6 PASS
- Project Awareness: 12/12 PASS
- Intelligence: 13/13 PASS
- Local AI: 7/7 PASS
- Workflow: 9/9 PASS
- Mission: 9/9 PASS
- Program: 13/13 PASS
- Governance: 16/16 PASS
- Builder self-test: PASS
- Browser QA / Chromium: PASS

## CRM
- Conversation Intelligence audit: 15/15 PASS
- Source syntax audit: 425 arquivos PASS
- Integration contracts: 393 arquivos PASS

## Blue Ocean
- Conversation Intelligence audit: 15/15 PASS
- `syntax:check`: PASS
- H7.24 Journey Library & Collapsible Sidebar: 40/40 PASS

## Casos de regressão conversacional
- CRM → `oi`: topic shift detectado; contexto CRM removido; PASS
- CRM → `e qual a diferença para ERP?`: follow-up mantém contexto; PASS
- `como posso me amar?`: Perspective Guard aponta primeira pessoa para o usuário; PASS
- `onde está implementado o WhatsApp?`: Project Awareness ativado; PASS
- `corrija o WhatsApp e rode os testes`: intenção `execute_task`; PASS
- resposta repetitiva: Response Quality Layer remove duplicação exata; PASS

## Limitações declaradas
- O modelo principal local continua sendo adequado ao hardware do usuário (`qwen2.5-coder:3b`), mas não equivale em inteligência geral a modelos grandes em nuvem.
- O Project Awareness é ativado por relevância/intenção e não substitui evidência de runtime.
- Full Vitest/typecheck/build dos produtos não é declarado como aprovado sem o ambiente completo de dependências; os gates listados acima são os que foram efetivamente executados.
