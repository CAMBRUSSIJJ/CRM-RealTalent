import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const args=process.argv.slice(2)
const readArg=(name)=>{const direct=args.find(item=>item.startsWith(`${name}=`));if(direct)return direct.slice(name.length+1);const index=args.indexOf(name);return index>=0?args[index+1]:''}
const projectRef=readArg('--project-ref')||process.env.SUPABASE_PROJECT_REF||''
const required={
  SUPABASE_ACCESS_TOKEN:process.env.SUPABASE_ACCESS_TOKEN||'',SUPABASE_DB_PASSWORD:process.env.SUPABASE_DB_PASSWORD||'',APP_PUBLIC_URL:process.env.APP_PUBLIC_URL||'',SUPABASE_PUBLIC_FUNCTIONS_URL:process.env.SUPABASE_PUBLIC_FUNCTIONS_URL||(`https://${projectRef}.supabase.co/functions/v1`),
  AUTOMATION_CRON_SECRET:process.env.AUTOMATION_CRON_SECRET||'',AUTOMATION_WEBHOOK_CRON_SECRET:process.env.AUTOMATION_WEBHOOK_CRON_SECRET||'',
  INTEGRATION_TOKEN_ENCRYPTION_KEY:process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY||'',INTEGRATION_WORKER_SECRET:process.env.INTEGRATION_WORKER_SECRET||'',COMMUNICATION_WORKER_SECRET:process.env.COMMUNICATION_WORKER_SECRET||'',MAPS_WORKER_SECRET:process.env.MAPS_WORKER_SECRET||'',
  GOOGLE_OAUTH_CLIENT_ID:process.env.GOOGLE_OAUTH_CLIENT_ID||'',GOOGLE_OAUTH_CLIENT_SECRET:process.env.GOOGLE_OAUTH_CLIENT_SECRET||'',
  MICROSOFT_OAUTH_CLIENT_ID:process.env.MICROSOFT_OAUTH_CLIENT_ID||'',MICROSOFT_OAUTH_CLIENT_SECRET:process.env.MICROSOFT_OAUTH_CLIENT_SECRET||'',
  META_OAUTH_CLIENT_ID:process.env.META_OAUTH_CLIENT_ID||'',META_OAUTH_CLIENT_SECRET:process.env.META_OAUTH_CLIENT_SECRET||'',META_APP_SECRET:process.env.META_APP_SECRET||'',
  WHATSAPP_WEBHOOK_VERIFY_TOKEN:process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN||'',GMAIL_PUBSUB_WEBHOOK_SECRET:process.env.GMAIL_PUBSUB_WEBHOOK_SECRET||'',
  GOOGLE_MAPS_API_KEY:process.env.GOOGLE_MAPS_API_KEY||'',GOOGLE_GMAIL_PUBSUB_TOPIC:process.env.GOOGLE_GMAIL_PUBSUB_TOPIC||'',META_GRAPH_VERSION:process.env.META_GRAPH_VERSION||'v23.0',
}
if(!/^[a-z0-9]{20}$/.test(projectRef)){console.error('Informe SUPABASE_PROJECT_REF com 20 caracteres.');process.exit(1)}
const longSecrets=new Set(['AUTOMATION_CRON_SECRET','AUTOMATION_WEBHOOK_CRON_SECRET','INTEGRATION_TOKEN_ENCRYPTION_KEY','INTEGRATION_WORKER_SECRET','COMMUNICATION_WORKER_SECRET','MAPS_WORKER_SECRET','META_APP_SECRET','WHATSAPP_WEBHOOK_VERIFY_TOKEN','GMAIL_PUBSUB_WEBHOOK_SECRET'])
const missing=Object.entries(required).filter(([key,value])=>!value||(longSecrets.has(key)&&value.length<32)).map(([key])=>key)
if(missing.length){console.error(`Configuração incompleta. Defina: ${missing.join(', ')}`);process.exit(1)}
if(!/^https:\/\//.test(required.APP_PUBLIC_URL)){console.error('APP_PUBLIC_URL deve usar HTTPS em produção.');process.exit(1)}
const npx=process.platform==='win32'?'npx.cmd':'npx'
const run=(commandArgs)=>{console.log(`\n> supabase ${commandArgs.map(item=>String(item).includes('=')?'[secret]':item).join(' ')}`);const result=spawnSync(npx,['supabase',...commandArgs],{cwd:process.cwd(),stdio:'inherit',env:{...process.env,SUPABASE_ACCESS_TOKEN:required.SUPABASE_ACCESS_TOKEN}});if(result.status!==0)process.exit(result.status??1)}
run(['link','--project-ref',projectRef,'--password',required.SUPABASE_DB_PASSWORD])
run(['db','push','--linked','--include-all','--yes'])
const serverSecrets=Object.entries(required).filter(([key])=>!['SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD'].includes(key)).map(([key,value])=>`${key}=${value}`)
run(['secrets','set',...serverSecrets,'--project-ref',projectRef])
const functionsPath=path.join(process.cwd(),'supabase','functions')
const functionNames=fs.readdirSync(functionsPath,{withFileTypes:true}).filter(entry=>entry.isDirectory()&&!entry.name.startsWith('_')).map(entry=>entry.name).sort()
if(!functionNames.length){console.error('Nenhuma Edge Function versionada foi encontrada.');process.exit(1)}
for(const name of functionNames)run(['functions','deploy',name,'--project-ref',projectRef,'--use-api'])
console.log('\nDeploy V100.46.2 concluído. Execute supabase/cron/CONFIGURAR-INTEGRATION-RUNNERS.sql e valide a central pelo botão Executar diagnóstico.')
