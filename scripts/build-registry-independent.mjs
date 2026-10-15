import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localTypeScript = path.join(root, 'node_modules', 'typescript', 'lib', 'typescript.js')
const npmRoot = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).stdout.trim()
const globalTypeScript = path.join(npmRoot, 'typescript', 'lib', 'typescript.js')
const typescriptPath = fs.existsSync(localTypeScript) ? localTypeScript : globalTypeScript
if (!fs.existsSync(typescriptPath)) {
  throw new Error('TypeScript 6.x não encontrado. Execute npm ci --include=dev antes de gerar o build.')
}
const importedTypeScript = await import(pathToFileURL(typescriptPath).href)
const ts = importedTypeScript.default ?? importedTypeScript
if (typeof ts.transpileModule !== 'function') {
  throw new Error('Versão incompatível do TypeScript. Este build requer TypeScript 6.x com Compiler API JavaScript.')
}
const srcRoot = path.join(root, 'src')
const dist = path.join(root, 'dist')
const assets = path.join(dist, 'assets')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const shortVersion = pkg.version.replace(/\.0$/, '')
const label = `V${shortVersion.replaceAll('.', '-')}`

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name)
  return entry.isDirectory() ? walk(full) : [full]
})

const sourceFiles = walk(srcRoot)
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .filter((file) => !/\.(test|spec)\.(ts|tsx)$/.test(file))
  .filter((file) => !file.endsWith('.d.ts'))
  .sort()

const normalizeId = (file) => path.relative(root, file).split(path.sep).join('/')
const modules = []
const diagnostics = []
const envValues = {
  VITE_APP_NAME: process.env.VITE_APP_NAME || 'RealTalent CRM',
  VITE_DATA_MODE: process.env.VITE_DATA_MODE || 'auto',
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
  VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
  VITE_RELEASE_CHANNEL: process.env.VITE_RELEASE_CHANNEL || 'production',
  VITE_COMMIT_SHA: process.env.VITE_COMMIT_SHA || 'registry-independent-build',
}

for (const file of sourceFiles) {
  const id = normalizeId(file)
  let source = fs.readFileSync(file, 'utf8')
  source = source.replace(/^\s*import\s+['"][^'"]+\.css['"];?\s*$/gm, '')
  source = source.replace(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g, (_, key) => JSON.stringify(envValues[key] ?? ''))
  const output = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      isolatedModules: true,
      removeComments: false,
      sourceMap: false,
    },
  })
  for (const diagnostic of output.diagnostics || []) {
    if (diagnostic.category === ts.DiagnosticCategory.Error) {
      diagnostics.push(`${id}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`)
    }
  }
  modules.push({ id, code: output.outputText })
}

if (diagnostics.length) {
  console.error(diagnostics.join('\n'))
  process.exit(1)
}

const externals = {
  react: '__extReact',
  'react/jsx-runtime': '__extJsxRuntime',
  'react-dom/client': '__extReactDomClient',
  'lucide-react': '__extLucide',
  '@supabase/supabase-js': '__extSupabase',
}

const moduleEntries = modules.map(({ id, code }) => `${JSON.stringify(id)}: function(module, exports, require) {\n${code}\n}`).join(',\n')
const bundle = `/* GENERATED_FROM_TYPESCRIPT_SOURCE ${pkg.version} | registry-independent ESM bundle */
import ReactDefault, * as ReactNS from 'react';
import * as JsxRuntimeNS from 'react/jsx-runtime';
import * as ReactDomClientNS from 'react-dom/client';
import * as LucideNS from 'lucide-react';
import * as SupabaseNS from '@supabase/supabase-js';
const __extReact = Object.assign({ __esModule: true, default: ReactDefault }, ReactNS);
const __extJsxRuntime = Object.assign({ __esModule: true }, JsxRuntimeNS);
const __extReactDomClient = Object.assign({ __esModule: true }, ReactDomClientNS);
const __extLucide = Object.assign({ __esModule: true }, LucideNS);
const __extSupabase = Object.assign({ __esModule: true }, SupabaseNS);
const __externals = { ${Object.entries(externals).map(([key, value]) => `${JSON.stringify(key)}: ${value}`).join(', ')} };
const __modules = {\n${moduleEntries}\n};
const __cache = Object.create(null);
const __extensions = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];
function __normalize(value) {
  const parts = [];
  for (const part of value.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop(); else parts.push(part);
  }
  return parts.join('/');
}
function __resolve(from, request) {
  if (__externals[request]) return request;
  if (!request.startsWith('.')) throw new Error('Módulo externo não registrado: ' + request);
  const base = from.slice(0, from.lastIndexOf('/') + 1);
  const candidate = __normalize(base + request);
  for (const suffix of __extensions) if (__modules[candidate + suffix]) return candidate + suffix;
  throw new Error('Módulo local não encontrado: ' + request + ' a partir de ' + from);
}
function __load(id) {
  if (__externals[id]) return __externals[id];
  if (__cache[id]) return __cache[id].exports;
  const factory = __modules[id];
  if (!factory) throw new Error('Módulo não encontrado: ' + id);
  const module = { exports: {} };
  __cache[id] = module;
  const localRequire = (request) => __load(__resolve(id, request));
  factory(module, module.exports, localRequire);
  return module.exports;
}
__load('src/main.tsx');
`

