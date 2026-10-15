import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const stylesRoot = path.join(root, 'src/styles')
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name)
  return entry.isDirectory() ? walk(full) : [full]
})
const files = walk(stylesRoot).filter((file) => file.endsWith('.css')).sort()
const main = fs.readFileSync(path.join(root, 'src/main.tsx'), 'utf8')
const imports = [...main.matchAll(/import\s+['"]\.\/styles\/([^'"]+\.css)['"]/g)].map((match) => match[1])
const versioned = files.filter((file) => /(?:^|[-_])v\d/i.test(path.basename(file)))
const canonical = ['pipeline.css', 'followups.css', 'realtalent-connect.css', 'ui-foundation.css', 'app-shell.css', 'workspace-ui.css', 'interaction-ui.css', 'ui-polish.css', 'selection-controls.css', 'contact-record.css', 'contacts.css', 'contact-intelligence.css', 'account-360.css', 'calls-core.css', 'calling-workspace.css', 'calling-intelligence.css', 'automations.css', 'prospecting-core.css', 'prospecting-engine.css', 'prospecting-workspace.css', 'prospecting-processing.css', 'proposals-workspace.css', 'h20-product-cohesion.css'].filter((name) => fs.existsSync(path.join(stylesRoot, name)))
const bytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0)

const selectorFiles = new Map()
for (const file of files) {
  const rel = path.relative(root, file).split(path.sep).join('/')
  const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const match of css.matchAll(/(^|})\s*([^@}{][^{]+)\{/g)) {
    const raw = match[2].trim()
    for (const selector of raw.split(',').map((value) => value.trim()).filter(Boolean)) {
      if (!selectorFiles.has(selector)) selectorFiles.set(selector, new Set())
      selectorFiles.get(selector).add(rel)
    }
  }
}
const duplicatedSelectors = [...selectorFiles.entries()]
  .filter(([, locations]) => locations.size > 1)
  .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))

const summary = {
  cssFiles: files.length,
  cssBytes: bytes,
  mainRuntimeImports: imports.length,
  versionedCssFiles: versioned.length,
  canonicalRuntimeFiles: canonical,
  duplicatedSelectorsAcrossFiles: duplicatedSelectors.length,
}
console.log(JSON.stringify(summary, null, 2))

if (process.argv.includes('--write')) {
  const top = duplicatedSelectors.slice(0, 40)
  const lines = [
    '# CSS Inventory — V101.10.9-H5', '',
    `- CSS files in repository: **${files.length}**`,
    `- CSS bytes in repository: **${bytes.toLocaleString('en-US')}**`,
    `- Direct runtime imports in src/main.tsx: **${imports.length}**`,
    `- Version-suffixed legacy CSS files: **${versioned.length}**`,
    `- Cross-file duplicated selectors (heuristic): **${duplicatedSelectors.length}**`,
    `- Canonicalized in this release: **${canonical.join(', ')}**`, '',
    '## Runtime import order', '',
    ...imports.map((name, index) => `${index + 1}. \`${name}\``), '',
    '## Most repeated selectors across files', '',
    ...top.map(([selector, locations]) => `- \`${selector}\` — ${locations.size} files: ${[...locations].slice(0, 8).join(', ')}${locations.size > 8 ? '…' : ''}`), '',
    '## Policy', '',
    'Version-suffixed CSS is frozen as legacy debt. New visual work must use canonical, versionless stylesheets or existing design-system primitives. Existing legacy files may only leave the runtime after equivalence checks and regression gates pass.', ''
  ]
  const out = path.join(root, 'docs/qa/CSS_INVENTORY_V101.10.9-H5.md')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, lines.join('\n'))
  console.log(`Inventory written to ${path.relative(root, out)}`)
}
