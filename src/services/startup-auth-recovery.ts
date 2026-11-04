/**
 * Bounded recovery for initial read-only Supabase workspace queries.
 *
 * On a second browser a stale JWT may still be present when the initial
 * organization membership request runs. Never silently switch to local mode,
 * never replay writes, and never retry indefinitely.
 */
const statusOf = (error: unknown): number => {
  if (!error || typeof error !== 'object') return 0
  const raw = (error as { status?: unknown }).status
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? numeric : 0
}

const errorText = (error: unknown) => {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; code?: unknown }
    return [value.message, value.code].map(String).join(' ')
  }
  return String(error || '')
}

export const isExpiredStartupSession = (error: unknown): boolean => {
  const text = errorText(error)
  return statusOf(error) === 401 ||
    /PGRST301|invalid (?:jwt|token)|jwt expired|expired (?:jwt|token)|token has expired|invalid refresh token/i.test(text)
}

export const isTransientStartupFailure = (error: unknown): boolean => {
  const code = statusOf(error)
  if ([408, 429, 500, 502, 503, 504].includes(code)) return true
  return /(?:network request failed|failed to fetch|fetch failed|networkerror|temporarily unavailable|timed? out|timeout)/i.test(errorText(error))
}

export async function recoverStartupRead<T>(
  operation: () => Promise<T>,
  refreshAuth: () => Promise<boolean>,
  delay: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<T> {
  let authenticationRetried = false
  let transientRetried = false
  for (;;) {
    try {
      return await operation()
    } catch (error) {
      if (!authenticationRetried && isExpiredStartupSession(error)) {
        authenticationRetried = true
        const renewed = await refreshAuth().catch(() => false)
        if (!renewed) throw new Error('Sua sessão no navegador expirou. Entre novamente para acessar os dados do CRM.')
        continue
      }
      if (!transientRetried && isTransientStartupFailure(error)) {
        transientRetried = true
        await delay(450)
        continue
      }
      throw error
    }
  }
}
