import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const localTypeScript = path.join(root, 'node_modules', 'typescript', 'lib', 'typescript.js')
const npmRoot = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).stdout.trim()
const globalTypeScript = path.join(npmRoot, 'typescript', 'lib', 'typescript.js')
const typescriptPath = fs.existsSync(localTypeScript) ? localTypeScript : globalTypeScript
if (!fs.existsSync(typescriptPath)) throw new Error('TypeScript 6.x não encontrado para auditoria sintática.')
const importedTypeScript = await import(pathToFileURL(typescriptPath).href)
const ts = importedTypeScript.default ?? importedTypeScript
if (typeof ts.createSourceFile !== 'function') throw new Error('Versão incompatível do TypeScript para auditoria sintática.')
const files = []
const walk = (dir) => {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const value = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(value)
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(value)
  }
}
walk(path.join(root, 'src'))
walk(path.join(root, 'supabase', 'functions'))
walk(path.join(root, 'extension-sdk'))
const failures = []
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
  for (const diagnostic of source.parseDiagnostics ?? []) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue
    const position = typeof diagnostic.start === 'number' ? source.getLineAndCharacterOfPosition(diagnostic.start) : null
    failures.push({
      file: path.relative(root, file).replaceAll('\\', '/'),
      line: position ? position.line + 1 : null,
      column: position ? position.character + 1 : null,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
    })
  }
}
if (failures.length) {
  console.error(JSON.stringify({ passed: false, files: files.length, failures }, null, 2))
  process.exit(1)
}
console.log(`Validação sintática aprovada em ${files.length} arquivos.`)
