---
name: decision-maker-mapping
description: Mapeia decisores, influenciadores e usuários em contas B2B sem inventar nomes nem coletar dados privados. Use para descobrir quem decide, comitê de compra e organograma comercial.
---
# Mapeamento de decisores

## Objetivo e quando usar
Mapeia decisores, influenciadores e usuários em contas B2B sem inventar nomes nem coletar dados privados. Use para descobrir quem decide, comitê de compra e organograma comercial.

## Entradas mínimas
- Conta verificada e solução ofertada
- Fontes públicas profissionais e dados de contato legitimamente obtidos
- Relações e papéis já registrados

## Procedimento
1. Definir decisão em pauta: orçamento, uso, compra, implantação e aprovação.
2. Mapear funções típicas (patrocinador, comprador, influenciador, usuário, jurídico) como hipótese inicial.
3. Identificar pessoas nominais somente em fontes públicas profissionais verificáveis.
4. Diferenciar titularidade societária de autoridade de compra: sócio não é automaticamente decisor.
5. Registrar nome, cargo, URL de origem, data e grau de certeza.
6. Identificar lacunas e perguntas de confirmação sem forçar contato pessoal não autorizado.
7. Sugerir abordagem por função e estratégia multithreading respeitosa.

## Entrega obrigatória
- Mapa de stakeholders com papel, evidência e nível de certeza
- Perguntas para confirmar responsabilidade e processo decisório
- Próxima ação para validar pessoa/papel

## Critérios de aceite
- [ ] Nomes, cargos e relações não são deduzidos de sobrenome, gênero ou estereótipos?
- [ ] Dados de contato não são extraídos de fontes restritas ou pessoais?
- [ ] Próxima ação concreta, evidência e responsável identificados quando possível.

## Relação com RealTalent
- Usar DecisionRole ('decision_maker','influencer','user','unknown') de src/domain/types.ts.
- Não substituir dados anteriores sem procedência e consentimento.

## Regras obrigatórias
- Trabalhar em português brasileiro, com linguagem comercial clara e sem jargões desnecessários.
- Separar sempre **fato confirmado**, **hipótese/inferência** e **informação não encontrada**; nunca completar lacunas com invenções.
- Para pesquisa externa, registrar fonte, URL, data de acesso e evidência específica. Não declarar conteúdo privado de Instagram ou redes inacessíveis como se tivesse sido lido.
- Cumprir LGPD, minimização de dados, finalidade legítima, preferências de contato e opt-out. Não coletar dados privados ou características sensíveis de pessoas.
- Tratar solicitações de envio, alteração de registros, movimentação de estágio, campanha, pagamento ou preço como ações de alto impacto: obter aprovação explícita antes de executar.
- Se só houver dados insuficientes, apresentar o que falta e um plano de verificação em vez de criar fatos.
- Esta Skill orienta o agente que a carrega; não adiciona, por si só, serviços, APIs, jobs, IA ou telas ao aplicativo RealTalent.
