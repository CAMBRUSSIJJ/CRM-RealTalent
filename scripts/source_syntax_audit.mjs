import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const localTypeScript = path.join(root, 'node_modules', 'typescript', 'lib', 'typescript.js')
const npmRoot = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).stdout.trim()
const globalTypeScript = path.join(npmRoot, 'typescript', 'lib', 'typescript.js')
const typescriptPath = fs.existsSync(localTypeScript) ? localTypeScript : globalTypeScript
if (!fs.existsSync(typescriptPath)) throw new Error('Compilador TypeScript não encontrado para auditoria sintática.')
const importedTypeScript = await import(pathToFileURL(typescriptPath).href)
const ts = importedTypeScript.default ?? importedTypeScript
if (typeof ts.createSourceFile !== 'function') throw new Error('Compilador TypeScript incompatível com a auditoria sintática.')
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
const localModuleExists = (file, specifier) => {
  if (!specifier.startsWith('.')) return true
  const candidate = path.resolve(path.dirname(file), specifier)
  const candidates = [
    candidate,
    `${candidate}.ts`, `${candidate}.tsx`, `${candidate}.js`, `${candidate}.jsx`, `${candidate}.mjs`, `${candidate}.cjs`,
    `${candidate}.json`, `${candidate}.css`,
    path.join(candidate, 'index.ts'), path.join(candidate, 'index.tsx'), path.join(candidate, 'index.js'), path.join(candidate, 'index.jsx'),
  ]
  return candidates.some((value) => fs.existsSync(value) && fs.statSync(value).isFile())
}
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
  const inspectUiAction = (node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === 'button') {
      const attributes = node.attributes.properties
      const named = new Set(attributes.filter(ts.isJsxAttribute).map((attribute) => attribute.name.text))
      const hasSpread = attributes.some(ts.isJsxSpreadAttribute)
      const typeAttribute = attributes.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.text === 'type')
      const typeValue = typeAttribute?.initializer && ts.isStringLiteral(typeAttribute.initializer) ? typeAttribute.initializer.text : null
      const position = source.getLineAndCharacterOfPosition(node.getStart(source))
      if (!named.has('type')) failures.push({
        file: path.relative(root, file).replaceAll('\\', '/'),
        line: position.line + 1,
        column: position.character + 1,
        message: 'Botão HTML sem type explícito; use type="button" ou type="submit" para evitar submits acidentais.',
      })
      const hasAction = ['onClick', 'onMouseDown', 'onPointerDown', 'onDrop', 'formAction'].some((name) => named.has(name))
      if (!hasAction && typeValue !== 'submit' && !hasSpread) failures.push({
        file: path.relative(root, file).replaceAll('\\', '/'),
        line: position.line + 1,
        column: position.character + 1,
        message: 'Botão HTML sem ação detectável. Se for apenas visual, use um elemento não interativo.',
      })
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === 'Button') {
      const attributes = node.attributes.properties
      const named = new Set(attributes.filter(ts.isJsxAttribute).map((attribute) => attribute.name.text))
      const hasSpread = attributes.some(ts.isJsxSpreadAttribute)
      const typeAttribute = attributes.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.text === 'type')
      const typeValue = typeAttribute?.initializer && ts.isStringLiteral(typeAttribute.initializer) ? typeAttribute.initializer.text : null
      const hasAction = ['onClick', 'onMouseDown', 'onPointerDown', 'formAction'].some((name) => named.has(name))
      if (!hasAction && typeValue !== 'submit' && !hasSpread) {
        const position = source.getLineAndCharacterOfPosition(node.getStart(source))
        failures.push({
          file: path.relative(root, file).replaceAll('\\', '/'),
          line: position.line + 1,
          column: position.character + 1,
          message: 'Componente Button sem ação detectável. Adicione um handler/type ou use um elemento não interativo.',
        })
      }
    }
    ts.forEachChild(node, inspectUiAction)
  }
  ts.forEachChild(source, inspectUiAction)

  const inspectImport = (node) => {
    let specifier = null
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifier = node.moduleSpecifier.text
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) specifier = node.arguments[0].text
    if (specifier?.startsWith('.') && !localModuleExists(file, specifier)) {
      const position = source.getLineAndCharacterOfPosition(node.getStart(source))
      failures.push({
        file: path.relative(root, file).replaceAll('\\', '/'),
        line: position.line + 1,
        column: position.character + 1,
        message: `Import local não encontrado: ${specifier}`,
      })
    }
    ts.forEachChild(node, inspectImport)
  }
  ts.forEachChild(source, inspectImport)
}
if (failures.length) {
  console.error(JSON.stringify({ passed: false, files: files.length, failures }, null, 2))
  process.exit(1)
}
console.log(`Validação sintática aprovada em ${files.length} arquivos.`)
