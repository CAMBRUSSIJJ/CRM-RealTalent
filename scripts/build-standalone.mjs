import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const dist = join(root, 'dist')
const assets = join(dist, 'assets')
const files = await readdir(assets)
const cssName = files.find((name) => name.endsWith('.css'))
const jsName = files.find((name) => name.startsWith('index-') && name.endsWith('.js'))
if (!cssName || !jsName) throw new Error('Assets de build não encontrados.')
const css = await readFile(join(assets, cssName), 'utf8')
const js = await readFile(join(assets, jsName), 'utf8')
const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#17264a" />
<meta name="referrer" content="strict-origin-when-cross-origin" />
<title>RealTalent CRM V100.27 — Inicialização, Deploy e Operação</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${js.replaceAll('</script>', '<\/script>')}</script>
</body>
</html>`
await writeFile(join(root, 'REALTALENT-CRM-V100-27-standalone.html'), html)
await writeFile(join(root, 'REALTALENT-CRM-V100-27.html'), html)
console.log('Standalone RealTalent CRM V100.27 criado.')
