import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const file = path => readFileSync(path, 'utf8')

test('Vercel login refresh does not sign out other devices or switch to local mode', () => {
  const app = file('src/app/app.tsx')
  const repository = file('src/repositories/supabase-crm-repository.ts')
  const context = file('src/app/app-context.tsx')
  const recovery = file('src/services/startup-auth-recovery.ts')

  assert.ok(app.includes("scope: 'local'"))
  assert.ok(app.includes('Entrar novamente'))
  assert.ok(app.includes('reinitialize()'))
  assert.ok(repository.includes('recoverStartupRead('))
  assert.ok(context.includes('recoverStartupRead(loadInitialSnapshot, recoverAuth)'))
  assert.ok(!recovery.includes('localStorage.clear'))
  assert.ok(!recovery.includes("effectiveDataMode = 'local'"))
})
