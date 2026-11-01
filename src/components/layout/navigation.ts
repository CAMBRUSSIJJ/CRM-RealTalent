import {
  BarChart3, CalendarDays, ContactRound, Goal, LayoutDashboard, ListChecks, MapPinned, MessagesSquare, Phone, ReceiptText,
  Settings, Sparkles, Workflow, BookOpenText, Pickaxe, UsersRound, ClipboardCheck, Video,
} from 'lucide-react'
import type { AppRoute, TeamAccessResource } from '../../domain/types'

export type NavigationGroup = 'Operação' | 'Estratégia' | 'Sistema'

export const navigationItems: Array<{
  route: AppRoute
  label: string
  icon: typeof LayoutDashboard
  phase: 'ready' | 'foundation'
  group: NavigationGroup
  priority: 'primary' | 'secondary'
}> = [
  { route: 'dashboard', label: 'Meu Dia', icon: LayoutDashboard, phase: 'ready', group: 'Operação', priority: 'primary' },
  { route: 'leads', label: 'Contatos', icon: ContactRound, phase: 'ready', group: 'Operação', priority: 'primary' },
  { route: 'commercial-map', label: 'Território', icon: MapPinned, phase: 'ready', group: 'Operação', priority: 'secondary' },
  { route: 'pipeline', label: 'Pipeline', icon: Workflow, phase: 'ready', group: 'Operação', priority: 'primary' },
  { route: 'tasks', label: 'Tarefas', icon: ClipboardCheck, phase: 'ready', group: 'Operação', priority: 'primary' },
  { route: 'teams', label: 'Equipes', icon: UsersRound, phase: 'ready', group: 'Operação', priority: 'primary' },
  { route: 'followups', label: 'Follow-ups', icon: ListChecks, phase: 'ready', group: 'Operação', priority: 'secondary' },
  { route: 'calls', label: 'Ligações', icon: Phone, phase: 'ready', group: 'Operação', priority: 'secondary' },
  { route: 'communications', label: 'Comunicação', icon: MessagesSquare, phase: 'ready', group: 'Operação', priority: 'primary' },
  { route: 'proposals', label: 'Propostas', icon: ReceiptText, phase: 'ready', group: 'Operação', priority: 'primary' },
  { route: 'agenda', label: 'Agenda', icon: CalendarDays, phase: 'ready', group: 'Operação', priority: 'primary' },
  { route: 'meet', label: 'Reuniões', icon: Video, phase: 'ready', group: 'Operação', priority: 'primary' },
  { route: 'playbooks', label: 'Playbooks', icon: BookOpenText, phase: 'foundation', group: 'Estratégia', priority: 'secondary' },
  { route: 'goals', label: 'Metas', icon: Goal, phase: 'ready', group: 'Estratégia', priority: 'secondary' },
  { route: 'automations', label: 'Automações', icon: Sparkles, phase: 'ready', group: 'Estratégia', priority: 'secondary' },
  { route: 'prospecting', label: 'Garimpo', icon: Pickaxe, phase: 'ready', group: 'Estratégia', priority: 'primary' },
  { route: 'metrics', label: 'Métricas', icon: BarChart3, phase: 'ready', group: 'Estratégia', priority: 'primary' },
  { route: 'settings', label: 'Configurações', icon: Settings, phase: 'ready', group: 'Sistema', priority: 'primary' },
]

export const routeTitles: Record<AppRoute, { title: string; subtitle: string }> = {
  dashboard: { title: 'Meu Dia', subtitle: 'Prioridades, próximos contatos e ritmo comercial' },
  leads: { title: 'Contatos', subtitle: 'Pessoas, empresas, responsáveis e próximas ações' },
  'commercial-map': { title: 'Território', subtitle: 'Carteira geográfica, cobertura regional e inteligência territorial' },
  pipeline: { title: 'Pipeline', subtitle: 'Negócios, etapas e riscos da operação' },
  tasks: { title: 'Tarefas', subtitle: 'Execução, prioridades, responsáveis e prazos do time' },
  teams: { title: 'Equipes', subtitle: 'Pessoas, carga de trabalho, liderança e capacidade operacional' },
  followups: { title: 'Follow-ups', subtitle: 'Cadências, fila diária e próximos contatos' },
  calls: { title: 'Ligações', subtitle: 'Operação, histórico e inteligência de chamadas' },
  communications: { title: 'Central de Comunicação', subtitle: 'WhatsApp e e-mail em workspaces dedicados' },
  proposals: { title: 'Propostas e Forecast', subtitle: 'Produtos, propostas, receita e previsão comercial' },
  agenda: { title: 'Agenda', subtitle: 'Reuniões, tarefas e compromissos comerciais' },
  meet: { title: 'RealTalent Meet', subtitle: 'Videoconferências e histórico comercial' },
  playbooks: { title: 'Playbooks', subtitle: 'Scripts, objeções e padrões de atendimento' },
  goals: { title: 'Metas', subtitle: 'Resultados por usuário e por equipe' },
  automations: { title: 'Automações', subtitle: 'Regras comerciais seguras e auditáveis' },
  metrics: { title: 'Métricas', subtitle: 'Desempenho, conversão e perdas' },
  prospecting: { title: 'Garimpo', subtitle: 'Busca, validação e processamento de novas empresas' },
  settings: { title: 'Configurações', subtitle: 'Empresa, dados, integrações e segurança' },
}

export const routeAccessResource = (route: AppRoute): TeamAccessResource | null => ({
  leads: 'contacts',
  'commercial-map': 'contacts',
  pipeline: 'pipeline',
  tasks: 'tasks',
  teams: 'settings',
  followups: 'contacts',
  calls: 'communications',
  communications: 'communications',
  proposals: 'proposals',
  agenda: 'tasks',
  meet: 'communications',
  goals: 'goals',
  automations: 'settings',
  prospecting: 'prospecting',
  metrics: 'goals',
  settings: 'settings',
} as Partial<Record<AppRoute, TeamAccessResource>>)[route] ?? null
