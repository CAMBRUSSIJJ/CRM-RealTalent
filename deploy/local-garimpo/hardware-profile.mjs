export const GiB = 1024 ** 3

export function hardwareProfile(totalBytes, modelList) {
  const economy = totalBytes <= 10 * GiB
  const models = modelList.map((item) => ({ name: item.name || item.model, size: Number(item.size) || Infinity }))
    .filter((item) => typeof item.name === 'string' && /^[a-z0-9][a-z0-9:._/\-]{0,199}$/i.test(item.name))
  if (economy) models.sort((a, b) => a.size - b.size)
  return { economy, models: models.map((item) => item.name), contextChars: economy ? 16_000 : 100_000 }
}

export function availableMemory(meminfo) {
  const value = String(meminfo).match(/^MemAvailable:\s+(\d+)\s+kB$/m)
  return value ? Number(value[1]) * 1024 : null
}

// Keep the identity, contact lines and footer, with a bounded context for a small local model.
export function compactLocalSources(sources, maximum = 16_000) {
  const perSource = Math.max(300, Math.floor(maximum / Math.max(1, sources.length)))
  return JSON.stringify(sources.map(({ url, title, content = '' }) => {
    const contactLines = content.split(/\r?\n/).filter((line) => /@|telefone|contato|cnpj|whatsapp|instagram|agend|\d{4}[ -]?\d{4}/i.test(line))
      .map((line) => line.slice(0, 400)).join('\n')
    return { url, title, content: [content.slice(0, Math.min(500, perSource)), contactLines.slice(0, Math.max(0, perSource - 1000)), content.slice(-Math.min(500, perSource))].join('\n').slice(0, perSource) }
  }))
}
