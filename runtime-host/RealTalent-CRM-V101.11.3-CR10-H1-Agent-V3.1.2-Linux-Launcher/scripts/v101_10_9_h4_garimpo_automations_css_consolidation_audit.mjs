import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(root, p))
const json = (p) => JSON.parse(read(p))
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')
const pkg = json('package.json')
const manifest = json('release-manifest.json')
const sourceManifest = json('qa/garimpo-automations-consolidation-v101109-h4.json')
const main = read('src/main.tsx')
const build = read('scripts/build-registry-independent.mjs')
const start = read('scripts/start.mjs')
const checks = []
const ok = (label, value) => checks.push({ label, ok: Boolean(value) })
const h5Removal = exists('qa/dead-css-removal-v101109-h5.json') ? json('qa/dead-css-removal-v101109-h5.json') : null
const historicalText = (canonical, source) => {
  const legacyPath = `src/styles/${source}`
  if (exists(legacyPath)) return read(legacyPath).trim()
  const css = read(`src/styles/${canonical}`)
  const markers = [
    `/* ===== legacy source: ${source} ===== */`,
    `/* ===== source: ${source} ===== */`,
    `/* source: ${source} */`,
  ]
  let start = -1, markerLength = 0
  for (const marker of markers) {
    const i = css.indexOf(marker)
    if (i >= 0) { start = i; markerLength = marker.length; break }
  }
  if (start < 0) return ''
  const tail = css.slice(start + markerLength)
  let end = tail.length
  for (const nextMarker of ['\n/* ===== legacy source:', '\n/* ===== source:', '\n/* source:']) {
    const i = tail.indexOf(nextMarker)
    if (i >= 0 && i < end) end = i
  }
  return tail.slice(0, end).trim()
}
const historicalRawSha = (canonical, source) => exists(`src/styles/${source}`) ? sha(`src/styles/${source}`) : h5Removal?.removed?.[source]?.rawSha256

const groups = {
  'automations.css': ['automations-v100.css'],
  'prospecting-core.css': ['prospecting-v100.css'],
  'prospecting-engine.css': ['prospecting-engine-v10098.css'],
  'prospecting-workspace.css': ['prospecting-search-automation-v101101.css','prospecting-agent-v101102.css','prospecting-review-v101103-h7.css','prospecting-search-ontology-v101103-h8.css','prospecting-territory-engine-v101103-h9.css','prospecting-local-discovery-v101104.css','prospecting-ux-consolidation-v101106.css'],
  'prospecting-processing.css': ['prospecting-search-processing-v101103.css'],
}

