import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, chmod, rm, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('configurador verifica Docker/Ollama sem escrever arquivos ou instalar serviços', { skip: process.platform !== 'linux' }, async () => {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'garimpo-check-'))
  try {
    const docker = path.join(temporary, 'docker')
    await writeFile(docker, '#!/bin/sh\nif [ "$1" = "compose" ]; then echo v2.40.3; else echo 29.9.2; fi\n')
    await chmod(docker, 0o700)
    const network = path.join(temporary, 'network.mjs')
    await writeFile(network, 'globalThis.fetch = async () => new Response(JSON.stringify({models:[{name:"modelo-teste:4b"}]}));\n')
    const before = await readdir(dir)
    const result = spawnSync(process.execPath, ['--import', network, path.join(dir, 'configurar-linux.mjs'), '--check'], { env: { ...process.env, PATH: `${temporary}:${process.env.PATH}` }, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /modelo-teste:4b/)
    assert.match(result.stdout, /Nenhum serviço ou arquivo foi alterado/)
    assert.deepEqual(await readdir(dir), before)
    await writeFile(docker, '#!/bin/sh\necho v2.23.0\n')
    const outdated = spawnSync(process.execPath, ['--import', network, path.join(dir, 'configurar-linux.mjs'), '--check'], { env: { ...process.env, PATH: `${temporary}:${process.env.PATH}` }, encoding: 'utf8' })
    assert.equal(outdated.status, 1)
    assert.match(outdated.stderr, /Atualize Docker Compose/)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
