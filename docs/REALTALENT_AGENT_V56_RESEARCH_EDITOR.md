# RealTalent Agent V5.6 — pesquisa pública, editor livre e diagnóstico

## Correções feitas
- Pedidos de pesquisa externa explícitos têm precedência sobre revisão de documento, Script Studio e planejamento de mutações do CRM.
- Pesquisas opcionais via SearXNG retornam fontes HTTPS reais, trechos e uma análise original com referência numérica [1], [2]. Quando ausente, o Agent informa que a busca está desabilitada ou indisponível.
- Transformações determinísticas em tabela, lista e texto corrido funcionam sem Ollama. Uma revisão gerada pelo modelo pode ter poucos caracteres; o limite arbitrário de 180 caracteres foi removido.
- Roteiros e documentos ativos continuam versionados, preservando a versão anterior se uma revisão falhar.
- O painel separa CRM conectado, Ollama conectado/modelo instalado e pesquisa configurada. Diagnóstico GET /tools/health.
- Nenhuma ação externa é executada pelo módulo de pesquisa; envio e escrita permanecem no executor com permissões.

## Ativação no Linux
Ollama deve rodar localmente em http://127.0.0.1:11434, runtime do Agent em 127.0.0.1:8791 e frontend em 127.0.0.1:4188. Configure REALTALENT_OLLAMA_MODEL=qwen3:8b no runtime após instalar modelo com `ollama pull qwen3:8b`.

Para busca pública, configure `REALTALENT_RESEARCH_SEARXNG_URL=http://127.0.0.1:8888` apenas **no runtime local**. Instância SearXNG precisa ter output JSON ativado, responder ao endpoint /search?format=json e estar isolada da rede pública. Se não configurada, a interface reporta "Pesquisa: não configurada".

## Limitações reais
- A prévia da Vercel mostra somente o frontend; não conecta automaticamente com a GPU do Linux do usuário.
- Resumos são fundamentados nos trechos retornados pelo buscador, não em leitura integral das páginas. Leitor integral seguro, RAG vetorial e sincronização Supabase ainda não estão ativos.
- Um pedido de "copiar integralmente" uma obra de terceiros vira pesquisa/resumo e adaptação original, não reprodução de conteúdo protegido.
- A indicação "modelo instalado" vem da API /api/tags do Ollama; não mede desempenho nem VRAM.
- Railway e Production não foram alterados; testar endpoints com browser autenticado no CRM local antes do merge.

## Critérios de aceitação
1. "Busque scripts de Thiago Reis e explique a metodologia" aciona pesquisa; sem SearXNG informa falta de configuração.
2. "Transforme esse roteiro em tabela" funciona localmente e cria nova versão.
3. "Reduza para uma mensagem curta" aceita texto curto gerado, sem descartar por comprimento.
4. "Crie uma tarefa para amanhã" segue ferramentas autorizadas do CRM, não pesquisa nem alteração de documento.
5. Ollama desligado, timeout e SearXNG ausente nunca produzem sucesso inventado.
