export const semanticSalesLanguageInfo = {
  version: '3.1.5',
  architecture: 'semantic-sales-language-engine',
  stages: ['semantic_intent','structured_extraction','context_resolution','entity_resolution','ambiguity','confidence','tool_planning'],
  confidence: { execute: 0.78, clarify: 0.55 },
}

export const semanticSalesLanguageSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    version: { type: 'string' },
    language: { type: 'string', enum: ['pt', 'en', 'es', 'other'] },
    intent: { type: 'string', enum: [
      'best_contacts','call_now','risk_deals','stale_deals','proposal_followup','missing_decision_maker','forecast','priorities',
      'prepare_call','next_action','activity_summary','suggest_message','meeting_summary','create_task','create_followups','complete_task','unknown',
    ] },
    object: { type: 'string', enum: ['contact','lead','opportunity','proposal','task','calendar','pipeline','communication','none'] },
    action: { type: 'string', enum: ['read','rank','create','complete','draft','analyze','none'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    needs_clarification: { type: 'boolean' },
    clarification: { type: 'string' },
    canonical_request: { type: 'string' },
    rationale: { type: 'string' },
    entities: {
      type: 'object', additionalProperties: false,
      properties: {
        contact_query: { type: 'string' },
        assignee_query: { type: 'string' },
        task_title: { type: 'string' },
        due_at_iso: { type: 'string' },
        explicit_time: { type: 'boolean' },
        task_type: { type: 'string', enum: ['call','generic','none'] },
        criteria: { type: 'array', maxItems: 8, items: { type: 'string', enum: ['sales_score','deal_value','temperature','priority','potential','activity_gap','close_probability'] } },
        reference: { type: 'string' },
      },
      required: ['contact_query','assignee_query','task_title','due_at_iso','explicit_time','task_type','criteria','reference'],
    },
  },
  required: ['version','language','intent','object','action','confidence','needs_clarification','clarification','canonical_request','rationale','entities'],
}

export const semanticSalesLanguageInstructions = `Você é o Semantic Sales Language Engine V3.1.5 do RealTalent CRM. Sua única função é INTERPRETAR a última frase do usuário e devolver intenção + entidades em JSON estruturado. Você não responde ao usuário, não executa ferramentas e não inventa dados do CRM.

OBJETIVO CENTRAL
Entenda SIGNIFICADO, não frases exatas. O usuário não precisa conhecer comandos, nomes de tools ou a terminologia interna do CRM. Tolere português informal, abreviações, pequenos erros de digitação e equivalentes em inglês/espanhol.

INTENÇÕES CANÔNICAS
- best_contacts: priorizar/rankear contatos ou leads por qualidade, chance, potencial ou prioridade. Exemplos semânticos: quem está quente; quem vale atacar; quem tem mais chance; melhores contatos.
- call_now: decidir quem deve receber ligação agora/próximo.
- risk_deals: negócios/oportunidades com risco de perda.
- stale_deals: negócios parados, frios, sem movimento/interação.
- proposal_followup: propostas aguardando resposta/retorno.
- missing_decision_maker: negócios sem decisor/economic buyer.
- forecast: previsão, commit, best case, cobertura, quanto pode fechar.
- priorities: prioridades comerciais gerais / o que fazer agora/hoje.
- prepare_call: briefing/preparo para uma ligação específica.
- next_action: próxima melhor ação para um registro específico.
- activity_summary: histórico/interações de um registro.
- suggest_message: rascunho de mensagem contextual; não enviar.
- meeting_summary: resumo da reunião mais recente.
- create_task: pedido para registrar algo que precisa ser feito em data/horário, inclusive quando a palavra tarefa NÃO aparece. “não deixa eu esquecer de falar com a Camila amanhã”, “deixa marcado pra retornar sexta”, “bota aí que preciso ligar depois do almoço” são create_task.
- create_followups: follow-up explícito/comercial a criar.
- complete_task: marcar uma tarefa existente como concluída.
- unknown: conversa geral ou pedido que não corresponde com segurança às capacidades acima.

REGRAS DE EXTRAÇÃO
1. Use current_route, focusLeadId/focusProposalId e conversation_context para resolver “ele”, “ela”, “esse cliente”, “o primeiro”, “o que eu estava vendo”. Se a referência já está resolvida pelo contexto, entities.reference deve indicar isso de forma curta; não invente IDs.
2. Para create_task, extraia task_title, contact_query, assignee_query, due_at_iso e task_type. Se houver horário explícito, explicit_time=true. due_at_iso deve ser ISO-8601 com offset quando puder ser resolvido a partir de now/timezone.
3. “depois do almoço” e outros períodos vagos NÃO viram horário exato inventado. Nesse caso due_at_iso pode conter apenas data ISO às 12:00? NÃO. Deixe vazio e peça clarificação do horário quando a agenda exigir precisão.
4. Normalize critérios comerciais SOMENTE para: sales_score, deal_value, temperature, priority, potential, activity_gap, close_probability. Se “melhores” ou “vale a pena” vier sem critério, NÃO peça clarificação: best_contacts usa sales_score. Se o usuário disser “mais quente”, use temperature; “vale mais dinheiro/maior valor”, use deal_value; “mais chance de fechar”, use close_probability/potential.
5. needs_clarification=true somente quando falta algo indispensável para executar com segurança ou há referência realmente ambígua. clarification deve ser uma pergunta curta em português do Brasil. Caso contrário, clarification="".
6. confidence mede a confiança na interpretação, não a chance de negócio. >=0.78 pode ser roteado automaticamente; 0.55–0.77 deve ser tratado com cautela; abaixo de 0.55 use unknown ou clarificação.
7. Não transforme uma pergunta de leitura em escrita. Não trate “quem devo ligar?” como create_task.
8. Não produza nomes de tools, comandos internos, código ou instruções de API.
9. Não invente contato, responsável, data, horário, score, estágio ou oportunidade.
10. canonical_request deve ser uma paráfrase curta e normalizada do que o usuário quis dizer, em português do Brasil.
11. rationale deve explicar em uma frase curta por que a intenção foi escolhida, sem cadeia de pensamento.
12. Responda SOMENTE no schema solicitado.`

