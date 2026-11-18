# Motor Python do Garimpo 0.6

Motor separado do frontend para descobrir empresas, coletar contatos comerciais publicados e exportar resultados compatíveis com o Garimpo do RealTalent. Requer Python 3.12 ou superior.

## Como funciona

1. Recebe segmento, município, UF, quantidade e critérios obrigatórios.
2. Pesquisa Google Maps pelo coletor gosom, OpenStreetMap, Brave Search ou fontes combinadas.
3. Normaliza e compara os registros para reduzir duplicidades.
4. Opcionalmente visita o site e até duas páginas de contato do mesmo site.
5. Extrai telefone, e-mail, CNPJ numérico com dígitos válidos e Instagram quando publicados. Registra URL, fonte e data de observação.
6. Separa contatos prontos de candidatos com contato pendente, prioriza a correspondência com o segmento e depois o preenchimento, e exporta JSON.

O `qualityScore` mede preenchimento dos dados. O `relevanceScore` mede correspondência por regras entre o segmento solicitado e nome, categoria, tipo de negócio e texto observado; `relevanceReasons` explica os sinais encontrados. Essas notas não estimam intenção de compra, validade do e-mail ou titularidade do telefone. A cidade vinda apenas da pesquisa tem `locationStatus=requested`; endereço publicado na fonte tem `observed`. Empresas com endereço observado em outro município são descartadas. `--require-location` exige localidade observada; pode reduzir bastante a quantidade.

## Busca expandida, resultados progressivos e retomada (0.6)

`search_mode=expanded` (padrão) planeja uma busca inicial, termos equivalentes do segmento e áreas dentro do município. Para barbearias, por exemplo, inclui `barbershop` e `barbeiro`, sem ampliar automaticamente para salões de beleza. Quando a base local OSM está disponível, o planejador prioriza concentrações de estabelecimentos; sem ela, utiliza pontos próximos à coordenada municipal. Os pontos são conferidos no polígono. Essas áreas não são apresentadas como bairros oficiais nem como garantia de cobertura completa da cidade.

`GARIMPO_MAPS_QUERY_LIMIT` limita o plano a seis consultas por padrão, entre 1 e 12. A coleta para antes quando atinge a quantidade útil solicitada. `search_mode=standard` / `--search-mode standard` usa apenas a busca inicial. O orçamento de até 300 candidatos únicos e o tempo global da pesquisa continuam aplicados. Para buscas maiores, ajuste `GARIMPO_JOB_TIMEOUT` de forma explícita, por exemplo para 600 segundos; `GARIMPO_MAPS_TIMEOUT` limita cada execução do coletor.

O motor lê os registros JSON enquanto o coletor ainda está executando. Contatos já publicados e compatíveis com os filtros podem aparecer imediatamente, com `engine.collectionStatus=enriching` enquanto a consulta opcional ao site segue em andamento. Essa consulta fica registrada no checkpoint, de modo que uma interrupção não apague o telefone nem faça a retomada ignorar o enriquecimento pendente. `metrics.first_result_ms` mede o tempo até o primeiro contato aparecer; `duration_ms` continua medindo o tempo total ativo.

Cada consulta concluída fica salva no documento da pesquisa, independentemente da validade do cache global. Reiniciar o worker aproveita os candidatos e pula as consultas já concluídas. Uma consulta interrompida pode ser repetida e seus registros são deduplicados. O cache diferencia consultas completas de resultados parciais: um cache parcial só atende uma nova busca quando seus candidatos únicos já satisfazem os filtros e o limite solicitados. Ele não é tratado como uma consulta completa para uma busca mais exigente.

`POST /v1/searches/{id}/resume` retoma uma pesquisa cancelada, com falha ou concluída parcialmente sem atingir a meta. Cria uma nova pesquisa com os candidatos, conferências pendentes e plano anterior, preservando o registro original. A ação tem autenticação, limite de fila e `Idempotency-Key`, assim como as demais rotas. O preview mostra o botão de retomada quando a ação é aplicável. `search_progress` informa consultas planejadas, iniciadas e concluídas, área/termo atual e motivo de parada; o estado interno do plano não é exposto na API pública.

