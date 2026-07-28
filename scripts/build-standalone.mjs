import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const shortVersion = packageJson.version.replace(/\.0$/, '')
const fileLabel = `V${shortVersion.replaceAll('.', '-')}`
const dist = join(root, 'dist')
const assets = join(dist, 'assets')
const names = await readdir(assets)
const jsFiles = names.filter((name) => name.endsWith('.js'))
const cssFiles = names.filter((name) => name.endsWith('.css'))
if (jsFiles.length !== 1) throw new Error(`Build standalone deveria gerar 1 JavaScript, mas gerou ${jsFiles.length}.`)
if (cssFiles.length !== 1) throw new Error(`Build standalone deveria gerar 1 CSS, mas gerou ${cssFiles.length}.`)

const index = await readFile(join(dist, 'index.html'), 'utf8')
const css = await readFile(join(assets, cssFiles[0]), 'utf8')
const application = (await readFile(join(assets, jsFiles[0]), 'utf8')).replaceAll('</script>', '<\\/script>')
const runtime = (await readFile(join(dist, 'commercial-map-runtime.js'), 'utf8')).replaceAll('</script>', '<\\/script>')

const head = index
  .slice(0, index.indexOf('</head>'))
  .replace(/\s*<script[^>]+src="[^"]+"[^>]*><\/script>/g, '')
  .replace(/\s*<link rel="modulepreload"[^>]*>/g, '')
  .replace(/\s*<link rel="stylesheet"[^>]*>/g, '')
  .replace(/\s*<link rel="manifest"[^>]*>/g, '')

const marker = `<!-- GENERATED_FROM_TYPESCRIPT_SOURCE version=${packageJson.version} -->`
const html = `${marker}\n${head}\n<style>${css}</style>\n</head>\n<body>\n<div id="root"><div style="padding:24px;font:14px system-ui;color:#526078">Carregando RealTalent CRM…</div></div>\n<script type="module">${application}</script>\n<script>${runtime}</script>\n</body>\n</html>\n`
await writeFile(join(root, `REALTALENT-CRM-${fileLabel}-standalone.html`), html)
await writeFile(join(root, `REALTALENT-CRM-${fileLabel}.html`), html)
console.log(`Standalone RealTalent CRM ${fileLabel.replace('-', '.')} gerado exclusivamente do código-fonte TypeScript.`)
