import assert from 'node:assert/strict'
import fs from 'node:fs'

const page = fs.readFileSync('src/features/communications/communications-page.tsx', 'utf8')
const start = fs.readFileSync('scripts/start.mjs', 'utf8')
const helper = fs.readFileSync('scripts/runtime-ui-build-integrity.mjs', 'utf8')
const waha = fs.readFileSync('src/features/communications/waha-conversations-page.tsx', 'utf8')

const checks = [
  ['new WAHA mode remembers v102 rather than retaining legacy v101 original',
    page.includes("sessionStorage.getItem('realtalent.communications.transport.v102')") &&
    !page.includes("sessionStorage.getItem('realtalent.communications.transport.v101')")],
  ['WAHA is default on localhost and 127.0.0.1',
    page.includes("['localhost', '127.0.0.1'].includes(host)")],
  ['operator can still choose the original communications center',
    page.includes('useWaha ? <WahaConversationsPage /> : <OriginalCommunicationsPage />') &&
    page.includes("sessionStorage.setItem('realtalent.communications.transport.v102'")],
  ['active UI is identifiable in the DOM',
    page.includes('data-realtalent-communications-ui={useWaha')],
  ['real WAHA component remains imported',
    page.includes("import { WahaConversationsPage }") && waha.includes('export')],
  ['runtime checks real source freshness before reusing compiled assets',
    start.includes("!buildState.fresh") && start.includes("writeUiBuildStamp(ROOT)")],
  ['runtime uses versioned build URL',
    start.includes("&rt_build=${uiStamp.sourceFingerprint.slice(0, 16)}")],
  ['fingerprint does not use volatile environment timestamps',
    !helper.includes('stat.mtimeMs') && helper.includes("filter((line) => /^VITE_")],
]
checks.forEach(([name, valid]) => {
  console.log((valid ? 'OK' : 'FAIL') + ' — ' + name)
  assert.ok(valid, name)
})
console.log('Communications/local build integrity: ' + checks.length + '/' + checks.length + ' contracts.')
