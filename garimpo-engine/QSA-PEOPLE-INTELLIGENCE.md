# RealTalent Intelligence — QSA e pessoas-chave (piloto RS)

## Entrega e limites

Esta branch adiciona **inteligência societária do CNPJ**, sem transformar um sócio automaticamente em responsável de compras. É uma camada opcional da Busca CNPJ + Revisão 2.0. O mecanismo Python de descoberta por Maps e sites continua independente. Nenhum conteúdo de cliente foi modificado em Production.

**Fontes oficiais:**
- https://www.gov.br/receitafederal/dados
- https://www.gov.br/receitafederal/dados/cnpj-metadados.pdf

**Somente os campos necessários do QSA:** raiz CNPJ, nome público, tipo de sócio (física, jurídica, estrangeira), código e descrição oficial de qualificação, data de entrada, competência e origem. **Nunca importar ou publicar CPF completo ou descaracterizado, identificadores de representantes legais, faixa etária, telefones pessoais, e-mails pessoais, ou inferência de poder de compra.** A função societária publicada não prova participação na decisão comercial, controle final ou propriedade integral.

## Fluxo oficial de importação, isolado da Production

1. Baixe **todos** os `Socios*.zip` e o domínio `Qualificacoes.zip` da **mesma competência** do `CSV` de empresas preparado pelo importador `garimpo.company_index_import`. O arquivo de entrada de sócios da Receita é um CSV sem cabeçalho codificado em Latin-1 com `;` como separador dentro de ZIP.
2. No terminal Linux, após preparar o CSV das empresas, execute (ajuste a competência para a dos arquivos):

```bash
PYTHONPATH=garimpo-engine python3 -m garimpo.qsa_import \
  --companies-csv ~/Downloads/realtalent-educacao-rs-piloto.csv \
  --socios ~/Downloads/cnpj-rfb/Socios*.zip \
  --qualificacoes ~/Downloads/cnpj-rfb/Qualificacoes.zip \
  --month 2026-10 \
  --output ~/Downloads/realtalent-qsa-rs-piloto.csv
```

3. Confira o relatório de totais, mês e avisos. O código só exporta sócios das **raízes** dos CNPJs no CSV empresarial; para matriz e filiais com a mesma raiz, as relações societárias se repetem como contexto da pessoa jurídica. **Não é uma consulta de proprietários individuais de filiais.**
4. Aplique `supabase/migrations/20261118093000_realtalent_company_index_rs.sql`, depois `supabase/migrations/20261118113000_realtalent_qsa_rs.sql` **somente no banco staging aprovado**.
5. Importe o CSV pela conexão administrativa de staging com `psql` (não usar chave de serviço no frontend):

```sql
\copy public.realtalent_company_qsa (
  cnpj_basic,partner_key,partner_name,partner_type,role_code,role_label,
  joined_on,source_month,source_url
) from '/CAMINHO/ABSOLUTO/realtalent-qsa-rs-piloto.csv'
with (format csv, header true);
```

6. Faça QA com os CNPJs das empresas no arquivo e valide nomes, qualificação, datas, a competência, RLS entre workspaces e a ausência de CPF. Atualizações mensais exigem rotina transacional de substituição do recorte/competência; o importador não modifica o banco nem elimina dados antigos por conta própria. A presença de um QSA no piloto não significa uma base nacional pronta.

## Uso no CRM

Em **Garimpo → Explorar empresas por CNPJ e CNAE → Mais filtros**, escolha **Com integrante identificado no QSA** para filtrar apenas empresas que têm vínculo no recorte QSA carregado. A opção padrão não altera as pesquisas existentes.

No **Garimpo → Empresas para revisar**, abra uma empresa pelo botão de conferência. Na seção **Sócios, administradores e pessoas-chave**, clique **Consultar QSA por CNPJ**. Os nomes societários aparecem com qualificação, natureza do vínculo, data de entrada e a fonte da Receita.

Na área distinta **Decisores e responsáveis profissionais**, um usuário autorizado pode registrar nome e cargo publicados em fonte institucional, URL e categoria escolhida pelo usuário. Esse registro permanece na ficha de revisão por workspace e não cria automaticamente contato, oportunidade ou lista de disparos. A marcação é **informada manualmente**, não uma confirmação automática pela IA.

Quando não aparecer ninguém no recorte carregado, a interface mostra **não encontrado neste recorte**, nunca “esta empresa não tem sócios”.

## Segurança, finalidade e validação

- O backend exige sessão, workspace e papel de membro administrativo/autorizado. A consulta de nomes só admite **um CNPJ completo e válido** por requisição. Não há pesquisa por nome de pessoa ou endpoint para extrair todos os sócios.
- A tabela tem **RLS** e somente linhas relacionadas ao índice de empresas do piloto; o RPC é **security invoker** com verificação de membership e CNPJ exato. O backend também reduz os campos retornados por lista de permissão, mesmo se um servidor SQL retornar campos não previstos.
- **Dados pessoais**: os nomes de pessoas físicas podem ser dados pessoais. Antes de comercializar, é necessária avaliação da finalidade, base legal, adequação, transparência, retenção, retificação e direitos dos titulares conforme LGPD e critérios aplicáveis da ANPD.
- A fonte da Receita indica o **conjunto de dados**, não uma validação individual em tempo real da ocupação ou do interesse comercial.
- **Sistemas de busca e IA não podem adivinhar um decisor de compras a partir do cargo societário.**

## Comandos de teste (sem dados de clientes)

```bash
PYTHONPATH=garimpo-engine python3 -m unittest discover -s garimpo-engine/tests -p 'test_qsa_import.py' -v
npm run typecheck
npm run build
```

A instalação de migrations, importação de dados reais e testes de UI autenticada de ponta a ponta são gates posteriores para staging, não etapas executadas automaticamente no PR.
