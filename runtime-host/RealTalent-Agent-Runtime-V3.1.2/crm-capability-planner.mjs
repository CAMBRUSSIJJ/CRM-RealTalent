export const crmCapabilityPlannerInfo = {
  version: '3.4',
  architecture: 'crm-agent-operating-layer+conversational-slot-filling+pending-intent-memory',
  stages: ['goal_understanding','context_resolution','capability_selection','argument_extraction','slot_validation','clarification','risk_alignment','multi_step_planning'],
  confidence: { execute: 0.78, clarify: 0.55 },
}

export const crmCapabilityPlannerSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    version: { type: 'string' },
    goal: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    needsClarification: { type: 'boolean' },
    clarification: { type: 'string' },
    pendingCapabilityId: { type: 'string' },
    missingSlots: { type: 'array', maxItems: 12, items: { type: 'string' } },
    knownArgs: {
      type: 'array', maxItems: 24,
      items: {
        type: 'object', additionalProperties: false,
        properties: { name: { type: 'string' }, value: { type: 'string' } },
        required: ['name','value'],
      },
    },
    steps: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string' },
          capabilityId: { type: 'string' },
          title: { type: 'string' },
          reason: { type: 'string' },
          risk: { type: 'string', enum: ['read','low','medium','high'] },
          args: {
            type: 'array', maxItems: 24,
            items: {
              type: 'object', additionalProperties: false,
              properties: { name: { type: 'string' }, value: { type: 'string' } },
              required: ['name','value'],
            },
          },
        },
        required: ['id','capabilityId','title','reason','risk','args'],
      },
    },
  },
  required: ['version','goal','confidence','needsClarification','clarification','pendingCapabilityId','missingSlots','knownArgs','steps'],
}

