import type { Lead, WorkspaceMember } from '../domain/types'
import { getSupabaseClient } from '../lib/supabase'
import { SupabaseCrmRepository } from './supabase-crm-repository'

/**
 * Compatibility boundary for Supabase behaviors whose legacy schema no longer
 * matches the current application model exactly.
 *
 * Keep these reconciliations in one place until the underlying database
 * contracts can be upgraded in a controlled migration.
 */
export class SupabaseCommercialConsistencyRepository extends SupabaseCrmRepository {
  /**
   * organization_members.user_id references auth.users, not public.profiles.
   * PostgREST therefore cannot infer an embedded `profiles!inner(...)` relation.
   * Load the public membership rows and coworker profiles independently and
   * reconcile them by user id instead of relying on a non-existent FK.
   */
  override async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const client = getSupabaseClient()
    if (!client) throw new Error('Supabase não configurado. Verifique o arquivo .env.')

    const { data: members, error: membersError } = await client
      .from('organization_members')
      .select('organization_id,user_id,role,created_at')
      .eq('organization_id', workspaceId)
      .order('created_at')
    if (membersError) throw membersError

    const userIds = [...new Set((members ?? []).map((row) => row.user_id).filter(Boolean))]
    const profilesById = new Map<string, { displayName: string; avatarUrl: string | null }>()

    if (userIds.length) {
      const { data: profiles, error: profilesError } = await client
        .from('profiles')
        .select('id,display_name,avatar_url')
        .in('id', userIds)
      if (profilesError) throw profilesError

      for (const profile of profiles ?? []) {
        profilesById.set(profile.id, {
          displayName: profile.display_name ?? '',
          avatarUrl: profile.avatar_url ?? null,
        })
      }
    }

    const { data: authData } = await client.auth.getUser()
    const currentUser = authData.user

    return (members ?? []).map((row) => {
      const profile = profilesById.get(row.user_id)
      const email = currentUser?.id === row.user_id ? (currentUser.email ?? '') : ''
      const displayName = profile?.displayName?.trim() || (email ? email.split('@')[0] : 'Usuário')
      return {
        workspaceId: row.organization_id,
        userId: row.user_id,
        displayName,
        email,
        avatarUrl: profile?.avatarUrl ?? null,
        role: row.role,
        joinedAt: row.created_at,
      }
    })
  }

  override async moveLead(leadId: string, stageId: string, lossReason?: string | null): Promise<Lead> {
    const moved = await super.moveLead(leadId, stageId, lossReason)
    return super.updateLead(leadId, {
      stageId: moved.stageId,
      status: moved.status,
    })
  }
}
