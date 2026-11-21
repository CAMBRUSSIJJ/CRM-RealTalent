// Rastreio de abertura e cliques de e-mails enviados pelo CRM.
// Cada link e o pixel levam uma assinatura HMAC do id do e-mail (e da URL, no clique):
// sem a assinatura certa a função não registra nada nem redireciona (evita redirecionador aberto).

const encoder = new TextEncoder()

const base64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')

export async function trackingSignature(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(`${secret}:email-tracking`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
  return base64Url(signature).slice(0, 32)
}

export async function verifyTrackingSignature(secret: string, message: string, supplied: string): Promise<boolean> {
  const expected = await trackingSignature(secret, message)
  if (expected.length !== supplied.length) return false
  let diff = 0
  for (let index = 0; index < expected.length; index += 1) diff |= expected.charCodeAt(index) ^ supplied.charCodeAt(index)
  return diff === 0
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string))
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"')]+[^\s<>"').,;:!?]/gi

export async function trackedClickUrl(base: string, secret: string, eventId: string, target: string) {
  const signature = await trackingSignature(secret, `${eventId}|click|${target}`)
  return `${base}?e=${encodeURIComponent(eventId)}&k=c&u=${encodeURIComponent(target)}&s=${signature}`
}

// Texto simples vira HTML com links clicáveis rastreados; HTML existente tem os href http(s) trocados.
export async function buildTrackedHtml(input: { text: string; html: string; eventId: string; base: string; secret: string }) {
  const { eventId, base, secret } = input
  let html = input.html.trim()
  if (html) {
    const hrefs = [...html.matchAll(/href\s*=\s*"(https?:\/\/[^"]+)"/gi)].map((match) => match[1])
    for (const href of [...new Set(hrefs)]) {
      const tracked = await trackedClickUrl(base, secret, eventId, href.replaceAll('&amp;', '&'))
      html = html.split(`"${href}"`).join(`"${escapeHtml(tracked)}"`)
    }
  } else {
    const parts: string[] = []
    let last = 0
    for (const match of input.text.matchAll(URL_PATTERN)) {
      const url = match[0]
      parts.push(escapeHtml(input.text.slice(last, match.index)))
      parts.push(`<a href="${escapeHtml(await trackedClickUrl(base, secret, eventId, url))}">${escapeHtml(url)}</a>`)
      last = (match.index || 0) + url.length
    }
    parts.push(escapeHtml(input.text.slice(last)))
    html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap">${parts.join('')}</div>`
  }
  const openSignature = await trackingSignature(secret, `${eventId}|open`)
  const pixel = `<img src="${base}?e=${encodeURIComponent(eventId)}&amp;k=o&amp;s=${openSignature}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${pixel}</body>`) : `${html}${pixel}`
}
