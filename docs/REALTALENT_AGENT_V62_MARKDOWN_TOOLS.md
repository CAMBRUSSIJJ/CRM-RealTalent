# RealTalent Agent V6.2 — Markdown visual + primeira orquestração de ferramentas

## Interface
- Respostas novas, anteriores e em streaming passam pelo mesmo renderizador React Markdown (sem dangerouslySetInnerHTML).
- Cabeçalhos #, negrito **, itálico, listas e tabelas são apresentados como elementos visuais.
- Referências de pesquisa [1], [2] são links se houver URL HTTP/HTTPS informada.
- HTML arbitrário é tratado como texto, imagens remotas não são carregadas automaticamente.
- As versões do documento continuam preservadas. A renderização não altera o texto original que o modelo gerou.

## Orquestração (escopo controlado)
- Um planejamento opcional com Qwen3:8b só é acionado quando a solicitação reúne cálculo determinístico e questão de mercado/pesquisa.
- A lista permitida contém **apenas** web_research e calculator (até duas ferramentas); qualquer outra ferramenta é rejeitada.
- Mesmo que o modelo altere números, o cálculo é executado sobre **o texto original do usuário** usando a calculadora comercial já existente.
- Dados CRM não vão para SearXNG. Consultas com emails, URLs e dados numéricos suspeitos são rejeitadas antes da pesquisa.
- Uma pesquisa sem fonte não vira recomendação inventada. Mutações do CRM seguem no executor autorizado existente.
- O restante das solicitações segue a V6.1 sem adicionar latência de planejamento a todo prompt.

## Não incluído
- Agente autônomo aberto, exploração arbitrária da rede, integração de cálculos via código gerado pelo modelo, streaming da pesquisa, RAG vetorial e gravação sem confirmação.
- O parser Markdown é um subconjunto seguro, não um compilador completo de CommonMark.
- A qualidade de um modelo local de 8B pode diferir do ChatGPT.

## Testar Linux
Clone a branch feat/realtalent-agent-v62-tools-markdown-20261028 e execute:
  bash scripts/agent-v62-linux/abrir-local.sh
A prévia abre em http://127.0.0.1:4194 (gateway 8798/8799); Ollama permanece em 11434 e pesquisa SearXNG em 8888. V6.1 na porta 4193 é preservada.

**Teste prioritário:** Pergunte "E se for focado em jardineiros?" e confira que h2/h3, negrito, parágrafos e listas são exibidos sem caracteres # ou **. Depois teste um pedido que combine pesquisa de mercado e precificação de serviço; confira as duas ferramentas e a memória.