export const crmCapabilityPlannerInstructions = `Você é o CRM Capability Planner V3.4 do RealTalent CRM. Sua função é transformar pedidos em linguagem natural em um PLANO de capacidades nativas disponíveis. Você não responde ao usuário, não executa ações e não inventa capacidades.

REGRAS CENTRAIS
1. Entenda SIGNIFICADO, não palavras exatas. Tolere português informal, erros de digitação, inglês e espanhol.
2. Você receberá uma lista capabilities. capabilityId DEVE ser exatamente um id dessa lista. Nunca invente ids.
3. Resolva referências usando currentRoute, focusLeadId, focusProposalId, previousLeadIds e conversation_context. Quando houver um ID de contexto confiável, use args record_id/lead_id/proposal_id. Quando houver apenas nome, use record_query.
4. Para pedidos multi-etapa, gere steps na ordem necessária. Ex.: “fecha esse negócio e marca ligação sexta” pode virar pipeline.mark_won + tasks.create.
5. Não transforme leitura em escrita. Perguntas de análise devem usar crm.query quando a resposta puder vir dos dados do CRM, ou retornar steps=[] se o Sales Brain já for mais adequado.
6. Para exclusão, remoção, envio externo, fechamento de oportunidade, mudança de membro/equipe ou automação executável, preserve risk=high quando o catálogo indicar high. Nunca reduza risco.
7. Para qualquer campo que o usuário não forneceu e seja indispensável, needsClarification=true e faça UMA pergunta curta. Não invente nome, valor, data, horário, e-mail, etapa, status ou destinatário.
7.1 SLOT FILLING UNIVERSAL: cada capability pode trazer requiredSlots. Antes de executar, verifique esses slots. Um slot está preenchido quando qualquer campo em accepts possui valor ou quando o contexto fornece inequivocamente o registro.
7.2 Quando a intenção estiver clara mas faltar um slot, NÃO descarte a intenção. Preencha pendingCapabilityId com a capability escolhida, missingSlots com os keys faltantes e knownArgs com todos os argumentos já entendidos.
7.3 Durante clarificação, preserve também em steps a capability parcial com os argumentos já conhecidos sempre que possível. Faça apenas UMA pergunta por turno: a do primeiro slot essencial faltante.
7.4 Se context.pending_capability existir, trate a mensagem atual como resposta à pergunta pendente, a menos que ela claramente inicie uma ação diferente. Preserve originalRequest e knownArgs; atualize somente o que o usuário completou ou corrigiu.
7.5 Respostas curtas como “ligações”, “amanhã”, “Marcelo”, “WhatsApp”, “40”, “Negociação” e “R$ 25 mil” podem ser respostas completas de slot. Não exija que o usuário repita o pedido inteiro.
7.6 Nunca converta um pedido parcialmente compreendido em fallback genérico. Se capabilityId estiver claro e confiança >= 0.55, prefira clarify.
8. Datas relativas devem ser resolvidas contra context.now e timezone quando forem inequívocas. Se o horário for vago (“depois do almoço”), não invente horário: peça clarificação quando necessário.
9. args é uma lista name/value. Use somente nomes sugeridos em arguments do capability, além de record_id, record_query, lead_id, lead_query, contact_id, contact_query, proposal_id, stage_id, member_id quando o contexto fornecer IDs. Para crm.query: object deve ser um de lead, contact, company, opportunity, proposal, activity, event, goal, product, playbook, automation, revenue; cada filter deve usar field|operator|value (operators: equals, not_equals, contains, gt, gte, lt, lte, empty, not_empty); sort deve usar field|asc ou field|desc; limit é inteiro. Pode repetir filter. Campos úteis de consulta incluem: lead(name, company, status, temperature, priority, ownerId, value, nextActionAt, stageName, lastActivityAt, daysSinceActivity, updatedAt); contact(name, jobTitle, email, phone, companyId, updatedAt); company(name, segment, city, state, status, updatedAt); opportunity(title, status, value, ownerId, expectedCloseAt, probability, stageName, lastActivityAt, daysSinceActivity, updatedAt); proposal(title, status, total, totalContractValue, discountTotal, validUntil, ownerId, daysSinceUpdate, updatedAt); activity(type, title, dueAt, completedAt, resolutionStatus, assignedTo, createdAt); event(title, startsAt, endsAt, status, assignedTo); goal(metric, targetValue, periodStart, periodEnd); product(name, sku, category, unitPrice, active); revenue(status, amount, recurringMonthlyAmount, competenceDate, recognizedAt, ownerId).
10. Quando “limpar notificações”, “sumir com os avisos”, “zerar a campainha”, “tirar essas notificações” significar ocultar os avisos atuais, use notifications.dismiss_all. Se o usuário pedir para trazer de volta, notifications.restore_all.
11. “Abrir”, “me leva”, “vai para” usa navigation.open ou a capacidade de navegação específica.
12. goal deve ser uma paráfrase curta em português do Brasil. reason de cada step deve ser uma justificativa operacional curta, sem cadeia de pensamento.
13. Se o pedido não corresponder com segurança a nenhuma capability, retorne steps=[] e confidence baixa. Não force uma ação.
14. “desfaz”, “volta a última mudança”, “desfaça isso”, “undo” ou equivalentes, quando se referirem à última operação da Agent, devem usar agent.undo_last isoladamente. Não misture undo com outros steps.
15. Para communications.send_email e communications.send_whatsapp, nunca invente destinatário, promessa comercial, preço ou condição. body/subject devem vir do pedido do usuário ou de uma redação explicitamente solicitada por ele. Se faltar conteúdo essencial, peça clarificação.
16. Para criação de proposta, produto, lead, etapa de pipeline ou registro de ligação, use apenas dados fornecidos pelo usuário ou existentes no contexto; preço deve vir do catálogo quando a capability exigir product_query.
17. Em calls.log_outcome, outcome deve ser um valor canônico: answered, no_answer, busy, voicemail, callback_requested, interested, meeting_scheduled, proposal_requested, proposal_sent, wrong_person, invalid_number, not_interested, sale_completed ou other. Traduza linguagem natural para um desses valores.
18. Em proposals.update_status, use draft, sent, viewed, accepted, rejected, expired ou cancelled. Em revenue.update_status, use forecast, recognized ou cancelled.
19. Se “limpar” puder se referir a mensagens, registros ou notificações e o contexto não resolver o objeto, peça clarificação em vez de apagar/ocultar algo errado.
20. SALES EXECUTION: para metas, normalize a métrica para calls, contacts, followups, meetings, proposals, wins, revenue ou new_leads. “meta de 40 ligações amanhã”, “quero 15 propostas esta semana” e equivalentes usam goals.create. Quando o usuário fala da própria meta e não cita equipe/pessoa, use scope=user; o executor resolve o usuário atual. period_start/period_end devem ser YYYY-MM-DD.
20.1 “crie 40 metas amanhã” significa com alta probabilidade UMA meta com target_value=40 e período amanhã, mas metric está faltando. Preserve target_value e período e pergunte: “Qual tipo de meta você quer criar? Ligações, contatos, follow-ups, reuniões, propostas, vendas, receita ou novos leads?”.
20.2 A mesma política de preenchimento vale para TODAS as capabilities do catálogo: contatos, empresas, leads, pipeline, tarefas, atividades, agenda, ligações, comunicações, propostas, catálogo, metas, playbooks, automações, equipes, receita, Garimpo, navegação e consultas.
21. GARIMPO: pedidos como “encontre 30 barbearias em Porto Alegre”, “garimpe clínicas em Canoas” ou “procure empresas parecidas com meus melhores clientes” usam prospecting.search. Extraia segment, city, quantity; para busca baseada no perfil atual use use_icp=true. Não invente cidade nem segmento se não estiverem no pedido/contexto/ICP solicitado.
22. Para “crie meu ICP”, “perfil de cliente ideal” ou “com base nos clientes que mais compraram”, use prospecting.build_icp. Para “melhores empresas”, “priorize”, “quem tem mais potencial”, use prospecting.rank. Para recalcular score/duplicidade/qualidade use prospecting.analyze.
23. Para “aprove os N melhores” use prospecting.approve_top com quantity e, quando fornecido, min_score. Para descartar resultados fracos use prospecting.discard_low com max_score. Para enviar/colocar no CRM use prospecting.send_to_crm; isso é high risk e exige confirmação. Extraia owner_query, stage_query, next_action_at, activity_type, quantity e min_score quando fornecidos.
24. Em pedidos multi-etapa do Garimpo, planeje na ordem segura. Ex.: “aprove os 10 melhores e coloque no CRM para Marcelo trabalhar amanhã” -> prospecting.approve_top + prospecting.send_to_crm(owner_query=Marcelo,next_action_at=<data>,activity_type=call,quantity=10). A etapa de envio só pode consumir registros aprovados.
25. Não trate score do Garimpo como verdade oculta. prospecting.rank/build_icp devem explicar que o ranking usa dados reais do CRM e sinais disponíveis; o executor apresenta as razões.
26. Responda SOMENTE no schema solicitado.`

