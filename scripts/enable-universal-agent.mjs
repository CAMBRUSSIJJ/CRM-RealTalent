import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const patch = (relative, transform) => {
  const file = path.resolve(root, relative)
  const before = fs.readFileSync(file, 'utf8')
  const after = transform(before)
  if (after === before) return false
  fs.writeFileSync(file, after, 'utf8')
  console.log(`✓ Universal Agent: ${relative}`)
  return true
}

patch('src/services/realtalent-crm-capability-runtime-client.ts', (source) => source.replace(
  "from './realtalent-crm-universal-capabilities'",
  "from './realtalent-crm-universal-registry'",
))

patch('src/features/assistant/assistant-drawer.tsx', (source) => source.replace(
  "from '../../services/realtalent-crm-capability-executor'",
  "from '../../services/realtalent-crm-universal-executor'",
))

patch('src/services/realtalent-assistant-provider.ts', (source) => source.replace(
  "from './realtalent-crm-slot-filling'",
  "from './realtalent-crm-universal-slot-filling'",
))

patch('src/services/realtalent-crm-universal-executor.ts', (source) => {
  let next = source
  if (!next.includes('UNIVERSAL_ADMIN_CAPABILITIES')) {
    next = next.replace(
      "import { UNIVERSAL_EXTRA_CAPABILITIES } from './realtalent-crm-universal-capabilities'",
      "import { UNIVERSAL_EXTRA_CAPABILITIES } from './realtalent-crm-universal-capabilities'\nimport { UNIVERSAL_ADMIN_CAPABILITIES, universalCrmCapabilityById } from './realtalent-crm-universal-registry'",
    )
    next = next.replace(
      "import { executeUniversalContacts } from './realtalent-crm-universal-executor-contacts'",
      "import { executeUniversalContacts } from './realtalent-crm-universal-executor-contacts'\nimport { executeUniversalAdmin } from './realtalent-crm-universal-executor-admin'",
    )
    next = next.replace(
      "const EXTRA_IDS = new Set(UNIVERSAL_EXTRA_CAPABILITIES.filter((item) => item.execution === 'native').map((item) => item.id))",
      "const EXTRA_IDS = new Set([...UNIVERSAL_EXTRA_CAPABILITIES, ...UNIVERSAL_ADMIN_CAPABILITIES].filter((item) => item.execution === 'native').map((item) => item.id))",
    )
    next = next.replace(
      "  const adminResult = await executeAutomationAndWorkspace(step, runtime); if (adminResult) return adminResult\n  throw new Error",
      "  const adminResult = await executeAutomationAndWorkspace(step, runtime); if (adminResult) return adminResult\n  const extendedAdminResult = await executeUniversalAdmin(step, runtime); if (extendedAdminResult) return extendedAdminResult\n  throw new Error",
    )
  } else if (!next.includes('universalCrmCapabilityById')) {
    next = next.replace(
      "import { UNIVERSAL_ADMIN_CAPABILITIES } from './realtalent-crm-universal-registry'",
      "import { UNIVERSAL_ADMIN_CAPABILITIES, universalCrmCapabilityById } from './realtalent-crm-universal-registry'",
    )
  }

  const executeAnchor = "export async function executeCrmCapabilityStep(step: CrmCapabilityPlanStep, runtime: CrmCapabilityExecutionRuntime): Promise<CrmCapabilityStepResult> {\n  if (!EXTRA_IDS.has(step.capabilityId)) return executeBaseCrmCapabilityStep(step, runtime)\n"
  if (next.includes(executeAnchor) && !next.includes('Universal capability permission denied')) {
    next = next.replace(executeAnchor, `${executeAnchor}  const definition = universalCrmCapabilityById(step.capabilityId)\n  if (!definition || definition.execution !== 'native') throw new Error(\`Capability universal inválida: \${step.capabilityId}\`)\n  if (definition.resource && definition.permissionAction && !runtime.canTeamAccess(definition.permissionAction, definition.resource)) {\n    throw new Error(\`Universal capability permission denied: seu perfil não permite \${definition.permissionAction} em \${definition.resource}.\`)\n  }\n`)
  }
  return next
})

