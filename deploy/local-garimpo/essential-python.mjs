// Optional lightweight Python extraction runner. No model or network access.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { sanitizeAiResult } from '../../supabase/functions/_shared/prospecting-ai.ts'
import { essentialDiscovery } from './essential-research.mjs'

export async function runEssentialDiscovery(input, sources, report = '') {
  const fallback = essentialDiscovery(input, sources, report)
  if (process.env.GARIMPO_ESSENTIAL_PYTHON === 'false' || !sources.length) {
    return { ...fallback, extractionEngine: 'javascript' }
  }
  const publicSources = sources.slice(0, 30).map((item) => ({
    url: String(item.url || '').slice(0, 1000),
    title: String(item.title || '').slice(0, 200),
    content: String(item.content || '').slice(0, 6000),
  }))
  const payload = JSON.stringify({
    input: { segment: input.segment, city: input.city, limit: input.limit },
    sources: publicSources,
  })
  if (Buffer.byteLength(payload) > 78000) return { ...fallback, extractionEngine: 'javascript' }
  const workerPath = fileURLToPath(new URL('./essential_worker.py', import.meta.url))
  const result = await new Promise((resolve) => {
    let output = '', settled = false
    const child = spawn('python3', [workerPath], {
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C.UTF-8' },
    })
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => { child.kill(); finish(null) }, 4000)
    child.on('error', () => finish(null))
    child.stdout.on('data', (chunk) => {
      output += String(chunk)
      if (output.length > 64000) { child.kill(); finish(null) }
    })
    child.on('close', (code) => {
      if (code !== 0) return finish(null)
      try { finish(JSON.parse(output)) } catch { finish(null) }
    })
    child.stdin.on('error', () => finish(null))
    child.stdin.end(payload)
  })
  if (!result || !Array.isArray(result.leads)) return { ...fallback, extractionEngine: 'javascript' }
  // The worker cannot approve any record: the existing canonical validator
  // accepts only literals from the matching indexed source URL.
  const linkedSources = publicSources.map((item) => ({
    ...item, content: [item.title, item.content].join('\n'),
  }))
  const verified = sanitizeAiResult(result, linkedSources, report || JSON.stringify(linkedSources),
    Math.max(1, Math.min(10, Number(input.limit) || 5)))
  if (!verified.leads.length && fallback.leads.length) return { ...fallback, extractionEngine: 'javascript' }
  return {
    ...verified, researchMode: 'essential', extractionEngine: 'python',
    warnings: [...verified.warnings,
      'Extração Python local sem IA. Dados obtidos de fontes públicas; confirmar identidade e contatos antes da aprovação.'],
  }
}
