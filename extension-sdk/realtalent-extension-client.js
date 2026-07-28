const cleanUrl = (value) => value.replace(/\/$/, '')
const readJson = async (response) => response.json().catch(() => ({}))

export class RealTalentExtensionClient {
  constructor(options) {
    this.options = {
      ...options,
      supabaseUrl: cleanUrl(options.supabaseUrl),
      productKey: options.productKey || 'realtalent_capture',
      manifestVersion: options.manifestVersion || 3,
      browser: options.browser || 'Chrome',
      browserVersion: options.browserVersion || '',
      platform: options.platform || navigator.platform,
      permissions: options.permissions || [],
      capabilities: options.capabilities || [],
    }
    this.installationId = ''
    this.settings = null
  }
  async register(metadata = {}) {
    const accessToken = await this.options.getUserAccessToken()
    const response = await fetch(`${this.options.supabaseUrl}/functions/v1/extension-register`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ action: 'register', organizationId: this.options.organizationId, productKey: this.options.productKey, installationKey: this.options.installationKey, displayName: this.options.displayName, browser: this.options.browser, browserVersion: this.options.browserVersion, platform: this.options.platform, appVersion: this.options.appVersion, manifestVersion: this.options.manifestVersion, permissions: this.options.permissions, capabilities: this.options.capabilities, metadata }),
    })
    const payload = await readJson(response)
    if (response.status === 426) throw new Error(`Atualize a extensão para a versão ${String(payload.minimumVersion || 'mais recente')}.`)
    if (!response.ok) throw new Error(String(payload.error || 'Não foi possível registrar a extensão.'))
    this.installationId = String(payload.installation?.id || '')
    this.settings = payload.settings || null
    return payload
  }
  async heartbeat(pendingItems = 0, capturedDelta = 0, lastError = '') {
    if (!this.installationId) await this.register()
    const accessToken = await this.options.getUserAccessToken()
    const response = await fetch(`${this.options.supabaseUrl}/functions/v1/extension-register`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ action: 'heartbeat', organizationId: this.options.organizationId, installationId: this.installationId, pendingItems, capturedDelta, lastError }),
    })
    const payload = await readJson(response)
    if (!response.ok) throw new Error(String(payload.error || 'Não foi possível atualizar a extensão.'))
    this.settings = payload.settings || null
    return payload
  }
  async testConnection() {
    if (!this.installationId) await this.register()
    return this.ingest({ type: 'connection_test', version: this.options.appVersion })
  }
  async sendBatch(leads, options) {
    if (!this.installationId) await this.register()
    const maximum = this.settings?.max_batch_size || 50
    if (!leads.length) throw new Error('Nenhum registro para enviar.')
    if (leads.length > maximum) throw new Error(`O lote excede o limite de ${maximum} registros.`)
    return this.ingest({ batchId: options.batchId, leads, source: options.source, sourceUrl: options.sourceUrl || '' }, options)
  }
  async ingest(body, options = {}) {
    const ingestToken = await this.options.getIngestToken()
    const response = await fetch(`${this.options.supabaseUrl}/functions/v1/extension-ingest`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ingestToken}`, 'x-rt-installation-id': this.options.installationKey, 'x-rt-product-key': this.options.productKey, 'x-rt-extension-version': this.options.appVersion, 'x-rt-connection-name': this.options.displayName, 'x-rt-browser': this.options.browser, 'x-rt-browser-version': this.options.browserVersion, 'x-rt-platform': this.options.platform, 'x-rt-manifest-version': String(this.options.manifestVersion), 'x-batch-id': options.batchId || '', 'x-rt-source': options.source || '', 'x-rt-source-url': options.sourceUrl || '' },
      body: JSON.stringify(body),
    })
    const payload = await readJson(response)
    if (response.status === 403) throw new Error('Esta instalação foi revogada no CRM.')
    if (response.status === 423) throw new Error('Esta instalação está pausada no CRM.')
    if (response.status === 426) throw new Error(`Atualize a extensão para a versão ${String(payload.minimumVersion || 'mais recente')}.`)
    if (!response.ok) throw new Error(String(payload.error || 'Não foi possível sincronizar com o CRM.'))
    if (payload.installationId) this.installationId = String(payload.installationId)
    if (payload.settings) this.settings = payload.settings
    return payload
  }
}
