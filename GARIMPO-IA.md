# Garimpo: pesquisa com IA e Firecrawl próprio

O botão **Buscar leads com IA** pesquisa fontes públicas e coloca os novos contatos em **Processamento**, com dados, fontes por campo, horário da pesquisa, informações faltantes e sugestões comerciais. O botão **Enriquecer com IA** pesquisa um contato existente e preenche somente campos vazios. A aprovação e o envio ao CRM continuam disponíveis no fluxo atual.

A pontuação representa completude, não uma garantia de veracidade. Sugestões de oportunidade e abordagem são hipóteses. O telefone não é automaticamente classificado como WhatsApp. Não são inventados e-mails, CNPJ ou responsáveis para atingir o limite solicitado.

## Usar no seu computador (opção escolhida)

Use o [guia do conector local](deploy/local-garimpo/README.md). Ele inclui Firecrawl oficial com SearXNG, modelo compatível com OpenAI no próprio computador e um conector que consulta a fila do CRM por conexões de saída. Não exige VPS, domínio nem porta pública. A opção **Meu computador** é a padrão no formulário de busca.

O banco recebeu a migração `20261110181947_local_prospecting_ai.sql` e os endpoints `prospecting-search` e `prospecting-local-connector`. O arquivo `garimpo.env` é gerado no CRM pelo administrador; guarda apenas a chave pública Supabase e um token exclusivo do workspace, sem `service_role`. O modelo e o coletor precisam ser iniciados no computador do usuário. Mantenha a janela do conector aberta durante as pesquisas.

Os testes locais não instalam Docker nem um modelo no computador do usuário. O modo de servidor abaixo continua como alternativa configurável.

## Usar um servidor conectado

1. Configure o frontend para usar o Supabase do CRM. Em modo local, a busca informa que precisa de conexão e não simula resultados.
2. Publique a função autenticada `supabase/functions/prospecting-search/index.ts`, incluindo os módulos compartilhados `prospecting-ai.ts` e `firecrawl-research.ts`. Com o CLI conectado ao projeto correto: `supabase functions deploy prospecting-search`.
3. No Dashboard Supabase, em **Edge Functions → Secrets**, configure uma das opções abaixo. Nunca coloque segredos em variáveis `VITE_` ou no Git.

| Opção | Variáveis no servidor |
| --- | --- |
| Firecrawl próprio + OpenAI | `FIRECRAWL_API_URL`, `FIRECRAWL_API_KEY` (token do gateway), `OPENAI_API_KEY`, `PROSPECTING_AI_MODEL` |
| Firecrawl próprio + modelo compatível hospedado por você | `FIRECRAWL_API_URL`, `FIRECRAWL_API_KEY`, `PROSPECTING_AI_BASE_URL` (HTTPS, terminando em `/v1`), `PROSPECTING_AI_API_KEY` se necessário, `PROSPECTING_AI_MODEL` |
| Busca web OpenAI | `OPENAI_API_KEY`, `PROSPECTING_AI_MODEL`; deixe `FIRECRAWL_API_URL` e `PROSPECTING_AI_BASE_URL` vazios |

Escolha um modelo disponível em sua conta com saída estruturada JSON Schema. A opção de busca OpenAI também exige suporte a `web_search` na Responses API. Nenhum nome de modelo é assumido pelo código. Com um endpoint próprio, a chave OpenAI não é encaminhada a ele.

`FIRECRAWL_API_URL` deve ser a origem HTTPS do servidor ou terminar em `/v2`; o CRM chama `/v2/search` com coleta em Markdown. A função no Supabase precisa alcançar o endereço: `localhost` do seu computador não fica acessível ao Supabase.

O modo de servidor usa a estrutura de leads existente. A nova migração adiciona somente as tabelas do conector e da fila local. Evidências ficam em `prospecting_leads.raw_data.aiResearch`, usando as permissões já existentes. Ao enviar ao CRM, as fontes e sugestões acompanham as observações. A função valida login e permissão de edição do workspace antes de consultar serviços externos.

## Rodar o Firecrawl oficial com Docker

Use o código oficial, sem recriar o coletor. Referência consultada: commit `603d3ec4a7f7ef7e0b1c3e5c8ec5a514bca8e1b7` do [Firecrawl](https://github.com/firecrawl/firecrawl). Consulte também o [guia oficial](https://docs.firecrawl.dev/contributing/self-host) e a licença do projeto.

Em uma máquina ou VPS com Docker Compose **2.24.4 ou superior**, recursos suficientes para o Compose oficial, um domínio apontado para ela e portas 80/443 disponíveis:

```sh
git clone https://github.com/firecrawl/firecrawl.git firecrawl-garimpo
cd firecrawl-garimpo
git checkout 603d3ec4a7f7ef7e0b1c3e5c8ec5a514bca8e1b7
mkdir garimpo
```

Copie os três arquivos de `deploy/garimpo/` deste CRM para `firecrawl-garimpo/garimpo/`. Crie um `.env` privado ao lado do Compose oficial, com:

```dotenv
GARIMPO_DOMAIN=coletor.seudominio.com.br
FIRECRAWL_GATEWAY_TOKEN=SUBSTITUA_POR_UM_SEGREDO_ALEATORIO
SEARXNG_SECRET=SUBSTITUA_POR_OUTRO_SEGREDO_ALEATORIO
POSTGRES_PASSWORD=SUBSTITUA_POR_OUTRA_SENHA
```

Gere cada segredo separadamente com `openssl rand -hex 32` e mantenha o arquivo fora do Git. Depois:

```sh
docker compose -f docker-compose.yaml -f garimpo/compose.override.yaml config --quiet
docker compose -f docker-compose.yaml -f garimpo/compose.override.yaml up -d --build
```

O complemento fornece SearXNG com resposta JSON para a busca e um gateway HTTPS com token. A API Firecrawl fica vinculada a `127.0.0.1:3002`; o gateway publica somente `POST /v2/search` e `POST /v2/scrape`. No Supabase, configure `FIRECRAWL_API_URL=https://coletor.seudominio.com.br` e `FIRECRAWL_API_KEY` com o token do gateway.

Sem SearXNG ou outro mecanismo compatível, subir apenas o scraper não garante a descoberta de empresas. A disponibilidade dos resultados depende dos buscadores e sites de origem. O exemplo acompanha o Compose oficial, que exige planejamento de persistência e recursos antes de uso contínuo; não é instalado automaticamente por esta alteração. Para reprodutibilidade operacional, fixe também os digests das imagens selecionadas no seu servidor.

Hospedar o software por conta própria evita a tarifa da API hospedada Firecrawl. Máquina, energia, servidor e eventual provedor de IA ainda podem ter custos. O uso de um modelo próprio depende da capacidade do seu hardware e do suporte a JSON Schema do endpoint.

## Validação e limites

- Pesquisas de 1 a 10 leads por rodada, com cancelamento. Prazo de 120 segundos no servidor; no computador, coleta de 110 segundos e fila acompanhada por até nove minutos.
- Falha no Firecrawl não aciona automaticamente um serviço pago alternativo.
- Dados sem fonte utilizável ou sem ocorrência no conteúdo coletado ficam vazios; CNPJ numérico e URLs são validados.
- Fontes, deduplicação, enriquecimento, autenticação e o adaptador Firecrawl têm testes automatizados.
- Uma pesquisa real exige servidor de coleta/modelo configurados. A configuração Docker foi preparada para o Compose oficial; disponibilizar um servidor permanente e baixar um modelo não faz parte da execução local dos testes.