const safeText = (value, max = 180) => String(value ?? '').trim().slice(0, max)

export function normalizeSemanticSalesInterpretation(value = {}) {
  const allowed = new Set(semanticSalesLanguageSchema.properties.intent.enum)
  const entities = value?.entities && typeof value.entities === 'object' ? value.entities : {}
  const confidence = Number(value?.confidence)
  return {
    version: '3.1.5',
    language: ['pt','en','es','other'].includes(value?.language) ? value.language : 'other',
    intent: allowed.has(value?.intent) ? value.intent : 'unknown',
    object: semanticSalesLanguageSchema.properties.object.enum.includes(value?.object) ? value.object : 'none',
    action: semanticSalesLanguageSchema.properties.action.enum.includes(value?.action) ? value.action : 'none',
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    needs_clarification: Boolean(value?.needs_clarification),
    clarification: safeText(value?.clarification, 320),
    canonical_request: safeText(value?.canonical_request, 500),
    rationale: safeText(value?.rationale, 500),
    entities: {
      contact_query: safeText(entities.contact_query),
      assignee_query: safeText(entities.assignee_query),
      task_title: safeText(entities.task_title, 240),
      due_at_iso: safeText(entities.due_at_iso, 80),
      explicit_time: Boolean(entities.explicit_time),
      task_type: ['call','generic','none'].includes(entities.task_type) ? entities.task_type : 'none',
      criteria: Array.isArray(entities.criteria) ? entities.criteria.map((item) => safeText(item, 80)).filter((item) => ['sales_score','deal_value','temperature','priority','potential','activity_gap','close_probability'].includes(item)).slice(0, 8) : [],
      reference: safeText(entities.reference),
    },
  }
}

export function semanticDecision(value) {
  const interpretation = normalizeSemanticSalesInterpretation(value)
  if (interpretation.needs_clarification && interpretation.confidence >= semanticSalesLanguageInfo.confidence.clarify) return 'clarify'
  if (interpretation.intent !== 'unknown' && interpretation.confidence >= semanticSalesLanguageInfo.confidence.execute) return 'execute'
  return 'fallback'
}
