/** Backoff for gateway probes. A bad user session or service credential must not be hammered. */
export const gatewayAuthFailure = (status: number, error: string | undefined) =>
  status === 401 || error === 'runtime_upstream_auth_rejected'

export const gatewayPollRetryDelayMs = (status: number, error: string | undefined, consecutiveFailures: number): number => {
  if (gatewayAuthFailure(status, error)) return 120_000
  const count = Number.isFinite(consecutiveFailures) ? Math.max(1, Math.floor(consecutiveFailures)) : 1
  return Math.min(60_000, 5000 * 2 ** Math.min(count, 4))
}
