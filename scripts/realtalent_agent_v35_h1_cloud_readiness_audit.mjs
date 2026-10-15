import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8')
const env=read('src/lib/env.ts'), commGateway=read('scripts/realtalent-communications-gateway.mjs'), transport=read('src/services/realtalent-runtime-transport.ts'), agent=read('src/services/realtalent-agent-client.ts'), semantic=read('src/services/realtalent-semantic-language-client.ts'), planner=read('src/services/realtalent-crm-capability-planner.ts'), prospecting=read('src/services/prospecting-linux-agent.ts'), comm=read('src/services/local-communications-gateway.ts'), proxy=read('api/runtime/_proxy.mjs'), fixedAgent=read('api/runtime-agent.mjs'), fixedComm=read('api/runtime-communications.mjs'), fixedProspecting=read('api/runtime-prospecting.mjs'), validate=read('scripts/validate-env.mjs'), prod=read('.env.production.example'), vr=read('vercel.json'), pkg=read('package.json'), cloudSupervisor=read('../deploy/cloud-runtime/cloud-runtime-supervisor.mjs'), cloudDocker=read('../deploy/cloud-runtime/Dockerfile')
const checks=[
 ['Agent browser sem localhost funcional',env.includes("'/api/runtime/agent'")&&agent.includes('env.agentGatewayUrl')&&semantic.includes('env.agentGatewayUrl')&&planner.includes('env.agentGatewayUrl')],
 ['Garimpo cloud configurável',env.includes("'/api/runtime/prospecting'")&&prospecting.includes('env.prospectingGatewayUrl')],
 ['Comunicações cloud configurável',env.includes("'/api/runtime/communications'")&&comm.includes('runtimeFetch')],
 ['SSE serverless tem fallback polling autenticado',comm.includes('isCloudRuntimeProxy')&&comm.includes('setInterval')&&comm.includes('communications.changed')],
 ['Proxy valida sessão Supabase',proxy.includes('/auth/v1/user')&&proxy.includes('authentication_required')],
 ['Proxy injeta tokens server-only',proxy.includes('REALTALENT_AGENT_RUNTIME_TOKEN')&&proxy.includes('REALTALENT_RUNTIME_TOKEN')&&proxy.includes('REALTALENT_PROSPECTING_RUNTIME_TOKEN')],
 ['Proxy exige HTTPS em produção',proxy.includes('runtime_upstream_must_use_https')],
 ['Frontend envia sessão sem segredos privados',transport.includes('getSession()')&&transport.includes('Authorization')],
 ['Validador bloqueia segredo em VITE',validate.includes('VITE_OPENAI_API_KEY')&&validate.includes('VITE_REALTALENT_AGENT_RUNTIME_TOKEN')],
 ['Validador exige upstreams cloud',validate.includes('REALTALENT_AGENT_UPSTREAM_URL')&&validate.includes('REALTALENT_COMMUNICATIONS_UPSTREAM_URL')&&validate.includes('REALTALENT_PROSPECTING_UPSTREAM_URL')],
 ['Exemplo produção separa browser/server',prod.includes('Vercel Functions — server-only')&&prod.includes('OPENAI_API_KEY')],
 ['Vercel Functions têm timeout explícito',vr.includes('api/runtime-*.mjs')&&vr.includes('maxDuration')],
 ['Proxy Vercel usa functions fixas antes do fallback SPA',fixedAgent.includes("proxyRuntime(req,res,'agent')")&&fixedComm.includes("proxyRuntime(req,res,'communications')")&&fixedProspecting.includes("proxyRuntime(req,res,'prospecting')")&&vr.indexOf('/api/runtime/agent/:path*')<vr.indexOf('/(.*)')],
 ['OAuth cloud usa URL pública configurada',commGateway.includes('REALTALENT_COMMUNICATIONS_PUBLIC_URL')&&commGateway.includes('REALTALENT_PUBLIC_APP_URL')&&commGateway.includes('PUBLIC_GATEWAY_URL')],
 ['OAuth aceita credenciais server-only por ambiente',commGateway.includes('REALTALENT_GOOGLE_CLIENT_ID')&&commGateway.includes('REALTALENT_MICROSOFT_CLIENT_ID')],
 ['Node de produção evita runtime Vercel depreciado',pkg.includes('>=22.12.0 <23')],
 ['Runtime persistente único inclui Agent Comunicações e Garimpo',cloudSupervisor.includes("prefix:'/agent'")&&cloudSupervisor.includes("prefix:'/communications'")&&cloudSupervisor.includes("prefix:'/prospecting'")&&cloudDocker.includes('FROM node:22')],
]
let ok=0; for(const [name,pass] of checks){console.log(`${pass?'OK  ':'FAIL'} ${name}`); if(pass)ok++} console.log(`\nV3.5-H1 Cloud Production Readiness: ${ok}/${checks.length}`); if(ok!==checks.length)process.exit(1)
