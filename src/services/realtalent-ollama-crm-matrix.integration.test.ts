import { describe, expect, it } from 'vitest'
import { universalCrmCapabilityCatalogForModel } from './realtalent-crm-universal-registry'
import { crmCapabilitySlotRulesForModel } from './realtalent-crm-universal-slot-filling'

const enabled = process.env.REALTALENT_OLLAMA_MATRIX === '1'
const agentUrl = String(process.env.REALTALENT_AGENT_TEST_URL || 'http://127.0.0.1:8791').replace(/\/$/, '')

type MatrixCase = { name: string; prompt: string; expected: string; route?: string }

const CASES: MatrixCase[] = [
  { name: 'notificações', prompt: 'limpe todas as notificações que estão aparecendo para mim', expected: 'notifications.dismiss_all', route: '/pipeline' },
  { name: 'contatos', prompt: 'cadastre um contato chamado Ana Silva com email ana@empresa.com', expected: 'contacts.create', route: '/goals' },
  { name: 'relação entre contatos', prompt: 'registre que Ana Silva trabalha diretamente com Bruno Costa e a relação é forte', expected: 'contacts.relationship_create', route: '/pipeline' },
  { name: 'lead', prompt: 'crie um lead chamado Bruno Costa da empresa Atlas com prioridade alta', expected: 'leads.create', route: '/agenda' },
  { name: 'pipeline', prompt: 'mova a oportunidade Atlas para a etapa Negociação', expected: 'pipeline.move', route: '/goals' },
  { name: 'pipeline em lote', prompt: 'mova Atlas e Acme em lote para a etapa Negociação', expected: 'leads.bulk_move', route: '/goals' },
  { name: 'mesclar duplicados', prompt: 'mescle o lead Atlas duplicado dentro do lead Atlas Principal', expected: 'leads.merge', route: '/leads' },
  { name: 'tag em lote', prompt: 'adicione a tag prioridade nos leads Atlas e Acme', expected: 'leads.bulk_tag', route: '/leads' },
  { name: 'tarefas', prompt: 'crie uma tarefa chamada Revisar proposta para amanhã às 10:00', expected: 'tasks.create', route: '/pipeline' },
  { name: 'follow-up', prompt: 'crie um follow-up para Atlas amanhã às 16:00 para cobrar retorno', expected: 'activities.create_followup', route: '/goals' },
  { name: 'nota', prompt: 'adicione uma nota no cliente Atlas dizendo que pediu condição especial', expected: 'activities.create_note', route: '/agenda' },
  { name: 'atualizar atividade', prompt: 'reagende o follow-up Cobrar proposta para sexta às 15h', expected: 'activities.update', route: '/followups' },
  { name: 'resultado de atividade', prompt: 'registre no follow-up Cobrar proposta que o cliente demonstrou interesse', expected: 'activities.register_outcome', route: '/followups' },
  { name: 'cadência', prompt: 'coloque Atlas e Acme na cadência Prospecção fria a partir de amanhã', expected: 'cadences.create', route: '/followups' },
  { name: 'agenda', prompt: 'marque uma reunião para amanhã às 14:00 com cliente oculto', expected: 'calendar.create', route: '/goals' },
  { name: 'ligações simples', prompt: 'registre que a ligação com Atlas não atendeu', expected: 'calls.log_outcome', route: '/goals' },
  { name: 'ligação com próxima ação', prompt: 'registre que a ligação com Atlas pediu retorno e agende a próxima tentativa para amanhã às 10h', expected: 'calls.register_outcome', route: '/calls' },
  { name: 'gravação', prompt: 'abra a gravação da ligação de ontem com Atlas', expected: 'calls.recording_url', route: '/calls' },
  { name: 'WhatsApp', prompt: 'mande um WhatsApp para Ana Silva dizendo que a proposta está pronta', expected: 'communications.send_whatsapp', route: '/pipeline' },
  { name: 'e-mail', prompt: 'envie um email para Ana Silva com assunto Proposta e mensagem Segue nossa proposta comercial', expected: 'communications.send_email', route: '/goals' },
  { name: 'propostas', prompt: 'crie uma proposta para Atlas usando o serviço Consultoria', expected: 'proposals.create', route: '/agenda' },
  { name: 'atualizar proposta', prompt: 'altere a validade da proposta Atlas 2026 para o fim do mês', expected: 'proposals.update', route: '/proposals' },
  { name: 'revisão de proposta', prompt: 'crie uma nova revisão da proposta Atlas 2026', expected: 'proposals.create_revision', route: '/proposals' },
  { name: 'buyer room', prompt: 'crie uma sala de negociação para a proposta Atlas 2026', expected: 'buyer_rooms.create', route: '/proposals' },
  { name: 'catálogo', prompt: 'crie no catálogo um serviço chamado Diagnóstico Comercial por 1500 reais', expected: 'catalog.create_product', route: '/goals' },
  { name: 'metas', prompt: 'faça 40 metas de ligação para amanhã', expected: 'goals.create', route: '/goals' },
  { name: 'playbook', prompt: 'crie um roteiro comercial chamado Descoberta Enterprise', expected: 'playbooks.create', route: '/pipeline' },
  { name: 'automações toggle', prompt: 'desative a automação Follow-up automático', expected: 'automations.toggle', route: '/goals' },
  { name: 'automações criar', prompt: 'crie uma automação chamada Alerta de lead parado disparada quando o lead ficar parado', expected: 'automations.create', route: '/automations' },
  { name: 'automações atualizar', prompt: 'renomeie a automação Follow-up automático para Retorno automático', expected: 'automations.update', route: '/automations' },
  { name: 'automações simular', prompt: 'simule a automação Follow-up automático para o lead Atlas', expected: 'automations.simulate', route: '/automations' },
  { name: 'equipes convite', prompt: 'convide vendedor@empresa.com para a equipe', expected: 'teams.invite', route: '/agenda' },
  { name: 'equipes membro direto', prompt: 'adicione Marcelo como membro do workspace com papel member', expected: 'teams.create_member', route: '/teams' },
  { name: 'receita', prompt: 'lance uma receita de 5000 reais reconhecida hoje', expected: 'revenue.create', route: '/pipeline' },
  { name: 'garimpo', prompt: 'encontre 20 barbearias em Canoas no garimpo', expected: 'prospecting.search', route: '/goals' },
  { name: 'consulta', prompt: 'mostre as oportunidades abertas ordenadas por valor', expected: 'crm.query', route: '/agenda' },
  { name: 'auditoria', prompt: 'mostre os últimos 20 eventos de auditoria do workspace', expected: 'workspace.audit_logs', route: '/settings' },
  { name: 'sincronização estrutural', prompt: 'sincronize a estrutura comercial de empresas contatos e oportunidades', expected: 'workspace.sync_structure', route: '/settings' },
]

