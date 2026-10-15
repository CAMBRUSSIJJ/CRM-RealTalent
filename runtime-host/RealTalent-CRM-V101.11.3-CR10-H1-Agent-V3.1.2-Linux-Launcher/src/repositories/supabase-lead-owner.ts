import type { Lead, WorkspaceMember } from '../domain/types'
import type { LeadRow } from './supabase-repository-mappers'
import { mapLead } from './supabase-repository-mappers'

export const leadOwnerName = (members: WorkspaceMember[], ownerId: string | null | undefined) => {
  if (!ownerId) return 'Equipe'
  return members.find((member) => member.userId === ownerId)?.displayName ?? 'Usuário removido'
}

export const mapLeadWithWorkspaceOwner = (row: LeadRow, members: WorkspaceMember[]): Lead =>
  mapLead(row, leadOwnerName(members, row.owner_id))

export const mapLeadsWithWorkspaceOwners = (rows: LeadRow[], members: WorkspaceMember[]): Lead[] => {
  const names = new Map(members.map((member) => [member.userId, member.displayName]))
  return rows.map((row) => mapLead(row, row.owner_id ? names.get(row.owner_id) ?? 'Usuário removido' : 'Equipe'))
}
