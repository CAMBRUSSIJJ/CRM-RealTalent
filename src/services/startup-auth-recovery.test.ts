import { describe, expect, it, vi } from 'vitest'
import { isExpiredStartupSession, isTransientStartupFailure, recoverStartupRead } from './startup-auth-recovery'

describe('recovery of initial CRM workspaces on Vercel', () => {
  it('renews an expired authenticated JWT once before retrying organization memberships', async () => {
    const operation = vi.fn().mockRejectedValueOnce({ status: 401, message: 'JWT expired' }).mockResolvedValueOnce([{ id: 'workspace-ok' }])
    const refresh = vi.fn().mockResolvedValue(true)
    await expect(recoverStartupRead(operation, refresh)).resolves.toEqual([{ id: 'workspace-ok' }])
    expect(operation).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('requires explicit login when refresh fails instead of silently using local mode', async () => {
    const operation = vi.fn().mockRejectedValue({ status: 401, message: 'JWT expired' })
    const refresh = vi.fn().mockResolvedValue(false)
    await expect(recoverStartupRead(operation, refresh)).rejects.toThrow(/sessão no navegador expirou/i)
    expect(operation).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('limits 401 refresh to one attempt even when the token is still rejected', async () => {
    const operation = vi.fn().mockRejectedValue({ status: 401, message: 'invalid JWT' })
    const refresh = vi.fn().mockResolvedValue(true)
    await expect(recoverStartupRead(operation, refresh)).rejects.toMatchObject({ status: 401 })
    expect(operation).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('retries a temporary network failure once without modifying session', async () => {
    const operation = vi.fn().mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValueOnce(['ok'])
    const refresh = vi.fn()
    const delay = vi.fn().mockResolvedValue(undefined)
    await expect(recoverStartupRead(operation, refresh, delay)).resolves.toEqual(['ok'])
    expect(refresh).not.toHaveBeenCalled()
    expect(delay).toHaveBeenCalledWith(450)
  })

  it('does not retry forbidden workspace access (403) or authorization failures', async () => {
    const error = { status: 403, message: 'permission denied for workspace' }
    const operation = vi.fn().mockRejectedValue(error)
    const refresh = vi.fn()
    await expect(recoverStartupRead(operation, refresh)).rejects.toBe(error)
    expect(operation).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('detects real token expiration without treating any 400 as an expired session', () => {
    expect(isExpiredStartupSession({ status: 401, message: 'Unauthorized' })).toBe(true)
    expect(isExpiredStartupSession({ code: 'PGRST301', message: 'JWT expired' })).toBe(true)
    expect(isExpiredStartupSession({ status: 400, message: 'Invalid input' })).toBe(false)
    expect(isTransientStartupFailure({ status: 503 })).toBe(true)
    expect(isTransientStartupFailure({ status: 403 })).toBe(false)
  })
})