```bash
python -m garimpo search --provider maps --segment barbearias \
  --city 'Rio Grande' --state RS --limit 50 --require-phone \
  --search-mode expanded --progress \
  --output data/contatos.json --pending-output data/pendentes.json \
  --report data/relatorio.json
```

`--progress` mostra o andamento no stderr e mantém o JSON de resultados separado. Os contadores adicionais são `maps_batches`, `maps_duplicates` e `maps_steps_reused`. Cancelar, atingir o limite ou fechar o fluxo encerra explicitamente o produtor e seus navegadores. Uma restrição de coleta detectada no Maps interrompe o plano inteiro; o motor não tenta contorná-la trocando de termo ou área.

Para retomar no terminal, use `python -m garimpo resume ID_DA_PESQUISA --progress --output data/retomada.json --report data/retomada-relatorio.json`. O comando imprime o novo identificador e preserva a pesquisa anterior. Duplicatas que tragam um telefone ou site antes ausente atualizam o candidato existente; um site recém-encontrado pode voltar para a fila de enriquecimento.

## Google Maps e qualificação opcional por Ollama (0.5)

O motor coordena o coletor externo [gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper), fixado em `v1.19.0`. Ele roda como processo separado, sem shell e sem receber as chaves da API do motor ou do Brave. `setup-maps` verifica tamanho e SHA-256 do binário oficial antes de executá-lo, instala o Chromium correspondente e remove opções upstream que desativam verificações TLS/segurança de origem ou ocultam a automação. Telemetria do coletor fica desabilitada. Não há login Google, rotação de proxies ou resolução de CAPTCHA.

Para Linux x86_64, com Python e bibliotecas de execução do Chromium instalados:

```bash
python -m garimpo setup-maps --directory data/tools
export GARIMPO_MAPS_BINARY="$PWD/data/tools/google-maps-scraper-v1.19.0"
python -m garimpo search --provider maps --segment barbearias \
  --city 'Rio Grande' --state RS --limit 10 --require-phone \
  --output data/contatos.json --pending-output data/pendentes.json \
  --report data/relatorio.json
```

Servidores Linux mínimos precisam também das bibliotecas de sistema do Chromium; ambientes desktop com Chrome instalado normalmente já as possuem. Confira a instalação de dependências do Playwright para a distribuição usada. O Dockerfile principal continua atendendo instalações sem navegador. O instalador usa o proxy e a CA configurados no ambiente para baixar as dependências, mantendo a verificação TLS; a coleta não configura rotação de proxies.

`provider=maps` consulta Maps. `provider=combined` aproveita Maps primeiro e depois a base OSM, se ainda faltarem resultados úteis e o segmento tiver categoria OSM. Falhas da primeira fonte são sinalizadas mesmo quando a segunda fornece resultados. `provider=auto` prioriza Maps quando o binário está configurado; sem ele, mantém a escolha Brave/OSM anterior. Configure `GARIMPO_MAPS_TIMEOUT` (padrão 120 segundos) para limitar a coleta. Cada execução usa um navegador com concorrência 1 e profundidade entre 1 e 5, proporcional ao limite solicitado. Até 300 registros da saída são examinados. Isso não representa um levantamento completo de todas as empresas do município.

As coordenadas dos estabelecimentos precisam estar dentro do polígono municipal consultado no Nominatim. Cidade/UF/país publicados que conflitem com a busca são rejeitados. O motor conserva a URL Maps, o identificador do estabelecimento, categoria, coordenadas, nota e quantidade de avaliações. Não coleta textos de avaliações nem dados dos avaliadores. A nota do Maps não aumenta o score de correspondência comercial. Número publicado não confirma funcionamento ou conta WhatsApp ativa.

