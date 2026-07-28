import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'))
const short=pkg.version.replace(/\.0$/,'')
const label=`V${short.replaceAll('.','-')}`
const checks=[]
const exists=(value)=>fs.existsSync(path.join(root,value))
const check=(name,ok,detail)=>checks.push({name,ok:Boolean(ok),detail})
for(const file of [
  '.github/workflows/ci.yml','.github/workflows/release-candidate.yml','.github/workflows/deploy-staging.yml',
  '.github/workflows/promote-production.yml','.github/workflows/database-backup.yml',
  'scripts/e2e_staging.py','scripts/tenant_isolation_test.py','scripts/verify_staging.mjs',
  'scripts/backup_database.mjs','scripts/restore_database.mjs',
  'docs/PLANO-HOMOLOGACAO-V100-42.md','docs/OPERACAO-PRODUCAO-V100-42.md','docs/RECUPERACAO-DESASTRE-V100-42.md',
  'docs/COMUNICACOES-OFICIAIS-V100-42.md','docs/PLANO-HOMOLOGACAO-V100-42.md',
  'docs/PROPOSTAS-FORECAST-V100-43.md','docs/PLANO-HOMOLOGACAO-V100-43.md','docs/OPERACAO-PRODUCAO-V100-43.md','supabase/migrations/202607270004_v100_43_proposals_forecast.sql','src/features/proposals/proposals-page.tsx',
  'docs/ARQUITETURA-COMERCIAL-V100-44.md','docs/BACKUP-SEGURO-V100-44.md','docs/FONTE-OFICIAL-V100-44.md','supabase/migrations/202607280001_v100_44_commercial_consolidation.sql',
  'docs/FUNDACAO-INTEGRACOES-V100-45.md','VALIDACAO-V100-45.md','supabase/migrations/202607280002_v100_45_integration_foundation.sql','scripts/integration_foundation_audit.mjs',
  'docs/GOOGLE-MICROSOFT-V100-46.md','docs/OPERACAO-PRODUCAO-V100-46.md','docs/PLANO-HOMOLOGACAO-V100-46.md','supabase/migrations/202607280003_v100_46_google_microsoft.sql','scripts/google_microsoft_audit.mjs',
  'supabase/functions/integration-google-worker/index.ts','supabase/functions/integration-microsoft-worker/index.ts','supabase/functions/integration-meta-worker/index.ts','supabase/functions/integration-whatsapp-worker/index.ts','supabase/functions/integration-token-worker/index.ts','supabase/functions/integration-health-worker/index.ts','supabase/functions/integration-maintenance-worker/index.ts','supabase/functions/integration-account-test/index.ts','supabase/functions/integration-diagnostics/index.ts','supabase/functions/integration-account-revoke/index.ts','supabase/functions/gmail-pubsub-webhook/index.ts','supabase/functions/_shared/integration-runtime.ts',
  'supabase/migrations/202607270003_v100_42_official_communications.sql','supabase/functions/official-communication-send/index.ts','supabase/functions/communication-dispatch-worker/index.ts','supabase/functions/communication-sync-worker/index.ts','supabase/functions/google-communications-webhook/index.ts','supabase/functions/microsoft-communications-webhook/index.ts','supabase/functions/whatsapp-webhook/index.ts',
  'supabase/migrations/202607270002_v100_41_production_observability.sql','supabase/functions/client-diagnostics/index.ts',
]) check(`Arquivo ${file}`,exists(file),exists(file)?'presente':'ausente')
const deploy=exists('.github/workflows/deploy-supabase.yml')?fs.readFileSync(path.join(root,'.github/workflows/deploy-supabase.yml'),'utf8'):''
check('Edge Functions completas',(deploy.includes('find supabase/functions')&&deploy.includes('functions deploy'))||(deploy.includes('client-diagnostics')&&deploy.includes('extension-register')&&deploy.includes('integration-sync-worker')),'deploy dinâmico de todas as funções versionadas')
const vercel=exists('vercel.json')?fs.readFileSync(path.join(root,'vercel.json'),'utf8'):''
check('Headers de segurança',/Content-Security-Policy/.test(vercel)&&/X-Frame-Options/.test(vercel),'CSP e frame denial')
const health=exists('public/health.json')?JSON.parse(fs.readFileSync(path.join(root,'public/health.json'),'utf8')):{}
check('Health versionado',health.version===short,health.version??'ausente')
const failed=checks.filter(item=>!item.ok)
const report={version:pkg.version,generatedAt:new Date().toISOString(),passed:failed.length===0,checks}
fs.writeFileSync(path.join(root,`PRODUCTION-READINESS-${label}.json`),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
if(failed.length) process.exit(1)
