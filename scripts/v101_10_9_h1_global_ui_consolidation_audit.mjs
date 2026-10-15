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
const sourceManifest = json('qa/global-ui-consolidation-v101109-h1.json')
const main = read('src/main.tsx')
const build = read('scripts/build-registry-independent.mjs')
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
  'ui-foundation.css': ['realtalent-ui-system-v10154.css','visual-rollout-v10155.css','visual-consistency-hotfix-v10156.css'],
  'app-shell.css': ['myday-lock-appbar-v10162.css'],
  'workspace-ui.css': ['workspace-ui-standardization-v10166.css','global-workspace-ui-consistency-v10167.css','workspace-interaction-architecture-v10168.css','global-filter-view-standard-v10169.css','workspace-simplification-filter-engine-v10170.css'],
  'interaction-ui.css': ['interaction-surfaces-v10172.css','ux-consolidation-v10173.css'],
  'ui-polish.css': ['design-system-consolidation-v10198.css','ux-recovery-v10199-h3.css','workspace-appearance-v10199-h4.css'],
  'selection-controls.css': ['selection-filter-system-v101105.css'],
}

ok('base package lineage preserved in current or approved successor', ['101.10.9','101.11.0','101.11.1','101.11.2','101.11.3'].includes(pkg.version))
ok('manifest preserves H1 lineage through approved successors', (manifest.release?.version === '101.10.9' && ((manifest.release?.hotfix === 'H1' && manifest.release?.hotfixName === 'Global UI Consolidation' && manifest.release?.hotfixBaseRelease === 'V101.10.9') || (manifest.release?.hotfix === 'H2' && manifest.release?.hotfixBaseRelease === 'V101.10.9-H1') || (manifest.release?.hotfix === 'H3' && manifest.release?.hotfixBaseRelease === 'V101.10.9-H2') || (manifest.release?.hotfix === 'H4' && manifest.release?.hotfixBaseRelease === 'V101.10.9-H3') || (manifest.release?.hotfix === 'H5' && manifest.release?.hotfixBaseRelease === 'V101.10.9-H4'))) || ((manifest.release?.version === '101.11.0' && manifest.release?.baseRelease === 'V101.10.9-H5') || (manifest.release?.version === '101.11.1' && manifest.release?.baseRelease === 'V101.11.0') || (manifest.release?.version === '101.11.2' && manifest.release?.baseRelease === 'V101.11.1-H5') || (manifest.release?.version === '101.11.3' && manifest.release?.baseRelease === 'V101.11.2')) || (manifest.release?.version === '101.11.1' && manifest.release?.baseRelease === 'V101.11.0'))
ok('H1 source manifest exists', sourceManifest.release === 'V101.10.9-H1')
for (const [canonical, sources] of Object.entries(groups)) {
  ok(`${canonical} exists`, exists(`src/styles/${canonical}`))
  ok(`${canonical} sources retained`, sources.every((name) => exists(`src/styles/${name}`) || h5Removal?.removed?.[name]?.canonical === canonical))
  const css = read(`src/styles/${canonical}`)
  const sourceTexts = sources.map((name) => historicalText(canonical, name))
  ok(`${canonical} contains exact source layers`, sourceTexts.every((text) => css.includes(text)))
  ok(`${canonical} preserves cascade order`, sourceTexts.every((text, i) => i === 0 || css.indexOf(text) > css.indexOf(sourceTexts[i-1])))
  ok(`${canonical} source hashes recorded`, sources.every((name) => sourceManifest.groups?.[canonical]?.some((entry) => entry.source === name && entry.sha256 === historicalRawSha(canonical, name))))
}
const canonicalImports = ['ui-foundation.css','app-shell.css','workspace-ui.css','interaction-ui.css','ui-polish.css','selection-controls.css']
ok('canonical global UI styles are loaded', canonicalImports.every((name) => main.includes(`import './styles/${name}'`)))
const legacyImports = Object.values(groups).flat()
ok('superseded global UI styles no longer load directly', legacyImports.every((name) => !main.includes(`import './styles/${name}'`)))
ok('runtime CSS imports remain at or below H1 budget', [...main.matchAll(/import\s+['"]\.\/styles\/([^'"]+\.css)['"]/g)].length <= 59)
ok('Contact layers remain between foundation/app-shell/workspace where historically required', main.indexOf('ui-foundation.css') < main.indexOf('contact-record.css') && main.indexOf('app-shell.css') < main.indexOf('contacts.css') && main.indexOf('contacts.css') < main.indexOf('workspace-ui.css'))
ok('Metrics layers remain between workspace and interaction', main.indexOf('workspace-ui.css') < main.indexOf('calling-intelligence.css') && main.indexOf('calling-intelligence.css') < main.indexOf('interaction-ui.css') && read('src/styles/calling-intelligence.css').includes(historicalText('calling-intelligence.css','workspace-metrics-calling-convergence-v10170-h4.css')) && read('src/styles/calling-intelligence.css').includes(historicalText('calling-intelligence.css','metrics-calling-structural-redesign-v10171.css')))
ok('Connect remains before final polish layer', main.indexOf('interaction-ui.css') < main.indexOf('realtalent-connect.css') && main.indexOf('realtalent-connect.css') < main.indexOf('ui-polish.css'))
ok('Selection controls retain late cascade position', main.indexOf('prospecting-workspace.css') < main.indexOf('selection-controls.css') && main.indexOf('selection-controls.css') < main.indexOf('contact-intelligence.css'))
ok('standalone build excludes superseded global UI CSS', legacyImports.every((name) => build.includes(`'${name}'`)))
ok('H1 runtime recognizes V101.10.9 base folder for state migration', read('scripts/start.mjs').includes('RealTalent-CRM-V101.10.9-CSS-Design-System-Consolidation-Linux-Launcher'))
ok('no H1 database migration', !fs.readdirSync(path.join(root, 'supabase/migrations')).some((name) => /101[_-]?10[_-]?9[_-]?h1/i.test(name)))
ok('H1 release notes exist', exists('RELEASE_NOTES_V101.10.9-H1.md') && exists('docs/releases/101.10/V101.10.9-H1-GLOBAL-UI-CONSOLIDATION.md'))
ok('H1 equivalence report exists', exists('docs/qa/GLOBAL_UI_EQUIVALENCE_V101.10.9-H1.md'))

for (const item of checks) console.log(`${item.ok ? 'OK  ' : 'FAIL'} ${item.label}`)
const failed = checks.filter((item) => !item.ok)
console.log(`\nV101.10.9-H1 Global UI Consolidation: ${checks.length - failed.length}/${checks.length} contracts.`)
if (failed.length) process.exit(1)
