export type DataMode = 'local' | 'supabase' | 'auto'

const clean = (value: string | undefined) => value?.trim() ?? ''
const hosted = Boolean(import.meta.env.PROD)

export const env = {
  appName: clean(import.meta.env.VITE_APP_NAME) || 'RealTalent CRM',
  dataMode: (clean(import.meta.env.VITE_DATA_MODE) || 'auto') as DataMode,
  supabaseUrl: clean(import.meta.env.VITE_SUPABASE_URL),
  supabasePublishableKey: clean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
  releaseChannel: clean(import.meta.env.VITE_RELEASE_CHANNEL) || 'development',
  commitSha: clean(import.meta.env.VITE_COMMIT_SHA) || 'local',
  agentGatewayUrl: clean(import.meta.env.VITE_AGENT_GATEWAY_URL) || (hosted ? '/api/runtime/agent' : 'http://127.0.0.1:8791'),
  agentControlUrl: clean(import.meta.env.VITE_AGENT_CONTROL_URL),
  blueOceanUrl: clean(import.meta.env.VITE_BLUE_OCEAN_URL) || (hosted ? '' : 'http://127.0.0.1:4173/'),
  communicationsGatewayUrl: clean(import.meta.env.VITE_COMMUNICATIONS_GATEWAY_URL) || (hosted ? '/api/runtime/communications' : '/__rt/communications'),
  prospectingGatewayUrl: clean(import.meta.env.VITE_PROSPECTING_GATEWAY_URL) || (hosted ? '/api/runtime/prospecting' : 'http://127.0.0.1:4319'),
  connectGatewayUrl: clean(import.meta.env.VITE_REALTALENT_CONNECT_URL) || (hosted ? '' : 'http://localhost:3001'),
  hosted,
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
