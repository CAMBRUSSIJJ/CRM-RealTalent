import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isTrustedRealTalentViteProcess as trusted } from './runtime-preview-process-trust.mjs'

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-preview-owner-'))
const appRoot = path.join(sandbox, 'RealTalent-Teste-WhatsApp')
const other = path.join(sandbox, 'unrelated-website')
const legacy = path.join(sandbox, 'RealTalent-CRM-V101.11.3-H19')
const fakeSibling = path.join(sandbox, 'RealTalent-Teste-WhatsApp-copy')
for (const p of [appRoot, other, legacy, fakeSibling]) fs.mkdirSync(p, { recursive: true })
const oldNode = `/usr/bin/node ${appRoot}/node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4188 --strictPort`
test.after(() => fs.rmSync(sandbox, { recursive: true, force: true }))

test('recognizes previous Vite in current checkout even with nonlegacy folder name', () => {
  assert.equal(trusted({cwd:appRoot,appRoot,cmdline:oldNode}),true)
  assert.equal(trusted({cwd:appRoot,appRoot,cmdline:'node node_modules/vite/bin/vite.js preview --host 127.0.0.1'}),true)
})
test('does not recognize a different node process even inside RealTalent checkout', () => {
  for (const cmdline of ['node scripts/realtalent-communications-gateway.mjs','node scripts/start.mjs --dev','node scripts/realtalent-connect-server.mjs','node server.js']) {
    assert.equal(trusted({cwd:appRoot,appRoot,cmdline}),false,cmdline)
  }
})
test('never terminates third-party Vite running in another checkout', () => {
  assert.equal(trusted({cwd:other,appRoot,cmdline:'node node_modules/vite/bin/vite.js --port 4188'}),false)
  assert.equal(trusted({cwd:fakeSibling,appRoot,cmdline:oldNode}),false)
})
test('recognizes historical RealTalent preview directories as before', () => {
  assert.equal(trusted({cwd:legacy,appRoot,cmdline:'node node_modules/vite/bin/vite.js preview --host 127.0.0.1'}),true)
})
test('returns false when directory or command is absent or invalid', () => {
  assert.equal(trusted({cwd:'/not/a/real/directory',appRoot,cmdline:oldNode}),false)
  assert.equal(trusted({cwd:appRoot,appRoot,cmdline:''}),false)
  assert.equal(trusted({cwd:'',appRoot,cmdline:oldNode}),false)
})
test('recognizes symlink to same checkout without trusting sibling directories', () => {
  const link=path.join(sandbox,'shortcut')
  fs.symlinkSync(appRoot,link,'dir')
  assert.equal(trusted({cwd:link,appRoot,cmdline:oldNode}),true)
})

test('the launcher frees its Vite port before starting the local sidecars', () => {
  const launcher = fs.readFileSync(new URL('./start.mjs', import.meta.url), 'utf8')
  const lastPortCheck = launcher.lastIndexOf("if (mode !== 'garimpo') await recoverPreviewPort()")
  const startServices = launcher.lastIndexOf("await startServices(token, { preserveProspecting: mode === 'garimpo' })")
  assert.ok(lastPortCheck > 0 && startServices > lastPortCheck,
    'port reclaim must run before Communications Gateway and Connect startup')
})
