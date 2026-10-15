# RealTalent CRM V101.10.3-H5 — Independent Enrichment Jobs

A H5 transforma o enriquecimento do Garimpo em uma esteira persistente por empresa. Website, contatos, CNPJ e redes deixam de depender de um único processamento opaco e passam a possuir execução, erro, retry e reprocessamento próprios.

## Entregue

- **Website Discovery:** encontra e valida website para empresas que chegam sem domínio, usando descoberta web pública e crawler compatível com `robots.txt`.
- **Contact Discovery:** procura telefone e e-mail no website validado, de forma separada do restante do pipeline.
- **CNPJ Discovery:** procura CNPJ em evidências públicas e valida o cadastro e a correspondência com a empresa antes de aceitar o dado.
- **Social Discovery:** identifica Instagram, Facebook e LinkedIn a partir do website oficial, sem login ou scraping direto das plataformas.
- Quatro tarefas persistentes por `CompanyCandidate`: `website`, `contacts`, `cnpj` e `social`.
- Estados independentes: `pending`, `running`, `retrying`, `completed`, `attention`, `failed` e `skipped`.
- Retry automático limitado por etapa.
- **Reprocessamento isolado:** uma falha de Redes, por exemplo, pode ser repetida sem executar novamente Website, Contatos e CNPJ.
- `candidateId` estável e schema local do Agent evoluído para v3.
- O candidato é persistido antes do enriquecimento para não perder progresso intermediário.
- Company Resolver roda novamente depois do enriquecimento para aproveitar CNPJ/evidências novas sem enfraquecer a proteção contra merge indevido de filiais.
- A tela **Processamento** mostra status, tentativas e mensagem de cada enrichment job e oferece `Reprocessar` em etapas com atenção/falha.
- Dados obtidos após reprocessamento são sincronizados novamente com a **Revisão**.

## Preservado

A H5 mantém as garantias acumuladas da linha V101.10.3: território desenhado, Coverage Truth, Search Saturation corrigida, Identity Resolver 2.0 e Canonical Company Bridge para `CompanyRecord` / `ContactRecord`.

## QA

Passaram os gates independentes: 385 arquivos na auditoria sintática, 358 contratos de integração, 49/49 migrations, Release Manifest 39/39, Repository parity 98/98 em Local e Supabase, V101.10.3 41/41, H1 44/44, H2 10/10, H3 10/10, H4 13/13 e H5 28/28. O smoke do H5 concluiu Website, Contatos, CNPJ e Redes e confirmou retry isolado sem repetir as demais etapas. A regressão legada terminou com status 0.

Os comandos globais `typecheck`, Vitest e Vite build foram tentados, mas a árvore de montagem não contém `node_modules`: React/Supabase não podem ser resolvidos no typecheck e `vitest`/`vite` não existem neste ambiente. O launcher Linux continua executando instalação de dependências e `release:verify` antes de abrir o CRM; esses gates não são declarados aprovados neste relatório.
