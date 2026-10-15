export type CommercialFailureKind = 'session' | 'offline' | 'conflict' | 'approval' | 'permission' | 'sync' | 'unknown'

export interface CommercialFailureRecovery {
  kind: CommercialFailureKind
  title: string
  message: string
  actionLabel: string | null
  retryable: boolean
  preservesDraft: boolean
}

const textOf = (error: unknown) => error instanceof Error ? error.message : String(error ?? '')

export function classifyCommercialFailure(error: unknown): CommercialFailureRecovery {
  const raw = textOf(error).toLowerCase()
  if (/jwt|session|refresh token|not authenticated|auth session|token.*expired|sess[aã]o.*expir/.test(raw)) return {
    kind: 'session', title: 'Sua sessão expirou', message: 'O rascunho foi preservado. Entre novamente e repita a ação.', actionLabel: 'Entrar novamente', retryable: false, preservesDraft: true,
  }
  if (/offline|network|fetch failed|failed to fetch|networkerror|econn|timeout|gateway.*indispon|sem conex/.test(raw)) return {
    kind: 'offline', title: 'Sem conexão com o serviço', message: 'Nada foi descartado. Verifique a conexão e tente novamente.', actionLabel: 'Tentar novamente', retryable: true, preservesDraft: true,
  }
  if (/conflict|409|version|stale|já foi alterad|concorr/.test(raw)) return {
    kind: 'conflict', title: 'Este registro mudou em outra sessão', message: 'Seu conteúdo foi preservado. Atualize os dados antes de substituir a versão mais recente.', actionLabel: 'Atualizar dados', retryable: true, preservesDraft: true,
  }
  if (/aprova|approval|pending approval|precisa de aprovação/.test(raw)) return {
    kind: 'approval', title: 'Aprovação comercial necessária', message: textOf(error) || 'A operação está aguardando aprovação do responsável.', actionLabel: null, retryable: false, preservesDraft: true,
  }
  if (/permission|permiss|forbidden|403|row-level security|rls|not allowed/.test(raw)) return {
    kind: 'permission', title: 'Seu perfil não permite esta ação', message: 'Os dados digitados foram preservados. Solicite acesso a um gestor se precisar concluir esta etapa.', actionLabel: null, retryable: false, preservesDraft: true,
  }
  if (/sync|sincron|realtime|replication/.test(raw)) return {
    kind: 'sync', title: 'Sincronização incompleta', message: 'A ação não foi confirmada. Atualize os dados antes de repetir para evitar duplicidade.', actionLabel: 'Atualizar dados', retryable: true, preservesDraft: true,
  }
  return { kind: 'unknown', title: 'Não foi possível concluir a ação', message: textOf(error) || 'O CRM preservou o contexto desta operação para você tentar novamente.', actionLabel: 'Tentar novamente', retryable: true, preservesDraft: true }
}

export function writeRecoveryDraft(key: string, value: unknown) {
  try { window.sessionStorage.setItem(`rt-recovery:${key}`, JSON.stringify({ savedAt: new Date().toISOString(), value })) } catch { /* hardened/private browser */ }
}

export function readRecoveryDraft<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(`rt-recovery:${key}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { value?: T }
    return parsed.value ?? null
  } catch { return null }
}

export function clearRecoveryDraft(key: string) {
  try { window.sessionStorage.removeItem(`rt-recovery:${key}`) } catch { /* hardened/private browser */ }
}
