process.env.REALTALENT_PROSPECTING_AGENT_HOST ||= '0.0.0.0'
process.env.REALTALENT_PROSPECTING_AGENT_PORT ||= process.env.PORT || '3000'
process.env.REALTALENT_PROSPECTING_AGENT_STATE_DIR ||= '/tmp/realtalent-prospecting'
process.env.PUPPETEER_SKIP_DOWNLOAD ||= 'true'
process.env.NODE_ENV ||= 'production'

console.log(`[realtalent-prospecting-vercel] boot port=${process.env.REALTALENT_PROSPECTING_AGENT_PORT}`)

await import('./realtalent-prospecting-agent.mjs')
