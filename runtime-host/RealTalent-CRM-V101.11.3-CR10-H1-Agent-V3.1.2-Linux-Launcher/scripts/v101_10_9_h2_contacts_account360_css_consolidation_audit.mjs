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
const sourceManifest = json('qa/contacts-account360-consolidation-v101109-h2.json')
const main = read('src/main.tsx')
const leads = read('src/features/leads/leads-page.tsx')
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
  'contact-record.css': ['contacts-views-record-v1016.css','contacts-experience-completion-v10161.css'],
  'contacts.css': ['contact-views-v10163.css','contact-data-grid-view-settings-v10164.css','contact-custom-properties-v10165.css'],
  'contact-intelligence.css': ['contact-intelligence-v101105-h3.css'],
  'account-360.css': ['account-intelligence.css'],
}

ok('base package lineage preserved in current or approved successor', ['101.10.9','101.11.0','101.11.1','101.11.2','101.11.3'].includes(pkg.version))
ok('manifest preserves H2 lineage through approved successors', (manifest.release?.version === '101.10.9' && ((manifest.release?.hotfix === 'H2' && manifest.release?.hotfixName === 'Contacts & Account 360 CSS Consolidation' && manifest.release?.hotfixBaseRelease === 'V101.10.9-H1') || (manifest.release?.hotfix === 'H3' && manifest.release?.hotfixBaseRelease === 'V101.10.9-H2') || (manifest.release?.hotfix === 'H4' && manifest.release?.hotfixBaseRelease === 'V101.10.9-H3') || (manifest.release?.hotfix === 'H5' && manifest.release?.hotfixBaseRelease === 'V101.10.9-H4'))) || ((manifest.release?.version === '101.11.0' && manifest.release?.baseRelease === 'V101.10.9-H5') || (manifest.release?.version === '101.11.1' && manifest.release?.baseRelease === 'V101.11.0') || (manifest.release?.version === '101.11.2' && manifest.release?.baseRelease === 'V101.11.1-H5') || (manifest.release?.version === '101.11.3' && manifest.release?.baseRelease === 'V101.11.2')) || (manifest.release?.version === '101.11.1' && manifest.release?.baseRelease === 'V101.11.0'))
ok('H2 source manifest exists', sourceManifest.release === 'V101.10.9-H2' && sourceManifest.base === 'V101.10.9-H1')
for (const [canonical, sources] of Object.entries(groups)) {
  ok(`${canonical} exists`, exists(`src/styles/${canonical}`))
  ok(`${canonical} sources retained`, sources.every((name) => exists(`src/styles/${name}`) || h5Removal?.removed?.[name]?.canonical === canonical))
  const css = read(`src/styles/${canonical}`)
  const sourceTexts = sources.map((name) => historicalText(canonical, name))
  ok(`${canonical} contains exact source layers`, sourceTexts.every((text) => css.includes(text)))
  ok(`${canonical} preserves cascade order`, sourceTexts.every((text, i) => i === 0 || css.indexOf(text) > css.indexOf(sourceTexts[i-1])))
  ok(`${canonical} source hashes recorded`, sources.every((name) => sourceManifest.groups?.[canonical]?.some((entry) => entry.source === name && entry.sha256 === historicalRawSha(canonical, name))))
}

ok('Contact record canonical layer stays between foundation and app shell', main.indexOf('ui-foundation.css') < main.indexOf('contact-record.css') && main.indexOf('contact-record.css') < main.indexOf('app-shell.css'))
ok('Contact views canonical layer stays between app shell and workspace', main.indexOf('app-shell.css') < main.indexOf('contacts.css') && main.indexOf('contacts.css') < main.indexOf('workspace-ui.css'))
ok('Contact intelligence retains late cascade position', main.indexOf('selection-controls.css') < main.indexOf('contact-intelligence.css'))
ok('superseded Contact CSS no longer loads directly', groups['contact-record.css'].concat(groups['contacts.css'],groups['contact-intelligence.css']).every((name) => !main.includes(`import './styles/${name}'`)))
ok('Account 360 canonical stylesheet is component-owned', leads.includes("import '../../styles/account-360.css'") && !leads.includes('account-intelligence.css'))
ok('Account 360 selectors remain present', read('src/styles/account-360.css').includes('.account360{') && read('src/styles/account-360.css').includes('.account360-role-map') && read('src/styles/account-360.css').includes('.account360-person'))
ok('runtime CSS imports remain at or below H2 budget', [...main.matchAll(/import\s+['"]\.\/styles\/([^'"]+\.css)['"]/g)].length <= 56)
ok('standalone build excludes all superseded H2 CSS', Object.values(groups).flat().every((name) => build.includes(`'${name}'`)))
ok('H2 runtime prefers H1 folder for state migration', start.includes('RealTalent-CRM-V101.10.9-H1-Global-UI-Consolidation-Linux-Launcher') && start.indexOf('RealTalent-CRM-V101.10.9-H1-Global-UI-Consolidation-Linux-Launcher') < start.indexOf('RealTalent-CRM-V101.10.9-CSS-Design-System-Consolidation-Linux-Launcher'))
ok('no H2 database migration', !fs.readdirSync(path.join(root, 'supabase/migrations')).some((name) => /101[_-]?10[_-]?9[_-]?h2/i.test(name)))
ok('H2 release notes exist', exists('RELEASE_NOTES_V101.10.9-H2.md') && exists('docs/releases/101.10/V101.10.9-H2-CONTACTS-ACCOUNT360-CSS-CONSOLIDATION.md'))
ok('H2 equivalence report exists', exists('docs/qa/CONTACTS_ACCOUNT360_EQUIVALENCE_V101.10.9-H2.md'))
ok('H2 CSS inventory exists', exists('docs/qa/CSS_INVENTORY_V101.10.9-H2.md'))
ok('H2 lineage marker exists', read('index.html').includes('V101.10.9-H2 — Contacts & Account 360 CSS Consolidation') && read('src/lib/app-version.ts').includes('V101.10.9-H2 — Contacts & Account 360 CSS Consolidation'))

for (const item of checks) console.log(`${item.ok ? 'OK  ' : 'FAIL'} ${item.label}`)
const failed = checks.filter((item) => !item.ok)
console.log(`\nV101.10.9-H2 Contacts & Account 360 CSS Consolidation: ${checks.length - failed.length}/${checks.length} contracts.`)
if (failed.length) process.exit(1)
