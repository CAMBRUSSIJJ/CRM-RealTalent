import { normalizeTeamWhatsAppNumber } from '../services/team-whatsapp-directory'
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

  const phone = (input.whatsappPhone ?? '').trim()
  const normalizedPhone = phone ? normalizeTeamWhatsAppNumber(phone) : null
  if (phone && !normalizedPhone) throw new Error('Informe um WhatsApp válido com DDD e código do país.')

  const member: WorkspaceMember = {
    workspaceId,
    userId: createId('local-member'),
    displayName,
    email,
    avatarUrl: null,
    role: input.role ?? 'member',
    joinedAt: new Date().toISOString(),
    whatsappPhone: normalizedPhone,
    whatsappConsentRecordedAt: null,
  }
  db.members.push(member)
  writeDatabase(db)
  return clone(member)
}

/** Updates the existing local workspace member in place — no duplicate directory. */
export const updateLocalWorkspaceMemberWhatsApp = (
  workspaceId: string,
  userId: string,
  rawPhone: string,
  consentDeclared: boolean,
  automaticRequested = false,
): WorkspaceMember => {
  const db = readDatabase()
  const member = db.members.find(item => item.workspaceId === workspaceId && item.userId === userId)
  if (!member) throw new Error('Integrante não encontrado neste workspace.')
  const input = rawPhone.trim()
  const phone = input ? normalizeTeamWhatsAppNumber(input) : null
  if (input && !phone) throw new Error('Informe um WhatsApp válido com DDD e código do país.')
  const priorPhone = member.whatsappPhone || null
  member.whatsappPhone = phone
  // A number change always clears the previous declaration. An admin can
  // explicitly record *new* consent, but this is never OTP verification.
  member.whatsappConsentRecordedAt = phone && consentDeclared
    ? (priorPhone === phone && member.whatsappConsentRecordedAt ? member.whatsappConsentRecordedAt : new Date().toISOString())
    : null
  member.whatsappAutoEnabledAt = member.whatsappConsentRecordedAt && automaticRequested
    ? (priorPhone === phone && member.whatsappAutoEnabledAt ? member.whatsappAutoEnabledAt : new Date().toISOString())
    : null
  writeDatabase(db)
  return clone(member)
}
