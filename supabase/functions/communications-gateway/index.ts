import { runProvider, type CommunicationProvider } from '../_shared/communications/core.ts'
import { handleGmailWebhook } from '../_shared/communications/providers/gmail.ts'
import { handleMicrosoftWebhook } from '../_shared/communications/providers/microsoft.ts'
import { handleWhatsAppWebhook } from '../_shared/communications/providers/whatsapp.ts'

const VERSION = '101.11.0'
const providers: Record<CommunicationProvider, (request: Request, requestId: string) => Promise<Response>> = {
  whatsapp: handleWhatsAppWebhook,
  gmail: handleGmailWebhook,
  microsoft: handleMicrosoftWebhook,
}

function resolveProvider(request: Request): CommunicationProvider | null {
  const url = new URL(request.url)
  const requested = (url.searchParams.get('provider') || '').toLowerCase()
  if (requested in providers) return requested as CommunicationProvider
  const parts = url.pathname.split('/').filter(Boolean)
  const gatewayIndex = parts.lastIndexOf('communications-gateway')
  const candidate = gatewayIndex >= 0 ? parts[gatewayIndex + 1] : parts.at(-1)
  return candidate && candidate in providers ? candidate as CommunicationProvider : null
}

Deno.serve(async (request) => {
  const url = new URL(request.url)
  const provider = resolveProvider(request)
  if (!provider) {
    if (request.method === 'GET' && (url.pathname.endsWith('/health') || url.searchParams.get('health') === '1' || url.pathname.endsWith('/communications-gateway'))) {
      const requestId = crypto.randomUUID()
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'communications-gateway',
        version: VERSION,
        providers: ['whatsapp', 'gmail', 'microsoft'],
        security: { providerSpecificVerification: true, failClosed: true },
        delivery: { idempotency: true, retries: 'provider + integration_sync_jobs', deadLetter: 'integration_sync_jobs/communication_outbox' },
      }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-realtalent-service': 'communications-gateway', 'x-realtalent-correlation-id': requestId } })
    }
    return new Response(JSON.stringify({ error: 'Provider não suportado', providers: Object.keys(providers) }), { status: 404, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
  }
  return runProvider(provider, request, providers[provider])
})
