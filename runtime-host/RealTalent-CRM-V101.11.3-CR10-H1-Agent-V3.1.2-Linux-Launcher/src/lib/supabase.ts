import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, hasSupabaseConfig } from './env'
import type { Database } from './supabase.types'

let client: SupabaseClient<Database> | null = null

export const getSupabaseClient = () => {
  if (!hasSupabaseConfig) return null
  if (!client) {
    client = createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}
