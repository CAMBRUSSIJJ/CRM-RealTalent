import {
  BarChart3, CalendarDays, ContactRound, Goal, LayoutDashboard, ListChecks, MapPinned, Phone, MessageSquareMore, ReceiptText,
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
  { route: 'commercial-map', label: 'Mapa de Leads', icon: MapPinned, phase: 'ready', group: 'Operação' },
  { route: 'pipeline', label: 'Pipeline', icon: Workflow, phase: 'ready', group: 'Operação' },
  { route: 'followups', label: 'Follow-ups', icon: ListChecks, phase: 'ready', group: 'Operação' },
  { route: 'calls', label: 'Ligações', icon: Phone, phase: 'ready', group: 'Operação' },
  { route: 'communications', label: 'Comunicações', icon: MessageSquareMore, phase: 'ready', group: 'Operação' },
  { route: 'proposals', label: 'Propostas', icon: ReceiptText, phase: 'ready', group: 'Operação' },
  { route: 'agenda', label: 'Agenda', icon: CalendarDays, phase: 'ready', group: 'Operação' },
  { route: 'playbooks', label: 'Playbooks', icon: BookOpenText, phase: 'foundation', group: 'Estratégia' },
  { route: 'goals', label: 'Metas', icon: Goal, phase: 'ready', group: 'Estratégia' },
  { route: 'automations', label: 'Automações', icon: Sparkles, phase: 'ready', group: 'Estratégia' },
  { route: 'prospecting', label: 'Garimpo', icon: Pickaxe, phase: 'ready', group: 'Estratégia' },
  { route: 'metrics', label: 'Métricas', icon: BarChart3, phase: 'ready', group: 'Estratégia' },
  { route: 'settings', label: 'Configurações', icon: Settings, phase: 'ready', group: 'Sistema' },
]

export const routeTitles: Record<AppRoute, { title: string; subtitle: string }> = {
  dashboard: { title: 'Meu Dia', subtitle: 'Prioridades, próximos contatos e ritmo comercial' },
  leads: { title: 'Leads', subtitle: 'Contatos, responsáveis e próximas ações' },
  'commercial-map': { title: 'Mapa de Leads', subtitle: 'Localização, filtros, geocodificação e inteligência territorial' },
  pipeline: { title: 'Pipeline', subtitle: 'Negócios, etapas e riscos da operação' },
  followups: { title: 'Follow-ups', subtitle: 'Cadências, fila diária e próximos contatos' },
  calls: { title: 'Ligações', subtitle: 'Fila, roteiro e histórico de chamadas' },
  communications: { title: 'Comunicações', subtitle: 'E-mail, WhatsApp, calendário e timeline unificada' },
  proposals: { title: 'Propostas e Forecast', subtitle: 'Produtos, propostas, receita e previsão comercial' },
  agenda: { title: 'Agenda', subtitle: 'Reuniões, tarefas e compromissos comerciais' },
  playbooks: { title: 'Playbooks', subtitle: 'Scripts, objeções e padrões de atendimento' },
  goals: { title: 'Metas', subtitle: 'Resultados por usuário e por equipe' },
  automations: { title: 'Automações', subtitle: 'Regras comerciais seguras e auditáveis' },
  metrics: { title: 'Métricas', subtitle: 'Desempenho, conversão e perdas' },
  prospecting: { title: 'Garimpo', subtitle: 'Busca, captura, validação e envio de novos leads' },
  settings: { title: 'Configurações', subtitle: 'Empresa, dados, integrações e segurança' },
}
