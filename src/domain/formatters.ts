export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)

export const formatDateTime = (value: string | null) => {
  if (!value) return 'Sem data'
  const date = new Date(value)
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'GB'

/** Singular ou plural pelo número: plural(1, 'reunião', 'reuniões') → 'reunião'. Evita "reunião(ões)" na tela. */
export const plural = (count: number | string, one: string, many: string) => Math.abs(Number(count)) === 1 ? one : many
