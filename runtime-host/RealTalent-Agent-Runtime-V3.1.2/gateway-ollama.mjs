// RealTalent Agent — Ollama-only entrypoint
// This wrapper intentionally prevents provider drift. The Agent must use Ollama
// for semantic interpretation, capability planning, chat and reasoning.

process.env.REALTALENT_AI_PROVIDER = 'ollama'
process.env.OLLAMA_URL = String(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')
process.env.OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:4b'
process.env.OLLAMA_GENERAL_MODEL = process.env.OLLAMA_GENERAL_MODEL || 'qwen3:4b'
process.env.OLLAMA_FAST_MODEL = process.env.OLLAMA_FAST_MODEL || 'qwen3:4b'
process.env.OLLAMA_REASONING_MODEL = process.env.OLLAMA_REASONING_MODEL || 'qwen3:4b'
process.env.OLLAMA_CODER_MODEL = process.env.OLLAMA_CODER_MODEL || 'qwen2.5-coder:3b'

// Do not allow a configured cloud key to silently become the primary or fallback
// provider in this entrypoint. The normal gateway remains available separately for
// environments that explicitly choose another architecture in the future.
delete process.env.OPENAI_API_KEY
delete process.env.OPENAI_RESPONSES_URL
delete process.env.OPENAI_PROTECTION_BYPASS

await import('./gateway.mjs')