Consultas concluídas são reaproveitadas por até uma hora, respeitando `GARIMPO_CACHE_TTL`. Coletas incompletas não entram no cache. Cancelar ou atingir o tempo máximo encerra o grupo de processos e os navegadores. Quando há registros aproveitáveis em uma interrupção, o motor os preserva e sinaliza pesquisa parcial. Falha do navegador ou ausência de saída utilizável não é apresentada como prova de inexistência de empresas.

O enriquecimento dos sites passa pelo coletor HTTP já existente. Para sites indicados pelo Maps, a atribuição de novos contatos exige também a conferência de identidade/filial. Diretórios e redes sociais conhecidos não são coletados. A renderização genérica de sites por Crawl4AI não foi adicionada nesta versão; sua instalação direta sem o controle de destinos de rede reduziria as proteções atuais. O navegador do gosom fica restrito ao caminho de descoberta, com extração de e-mails pelo coletor externo desativada. Contatos dos sites passam pelo controle do motor.

Ollama é opcional e não fornece os telefones. Configure `GARIMPO_OLLAMA_URL` e `GARIMPO_OLLAMA_MODEL` e use `--qualify` / `qualify=true`. A qualificação lê somente o texto já coletado, aceita no máximo oito sinais de serviços, público declarado e agendamento, e exige URL e citação literal de cada sinal. Citações ou valores ausentes do texto são descartados. Ausência de menção e intenção de compra permanecem desconhecidas. Indisponibilidade do modelo não descarta os contatos. Cada chamada tem limite de 20 segundos e saída de 64 KiB, com cache por conteúdo e modelo.

Uma URL `http://127.0.0.1:11434` aponta para o Ollama na mesma máquina do motor; um preview remoto não acessa automaticamente o computador do operador. O preview só oferece a opção de qualificação quando o endpoint está configurado. Sem endpoint, a coleta Maps e os filtros continuam funcionando.

Os novos contadores são `maps_runs`, `maps_cache_hits`, `maps_partial`, `qualification_requests` e `qualification_cache_hits`. `discovery_requests` conta o HTTP feito pelo Python; não inclui as requisições internas do navegador gosom. Para comparar fontes, registre empresas únicas, contatos publicados, correspondência com o município/segmento, tempo e revisão de uma amostra.

## Recuperação de contatos e candidatos pendentes (0.4)

Os contatos que atendem aos filtros continuam em `results`, com exportação compatível com o Garimpo. Empresas processadas que passam pelos filtros de segmento e localidade, mas não têm os contatos exigidos, aparecem em `pending`. Cada uma preserva os dados publicados, as fontes, `engine.pendingReasons` e o estado da recuperação. A exportação normal não mistura esses candidatos com os contatos prontos. O preview mostra e permite baixar as duas listas separadamente.

Com `BRAVE_SEARCH_API_KEY` no servidor e consulta a sites habilitada, o motor busca o site dos candidatos sem URL utilizável que ainda precisam de contato. Faz uma busca por empresa, examina até cinco resultados e visita no máximo dois domínios elegíveis, respeitando o orçamento de 35 segundos da empresa. Contatos de snippets não são aproveitados. Um site descoberto precisa corroborar a identidade e a filial com nome, município/endereço ou identificador já publicado. Páginas ambíguas, de outra cidade ou de outra filial não cedem contatos. Diretórios e redes sociais não são coletados por esse caminho.

O modo `provider=hybrid` consulta OSM primeiro e aproveita seus resultados antes de pedir a descoberta web ao Brave. Se alcançar a quantidade útil, encerra sem consultar a segunda fonte. Quando a primeira fonte falha e a web fornece candidatos, mantém os resultados e informa descoberta parcial. A seleção `auto` mantém o comportamento anterior. Sem a chave Brave, a recuperação informa a configuração ausente e preserva os candidatos; não promete contatos adicionais.

```bash
python -m garimpo search --segment barbearias --city 'Rio Grande' --state RS \
  --provider osm --limit 10 --require-phone \
  --output data/contatos.json --pending-output data/pendentes.json \
  --report data/relatorio.json
```

