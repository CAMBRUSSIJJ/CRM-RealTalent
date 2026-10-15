import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const STATE_DIR = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'realtalent-agent')
const AWARENESS_DIR = path.join(STATE_DIR, 'project-awareness')
const HISTORY_FILE = path.join(AWARENESS_DIR, 'technical-history.json')
const SOURCE_EXT = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs','.css','.scss','.json','.sql'])
const CODE_EXT = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs'])
const IGNORE_DIRS = new Set(['node_modules','dist','build','.git','.cache','coverage','.next','.vite'])
const INDEX_VERSION = 2

const STOP = new Set('a o os as de da do das dos e em no na nos nas um uma para por com sem que qual quais como onde esta está isso esse essa estes estas ao aos se eu voce você tu me diga explique sobre tudo toda todo melhorar corrigir arrumar fazer faça'.split(/\s+/))
const nowIso = () => new Date().toISOString()
const clean = (v, n=1200) => String(v ?? '').replace(/\s+/g,' ').trim().slice(0,n)
const rel = (root, file) => path.relative(root,file).split(path.sep).join('/')
const safeRead = (file) => { try { return fs.readFileSync(file,'utf8') } catch { return '' } }
const safeJson = (file,fallback) => { try { return JSON.parse(fs.readFileSync(file,'utf8')) } catch { return fallback } }
const writeAtomic = (file, value) => { fs.mkdirSync(path.dirname(file),{recursive:true}); const tmp=`${file}.${process.pid}.tmp`; fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600}); fs.renameSync(tmp,file); try{fs.chmodSync(file,0o600)}catch{} }
const indexFile = (product) => path.join(AWARENESS_DIR, `${product}-index.json`)

