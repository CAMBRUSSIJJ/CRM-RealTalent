import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const validOrg = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''))
const validPhone = value => /^\+[1-9][0-9]{7,14}$/.test(String(value || ''))
const browserPaths = [
  process.env.REALTALENT_WHATSAPP_BROWSER,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean)

// Native WhatsApp Web client for RealTalent Connect. It does not use Evolution,
// PostgreSQL or Redis. Pairing state is stored only in a private Linux folder.
export function createWhatsAppWebEngine({
  packageDir, authDir, onQr, onState, onError, loader = null,
}) {
  let client = null
  let initialising = false
  let ready = false
  let generation = 0
  let qrDataUrl = null
  let qrCreatedAt = 0
  let errorMessage = null
  let status = 'close'
  let reconnectCount = 0
  let reconnectTimer = null
  let timeout = null
  let organisationId = ''
  let manualStopping = false
  const readModules = loader || (() => {
    const requireRuntime = createRequire(join(packageDir, 'package.json'))
    const web = requireRuntime('whatsapp-web.js')
    const QRCode = requireRuntime('qrcode')
    const Client = web.Client || web.default?.Client
    const LocalAuth = web.LocalAuth || web.default?.LocalAuth
    const encoder = QRCode?.toDataURL ? QRCode : QRCode.default
    if (!Client || !LocalAuth || !encoder?.toDataURL)
      throw new Error('whatsapp-web.js ou renderizador QR não foi instalado corretamente.')
    return { Client, LocalAuth, QRCode: encoder }
  })
  function resetTimeout() {
    if (timeout) clearTimeout(timeout)
    timeout = null
  }
  function setState(value) {
    status = value
    if (value === 'open') {
      ready = true
      qrDataUrl = null
      qrCreatedAt = 0
      errorMessage = null
      reconnectCount = 0
      resetTimeout()
    } else ready = false
    onState?.(value)
  }
  function startupDiagnostic(error) {
    const raw = String(error instanceof Error ? error.message : error || '').toLowerCase()
    if (/failed to launch|spawn.*enoent|executable.*not found|chrome.*not found|chromium.*not found/.test(raw))
      return 'Chromium não iniciou. Instale Chromium ou execute novamente o instalador do RealTalent Connect.'
    if (/libnss|libatk|libgbm|shared libraries|error while loading shared libraries/.test(raw))
      return 'Chromium precisa de bibliotecas do Linux. Verifique as dependências do navegador.'
    if (/sandbox|running as root/.test(raw))
      return 'Chromium bloqueado pela configuração de sandbox. Execute o aplicativo com seu usuário Linux normal.'
    if (/profile.*in use|user data directory.*already in use|singletonlock/.test(raw))
      return 'O perfil WhatsApp Web está em uso por outro processo. Feche sessões duplicadas do RealTalent Connect.'
    if (/timeout|timed out|navigation failed/.test(raw))
      return 'WhatsApp Web não abriu a página a tempo. Verifique a rede do Chromium.'
    return 'WhatsApp Web não conseguiu iniciar. Abra Verificar problema no RealTalent Connect.'
  }
  function fail(reason) {
    errorMessage = String(reason || 'Falha ao iniciar WhatsApp Web.').slice(0, 220)
    setState('error')
    onError?.(errorMessage)
  }
  async function destroyClient() {
    resetTimeout()
    const previous = client
    client = null
    initialising = false
    if (previous) {
      // Do not call logout: it would revoke the phone's saved device.
      try { await Promise.race([
        previous.destroy(),
        new Promise(resolve => setTimeout(resolve, 7000)),
      ]) } catch {}
    }
  }
  function scheduleReconnect() {
    if (manualStopping || !organisationId || reconnectTimer) return
    if (++reconnectCount > 3) {
      fail('WhatsApp Web desconectou três vezes. Use Reiniciar conexão no aplicativo.')
      return
    }
    const delay = Math.min(20000, reconnectCount * 5000)
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null
      await destroyClient()
      void start(organisationId)
    }, delay)
  }
  async function start(organizationId) {
    if (!validOrg(organizationId)) throw new Error('Workspace do CRM inválido.')
    if (client || initialising) return { status, ready }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    organisationId = organizationId
    manualStopping = false
    let mods
    try { mods = readModules() }
    catch { fail('Motor WhatsApp Web ausente. Execute o instalador atualizado.'); throw new Error(errorMessage) }
    const { Client, LocalAuth, QRCode } = mods
    const exec = browserPaths.find(p => existsSync(p))
    const puppeteer = {
      headless: true,
      args: ['--disable-dev-shm-usage'],
      ...(exec ? { executablePath: exec } : {}),
    }
    // Separate profile from the previous Railway gateway and the Evolution
    // volume. No existing WhatsApp or message history is deleted.
    const wa = new Client({
      authStrategy: new LocalAuth({
        clientId: 'rt-' + organizationId,
        dataPath: authDir,
      }),
      puppeteer,
      takeoverOnConflict: false,
      qrMaxRetries: 4,
    })
    client = wa
    initialising = true
    generation++
    const own = generation
    setState('connecting')
    errorMessage = null
    wa.on('qr', async raw => {
      if (client !== wa || own !== generation || manualStopping) return
      try {
        const image = await QRCode.toDataURL(raw, { type: 'image/png',
          margin: 2, width: 330, errorCorrectionLevel: 'M' })
        if (client !== wa || own !== generation || typeof image !== 'string' ||
            !image.startsWith('data:image/png;base64,') || image.length > 500000) return
        qrDataUrl = image
        qrCreatedAt = Date.now()
        errorMessage = null
        onQr?.(image)
        onState?.('connecting')
      } catch {
        fail('O WhatsApp Web gerou um código, mas houve falha ao produzir a imagem QR.')
      }
    })
    wa.on('authenticated', () => {
      if (client === wa && own === generation) { qrDataUrl = null; qrCreatedAt = 0; onQr?.(null) }
    })
    wa.on('ready', () => {
      if (client === wa && own === generation) { initialising = false; onQr?.(null); setState('open') }
    })
    wa.on('auth_failure', () => {
      if (client === wa && own === generation)
        fail('A sessão do WhatsApp Web falhou na autenticação. Verifique Dispositivos conectados no telefone.')
    })
    wa.on('disconnected', reason => {
      if (client !== wa || own !== generation || manualStopping) return
      qrDataUrl = null
      qrCreatedAt = 0
      onQr?.(null)
      initialising = false
      setState('close')
      onError?.('WhatsApp Web desconectado. A sessão permanece salva no Linux.')
      scheduleReconnect()
    })
    wa.on('change_state', next => {
      if (client === wa && own === generation && next === 'CONFLICT')
        onError?.('A sessão WhatsApp Web está em conflito com outro dispositivo ou gateway.')
    })
    timeout = setTimeout(() => {
      if (client === wa && own === generation && !ready && !qrDataUrl)
        fail('WhatsApp Web abriu o navegador, mas não apresentou QR em dois minutos. Verifique o Chromium.')
    }, 120000)
    Promise.resolve().then(() => wa.initialize()).catch(error => {
      if (client === wa && own === generation && !manualStopping) {
        initialising = false
        fail(startupDiagnostic(error))
      }
    })
    return { status, ready }
  }
  async function sendText(phone, text) {
    if (!ready || !client || !validPhone(phone) ||
      typeof text !== 'string' || text.length < 1 || text.length > 3000) return null
    const digits = phone.substring(1)
    // Preserve the exact phone identity; do not send to unverified LIDs
    // when getNumberId says the destination is not a WhatsApp number.
    const id = typeof client.getNumberId === 'function'
      ? await client.getNumberId(digits) : { _serialized: digits + '@c.us' }
    if (!id?._serialized || !id._serialized.endsWith('@c.us')) return null
    const sent = await client.sendMessage(id._serialized, text)
    return typeof sent?.id?._serialized === 'string' ? sent.id._serialized :
      typeof sent?.id?.id === 'string' ? sent.id.id : null
  }
  async function restart() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    manualStopping = true
    generation++
    reconnectCount = 0
    qrDataUrl = null
    qrCreatedAt = 0
    onQr?.(null)
    await destroyClient()
    manualStopping = false
    setState('close')
    return start(organisationId)
  }
  async function stop() {
    manualStopping = true
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    generation++
    await destroyClient()
    setState('close')
  }
  return {
    start, restart, stop, sendText,
    status: () => ({
      state: status,
      ready,
      qr: status !== 'open' && Date.now() - qrCreatedAt < 100000 ? qrDataUrl : null,
      error: errorMessage,
      engine: 'whatsapp-web.js',
      chromium: browserPaths.find(p => existsSync(p)) || 'Puppeteer bundled Chromium',
    }),
  }
}
