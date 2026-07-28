export type ExtensionProductKey = 'realtalent_capture' | 'realtalent_social' | 'realtalent_linkedin_assistant' | 'realtalent_maps_capture'

export interface RemoteExtensionSettings {
  enabled: boolean
  destination: 'garimpo' | 'crm'
  require_confirmation: boolean
  duplicate_policy: 'skip' | 'update' | 'create'
  minimum_version: string
  recommended_version: string
  max_batch_size: number
  process_interval_ms: number
  close_tab_after_analysis: boolean
  allowed_sources: string[]
  settings: Record<string, unknown>
  config_version: number
}

export interface ExtensionClientOptions {
  supabaseUrl: string
  organizationId: string
  productKey?: ExtensionProductKey
  installationKey: string
  displayName: string
  appVersion: string
  manifestVersion?: number
  browser?: string
  browserVersion?: string
  platform?: string
  permissions?: string[]
  capabilities?: string[]
  getUserAccessToken(): Promise<string>
  getIngestToken(): Promise<string>
}

export interface CaptureLeadPayload {
  externalId?: string
  name?: string
  company?: string
  phone?: string
  email?: string
  city?: string
  address?: string
  cnpj?: string
  instagram?: string
  website?: string
  bookingUrl?: string
  systemName?: string
  description?: string
  sourceDetail?: string
  notes?: string
  [key: string]: unknown
}

const cleanUrl = (value: string) => value.replace(/\/$/, '')
const readJson = async (response: Response) => response.json().catch(() => ({})) as Record<string, unknown>

export class RealTalentExtensionClient {
  private readonly options: Required<Omit<ExtensionClientOptions, 'getUserAccessToken' | 'getIngestToken'>> & Pick<ExtensionClientOptions, 'getUserAccessToken' | 'getIngestToken'>
  installationId = ''
  settings: RemoteExtensionSettings | null = null

  constructor(options: ExtensionClientOptions) {
    this.options = {
      ...options,
      supabaseUrl: cleanUrl(options.supabaseUrl),
      productKey: options.productKey ?? 'realtalent_capture',
      manifestVersion: options.manifestVersion ?? 3,
      browser: options.browser ?? 'Chrome',
      browserVersion: options.browserVersion ?? '',
      platform: options.platform ?? navigator.platform,
      permissions: options.permissions ?? [],
      capabilities: options.capabilities ?? [],
    }
  }

  async register(metadata: Record<string, unknown> = {}) {
    const accessToken = await this.options.getUserAccessToken()
    const response = await fetch(`${this.options.supabaseUrl}/functions/v1/extension-register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        action: 'register', organizationId: this.options.organizationId, productKey: this.options.productKey,
        installationKey: this.options.installationKey, displayName: this.options.displayName,
        browser: this.options.browser, browserVersion: this.options.browserVersion, platform: this.options.platform,
        appVersion: this.options.appVersion, manifestVersion: this.options.manifestVersion,
        permissions: this.options.permissions, capabilities: this.options.capabilities, metadata,
      }),
    })
    const payload = await readJson(response)
    if (response.status === 426) throw new Error(`Atualize a extensão para a versão ${String(payload.minimumVersion ?? 'mais recente')}.`)
    if (!response.ok) throw new Error(String(payload.error ?? 'Não foi possível registrar a extensão.'))
    const installation = payload.installation as Record<string, unknown> | undefined
    this.installationId = String(installation?.id ?? '')
    this.settings = payload.settings as unknown as RemoteExtensionSettings
    return payload
  }

  async heartbeat(pendingItems = 0, capturedDelta = 0, lastError = '') {
    if (!this.installationId) await this.register()
    const accessToken = await this.options.getUserAccessToken()
    const response = await fetch(`${this.options.supabaseUrl}/functions/v1/extension-register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ action: 'heartbeat', organizationId: this.options.organizationId, installationId: this.installationId, pendingItems, capturedDelta, lastError }),
    })
    const payload = await readJson(response)
    if (!response.ok) throw new Error(String(payload.error ?? 'Não foi possível atualizar a extensão.'))
    this.settings = payload.settings as unknown as RemoteExtensionSettings
    return payload
  }

  async testConnection() {
    if (!this.installationId) await this.register()
    return this.ingest({ type: 'connection_test', version: this.options.appVersion })
  }

  async sendBatch(leads: CaptureLeadPayload[], options: { batchId: string; source: string; sourceUrl?: string }) {
    if (!this.installationId) await this.register()
    const maximum = this.settings?.max_batch_size ?? 50
    if (!leads.length) throw new Error('Nenhum registro para enviar.')
    if (leads.length > maximum) throw new Error(`O lote excede o limite de ${maximum} registros.`)
    return this.ingest({ batchId: options.batchId, leads, source: options.source, sourceUrl: options.sourceUrl ?? '' }, options)
  }

  private async ingest(body: Record<string, unknown>, options?: { batchId?: string; source?: string; sourceUrl?: string }) {
    const ingestToken = await this.options.getIngestToken()
    const response = await fetch(`${this.options.supabaseUrl}/functions/v1/extension-ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', authorization: `Bearer ${ingestToken}`,
        'x-rt-installation-id': this.options.installationKey, 'x-rt-product-key': this.options.productKey,
        'x-rt-extension-version': this.options.appVersion, 'x-rt-connection-name': this.options.displayName,
        'x-rt-browser': this.options.browser, 'x-rt-browser-version': this.options.browserVersion,
        'x-rt-platform': this.options.platform, 'x-rt-manifest-version': String(this.options.manifestVersion),
        'x-batch-id': options?.batchId ?? '', 'x-rt-source': options?.source ?? '', 'x-rt-source-url': options?.sourceUrl ?? '',
      },
      body: JSON.stringify(body),
    })
    const payload = await readJson(response)
    if (response.status === 403) throw new Error('Esta instalação foi revogada no CRM.')
    if (response.status === 423) throw new Error('Esta instalação está pausada no CRM.')
    if (response.status === 426) throw new Error(`Atualize a extensão para a versão ${String(payload.minimumVersion ?? 'mais recente')}.`)
    if (!response.ok) throw new Error(String(payload.error ?? 'Não foi possível sincronizar com o CRM.'))
    if (payload.installationId) this.installationId = String(payload.installationId)
    if (payload.settings) this.settings = payload.settings as unknown as RemoteExtensionSettings
    return payload
  }
}