function normalize(text){return String(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function tokenize(text){
  return [...new Set(normalize(text).split(/[^a-z0-9_/-]+/).filter(x=>x.length>=3&&!STOP.has(x)))].slice(0,48)
}
function walk(root){
  const out=[]; const stack=[root]
  while(stack.length){
    const dir=stack.pop(); let entries=[]; try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch{continue}
    for(const e of entries){
      if(e.name.startsWith('.') && e.name!=='.env.example') continue
      const p=path.join(dir,e.name)
      if(e.isDirectory()){if(!IGNORE_DIRS.has(e.name))stack.push(p);continue}
      if(!e.isFile())continue
      const ext=path.extname(e.name).toLowerCase()
      if(SOURCE_EXT.has(ext))out.push(p)
    }
  }
  return out
}
function moduleFor(product, relativePath){
  const parts=relativePath.split('/')
  if(/(?:^|\/)supabase\/migrations\//.test(relativePath)||/migrations\//.test(relativePath))return 'supabase/migrations'
  if(parts[0]!=='src')return parts[0]||'root'
  if(product==='crm'&&parts[1]==='features'&&parts[2])return `features/${parts[2]}`
  if(product==='blue_ocean'&&parts[1]==='views'&&parts[2])return `views/${path.basename(parts[2],path.extname(parts[2]))}`
  if(parts[1]==='features'&&parts[2])return `features/${parts[2]}`
  if(parts[1]==='components')return 'components'
  if(parts[1]==='platform'&&parts[2])return `platform/${parts[2]}`
  if(parts[1]==='services')return 'services'
  if(parts[1]==='repositories')return 'repositories'
  if(parts[1]==='domain')return 'domain'
  if(parts[1]==='state')return 'state'
  return parts[1]||'src'
}
function extractSymbols(text){
  const found=[]; const re=/\b(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)/g
  let m; while((m=re.exec(text))&&found.length<100)found.push(m[1])
  return [...new Set(found)]
}
function extractDataSymbols(text){
  const found=[]; const re=/\b(?:export\s+)?(?:interface|type|class|enum)\s+([A-Z][A-Za-z0-9_$]*)/g
  let m; while((m=re.exec(text))&&found.length<80)found.push(m[1])
  return [...new Set(found)]
}
function extractImports(text){
  const out=[]; const patterns=[/\b(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g,/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g]
  for(const re of patterns){let m;while((m=re.exec(text))&&out.length<160)out.push(m[1])}
  return [...new Set(out)]
}
function collectMatches(text, patterns, limit=80){
  const out=[]
  for(const re of patterns){let m;while((m=re.exec(text))&&out.length<limit){const v=String(m[1]||'').trim();if(v)out.push(v)}}
  return [...new Set(out)]
}
function extractRoutes(text){
  const defined=collectMatches(text,[/<Route\b[^>]*\bpath\s*=\s*["']([^"']+)["']/g,/\bpath\s*:\s*["']([^"']+)["']/g],60)
  const referenced=collectMatches(text,[/\bnavigate\(\s*["']([^"']+)["']/g,/\bto\s*=\s*["']([^"']+)["']/g,/\bhref\s*=\s*["']([^"']+)["']/g],80)
  return {defined,referenced}
}
function extractSupabase(text,relativePath){
  const tables=collectMatches(text,[/\.from\(\s*["']([^"']+)["']\s*\)/g,/\b(?:create|alter)\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["']?([A-Za-z0-9_]+)["']?/gi],120)
  const rpcs=collectMatches(text,[/\.rpc\(\s*["']([^"']+)["']/g,/\bcreate\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([A-Za-z0-9_]+)/gi],80)
  const buckets=collectMatches(text,[/\.storage\.from\(\s*["']([^"']+)["']/g],40)
  const policies=collectMatches(text,[/\bcreate\s+policy\s+["']?([^"'\n]+?)["']?\s+on\s+/gi],40)
  return {tables,rpcs,buckets,policies,migration:path.extname(relativePath).toLowerCase()==='.sql'||/migrations\//i.test(relativePath)}
}
function resolveImport(root, fromRel, spec){
  if(!spec)return null
  let base
  if(spec.startsWith('.'))base=path.resolve(root,path.dirname(fromRel),spec)
  else if(spec.startsWith('@/'))base=path.resolve(root,'src',spec.slice(2))
  else if(spec.startsWith('src/'))base=path.resolve(root,spec)
  else return null
  const candidates=[base,...['.ts','.tsx','.js','.jsx','.mjs','.cjs','.json'].map(x=>base+x),...['index.ts','index.tsx','index.js','index.jsx'].map(x=>path.join(base,x))]
  for(const c of candidates){try{if(fs.statSync(c).isFile())return rel(root,c)}catch{}}
  return null
}
function fileRecord(product,root,file){
  const relativePath=rel(root,file), ext=path.extname(file).toLowerCase(); let stat
  try{stat=fs.statSync(file)}catch{return null}
  const max=900_000; let text=''; if(stat.size<=max)text=safeRead(file)
  const lines=text?text.split(/\r?\n/):[]; const imports=CODE_EXT.has(ext)?extractImports(text):[]
  const resolved=imports.map(s=>resolveImport(root,relativePath,s)).filter(Boolean)
  const todos=(text.match(/\b(?:TODO|FIXME|HACK|XXX)\b/gi)||[]).length
  const exports=CODE_EXT.has(ext)?extractSymbols(text):[]
  const dataSymbols=CODE_EXT.has(ext)?extractDataSymbols(text):[]
  const routes=CODE_EXT.has(ext)?extractRoutes(text):{defined:[],referenced:[]}
  const supabase=extractSupabase(text,relativePath)
  const isTest=/(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[jt]sx?$/.test(relativePath)
  const ui=/(?:page|view|screen|drawer|modal|panel|card|layout|component)\.[jt]sx?$|\/views\/|\/components\//i.test(relativePath)
  const uiComponents=ui?exports.filter(x=>/^[A-Z]/.test(x)).slice(0,40):[]
  return {path:relativePath,module:moduleFor(product,relativePath),ext,size:stat.size,mtimeMs:Math.round(stat.mtimeMs),lines:lines.length,todos,isTest,ui,exports:exports.slice(0,60),dataSymbols:dataSymbols.slice(0,50),uiComponents,imports:imports.slice(0,100),resolvedImports:[...new Set(resolved)].slice(0,100),routes,supabase}
}
function healthFromFiles(files,edges){
  const groups=new Map(); for(const f of files){if(!groups.has(f.module))groups.set(f.module,[]);groups.get(f.module).push(f)}
  const incoming=new Map(); for(const e of edges)incoming.set(e.to,(incoming.get(e.to)||0)+1)
  const modules=[]
  for(const [name,items] of groups){
    const source=items.filter(x=>!x.isTest), tests=items.filter(x=>x.isTest)
    const lines=source.reduce((s,x)=>s+x.lines,0), todos=source.reduce((s,x)=>s+x.todos,0)
    const large=source.filter(x=>x.lines>700).length, huge=source.filter(x=>x.lines>1400).length
    const maxFanIn=Math.max(0,...source.map(x=>incoming.get(x.path)||0)); let score=100
    score-=Math.min(14,todos*2); score-=Math.min(16,large*4+huge*4)
    if(source.length>=5&&tests.length===0)score-=8
    if(maxFanIn>15)score-=Math.min(10,Math.floor((maxFanIn-15)/3)+3)
    score=Math.max(45,Math.min(100,score))
    modules.push({name,score,status:score>=88?'healthy':score>=74?'attention':'risk',files:source.length,tests:tests.length,lines,todos,largeFiles:large,highCoupling:maxFanIn,method:'static-structural'})
  }
  return modules.sort((a,b)=>a.score-b.score||b.lines-a.lines)
}
function aggregateEdges(edges,filesByPath){
  const map=new Map()
  for(const e of edges){const a=filesByPath.get(e.from)?.module,b=filesByPath.get(e.to)?.module;if(!a||!b||a===b)continue;const k=`${a}\u0000${b}`;const cur=map.get(k)||{from:a,to:b,count:0};cur.count++;map.set(k,cur)}
  return [...map.values()].sort((a,b)=>b.count-a.count||a.from.localeCompare(b.from))
}
function namedRefs(items,key='name'){
  const map=new Map(); for(const item of items){const name=item[key];if(!name)continue;const cur=map.get(name)||{name,definedBy:[],referencedBy:[]};for(const p of item.definedBy||[])if(!cur.definedBy.includes(p))cur.definedBy.push(p);for(const p of item.referencedBy||[])if(!cur.referencedBy.includes(p))cur.referencedBy.push(p);map.set(name,cur)}return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name))
}
function buildGraphs(records,edges,history=[]){
  const filesByPath=new Map(records.map(x=>[x.path,x]))
  const moduleMap=new Map(); for(const f of records){const cur=moduleMap.get(f.module)||{name:f.module,files:0,tests:0,ui:0,dataSymbols:0};cur.files++;if(f.isTest)cur.tests++;if(f.ui)cur.ui++;cur.dataSymbols+=f.dataSymbols?.length||0;moduleMap.set(f.module,cur)}
  const architecture={nodes:[...moduleMap.values()].sort((a,b)=>b.files-a.files||a.name.localeCompare(b.name)),edges:aggregateEdges(edges,filesByPath)}
  const uiComponents=[]; for(const f of records)for(const name of f.uiComponents||[])uiComponents.push({name,path:f.path,module:f.module,imports:f.resolvedImports.slice(0,20)})
  const routeMap=new Map(); for(const f of records){for(const r of f.routes?.defined||[]){const cur=routeMap.get(r)||{path:r,definedBy:[],referencedBy:[]};cur.definedBy.push(f.path);routeMap.set(r,cur)}for(const r of f.routes?.referenced||[]){const cur=routeMap.get(r)||{path:r,definedBy:[],referencedBy:[]};cur.referencedBy.push(f.path);routeMap.set(r,cur)}}
  const routes=[...routeMap.values()].map(x=>({...x,definedBy:[...new Set(x.definedBy)],referencedBy:[...new Set(x.referencedBy)]})).sort((a,b)=>a.path.localeCompare(b.path))
  const dataMap=new Map(); for(const f of records)for(const name of f.dataSymbols||[]){const cur=dataMap.get(name)||{name,definedBy:[],referencedBy:[]};cur.definedBy.push(f.path);dataMap.set(name,cur)}
  for(const e of edges){const target=filesByPath.get(e.to);if(!target?.dataSymbols?.length)continue;for(const name of target.dataSymbols){const cur=dataMap.get(name);if(cur&&!cur.referencedBy.includes(e.from))cur.referencedBy.push(e.from)}}
  const dataEntities=[...dataMap.values()].sort((a,b)=>b.referencedBy.length-a.referencedBy.length||a.name.localeCompare(b.name))
  const tableMap=new Map(),rpcMap=new Map(),bucketMap=new Map(),migrationFiles=[]
  const add=(map,name,file,kind)=>{if(!name)return;const cur=map.get(name)||{name,references:[],migrations:[]};if(kind==='migration'){if(!cur.migrations.includes(file))cur.migrations.push(file)}else if(!cur.references.includes(file))cur.references.push(file);map.set(name,cur)}
  for(const f of records){if(f.supabase?.migration)migrationFiles.push(f.path);for(const n of f.supabase?.tables||[])add(tableMap,n,f.path,f.supabase.migration?'migration':'reference');for(const n of f.supabase?.rpcs||[])add(rpcMap,n,f.path,f.supabase.migration?'migration':'reference');for(const n of f.supabase?.buckets||[])add(bucketMap,n,f.path,'reference')}
  const featureModules=[...moduleMap.values()].filter(x=>x.name.startsWith('features/')||x.name.startsWith('views/')||['components','services','domain','repositories','state','platform'].some(p=>x.name===p||x.name.startsWith(p+'/')))
  const moduleEdges=architecture.edges; const features=featureModules.map(m=>({name:m.name,files:m.files,tests:m.tests,dependencies:moduleEdges.filter(e=>e.from===m.name).slice(0,30).map(e=>({module:e.to,count:e.count})),dependents:moduleEdges.filter(e=>e.to===m.name).slice(0,30).map(e=>({module:e.from,count:e.count}))})).sort((a,b)=>b.files-a.files||a.name.localeCompare(b.name))
  const changes=(history||[]).slice(0,120).map(h=>({id:h.id,at:h.at,kind:h.kind||'event',product:h.product||null,objective:clean(h.objective||'',300),summary:clean(h.summary||'',500),status:h.status||null,files:Array.isArray(h.files)?h.files.slice(0,30):[]}))
  return {architecture,ui:{components:uiComponents.slice(0,1200)},routes:{routes},data:{entities:dataEntities.slice(0,1600)},supabase:{tables:[...tableMap.values()],rpcs:[...rpcMap.values()],buckets:[...bucketMap.values()],migrationFiles:[...new Set(migrationFiles)]},features:{modules:features},history:{events:changes}}
}
function fingerprint(records){return crypto.createHash('sha256').update(records.map(x=>`${x.path}:${x.mtimeMs}:${x.size}`).sort().join('\n')).digest('hex')}
function rebuildIndex({product,root,packageJson,records,sync}){
  const pathSet=new Set(records.map(x=>x.path)); const edges=[]
  for(const f of records)for(const to of f.resolvedImports||[])if(pathSet.has(to))edges.push({from:f.path,to})
  const reverse={}; for(const e of edges){(reverse[e.to]??=[]).push(e.from)}
  for(const k of Object.keys(reverse))reverse[k]=[...new Set(reverse[k])].slice(0,240)
  const modules=healthFromFiles(records,edges); const history=technicalHistory({product,limit:120}); const graphs=buildGraphs(records,edges,history)
  const graphStats={architectureNodes:graphs.architecture.nodes.length,architectureEdges:graphs.architecture.edges.length,uiComponents:graphs.ui.components.length,routes:graphs.routes.routes.length,dataEntities:graphs.data.entities.length,supabaseTables:graphs.supabase.tables.length,supabaseRpcs:graphs.supabase.rpcs.length,features:graphs.features.modules.length,historyEvents:graphs.history.events.length}
  return {version:INDEX_VERSION,brainVersion:'1.7.0',product,workspace:root,package:{name:packageJson.name||'',version:packageJson.version||''},generatedAt:nowIso(),fingerprint:fingerprint(records),sync,stats:{files:records.length,codeFiles:records.filter(x=>CODE_EXT.has(x.ext)).length,tests:records.filter(x=>x.isTest).length,edges:edges.length,modules:modules.length,...graphStats},files:records,edges,reverseDependencies:reverse,graphs,health:{method:'static-structural',disclaimer:'Indicador estrutural; não prova funcionamento em runtime.',modules}}
}
export function buildProjectIndex({product,workspace}){
  if(!['crm','blue_ocean'].includes(product))throw new Error('Produto inválido para Project Brain.')
  const started=Date.now(),root=fs.realpathSync(workspace); if(!fs.existsSync(path.join(root,'package.json')))throw new Error('Workspace inválido.')
  const packageJson=safeJson(path.join(root,'package.json'),{}), files=walk(root),records=files.map(f=>fileRecord(product,root,f)).filter(Boolean)
  const index=rebuildIndex({product,root,packageJson,records,sync:{mode:'full',added:records.length,changed:0,removed:0,reused:0,durationMs:Date.now()-started}});writeAtomic(indexFile(product),index);return index
}
export function updateProjectIndex({product,workspace}){
  if(!['crm','blue_ocean'].includes(product))throw new Error('Produto inválido para Project Brain.')
  const started=Date.now(),root=fs.realpathSync(workspace); if(!fs.existsSync(path.join(root,'package.json')))throw new Error('Workspace inválido.')
  const existing=loadProjectIndex(product); if(!existing||existing.version!==INDEX_VERSION||existing.workspace!==root)return buildProjectIndex({product,workspace:root})
  const packageJson=safeJson(path.join(root,'package.json'),{}), currentFiles=walk(root),oldMap=new Map((existing.files||[]).map(x=>[x.path,x])),seen=new Set(),records=[];let added=0,changed=0,reused=0
  for(const f of currentFiles){const p=rel(root,f);seen.add(p);let stat;try{stat=fs.statSync(f)}catch{continue}const old=oldMap.get(p);if(old&&old.size===stat.size&&old.mtimeMs===Math.round(stat.mtimeMs)){records.push(old);reused++;continue}const rec=fileRecord(product,root,f);if(rec){records.push(rec);if(old)changed++;else added++}}
  const removed=[...oldMap.keys()].filter(p=>!seen.has(p)).length
  const index=rebuildIndex({product,root,packageJson,records,sync:{mode:'incremental',added,changed,removed,reused,durationMs:Date.now()-started}});writeAtomic(indexFile(product),index);return index
}
export function loadProjectIndex(product){return safeJson(indexFile(product),null)}
export function ensureProjectIndex({product,workspace,maxAgeMs=10*60*1000}){
  const existing=loadProjectIndex(product); const root=fs.realpathSync(workspace)
  if(existing&&existing.version===INDEX_VERSION&&existing.workspace===root&&Date.now()-Date.parse(existing.generatedAt||0)<maxAgeMs)return existing
  return updateProjectIndex({product,workspace:root})
}
function matchingSnippets(root,filePath,tokens,limit=4){
  const text=safeRead(path.join(root,filePath)); if(!text)return []
  const lines=text.split(/\r?\n/); const out=[]
  for(let i=0;i<lines.length&&out.length<limit;i++){const low=normalize(lines[i]);if(tokens.some(t=>low.includes(t)))out.push({line:i+1,text:clean(lines[i],360)})}
  return out
}
export function searchProject({product,workspace,query,limit=10}){
  const index=ensureProjectIndex({product,workspace}); const tokens=tokenize(query); if(!tokens.length)return {query,product,results:[],index:{generatedAt:index.generatedAt,stats:index.stats}}
  const scored=[]
  for(const f of index.files){const pathLow=normalize(f.path),moduleLow=normalize(f.module),symbolLow=normalize([...(f.exports||[]),...(f.dataSymbols||[]),...(f.uiComponents||[])].join(' '));let score=0;const matched=[]
    for(const t of tokens){let hit=0;if(pathLow.includes(t))hit+=8;if(moduleLow.includes(t))hit+=5;if(symbolLow.includes(t))hit+=7;if((f.imports||[]).some(x=>normalize(x).includes(t)))hit+=2;if((f.routes?.defined||[]).some(x=>normalize(x).includes(t)))hit+=5;if((f.supabase?.tables||[]).some(x=>normalize(x).includes(t)))hit+=6;if(hit){score+=hit;matched.push(t)}}if(score)scored.push({file:f,score,matched})}
  if(scored.length<limit){for(const f of index.files.filter(x=>CODE_EXT.has(x.ext)&&x.size<500_000)){if(scored.some(s=>s.file.path===f.path))continue;const txt=normalize(safeRead(path.join(workspace,f.path)));const hits=tokens.filter(t=>txt.includes(t));if(hits.length)scored.push({file:f,score:hits.length*3,matched:hits})}}
  const results=scored.sort((a,b)=>b.score-a.score||a.file.path.localeCompare(b.file.path)).slice(0,Math.max(1,Math.min(24,limit))).map(s=>({path:s.file.path,module:s.file.module,score:s.score,matched:s.matched,symbols:s.file.exports.slice(0,16),dataSymbols:(s.file.dataSymbols||[]).slice(0,10),routes:(s.file.routes?.defined||[]).slice(0,8),tables:(s.file.supabase?.tables||[]).slice(0,8),lines:s.file.lines,incoming:(index.reverseDependencies[s.file.path]||[]).length,snippets:matchingSnippets(workspace,s.file.path,tokens)}))
  return {query:clean(query,1000),product,results,index:{generatedAt:index.generatedAt,fingerprint:index.fingerprint,stats:index.stats,sync:index.sync}}
}
function graphMatches(index,tokens){
  const contains=v=>tokens.some(t=>normalize(v).includes(t))
  return {
    modules:(index.graphs?.architecture?.nodes||[]).filter(x=>contains(x.name)).slice(0,10),
    routes:(index.graphs?.routes?.routes||[]).filter(x=>contains(x.path)).slice(0,10),
    dataEntities:(index.graphs?.data?.entities||[]).filter(x=>contains(x.name)).slice(0,10),
    tables:(index.graphs?.supabase?.tables||[]).filter(x=>contains(x.name)).slice(0,10),
    rpcs:(index.graphs?.supabase?.rpcs||[]).filter(x=>contains(x.name)).slice(0,10),
    uiComponents:(index.graphs?.ui?.components||[]).filter(x=>contains(x.name)||contains(x.path)).slice(0,10),
    features:(index.graphs?.features?.modules||[]).filter(x=>contains(x.name)).slice(0,10),
  }
}
export function projectBrainContext({product,workspace,query,limit=8}){
  const index=ensureProjectIndex({product,workspace});const search=searchProject({product,workspace,query,limit});const tokens=tokenize(query),graph=graphMatches(index,tokens)
  const modules=[...new Set(search.results.map(r=>r.module))];const architectureEdges=(index.graphs?.architecture?.edges||[]).filter(e=>modules.includes(e.from)||modules.includes(e.to)).slice(0,30)
  return {enabled:true,version:'1.7.0',product,index:{generatedAt:index.generatedAt,fingerprint:index.fingerprint,stats:index.stats,sync:index.sync},search:search.results.slice(0,limit),graph:{...graph,architectureEdges},disclaimer:'Project Brain usa análise estática/incremental; confirme comportamento dinâmico com testes e Browser QA.'}
}
export function impactAnalysis({product,workspace,target,depth=2}){
  const index=ensureProjectIndex({product,workspace}); const targetLow=normalize(target)
  let seeds=index.files.filter(f=>normalize(f.path)===targetLow||normalize(f.path).endsWith('/'+targetLow)||normalize(f.module)===targetLow||normalize(f.module).endsWith('/'+targetLow)||(f.exports||[]).some(s=>normalize(s)===targetLow)||(f.dataSymbols||[]).some(s=>normalize(s)===targetLow))
  if(!seeds.length)seeds=searchProject({product,workspace,query:target,limit:3}).results.map(r=>index.files.find(f=>f.path===r.path)).filter(Boolean)
  const seen=new Set(seeds.map(x=>x.path)); let frontier=[...seen]; const levels=[]
  for(let d=1;d<=Math.min(4,Math.max(1,depth));d++){const next=[];for(const p of frontier)for(const dep of index.reverseDependencies[p]||[])if(!seen.has(dep)){seen.add(dep);next.push(dep)}levels.push({depth:d,files:next.slice(0,160)});frontier=next}
  const all=[...seen], sensitive=all.filter(p=>/(auth|permission|security|repository|supabase|migration|communications|whatsapp|payment)/i.test(p));const affectedRecords=all.map(p=>index.files.find(f=>f.path===p)).filter(Boolean)
  const tables=[...new Set(affectedRecords.flatMap(f=>f.supabase?.tables||[]))],routes=[...new Set(affectedRecords.flatMap(f=>f.routes?.defined||[]))],dataEntities=[...new Set(affectedRecords.flatMap(f=>f.dataSymbols||[]))]
  const risk=all.length>35||sensitive.length>5||tables.length>5?'high':all.length>12||sensitive.length>1||tables.length>1?'medium':'low'
  return {product,target:clean(target,500),seeds:seeds.map(x=>x.path),affectedFiles:all.slice(0,220),levels,affectedGraph:{tables:tables.slice(0,40),routes:routes.slice(0,40),dataEntities:dataEntities.slice(0,80),modules:[...new Set(affectedRecords.map(f=>f.module))].slice(0,60)},risk,reasons:[`${all.length} arquivos no alcance estático`,sensitive.length?`${sensitive.length} arquivos em áreas sensíveis`:'sem área sensível evidente',tables.length?`${tables.length} entidades Supabase relacionadas`:null].filter(Boolean),disclaimer:'Análise estática de imports/grafos; efeitos dinâmicos em runtime exigem testes.'}
}
const ROOT_CAUSE_PATTERNS=[
  {id:'duplicate-listener',match:/duplicad|duas vezes|repetid|double|duplicat/i,terms:['useEffect','addEventListener','subscribe','listener','onMessage','retry'],hypothesis:'Listener, subscription ou retry pode estar sendo registrado/executado mais de uma vez.'},
  {id:'search-no-results',match:/n[aã]o busca|n[aã]o encontra|sem resultado|search|garimpo/i,terms:['search','fetch','query','prospecting','fallback','result'],hypothesis:'A cadeia de busca/fallback, filtros ou atualização de resultados pode estar interrompendo ou descartando resultados.'},
  {id:'slow-performance',match:/lento|demora|pesado|performance|trav/i,terms:['useEffect','fetch','map','filter','setInterval','debounce','memo'],hypothesis:'Re-renderização, polling, processamento de listas ou chamadas repetidas podem estar elevando o custo.'},
  {id:'state-persistence',match:/n[aã]o salva|some|desaparece|persist|reset/i,terms:['localStorage','sessionStorage','repository','save','persist','state'],hypothesis:'O estado pode não estar sendo persistido, hidratado ou reconciliado corretamente.'},
  {id:'runtime-error',match:/erro|falha|quebra|tela branca|crash/i,terms:['throw','catch','error','undefined','null'],hypothesis:'Uma exceção, valor ausente ou caminho de erro pode estar interrompendo o fluxo.'},
]
export function rootCauseEvidence({product,workspace,symptom,limit=10}){
  const pattern=ROOT_CAUSE_PATTERNS.find(x=>x.match.test(String(symptom||'')))||ROOT_CAUSE_PATTERNS[4]
  const enriched=`${symptom} ${pattern.terms.join(' ')}`; const search=searchProject({product,workspace,query:enriched,limit});const brain=projectBrainContext({product,workspace,query:symptom,limit:6})
  const hypotheses=[{id:pattern.id,hypothesis:pattern.hypothesis,confidence:search.results.length?0.58:0.28,evidence:search.results.slice(0,6).map(r=>({path:r.path,snippets:r.snippets.slice(0,2)})),graphEvidence:{tables:brain.graph.tables.map(x=>x.name),routes:brain.graph.routes.map(x=>x.path),features:brain.graph.features.map(x=>x.name)},nextTest:'Validar esta hipótese com logs, reprodução e/ou Browser QA antes de alterar código.'}]
  const importsHeavy=search.results.find(r=>r.incoming>=8);if(importsHeavy)hypotheses.push({id:'shared-dependency',hypothesis:'Um módulo compartilhado de alto acoplamento pode amplificar o sintoma em vários fluxos.',confidence:0.34,evidence:[{path:importsHeavy.path,incoming:importsHeavy.incoming}],nextTest:'Reproduzir o sintoma isolando consumidores deste módulo.'})
  return {product,symptom:clean(symptom,1200),hypotheses,search,projectBrain:brain.graph,disclaimer:'Hipóteses estáticas, não causas confirmadas. Confirme com execução/telemetria antes de corrigir.'}
}
export function explainArea({product,workspace,query}){const search=searchProject({product,workspace,query,limit:8});const brain=projectBrainContext({product,workspace,query,limit:8});const modules=[...new Set(search.results.map(r=>r.module))];const impact=search.results[0]?impactAnalysis({product,workspace,target:search.results[0].path,depth:1}):null;return {product,query:clean(query,1000),summary:{modules,files:search.results.map(r=>r.path),primary:search.results[0]?.path||null},search,projectBrain:brain.graph,impact,disclaimer:'Mapa baseado na estrutura e no conteúdo do código atual.'}}
export function healthMap({product,workspace}){const index=ensureProjectIndex({product,workspace});return {product,generatedAt:index.generatedAt,stats:index.stats,method:index.health.method,disclaimer:index.health.disclaimer,modules:index.health.modules}}
export function projectBrainGraph({product,workspace,type='architecture',limit=200}){const index=ensureProjectIndex({product,workspace});const g=index.graphs||{};let value;if(type==='architecture')value=g.architecture;else if(type==='routes')value=g.routes;else if(type==='data')value=g.data;else if(type==='ui')value=g.ui;else if(type==='supabase')value=g.supabase;else if(type==='features')value=g.features;else if(type==='history')value=g.history;else throw new Error('Tipo de grafo inválido.');const cap=Math.max(1,Math.min(1000,Number(limit)||200));if(Array.isArray(value?.nodes))value={...value,nodes:value.nodes.slice(0,cap),edges:(value.edges||[]).slice(0,cap*2)};else if(Array.isArray(value?.routes))value={...value,routes:value.routes.slice(0,cap)};else if(Array.isArray(value?.entities))value={...value,entities:value.entities.slice(0,cap)};else if(Array.isArray(value?.components))value={...value,components:value.components.slice(0,cap)};else if(Array.isArray(value?.modules))value={...value,modules:value.modules.slice(0,cap)};else if(Array.isArray(value?.events))value={...value,events:value.events.slice(0,cap)};return {product,type,generatedAt:index.generatedAt,stats:index.stats,value,disclaimer:'Grafo derivado estaticamente do workspace registrado.'}}
export function recordTechnicalHistory(entry){const store=safeJson(HISTORY_FILE,{version:1,entries:[]});const item={id:`hist_${crypto.randomUUID()}`,at:nowIso(),...JSON.parse(JSON.stringify(entry||{}))};store.entries.push(item);store.entries=store.entries.slice(-500);writeAtomic(HISTORY_FILE,store);return item}
export function technicalHistory({product=null,limit=60}={}){const store=safeJson(HISTORY_FILE,{version:1,entries:[]});return store.entries.filter(x=>!product||x.product===product).slice(-Math.max(1,Math.min(300,limit))).reverse()}
export const projectAwarenessInfo={version:'1.7.0',brainVersion:'1.7.0',indexVersion:INDEX_VERSION,indexDir:AWARENESS_DIR,historyFile:HISTORY_FILE,capabilities:['incremental-index','architecture-graph','data-graph','route-graph','ui-component-graph','supabase-graph','feature-graph','historical-change-graph','retrieval','impact-analysis','root-cause-evidence','health-map','technical-history']}
