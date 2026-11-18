# RealTalent Intelligence — identificação de CNPJ a partir de empresas do Garimpo

## Cenário que esta atualização corrige

Em registros vindos do Maps, como uma barbearia encontrada por nome e município, os botões **Revisar novamente** e **Consultar QSA** ficavam desativados quando o prospect não tinha CNPJ nem website. Agora a ficha oferece a ação **Investigar empresa**.

1. O frontend chama `POST /api/garimpo/companies/identify` com **nome da empresa + cidade + UF RS**; o endereço é contexto, mas não consta no índice cadastral e **não deve ser declarado como verificado**.
2. O Python consulta o índice oficial preparado pelos arquivos da Receita Federal, filtrando por **município e nome**, e retorna até 7 CNPJs candidatos. A classificação é heurística e explicada, **não é probabilidade de identidade nem vinculação automática**. Homônimos e filiais são exibidos separadamente.
3. O usuário **confirma explicitamente** o CNPJ correspondente. A ficha mantém o nome comercial, telefone, fonte e etapa existentes, registrando o critério e a competência da base em `rawData.identityMatch`.
4. O módulo **Pessoas-chave** consulta o QSA automaticamente depois do vínculo confirmado (se o QSA estiver instalado e carregado). Integrantes societários não são apresentados como decisores comerciais.
5. Caso a base não esteja carregada, a interface explica que não foi possível consultar o índice e oferece a opção **CNPJ informado manualmente**, com validação local dos dígitos, rotulada como não corroborada.
6. Para prospect já enviado ao CRM, a confirmação exige permissão de atualização empresarial, vínculo persistido com a empresa original e inexistência de CNPJ conflitante. Nenhum outro dado de contato é sobrescrito.

## Interface simplificada

- Seção **Investigar empresa**, antes do histórico e QSA.
- Quadro **Histórico de revisões** recolhido quando não existem alterações pendentes.
- Quadro **Sócios e pessoas-chave** recolhido quando não há dados relevantes.
- Formulário **Adicionar pessoa-chave** só aparece após o usuário clicar na opção.
- Site institucional continua sendo conferido pela Revisão 2.0 quando um endereço oficial foi encontrado. **Esta mudança ainda não cria um provedor independente de descoberta de domínio sem API paga**; site ausente continua sem verificação, em vez de receber uma URL inventada.

## Ambiente necessário para dados reais

- A migration `20261118093000_realtalent_company_index_rs.sql` e a carga dos arquivos Empresas/Estabelecimentos/Municípios do RS precisam existir no banco do **serviço Preview**, separadamente da Production.
- A migration `20261118113000_realtalent_qsa_rs.sql` e a carga Sócios/Qualificações da **mesma competência** são necessárias para retornar nomes de sócios.
- O Vercel configura o serviço `garimpo` no `vercel.json`; é preciso validar a rota da nova API com sessão de um usuário autorizado e conferir ambiente de banco/Supabase associado. O índice ainda não foi carregado por esta branch.
- Ao testar uma empresa sem CNPJ, compare **todas** as alternativas com razão social, nome fantasia, localidade e, fora do índice, endereço e dados da fonte original antes de confirmar.
- Nomes do QSA são dados pessoais quando representam pessoa física. Revise finalidade, base legal, retenção e atendimento aos direitos da LGPD antes de disponibilização comercial.

## Testes automatizados

```bash
PYTHONPATH=garimpo-engine python3 -m unittest discover -s garimpo-engine/tests -p 'test_identity.py' -v
npm run typecheck
npx vitest run src/features/garimpo/company-identity.test.ts
npm run build
```

Os testes de contrato usam registros fictícios; não significam que empresas reais foram localizadas ou que os dados do QSA foram carregados. Não houve alteração de Production.
