import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { inspectUiBuild, writeUiBuildStamp, computeUiSourceFingerprint } from './runtime-ui-build-integrity.mjs'

const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'realtalent-ui-build-'))
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'public'), { recursive: true })
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src', 'App.tsx'), 'export const label = "novo CRM"')
  fs.writeFileSync(path.join(root, 'src', 'style.css'), '.calling-flow__hero{display:grid}')
  fs.writeFileSync(path.join(root, 'public', 'logo.svg'), '<svg/>')
  fs.writeFileSync(path.join(root, 'index.html'), '<html>RealTalent CRM</html>')
  fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<html>Build antigo</html>')
  fs.writeFileSync(path.join(root, '.env.local'), 'VITE_DATA_MODE=local\nVITE_RELEASE_CHANNEL=official-communications\n')
  return root
}
const cleanup = (root) => fs.rmSync(root, { recursive: true, force: true })

test('a legacy build without source fingerprint is never considered current', () => {
  const root = fixture()
  try {
    assert.equal(inspectUiBuild(root).fresh, false)
    writeUiBuildStamp(root)
    assert.equal(inspectUiBuild(root).fresh, true)
  } finally { cleanup(root) }
})

test('modifying React or CSS invalidates the compiled UI', () => {
  const root = fixture()
  try {
    writeUiBuildStamp(root)
    for (const [file,content] of [
      ['src/App.tsx', 'export const label = "CRM atualizado"'],
      ['src/style.css', '.calling-flow__hero{display:flex}'],
    ]) {
      fs.writeFileSync(path.join(root, file), content)
      assert.equal(inspectUiBuild(root).fresh, false, file)
      writeUiBuildStamp(root)
      assert.equal(inspectUiBuild(root).fresh, true, file)
    }
  } finally { cleanup(root) }
})

test('changing the communications UI or static assets invalidates the build', () => {
  const root = fixture()
  try {
    writeUiBuildStamp(root)
    fs.writeFileSync(path.join(root, 'public', 'logo.svg'), '<svg fill="blue"/>')
    assert.equal(inspectUiBuild(root).fresh, false)
  } finally { cleanup(root) }
})

test('launcher environment rewrite does not trigger a rebuild if VITE values are unchanged', () => {
  const root = fixture()
  try {
    const fingerprint = computeUiSourceFingerprint(root)
    fs.writeFileSync(path.join(root, '.env.local'), '# rewritten by launcher\nVITE_RELEASE_CHANNEL=official-communications\nVITE_DATA_MODE=local\n')
    assert.equal(computeUiSourceFingerprint(root), fingerprint)
    fs.writeFileSync(path.join(root, '.env.local'), 'VITE_DATA_MODE=cloud\nVITE_RELEASE_CHANNEL=official-communications\n')
    assert.notEqual(computeUiSourceFingerprint(root), fingerprint)
  } finally { cleanup(root) }
})

test('manifest identifies the actual UI build and does not disclose source contents', () => {
  const root = fixture()
  try {
    const info = writeUiBuildStamp(root)
    assert.match(info.sourceFingerprint, /^[a-f0-9]{64}$/)
    assert.equal(info.communicationsUi, 'waha-default-local-v102')
    const text = fs.readFileSync(path.join(root, 'dist', 'rt-ui-build.json'), 'utf8')
    assert.ok(!text.includes('export const'))
    assert.ok(!text.includes('VITE_DATA_MODE='))
  } finally { cleanup(root) }
})
