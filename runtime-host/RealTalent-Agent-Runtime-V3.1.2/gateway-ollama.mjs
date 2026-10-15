// RealTalent Agent — Ollama-only entrypoint
// This wrapper prevents provider drift and adapts the generic gateway for a
// local model, whose first structured inference can be slower on CPU laptops.

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

process.env.REALTALENT_AI_PROVIDER = 'ollama'
process.env.OLLAMA_URL = String(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')

// One model for the whole CRM conversation avoids model swapping and keeps the
// semantic context hot in memory.
const CRM_OLLAMA_MODEL = process.env.REALTALENT_OLLAMA_MODEL || process.env.OLLAMA_MODEL || 'qwen3:4b'
process.env.OLLAMA_MODEL = CRM_OLLAMA_MODEL
process.env.OLLAMA_GENERAL_MODEL = CRM_OLLAMA_MODEL
process.env.OLLAMA_FAST_MODEL = CRM_OLLAMA_MODEL
process.env.OLLAMA_REASONING_MODEL = CRM_OLLAMA_MODEL
process.env.OLLAMA_CODER_MODEL = CRM_OLLAMA_MODEL
process.env.REALTALENT_OLLAMA_STRUCTURED_TIMEOUT_MS = process.env.REALTALENT_OLLAMA_STRUCTURED_TIMEOUT_MS || '90000'

// OpenAI must not become primary or fallback in this entrypoint.
delete process.env.OPENAI_API_KEY
delete process.env.OPENAI_RESPONSES_URL
delete process.env.OPENAI_PROTECTION_BYPASS

// The generic gateway originally had a 15 s classification timeout, suitable
// for a remote API but too aggressive for Qwen3 4B on a local CPU. Generate an
// Ollama-only runtime copy beside the original so all relative imports stay valid.
const sourcePath = fileURLToPath(new URL('./gateway.mjs', import.meta.url))
const generatedPath = fileURLToPath(new URL('./.gateway-ollama-runtime.generated.mjs', import.meta.url))
let source = fs.readFileSync(sourcePath, 'utf8')

const timeoutPattern = "timeoutMs:15_000,taskType:'classification'"
const timeoutReplacement = "timeoutMs:Number(process.env.REALTALENT_OLLAMA_STRUCTURED_TIMEOUT_MS || 90_000),taskType:'classification'"
const timeoutMatches = source.split(timeoutPattern).length - 1
if (timeoutMatches !== 2) {
  throw new Error(`O gateway mudou: esperava 2 timeouts semânticos de 15s, encontrei ${timeoutMatches}. Nada foi iniciado para evitar um patch silencioso incorreto.`)
}
source = source.replaceAll(timeoutPattern, timeoutReplacement)

// Qwen3 can spend substantial time in an internal reasoning pass. Structured
// intent planning benefits from deterministic JSON rather than long chain-of-thought.
const structuredPattern = 'model, stream: false, format: schema,'
if (source.includes(structuredPattern)) {
  source = source.replace(structuredPattern, 'model, stream: false, think: false, format: schema,')
}

fs.writeFileSync(generatedPath, source, 'utf8')
await import('./.gateway-ollama-runtime.generated.mjs')
