import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const file=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
test('contact drawer geometry override is loaded after generic drawer styles',()=>{
  const main=file('src/main.tsx')
  const generic=main.indexOf("import './styles/ui-foundation.css'")
  const responsive=main.indexOf("import './styles/contact-workspace-responsive-hotfix.css'")
  assert.ok(generic>=0&&responsive>generic,'responsive geometry must load after ui-foundation')
  assert.ok(responsive>main.indexOf("import './styles/h20-product-cohesion.css'"))
})
test('commercial drawer restores editing width while preserving mobile viewport',()=>{
  const css=file('src/styles/contact-workspace-responsive-hotfix.css')
  assert.match(css,/\.lead-drawer-layer\s*>\s*\.lead-drawer\.lead-drawer--sales-workspace\.sales-workspace-v1015\s*\{/)
  assert.match(css,/width:min\(1120px,98vw\)/)
  assert.match(css,/@media\s*\(max-width:980px\)/)
  assert.match(css,/width:100vw/)
  assert.match(css,/grid-template-columns:minmax\(0,1fr\)/)
})
test('the nested commercial panels can shrink without clipped CTA',()=>{
  const css=file('src/styles/contact-workspace-responsive-hotfix.css')
  assert.match(css,/\.sales-workspace-v1015__strategy-summary-actions\s*\{[\s\S]*?flex-wrap:wrap/)
  assert.match(css,/\.sales-workspace-v1013__primary\s*\{\s*flex-wrap:wrap/)
})
