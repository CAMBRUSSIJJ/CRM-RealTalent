export interface BrowserActionResult {
  ok: boolean
  reason?: string
}

function fallbackCopy(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  let copied = false
  try { copied = document.execCommand('copy') } catch { copied = false }
  textarea.remove()
  return copied
}

export async function copyTextToClipboard(text: string): Promise<BrowserActionResult> {
  if (!text.trim()) return { ok: false, reason: 'Não há conteúdo para copiar.' }
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return { ok: true }
    }
  } catch {
    // Alguns navegadores expõem a API mas recusam por permissão/política.
  }
  return fallbackCopy(text)
    ? { ok: true }
    : { ok: false, reason: 'O navegador bloqueou o acesso à área de transferência.' }
}

export function normalizeExternalUrl(value: string | null | undefined) {
  const raw = value?.trim()
  if (!raw) return null
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
    const url = new URL(withProtocol)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch { return null }
}

export function openExternalUrl(value: string | null | undefined): BrowserActionResult {
  const url = normalizeExternalUrl(value)
  if (!url) return { ok: false, reason: 'Link inválido ou não informado.' }
  const opened = window.open(url, '_blank')
  if (!opened) return { ok: false, reason: 'O navegador bloqueou a abertura da nova janela.' }
  try { opened.opener = null } catch { /* isolamento não suportado pelo navegador */ }
  return { ok: true }
}
