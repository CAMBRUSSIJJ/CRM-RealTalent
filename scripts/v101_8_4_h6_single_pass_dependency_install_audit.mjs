import fs from 'node:fs'
import { APPROVED_FEATURE_RUNTIME_DEPENDENCIES, auditRuntimeDependencies } from './runtime-dependency-policy.mjs'
const checks=[]
const ok=(name,pass)=>{checks.push([name,Boolean(pass)]);console.log(`${pass?'OK  ':'FAIL'} ${name}`)}
const read=p=>fs.readFileSync(p,'utf8')
const pkg=JSON.parse(read('package.json'))
const launcher=(read('start-linux.sh') + '\n' + (fs.existsSync('start-linux-legacy.sh') ? read('start-linux-legacy.sh') : '') + '\n' + (fs.existsSync('scripts/start.mjs') ? read('scripts/start.mjs') : ''))
const runtimeLauncher=fs.existsSync('scripts/start.mjs')?read('scripts/start.mjs'):''
const index=read('index.html')
const h5=read('scripts/v101_8_4_h5_whatsapp_web_qr_reliability_audit.mjs')
const deps=Object.keys(pkg.dependencies||{})
ok('baseline V101.8.4 preservada',['101.8.4','101.9.0','101.9.1','101.9.2','101.9.3','101.9.4','101.9.5','101.9.6','101.9.7','101.9.8','101.9.9','101.10.0','101.10.1','101.10.2','101.10.3','101.10.4','101.10.5','101.10.6','101.10.7','101.10.8','101.10.9','101.11.0','101.11.1','101.11.2','101.11.3'].includes(pkg.version))
ok('whatsapp-web.js é dependência runtime declarada',pkg.dependencies?.['whatsapp-web.js']==='1.34.7')
ok('policy aprova whatsapp-web.js por motivo explícito',Boolean(APPROVED_FEATURE_RUNTIME_DEPENDENCIES['whatsapp-web.js']))
ok('policy runtime continua enxuta',auditRuntimeDependencies(deps).ok)
ok('launcher remove árvore parcial antes de reparar',launcher.includes('rm -rf node_modules'))
ok('launcher instala dependências em uma única etapa',launcher.includes('npm install --no-audit --no-fund')||(runtimeLauncher.includes("npm(['install'")&&runtimeLauncher.includes("'--no-fund'")&&runtimeLauncher.includes("'--no-audit'")))
ok('launcher não faz segundo npm install de whatsapp-web.js',!launcher.includes('npm install --no-save --package-lock=false'))
ok('launcher valida os três componentes QR após instalar',launcher.includes("require.resolve('@whiskeysockets/baileys')")&&launcher.includes("require.resolve('qrcode')")&&launcher.includes("require.resolve('whatsapp-web.js')"))
ok('audit H5 foi atualizado para dependência declarada',h5.includes("pkg.dependencies?.['whatsapp-web.js']==='1.34.7'"))
ok('capacidade H6 permanece incorporada na release atual',(launcher.includes('npm install --no-audit --no-fund')||runtimeLauncher.includes("npm(['install'"))&&index.includes(`RealTalent CRM V${pkg.version}`))
const failed=checks.filter(([,v])=>!v)
console.log(`\nV101.8.4-H6 Single-Pass Dependency Install: ${checks.length-failed.length}/${checks.length} contratos aprovados.`)
if(failed.length)process.exit(1)
