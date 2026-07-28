import { safeStorage } from '../lib/storage'

export type CallQueueDensity = 'comfortable' | 'compact'

export interface CallDisplayPreferences {
  showSummaryStrip: boolean
  showQueueReason: boolean
  showLastCall: boolean
  queueDensity: CallQueueDensity
  showQueueSidebar: boolean
  showScriptProgress: boolean
  showObjective: boolean
  showCoaching: boolean
  showQuickResponses: boolean
  showObjections: boolean
  showNotes: boolean
  showLeadContext: boolean
  showHistory: boolean
  showRecording: boolean
  showTranscript: boolean
  showTeamPlaybook: boolean
}

export const DEFAULT_CALL_DISPLAY_PREFERENCES: CallDisplayPreferences = {
  showSummaryStrip: true,
  showQueueReason: true,
  showLastCall: false,
  queueDensity: 'compact',
  showQueueSidebar: true,
  showScriptProgress: true,
  showObjective: true,
  showCoaching: true,
  showQuickResponses: true,
  showObjections: true,
  showNotes: true,
  showLeadContext: true,
  showHistory: true,
  showRecording: false,
  showTranscript: false,
  showTeamPlaybook: false,
}

const STORAGE_PREFIX = 'realtalent-crm-v100465-call-display:'
const key = (workspaceId: string) => `${STORAGE_PREFIX}${workspaceId || 'default'}`

export function normalizeCallDisplayPreferences(value: Partial<CallDisplayPreferences> | null | undefined): CallDisplayPreferences {
  const raw = value && typeof value === 'object' ? value : {}
  return {
    ...DEFAULT_CALL_DISPLAY_PREFERENCES,
    ...Object.fromEntries(Object.keys(DEFAULT_CALL_DISPLAY_PREFERENCES).map((field) => [field, typeof raw[field as keyof CallDisplayPreferences] === 'boolean' ? raw[field as keyof CallDisplayPreferences] : DEFAULT_CALL_DISPLAY_PREFERENCES[field as keyof CallDisplayPreferences]])),
    queueDensity: raw.queueDensity === 'comfortable' ? 'comfortable' : 'compact',
  } as CallDisplayPreferences
}

export function readCallDisplayPreferences(workspaceId: string): CallDisplayPreferences {
  try {
    const raw = safeStorage.getItem(key(workspaceId))
    return normalizeCallDisplayPreferences(raw ? JSON.parse(raw) as Partial<CallDisplayPreferences> : null)
  } catch {
    return { ...DEFAULT_CALL_DISPLAY_PREFERENCES }
  }
}

export function saveCallDisplayPreferences(workspaceId: string, preferences: CallDisplayPreferences) {
  safeStorage.setItem(key(workspaceId), JSON.stringify(normalizeCallDisplayPreferences(preferences)))
}

export const callDisplayPreferenceGroups: Array<{ title: string; items: Array<{ key: keyof CallDisplayPreferences; label: string; description: string }> }> = [
  {
    title: 'Página de Ligações',
    items: [
      { key: 'showSummaryStrip', label: 'Resumo do dia', description: 'Indicadores compactos acima da fila.' },
      { key: 'showQueueReason', label: 'Motivo da prioridade', description: 'Exibe por que cada lead entrou na fila.' },
      { key: 'showLastCall', label: 'Última ligação na fila', description: 'Mostra a última tentativa diretamente na linha.' },
    ],
  },
  {
    title: 'Sessão de ligações',
    items: [
      { key: 'showQueueSidebar', label: 'Fila lateral', description: 'Mostra contatos concluídos, atual e próximos.' },
      { key: 'showScriptProgress', label: 'Progresso do roteiro', description: 'Exibe as macrofases da conversa.' },
      { key: 'showObjective', label: 'Objetivo da etapa', description: 'Mantém o objetivo comercial visível.' },
      { key: 'showCoaching', label: 'Orientação do roteiro', description: 'Exibe a orientação de condução da etapa.' },
      { key: 'showQuickResponses', label: 'Respostas rápidas', description: 'Mostra botões para registrar e avançar.' },
    ],
  },
  {
    title: 'Painel de apoio',
    items: [
      { key: 'showObjections', label: 'Objeções', description: 'Respostas sugeridas para objeções frequentes.' },
      { key: 'showNotes', label: 'Notas e descoberta', description: 'Anotações e campos de diagnóstico.' },
      { key: 'showLeadContext', label: 'Contexto do lead', description: 'Etapa, temperatura, responsável e tags.' },
      { key: 'showHistory', label: 'Histórico', description: 'Últimas ligações e atividades.' },
    ],
  },
  {
    title: 'Ferramentas opcionais',
    items: [
      { key: 'showRecording', label: 'Gravação', description: 'Controles de gravação com consentimento.' },
      { key: 'showTranscript', label: 'Transcrição', description: 'Campo de transcrição no encerramento.' },
      { key: 'showTeamPlaybook', label: 'Material complementar', description: 'Playbooks adicionais da equipe.' },
    ],
  },
]