fs.rmSync(dist, { recursive: true, force: true })
fs.mkdirSync(assets, { recursive: true })
const jsName = `realtalent-crm-${label.toLowerCase()}.js`
const cssName = `realtalent-crm-${label.toLowerCase()}.css`
fs.writeFileSync(path.join(assets, jsName), bundle)
const stylesRoot = path.join(srcRoot, 'styles')
const supersededRuntimeCss = new Set([
  'pipeline-v100.css', 'pipeline-v10076.css',
  'followups-v100.css', 'followups-v10077.css',
  'realtalent-connect-v1018.css', 'realtalent-connect-v10181.css',
  'realtalent-connect-v10182.css', 'realtalent-connect-v10183.css',
  'realtalent-connect-v101107.css',
  'realtalent-ui-system-v10154.css', 'visual-rollout-v10155.css', 'visual-consistency-hotfix-v10156.css',
  'myday-lock-appbar-v10162.css',
  'workspace-ui-standardization-v10166.css', 'global-workspace-ui-consistency-v10167.css',
  'workspace-interaction-architecture-v10168.css', 'global-filter-view-standard-v10169.css',
  'workspace-simplification-filter-engine-v10170.css',
  'interaction-surfaces-v10172.css', 'ux-consolidation-v10173.css',
  'design-system-consolidation-v10198.css', 'ux-recovery-v10199-h3.css', 'workspace-appearance-v10199-h4.css',
  'selection-filter-system-v101105.css',
  'contacts-views-record-v1016.css', 'contacts-experience-completion-v10161.css',
  'contact-views-v10163.css', 'contact-data-grid-view-settings-v10164.css', 'contact-custom-properties-v10165.css',
  'contact-intelligence-v101105-h3.css', 'account-intelligence.css',
  'calls-v100.css', 'calls-v100982.css', 'calls-v1012.css',
  'workspace-metrics-calling-convergence-v10170-h4.css', 'metrics-calling-structural-redesign-v10171.css',
  'automations-v100.css', 'prospecting-v100.css', 'prospecting-engine-v10098.css',
  'prospecting-search-automation-v101101.css', 'prospecting-agent-v101102.css',
  'prospecting-review-v101103-h7.css', 'prospecting-search-ontology-v101103-h8.css',
  'prospecting-territory-engine-v101103-h9.css', 'prospecting-local-discovery-v101104.css',
  'prospecting-ux-consolidation-v101106.css', 'prospecting-search-processing-v101103.css',
])
const availableCss = fs.readdirSync(stylesRoot)
  .filter((name) => name.endsWith('.css'))
  .filter((name) => !supersededRuntimeCss.has(name))
const mainSource = fs.readFileSync(path.join(srcRoot, 'main.tsx'), 'utf8')
const mainCssOrder = [...mainSource.matchAll(/import\s+['"]\.\/styles\/([^'"]+\.css)['"]/g)]
  .map((match) => match[1])
  .filter((name, index, list) => list.indexOf(name) === index)
const orderedCss = [
  ...mainCssOrder.filter((name) => availableCss.includes(name)),
  ...availableCss.filter((name) => !mainCssOrder.includes(name)).sort(),
]
const cssSources = orderedCss
  .map((name) => `/* source: ${name} */\n${fs.readFileSync(path.join(stylesRoot, name), 'utf8')}`)
  .join('\n\n')
fs.writeFileSync(path.join(assets, cssName), cssSources)
for (const file of walk(path.join(root, 'public'))) {
  const relative = path.relative(path.join(root, 'public'), file)
  const target = path.join(dist, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(file, target)
}

const index = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#17264a" />
  <meta name="description" content="RealTalent CRM — operação comercial integrada." />
  <link rel="manifest" href="./manifest.webmanifest" />
  <link rel="stylesheet" href="./assets/${cssName}" />
  <script type="importmap">{"imports":{"react":"https://esm.sh/react@19.2.7","react/jsx-runtime":"https://esm.sh/react@19.2.7/jsx-runtime","react-dom/client":"https://esm.sh/react-dom@19.2.7/client?external=react","lucide-react":"https://esm.sh/lucide-react@1.24.0?external=react","@supabase/supabase-js":"https://esm.sh/@supabase/supabase-js@2.110.7"}}</script>
  <title>RealTalent CRM V${shortVersion} — Operação Comercial</title>
</head>
<body>
  <div id="root"><div style="padding:24px;font:14px system-ui;color:#526078">Carregando RealTalent CRM…</div></div>
  <script type="module" src="./assets/${jsName}"></script>
</body>
</html>
`
fs.writeFileSync(path.join(dist, 'index.html'), index)

console.log(`Build ${label} gerado a partir do TypeScript (${modules.length} módulos).`)

