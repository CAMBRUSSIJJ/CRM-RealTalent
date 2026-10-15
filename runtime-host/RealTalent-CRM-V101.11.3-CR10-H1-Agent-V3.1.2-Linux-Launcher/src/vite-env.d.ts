/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly PROD: boolean
  readonly VITE_DATA_MODE?: 'local' | 'supabase' | 'auto'
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_APP_NAME?: string
  readonly VITE_RELEASE_CHANNEL?: string
  readonly VITE_COMMIT_SHA?: string
  readonly VITE_COMMUNICATIONS_GATEWAY_URL?: string
  readonly VITE_AGENT_GATEWAY_URL?: string
  readonly VITE_AGENT_CONTROL_URL?: string
  readonly VITE_BLUE_OCEAN_URL?: string
  readonly VITE_PROSPECTING_GATEWAY_URL?: string
  readonly VITE_REALTALENT_CONNECT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
