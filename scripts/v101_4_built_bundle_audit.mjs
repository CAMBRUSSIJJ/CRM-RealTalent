import fs from 'node:fs'
import path from 'node:path'
const root=process.cwd(),dist=path.join(root,'dist')
const fail=(message)=>{console.error(`Bundle audit V101.4: FALHOU — ${message}`);process.exit(1)}
if(!fs.existsSync(dist)) fail('pasta dist ausente; execute npm run build primeiro')
const indexPath=path.join(dist,'index.html'); if(!fs.existsSync(indexPath)) fail('dist/index.html ausente')
const html=fs.readFileSync(indexPath,'utf8')
if(!html.includes('RealTalent CRM V101.4.0 — Calling Production Ready')) fail('título/versão incorretos no dist')
if(html.includes('Carregando RealTalent CRM')) fail('HTML legado reapareceu')
if(html.includes('esm.sh')) fail('dependência do CDN legado esm.sh detectada')
if(!html.includes('id="root"')) fail('mount #root ausente')
for(const file of ['boot-guard.js','health.json','runtime-version.json']) if(!fs.existsSync(path.join(dist,file))) fail(`${file} ausente no dist`)
const health=JSON.parse(fs.readFileSync(path.join(dist,'health.json'),'utf8')),runtime=JSON.parse(fs.readFileSync(path.join(dist,'runtime-version.json'),'utf8'))
if(health.version!=='101.4.0'||health.release!=='calling-production-ready') fail(`health.json inválido: ${health.version}/${health.release}`)
if(runtime.version!=='101.4.0'||runtime.channel!=='calling-production-ready'||runtime.default_port!==4187) fail(`runtime-version.json inválido: ${runtime.version}/${runtime.channel}/${runtime.default_port}`)
const refs=[...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((m)=>m[1])
const localRefs=refs.filter((ref)=>!ref.startsWith('http:')&&!ref.startsWith('https:')&&!ref.startsWith('data:')&&!ref.startsWith('#'))
for(const ref of localRefs){const clean=ref.split('?')[0].split('#')[0].replace(/^\.\//,'').replace(/^\//,'');if(clean&&!fs.existsSync(path.join(dist,clean))) fail(`asset referenciado não existe: ${ref}`)}
const assetsDir=path.join(dist,'assets');if(!fs.existsSync(assetsDir))fail('diretório assets ausente');const assets=fs.readdirSync(assetsDir);if(!assets.some((n)=>n.endsWith('.js')))fail('bundle JavaScript ausente');if(!assets.some((n)=>n.endsWith('.css')))fail('bundle CSS ausente')
console.log(`Bundle audit V101.4: OK (${localRefs.length} referências locais; ${assets.length} assets).`)
