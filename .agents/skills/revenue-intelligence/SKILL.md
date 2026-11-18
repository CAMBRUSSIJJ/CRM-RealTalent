---
name: revenue-intelligence
description: Analisa pipeline, previsão de receita, velocidade, taxas de conversão e gargalos com dados reais. Use para forecast, priorização de oportunidades, receita, metas e coaching de vendas.
---
# Inteligência de receita e pipeline

## Objetivo e quando usar
Analisa pipeline, previsão de receita, velocidade, taxas de conversão e gargalos com dados reais. Use para forecast, priorização de oportunidades, receita, metas e coaching de vendas.

## Entradas mínimas
- Exportação do pipeline com etapas, datas, valores e responsáveis
- Definições oficiais de ganho, perdido e receita reconhecida
- Período, moeda, fontes e regras de forecast

## Procedimento
1. Auditar data de criação, mudanças de estágio e integridade de oportunidades.
2. Separar pipeline bruto, ponderado, commit, best case, ganho e receita reconhecida.
3. Calcular taxas por coorte e estágio usando denominadores explícitos e janela temporal consistente.
4. Não usar média ingênua de ciclo em negócios abertos; declarar viés e limites.
5. Identificar vazamentos: lead sem responsável, sem próxima ação, envelhecimento e taxa de perda.
6. Priorizar ações por impacto potencial, probabilidade calibrada e esforço comercial.
7. Produzir forecast com cenários e intervalo de incerteza; não inventar probabilidades.

## Entrega obrigatória
- Scorecard de funil e fórmulas auditáveis
- Riscos, gargalos, oportunidades e ações por responsável
- Previsão por cenário, premissas e qualidade dos dados

## Critérios de aceite
- [ ] Receita prevista não foi confundida com faturamento realizado?
- [ ] O forecast informa incerteza, período e falta de dados?
- [ ] Próxima ação concreta, evidência e responsável identificados quando possível.

## Relação com RealTalent
- Respeitar ForecastCategory e RevenueStatus de src/domain/types.ts.
- Basear conclusões no pipeline e propostas reais; nenhum dado é alterado automaticamente.

## Regras obrigatórias
- Trabalhar em português brasileiro, com linguagem comercial clara e sem jargões desnecessários.
- Separar sempre **fato confirmado**, **hipótese/inferência** e **informação não encontrada**; nunca completar lacunas com invenções.
- Para pesquisa externa, registrar fonte, URL, data de acesso e evidência específica. Não declarar conteúdo privado de Instagram ou redes inacessíveis como se tivesse sido lido.
- Cumprir LGPD, minimização de dados, finalidade legítima, preferências de contato e opt-out. Não coletar dados privados ou características sensíveis de pessoas.
- Tratar solicitações de envio, alteração de registros, movimentação de estágio, campanha, pagamento ou preço como ações de alto impacto: obter aprovação explícita antes de executar.
- Se só houver dados insuficientes, apresentar o que falta e um plano de verificação em vez de criar fatos.
- Esta Skill orienta o agente que a carrega; não adiciona, por si só, serviços, APIs, jobs, IA ou telas ao aplicativo RealTalent.
