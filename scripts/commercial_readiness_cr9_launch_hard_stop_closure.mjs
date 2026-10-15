import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const evidenceDir = path.join(root, 'ops', 'evidence')
fs.mkdirSync(evidenceDir, { recursive: true })

const secretNames = Object.keys(process.env).filter((k) => /(PASSWORD|SECRET|TOKEN|KEY|SERVICE_ROLE|DB_URL|DATABASE_URL)/i.test(k))
const secretValues = secretNames.map((k) => process.env[k]).filter((v) => typeof v === 'string' && v.length >= 6)
const sanitize = (input = '') => {
  let value = String(input)
  for (const secret of secretValues) value = value.split(secret).join('[REDACTED]')
  value = value.replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, '$1[REDACTED]')
  value = value.replace(/(service_role|anon|apikey|api_key|password|token)(["'\s:=]+)[^\s,"']+/gi, '$1$2[REDACTED]')
  return value
}

const run = (id, command, args = [], extraEnv = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    timeout: 120000,
  })
  const stdout = sanitize(result.stdout || '')
  const stderr = sanitize(result.stderr || '')
  const record = {
    id,
    command: [command, ...args].join(' '),
    ok: result.status === 0,
    exitCode: typeof result.status === 'number' ? result.status : null,
    signal: result.signal || null,
    stdout,
    stderr,
  }
  fs.writeFileSync(path.join(evidenceDir, `${id}.log`), `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ''}`.trim() + '\n')
  return record
}

const qa = run('cr9-qa', process.execPath, ['scripts/commercial_readiness_cr9_launch_hard_stop_audit.mjs'])
const staging = run('cr3-staging-e2e', process.execPath, ['scripts/commercial_readiness_cr3_staging_e2e_probe.mjs'])
const production = run('cr7-production-readiness', process.execPath, ['scripts/commercial_readiness_cr7_production_probe.mjs'])

const derivedEnv = {
  CR8_STAGING_E2E_PASS: staging.ok ? '1' : '0',
  CR8_PRODUCTION_PROBE_PASS: production.ok ? '1' : '0',
  CR8_BACKUP_RESTORE_DRILL_PASS: String(process.env.CR9_BACKUP_RESTORE_DRILL_PASS || '').trim() === '1' ? '1' : '0',
}
const launch = run('cr8-launch-gate', process.execPath, ['scripts/commercial_readiness_cr8_launch_gate.mjs'], derivedEnv)

const checks = [
  ['cr9-static-audit', qa.ok, 'CR9 orchestration/audit contract'],
  ['staging-e2e', staging.ok, 'CR3 staging E2E with real Supabase roles'],
  ['production-readiness', production.ok, 'CR7 production HTTPS/Auth/readiness probe'],
  ['backup-restore-drill', derivedEnv.CR8_BACKUP_RESTORE_DRILL_PASS === '1', 'explicit staging backup + restore drill evidence'],
  ['commercial-launch-gate', launch.ok, 'CR8 10/10 commercial launch gate'],
]

const hardStops = checks.filter(([, ok]) => !ok).map(([id]) => id)
const decision = hardStops.length === 0 ? 'GO' : 'NO-GO'
const generatedAt = new Date().toISOString()
const summary = {
  schema: 'realtalent-cr9-launch-hard-stop-closure/v1',
  generatedAt,
  decision,
  pass: checks.length - hardStops.length,
  total: checks.length,
  hardStops,
  checks: checks.map(([id, ok, detail]) => ({ id, ok, detail })),
  evidenceFiles: ['cr9-qa.log', 'cr3-staging-e2e.log', 'cr7-production-readiness.log', 'cr8-launch-gate.log'],
  security: 'Evidence logs are sanitized; customer content and known secret environment values are not intentionally persisted.',
}
fs.writeFileSync(path.join(evidenceDir, 'CR9_LATEST.json'), JSON.stringify(summary, null, 2) + '\n')
const md = [
  '# CR9 — Launch Hard-Stop Closure',
  '',
  `Generated: ${generatedAt}`,
  `Decision: **${decision}**`,
  `Evidence gates: **${summary.pass}/${summary.total} PASS**`,
  '',
  '## Gates',
  ...summary.checks.map((c) => `- ${c.ok ? 'PASS' : 'BLOCK'} — ${c.id}: ${c.detail}`),
  '',
  hardStops.length ? `## Hard stops\n${hardStops.map((v) => `- ${v}`).join('\n')}` : '## Hard stops\nNone.',
  '',
  'Raw sanitized evidence is stored in `ops/evidence/`.',
].join('\n')
fs.writeFileSync(path.join(evidenceDir, 'CR9_LATEST.md'), md + '\n')

for (const c of summary.checks) console.log(`${c.ok ? 'PASS' : 'BLOCK'} ${c.id} — ${c.detail}`)
console.log(`\nCR9 LAUNCH CLOSURE: ${decision}`)
console.log(`Evidence gates: ${summary.pass}/${summary.total} PASS`)
if (hardStops.length) {
  console.log(`Hard stops: ${hardStops.join(', ')}`)
  console.log('Evidence written to ops/evidence/CR9_LATEST.json and CR9_LATEST.md')
  process.exit(2)
}
console.log('All hard stops are closed. Re-run release snapshot immediately before customer activation.')
