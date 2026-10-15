import { describe, expect, it } from 'vitest'
import { assertFieldWrite, can, canUseIntegrationScope, inspectPermissions } from './permission-engine'
import type { PermissionSubject } from './types'

const subject = (role: PermissionSubject['role']): PermissionSubject => ({ workspaceId: 'ws-1', userId: 'user-1', role })

describe('V101.9.6 Permission Matrix', () => {
  it('preserva leitura para viewer e bloqueia mutações', () => {
    expect(can(subject('viewer'), { action: 'read', resource: 'contact' })).toBe(true)
    expect(can(subject('viewer'), { action: 'update', resource: 'contact' })).toBe(false)
    expect(can(subject('viewer'), { action: 'delete', resource: 'opportunity' })).toBe(false)
  })

  it('bloqueia administração de workspace para membro', () => {
    expect(can(subject('member'), { action: 'manage', resource: 'workspace' })).toBe(false)
    expect(can(subject('admin'), { action: 'manage', resource: 'workspace' })).toBe(true)
  })

  it('protege campos estruturais mesmo para owner', () => {
    expect(() => assertFieldWrite(subject('owner'), 'contact', ['name', 'id'])).toThrow(/Campos estruturais/)
  })

  it('separa uso e administração de integrações', () => {
    expect(can(subject('member'), { action: 'execute', resource: 'integration' })).toBe(true)
    expect(can(subject('member'), { action: 'manage', resource: 'integration' })).toBe(false)
    expect(canUseIntegrationScope(subject('member'), 'gmail.send')).toBe(true)
    expect(canUseIntegrationScope(subject('viewer'), 'gmail.send')).toBe(false)
  })

  it('expõe inspeção determinística da matriz', () => {
    const inspection = inspectPermissions('member')
    expect(inspection.version).toBe('101.9.6')
    expect(inspection.permissions.find((item) => item.resource === 'workspace')?.actions).not.toContain('manage')
  })
})