`GET /v1/searches/{id}/pending` baixa os pendentes, com a mesma autenticação da API. `POST /v1/searches/{id}/recover` cria uma nova pesquisa contendo apenas os pendentes processados da pesquisa encerrada, com descoberta já concluída, conservando a pesquisa original. Aceita `Idempotency-Key` e respeita o limite da fila. Esse caminho pode ser usado depois de configurar a chave; dispensa repetir a descoberta geográfica. Pesquisas antigas também recebem a lista de pendentes ao serem consultadas.

`GARIMPO_RECOVERY_QUERY_LIMIT` define o máximo de buscas de sites por pesquisa (padrão 20, de 0 a 100). O orçamento é compartilhado entre tarefas concorrentes e considera consultas já realizadas antes de uma retomada. A descoberta web ampla do modo híbrido tem seu próprio orçamento de paginação existente; ela não está incluída nesse limite de recuperação por empresa. Cache, controle de concorrência, `robots.txt` e validação de destinos públicos continuam aplicados. A recuperação de celular e número WhatsApp publicado nas tags OSM também é reconhecida, sem afirmar que o número esteja ativo no WhatsApp.

O relatório inclui `pending_contacts`, `recovery_queries`, `recovery_statuses`, `processed_with_phone`, `processed_with_email`, `without_website`, `recovered_with_phone` e `recovered_with_email`. Esses contadores permitem comparar o preenchimento antes e depois. Precisão de identidade, utilidade comercial e funcionamento dos contatos exigem revisão de uma amostra real; a nota de correspondência continua baseada em regras.

## Melhorias da versão 0.2

- A coleta aproveita cada página de descoberta antes de solicitar a seguinte. Ao atingir a quantidade útil solicitada, encerra a paginação. Checkpoints de buscas interrompidas continuam sendo aproveitados.
- `--min-relevance` / `minimum_relevance` filtra a correspondência com o segmento. O padrão 0 preserva o comportamento de buscas anteriores. Comece com 45 e revise uma amostra antes de elevar a exigência. Categoria OSM ampla de salão/barbearia, sozinha, não confirma que a empresa é uma barbearia.
- A extração identifica a entidade principal nos dados estruturados do site; descarta metadados de organizações externas e evita juntar contatos de várias empresas em páginas ambíguas. Créditos de desenvolvimento e exemplos em elementos ocultos também são ignorados. São regras conservadoras; não substituem a revisão de identidade da empresa.
- URLs perdem parâmetros de rastreamento para reduzir consultas duplicadas. Parâmetros funcionais, como identificador de filial, continuam preservados. Resultado profundo com 404/410 pode levar à página inicial do mesmo site, dentro do limite de três páginas; restrições 403/429 continuam respeitadas.
- O relatório inclui consultas à fonte, acessos a sites, reaproveitamento de cache, tentativas, duração e motivos de descarte.

Uma comparação com respostas controladas usa a mesma busca de dez empresas nas versões 0.1 e 0.2. O cenário verifica chamadas de descoberta e atribuição de e-mail quando a página descreve uma agência externa e a empresa principal. Esses cenários medem o comportamento do código; não demonstram precisão ou economia em buscas reais.

| Cenário controlado | 0.1 | 0.2 |
| --- | --- | --- |
| Consultas de descoberta para dez resultados já disponíveis na primeira página | 2 | 1 |
| E-mail escolhido em página com metadados da agência externa e da empresa | Agência | Empresa |
| Novas consultas de descoberta ao repetir a mesma busca com cache válido | 0 | 0 |

## Base própria sem chave de API (0.3)

Uma extração aberta OSM/PBF pode ser preparada em um índice SQLite do próprio motor. Quando `GARIMPO_OSM_INDEX` aponta para esse índice, a descoberta consulta essa base, sem chamadas ao Overpass. O Nominatim continua fornecendo e mantendo em cache o contorno do município; cada ponto é filtrado pelo polígono, não apenas por um retângulo que pode incluir cidades vizinhas.

