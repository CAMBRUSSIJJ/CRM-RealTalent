import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const read=(f)=>fs.readFileSync(path.join(root,f),'utf8')
const exists=(f)=>fs.existsSync(path.join(root,f))
const checks=[]
const check=(label,pass)=>checks.push({label,pass:Boolean(pass)})
const atLeast=(current,target)=>{
  const a=String(current).split('.').map(Number)
  const b=String(target).split('.').map(Number)
  for(let i=0;i<3;i+=1){ if((a[i]??0)>(b[i]??0)) return true; if((a[i]??0)<(b[i]??0)) return false }
  return true
}

const pkg=JSON.parse(read('package.json'))
const lock=JSON.parse(read('package-lock.json'))
const runtime=JSON.parse(read('public/runtime-version.json'))
const health=JSON.parse(read('public/health.json'))
const version=read('src/lib/app-version.ts')
const main=read('src/main.tsx')
const mapPage=read('src/features/commercial-map/commercial-map-page.tsx')
const mapRuntime=read('public/commercial-map-runtime.js')
const vite=read('vite.config.ts')
const settings=read('src/features/settings/settings-page.tsx')
const mapsPanel=read('src/features/settings/maps-integration-panel.tsx')
const uiCss=read('src/styles/design-system-v101.css')
const mapCss=read('src/styles/territory-ui-system-v101.css')
const launcher=((read('start-linux.sh') + '\n' + (fs.existsSync('start-linux-legacy.sh') ? read('start-linux-legacy.sh') : '') + '\n' + (fs.existsSync('scripts/start.mjs') ? read('scripts/start.mjs') : '')) + '\n' + (exists?.('start-linux-legacy.sh') ? read('start-linux-legacy.sh') : '') + '\n' + (exists?.('scripts/start.mjs') ? read('scripts/start.mjs') : ''))

check('package preserva V101.0+',atLeast(pkg.version,'101.0.0'))
check('package-lock acompanha versão',lock.version===pkg.version&&lock.packages?.['']?.version===pkg.version)
check('VERSION acompanha package',read('VERSION').trim()===`V${pkg.version}`)
check('APP_VERSION acompanha package',version.includes(`APP_VERSION = '${pkg.version}'`))
check('health acompanha versão atual',health.version===pkg.version)
check('runtime acompanha versão atual',runtime.version===pkg.version)
check('runtime preserva Connect',runtime.connect_port===3001)
check('index identifica release atual',read('index.html').includes(`RealTalent CRM V${pkg.version}`))

check('runtime não usa CARTO',!mapRuntime.includes('basemaps.cartocdn.com'))
check('runtime usa OpenStreetMap',mapRuntime.includes('https://tile.openstreetmap.org/{z}/{x}/{y}.png'))
check('runtime mantém atribuição OSM',mapRuntime.includes('OpenStreetMap contributors'))
check('rotas abrem Google Maps sem chave',mapRuntime.includes('google.com/maps/search/?api=1'))
check('estilos claro/ruas/escuro preservados',mapRuntime.includes("light:{url:")&&mapRuntime.includes("streets:{url:")&&mapRuntime.includes("dark:{url:"))
check('CARTO API KEY REQUIRED não pode reaparecer',!mapRuntime.includes('API KEY REQUIRED'))

check('gateway expõe diagnóstico Maps',vite.includes("'/api/maps/diagnostics'"))
check('gateway expõe geocodificação',vite.includes("'/api/maps/geocode'"))
check('gateway usa Google Geocoding',vite.includes('maps.googleapis.com/maps/api/geocode/json'))
check('chave fica server-side',vite.includes('GOOGLE_MAPS_SERVER_KEY')&&!mapPage.includes('GOOGLE_MAPS_SERVER_KEY'))
check('Geocoding suporta batch',vite.includes('body.items')&&vite.includes('slice(0, 100)'))
check('bridge usa gateway local',mapPage.includes("fetch('/api/maps/geocode'"))
check('bridge persiste coordenadas Google',mapPage.includes("geocodeProvider: 'google'"))
check('bridge mantém fallback local',mapPage.includes('estimateLeadGeocode(lead)'))
check('Supabase continua usando geocode-lead',mapPage.includes("functions.invoke('geocode-lead'"))
check('diagnóstico local integrado',mapPage.includes("fetch('/api/maps/diagnostics'"))
check('bridge acompanha versão atual',mapPage.includes('version: APP_VERSION'))

check('configurador Google Maps existe',exists('configure-google-maps.sh'))
check('configurador menciona Geocoding + Places',read('configure-google-maps.sh').includes('Geocoding API')&&read('configure-google-maps.sh').includes('Places API (New)'))
check('launcher informa modo sem chave',launcher.includes('OpenStreetMap ativo sem chave'))
check('launcher possui porta local',launcher.includes('PORT="${PORT:-'))
check('launcher valida build antes de abrir',launcher.includes('dist/index.html')&&(launcher.includes('Build')||launcher.includes('npm run release:verify')))

check('painel Mapa e Território existe',exists('src/features/settings/maps-integration-panel.tsx'))
check('Configurações possui aba maps',settings.includes("id: 'maps'")&&settings.includes('<MapsIntegrationPanel />'))
check('painel mostra renderer',mapsPanel.includes('OpenStreetMap / Leaflet'))
check('painel explica chave server-side',mapsPanel.includes('não é enviada ao bundle do navegador'))
check('painel preserva modo sem chave',mapsPanel.includes('Sem chave o CRM continua operacional'))

check('Design System existe',exists('src/styles/design-system-v101.css'))
check('Territory CSS existe',exists('src/styles/territory-ui-system-v101.css'))
check('Design System importado por último',(main.indexOf("design-system-v101.css")>main.indexOf("visual-intelligence-v10099.css"))||(main.indexOf("ui-polish.css")>main.indexOf("visual-intelligence-v10099.css"))||(main.indexOf("ui-polish.css")>main.indexOf("visual-intelligence-v10099.css")))
check('Territory CSS importado',main.includes("territory-ui-system-v101.css"))
for(const marker of ['--rt-control-md','--rt-font-page','.button{','.field input','.modal{','.panel,']) check(`UI System contém ${marker}`,uiCss.includes(marker))
check('UI System possui dark mode',uiCss.includes('html[data-theme="dark"]'))
check('UI System possui mobile',uiCss.includes('@media(max-width:760px)'))
check('mapa claro usa filtro local',mapCss.includes('map-style-light'))
check('mapa escuro usa filtro local',mapCss.includes('map-style-dark'))

check('release notes V101.0 existem',exists('RELEASE_NOTES_V101.0.0.md'))
check('documentação V101.0 existe',exists('docs/V101.0-TERRITORY-UI-SYSTEM.md'))
check('script QA V101.0 registrado',pkg.scripts['qa:v101.0.0']==='node scripts/v101_0_territory_ui_system_audit.mjs')
check('npm check inclui V101.0',String(pkg.scripts['check:legacy']).includes('qa:v101.0.0'))

for(const item of checks) console.log(`${item.pass?'OK':'FAIL'}  ${item.label}`)
const failed=checks.filter(x=>!x.pass)
if(failed.length){console.error(`\nV101.0.0 Territory & UI System preservation gate falhou: ${checks.length-failed.length}/${checks.length}.`);process.exit(1)}
console.log(`\nV101.0.0 Territory & UI System preservation gate: ${checks.length}/${checks.length} contratos aprovados.`)
