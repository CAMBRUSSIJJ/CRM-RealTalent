# Garimpo no seu computador

O CRM envia pedidos a uma fila no Supabase. Este conector consulta a fila pela sua conexão de internet, usa o Firecrawl e um modelo no computador e devolve o resultado. Não abre um servidor público nem precisa de túnel ou VPS. O computador precisa ficar ligado, com os serviços e esta janela abertos durante a pesquisa.

## Linux com Docker e Ollama já instalados

1. Instale Node.js **22.18 ou superior** e Git, caso ainda não estejam disponíveis.
2. No CRM, abra **Garimpo → Busca → Configurar ou verificar meu Linux → Gerar garimpo.env**, usando uma conta administradora.
3. Salve `garimpo.env` nesta pasta, junto de `bridge.mjs`.
4. Abra um terminal nesta pasta e execute:

```sh
bash CONFIGURAR-LINUX.sh
```

Escolha o modelo de 3B já instalado e faça a primeira busca com **1 empresa — teste inicial**.

O configurador verifica Docker e Ollama, mostra os modelos instalados para você escolher, instala as dependências e prepara o Firecrawl oficial com SearXNG. Os arquivos privados recebem permissão 600 e os serviços de coleta ficam no próprio computador. A primeira compilação pode levar alguns minutos. Depois, mantenha a janela do conector aberta, confira **Linux conectado** no CRM e use **Buscar leads com Firecrawl**.

Em computadores com até 10 GiB de RAM, o configurador ativa o perfil econômico: modelos menores aparecem primeiro, as imagens são compiladas uma por vez e o coletor visita uma página por vez. O contexto da IA é reduzido preservando identidade e linhas de contato; o modelo local usado pelo conector é liberado ao terminar cada pesquisa. Outros modelos e serviços existentes não são interrompidos. As opções ficam registradas como `GARIMPO_MEMORY_PROFILE=low` e `GARIMPO_OLLAMA_RELEASE=true` no arquivo privado.

O perfil econômico inicia a configuração diretamente, sem bloquear pela quantidade de memória livre. O desempenho depende dos recursos disponíveis, do modelo e dos sites pesquisados. Para a primeira pesquisa, escolha **1 empresa — teste inicial**. Na configuração com modelos de 8B, 4B e 3B, comece pelo modelo de 3B já instalado.

Se `garimpo.env` estiver em outra pasta, informe o caminho: `bash CONFIGURAR-LINUX.sh /caminho/garimpo.env`. Para verificar Docker e Ollama sem instalar nem alterar arquivos, execute `bash CONFIGURAR-LINUX.sh --check`. Nenhum modelo é baixado automaticamente; escolha um modelo já instalado que suporte saída estruturada JSON Schema.

Se quiser preparar os componentes manualmente, siga as etapas abaixo.

## 1. Firecrawl

Instale **Docker Desktop** (incluindo Compose 2.24.4 ou superior) e Git. Use o projeto oficial:

```sh
git clone https://github.com/firecrawl/firecrawl.git firecrawl-garimpo
cd firecrawl-garimpo
git checkout 603d3ec4a7f7ef7e0b1c3e5c8ec5a514bca8e1b7
mkdir garimpo
```

Copie `compose.override.yaml` e `searxng-settings.yml` desta pasta para `firecrawl-garimpo/garimpo/`. Crie um `.env` privado na pasta `firecrawl-garimpo`, com `SEARXNG_SECRET` e `POSTGRES_PASSWORD` definidos com segredos aleatórios diferentes. Em seguida:

```sh
docker compose -f docker-compose.yaml -f garimpo/compose.override.yaml config --quiet
docker compose -f docker-compose.yaml -f garimpo/compose.override.yaml up -d --build
```

O Firecrawl fica em `http://127.0.0.1:3002`, acessível somente no próprio computador. O SearXNG fornece o mecanismo de busca. O Compose oficial reúne vários serviços e pode exigir bastante memória; confira os requisitos e a [documentação oficial](https://docs.firecrawl.dev/contributing/self-host). Não publique a porta 3002 na internet. O exemplo usa o código oficial e sua licença.

## 2. Modelo local

Instale o Ollama ou outro servidor compatível com OpenAI e JSON Schema. Instale um modelo que caiba na memória do seu computador. Use `ollama list` para ver o nome exato do modelo instalado; esse nome será preenchido no arquivo abaixo. O endereço padrão do Ollama é `http://127.0.0.1:11434/v1`. Esta integração não baixa um modelo automaticamente.

## 3. Conector

1. Instale **Node.js 22.18 ou superior**.
2. No CRM conectado ao Supabase, entre em **Garimpo → Busca → Configurar ou verificar meu Linux → Gerar garimpo.env** como administrador.
3. Salve o arquivo `garimpo.env` nesta pasta, junto de `bridge.mjs`. Ele autoriza somente este workspace; não compartilhe o arquivo.
4. Abra `garimpo.env` em um editor e preencha `PROSPECTING_AI_MODEL` com o nome exato do modelo instalado. Os endereços padrão já apontam para o computador.
5. No Windows, abra `INICIAR-WINDOWS.cmd`. No macOS/Linux, execute nesta pasta:

```sh
npm ci
npm start
```

6. Mantenha a janela aberta. No CRM, use a seção **Firecrawl no seu Linux**, informe o perfil e a região e clique em **Buscar leads com Firecrawl**. O conector pode levar alguns segundos para receber o pedido.

O arquivo é gerado uma única vez por conexão. Gerar outro revoga o anterior. Use **Desconectar computador** no CRM para revogar o acesso. Não é usada uma chave `service_role` no seu computador. O token do conector e o conteúdo dos sites não aparecem nos logs.

## Preparação do CRM

O banco precisa das tabelas e da função SQL de `schema.sql`, e das Edge Functions `prospecting-ai-search` (JWT ativo) e `prospecting-local-connector` (autenticação própria: JWT de usuário nas ações de configuração, token do workspace nas ações do computador). A fila separa os workspaces, usa reservas atômicas com prazo e rejeita resultados atrasados ou cancelados.

O navegador aguarda até nove minutos; a coleta local tem limite de 110 segundos por tentativa e três tentativas em caso de queda do conector. A busca não é periódica: cada clique cria uma pesquisa. O uso local dispensa APIs pagas de Firecrawl e IA quando ambos estão hospedados por você; os requisitos de hardware e as condições de uso das fontes continuam aplicáveis.