```bash
python -m pip install -c requirements.lock -e '.[snapshot]'
python -m garimpo index-osm \
  --input /caminho/extração.osm.pbf \
  --output data/empresas-osm.sqlite3 \
  --source-url https://origem-publica/extração.osm.pbf \
  --snapshot-at 2026-11-17T00:14:41Z \
  --states RS SC PR \
  --label 'Região Sul — RS, SC e PR — OpenStreetMap'
export GARIMPO_OSM_INDEX=data/empresas-osm.sqlite3
```

Use a URL e a data reais da extração escolhida. O exemplo de UFs se aplica a uma extração completa da Região Sul; não representa cobertura nacional. `--states` declara as UFs efetivamente incluídas no arquivo e impede consultas a outras UFs, mesmo que seus limites caiam dentro do retângulo da extração. O importador obtém os limites do cabeçalho quando `--bounds` é omitido. Para uma área menor, use limites explícitos, por exemplo `--bounds -51.30 -30.05 -51.05 -29.80` para Canoas e arredores.

O importador usa o índice nativo compacto de coordenadas do libosmium, sem o antigo dicionário Python limitado a dois milhões de nós. A preparação regional ainda requer memória proporcional ao arquivo: foi executada em ambiente com 8 GB para a extração Sul de 431 MB. A consulta ao índice pronto dispensa osmium e o arquivo PBF. Uma importação malsucedida preserva a base anterior.

Fontes abertas de extrações incluem https://download.geofabrik.de/ e https://download.bbbike.org/. Confira a cobertura geográfica de cada arquivo. Por exemplo, o recorte BBBike de Porto Alegre cobre só parte de Canoas; isso não é suficiente para afirmar cobertura do município inteiro. A preparação regional usa a extração completa da Região Sul, publicada pela Geofabrik, para permitir consultas a Canoas, Rio Grande e outros municípios de RS, SC e PR.

O índice inclui estabelecimentos identificados por nome e categorias conhecidas em objetos OSM `node` e `way`. Geometrias de relações não são importadas nesta versão. O centro dos vértices é usado como ponto de referência de estabelecimentos mapeados como polígonos; objetos sem coordenadas suficientes são contabilizados como omitidos. A cobertura comercial depende do que a comunidade publicou no OSM.

Cada resultado preserva URL do objeto, origem da extração, data e licença ODbL. A data é a da extração, não uma confirmação de funcionamento da empresa ou do telefone. A atualização da base é explícita: prepare uma nova extração e substitua o índice. Uma importação vazia ou malsucedida preserva o índice anterior. Não existe download automático de uma base regional a cada busca.

O preview distingue a disponibilidade da API da disponibilidade da pesquisa. Falhas não exibem uma barra de conclusão cheia nem a mensagem inicial de uma busca que ainda não ocorreu.

## Instalar e pesquisar no terminal

Execute a partir da raiz do CRM:

```bash
cd garimpo-engine
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -c requirements.lock -e .

python -m garimpo search \
  --segment "barbearias" \
  --city "Canoas" \
  --state RS \
  --provider osm \
  --limit 25 \
  --require-phone \
  --min-relevance 45 \
  --output data/canoas.json \
  --report data/canoas-relatorio.json
```

O arquivo `data/canoas.json` pode ser importado na área de importação do Garimpo existente. O relatório mostra estado, empresas descobertas/processadas, avisos e erros. Os exemplos de contatos em `tests/fixtures` são exclusivamente dados de teste.

`--limit` é o máximo de resultados, entre 1 e 100. Uma fonte pode fornecer menos empresas ou nenhum contato público. Não completamos a quantidade com dados inventados. A busca examina uma quantidade limitada de candidatos: até três vezes o limite, com teto de 200 no OSM ou 100 na web.

Outras opções:

```bash
python -m garimpo segments
python -m garimpo search --help
python -m garimpo status ID_DA_PESQUISA
python -m unittest discover -s tests -v
```

