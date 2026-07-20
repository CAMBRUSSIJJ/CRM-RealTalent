import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { UserProfile } from '../../domain/types'
import { DEMO_USER } from '../../domain/defaults'
import { effectiveDataMode } from '../../lib/env'
import { getSupabaseClient } from '../../lib/supabase'
import { readLocalProfile, writeLocalProfile } from '../../lib/local-experience'

interface AuthContextValue {
  user: UserProfile | null
  loading: boolean
  mode: 'local' | 'supabase'
  recoveryMode: boolean
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string, displayName: string): Promise<{ confirmationRequired: boolean }>
  signOut(): Promise<void>
  requestPasswordReset(email: string): Promise<void>
  updatePassword(password: string): Promise<void>
  resendConfirmation(email: string): Promise<void>
  updateProfile(displayName: string): Promise<void>
  clearRecovery(): void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const mapUser = (sessionUser: { id: string; email?: string; user_metadata: Record<string, unknown> } | null | undefined): UserProfile | null => sessionUser ? ({
  id: sessionUser.id,
  email: sessionUser.email ?? '',
  displayName: String(sessionUser.user_metadata.full_name ?? sessionUser.user_metadata.name ?? sessionUser.email?.split('@')[0] ?? 'Usuário'),
  avatarUrl: typeof sessionUser.user_metadata.avatar_url === 'string' ? sessionUser.user_metadata.avatar_url : null,
}) : null

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<UserProfile | null>(() => {
    if (effectiveDataMode !== 'local') return null
    const profile = readLocalProfile()
    return { ...DEMO_USER, id: 'local-user', email: profile.email, displayName: profile.displayName }
  })
  const [loading, setLoading] = useState(effectiveDataMode === 'supabase')
  const [recoveryMode, setRecoveryMode] = useState(false)

  useEffect(() => {
    if (effectiveDataMode !== 'local') return
    const syncProfile = () => {
      const profile = readLocalProfile()
      setUser({ ...DEMO_USER, id: 'local-user', email: profile.email, displayName: profile.displayName })
    }
    window.addEventListener('crm:local-profile-changed', syncProfile)
    return () => window.removeEventListener('crm:local-profile-changed', syncProfile)
  }, [])

  useEffect(() => {
    if (effectiveDataMode === 'local') return
    const client = getSupabaseClient()
    if (!client) { setLoading(false); return }
    void client.auth.getSession().then(({ data }) => { setUser(mapUser(data.session?.user)); setLoading(false) })
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      setUser(mapUser(session?.user)); setLoading(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user, loading, mode: effectiveDataMode, recoveryMode,
    async signIn(email, password) {
      if (effectiveDataMode === 'local') {
        const profile = { email: email.trim().toLowerCase(), displayName: email.split('@')[0] || 'Usuário local' }
        writeLocalProfile(profile); setUser({ ...DEMO_USER, id: 'local-user', ...profile }); return
      }
      const client = getSupabaseClient(); if (!client) throw new Error('Supabase não configurado.')
      const { error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }); if (error) throw error
    },
    async signUp(email, password, displayName) {
      if (password.length < 8) throw new Error('Use uma senha com pelo menos 8 caracteres.')
      if (effectiveDataMode === 'local') {
        const profile = { email: email.trim().toLowerCase(), displayName: displayName.trim() || email.split('@')[0] || 'Usuário local' }
        writeLocalProfile(profile); setUser({ ...DEMO_USER, id: 'local-user', ...profile }); return { confirmationRequired: false }
      }
      const client = getSupabaseClient(); if (!client) throw new Error('Supabase não configurado.')
      const { data, error } = await client.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { full_name: displayName.trim() }, emailRedirectTo: window.location.origin } }); if (error) throw error
      return { confirmationRequired: !data.session }
    },
    async signOut() {
      if (effectiveDataMode === 'local') return
      const client = getSupabaseClient(); if (!client) return
      const { error } = await client.auth.signOut(); if (error) throw error
    },
    async requestPasswordReset(email) {
      if (effectiveDataMode === 'local') return
      const client = getSupabaseClient(); if (!client) throw new Error('Supabase não configurado.')
      const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${window.location.origin}/?recovery=1` }); if (error) throw error
    },
    async updatePassword(password) {
      if (password.length < 8) throw new Error('Use uma senha com pelo menos 8 caracteres.')
      if (effectiveDataMode === 'local') { setRecoveryMode(false); return }
      const client = getSupabaseClient(); if (!client) throw new Error('Supabase não configurado.')
      const { error } = await client.auth.updateUser({ password }); if (error) throw error
      setRecoveryMode(false)
      window.history.replaceState({}, document.title, window.location.pathname)
    },
    async resendConfirmation(email) {
      if (effectiveDataMode === 'local') return
      const client = getSupabaseClient(); if (!client) throw new Error('Supabase não configurado.')
      const { error } = await client.auth.resend({ type: 'signup', email: email.trim().toLowerCase(), options: { emailRedirectTo: window.location.origin } }); if (error) throw error
    },
    async updateProfile(displayName) {
      const name = displayName.trim(); if (name.length < 2) throw new Error('Informe um nome válido.')
      if (effectiveDataMode === 'local') {
        const currentProfile = readLocalProfile(); writeLocalProfile({ ...currentProfile, displayName: name })
        setUser((current) => current ? { ...current, displayName: name } : current); return
      }
      const client = getSupabaseClient(); if (!client) throw new Error('Supabase não configurado.')
      const { data, error } = await client.auth.updateUser({ data: { full_name: name } }); if (error) throw error
      setUser(mapUser(data.user))
    },
    clearRecovery() { setRecoveryMode(false) },
  }), [loading, recoveryMode, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth deve ser usado dentro de AuthProvider.')
  return value
}
