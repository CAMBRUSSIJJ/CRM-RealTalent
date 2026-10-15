import fs from 'node:fs'
const root=new URL('../',import.meta.url)
const read=(p)=>fs.readFileSync(new URL(p,root),'utf8')
let passed=0;const failures=[]
const check=(name,ok)=>{if(ok){passed++;console.log('✓',name)}else{failures.push(name);console.error('✗',name)}}
const gateway=read('src/services/local-communications-gateway.ts')
const test=read('src/services/integration-framework.test.ts')
const launcher=(read('start-linux.sh') + '\n' + (fs.existsSync('start-linux-legacy.sh') ? read('start-linux-legacy.sh') : '') + '\n' + (fs.existsSync('scripts/start.mjs') ? read('scripts/start.mjs') : ''))
const index=read('index.html')
check('OAuth local não acessa window.location.href diretamente',!gateway.includes('returnUrl: window.location.href'))
check('OAuth local possui fallback Node/Vitest',gateway.includes("http://127.0.0.1:4188/")&&gateway.includes('globalThis.location'))
check('teste legado não exige mais conta demo',!test.includes("status: 'demo'")&&!test.includes("connectionMode: 'demo'"))
check('teste mocka endpoint OAuth do gateway',test.includes("/api/integrations/oauth/start")&&test.includes("vi.stubGlobal('fetch'"))
check('teste mocka listagem de contas',test.includes('/api/integrations/accounts?workspaceId='))
check('release H3 identificada no launcher',launcher.includes('V101.8.4-H3 — OAuth Runtime & Test Contract Fix'))
check('release H3 identificada no index',index.includes('V101.8.4-H3 — OAuth Runtime & Test Contract Fix'))
if(failures.length){console.error(`\nV101.8.4-H3 OAuth Runtime/Test Fix: FALHOU (${passed}/7)`);process.exit(1)}
console.log(`\nV101.8.4-H3 OAuth Runtime/Test Fix: OK (${passed}/7)`)