`--require-email` exige e-mail publicado; `--require-location` exige cidade observada na fonte; `--min-relevance` aceita um inteiro de 0 a 100; `--no-websites` consulta apenas a fonte de descoberta. A execução retorna código 0 quando concluída, incluindo buscas sem resultados; código 2 indica falha/configuração inválida. Consulte também os avisos, porque uma pesquisa pode terminar com descoberta parcial.

## Como medir os resultados

O JSON de `--report` e `GET /v1/searches/{id}` contém `metrics`:

| Campo | O que mede |
| --- | --- |
| `discovery_requests` / `website_requests` | Tentativas HTTP às fontes / aos sites, incluindo robots.txt e redirecionamentos. Não representam preço cobrado pelo provedor. |
| `provider_cache_hits` / `website_cache_hits` / `robots_cache_hits` | Consultas reaproveitadas do cache, sem novo acesso HTTP correspondente. |
| `duration_ms` | Tempo ativo acumulado das tentativas com checkpoint, sem o tempo aguardando na fila. |
| `rejected` | Motivo principal de descarte por registro processado: localidade, telefone/e-mail ausentes, localidade não observada ou relevância insuficiente. Omissões já descartadas pela fonte não entram nessa contagem. |
| `with_phone` / `with_email` | Quantidade entre os resultados exportados, sem inferir validade de contato. |
| `eligible` / `returned` | Resultados que atendem aos filtros / resultados exportados após o limite. |
| `discovery_duplicates` / `merged_after_collection` | Repetições descartadas na descoberta / registros unidos após coletar mais dados. |
| `completion_reason` | Limite atingido, fonte esgotada, descoberta interrompida, cancelamento ou erro/tempo excedido. Confira também `status`, `phase`, `partial` e `error`. |

Para medir eficácia comercial, faça buscas reais em três segmentos/cidades, revise uma amostra e registre quantas empresas correspondem ao perfil e quantos contatos são úteis. Compare esses resultados com consultas feitas e tempo gasto. As notas por regras podem precisar de ajuste por segmento; use a amostra revisada como referência.

## Fontes e cobertura

| Fonte | Configuração | Uso e limites |
| --- | --- | --- |
| OpenStreetMap | Sem chave; use uma identificação de operador válida | Geocodifica município/UF via Nominatim e consulta categorias no Overpass. A cobertura e a atualização variam por cidade. Os contatos são tags publicadas pela comunidade. |
| Brave Search | `BRAVE_SEARCH_API_KEY` no servidor | Pesquisa web para nichos livres e usa os sites encontrados. Resultados podem incluir páginas informativas; confirme o segmento e a empresa na revisão. Cada página consultada consome a cota contratada. |

`provider=auto` usa Brave quando há chave, caso contrário OSM. A seleção não muda silenciosamente após falha de uma fonte. OSM oferece 27 grupos de categorias; os aliases completos estão em `providers.py`. A categoria `hairdresser` inclui barbearias e salões; cada resultado recebe esse aviso. Segmento sem mapeamento gera uma mensagem explícita em vez de pesquisar todas as empresas da cidade.

Defina `GARIMPO_USER_AGENT` com identificação e contato do operador. O padrão inclui o repositório do projeto. `GARIMPO_CONTACT_EMAIL` é opcional e é enviado ao Nominatim. As fontes públicas são adequadas para testes e volume limitado; produção com volume elevado precisa de um provedor contratado ou de infraestrutura própria e deve respeitar as políticas de uso:

- https://operations.osmfoundation.org/policies/nominatim/
- https://wiki.openstreetmap.org/wiki/Overpass_API
- https://api-dashboard.search.brave.com/documentation

Dados OSM são atribuídos a OpenStreetMap e colaboradores, sob ODbL: https://www.openstreetmap.org/copyright. Cada evidência mantém o link do objeto de origem. Verifique também as condições de armazenamento/reutilização do plano contratado do Brave antes de configurar cache persistente; `GARIMPO_CACHE_TTL=0` desativa esse cache. Regras de `robots.txt` ainda têm cache de uma hora para evitar consultas repetidas.

