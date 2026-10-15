import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(root, p))
const json = (p) => JSON.parse(read(p))
const main = read('src/main.tsx')
const allow = JSON.parse(read('qa/css-legacy-allowlist.json')).legacyVersionedCss
const current = fs.readdirSync(path.join(root, 'src/styles')).filter((name) => name.endsWith('.css') && /(?:^|[-_])v\d/i.test(name)).sort()
const unexpected = current.filter((name) => !allow.includes(name))
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
ok('legacy CSS allowlist is immutable baseline', unexpected.length === 0)
ok('Pipeline uses canonical runtime stylesheet', main.includes("import './styles/pipeline.css'") && !main.includes("import './styles/pipeline-v100.css'") && !main.includes("import './styles/pipeline-v10076.css'"))
ok('Follow-ups uses canonical runtime stylesheet', main.includes("import './styles/followups.css'") && !main.includes("import './styles/followups-v100.css'") && !main.includes("import './styles/followups-v10077.css'"))
ok('Connect uses canonical runtime stylesheet', main.includes("import './styles/realtalent-connect.css'") && !main.includes("import './styles/realtalent-connect-v1018.css'") && !main.includes("import './styles/realtalent-connect-v101107.css'"))
ok('legacy source files preserved for rollback/audit', ['pipeline-v100.css','pipeline-v10076.css','followups-v100.css','followups-v10077.css','realtalent-connect-v1018.css','realtalent-connect-v10181.css','realtalent-connect-v10182.css','realtalent-connect-v10183.css','realtalent-connect-v101107.css'].every((name) => exists(`src/styles/${name}`) || h5Removal?.removed?.[name]))
ok('canonical Pipeline preserves source order', read('src/styles/pipeline.css').indexOf(historicalText('pipeline.css','pipeline-v100.css')) >= 0 && read('src/styles/pipeline.css').indexOf(historicalText('pipeline.css','pipeline-v10076.css')) > read('src/styles/pipeline.css').indexOf(historicalText('pipeline.css','pipeline-v100.css')))
ok('canonical Follow-ups preserves source order', read('src/styles/followups.css').indexOf(historicalText('followups.css','followups-v100.css')) >= 0 && read('src/styles/followups.css').indexOf(historicalText('followups.css','followups-v10077.css')) > read('src/styles/followups.css').indexOf(historicalText('followups.css','followups-v100.css')))
const connect = read('src/styles/realtalent-connect.css')
const connectSources = ['realtalent-connect-v1018.css','realtalent-connect-v10181.css','realtalent-connect-v10182.css','realtalent-connect-v10183.css','realtalent-connect-v101107.css'].map((name) => historicalText('realtalent-connect.css',name))
ok('canonical Connect preserves all historical layers', connectSources.every((source) => connect.includes(source)))
ok('canonical Connect preserves historical cascade order', connectSources.every((source, index) => index === 0 || connect.indexOf(source) > connect.indexOf(connectSources[index - 1])))
ok('Design System canonical layer remains after Connect', main.indexOf('ui-polish.css') > main.indexOf('realtalent-connect.css') && read('src/styles/ui-polish.css').includes(historicalText('ui-polish.css','design-system-consolidation-v10198.css')))
ok('registry-independent build excludes superseded runtime CSS', read('scripts/build-registry-independent.mjs').includes('supersededRuntimeCss') && read('scripts/build-registry-independent.mjs').includes("'pipeline-v100.css'") && read('scripts/build-registry-independent.mjs').includes("'realtalent-connect-v101107.css'"))
ok('registry-independent CSS order follows main.tsx', read('scripts/build-registry-independent.mjs').includes('mainCssOrder') && read('scripts/build-registry-independent.mjs').includes('matchAll'))
ok('inventory script exists', exists('scripts/css_inventory.mjs'))
ok('inventory report exists', exists('docs/qa/CSS_INVENTORY_V101.10.9-H2.md'))

