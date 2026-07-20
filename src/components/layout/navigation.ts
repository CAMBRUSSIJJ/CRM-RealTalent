import {
  BarChart3, CalendarDays, ContactRound, Goal, LayoutDashboard, ListChecks, Phone,
  Settings, Sparkles, Workflow, BookOpenText, Pickaxe,
} from 'lucide-react'
import type { AppRoute } from '../../domain/types'

export type NavigationGroup = 'Operação' | 'Estratégia' | 'Sistema'

export const navigationItems: Array<{
  route: AppRoute
  label: string
  icon: typeof LayoutDashboard
  phase: 'ready' | 'foundation'
  group: NavigationGroup
}> = [
  { route: 'dashboard', label: 'Meu Dia', icon: LayoutDashboard, phase: 'ready', group: 'Operação' },
  { route: 'leads', label: 'Leads', icon: ContactRound, phase: 'ready', group: 'Operação' },
  { route: 'pipeline', label: 'Pipeline', icon: Workflow, phase: 'ready', group: 'Operação' },
  { route: 'followups', label: 'Follow-ups', icon: ListChecks, phase: 'ready', group: 'Operação' },
  { route: 'calls', label: 'Ligações', icon: Phone, phase: 'ready', group: 'Operação' },
  { route: 'agenda', label: 'Agenda', icon: CalendarDays, phase: 'ready', group: 'Operação' },
  { route: 'playbooks', label: 'Playbooks', icon: BookOpenText, phase: 'foundation', group: 'Estratégia' },
  { route: 'goals', label: 'Metas', icon: Goal, phase: 'ready', group: 'Estratégia' },
  { route: 'automations', label: 'Automações', icon: Sparkles, phase: 'ready', group: 'Estratégia' },
  { route: 'prospecting', label: 'Garimpo', icon: Pickaxe, phase: 'ready', group: 'Estratégia' },
  { route: 'metrics', label: 'Métricas', icon: BarChart3, phase: 'ready', group: 'Estratégia' },
  { route: 'settings', label: 'Configurações', icon: Settings, phase: 'ready', group: 'Sistema' },
]

export const routeTitles: Record<AppRoute, { title: string; subtitle: string }> = {
  dashboard: { title: 'Meu Dia', subtitle: 'Fila inteligente, SLA e prioridades explicadas' },
  leads: { title: 'Leads', subtitle: 'Base comercial centralizada e pronta para crescer' },
  pipeline: { title: 'Pipeline', subtitle: 'Oportunidades organizadas por etapa' },
  followups: { title: 'Follow-ups', subtitle: 'Cadências, fila diária e próximos contatos' },
  calls: { title: 'Ligações', subtitle: 'Rotina, scripts e histórico de contatos' },
  agenda: { title: 'Agenda', subtitle: 'Reuniões, tarefas e compromissos comerciais' },
  playbooks: { title: 'Playbooks', subtitle: 'Scripts, objeções e padrões de atendimento' },
  goals: { title: 'Metas', subtitle: 'Resultados por usuário e por equipe' },
  automations: { title: 'Automações', subtitle: 'Regras comerciais seguras e auditáveis' },
  metrics: { title: 'Métricas', subtitle: 'Desempenho, conversão e perdas' },
  prospecting: { title: 'Garimpo', subtitle: 'Busca, captura, validação e envio de novos leads' },
  settings: { title: 'Configurações', subtitle: 'Workspace, dados, integração e segurança' },
}
