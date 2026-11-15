#!/usr/bin/env node
// Offline update: only listed code files change; garimpo.env is never read or copied.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const hash = (data) => data === null ? null : createHash('sha256').update(data).digest('hex')
const read = async (file) => { try { return await fs.readFile(file) } catch (error) { if (error.code === 'ENOENT') return null; throw error } }
async function write(file, bytes, mode = 0o644) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temp = file + '.g8-' + randomUUID()
  try { await fs.writeFile(temp, bytes, { flag: 'wx', mode }); await fs.rename(temp, file) }
  finally { await fs.rm(temp, { force: true }) }
}
async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 22 || major === 22 && minor < 18) throw Error('O conector G8 exige Node.js 22.18 ou superior.')
  const args = process.argv.slice(2)
  let action = 'apply', rootInput = ''
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--root' && args[index + 1]) rootInput = args[++index]
    else if (['--check', '--restore'].includes(args[index]) && action === 'apply') action = args[index].slice(2)
    else throw Error('Argumento inválido: ' + args[index])
  }
  if (!rootInput) {
    const downloads = path.join(os.homedir(), 'Downloads')
    const roots = []
    for (const name of await fs.readdir(downloads)) {
      if (!name.startsWith('RealTalent-Garimpo-Conexao-')) continue
      const root = path.join(downloads, name)
      try { await fs.access(path.join(root, 'deploy/local-garimpo/garimpo.env')); roots.push(root) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    if (roots.length !== 1) throw Error('Indique a pasta da instalação com --root /caminho/RealTalent-Garimpo-Conexao-xxxx. Nenhum arquivo foi alterado.')
    rootInput = roots[0]
  }
  const root = await fs.realpath(rootInput)
  await fs.access(path.join(root, 'deploy/local-garimpo/garimpo.env'))
  const manifest = JSON.parse(await fs.readFile(path.join(sourceRoot, 'deploy/local-garimpo/update-g8-manifest.json'), 'utf8'))
  const require = createRequire(path.join(root, 'deploy/local-garimpo/package.json'))
  if (require('ai/package.json').version !== manifest.aiVersion) throw Error('Versão do AI SDK incompatível. Use o instalador G8 completo, preservando sua configuração.')
  const backupRoot = path.join(root, '.garimpo-g8-backups'), pointer = path.join(backupRoot, 'latest.json')
  async function target(relative) {
    const file = path.resolve(root, relative)
    if (!file.startsWith(root + path.sep)) throw Error('Caminho fora da instalação.')
    let parent = file
    while (parent !== root) {
      try { if ((await fs.lstat(parent)).isSymbolicLink()) throw Error('Link simbólico no caminho de destino: ' + relative) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      parent = path.dirname(parent)
    }
    return file
  }
  async function restore(folder) {
    const state = JSON.parse(await fs.readFile(path.join(folder, 'backup.json'), 'utf8'))
    if (state.root !== root || state.files.length !== manifest.files.length) throw Error('Backup de outra instalação.')
    const operations = []
    for (const entry of state.files) {
      const expected = manifest.files.find((file) => file.path === entry.path && file.after === entry.after)
      if (!expected) throw Error('Backup incompatível.')
      const file = await target(entry.path), current = hash(await read(file))
      if (current !== entry.before && current !== entry.after) throw Error('Edição posterior preservada: ' + entry.path)
      const bytes = entry.before === null ? null : await fs.readFile(path.join(folder, entry.path))
      if (hash(bytes) !== entry.before) throw Error('Backup corrompido: ' + entry.path)
      operations.push({ file, bytes, mode: entry.mode })
    }
    for (const operation of operations) {
      if (operation.bytes === null) await fs.rm(operation.file, { force: true })
      else await write(operation.file, operation.bytes, operation.mode)
    }
  }
  if (action === 'restore') {
    const latest = JSON.parse(await fs.readFile(pointer, 'utf8'))
    if (typeof latest.folder !== 'string' || path.basename(latest.folder) !== latest.folder) throw Error('Referência de backup inválida.')
    await restore(path.join(backupRoot, latest.folder))
    console.log('Código anterior restaurado. Reabra o conector quando não houver pesquisas em execução.'); return
  }
  const operations = []
  for (const entry of manifest.files) {
    const file = await target(entry.path), before = await read(file), beforeHash = hash(before)
    const bytes = await fs.readFile(path.join(sourceRoot, entry.path))
    if (hash(bytes) !== entry.after) throw Error('Integridade do pacote inválida: ' + entry.path)
    if (beforeHash !== entry.after && !entry.allowedBefore.includes(beforeHash))
      throw Error('Versão desconhecida ou edição local: ' + entry.path + '. Nenhum arquivo foi alterado.')
    operations.push({ ...entry, file, beforeBytes: before, before: beforeHash, bytes, mode: before === null ? 0o644 : (await fs.stat(file)).mode & 0o777 })
  }
  if (operations.every((entry) => entry.before === entry.after)) { console.log('G8 já aplicado nesta instalação.'); return }
  if (action === 'check') { console.log('Instalação compatível com G8. Nenhum arquivo foi alterado.'); return }
  if (root === sourceRoot) throw Error('Extraia o pacote G8 em outra pasta antes de atualizar sua instalação.')
  const name = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8), folder = path.join(backupRoot, name)
  await fs.mkdir(folder, { recursive: true, mode: 0o700 })
  for (const entry of operations) if (entry.beforeBytes !== null) {
    const backup = path.join(folder, entry.path)
    await fs.mkdir(path.dirname(backup), { recursive: true, mode: 0o700 })
    await fs.writeFile(backup, entry.beforeBytes, { mode: 0o600, flag: 'wx' })
  }
  await write(path.join(folder, 'backup.json'), JSON.stringify({ root, files: operations.map(({ path, before, after, mode }) => ({ path, before, after, mode })) }), 0o600)
  await write(pointer, JSON.stringify({ folder: name }), 0o600)
  try {
    for (const entry of operations) {
      if (hash(await read(entry.file)) !== entry.before) throw Error('Arquivo mudou durante a atualização: ' + entry.path)
      await write(entry.file, entry.bytes, entry.mode)
    }
    const check = spawnSync(process.execPath, ['--test', path.join(root, 'deploy/local-garimpo/intelligence-g8-check.mjs')], { encoding: 'utf8', timeout: 60_000 })
    if (check.error || check.status !== 0) throw Error('O teste G8 não passou. ' + (check.stderr || check.stdout || ''))
    console.log('G8 instalado e verificado. Configuração, token e modelo preservados. Backup: ' + folder)
    console.log('Reabra INICIAR-GARIMPO-LOCAL.sh da instalação atualizada. O conector anterior deve estar fechado, conforme o guia G8.')
  } catch (error) {
    await restore(folder)
    throw Error('Atualização desfeita: ' + error.message)
  }
}
main().catch((error) => { console.error('ERRO: ' + error.message); process.exitCode = 1 })