const globalGroups = {
  'ui-foundation.css': ['realtalent-ui-system-v10154.css','visual-rollout-v10155.css','visual-consistency-hotfix-v10156.css'],
  'app-shell.css': ['myday-lock-appbar-v10162.css'],
  'workspace-ui.css': ['workspace-ui-standardization-v10166.css','global-workspace-ui-consistency-v10167.css','workspace-interaction-architecture-v10168.css','global-filter-view-standard-v10169.css','workspace-simplification-filter-engine-v10170.css'],
  'interaction-ui.css': ['interaction-surfaces-v10172.css','ux-consolidation-v10173.css'],
  'ui-polish.css': ['design-system-consolidation-v10198.css','ux-recovery-v10199-h3.css','workspace-appearance-v10199-h4.css'],
  'selection-controls.css': ['selection-filter-system-v101105.css'],
}
for (const [canonical, sources] of Object.entries(globalGroups)) {
  ok(`H1 canonical ${canonical} is runtime-owned`, main.includes(`import './styles/${canonical}'`) && sources.every((name) => !main.includes(`import './styles/${name}'`)))
  const canonicalCss = read(`src/styles/${canonical}`)
  const sourceCss = sources.map((name) => historicalText(canonical, name))
  ok(`H1 canonical ${canonical} preserves exact cascade`, sourceCss.every((source, index) => canonicalCss.includes(source) && (index === 0 || canonicalCss.indexOf(source) > canonicalCss.indexOf(sourceCss[index - 1]))))
}
ok('H2 runtime CSS import budget remains <= 56', [...main.matchAll(/import\s+['"]\.\/styles\/([^'"]+\.css)['"]/g)].length <= 56)


const contactGroups = {
  'contact-record.css': ['contacts-views-record-v1016.css','contacts-experience-completion-v10161.css'],
  'contacts.css': ['contact-views-v10163.css','contact-data-grid-view-settings-v10164.css','contact-custom-properties-v10165.css'],
  'contact-intelligence.css': ['contact-intelligence-v101105-h3.css'],
}
for (const [canonical, sources] of Object.entries(contactGroups)) {
  ok(`H2 canonical ${canonical} is runtime-owned`, main.includes(`import './styles/${canonical}'`) && sources.every((name) => !main.includes(`import './styles/${name}'`)))
  const canonicalCss = read(`src/styles/${canonical}`)
  const sourceCss = sources.map((name) => historicalText(canonical, name))
  ok(`H2 canonical ${canonical} preserves exact cascade`, sourceCss.every((source, index) => canonicalCss.includes(source) && (index === 0 || canonicalCss.indexOf(source) > canonicalCss.indexOf(sourceCss[index - 1]))))
}
ok('H2 Account 360 is canonical and legacy source is not runtime-owned', exists('src/styles/account-360.css') && read('src/features/leads/leads-page.tsx').includes("import '../../styles/account-360.css'") && !read('src/features/leads/leads-page.tsx').includes("account-intelligence.css"))
ok('H2 standalone build excludes superseded Contact and Account CSS', ['contacts-views-record-v1016.css','contacts-experience-completion-v10161.css','contact-views-v10163.css','contact-data-grid-view-settings-v10164.css','contact-custom-properties-v10165.css','contact-intelligence-v101105-h3.css','account-intelligence.css'].every((name) => read('scripts/build-registry-independent.mjs').includes(`'${name}'`)))


const callingGroups = {
  'calls-core.css': ['calls-v100.css'],
  'calling-workspace.css': ['calls-v100982.css','calls-v1012.css'],
  'calling-intelligence.css': ['workspace-metrics-calling-convergence-v10170-h4.css','metrics-calling-structural-redesign-v10171.css'],
}
for (const [canonical, sources] of Object.entries(callingGroups)) {
  ok(`H3 canonical ${canonical} is runtime-owned`, main.includes(`import './styles/${canonical}'`) && sources.every((name) => !main.includes(`import './styles/${name}'`)))
  const canonicalCss = read(`src/styles/${canonical}`)
  const sourceCss = sources.map((name) => historicalText(canonical, name))
  ok(`H3 canonical ${canonical} preserves exact cascade`, sourceCss.every((source, index) => canonicalCss.includes(source) && (index === 0 || canonicalCss.indexOf(source) > canonicalCss.indexOf(sourceCss[index - 1]))))
}
ok('H3 Calling cascade zones remain separated', main.indexOf('calls-core.css') < main.indexOf('calling-workspace.css') && main.indexOf('workspace-ui.css') < main.indexOf('calling-intelligence.css') && main.indexOf('calling-intelligence.css') < main.indexOf('interaction-ui.css'))
ok('H3 Connect remains canonical after interaction layer', main.indexOf('interaction-ui.css') < main.indexOf('realtalent-connect.css') && !main.includes('realtalent-connect-v101107.css'))
ok('H3 standalone build excludes superseded Calling CSS', Object.values(callingGroups).flat().every((name) => read('scripts/build-registry-independent.mjs').includes(`'${name}'`)))
ok('H3 runtime CSS import budget remains <= 54', [...main.matchAll(/import\s+['"]\.\/styles\/([^'"]+\.css)['"]/g)].length <= 54)


