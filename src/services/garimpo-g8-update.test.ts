import { afterEach, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const roots: string[] = []
const sha = (value: string) => createHash('sha256').update(value).digest('hex')
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }) })
async function fixture(failingTest = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'garimpo-update-test-')); roots.push(root)
  const source = path.join(root, 'package'), target = path.join(root, 'installed')
  const files = [
    { path: 'deploy/local-garimpo/bridge.mjs', before: "export const version = 'G7'\n", after: "export const version = 'G8'\n" },
    { path: 'supabase/functions/_shared/prospecting-ai.ts', before: "export const contract = 'legacy'\n", after: "export const contract = 'garimpo-research/8'\n" },
    { path: 'deploy/local-garimpo/intelligence-g8-check.mjs', before: null, after: failingTest ? "throw Error('simulated failure')\n" :
      "import test from 'node:test'; import assert from 'node:assert/strict'; import {version} from './bridge.mjs'; test('installed version',()=>assert.equal(version,'G8'))\n" },
  ]
  for (const file of files) {
    const next = path.join(source, file.path), previous = path.join(target, file.path)
    await fs.mkdir(path.dirname(next), { recursive: true }); await fs.writeFile(next, file.after)
    if (file.before !== null) { await fs.mkdir(path.dirname(previous), { recursive: true }); await fs.writeFile(previous, file.before) }
  }
  const manifest = { version: 'G8', aiVersion: '7.0.168', files: files.map((file) => ({ path: file.path, after: sha(file.after), allowedBefore: [file.before === null ? null : sha(file.before)] })) }
  const script = path.join(source, 'deploy/local-garimpo/update-g8.mjs')
  await fs.copyFile(new URL('../../deploy/local-garimpo/update-g8.mjs', import.meta.url), script)
  await fs.writeFile(path.join(source, 'deploy/local-garimpo/update-g8-manifest.json'), JSON.stringify(manifest))
  const sdk = path.join(target, 'deploy/local-garimpo/node_modules/ai')
  await fs.mkdir(sdk, { recursive: true }); await fs.writeFile(path.join(sdk, 'package.json'), '{"version":"7.0.168"}')
  await fs.writeFile(path.join(target, 'deploy/local-garimpo/package.json'), '{}')
  const config = 'GARIMPO_CONNECTOR_TOKEN=private-test-token\nPROSPECTING_AI_MODEL=my-existing-model\n'
  const configPath = path.join(target, 'deploy/local-garimpo/garimpo.env'); await fs.writeFile(configPath, config)
  const run = (...args: string[]) => spawnSync(process.execPath, [script, '--root', target, ...args], { encoding: 'utf8', timeout: 10000 })
  return { root, source, target, files, configPath, config, run }
}
it('confere compatibilidade sem alterar a instalação, o token ou o modelo', async () => {
  const f = await fixture(), out = f.run('--check')
  expect(out.status, out.stderr).toBe(0)
  expect(await fs.readFile(path.join(f.target, f.files[0].path), 'utf8')).toBe(f.files[0].before)
  expect(await fs.readFile(f.configPath, 'utf8')).toBe(f.config)
  await expect(fs.stat(path.join(f.target, '.garimpo-g8-backups'))).rejects.toMatchObject({ code: 'ENOENT' })
})
it('aplica, aceita reexecução e restaura o código anterior sem mudar garimpo.env', async () => {
  const f = await fixture(), applied = f.run()
  expect(applied.status, applied.stderr).toBe(0)
  for (const file of f.files) expect(await fs.readFile(path.join(f.target, file.path), 'utf8')).toBe(file.after)
  expect(f.run().stdout).toContain('já aplicado')
  const restored = f.run('--restore'); expect(restored.status, restored.stderr).toBe(0)
  for (const file of f.files) {
    if (file.before === null) await expect(fs.stat(path.join(f.target, file.path))).rejects.toMatchObject({ code: 'ENOENT' })
    else expect(await fs.readFile(path.join(f.target, file.path), 'utf8')).toBe(file.before)
  }
  expect(await fs.readFile(f.configPath, 'utf8')).toBe(f.config)
})
it('recusa código incompatível antes de criar backup ou alterar outros arquivos', async () => {
  const f = await fixture(), file = path.join(f.target, f.files[0].path)
  await fs.appendFile(file, '// local edit')
  const out = f.run(); expect(out.status).not.toBe(0); expect(out.stderr).toContain('edição local')
  expect(await fs.readFile(file, 'utf8')).toContain('// local edit')
  expect(await fs.readFile(path.join(f.target, f.files[1].path), 'utf8')).toBe(f.files[1].before)
})
it('reverte os arquivos quando a verificação do conector atualizado falha', async () => {
  const f = await fixture(true), out = f.run()
  expect(out.status).not.toBe(0); expect(out.stderr).toContain('Atualização desfeita')
  expect(await fs.readFile(path.join(f.target, f.files[0].path), 'utf8')).toBe(f.files[0].before)
  expect(await fs.readFile(f.configPath, 'utf8')).toBe(f.config)
})
it('restauração preserva uma edição feita depois da aplicação', async () => {
  const f = await fixture(); expect(f.run().status).toBe(0)
  const file = path.join(f.target, f.files[0].path)
  await fs.appendFile(file, '// posterior')
  const out = f.run('--restore'); expect(out.status).not.toBe(0); expect(out.stderr).toContain('Edição posterior preservada')
  expect(await fs.readFile(file, 'utf8')).toContain('// posterior')
})
