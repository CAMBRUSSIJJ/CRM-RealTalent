/** Single phone normalization rule for local employees without CRM accounts.
 * Stored as E.164; no auto-send rights are granted by storing a number.
 */
export function normalizeTeamWhatsAppNumber(raw: string): string | null {
  const value = raw.trim()
  if (!value || /[^\d+\s().-]/.test(value) ||
    (value.match(/\+/g) || []).length > 1 || (value.includes('+') && !value.startsWith('+'))) return null
  const digits = value.replace(/\D/g, '')
  const normalized = value.startsWith('+') || digits.startsWith('55') ? '+' + digits
    : digits.length === 10 || digits.length === 11 ? '+55' + digits : ''
  return /^\+[1-9][0-9]{7,14}$/.test(normalized) ? normalized : null
}