const automationProspectingGroups = {
  'automations.css': ['automations-v100.css'],
  'prospecting-core.css': ['prospecting-v100.css'],
  'prospecting-engine.css': ['prospecting-engine-v10098.css'],
  'prospecting-workspace.css': ['prospecting-search-automation-v101101.css','prospecting-agent-v101102.css','prospecting-review-v101103-h7.css','prospecting-search-ontology-v101103-h8.css','prospecting-territory-engine-v101103-h9.css','prospecting-local-discovery-v101104.css','prospecting-ux-consolidation-v101106.css'],
  'prospecting-processing.css': ['prospecting-search-processing-v101103.css'],
}
for (const [canonical, sources] of Object.entries(automationProspectingGroups)) {
  ok(`H4 canonical ${canonical} is runtime-owned`, main.includes(`import './styles/${canonical}'`) && sources.every((name) => !main.includes(`import './styles/${name}'`)))
  const canonicalCss = read(`src/styles/${canonical}`)
  const sourceCss = sources.map((name) => historicalText(canonical, name))
  ok(`H4 canonical ${canonical} preserves exact cascade`, sourceCss.every((source, index) => canonicalCss.includes(source) && (index === 0 || canonicalCss.indexOf(source) > canonicalCss.indexOf(sourceCss[index - 1]))))
}
ok('H4 automation/prospecting early zones remain ordered', main.indexOf('metrics-v100.css') < main.indexOf('automations.css') && main.indexOf('automations.css') < main.indexOf('prospecting-core.css') && main.indexOf('prospecting-core.css') < main.indexOf('settings-v100.css'))
ok('H4 prospecting engine retains middle cascade zone', main.indexOf('product-revenue-v10097.css') < main.indexOf('prospecting-engine.css') && main.indexOf('prospecting-engine.css') < main.indexOf('workspace-layout-studio-v100981.css'))
ok('H4 prospecting workspace remains before selection controls', main.indexOf('settings-experience-v10110.css') < main.indexOf('prospecting-workspace.css') && main.indexOf('prospecting-workspace.css') < main.indexOf('selection-controls.css'))
ok('H4 processing remains after contact intelligence', main.indexOf('contact-intelligence.css') < main.indexOf('prospecting-processing.css'))
ok('H4 standalone build excludes superseded Automation/Garimpo CSS', Object.values(automationProspectingGroups).flat().every((name) => read('scripts/build-registry-independent.mjs').includes(`'${name}'`)))
ok('H4 runtime CSS import budget preserved plus isolated login surface', (()=>{ const count=[...main.matchAll(/import\s+['"]\.\/styles\/([^'"]+\.css)['"]/g)].length; return count===48 || (count===49 && main.includes("./styles/login-experience.css")) || (count===50 && main.includes("./styles/login-experience.css") && main.includes("./styles/work-management.css")) || (count===51 && main.includes("./styles/login-experience.css") && main.includes("./styles/work-management.css") && main.includes("./styles/h20-product-cohesion.css")) || (count===52 && main.includes("./styles/login-experience.css") && main.includes("./styles/work-management.css") && main.includes("./styles/proposals-workspace.css") && main.includes("./styles/h20-product-cohesion.css")) })())


ok('H5 removal manifest records 47 deleted CSS sources', h5Removal?.release === 'V101.10.9-H5' && Object.keys(h5Removal?.removed || {}).length === 47)
ok('H5 deleted sources are physically absent', Object.keys(h5Removal?.removed || {}).every((name) => !exists(`src/styles/${name}`)))
ok('H5 canonical owners all remain present', Object.values(h5Removal?.removed || {}).every((entry) => exists(`src/styles/${entry.canonical}`)))
ok('H5 allowlist no longer contains deleted sources', Object.keys(h5Removal?.removed || {}).every((name) => !allow.includes(name)))

for (const item of checks) console.log(`${item.ok ? 'OK  ' : 'FAIL'} ${item.label}`)
const failed = checks.filter((item) => !item.ok)
console.log(`\nCSS Governance: ${checks.length - failed.length}/${checks.length} checks.`)
if (unexpected.length) console.error(`Unexpected versioned CSS: ${unexpected.join(', ')}`)
if (failed.length) process.exit(1)