patch('src/services/realtalent-crm-execution-truth.ts', (source) => {
  let next = source
  const collectionAnchor = "const collectionForCapability = (snapshot: WorkspaceSnapshot, capabilityId: string): Array<{ id: string; [key: string]: unknown }> | null => {\n"
  if (next.includes(collectionAnchor) && !next.includes("capabilityId.startsWith('contacts.relationship_')")) {
    next = next.replace(collectionAnchor, `${collectionAnchor}  if (capabilityId.startsWith('contacts.relationship_')) return snapshot.contactRelationships as any[]\n  if (capabilityId.startsWith('buyer_rooms.')) return (snapshot.buyerRooms ?? []) as any[]\n  if (capabilityId.startsWith('cadences.')) return snapshot.activities as any[]\n`)
  }

  const slicesAnchor = "export const executionTruthSlicesForCapability = (capabilityId: string): SnapshotSlice[] => {\n"
  if (next.includes(slicesAnchor) && !next.includes("if (capabilityId.startsWith('buyer_rooms.')) return ['proposals', 'buyerRooms']")) {
    next = next.replace(slicesAnchor, `${slicesAnchor}  if (capabilityId.startsWith('contacts.relationship_')) return ['commercial']\n  if (capabilityId.startsWith('cadences.')) return ['commercial', 'activities']\n  if (capabilityId.startsWith('buyer_rooms.')) return ['proposals', 'buyerRooms']\n  if (capabilityId === 'calls.register_outcome') return ['commercial', 'calls', 'activities', 'events']\n  if (capabilityId === 'workspace.sync_structure') return ['commercial']\n  if (capabilityId === 'workspace.clear_operational_data') return ['commercial','stages','activities','calls','events','playbooks','products','proposals','buyerRooms','revenue','goals','automationRules','automationRuns']\n`)
  }

  const verifyAnchor = "  if (step.capabilityId === 'prospecting.send_to_crm' && after.leads.length > before.leads.length) {\n    base.status = 'verified'; base.checks.push('Novos registros comerciais foram relidos após a conversão do Garimpo.'); return base\n  }\n"
  if (next.includes(verifyAnchor) && !next.includes('Universal CRM readback confirmou')) {
    const universalVerification = `\n  // Universal CRM Control — mutation-specific readback.\n  if (step.capabilityId === 'contacts.relationship_create' && familyCreated(before, after, step.capabilityId)) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a nova relação entre contatos.'); return base }\n  if (step.capabilityId === 'contacts.relationship_update' && familyChanged(before, after, step.capabilityId)) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a alteração da relação entre contatos.'); return base }\n  if (step.capabilityId === 'contacts.relationship_delete' && familyDeleted(before, after, step.capabilityId)) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a remoção da relação entre contatos.'); return base }\n  if (['leads.bulk_move','leads.bulk_update','leads.reclassify','leads.bulk_tag','leads.merge'].includes(step.capabilityId) && JSON.stringify(before.leads) !== JSON.stringify(after.leads)) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou alteração efetiva nos leads.'); return base }\n  if (step.capabilityId === 'leads.bulk_delete' && after.leads.length < before.leads.length) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a exclusão em lote.'); return base }\n  if (step.capabilityId === 'activities.register_outcome' && JSON.stringify(before.activities) !== JSON.stringify(after.activities)) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou o resultado da atividade.'); return base }\n  if (step.capabilityId === 'cadences.create' && after.activities.length > before.activities.length) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a criação da cadência.'); return base }\n  if (step.capabilityId === 'cadences.update_state' && JSON.stringify(before.activities) !== JSON.stringify(after.activities)) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a mudança de estado da cadência.'); return base }\n  if (step.capabilityId === 'calls.register_outcome' && after.calls.length > before.calls.length) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou o novo registro de ligação.'); return base }\n  if (step.capabilityId === 'proposals.create_revision' && after.proposals.length > before.proposals.length) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a nova revisão da proposta.'); return base }\n  if (step.capabilityId === 'catalog.reconcile_proposal_items' && JSON.stringify(before.proposals) !== JSON.stringify(after.proposals)) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a reconciliação dos itens da proposta.'); return base }\n  if (step.capabilityId === 'automations.undo_run' && JSON.stringify(before.automationRuns) !== JSON.stringify(after.automationRuns)) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou o undo da automação.'); return base }\n  if (step.capabilityId === 'workspace.select' && before.workspace.id !== after.workspace.id) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a troca de workspace.'); return base }\n  if (step.capabilityId === 'workspace.sync_structure' && (JSON.stringify(before.companies) !== JSON.stringify(after.companies) || JSON.stringify(before.contacts) !== JSON.stringify(after.contacts) || JSON.stringify(before.opportunities) !== JSON.stringify(after.opportunities))) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a sincronização da estrutura comercial.'); return base }\n  if (step.capabilityId === 'workspace.clear_operational_data') { const beforeCount = before.leads.length + before.activities.length + before.calls.length + before.events.length + before.proposals.length + before.goals.length; const afterCount = after.leads.length + after.activities.length + after.calls.length + after.events.length + after.proposals.length + after.goals.length; if (afterCount < beforeCount) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a limpeza dos dados operacionais.'); return base } }\n`
    next = next.replace(verifyAnchor, `${verifyAnchor}${universalVerification}`)
  }
  return next
})

