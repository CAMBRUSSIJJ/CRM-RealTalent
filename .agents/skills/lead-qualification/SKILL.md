---
name: lead-qualification
description: Qualifica leads com ICP, BANT, SPICED ou MEDDPICC e propõe priorização com evidências. Use para avaliação de fit, lead scoring, temperatura, SQL e próxima melhor ação.
---
# Qualificação e lead scoring

## Objetivo e quando usar
Qualifica leads com ICP, BANT, SPICED ou MEDDPICC e propõe priorização com evidências. Use para avaliação de fit, lead scoring, temperatura, SQL e próxima melhor ação.

## Entradas mínimas
- Dados do lead e estágio, ICP e definição de oportunidade
- Interações registradas e informação validada
- Modelo vigente de pontuação do CRM e regras comerciais

## Procedimento
1. Separar fit do perfil, intenção/atividade e potencial econômico; não misturar com urgência operacional.
2. Aplicar framework escolhido; distinguir pergunta não respondida de resposta negativa.
3. Construir matriz explícita: critério, peso, evidência, pontuação e lacuna.
4. Usar configuração atual de pontuação antes de sugerir pesos; não substituir números arbitrariamente.
5. Identificar bloqueadores: decisão, orçamento, risco, prazo, consentimento e impossibilidade de atendimento.
6. Propor próxima melhor ação com motivo, responsável e data, em vez de apenas 'lead quente'.
7. Registrar incerteza; não tratar score como probabilidade calibrada de conversão.

## Entrega obrigatória
- Ficha de qualificação: fit, intenção, potencial e gaps
- Pontuação explicada e próxima ação
- Questões que mudariam a decisão de priorização

## Critérios de aceite
- [ ] Pontuação reproduzível a partir de evidências observáveis?
- [ ] BANT/MEDDPICC não foi preenchido por suposição?
- [ ] Próxima ação concreta, evidência e responsável identificados quando possível.

## Relação com RealTalent
- Respeitar LeadScoringConfig, categorias profile/behavior/potential e thresholds em src/services/lead-scoring.ts.
- Temperatura e prioridade atuais são estados distintos; alterações dependem de aprovação.

## Regras obrigatórias
- Trabalhar em português brasileiro, com linguagem comercial clara e sem jargões desnecessários.
- Separar sempre **fato confirmado**, **hipótese/inferência** e **informação não encontrada**; nunca completar lacunas com invenções.
- Para pesquisa externa, registrar fonte, URL, data de acesso e evidência específica. Não declarar conteúdo privado de Instagram ou redes inacessíveis como se tivesse sido lido.
- Cumprir LGPD, minimização de dados, finalidade legítima, preferências de contato e opt-out. Não coletar dados privados ou características sensíveis de pessoas.
- Tratar solicitações de envio, alteração de registros, movimentação de estágio, campanha, pagamento ou preço como ações de alto impacto: obter aprovação explícita antes de executar.
- Se só houver dados insuficientes, apresentar o que falta e um plano de verificação em vez de criar fatos.
- Esta Skill orienta o agente que a carrega; não adiciona, por si só, serviços, APIs, jobs, IA ou telas ao aplicativo RealTalent.
