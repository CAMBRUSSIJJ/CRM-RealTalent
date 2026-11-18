---
name: prospecting-sales-intelligence
description: Investiga empresas e identifica oportunidades de prospecção B2B com fontes verificáveis, CNPJ, site, redes e sinais de compra. Use para garimpo, lead intelligence, pesquisa de contas e gatilhos comerciais.
---
# Inteligência comercial e garimpo

## Objetivo e quando usar
Investiga empresas e identifica oportunidades de prospecção B2B com fontes verificáveis, CNPJ, site, redes e sinais de compra. Use para garimpo, lead intelligence, pesquisa de contas e gatilhos comerciais.

## Entradas mínimas
- ICP, cidade, setor, número máximo de contas e janela temporal
- Fontes públicas autorizadas: site, Maps, CNPJ, vagas, notícias e redes acessíveis
- Campos obrigatórios e regras de deduplicação

## Procedimento
1. Pesquisar empresas pelo setor/geografia com consulta reproduzível; não usar IA para inventar resultados de busca.
2. Verificar identidade cruzando nome, domínio, CNPJ e localização; separar matriz, filial e homônimos.
3. Capturar apenas fatos públicos relevantes: oferta, posicionamento, tecnologia declarada e evidências recentes.
4. Registrar campo, URL, data, trecho de suporte e confiança; usar desconhecido se não houver confirmação.
5. Detectar sinais de compra: contratações, expansão, mudança de tecnologia e dor explicitamente declarada.
6. Checar duplicidade por CNPJ e depois domínio, telefone e nome/cidade; nunca fundir automaticamente casos duvidosos.
7. Gerar hipótese de valor e próxima ação comercial sem atribuir necessidade não comprovada.

## Entrega obrigatória
- Dossiê por empresa: identidade, fontes, sinais, lacunas e ação recomendada
- Status: encontrada, verificada, precisa de revisão ou descartada
- Motivos explícitos de fit e de não fit

## Critérios de aceite
- [ ] Todo decisor, preço, faturamento e gatilho tem fonte real ou aparece como desconhecido?
- [ ] Registros duvidosos permanecem em revisão, sem entrada automática no CRM?
- [ ] Próxima ação concreta, evidência e responsável identificados quando possível.

## Relação com RealTalent
- Considerar ProspectRecord em src/services/prospecting-workspace.ts: company, cnpj, instagram, website, rawData, duplicateLevel, status.
- Enviar para revisão humana antes de approved/sent; respeitar consentimento e privacidade.

## Regras obrigatórias
- Trabalhar em português brasileiro, com linguagem comercial clara e sem jargões desnecessários.
- Separar sempre **fato confirmado**, **hipótese/inferência** e **informação não encontrada**; nunca completar lacunas com invenções.
- Para pesquisa externa, registrar fonte, URL, data de acesso e evidência específica. Não declarar conteúdo privado de Instagram ou redes inacessíveis como se tivesse sido lido.
- Cumprir LGPD, minimização de dados, finalidade legítima, preferências de contato e opt-out. Não coletar dados privados ou características sensíveis de pessoas.
- Tratar solicitações de envio, alteração de registros, movimentação de estágio, campanha, pagamento ou preço como ações de alto impacto: obter aprovação explícita antes de executar.
- Se só houver dados insuficientes, apresentar o que falta e um plano de verificação em vez de criar fatos.
- Esta Skill orienta o agente que a carrega; não adiciona, por si só, serviços, APIs, jobs, IA ou telas ao aplicativo RealTalent.