patch('runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs', (source) => {
  let next = source

  if (!next.includes('requiredSlots: Array.isArray(capability?.requiredSlots)')) {
    next = next.replace(
      "  arguments: Array.isArray(capability?.arguments) ? capability.arguments.slice(0, 24) : [],\n})",
      "  arguments: Array.isArray(capability?.arguments) ? capability.arguments.slice(0, 24) : [],\n  requiredSlots: Array.isArray(capability?.requiredSlots) ? capability.requiredSlots.slice(0, 16) : [],\n})",
    )
  }

  const routerAnchor = 'const semanticModuleRouter = async ({ prompt, capabilities }) => {'
  if (next.includes(routerAnchor) && !next.includes('const semanticDomainAnchor =')) {
    const helper = `const normalizeRouterText = (value) => String(value || '')\n  .normalize('NFD')\n  .replace(/[\\u0300-\\u036f]/g, '')\n  .toLowerCase()\n  .replace(/\\s+/g, ' ')\n  .trim()\n\nconst semanticDomainAnchor = (prompt, modules) => {\n  const text = normalizeRouterText(prompt)\n  const available = new Set(modules)\n  const pick = (module, rationale, secondary = []) => {\n    if (!available.has(module)) return null\n    return { modules: [module, ...secondary.filter((item) => available.has(item) && item !== module)], primaryModule: module, confidence: 0.99, rationale: \`anchor: \${rationale}\`, source: 'semantic-anchor' }\n  }\n  const has = (pattern) => pattern.test(text)\n\n  // High-signal business nouns/actions. These are domain guards, not phrase-specific commands.\n  // They keep a small local model from wasting a first inference on obvious domain selection.\n  if (has(/\\b(meta|metas|quota|quotas|objetivo|objetivos|alvo|alvos)\\b/)) return pick('goals', 'meta ou objetivo comercial explícito')\n  if (has(/\\b(email|e-mail|whatsapp|mensagem|mensagens)\\b/) && has(/\\b(envie|enviar|mande|mandar|responda|responder|escreva|escrever)\\b/)) return pick('communications', 'canal externo explícito')\n  if (has(/\\b(follow[- ]?up|followups|cadencia|cadencias|atividade|atividades|nota|notas)\\b/)) return pick('followups', 'atividade, follow-up, nota ou cadência explícita')\n  if (has(/\\b(ligacao|ligacoes|telefonema|telefonemas|discador|gravacao)\\b/) && has(/\\b(registre|registrar|resultado|desfecho|atendeu|retorno|proxima tentativa|abra|abrir|ligue|ligar|grave|gravacao)\\b/)) return pick('calls', 'operação ou resultado de ligação explícito')\n  if (has(/\\b(tarefa|tarefas|lembrete|lembretes)\\b/)) return pick('tasks', 'tarefa ou lembrete explícito')\n  if (has(/\\b(reuniao|reunioes|compromisso|compromissos|evento|eventos|agenda|calendario)\\b/) || (has(/\\b(agende|agendar|marque|marcar|reagende|reagendar)\\b/) && has(/\\b(call|conversa)\\b/))) return pick('agenda', 'evento ou agendamento explícito')\n  if (has(/\\b(automacao|automacoes|automatizacao|gatilho|regra automatica)\\b/)) return pick('automations', 'automação explícita')\n  if (has(/\\b(equipe|equipes|membro|membros|convite|convide|papel|permissao|permissoes)\\b/) && !has(/\\b(cliente|contato)\\b/)) return pick('teams', 'equipe, membro ou permissão explícita')\n  if (has(/\\b(auditoria|audit log|logs de auditoria|sincronize a estrutura|sincronizar a estrutura|workspace|dados operacionais)\\b/)) return pick('settings', 'administração do workspace explícita')\n  if (has(/\\b(receita|receitas|faturamento|reconhecida|reconhecido)\\b/) && has(/\\b(lance|lancar|crie|criar|status|atualize|atualizar|reconhec)\\w*/)) return pick('revenue', 'receita ou reconhecimento financeiro explícito')\n  if (has(/\\b(playbook|playbooks|roteiro comercial|script de vendas|script comercial)\\b/)) return pick('playbooks', 'roteiro ou playbook explícito')\n  if (has(/\\b(garimpo|garimpar|garimpe|prospeccao|prospect|prospects|icp|ranqueie|ranking de prospects)\\b/) || (has(/\\b(encontre|encontrar|procure|procurar|descubra|descobrir)\\b/) && has(/\\b(empresas|clinicas|barbearias|lojas|negocios|prospects)\\b/))) return pick('prospecting', 'descoberta de novos prospects explícita')\n  if (has(/\\b(mova|mover|movimente|etapa|pipeline|funil|marque como ganha|marque como perdida|negociacao)\\b/) && has(/\\b(oportunidade|oportunidades|lead|leads|negocio|negocios|etapa)\\b/)) return pick('pipeline', 'movimentação de oportunidade no funil')\n  if (has(/\\b(relacao|relacionamento|reporta|influencia|trabalha diretamente com|parceiro|socio)\\b/) && has(/\\b(contato|ana|bruno|pessoa|pessoas)\\b/)) return pick('contacts', 'relação entre contatos explícita')\n  if (has(/\\b(buyer room|sala de negociacao|proposta|propostas|catalogo|produto|produtos|servico|servicos)\\b/) && !has(/\\b(tarefa|follow[- ]?up|email|e-mail|whatsapp)\\b/)) return pick('proposals', 'proposta, Buyer Room ou catálogo explícito')\n  if (has(/\\b(contato|contatos|pessoa|pessoas)\\b/) && has(/\\b(cadastre|cadastrar|crie|criar|atualize|atualizar|exclua|excluir)\\b/)) return pick('contacts', 'cadastro/manutenção de contato explícito')\n  if (has(/\\b(lead|leads)\\b/) && has(/\\b(crie|criar|cadastre|cadastrar|mescle|mesclar|duplicado|duplicados|tag|reclassifique|atualize|exclua)\\b/)) return pick('leads', 'manutenção de lead existente no CRM')\n  if (has(/\\b(mostre|mostrar|liste|listar|quais|quantos|consulte|consultar)\\b/)) return pick('dashboard', 'consulta global do CRM')\n  return null\n}\n\n`
    next = next.replace(routerAnchor, `${helper}${routerAnchor}`)
  }

  const semanticStart = "const semanticModuleRouter = async ({ prompt, capabilities }) => {\n  const modules = [...new Set(capabilities.map((item) => String(item?.module || '')).filter(Boolean))]\n  if (modules.length <= 1) return { modules, confidence: 1, rationale: 'catálogo já restrito' }\n"
  if (next.includes(semanticStart) && !next.includes('semanticDomainAnchor(prompt, modules)')) {
    next = next.replace(semanticStart, `${semanticStart}  const anchored = semanticDomainAnchor(prompt, modules)\n  if (anchored) return anchored\n`)
  }

  return next
})

