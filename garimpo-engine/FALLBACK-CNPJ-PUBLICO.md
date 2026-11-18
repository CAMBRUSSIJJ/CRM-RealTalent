# Garimpo — recuperação de CNPJ sem índice local instalado

## Problema diagnosticado em 18/11/2026

Na tela `#/prospecting`, a empresa **Alpha Barbearia em Rio Grande** retornou:
> O índice CNPJ ainda não está instalado nesta versão.

O botão estava correto. Consultamos os metadados do projeto Supabase ativo e confirmamos: `public.realtalent_company_index`, a função de pesquisa e `realtalent_internal.realtalent_company_qsa` **não estão instalados**. Também não existe branch de staging neste projeto. **Este PR não altera o projeto de Production, não instala migrations e não importa bases de clientes.**

## Resolução sem banco extra nem API paga

O motor mantém dois modos, em ordem:

1. **Índice próprio Receita Federal (preferido):** `/rest/v1/rpc/realtalent_company_index_search` com autenticação por workspace e filtros de município/UF. É o caminho para filtros comerciais de grande volume, pesquisa CNAE, paginação e atualização mensal. **Requer carga oficial em staging antes de ser habilitado.**
2. **Consulta individual pública alternativa:** somente quando a RPC do índice não existe (por exemplo, `PGRST202`), consultar `GET https://www.datastone.com.br/consulta/api/v1/busca?q=<nome>`. Essa API é gratuita, dispensa chave e documenta uso comercial **com atribuição ao fornecedor**. Limites publicados: 60 requisições/minuto/IP, sem SLA, 10 resultados por nome, cache do fornecedor de 24h. O usuário deve aceitar a diferença de cobertura, atualidade e disponibilidade. Fonte: https://www.datastone.com.br/consulta/api-publica.

A segunda fonte é para **uma empresa por vez**, não enumeração de CNPJs, disparos em massa, leitura irrestrita de sócios ou substituição do índice próprio.

### Como funciona

1. Em Garimpo → Empresas para revisar, abra um registro sem CNPJ e clique **Investigar empresa**.
2. O backend envia **somente o nome normalizado** à API pública. Se o Maps retornou `Alpha Barbearia em Rio Grande`, o parser remove o sufixo `em Rio Grande` porque coincide exatamente com o município da ficha, ficando `alpha barbearia`.
3. A resposta é normalizada e **filtrada em Python para o mesmo município e UF**. CNPJs inválidos são descartados; homônimos, filiais e registros incertos permanecem separados. A interface mostra a fonte e o endereço público de origem.
4. O usuário **confirma o CNPJ**. Nenhuma empresa é vinculada automaticamente e não há inferência de titularidade de domínio, endereço exato ou telefone.
5. O botão de QSA tenta primeiro o índice próprio. Se ele não existe, `GET https://www.datastone.com.br/consulta/api/v1/empresa/{cnpj}` recupera os vínculos societários publicados na ficha gratuita. A resposta do RealTalent permite **somente nome, qualificação quando publicada e origem**; documentos de identificação, idade e dados de contato privados não são retornados. Não atribui poder de compra.
6. Se a fonte externa falhar, atingir o limite ou não encontrar uma empresa compatível, o sistema **não inventa dados**. Informa a indisponibilidade ou a ausência de correspondência. O CNPJ manual (validado por dígitos) continua disponível, rotulado como ainda não corroborado.

### Segurança e transparência

- Consulta autenticada, papel de escrita e workspace verificados **antes** de chamar a fonte externa.
- Sem transmissão de dados de CRM, telefone, e-mail, endereço, token JWT ou PII para o fornecedor. O request externo `GET /busca` contém somente o nome comercial informado no Maps. Na consulta ao QSA contém somente CNPJ validado.
- `httpx` recebe exclusivamente URL fixa HTTPS e `follow_redirects=False`; tempo limite de 7s; sem chave; resposta máxima de 512 KB para busca e 1 MB para ficha; uma requisição upstream por operação; até 10 CNPJs lidos e até 50 vínculos societários.
- Links de proveniência passam por allowlist de domínio e caminho. Exige **atribuição** “Fonte: Consulta Data Stone” com link da ficha pública (ou página da consulta).
- Não converte dado sem fonte em 'validado'. A nota de similaridade é heurística, **não probabilidade de titularidade**.
- O esquema de cadastro próprio e o RLS **não foram modificados**. Para escalar de modo comercial, trate o serviço externo como contingência e priorize sua própria ingestão oficial.
- Nomes de sócios PF são dados pessoais: LGPD exige avaliação de finalidade, necessidade, transparência, retenção e direitos dos titulares antes da oferta comercial.

## Validação

```bash
PYTHONPATH=garimpo-engine python -m unittest discover -s garimpo-engine/tests -p 'test_identity.py' -v
PYTHONPATH=garimpo-engine python -m unittest discover -s garimpo-engine/tests -p 'test_public_company_lookup.py' -v
npm run typecheck
npm run build
```

**Os testes usam respostas simuladas do fornecedor.** Uma execução ao vivo no Vercel Preview, autenticada, continua necessária para verificar disponibilidade da API externa, cobertura e as informações reais da Alpha Barbearia. O ambiente que compila esta branch pode não ser o mesmo backend efetivamente configurado no Vercel.

## Atenção ao Preview

Depois do QA automático e do deploy do branch, verifique no navegador a versão da rota `/api/garimpo/companies/identify`. Se continuar mostrando somente `O índice CNPJ ainda não está instalado`, o serviço Python do Preview ainda está em uma versão anterior ou o deploy não foi concluído. A correção exige publicar o serviço `garimpo`, **não aplicar migração em Production**.

A busca avançada com filtros de CNAE, matriz/filial e paginação continua dependendo do índice próprio da Receita Federal instalado com dados reais em um banco de teste.
