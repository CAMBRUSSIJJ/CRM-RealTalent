import type { WorkspaceMember } from '../domain/types'
import { createId } from '../lib/id'
import type { NewWorkspaceMemberInput } from './crm-repository'
import { clone, readDatabase, writeDatabase } from './local-repository-core'

const localMemberEmail = (displayName: string, email?: string) => {
  const normalized = (email ?? '').trim().toLowerCase()
  if (normalized) return normalized
  const localPart = displayName
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '') || 'membro'
  return `${localPart}@local.realtalent`
}

export const createLocalWorkspaceMember = (
  workspaceId: string,
  input: NewWorkspaceMemberInput,
): WorkspaceMember => {
  const db = readDatabase()
  const displayName = input.displayName.trim()
  if (displayName.length < 2) throw new Error('Informe o nome do membro.')

  const email = localMemberEmail(displayName, input.email)
  if (db.members.some((member) => member.workspaceId === workspaceId && member.email.toLowerCase() === email)) {
    throw new Error('Já existe um membro com este e-mail.')
  }

  const member: WorkspaceMember = {
    workspaceId,
    userId: createId('local-member'),
    displayName,
    email,
    avatarUrl: null,
    role: input.role ?? 'member',
    joinedAt: new Date().toISOString(),
  }
  db.members.push(member)
  writeDatabase(db)
  return clone(member)
}
