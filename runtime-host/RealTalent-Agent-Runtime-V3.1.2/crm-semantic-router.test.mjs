import { describe, expect, it } from 'vitest'
import { routeBusinessDomain, routeCapability } from './crm-semantic-router.mjs'

const modules = ['dashboard','leads','pipeline','tasks','followups','agenda','calls','communications','proposals','goals','playbooks','automations','teams','revenue','prospecting','settings']
const defs = [
  ['notifications.dismiss_all','dashboard'], ['contacts.create','leads'], ['contacts.relationship_create','leads'], ['leads.create','leads'],
  ['pipeline.move','pipeline'], ['leads.bulk_move','pipeline'], ['leads.merge','leads'], ['leads.bulk_tag','leads'], ['tasks.create','tasks'],
  ['activities.create_followup','followups'], ['activities.create_note','followups'], ['activities.update','followups'], ['activities.register_outcome','followups'], ['cadences.create','followups'],
  ['calendar.create','agenda'], ['calls.log_outcome','calls'], ['calls.register_outcome','calls'], ['calls.recording_url','calls'],
  ['communications.send_whatsapp','communications'], ['communications.send_email','communications'], ['proposals.create','proposals'], ['proposals.update','proposals'], ['proposals.create_revision','proposals'],
  ['buyer_rooms.create','proposals'], ['catalog.create_product','proposals'], ['goals.create','goals'], ['playbooks.create','playbooks'],
  ['automations.toggle','automations'], ['automations.create','automations'], ['automations.update','automations'], ['automations.simulate','automations'],
  ['teams.invite','teams'], ['teams.create_member','teams'], ['revenue.create','revenue'], ['prospecting.search','prospecting'], ['crm.query','dashboard'],
  ['workspace.audit_logs','settings'], ['workspace.sync_structure','settings'], ['companies.create','leads'],
].map(([id,module]) => ({ id, module }))

const cases = [
  ['limpe todas as notificações que estão aparecendo para mim','dashboard','notifications.dismiss_all'],
  ['cadastre um contato chamado Ana Silva com email ana@empresa.com','leads','contacts.create'],
  ['registre que Ana Silva trabalha diretamente com Bruno Costa e a relação é forte','leads','contacts.relationship_create'],
  ['crie um lead chamado Bruno Costa da empresa Atlas com prioridade alta','leads','leads.create'],
  ['mova a oportunidade Atlas para a etapa Negociação','pipeline','pipeline.move'],
  ['mova Atlas e Acme em lote para a etapa Negociação','pipeline','leads.bulk_move'],
  ['mescle o lead Atlas duplicado dentro do lead Atlas Principal','leads','leads.merge'],
  ['adicione a tag prioridade nos leads Atlas e Acme','leads','leads.bulk_tag'],
  ['crie uma tarefa chamada Revisar proposta para amanhã às 10:00','tasks','tasks.create'],
  ['crie um follow-up para Atlas amanhã às 16:00 para cobrar retorno','followups','activities.create_followup'],
  ['adicione uma nota no cliente Atlas dizendo que pediu condição especial','followups','activities.create_note'],
  ['reagende o follow-up Cobrar proposta para sexta às 15h','followups','activities.update'],
  ['registre no follow-up Cobrar proposta que o cliente demonstrou interesse','followups','activities.register_outcome'],
  ['coloque Atlas e Acme na cadência Prospecção fria a partir de amanhã','followups','cadences.create'],
  ['marque uma reunião para amanhã às 14:00 com cliente oculto','agenda','calendar.create'],
  ['registre que a ligação com Atlas não atendeu','calls','calls.log_outcome'],
  ['registre que a ligação com Atlas pediu retorno e agende a próxima tentativa para amanhã às 10h','calls','calls.register_outcome'],
  ['abra a gravação da ligação de ontem com Atlas','calls','calls.recording_url'],
  ['mande um WhatsApp para Ana Silva dizendo que a proposta está pronta','communications','communications.send_whatsapp'],
  ['envie um email para Ana Silva com assunto Proposta e mensagem Segue nossa proposta comercial','communications','communications.send_email'],
  ['crie uma proposta para Atlas usando o serviço Consultoria','proposals','proposals.create'],
  ['altere a validade da proposta Atlas 2026 para o fim do mês','proposals','proposals.update'],
  ['crie uma nova revisão da proposta Atlas 2026','proposals','proposals.create_revision'],
  ['crie uma sala de negociação para a proposta Atlas 2026','proposals','buyer_rooms.create'],
  ['crie no catálogo um serviço chamado Diagnóstico Comercial por 1500 reais','proposals','catalog.create_product'],
  ['faça 40 metas de ligação para amanhã','goals','goals.create'],
  ['crie um roteiro comercial chamado Descoberta Enterprise','playbooks','playbooks.create'],
  ['desative a automação Follow-up automático','automations','automations.toggle'],
  ['crie uma automação chamada Alerta de lead parado disparada quando o lead ficar parado','automations','automations.create'],
  ['renomeie a automação Follow-up automático para Retorno automático','automations','automations.update'],
  ['simule a automação Follow-up automático para o lead Atlas','automations','automations.simulate'],
  ['convide vendedor@empresa.com para a equipe','teams','teams.invite'],
  ['adicione Marcelo como membro do workspace com papel member','teams','teams.create_member'],
  ['lance uma receita de 5000 reais reconhecida hoje','revenue','revenue.create'],
  ['encontre 20 barbearias em Canoas no garimpo','prospecting','prospecting.search'],
  ['mostre as oportunidades abertas ordenadas por valor','dashboard','crm.query'],
  ['mostre os últimos 20 eventos de auditoria do workspace','settings','workspace.audit_logs'],
  ['sincronize a estrutura comercial de empresas contatos e oportunidades','settings','workspace.sync_structure'],
]

describe('RealTalent deterministic semantic router', () => {
  for (const [prompt, expectedModule, expectedCapability] of cases) {
    it(`${expectedCapability}: ${prompt}`, () => {
      const domain = routeBusinessDomain(prompt, modules)
      expect(domain?.primaryModule).toBe(expectedModule)
      const candidates = defs.filter((item) => item.module === expectedModule)
      const capability = routeCapability(prompt, candidates)
      expect(capability?.ids?.[0]).toBe(expectedCapability)
    })
  }
})