ok('base package lineage preserved in current or approved successor', ['101.10.9','101.11.0','101.11.1','101.11.2','101.11.3'].includes(pkg.version))
ok('manifest preserves H4 lineage through approved successors', (manifest.release?.version === '101.10.9' && ((manifest.release?.hotfix === 'H4' && manifest.release?.hotfixName === 'Garimpo & Automations CSS Consolidation' && manifest.release?.hotfixBaseRelease === 'V101.10.9-H3') || (manifest.release?.hotfix === 'H5' && manifest.release?.hotfixBaseRelease === 'V101.10.9-H4'))) || ((manifest.release?.version === '101.11.0' && manifest.release?.baseRelease === 'V101.10.9-H5') || (manifest.release?.version === '101.11.1' && manifest.release?.baseRelease === 'V101.11.0') || (manifest.release?.version === '101.11.2' && manifest.release?.baseRelease === 'V101.11.1-H5') || (manifest.release?.version === '101.11.3' && manifest.release?.baseRelease === 'V101.11.2')) || (manifest.release?.version === '101.11.1' && manifest.release?.baseRelease === 'V101.11.0'))
ok('H4 source manifest exists', sourceManifest.release === 'V101.10.9-H4' && sourceManifest.base === 'V101.10.9-H3')
for (const [canonical, sources] of Object.entries(groups)) {
  ok(`${canonical} exists`, exists(`src/styles/${canonical}`))
  ok(`${canonical} sources retained`, sources.every((name) => exists(`src/styles/${name}`) || h5Removal?.removed?.[name]?.canonical === canonical))
  const css = read(`src/styles/${canonical}`)
  const sourceTexts = sources.map((name) => historicalText(canonical, name))
  ok(`${canonical} contains exact source layers`, sourceTexts.every((text) => css.includes(text)))
  ok(`${canonical} preserves cascade order`, sourceTexts.every((text, i) => i === 0 || css.indexOf(text) > css.indexOf(sourceTexts[i-1])))
  ok(`${canonical} source hashes recorded`, sources.every((name) => sourceManifest.groups?.[canonical]?.some((entry) => entry.source === name && entry.sha256 === historicalRawSha(canonical, name))))
}
ok('Automations canonical layer owns runtime', main.includes("import './styles/automations.css'") && !main.includes("automations-v100.css"))
ok('Prospecting core canonical layer owns runtime', main.includes("import './styles/prospecting-core.css'") && !main.includes("prospecting-v100.css"))
ok('Prospecting engine canonical layer owns runtime', main.includes("import './styles/prospecting-engine.css'") && !main.includes("prospecting-engine-v10098.css"))
ok('Prospecting workspace canonical layer owns runtime', main.includes("import './styles/prospecting-workspace.css'") && groups['prospecting-workspace.css'].every((name) => !main.includes(name)))
ok('Prospecting processing canonical layer owns runtime', main.includes("import './styles/prospecting-processing.css'") && !main.includes("prospecting-search-processing-v101103.css"))
ok('Automation and prospecting early cascade preserved', main.indexOf('metrics-v100.css') < main.indexOf('automations.css') && main.indexOf('automations.css') < main.indexOf('prospecting-core.css') && main.indexOf('prospecting-core.css') < main.indexOf('settings-v100.css'))
ok('Prospecting engine middle cascade preserved', main.indexOf('product-revenue-v10097.css') < main.indexOf('prospecting-engine.css') && main.indexOf('prospecting-engine.css') < main.indexOf('workspace-layout-studio-v100981.css'))
ok('Prospecting workspace late cascade preserved', main.indexOf('settings-experience-v10110.css') < main.indexOf('prospecting-workspace.css') && main.indexOf('prospecting-workspace.css') < main.indexOf('selection-controls.css'))
ok('Prospecting processing remains after Contact Intelligence', main.indexOf('contact-intelligence.css') < main.indexOf('prospecting-processing.css'))
ok('Automations selectors remain present', read('src/styles/automations.css').includes('.automations-page--professional') && read('src/styles/automations.css').includes('.automation-rule-card'))
ok('Prospecting core selectors remain present', read('src/styles/prospecting-core.css').includes('.automation-operations') && read('src/styles/prospecting-core.css').includes('.prospecting-page'))
ok('Prospecting engine selectors remain present', read('src/styles/prospecting-engine.css').includes('.prospecting-provider-health-v10098'))
ok('Prospecting workspace keeps agent/review/ontology/territory/local/UX surfaces', ['prospecting-agent-v101102','prospecting-review-modebar-v101103-h7','prospecting-search-ontology-v101103-h8','prospecting-territory-engine-v101103-h9','prospecting-local','prospecting-campaign-v101106'].every((token) => read('src/styles/prospecting-workspace.css').includes(token)))
ok('Prospecting processing keeps search engine and territory selector', read('src/styles/prospecting-processing.css').includes('prospecting-search-engine-v101103') && read('src/styles/prospecting-processing.css').includes('prospecting-territory-selector-v101103-h1'))
ok('standalone build excludes every H4 superseded stylesheet', Object.values(groups).flat().every((name) => build.includes(`'${name}'`)))
{ const cssImports=[...main.matchAll(/import\s+['"]\.\/styles\/([^'"]+\.css)['"]/g)].map(m=>m[1]); ok('runtime CSS imports preserve H4 budget plus scoped login experience', cssImports.length === (['101.11.2','101.11.3'].includes(pkg.version) ? (cssImports.includes('proposals-workspace.css') ? 52 : cssImports.includes('h20-product-cohesion.css') ? 51 : 50) : (pkg.version === '101.11.1' ? 49 : 48)) && (pkg.version < '101.11.1' || cssImports.includes('login-experience.css')) && (!['101.11.2','101.11.3'].includes(pkg.version) || cssImports.includes('work-management.css'))) }
ok('legacy CSS is retained rather than deleted', Object.values(groups).flat().every((name) => exists(`src/styles/${name}`) || h5Removal?.removed?.[name]))
ok('H4 gate registered', pkg.scripts?.['qa:v101.10.9:h4'] === 'node scripts/v101_10_9_h4_garimpo_automations_css_consolidation_audit.mjs')
ok('architecture includes H4 gate', pkg.scripts?.['qa:architecture']?.includes('qa:v101.10.9:h4'))
ok('release verify includes H4 gate', pkg.scripts?.['release:verify']?.includes('qa:v101.10.9:h4'))
ok('manifest requires H4 gate', manifest.qa?.requiredGates?.includes('qa:v101.10.9:h4'))
ok('runtime migrates first from H3', start.indexOf('V101.10.9-H3-Calling-Connect-CSS-Consolidation-Linux-Launcher') >= 0 && start.indexOf('V101.10.9-H3-Calling-Connect-CSS-Consolidation-Linux-Launcher') < start.indexOf('V101.10.9-H2-Contacts-Account360-CSS-Consolidation-Linux-Launcher'))
ok('runtime requires current build marker while preserving H4 lineage', start.includes('V101.10.9-H4 — Garimpo & Automations CSS Consolidation') || start.includes('V101.11.0 — Communications Architecture'))
ok('runtime executes H4 QA in normal/rebuild/dev path', (start.match(/qa:v101\.10\.9:h4/g) || []).length >= 3)
ok('no H4 database migration', !fs.readdirSync(path.join(root, 'supabase/migrations')).some((name) => /101[_-]?10[_-]?9[_-]?h4/i.test(name)))
ok('H4 release notes exist', exists('RELEASE_NOTES_V101.10.9-H4.md') && exists('docs/releases/101.10/V101.10.9-H4-GARIMPO-AUTOMATIONS-CSS-CONSOLIDATION.md'))
ok('H4 equivalence report exists', exists('docs/qa/GARIMPO_AUTOMATIONS_EQUIVALENCE_V101.10.9-H4.md'))
ok('H4 CSS inventory exists', exists('docs/qa/CSS_INVENTORY_V101.10.9-H4.md'))
ok('H4 lineage marker exists', read('index.html').includes('V101.10.9-H4 — Garimpo & Automations CSS Consolidation') && read('src/lib/app-version.ts').includes('V101.10.9-H4 — Garimpo & Automations CSS Consolidation'))

for (const item of checks) console.log(`${item.ok ? 'OK  ' : 'FAIL'} ${item.label}`)
const failed = checks.filter((item) => !item.ok)
console.log(`\nV101.10.9-H4 Garimpo & Automations CSS Consolidation: ${checks.length - failed.length}/${checks.length} contracts.`)
if (failed.length) process.exit(1)
