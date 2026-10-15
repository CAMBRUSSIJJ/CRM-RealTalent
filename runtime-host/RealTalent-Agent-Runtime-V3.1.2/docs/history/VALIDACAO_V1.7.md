# Validação — RealTalent Agent V1.7

## Runtime
- Runtime contracts: 180/180 PASS
- Project Brain: 16/16 PASS
- Project Awareness regression: 12/12 PASS
- Conversation Intelligence: 11/11 PASS
- Conversation Intelligence Gateway: 12/12 PASS
- Chat Experience: 10/10 PASS
- Conversational Workbench: 6/6 PASS
- Intelligence: 13/13 PASS
- Local AI: 7/7 PASS
- Workflow: 9/9 PASS
- Mission: 9/9 PASS
- Program: 13/13 PASS
- Governance: 16/16 PASS
- Builder self-test: PASS
- Browser QA / Chromium: PASS

## CRM
- Project Brain integration audit: 15/15 PASS
- Source syntax audit: 425 arquivos PASS
- Integration contracts: 393 arquivos PASS

## Blue Ocean
- Project Brain integration audit: 15/15 PASS
- `syntax:check`: PASS

## Project Brain contra os projetos reais do bundle
### CRM
- 919 arquivos indexados
- 747 arquivos de código
- 79 testes detectados
- 1.705 relações de import
- 68 módulos
- 269 relações de arquitetura entre módulos
- 579 componentes UI
- 46 rotas
- 857 entidades de dados
- 82 tabelas Supabase detectadas
- 131 RPCs detectadas
- 41 módulos funcionais no Feature Graph
- full index: ~450 ms neste ambiente de validação
- sync sem alterações: 919 arquivos reutilizados; ~54 ms

### Blue Ocean
- 416 arquivos indexados
- 258 arquivos de código
- 306 relações de import
- 80 módulos
- 107 relações de arquitetura entre módulos
- 129 componentes UI
- 8 rotas
- 254 entidades de dados
- 22 módulos funcionais no Feature Graph
- full index: ~165 ms neste ambiente de validação
- sync sem alterações: 416 arquivos reutilizados; ~12 ms

## Limitações declaradas
- os grafos são estáticos e não substituem execução, Browser QA, logs ou testes;
- regex de rotas/dados/Supabase pode não capturar construções altamente dinâmicas;
- métricas de tempo acima pertencem ao ambiente de validação e podem variar no notebook do usuário;
- full Vitest/typecheck/build dos produtos não é declarado como aprovado sem o ambiente completo de dependências; apenas os gates efetivamente executados acima são marcados PASS.
