import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'))
const expectedVersion = packageJson.version.replace(/\.0$/,'')
const baseUrl = (process.env.STAGING_URL || '').replace(/\/$/,'')
if (!baseUrl) throw new Error('Defina STAGING_URL.')
const checks=[]
const check=(name,ok,detail)=>checks.push({name,ok:Boolean(ok),detail})
const healthResponse=await fetch(`${baseUrl}/health.json`,{headers:{'cache-control':'no-cache'}})
const health=healthResponse.ok ? await healthResponse.json() : {}
check('Health HTTP',healthResponse.ok,`${healthResponse.status}`)
check('Versão publicada',health.version===expectedVersion,`${health.version ?? 'ausente'} / esperado ${expectedVersion}`)
check('Canal de release',health.channel==='staging'||health.channel==='production',health.channel ?? 'ausente')
check('Commit rastreável',typeof health.commit==='string'&&health.commit.length>=7,health.commit ?? 'ausente')
const page=await fetch(baseUrl,{redirect:'follow'})
const html=await page.text()
check('Aplicação HTTP',page.ok,`${page.status}`)
check('Aplicação identificada',html.includes('RealTalent CRM')||html.includes('id="root"'),'documento principal')
const headers=page.headers
check('CSP publicada',Boolean(headers.get('content-security-policy')),headers.get('content-security-policy') ?? 'ausente')
check('Proteção de frame',headers.get('x-frame-options')==='DENY',headers.get('x-frame-options') ?? 'ausente')
const failed=checks.filter(item=>!item.ok)
const report={version:packageJson.version,baseUrl,generatedAt:new Date().toISOString(),passed:failed.length===0,checks}
const label=`V${expectedVersion.replaceAll('.','-')}`
fs.writeFileSync(path.join(root,`STAGING-VERIFICATION-${label}.json`),JSON.stringify(report,null,2)+'\n')
for(const item of checks) console.log(`${item.ok?'OK':'FALHA'} — ${item.name}: ${item.detail}`)
if(failed.length) process.exit(1)
