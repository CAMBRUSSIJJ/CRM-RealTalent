# RealTalent Intelligence — piloto CNPJ / CNAE (RS)

Esta é a **primeira etapa implementada** do índice empresarial separado da busca por Maps. O motor de descoberta Python 0.6 e os dados existentes são preservados. Esta branch não executa importações nem migrations no Supabase de produção.

## Entregas incluídas

- Importador Python da base aberta mensal do CNPJ (Receita Federal), com leitura streaming de CSV/ZIP em Latin-1, junção por CNPJ básico com o arquivo de Empresas e resolução de municípios pelo dicionário **da Receita** (não pelo IBGE).
- Recorte RS por município, CNAE principal **ou secundário**, situação cadastral (ativa por padrão) e quantidade limitada opcionalmente para QA.
- CSV pronto para `COPY` no PostgreSQL, sem telefones, e-mails nem nomes de sócios; origem e competência documentadas.
- Nova tabela e consulta SQL com verificação de associação ao workspace, RLS, paginação estável, pesquisa por razão social/nome fantasia/CNPJ e CNAE de 2 a 7 dígitos.
- Endpoint Python autenticado `GET /api/garimpo/index` com limites e respostas controladas.
- Explorador CNPJ/CNAE na tela do Garimpo: filtros, paginação, seleção e **importação para Revisar**, com deduplicação por CNPJ, origem cadastral preservada e envio posterior ao CRM usando a revisão já existente.
- Testes de contrato, importação e revisão.

## Fonte oficial e integridade

Documentação de campos: https://www.gov.br/receitafederal/dados/cnpj-metadados.pdf

Portal de dados da Receita: https://www.gov.br/receitafederal/dados

Use arquivos `Estabelecimentos*.zip`, `Empresas*.zip` e `Municipios.zip` da **mesma competência**. A Receita distribui arquivos grandes e particionados. Os arquivos de Estabelecimentos são lidos sequencialmente, sem supor que o nome interno termina em .csv. O mapa de municípios é **o arquivo da própria Receita** (código de quatro dígitos). O CSV exportado não contém contatos pessoais. A origem por registro indica o **conjunto cadastral**; não é prova individual de telefone ativo, site, decisor ou intenção de compra.

## Gerar o primeiro recorte de educação do RS

No diretório do projeto, após baixar os ZIPs oficiais para uma pasta local e instalar o pacote Python do motor:

```bash
PYTHONPATH=garimpo-engine python3 -m garimpo.company_index_import \
  --estabelecimentos ~/Downloads/cnpj-rfb/Estabelecimentos*.zip \
  --empresas ~/Downloads/cnpj-rfb/Empresas*.zip \
  --municipios ~/Downloads/cnpj-rfb/Municipios.zip \
  --month 2026-10 \
  --cnae-prefix 85 \
  --max-records 10000 \
  --output ~/Downloads/realtalent-educacao-rs-piloto.csv
```

**Ajuste a competência** para o mês dos ZIPs efetivamente baixados. O limite `--max-records 10000` cria uma **amostra incompleta**; não permite afirmar que existem apenas 10.000 empresas. Com `--max-records 0`, o motor percorre todos os estabelecimentos informados; só há cobertura estadual plena quando **todos os arquivos da competência** forem processados. Para mais CNAEs, omita `--cnae-prefix`. A leitura de todas as empresas nacionais é necessária para resolver as razões sociais das raízes selecionadas. Prepare espaço em disco e tempo de processamento; não execute ingestão nacional dentro de uma requisição Vercel.

Para um arquivo de teste reproduzível sem dados reais:

```bash
PYTHONPATH=garimpo-engine python3 -m unittest discover \
  -s garimpo-engine/tests -p 'test_company_index.py' -v
```

## Habilitar no ambiente de testes, nunca automaticamente na Production

1. Aplicar no **banco Preview/staging aprovado** a migration `supabase/migrations/20261118093000_realtalent_company_index_rs.sql` após revisar permissões e o relatório de segurança. Não aplicar na base de Production para validar esta branch.
2. Importar o CSV com uma conexão PostgreSQL **administrativa temporária de staging**, nunca com chave de serviço no navegador ou no frontend. Exemplo de `psql` local com `PREVIEW_DATABASE_URL` configurada por meio seguro:

```sql
\copy public.realtalent_company_index (
  cnpj,legal_name,trade_name,name_search,uf,municipality_code,city,
  city_search,main_cnae,secondary_cnaes,status,opened_on,
  headquarters,source_month,source_url
) from '/caminho/para/realtalent-educacao-rs-piloto.csv' with (format csv, header true);
```

3. Conferir em staging a quantidade importada, amostra de CNPJs, município/código Receita, filtro CNAE secundário, RLS de workspace, quantidade e paginação. Uma consulta sem nenhuma linha significa *base ainda vazia ou filtro sem resultado*, não inexistência de empresas.
4. Abrir o Preview do CRM, acessar **Garimpo → Explorar empresas por CNPJ e CNAE**, pesquisar `85` e uma cidade do RS, selecionar empresas e clicar **Adicionar à revisão**. Conferir fonte, CNPJ, duplicações e permissões antes de enviar uma empresa ao CRM.
5. Rodar `npm run typecheck`, `npx vitest run src/features/garimpo/review.test.ts` e `npm run build`; validar manualmente navegação com usuário autenticado no Preview.

**Importação e migração não são disparadas pela interface.** O endpoint informa quando a função RPC não está instalada. A busca por Maps continua como estava para não interromper o fluxo atual.

## Escopo do piloto versus próximos incrementos

**Incluído:** pesquisa cadastral, cidade/UF RS, prefixo CNAE principal/secundário, nome/CNPJ, situação ativa, fonte, competência e passagem para revisão/CRM.

**Não incluído ainda:** carga automática mensal, versão nacional, telefone/e-mail enriquecidos por CNPJ, comparação histórica, decisores, score de intenção, lookalike, preços de terceiros, monitoramento de eventos, ou execução da migration/importação real. Esses recursos exigem novas fontes, avaliação legal, testes de dados e orçamento de infraestrutura.

A solução respeita a separação entre cadastro empresarial público e fontes de contato. Qualquer funcionalidade de contatos pessoais ou distribuição comercial deve passar por revisão de LGPD e licença antes do lançamento.
