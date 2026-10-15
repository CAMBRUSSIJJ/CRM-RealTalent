import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(root, p))
const json = (p) => JSON.parse(read(p))
const pkg = json('package.json')
const lock = json('package-lock.json')
const manifest = json('release-manifest.json')
const runtime = json('public/runtime-version.json')
const health = json('public/health.json')
const main = read('src/main.tsx')
const app = read('src/lib/app-version.ts')
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

ok('package V101.10.9 or approved successor', ['101.10.9','101.11.0','101.11.1','101.11.2','101.11.3'].includes(pkg.version))
ok('lock metadata follows package', lock.version === pkg.version && lock.packages?.['']?.version === pkg.version)
ok('manifest V101.10.9 lineage or approved successor', (manifest.release?.version === '101.10.9' && manifest.release?.label === 'V101.10.9' && manifest.release?.baseRelease === 'V101.10.8') || (manifest.release?.version === '101.11.0' && manifest.release?.label === 'V101.11.0' && manifest.release?.baseRelease === 'V101.10.9-H5') || (manifest.release?.version === '101.11.1' && manifest.release?.label === 'V101.11.1' && manifest.release?.baseRelease === 'V101.11.0') || (manifest.release?.version === '101.11.2' && manifest.release?.label === 'V101.11.2' && manifest.release?.baseRelease === 'V101.11.1-H5') || (manifest.release?.version === '101.11.3' && manifest.release?.label === 'V101.11.3' && manifest.release?.baseRelease === 'V101.11.2'))
ok('VERSION follows package', read('VERSION').trim() === `V${pkg.version}`)
ok('APP_VERSION follows package', app.includes(`APP_VERSION = '${pkg.version}'`) && app.includes(`APP_VERSION_LABEL = 'V${pkg.version}'`))
ok('runtime metadata follows package', runtime.version === pkg.version && health.version === pkg.version && (runtime.experience === 'css-design-system-consolidation' || (['101.11.0','101.11.1'].includes(pkg.version) && runtime.experience === 'communications-architecture') || (pkg.version === '101.11.2' && runtime.experience === 'teams-tasks-foundation') || (pkg.version === '101.11.3' && runtime.experience === 'actionable-pipeline-experience')) && (pkg.version !== '101.11.1' || runtime.loginExperience === 'v101.11.1'))
ok('Node runtime targets historical release or approved successor', (start.includes("const RELEASE = '101.10.9'") && start.includes("const RELEASE_NAME = 'CSS & Design System Consolidation'")) || (start.includes("const RELEASE = '101.11.0'") && start.includes("const RELEASE_NAME = 'Communications Architecture'")) || (start.includes("const RELEASE = '101.11.1'") && start.includes("const RELEASE_NAME = 'Login Experience & Reliability'")) || (start.includes("const RELEASE = '101.11.2'") && start.includes("const RELEASE_NAME = 'Teams & Tasks Foundation'")) || (start.includes("const RELEASE = '101.11.3'") && start.includes("const RELEASE_NAME = 'Actionable Pipeline Experience'")))
ok('runtime only reuses its own release dist', (pkg.version === '101.10.9' && start.includes("V101.10.9 — CSS & Design System Consolidation") && start.includes("Build V101.10.9")) || (pkg.version === '101.11.0' && start.includes("V101.11.0 — Communications Architecture") && start.includes("Build V101.11.0")) || (pkg.version === '101.11.1' && start.includes("V101.11.1 — Login Experience & Reliability") && start.includes("Build V101.11.1")) || (pkg.version === '101.11.2' && start.includes("V101.11.2 — Teams & Tasks Foundation") && start.includes('Build V${RELEASE}')) || (pkg.version === '101.11.3' && start.includes("V101.11.3 — Actionable Pipeline Experience") && start.includes('Build V${RELEASE}')))
ok('runtime migration recognizes V101.10.8 predecessor', start.includes('RealTalent-CRM-V101.10.8-Runtime-Developer-Experience-Linux-Launcher'))
ok('Pipeline canonical stylesheet exists', exists('src/styles/pipeline.css'))
ok('Follow-ups canonical stylesheet exists', exists('src/styles/followups.css'))
ok('Connect canonical stylesheet exists', exists('src/styles/realtalent-connect.css'))
ok('Pipeline runtime uses canonical stylesheet', main.includes("import './styles/pipeline.css'") && !main.includes("import './styles/pipeline-v100.css'"))
ok('Follow-ups runtime uses canonical stylesheet', main.includes("import './styles/followups.css'") && !main.includes("import './styles/followups-v100.css'"))
ok('Connect runtime uses canonical stylesheet', main.includes("import './styles/realtalent-connect.css'") && !main.includes("import './styles/realtalent-connect-v1018.css'"))
ok('Design System remains later in cascade', main.indexOf('ui-polish.css') > main.indexOf('realtalent-connect.css') && read('src/styles/ui-polish.css').includes(historicalText('ui-polish.css','design-system-consolidation-v10198.css')))
ok('Pipeline canonical contains both historical layers', read('src/styles/pipeline.css').includes(historicalText('pipeline.css','pipeline-v100.css')) && read('src/styles/pipeline.css').includes(historicalText('pipeline.css','pipeline-v10076.css')))
ok('Follow-ups canonical contains both historical layers', read('src/styles/followups.css').includes(historicalText('followups.css','followups-v100.css')) && read('src/styles/followups.css').includes(historicalText('followups.css','followups-v10077.css')))
ok('Connect canonical contains five historical layers', ['realtalent-connect-v1018.css','realtalent-connect-v10181.css','realtalent-connect-v10182.css','realtalent-connect-v10183.css','realtalent-connect-v101107.css'].every((name) => read('src/styles/realtalent-connect.css').includes(historicalText('realtalent-connect.css',name))))
ok('legacy CSS source files retained or H5-removed with manifest proof', ['pipeline-v100.css','pipeline-v10076.css','followups-v100.css','followups-v10077.css','realtalent-connect-v1018.css','realtalent-connect-v10181.css','realtalent-connect-v10182.css','realtalent-connect-v10183.css','realtalent-connect-v101107.css'].every((name) => exists(`src/styles/${name}`) || h5Removal?.removed?.[name]))
ok('versioned CSS debt allowlist exists', exists('qa/css-legacy-allowlist.json') && json('qa/css-legacy-allowlist.json').legacyVersionedCss.length >= 40)
ok('CSS inventory tool registered', pkg.scripts?.['css:inventory'] === 'node scripts/css_inventory.mjs --write' && exists('scripts/css_inventory.mjs'))
ok('CSS governance gate registered', pkg.scripts?.['css:governance'] === 'node scripts/css_governance_audit.mjs' && String(pkg.scripts['qa:architecture']).includes('css:governance'))
ok('QA V101.10.9 registered', pkg.scripts?.['qa:v101.10.9'] === 'node scripts/v101_10_9_css_design_system_consolidation_audit.mjs' && String(pkg.scripts['qa:architecture']).includes('qa:v101.10.9'))
ok('registry-independent build filters superseded CSS', build.includes('supersededRuntimeCss') && build.includes('mainCssOrder'))
ok('inventory report committed', exists('docs/qa/CSS_INVENTORY_V101.10.9.md'))
ok('no V101.10.9 migration', !fs.readdirSync(path.join(root, 'supabase/migrations')).some((name) => /101[_-]?10[_-]?9/i.test(name)))
ok('release documentation exists', exists('RELEASE_NOTES_V101.10.9.md') && exists('docs/releases/101.10/V101.10.9-CSS-DESIGN-SYSTEM.md'))

for (const item of checks) console.log(`${item.ok ? 'OK  ' : 'FAIL'} ${item.label}`)
const failed = checks.filter((item) => !item.ok)
console.log(`\nV101.10.9 CSS & Design System Consolidation: ${checks.length - failed.length}/${checks.length} contracts.`)
if (failed.length) process.exit(1)
