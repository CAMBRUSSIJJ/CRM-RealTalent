import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const dist=path.join(root,'dist')
const fail=(message)=>{ console.error(`Bundle audit V101.1: FALHOU — ${message}`); process.exit(1) }
if(!fs.existsSync(dist)) fail('pasta dist ausente; execute npm run build primeiro')

const indexPath=path.join(dist,'index.html')
if(!fs.existsSync(indexPath)) fail('dist/index.html ausente')
const html=fs.readFileSync(indexPath,'utf8')

if(!html.includes('RealTalent CRM V101.1.0 — Consolidation & Runtime QA')) fail('título/versão incorretos no dist')
if(html.includes('Carregando RealTalent CRM')) fail('HTML legado reapareceu')
if(html.includes('esm.sh')) fail('dependência do CDN legado esm.sh detectada')
if(!html.includes('id="root"')) fail('mount #root ausente')
if(!fs.existsSync(path.join(dist,'boot-guard.js'))) fail('boot-guard.js não foi copiado para dist')
if(!fs.existsSync(path.join(dist,'health.json'))) fail('health.json ausente no dist')
if(!fs.existsSync(path.join(dist,'runtime-version.json'))) fail('runtime-version.json ausente no dist')

const health=JSON.parse(fs.readFileSync(path.join(dist,'health.json'),'utf8'))
const runtime=JSON.parse(fs.readFileSync(path.join(dist,'runtime-version.json'),'utf8'))
if(health.version!=='101.1.0') fail(`health.json aponta ${health.version}`)
if(runtime.version!=='101.1.0') fail(`runtime-version.json aponta ${runtime.version}`)

const refs=[...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((m)=>m[1])
const localRefs=refs.filter((ref)=>!ref.startsWith('http:')&&!ref.startsWith('https:')&&!ref.startsWith('data:')&&!ref.startsWith('#'))
for(const ref of localRefs){
  const clean=ref.split('?')[0].split('#')[0].replace(/^\.\//,'').replace(/^\//,'')
  if(!clean) continue
  const target=path.join(dist,clean)
  if(!fs.existsSync(target)) fail(`asset referenciado não existe: ${ref}`)
}
const assetsDir=path.join(dist,'assets')
if(!fs.existsSync(assetsDir)) fail('diretório assets ausente')
const assets=fs.readdirSync(assetsDir)
if(!assets.some((name)=>name.endsWith('.js'))) fail('bundle JavaScript ausente')
if(!assets.some((name)=>name.endsWith('.css'))) fail('bundle CSS ausente')

console.log(`Bundle audit V101.1: OK (${localRefs.length} referências locais verificadas; ${assets.length} assets).`)