## Variáveis de ambiente

As variáveis são lidas do processo. Para usar o exemplo em Bash:

```bash
cp .env.example .env
# Edite .env com os valores do seu ambiente.
set -a
source .env
set +a
```

| Variável | Padrão | Finalidade |
| --- | --- | --- |
| `GARIMPO_DB` | `data/garimpo.sqlite3` | Fila, checkpoints e cache em SQLite/WAL. |
| `GARIMPO_API_TOKEN` | vazio | Obrigatório para API, mínimo 32 caracteres aleatórios. CLI local dispensa esse token. |
| `BRAVE_SEARCH_API_KEY` | vazio | Chave do provedor de pesquisa web. |
| `GARIMPO_CONCURRENCY` | `4` | Coletas concorrentes, máximo 8. |
| `GARIMPO_JOB_TIMEOUT` | `180` | Tempo máximo por tentativa de execução, entre 15 e 900 segundos. |
| `GARIMPO_CACHE_TTL` | `86400` | Cache de descoberta, até 7 dias; 0 desativa. Páginas têm cache de no máximo 1 hora. |
| `GARIMPO_QUEUE_LIMIT` | `20` | Máximo de pesquisas pendentes ou em execução. |

Segredos ficam no processo Python. Nunca coloque `BRAVE_SEARCH_API_KEY` ou `GARIMPO_API_TOKEN` em variáveis `VITE_*`.

## API e integração

O módulo `garimpo.preview` oferece uma tela privada de teste com formulário, progresso, resultados, fontes e download do JSON. Ela usa sessão em cookie HttpOnly e mantém a chave da API no servidor. O acesso do navegador tem uma chave própria em `GARIMPO_PREVIEW_TOKEN`; ela é recebida pelo fragmento `#access=...` do link e removida da barra após autenticação. Não use a mesma chave da API. O preview deve apontar para um banco de testes separado.

Para executar localmente, configure `GARIMPO_PREVIEW_TOKEN` com pelo menos 32 caracteres aleatórios e inicie `python -m garimpo.preview`. O servidor usa `PORT` (padrão 8000). HTTPS é o padrão de segurança dos cookies; somente para teste local em HTTP, use `GARIMPO_PREVIEW_LOCAL_HTTP=1`. As sessões duram uma hora e encerram com o processo. Um preview em sandbox tem também a validade da sessão de hospedagem.

```bash
export GARIMPO_API_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
python -m garimpo serve --host 127.0.0.1 --port 8765
```

Use o mesmo token no terminal cliente. Em outro terminal, com `GARIMPO_API_TOKEN` configurado:

```bash
curl --fail-with-body http://127.0.0.1:8765/v1/searches \
  -H "Authorization: Bearer $GARIMPO_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: canoas-barbearias-teste-1' \
  -d '{"segment":"barbearias","city":"Canoas","state":"RS","provider":"osm","limit":25,"require_phone":true}'
```

Copie o `id` retornado. As rotas abaixo exigem o mesmo cabeçalho `Authorization`:

| Método e rota | Resultado |
| --- | --- |
| `GET /health` | Saúde do processo e do worker, sem autenticação. |
| `GET /v1/capabilities` | Fontes configuradas e categorias OSM disponíveis. |
| `POST /v1/searches` | Enfileira e retorna 202. Mesma chave de idempotência e parâmetros retornam a mesma pesquisa; parâmetros diferentes retornam 409. |
| `GET /v1/searches/{id}` | Estado, progresso, resultados e avisos. |
| `POST /v1/searches/{id}/cancel` | Cancela preservando resultados já salvos. |
| `GET /v1/searches/{id}/export` | JSON `CaptureDraft[]`, inclusive os resultados parciais já coletados. |

```bash
curl --fail-with-body http://127.0.0.1:8765/v1/searches/ID_DA_PESQUISA/export \
  -H "Authorization: Bearer $GARIMPO_API_TOKEN" \
  -o data/garimpo-resultados.json
```

