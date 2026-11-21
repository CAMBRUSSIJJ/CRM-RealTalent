import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { verifyTrackingSignature } from '../_shared/email-tracking.ts'

// Pixel de abertura e redirecionamento de cliques dos e-mails enviados pelo CRM.
// Público (o destinatário não tem login); só age com assinatura válida.
const GIF = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (char) => char.charCodeAt(0))
const pixel = () => new Response(GIF, { headers: { 'content-type': 'image/gif', 'cache-control': 'no-store, max-age=0', 'content-length': String(GIF.length) } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (request) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Método não permitido', { status: 405 })
  const url = new URL(request.url)
  const eventId = url.searchParams.get('e') || ''
  const kind = url.searchParams.get('k') === 'c' ? 'click' : 'open'
  const target = url.searchParams.get('u') || ''
  const signature = url.searchParams.get('s') || ''
  const secret = Deno.env.get('INTEGRATION_TOKEN_ENCRYPTION_KEY') || ''
  const validTarget = kind === 'click' && /^https?:\/\//i.test(target)
  const valid = UUID.test(eventId) && secret.length >= 32 && (kind === 'open' || validTarget)
    && await verifyTrackingSignature(secret, kind === 'open' ? `${eventId}|open` : `${eventId}|click|${target}`, signature)
  if (valid && request.method === 'GET') {
    const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '') as any
    try { await admin.rpc('record_email_tracking', { p_event_id: eventId, p_kind: kind, p_url: kind === 'click' ? target.slice(0, 2000) : null, p_user_agent: (request.headers.get('user-agent') || '').slice(0, 300) }) } catch { /* o redirecionamento não depende do registro */ }
  }
  if (kind === 'click') {
    if (valid) return Response.redirect(target, 302)
    return new Response('Link inválido ou expirado.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }
  return pixel()
})
