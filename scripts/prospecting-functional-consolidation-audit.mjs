import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url))
const page = read('src/features/prospecting/prospecting-page.tsx')
const redesign = read('src/features/prospecting/prospecting-redesign.tsx')
const service = read('src/services/prospecting-linux-agent.ts')
const vercel = JSON.parse(read('vercel.json'))
const checks = []
const ok = (name, value) => { checks.push([name, Boolean(value)]); console.log(`${value ? 'OK  ' : 'FAIL'} ${name}`) }

ok('redesign recebe mapa funcional canônico', redesign.includes('mapPanel: ReactNode') && redesign.includes('{props.mapPanel}'))
ok('mapa ilustrativo removido', !redesign.includes('prospecting-redesign-v4__map-ground') && !redesign.includes('prospecting-redesign-v4__map-water') && !redesign.includes('prospecting-redesign-v4__zoom'))
ok('tela nova usa seletor real de raio e polígono', page.includes("mapPanel={areaMode === 'map' ? <TerritoryAreaSelector") && page.includes(': <SearchTerritoryPlanner'))
ok('desenho exige polígono real', page.includes("areaMode === 'map' && mapPolygon.length < 3"))
ok('nova busca limpa sessão anterior', page.includes('const resetProspectingSearch') && page.includes("setSegment('')") && page.includes("setCity('')") && page.includes('setAgentJob(null)') && page.includes('setMapPolygon([])'))
ok('captura rápida é padrão canônico', page.includes("useState<ProspectingSearchMode>('fast')") && page.includes("useState<ProspectingTargetMode>('quantity')"))
ok('build não muta código-fonte', vercel.buildCommand === 'npm run typecheck && npm run build' && !exists('scripts/patch-preview-cloud-prospecting-ui.mjs'))
ok('pronta exige coordenada confirmada', page.includes('&& Boolean(prospectGeoPoint(prospect))') && page.includes('prospects.filter(prospectIsAutoValidatable)'))
ok('diretórios são evidência e não site canônico', service.includes('directory_evidence') && service.includes("sanitized.website = ''") && service.includes('locaisdobrasil') && service.includes('brasillocais'))
ok('raio/área desenhada exigem geometria para ready', service.includes("areaMode === 'radius' || areaMode === 'map'") && service.includes('coordinates_not_confirmed'))
ok('origem automática não aparece como Manual', page.includes('const prospectOriginLabel') && page.includes("return 'Web pública'") && page.includes("return 'OpenStreetMap'"))
ok('execução concluída não usa cobertura como progresso', redesign.includes('executionFinished ? 100') && redesign.includes('coverageLabel'))

const failed = checks.filter(([, value]) => !value)
console.log(`\nGarimpo Functional Consolidation: ${checks.length - failed.length}/${checks.length}`)
if (failed.length) process.exit(1)