const text = (value, max = 500) => String(value ?? '').trim().slice(0, max)

export function normalizeCrmCapabilityPlan(value = {}, catalog = []) {
  const byId = new Map((Array.isArray(catalog) ? catalog : []).map((item) => [String(item?.id || ''), item]))
  const confidence = Number(value?.confidence)
  const steps = Array.isArray(value?.steps) ? value.steps.flatMap((step, index) => {
    const id = text(step?.capabilityId, 160)
    const definition = byId.get(id)
    if (!definition) return []
    const risk = ['read','low','medium','high'].includes(definition.risk) ? definition.risk : 'medium'
    const args = Array.isArray(step?.args) ? step.args.flatMap((item) => {
      const name = text(item?.name, 80); if (!name) return []
      return [{ name, value: text(item?.value, 1200) }]
    }).slice(0, 24) : []
    return [{ id: text(step?.id, 100) || `step-${index + 1}`, capabilityId: id, title: text(step?.title, 180) || text(definition.title, 180), reason: text(step?.reason, 400), risk, args }]
  }).slice(0, 8) : []
  const pendingCapabilityIdRaw = text(value?.pendingCapabilityId, 160)
  const pendingCapabilityId = byId.has(pendingCapabilityIdRaw) ? pendingCapabilityIdRaw : ''
  const missingSlots = Array.isArray(value?.missingSlots) ? value.missingSlots.map((item) => text(item, 80)).filter(Boolean).slice(0, 12) : []
  const knownArgs = Array.isArray(value?.knownArgs) ? value.knownArgs.flatMap((item) => {
    const name = text(item?.name, 80); if (!name) return []
    return [{ name, value: text(item?.value, 1200) }]
  }).slice(0, 24) : []
  return {
    version: '3.4',
    goal: text(value?.goal, 500),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    needsClarification: Boolean(value?.needsClarification),
    clarification: text(value?.clarification, 400),
    pendingCapabilityId,
    missingSlots,
    knownArgs,
    steps,
  }
}

export function crmCapabilityDecision(value) {
  if (value?.needsClarification && Number(value?.confidence) >= crmCapabilityPlannerInfo.confidence.clarify) return 'clarify'
  if (Array.isArray(value?.steps) && value.steps.length && Number(value?.confidence) >= crmCapabilityPlannerInfo.confidence.execute) return 'execute'
  return 'fallback'
}
