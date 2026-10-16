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
  enterLocal(): Promise<void>
  signUp(email: string, password: string, displayName: string): Promise<{ confirmationRequired: boolean }>
  signOut(): Promise<void>
  requestPasswordReset(email: string): Promise<void>
  updatePassword(password: string): Promise<void>
  resendConfirmation(email: string): Promise<void>
  updateProfile(displayName: string): Promise<void>
  clearRecovery(): void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const SESSION_BOOT_TIMEOUT_MS = 6000
const LOCAL_SESSION_KEY = 'realtalent-crm-local-ui-session-v1'

const hasLocalUiSession = () => {
  try { return window.sessionStorage.getItem(LOCAL_SESSION_KEY) === 'active' } catch { return false }
}
const setLocalUiSession = (active: boolean) => {
  try {
    if (active) window.sessionStorage.setItem(LOCAL_SESSION_KEY, 'active')
    else window.sessionStorage.removeItem(LOCAL_SESSION_KEY)
  } catch { /* Session storage can be unavailable in hardened/private contexts. */ }
}

const mapUser = (sessionUser: { id: string; email?: string; user_metadata: Record<string, unknown> } | null | undefined): UserProfile | null => sessionUser ? ({
  id: sessionUser.id,
  email: sessionUser.email ?? '',
  displayName: String(sessionUser.user_metadata.full_name ?? sessionUser.user_metadata.name ?? sessionUser.email?.split('@')[0] ?? 'Usuário'),
  avatarUrl: typeof sessionUser.user_metadata.avatar_url === 'string' ? sessionUser.user_metadata.avatar_url : null,
}) : null

export const sameUserProfile = (current: UserProfile | null, next: UserProfile | null) => {
  if (current === next) return true
  if (!current || !next) return false
  return current.id === next.id
    && current.email === next.email
    && current.displayName === next.displayName
    && current.avatarUrl === next.avatarUrl
}

const preserveStableUserReference = (current: UserProfile | null, next: UserProfile | null) => sameUserProfile(current, next) ? current : next

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<UserProfile | null>(() => {
    if (effectiveDataMode !== 'local' || !hasLocalUiSession()) return null
    const profile = readLocalProfile()
    return { ...DEMO_USER, id: 'local-user', email: profile.email, displayName: profile.displayName }
  })
  const [loading, setLoading] = useState(effectiveDataMode === 'supabase')
  const [recoveryMode, setRecoveryMode] = useState(false)

  useEffect(() => {
    if (effectiveDataMode !== 'local') return
    const syncProfile = () => {
      const profile = readLocalProfile()
      const nextUser = { ...DEMO_USER, id: 'local-user', email: profile.email, displayName: profile.displayName }
      setUser((current) => current ? preserveStableUserReference(current, nextUser) : null)
    }
    window.addEventListener('crm:local-profile-changed', syncProfile)
    return () => window.removeEventListener('crm:local-profile-changed', syncProfile)
  }, [])

  useEffect(() => {
    if (effectiveDataMode === 'local') return
    const client = getSupabaseClient()
    if (!client) { setUser(null); setLoading(false); return }

    let active = true
    let settled = false
    const commitUser = (nextUser: UserProfile | null) => {
      setUser((current) => preserveStableUserReference(current, nextUser))
    }
    const finishInitialSessionCheck = (nextUser: UserProfile | null) => {
      if (!active || settled) return
      settled = true
      commitUser(nextUser)
      setLoading(false)
    }

    const timeout = window.setTimeout(() => {
      if (!active || settled) return
      console.warn(`[RealTalent auth] sessão inicial excedeu ${SESSION_BOOT_TIMEOUT_MS}ms; exibindo login como fallback seguro.`)
      finishInitialSessionCheck(null)
    }, SESSION_BOOT_TIMEOUT_MS)

    void client.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error
        finishInitialSessionCheck(mapUser(data.session?.user))
      })
      .catch((error) => {
        console.warn('[RealTalent auth] não foi possível restaurar a sessão inicial; exibindo login.', error)
        finishInitialSessionCheck(null)
      })
      .finally(() => window.clearTimeout(timeout))

    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      commitUser(mapUser(session?.user))
      setLoading(false)
      settled = true
      window.clearTimeout(timeout)
    })

    return () => {
      active = false
      window.clearTimeout(timeout)
      listener.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user, loading, mode: effectiveDataMode, recoveryMode,
    async signIn(email, password) {
      if (effectiveDataMode === 'local') {
        const profile = { email: email.trim().toLowerCase(), displayName: email.split('@')[0] || 'Usuário local' }
        writeLocalProfile(profile); setLocalUiSession(true); setUser({ ...DEMO_USER, id: 'local-user', ...profile }); return
      }
      const client = getSupabaseClient(); if (!client) throw new Error('Supabase não configurado.')
      const { error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }); if (error) throw error
    },
    async enterLocal() {
      if (effectiveDataMode !== 'local') return
      const profile = readLocalProfile()
      setLocalUiSession(true)
      setUser({ ...DEMO_USER, id: 'local-user', email: profile.email, displayName: profile.displayName })
    },
    async signUp(email, password, displayName) {
      if (password.length < 8) throw new Error('Use uma senha com pelo menos 8 caracteres.')
      if (effectiveDataMode === 'local') {
        const profile = { email: email.trim().toLowerCase(), displayName: displayName.trim() || email.split('@')[0] || 'Usuário local' }
        writeLocalProfile(profile); setLocalUiSession(true); setUser({ ...DEMO_USER, id: 'local-user', ...profile }); return { confirmationRequired: false }
      }
      const client = getSupabaseClient(); if (!client) throw new Error('Supabase não configurado.')
      const { data, error } = await client.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { full_name: displayName.trim() }, emailRedirectTo: window.location.origin } }); if (error) throw error
      return { confirmationRequired: !data.session }
    },
    async signOut() {
      if (effectiveDataMode === 'local') {
        setLocalUiSession(false)
        setRecoveryMode(false)
        setUser(null)
        return
      }
      const client = getSupabaseClient(); if (!client) return
      const { error } = await client.auth.signOut(); if (error) throw error
      setRecoveryMode(false)
      setUser(null)
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
      const nextUser = mapUser(data.user)
      setUser((current) => preserveStableUserReference(current, nextUser))
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
