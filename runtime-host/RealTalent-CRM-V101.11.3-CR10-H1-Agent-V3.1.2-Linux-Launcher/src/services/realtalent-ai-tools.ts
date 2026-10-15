export type AiToolPermission = 'read' | 'navigate' | 'draft' | 'write'

export interface RealTalentAiTool {
  id: string
  label: string
  description: string
  permission: AiToolPermission
  mutatesCrm: boolean
  requiresConfirmation: boolean
  enabled: boolean
}

export const REALTALENT_AI_TOOLS: RealTalentAiTool[] = [
  { id: 'read_pipeline', label: 'Ler Pipeline', description: 'Analisa negócios, etapa, valor, risco e próximos passos.', permission: 'read', mutatesCrm: false, requiresConfirmation: false, enabled: true },
  { id: 'read_history', label: 'Ler histórico', description: 'Consulta atividades, ligações, reuniões e propostas relacionadas.', permission: 'read', mutatesCrm: false, requiresConfirmation: false, enabled: true },
  { id: 'read_account', label: 'Ler conta e decisores', description: 'Consulta contatos, papéis decisórios e relacionamentos da conta.', permission: 'read', mutatesCrm: false, requiresConfirmation: false, enabled: true },
  { id: 'read_forecast', label: 'Ler Revenue Intelligence', description: 'Consulta forecast, pipeline ponderado, bookings e riscos de receita.', permission: 'read', mutatesCrm: false, requiresConfirmation: false, enabled: true },
  { id: 'prepare_call', label: 'Preparar ligação', description: 'Monta briefing de ligação usando contexto e roteiro comercial.', permission: 'draft', mutatesCrm: false, requiresConfirmation: false, enabled: true },
  { id: 'draft_message', label: 'Rascunhar mensagem', description: 'Sugere WhatsApp ou e-mail, sem enviar automaticamente.', permission: 'draft', mutatesCrm: false, requiresConfirmation: false, enabled: true },
  { id: 'navigate_workspace', label: 'Abrir área do CRM', description: 'Navega para Pipeline, Comunicação, Agenda, Propostas ou Ligações.', permission: 'navigate', mutatesCrm: false, requiresConfirmation: false, enabled: true },
  { id: 'create_followup', label: 'Criar follow-up', description: 'Cria atividade de follow-up após prévia, revalidação e confirmação explícita.', permission: 'write', mutatesCrm: true, requiresConfirmation: true, enabled: true },
  { id: 'send_message', label: 'Enviar mensagem', description: 'Reservado para fluxo oficial com confirmação explícita; o modelo nunca envia diretamente.', permission: 'write', mutatesCrm: true, requiresConfirmation: true, enabled: false },
  { id: 'change_pipeline', label: 'Mover oportunidade', description: 'Move uma oportunidade entre etapas após revalidação local e confirmação explícita.', permission: 'write', mutatesCrm: true, requiresConfirmation: true, enabled: true },
]

export const enabledAiTools = () => REALTALENT_AI_TOOLS.filter((tool) => tool.enabled)
export const writableAiTools = () => REALTALENT_AI_TOOLS.filter((tool) => tool.permission === 'write')
