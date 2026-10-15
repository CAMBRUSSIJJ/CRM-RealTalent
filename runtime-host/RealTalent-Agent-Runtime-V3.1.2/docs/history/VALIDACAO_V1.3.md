# Validação — RealTalent Agent V1.3 Chat Experience

## Runtime
- Contract audit: **149/149 PASS**
- Chat Experience self-test: **10/10 PASS**
- Local AI self-test: **7/7 PASS**
- Intelligence self-test: **13/13 PASS**
- Workflow regression: **9/9 PASS**
- Mission regression: **9/9 PASS**
- Program regression: **13/13 PASS**
- Governance regression: **16/16 PASS**
- Builder self-test: **PASS**
- Browser QA/Chromium self-test: **PASS**
- Runtime MJS syntax: **14 arquivos PASS**
- Runtime Python syntax: **2 arquivos PASS**
- JavaScript renderizado `/chat` e `/control`: **PASS**

## CRM
- V1.3 Chat Experience audit: **13/13 PASS**
- V1.2 Intelligence regression on V1.3: **14/14 PASS**
- Source syntax audit: **425 arquivos PASS**

## Blue Ocean
- V1.3 Chat Experience smoke: **13/13 PASS**
- V1.2 Intelligence regression on V1.3: **13/13 PASS**
- `npm run syntax:check`: **PASS**

## Empacotamento / scripts
- Shell syntax (bundle + runtime): **61 scripts PASS**

## Escopo validado
- `/chat` é a experiência principal e renderiza separado de `/control`.
- `/control` permanece disponível como Modo técnico.
- Conversas são persistidas e recuperadas localmente.
- Pergunta simples usa IA local sem iniciar trabalho operacional.
- Pedido operacional pode ser roteado para Workflow sem expor Program/Mission/Workflow na Home.
- Progresso técnico e aprovações são traduzidos para cards dentro do Chat.
- Anexos são limitados; binário bruto não é persistido no histórico.
- Anexo de imagem sem visão configurada não é enviado ao Ollama como imagem.
- CRM e Blue Ocean abrem o Agent em `/chat`, preservando links técnicos para `/control`.
- OpenAI API não é necessária no modo Ollama.

## Limitações conhecidas
- A resposta possui indicador de processamento, mas **não** streaming token-a-token nesta versão.
- Sem `OLLAMA_VISION_MODEL`, imagens anexadas não recebem interpretação visual pelo modelo.
- Conversas são locais à máquina/usuário; não há sincronização multiusuário/Supabase nesta versão.
- Até 4 anexos por mensagem e 1,3 MB por arquivo.
- Vitest/typecheck/build integrais dos produtos não são declarados como PASS quando as dependências completas não estão disponíveis no pacote de trabalho.
- O benchmark real de hardware/modelo deve ser executado no notebook com `./benchmark-agent.sh`.
