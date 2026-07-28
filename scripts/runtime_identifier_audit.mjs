import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const localTypeScript = path.join(root, 'node_modules', 'typescript', 'lib', 'typescript.js')
const npmRoot = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).stdout.trim()
const globalTypeScript = path.join(npmRoot, 'typescript', 'lib', 'typescript.js')
const typescriptPath = fs.existsSync(localTypeScript) ? localTypeScript : globalTypeScript
if (!fs.existsSync(typescriptPath)) throw new Error('TypeScript não encontrado para auditoria de identificadores.')
const ts = await import(pathToFileURL(typescriptPath).href)

const files = []
const walk = (dir) => {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(file)
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.') && !file.includes(`${path.sep}src${path.sep}test${path.sep}`)) files.push(file)
  }
}
walk(path.join(root, 'src'))

const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  allowSyntheticDefaultImports: true,
  esModuleInterop: true,
  resolveJsonModule: true,
}
const program = ts.createProgram(files, options)
const watchedCodes = new Set([2304, 2552, 2448, 2454, 18004])
const failures = ts.getPreEmitDiagnostics(program).filter((diagnostic) => watchedCodes.has(diagnostic.code)).map((diagnostic) => {
  const source = diagnostic.file
  const position = source && typeof diagnostic.start === 'number' ? source.getLineAndCharacterOfPosition(diagnostic.start) : null
  return {
    code: diagnostic.code,
    file: source ? path.relative(root, source.fileName).replaceAll('\\', '/') : null,
    line: position ? position.line + 1 : null,
    column: position ? position.character + 1 : null,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
  }
})
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const label = `V${pkg.version.replace(/\.0$/, '').replaceAll('.', '-')}`
const report = { version: pkg.version, generatedAt: new Date().toISOString(), passed: failures.length === 0, files: files.length, watchedCodes: [...watchedCodes], failures }
fs.writeFileSync(path.join(root, `RUNTIME-IDENTIFIER-AUDIT-${label}.json`), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (failures.length) process.exit(1)
