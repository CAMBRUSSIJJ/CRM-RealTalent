// Source inventory only: DOM behavior must still be verified in a real browser.
import ts from 'typescript'
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const all = (dir, extension) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name)
  if (entry.isDirectory()) return all(full, extension)
  return entry.name.endsWith(extension) && !/\.test\.|\.spec\./.test(entry.name) ? [full] : []
})
const relative = (file) => path.relative(root, file).replaceAll(path.sep, '/')
const lineAt = (source, offset) => source.slice(0, offset).split('\n').length
const buttons = []
const tsx = all(path.join(root, 'src'), '.tsx')
for (const file of tsx) {
  const source = readFileSync(file, 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  function inspect(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(ast)
      if (['button', 'Button', 'IconButton'].includes(tag)) {
        const attributes = node.attributes.properties
        const names = attributes.filter(ts.isJsxAttribute).map((attr) => attr.name.text)
        const jsxAttr = attributes.filter(ts.isJsxAttribute)
        const type = jsxAttr.find((attr) => attr.name.text === 'type')
        const buttonType = type?.initializer && ts.isStringLiteral(type.initializer) ? type.initializer.text : undefined
        const hasAction = names.some((name) => /^on(Click|MouseDown|PointerDown|KeyDown|TouchStart)$/.test(name))
        const hasSpread = attributes.some(ts.isJsxSpreadAttribute)
        const result = !hasAction && buttonType !== 'submit' && !hasSpread && !names.includes('disabled')
          ? 'review-no-explicit-handler'
          : hasAction ? 'action-attached' : hasSpread ? 'spread-props' : 'native-submit-or-disabled'
        buttons.push({ file: relative(file), line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, tag, result, buttonType: buttonType ?? null, ariaLabel: names.includes('aria-label') })
      }
    }
    ts.forEachChild(node, inspect)
  }
  inspect(ast)
}
const cssFiles = all(path.join(root, 'src', 'styles'), '.css')
const highZ = [], microFont = []
for (const file of cssFiles) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/z-index\s*:\s*([0-9]+)/gi)) {
    const value = Number(match[1])
    if (value >= 1000) highZ.push({ file: relative(file), line: lineAt(source, match.index), value })
  }
  for (const match of source.matchAll(/font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)px/gi)) {
    const value = Number(match[1])
    if (value < 12) microFont.push({ file: relative(file), line: lineAt(source, match.index), px: value })
  }
}
const report = {
  generatedBy: 'scripts/ui_action_inventory.mjs',
  sourceOnly: true,
  note: 'Potential controls require manual browser inspection; text size and z-index values are static signals, not proven visual defects.',
  summary: {
    tsxFiles: tsx.length, cssFiles: cssFiles.length,
    buttons: buttons.length,
    buttonsWithHandlers: buttons.filter((b) => b.result === 'action-attached').length,
    controlsToReview: buttons.filter((b) => b.result === 'review-no-explicit-handler').length,
    highZRules: highZ.length, microFontRules: microFont.length,
  },
  controlsToReview: buttons.filter((b) => b.result === 'review-no-explicit-handler'),
  highZ, microFont,
}
const out = process.env.REPORT_PATH || path.join(root, 'qa', 'ui-action-inventory.generated.json')
mkdirSync(path.dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(report, null, 2) + '\n')
console.log('RealTalent UI source inventory:', JSON.stringify(report.summary))
console.log('Detailed report:', out)