Estados: `queued`, `running`, `completed`, `failed`, `cancelled`. Uma pesquisa `completed` pode conter avisos de descoberta parcial; o campo `partial` e `engine.partialSearch` identificam essa situação. POST exige `Content-Length` e corpo de no máximo 16 KiB; clientes HTTP comuns calculam esse cabeçalho automaticamente.

A integração atual usa a fila existente do CRM e o worker Python nativo de `deploy/local-garimpo`. O instalador prepara o pacote e o coletor Maps no Linux. Veja [INTEGRACAO-CRM.md](INTEGRACAO-CRM.md). A API REST deste pacote é uma forma de uso isolado, opcional para a integração por fila.

## Execução e recuperação

Também é possível usar Docker, a partir da raiz do CRM:

```bash
docker build -t realtalent-garimpo:local garimpo-engine
docker run --rm --name garimpo \
  -p 127.0.0.1:8765:8765 \
  --env GARIMPO_API_TOKEN \
  --env BRAVE_SEARCH_API_KEY \
  --mount type=volume,src=garimpo-data,dst=/data \
  realtalent-garimpo:local
```

Defina os tokens no terminal antes de executar. A imagem roda como usuário sem privilégios e mantém o banco no volume. Em ambientes com proxy TLS corporativo, o build aceita uma CA confiável via `docker build --secret id=pip_ca,src=/caminho/ca-bundle.pem ...`; não desative a verificação TLS.

- Uma instância de API, com um worker de pesquisas e concorrência controlada dentro de cada pesquisa. Não use múltiplos workers Uvicorn para aumentar volume nas fontes públicas.
- SQLite deve estar em disco/volume persistente local, com permissões restritas ao operador; não use compartilhamento NFS. Não é uma fila para vários servidores.
- O worker salva descoberta e cada empresa processada. Em desligamento normal, reencaminha a pesquisa para a fila. Após encerramento abrupto, o lease expira em até 45 segundos e a pesquisa é recuperada. Três encerramentos abruptos consecutivos levam a falha preservando os checkpoints.
- Cancelamento é persistente. Atualizações de um worker antigo são rejeitadas pelo identificador do lease.
- A API continua o trabalho se o cliente fechar a aba/conexão. Uma busca CLI depende do processo do terminal; pesquisas interrompidas serão retomadas quando a API iniciar usando o mesmo banco.
- Requisições às fontes têm intervalos mínimos e até três tentativas em falhas temporárias. `429` com espera longa vira erro explícito, sem insistência contínua. Sites com 403/429 ou regras de coleta restritivas ficam registrados como indisponíveis.
- A coleta respeita `robots.txt`, segue somente redirecionamentos no mesmo site, limita páginas, tamanho e tempo e impede acesso a IPs privados/metadados. DNS é fixado ao IP público validado, preservando Host/TLS. Sites exigem saída HTTPS direta; o coletor não usa proxy de ambiente para esses acessos. As APIs de descoberta podem usar o proxy do processo.
- O banco guarda contatos, resultados e cache localmente. Configure acesso, retenção e backups conforme a operação. Para limpar um banco de testes, pare o serviço e remova o diretório de dados de teste.

## Verificação e limites conhecidos

Os testes cobrem descoberta, paginação, limites, cache, extração, importação no CRM, cancelamento, recuperação, concorrência, isolamento de rede e autenticação. As respostas de provedores nos testes são controladas; isso permite testar falhas de forma repetível.

O ambiente de desenvolvimento desta entrega bloqueou as fontes externas com erro 403 de proxy. Os testes automatizados não demonstram cobertura real do OSM, cota válida do Brave ou precisão comercial. Valide com três buscas reais do seu mercado e revise uma amostra: empresa corresponde ao segmento/cidade, contato é comercial, dado tem fonte e duplicidades foram tratadas. Meça resultados úteis por busca, presença de telefone/e-mail, tempo e custo antes de aumentar volume.
