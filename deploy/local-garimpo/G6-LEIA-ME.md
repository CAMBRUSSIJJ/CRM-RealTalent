# Garimpo G6 — pesquisa comercial inteligente (Linux local)

Esta versão adiciona um plano de investigação por segmento, busca web dirigida,
leitura sequencial de páginas relacionadas à empresa, seleção de fontes pertinentes
e um resumo consultivo **sem aprovar ou preencher automaticamente** os dados
encontrados.

## O que muda

- Plano setorial: educação, beleza, saúde, comércio e genérico.
- Ollama pode reordenar prioridades permitidas por um esquema fechado.
  Se a IA não responder, o plano setorial continua funcionando.
- Duas pesquisas direcionadas no modo de pouca memória, três no modo normal.
- Site cadastrado primeiro, depois buscas por informação empresarial, serviços e
  possíveis mudanças. Resultados de outras empresas são filtrados antes da
  extração e têm confirmação territorial.
- Se o site fornecer links internos relevantes, lê no máximo uma página no
  perfil econômico (duas em máquinas com mais memória). Páginas de login,
  carrinho e diretórios de outras empresas são excluídas.
- Firecrawl já existente executa as leituras. Crawl4AI Docker REST pode ser
  usado opcionalmente para páginas internas se o serviço **já estiver ativo**:
  `GARIMPO_CRAWL4AI_URL=http://127.0.0.1:11235/` no arquivo de configuração
  do conector. O endpoint aceito é exclusivamente loopback; nada é instalado.
  Se Crawl4AI não responder, a leitura retorna ao Firecrawl.
- Diagnóstico comercial G6 separa fatos com URLs, campos faltantes, hipóteses,
  perguntas de diagnóstico e próximo passo. O modelo só pode melhorar perguntas
  consultivas; não pode modificar fatos e fontes verificadas.
- Continua sem API paga, sem login automatizado no Instagram e sem análise
  visual de Reels ou fotos.
- A investigação original é preservada por checkpoints e a conclusão parcial
  continua sendo reportada se alguma etapa falhar.

## Testes e configuração

Dentro de `deploy/local-garimpo` execute `npm test`. O teste local cobre
correlação de empresa e território, limites de fontes, encaminhamento entre
Crawl4AI/Firecrawl, preservação de evidências e resposta do Ollama.

É possível desligar as chamadas opcionais de planejamento e perguntas ao Ollama,
sem desligar o restante da investigação:
`GARIMPO_G6_AI_PLAN=false` e `GARIMPO_G6_AI_BRIEF=false`.

Não atualize a Production sem testes do conector Linux e revisão humana de uma
empresa conhecida. Nenhuma credencial deve ser enviada ao GitHub ou no relatório.
