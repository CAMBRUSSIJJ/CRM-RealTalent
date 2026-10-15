import fs from 'node:fs'
import { auditRuntimeDependencies, APPROVED_FEATURE_RUNTIME_DEPENDENCIES } from './runtime-dependency-policy.mjs'
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'))
const dependencies = Object.keys(pkg.dependencies ?? {})
const result = auditRuntimeDependencies(dependencies)
const checks = []
const check = (label, condition) => checks.push({ label, ok: Boolean(condition) })
check('baseline V100.60.1 continua obrigatória', ['@supabase/supabase-js','lucide-react','react','react-dom'].every((d)=>dependencies.includes(d)))
check('Baileys é dependência runtime aprovada do QR Local', APPROVED_FEATURE_RUNTIME_DEPENDENCIES['@whiskeysockets/baileys'] && dependencies.includes('@whiskeysockets/baileys'))
check('qrcode é dependência runtime aprovada do QR Local', APPROVED_FEATURE_RUNTIME_DEPENDENCIES.qrcode && dependencies.includes('qrcode'))
check('nenhuma dependência runtime inesperada foi adicionada', result.unexpected.length === 0)
check('política de runtime está aprovada', result.ok)
for (const item of checks) console.log(`${item.ok ? 'OK ' : 'FAIL'} ${item.label}`)
const failed = checks.filter((item)=>!item.ok)
console.log(`\nV101.8.4-H4 GateFix1 Runtime Dependencies: ${checks.length-failed.length}/${checks.length} contratos aprovados.`)
if (failed.length) process.exit(1)
