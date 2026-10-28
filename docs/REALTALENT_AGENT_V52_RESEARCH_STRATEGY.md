# RealTalent Agent V5.2 — Pesquisa antes do roteiro

## Diagnóstico corrigido
Pedido de referência: "Faça um script voltado para autônomos de prestação de serviços, mais específico para jardineiros."
A V5.1 gerava roteiro de ligação genérico porque havia apenas uma correspondência de intenção e rascunho padronizado. O usuário não havia especificado quem venderia para quem ou qual oferta teria de ser vendida.

## V5.2
1. Diagnóstico de público e direção comercial. Quando um segmento específico é citado mas vendedor/oferta continuam ambíguos, a IA pede uma distinção objetiva e **não cria um roteiro como se soubesse a estratégia**.
2. Para solicitação específica com oferta/direção explícita, o frontend chama o endpoint de pesquisa do runtime local, que opcionalmente consulta um buscador SearXNG via variável RELTALENT_RESEARCH_SEARXNG_URL. A busca pública recebe somente o tópico genérico, nunca os fatos do CRM.
3. Ollama recebe o pedido, os trechos retornados, dados CRM autorizados e rascunho apenas como contexto, compara alternativas, recomenda um ângulo e cria o texto com JSON estruturado.
4. O Script Studio apresenta recomendação, justificativa, alternativas, hipóteses e links das fontes recuperadas; diferencia "análise contextual" de "busca externa". Sem fonte não existe alegação de pesquisa externa.
5. Ollama indisponível: roteiro estruturado é **provisório**, não um texto dito "pesquisado". Exige revisão.
6. Nenhuma pesquisa externa, envio de mensagens ou execução de alterações é ativada por padrão.

## Ativação da pesquisa externa (sem API paga obrigatória)
Implantar SearXNG sob controle da equipe com `format=json` habilitado. Configurar `RELTALENT_RESEARCH_SEARXNG_URL` **no runtime local protegido**, apontando para a raiz da instância. Esse serviço precisa ser controlado para evitar limites e bloqueios de terceiros; não é ativado automaticamente pela prévia Vercel.

## Limitações e QA
- A busca consome apenas título/trecho/link do mecanismo; a IA não deve alegar leitura integral de cada página.
- Os modelos podem formular hipóteses; a interface exige distingui-las de resultados de pesquisa.
- A fonte pode ser insuficiente. É necessária avaliação humana de adequação e evidências.
- Testar exemplo jardineiros nos dois sentidos (vender para jardineiros e jardineiro vender serviço).
- Validar navegador Firefox/Chromium, permissões de cliente, servidor Ollama real e funcionamento do buscador.
- Não fazer merge nem deploy de runtime em produção sem autenticação e teste E2E.
