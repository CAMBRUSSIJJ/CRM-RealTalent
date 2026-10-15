import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root=process.cwd(); const checks=[]; const ok=(label,value)=>{checks.push({label,ok:Boolean(value)});console.log(`${value?'OK  ':'FAIL'} ${label}`)}
function run(script){const r=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8'}); if(r.stdout)process.stdout.write(r.stdout); if(r.stderr)process.stderr.write(r.stderr); return r.status===0}

ok('communications store reliability smoke',run('scripts/v101_8_4_h9_communications_reliability_smoke.mjs'))
ok('gateway supervisor recovery smoke',run('scripts/v101_8_4_h10_gateway_supervisor_smoke.mjs'))
ok('WhatsApp sync recovery smoke',run('scripts/v101_8_4_h11_whatsapp_sync_recovery_smoke.mjs'))
const ms=fs.readFileSync(path.join(root,'supabase/functions/_shared/communications/providers/microsoft.ts'),'utf8')
const gmail=fs.readFileSync(path.join(root,'supabase/functions/_shared/communications/providers/gmail.ts'),'utf8')
const wa=fs.readFileSync(path.join(root,'supabase/functions/_shared/communications/providers/whatsapp.ts'),'utf8')
ok('cloud providers have no timestamp fallback in idempotency keys',!/idempotency[^\n]*Date\.now\(/i.test(ms)&&!/idempotency[^\n]*Date\.now\(/i.test(gmail))
ok('WhatsApp remains fail-closed without Meta secret',wa.includes('appSecret.length < 32')&&wa.includes(', 503)'))
ok('legacy cloud URLs remain present',fs.existsSync(path.join(root,'supabase/functions/whatsapp-webhook/index.ts'))&&fs.existsSync(path.join(root,'supabase/functions/gmail-pubsub-webhook/index.ts'))&&fs.existsSync(path.join(root,'supabase/functions/microsoft-communications-webhook/index.ts')))
const failed=checks.filter(item=>!item.ok)
console.log(`\nV101.11.0 communications architecture smoke: ${checks.length-failed.length}/${checks.length}`)
if(failed.length)process.exit(1)
