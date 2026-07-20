export type DataMode = 'local' | 'supabase' | 'auto'

const clean = (value: string | undefined) => value?.trim() ?? ''

export const env = {
  appName: clean(import.meta.env.VITE_APP_NAME) || 'RealTalent CRM',
  dataMode: (clean(import.meta.env.VITE_DATA_MODE) || 'auto') as DataMode,
  supabaseUrl: clean(import.meta.env.VITE_SUPABASE_URL),
  supabasePublishableKey: clean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
}

export const hasSupabaseConfig = Boolean(
  env.supabaseUrl.startsWith('https://') &&
    env.supabasePublishableKey &&
    !env.supabaseUrl.includes('SEU-PROJETO'),
)

const hasSupabaseConfigurationIntent = env.dataMode === 'supabase' || (env.dataMode === 'auto' && Boolean(env.supabaseUrl || env.supabasePublishableKey))

export const configurationError = hasSupabaseConfigurationIntent && !hasSupabaseConfig
  ? 'O ambiente foi configurado para Supabase, mas a URL ou a chave pública estão ausentes ou inválidas. Corrija VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY antes de usar o CRM.'
  : null

export const effectiveDataMode: Exclude<DataMode, 'auto'> =
  env.dataMode === 'supabase'
    ? 'supabase'
    : env.dataMode === 'local'
      ? 'local'
      : hasSupabaseConfig
        ? 'supabase'
        : 'local'
