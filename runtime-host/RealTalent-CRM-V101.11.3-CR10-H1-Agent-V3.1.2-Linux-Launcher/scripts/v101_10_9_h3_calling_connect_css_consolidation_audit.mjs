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
const sourceManifest = json('qa/calling-connect-consolidation-v101109-h3.json')
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
  'calls-core.css': ['calls-v100.css'],
  'calling-workspace.css': ['calls-v100982.css','calls-v1012.css'],
  'calling-intelligence.css': ['workspace-metrics-calling-convergence-v10170-h4.css','metrics-calling-structural-redesign-v10171.css'],
  'realtalent-connect.css': ['realtalent-connect-v1018.css','realtalent-connect-v10181.css','realtalent-connect-v10182.css','realtalent-connect-v10183.css','realtalent-connect-v101107.css'],
}

ok('base package lineage preserved in current or approved successor', ['101.10.9','101.11.0','101.11.1','101.11.2','101.11.3'].includes(pkg.version))
ok('manifest preserves H3 lineage through approved successors', (manifest.release?.version === '101.10.9' && ((manifest.release?.hotfix === 'H3' && manifest.release?.hotfixName === 'Calling & RealTalent Connect CSS Consolidation' && manifest.release?.hotfixBaseRelease === 'V101.10.9-H2') || (manifest.release?.hotfix === 'H4' && manifest.release?.hotfixBaseRelease === 'V101.10.9-H3') || (manifest.release?.hotfix === 'H5' && manifest.release?.hotfixBaseRelease === 'V101.10.9-H4'))) || ((manifest.release?.version === '101.11.0' && manifest.release?.baseRelease === 'V101.10.9-H5') || (manifest.release?.version === '101.11.1' && manifest.release?.baseRelease === 'V101.11.0') || (manifest.release?.version === '101.11.2' && manifest.release?.baseRelease === 'V101.11.1-H5') || (manifest.release?.version === '101.11.3' && manifest.release?.baseRelease === 'V101.11.2')) || (manifest.release?.version === '101.11.1' && manifest.release?.baseRelease === 'V101.11.0'))
ok('H3 source manifest exists', sourceManifest.release === 'V101.10.9-H3' && sourceManifest.base === 'V101.10.9-H2')
for (const [canonical, sources] of Object.entries(groups)) {
  ok(`${canonical} exists`, exists(`src/styles/${canonical}`))
  ok(`${canonical} sources retained`, sources.every((name) => exists(`src/styles/${name}`) || h5Removal?.removed?.[name]?.canonical === canonical))
  const css = read(`src/styles/${canonical}`)
  const sourceTexts = sources.map((name) => historicalText(canonical, name))
  ok(`${canonical} contains exact source layers`, sourceTexts.every((text) => css.includes(text)))
  ok(`${canonical} preserves cascade order`, sourceTexts.every((text, i) => i === 0 || css.indexOf(text) > css.indexOf(sourceTexts[i-1])))
  ok(`${canonical} source hashes recorded`, sources.every((name) => sourceManifest.groups?.[canonical]?.some((entry) => entry.source === name && entry.sha256 === historicalRawSha(canonical, name))))
}

ok('Calls core retains original early cascade zone', main.includes("import './styles/calls-core.css'") && main.indexOf('followups.css') < main.indexOf('calls-core.css') && main.indexOf('calls-core.css') < main.indexOf('agenda-v100.css'))
ok('Calling workspace replaces two late call layers', main.includes("import './styles/calling-workspace.css'") && !main.includes("calls-v100982.css") && !main.includes("calls-v1012.css") && main.indexOf('workspace-layout-studio-v100981.css') < main.indexOf('calling-workspace.css') && main.indexOf('calling-workspace.css') < main.indexOf('unified-sales-workspace-v1013.css'))
ok('Calling intelligence remains after workspace and before interactions', main.includes("import './styles/calling-intelligence.css'") && !main.includes('workspace-metrics-calling-convergence-v10170-h4.css') && !main.includes('metrics-calling-structural-redesign-v10171.css') && main.indexOf('workspace-ui.css') < main.indexOf('calling-intelligence.css') && main.indexOf('calling-intelligence.css') < main.indexOf('interaction-ui.css'))
ok('RealTalent Connect remains canonical late layer', main.includes("import './styles/realtalent-connect.css'") && main.indexOf('interaction-ui.css') < main.indexOf('realtalent-connect.css') && main.indexOf('realtalent-connect.css') < main.indexOf('ui-polish.css'))
ok('Calling selectors remain present', read('src/styles/calls-core.css').includes('.calls-page--professional') && read('src/styles/calling-workspace.css').includes('.calling-v982') && read('src/styles/calling-workspace.css').includes('.call-preparation-v1012__route-card'))
ok('Calling intelligence selectors remain present', read('src/styles/calling-intelligence.css').includes('.calls-section-nav-v10171') && read('src/styles/calling-intelligence.css').includes('.calls-operation-kpis-v10171'))
ok('Connect setup and fast dial selectors remain present', read('src/styles/realtalent-connect.css').includes('.connect-v10181__diagnostics') && read('src/styles/realtalent-connect.css').includes('.fast-dial-toggle-v10182'))
ok('runtime CSS imports remain at or below H3 budget', [...main.matchAll(/import\s+['"]\.\/styles\/([^'"]+\.css)['"]/g)].length <= 54)
ok('standalone build excludes all superseded H3 Calling CSS', Object.values(groups).flat().filter((name) => !name.startsWith('realtalent-connect-')).every((name) => build.includes(`'${name}'`)))
ok('H3 runtime prefers H2 folder for state migration', start.includes('RealTalent-CRM-V101.10.9-H2-Contacts-Account360-CSS-Consolidation-Linux-Launcher') && start.indexOf('RealTalent-CRM-V101.10.9-H2-Contacts-Account360-CSS-Consolidation-Linux-Launcher') < start.indexOf('RealTalent-CRM-V101.10.9-H1-Global-UI-Consolidation-Linux-Launcher'))
ok('no H3 database migration', !fs.readdirSync(path.join(root, 'supabase/migrations')).some((name) => /101[_-]?10[_-]?9[_-]?h3/i.test(name)))
ok('H3 release notes exist', exists('RELEASE_NOTES_V101.10.9-H3.md') && exists('docs/releases/101.10/V101.10.9-H3-CALLING-CONNECT-CSS-CONSOLIDATION.md'))
ok('H3 equivalence report exists', exists('docs/qa/CALLING_CONNECT_EQUIVALENCE_V101.10.9-H3.md'))
ok('H3 CSS inventory exists', exists('docs/qa/CSS_INVENTORY_V101.10.9-H3.md'))
ok('H3 lineage marker exists', read('index.html').includes('V101.10.9-H3 — Calling & RealTalent Connect CSS Consolidation') && read('src/lib/app-version.ts').includes('V101.10.9-H3 — Calling & RealTalent Connect CSS Consolidation'))

for (const item of checks) console.log(`${item.ok ? 'OK  ' : 'FAIL'} ${item.label}`)
const failed = checks.filter((item) => !item.ok)
console.log(`\nV101.10.9-H3 Calling & RealTalent Connect CSS Consolidation: ${checks.length - failed.length}/${checks.length} contracts.`)
if (failed.length) process.exit(1)