const askPlanner = async (item: MatrixCase) => {
  const response = await fetch(`${agentUrl}/capabilities/plan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt: item.prompt,
      context: { now: '2026-10-15T19:30:00-03:00', timezone: 'America/Sao_Paulo', currentRoute: item.route || '/goals', conversation_context: [] },
      capabilities: universalCrmCapabilityCatalogForModel().map((capability) => ({ ...capability, requiredSlots: crmCapabilitySlotRulesForModel(capability.id) })),
    }),
  })
  const body = await response.json().catch(() => ({})) as any
  if (!response.ok) throw new Error(`${item.name}: HTTP ${response.status}: ${body?.error || 'erro desconhecido'}`)
  return body
}

const chosenCapability = (body: any) => body?.plan?.steps?.[0]?.capabilityId || body?.plan?.pendingCapabilityId || ''

describe('RealTalent Agent — matriz semântica universal Ollama', () => {
  it.runIf(enabled)('mantém Ollama online antes da matriz', async () => {
    const response = await fetch(`${agentUrl}/health`)
    const health = await response.json() as any
    expect(response.ok).toBe(true)
    expect(health?.provider).toBe('ollama')
    expect(health?.ai?.provider).toBe('ollama')
    expect(health?.ai?.local?.online).toBe(true)
  })

  for (const item of CASES) {
    it.runIf(enabled)(`${item.name}: ${item.expected}`, async () => {
      const body = await askPlanner(item)
      expect(body?.provider, `${item.name}: provider incorreto`).toBe('ollama')
      const actual = chosenCapability(body)
      expect(actual, `${item.name}: pedido “${item.prompt}” escolheu ${actual || 'nenhuma capability'}`).toBe(item.expected)
    }, 120_000)
  }
})
