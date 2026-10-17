import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const FILES = Object.freeze({
  supervisor: 'runtime-host/deploy/prospecting-preview/prospecting-preview-supervisor.mjs',
  agent: 'runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/scripts/realtalent-prospecting-agent.mjs',
  adaptive: 'runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/scripts/realtalent-prospecting-adaptive-learning.mjs',
})

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b)
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store, max-age=0')
  res.setHeader('x-content-type-options', 'nosniff')

  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET')
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  const expected = String(process.env.REALTALENT_PREVIEW_BOOTSTRAP_TOKEN || '')
  const supplied = String(req.headers['x-realtalent-bootstrap-token'] || '')
  if (expected.length < 32 || !secureEqual(supplied, expected)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }

  const key = String(req.query?.file || '').trim().toLowerCase()
  const relativePath = FILES[key]
  if (!relativePath) {
    return res.status(400).json({ ok: false, error: 'invalid_runtime_file' })
  }

  try {
    const source = await fs.readFile(path.join(process.cwd(), relativePath), 'utf8')
    res.statusCode = 200
    res.setHeader('content-type', 'text/javascript; charset=utf-8')
    res.setHeader('x-realtalent-runtime-file', key)
    return res.end(source)
  } catch (error) {
    console.error('[runtime-bootstrap-prospecting] read failed', key, String(error?.message || error))
    return res.status(500).json({ ok: false, error: 'runtime_file_unavailable' })
  }
}
