---
name: conversation-intelligence
description: Analisa conversas comerciais transcritas de WhatsApp, e-mail e ligações para resumir necessidades, objeções, compromissos e riscos. Use para coaching comercial, classificação de intenção e respostas contextualizadas.
---
# Inteligência de conversas

## Objetivo e quando usar
Analisa conversas comerciais transcritas de WhatsApp, e-mail e ligações para resumir necessidades, objeções, compromissos e riscos. Use para coaching comercial, classificação de intenção e respostas contextualizadas.

## Entradas mínimas
- Conversa fornecida por usuário autorizado, idioma e participantes
- Janela temporal, canal e finalidade legítima
- Critérios para anonimizar, armazenar e limitar retenção

## Procedimento
1. Conferir permissão para analisar e minimizar dados; não exportar conteúdo sensível desnecessário.
2. Criar linha do tempo de fatos com participantes e timestamps se disponíveis.
3. Extrair falas-chave por trechos curtos e distinguir informação expressa de inferência.
4. Identificar necessidades, dúvidas, objeções, tom e oportunidades, sempre com evidência.
5. Apontar compromissos assumidos, responsáveis, prazo e risco de falta de próxima ação.
6. Propor até três respostas nos estilos solicitados, vinculadas ao contexto e sem promessas novas.
7. Solicitar revisão humana para envio, mudança de estágio ou criação de tarefa.

## Entrega obrigatória
- Resumo comercial, evidências e nível de confiança
- Objeções, sinais positivos/negativos e próximo passo
- Rascunho de resposta humanizada e alertas de privacidade

## Critérios de aceite
- [ ] Nenhum contexto ausente foi inventado como fala da pessoa?
- [ ] Conversas privadas não são reutilizadas para outra conta ou finalidade?
- [ ] Próxima ação concreta, evidência e responsável identificados quando possível.

## Relação com RealTalent
- Canal WhatsApp/WAHA pode ser fonte, mas esta Skill não se conecta nem envia mensagens sozinha.
- Registrar somente resumos necessários e permissões compatíveis com o CRM.

## Regras obrigatórias
- Trabalhar em português brasileiro, com linguagem comercial clara e sem jargões desnecessários.
- Separar sempre **fato confirmado**, **hipótese/inferência** e **informação não encontrada**; nunca completar lacunas com invenções.
- Para pesquisa externa, registrar fonte, URL, data de acesso e evidência específica. Não declarar conteúdo privado de Instagram ou redes inacessíveis como se tivesse sido lido.
- Cumprir LGPD, minimização de dados, finalidade legítima, preferências de contato e opt-out. Não coletar dados privados ou características sensíveis de pessoas.
- Tratar solicitações de envio, alteração de registros, movimentação de estágio, campanha, pagamento ou preço como ações de alto impacto: obter aprovação explícita antes de executar.
- Se só houver dados insuficientes, apresentar o que falta e um plano de verificação em vez de criar fatos.
- Esta Skill orienta o agente que a carrega; não adiciona, por si só, serviços, APIs, jobs, IA ou telas ao aplicativo RealTalent.