patch('runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-capability-planner.mjs', (source) => {
  if (source.includes('DESAMBIGUAÇÃO UNIVERSAL DE CAPABILITIES')) return source
  const anchor = '26. Responda SOMENTE no schema solicitado.`'
  if (!source.includes(anchor)) return source
  const rules = `25.1 DESAMBIGUAÇÃO UNIVERSAL DE CAPABILITIES:\n- Se o canal pedido for explicitamente e-mail, selecione communications.send_email mesmo que assunto/corpo mencionem proposta. Se for WhatsApp, communications.send_whatsapp.\n- Se o objeto explicitamente citado for follow-up, atividade ou cadência, permaneça no domínio de follow-ups. Data/horário não transforma follow-up em calendar.*.\n- Se o usuário registrar o resultado de uma ligação E pedir próxima ação/retorno/reunião derivada desse resultado, prefira calls.register_outcome. Use calls.log_outcome para registro simples sem fluxo subsequente.\n- Ao mover vários leads/oportunidades juntos para uma etapa, use leads.bulk_move quando disponível; pipeline.move é para um único registro.\n- Ao mesclar lead duplicado com lead principal, use leads.merge. Não use Garimpo.\n- Relações de influência, reporte, parceria ou trabalho entre duas pessoas/contatos usam contacts.relationship_create/update/delete. Não use Garimpo.\n- Cadência comercial explícita usa cadences.create ou cadences.update_state conforme criação versus pausar/retomar/encerrar.\n- Buyer Room/sala de negociação vinculada a proposta usa buyer_rooms.*.\n- Para automação: criar regra nova -> automations.create; alterar campos da regra -> automations.update; apenas ligar/desligar -> automations.toggle; testar sem mutar -> automations.simulate.\n- Criar um lead manualmente no CRM usa leads.create. prospecting.send_to_crm só é válido quando o pedido se refere a resultados já encontrados/aprovados no Garimpo.\n- Nunca escolha prospecting.* apenas porque a mensagem contém a palavra lead, cliente, empresa ou contato. Garimpo exige intenção de DESCOBRIR/ranquear/aprovar prospects novos.\n\n26. Responda SOMENTE no schema solicitado.`
  return source.replace(anchor, rules)
})

console.log('✓ RealTalent Universal CRM Control habilitado no workspace local.')
