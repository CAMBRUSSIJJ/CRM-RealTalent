import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const label = `V${pkg.version.replace(/\.0$/, '').replaceAll('.', '-')}`
const checks = []
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const exists = (file) => fs.existsSync(path.join(root, file))
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail })

const page = read('src/features/commercial-map/commercial-map-page.tsx')
const runtime = read('public/commercial-map-runtime.js')
const navigation = read('src/components/layout/navigation.ts')
const migration = read('supabase/migrations/202607280004_v100_46_2_lead_map.sql')
const geocode = read('supabase/functions/geocode-lead/index.ts')
const worker = read('supabase/functions/lead-geocode-worker/index.ts')
const diagnostics = read('supabase/functions/maps-diagnostics/index.ts')

check('Aba Mapa de Leads', navigation.includes("label: 'Mapa de Leads'") && navigation.includes("title: 'Mapa de Leads'"), 'menu e título oficial')
check('Bridge V100.46.5', page.includes("version: '100.46.5'") && page.includes('__REALTALENT_LEAD_MAP_BRIDGE__'), 'ponte React/runtime')
check('Modo demonstração identificado', page.includes("mode: 'demo'") && runtime.includes('Modo demonstração'), 'estimativa local não aparece como conexão real')
check('Filtros e ações', ['data-filter="city"','data-filter="stage"','data-filter="owner"','data-filter="priority"','data-call','data-whatsapp','data-route'].every((token) => runtime.includes(token)), 'filtros e ações rápidas')
check('Clustering', runtime.includes('commercial-map-cluster') && runtime.includes('zoom<12'), 'agrupamento por cidade em zoom baixo')
check('Mapa de calor', runtime.includes('data-view="heat"') && runtime.includes('heatMetric'), 'quantidade, pipeline e atrasos')
check('Busca por raio e área', runtime.includes('data-radius') && runtime.includes('data-area') && runtime.includes('data-visible'), 'raio e seleção espacial')
check('Fila de localização', migration.includes('lead_geocode_jobs') && migration.includes('claim_lead_geocode_jobs'), 'fila, lease e retry')
check('Histórico de localização', migration.includes('lead_location_history') && migration.includes('capture_lead_location_change'), 'auditoria de endereço e coordenadas')
check('RLS do mapa', migration.includes('organization_map_settings_select') && migration.includes('lead_geocode_jobs_select') && migration.includes('lead_location_history_select'), 'isolamento por organização')
check('Worker dedicado', worker.includes('claim_lead_geocode_jobs') && worker.includes('MAPS_WORKER_SECRET'), 'processamento protegido')
check('Geocodificação backend', geocode.includes('GOOGLE_MAPS_API_KEY') && !page.includes('GOOGLE_MAPS_API_KEY'), 'chave secreta não exposta no navegador')
check('Diagnóstico por workspace', diagnostics.includes('coverage') && diagnostics.includes('lead_geocode_jobs') && runtime.includes('Diagnóstico do Maps'), 'cobertura e fila')
check('Configuração Supabase', read('supabase/config.toml').includes('[functions.maps-diagnostics]') && read('supabase/config.toml').includes('[functions.lead-geocode-worker]'), 'JWT por endpoint')
check('Cron de geocodificação', read('supabase/cron/CONFIGURAR-INTEGRATION-RUNNERS.sql').includes('realtalent-lead-geocoding'), 'worker agendado')
check('Documentação do módulo', exists('docs/MAPA-DE-LEADS-V100-46-5.md'), 'implantação e operação')

const failures = checks.filter((item) => !item.ok)
const report = { version: pkg.version, generatedAt: new Date().toISOString(), passed: failures.length === 0, checks, failures }
fs.writeFileSync(path.join(root, `LEAD-MAP-AUDIT-${label}.json`), JSON.stringify(report, null, 2) + '\n')
for (const item of checks) console.log(`${item.ok ? 'OK' : 'FALHA'} — ${item.name}: ${item.detail}`)
console.log(`\n${checks.length - failures.length}/${checks.length} verificações do Mapa de Leads aprovadas.`)
if (failures.length) process.exit(1)
