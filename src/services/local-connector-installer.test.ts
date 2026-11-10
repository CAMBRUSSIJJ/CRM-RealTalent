import { expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildGarimpoLinuxCommand, buildGarimpoLinuxInstaller } from './local-connector-installer'

const config = [
  'SUPABASE_URL=https://example.supabase.co',
  'SUPABASE_PUBLISHABLE_KEY=public-key',
  'GARIMPO_WORKSPACE_ID=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  `GARIMPO_CONNECTOR_TOKEN=${'a'.repeat(64)}`,
  'PROSPECTING_AI_MODEL=qwen2.5-coder:3b',
  '',
].join('\n')

test('Linux: gera instalador único com credencial embutida e pacote SHA256 fixado', () => {
  const installer = buildGarimpoLinuxInstaller(config)
  expect(installer.startsWith('#!/usr/bin/env bash\n')).toBe(true)
  expect(installer).toContain('exec bash "$CONNECTOR/CONFIGURAR-LINUX.sh" "$CONFIG"')
  expect(installer).toContain('b83b561e17e3324ed906aa9304ea4a2247a1b752ca31f6da0adda693a40ecef1')
  expect(installer).toContain('sha256sum --check --status')
  expect(installer).toContain('chmod 600 -- "$CONFIG.new"')
  expect(installer).toContain('ARCHIVE_URL="https://raw.githubusercontent.com')
  expect(installer).not.toContain('a'.repeat(64))
  expect(installer).toContain(btoa(config))
})

test('Linux: rejeita pacote sem token ou sem workspace', () => {
  expect(() => buildGarimpoLinuxInstaller('')).toThrow()
  expect(() => buildGarimpoLinuxInstaller(config.replace(/GARIMPO_CONNECTOR_TOKEN=.*/, 'GARIMPO_CONNECTOR_TOKEN=invalid'))).toThrow()
  expect(() => buildGarimpoLinuxInstaller(config.replace(/GARIMPO_WORKSPACE_ID=.*/, 'GARIMPO_WORKSPACE_ID='))).toThrow()
})

test('Linux: script gerado passa no parser bash sem executar a instalação', () => {
  if (process.platform === 'win32') return
  const dir = mkdtempSync(path.join(os.tmpdir(), 'garimpo-installer-'))
  try {
    const filename = path.join(dir, 'CONECTAR-GARIMPO-LINUX.sh')
    writeFileSync(filename, buildGarimpoLinuxInstaller(config), { mode: 0o600 })
    const result = spawnSync('bash', ['-n', filename], { encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('Linux: comando de copiar não depende de arquivo e tem sintaxe válida', () => {
  const command = buildGarimpoLinuxCommand(config)
  expect(command.startsWith('bash -c "$(printf')).toBe(true)
  expect(command).not.toContain('GARIMPO_CONNECTOR_TOKEN=')
  expect(command).not.toContain('a'.repeat(64))
  const payload = command.match(/^bash -c "\$\(printf '%s' '([A-Za-z0-9+/=]+)' \| base64 --decode\)"$/)?.[1]
  expect(payload).toBeTruthy()
  const decoded = Buffer.from(payload!, 'base64').toString('utf8')
  expect(decoded).toContain('exec bash "$CONNECTOR/CONFIGURAR-LINUX.sh" "$CONFIG"')
  if (process.platform !== 'win32') {
    const parsed = spawnSync('bash', ['-n'], { input: decoded, encoding: 'utf8' })
    expect(parsed.status, parsed.stderr).toBe(0)
  }
})
