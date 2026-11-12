import { spawnSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmod, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { availableMemory, hardwareProfile, GiB } from './hardware-profile.mjs'

const directory = path.dirname(fileURLToPath(import.meta.url))
const revision = '603d3ec4a7f7ef7e0b1c3e5c8ec5a514bca8e1b7'
const officialRepository = 'https://github.com/firecrawl/firecrawl.git'
const major = Number(process.versions.node.split('.')[0]), minor = Number(process.versions.node.split('.')[1])
const checkOnly = process.argv.includes('--check')
const command = (name, args, cwd = directory, visible = false) => {
  const result = spawnSync(name, args, { cwd, encoding: 'utf8', stdio: visible ? 'inherit' : 'pipe' })
  if (result.status !== 0) throw new Error(`Não foi possível executar ${name}. Confira se ele está instalado e disponível no terminal.`)
  return (result.stdout || '').trim()
}

async function main() {
  if (process.platform !== 'linux') throw new Error('Este configurador é para Linux. Use o guia correspondente ao seu sistema.')
  if (major < 22 || (major === 22 && minor < 18)) throw new Error('É necessário Node.js 22.18 ou superior.')
  const memoryGb = Math.round(os.totalmem() / 1024 ** 3)
  const memoryAvailable = availableMemory(await readFile('/proc/meminfo', 'utf8'))
  console.log(`Node ${process.versions.node} · ${memoryGb} GB de memória`)
  const compose = command('docker', ['compose', 'version', '--short'])
  const versions = compose.replace(/^v/, '').split('.').map(Number)
  if (versions[0] < 2 || (versions[0] === 2 && (versions[1] < 24 || (versions[1] === 24 && versions[2] < 4)))) throw new Error('Atualize Docker Compose para 2.24.4 ou superior.')
  command('docker', ['info', '--format', '{{.ServerVersion}}'])
  console.log(`Docker e Compose ${compose} disponíveis.`)
  let models = []
  let profile
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error('ollama')
    const data = await response.json()
    profile = hardwareProfile(os.totalmem(), data.models || [])
    models = profile.models
  } catch { throw new Error('Inicie o Ollama no Linux e execute este configurador novamente. O endereço esperado é http://127.0.0.1:11434.') }
  console.log(models.length ? `Modelos instalados: ${models.join(', ')}` : 'Ollama está ativo, mas não tem modelos instalados. Instale um modelo compatível com JSON Schema antes de continuar.')
  if (profile.economy) console.log('Perfil econômico: uma página por vez, contexto reduzido e modelo menor como primeira opção.')
  if (memoryAvailable !== null) console.log(`Memória disponível agora: ${(memoryAvailable / GiB).toFixed(1)} GiB.`)
  if (checkOnly) { console.log('Verificação concluída. Nenhum serviço ou arquivo foi alterado.'); return }
  if (!models.length) throw new Error('Instale um modelo no Ollama e execute novamente. Use ollama list para conferir os modelos.')
  command('git', ['--version'])
  const suppliedConfig = process.argv.slice(2).find((value) => !value.startsWith('--'))
  const configFile = path.join(directory, 'garimpo.env')
  if (suppliedConfig) {
    const origin = path.resolve(suppliedConfig)
    if (origin !== configFile) await copyFile(origin, configFile)
  }
  if (!existsSync(configFile)) throw new Error('No CRM, abra Garimpo → Busca → Configurar ou verificar meu Linux → Gerar garimpo.env. Salve o arquivo nesta pasta ou informe seu caminho ao executar o configurador.')
  await chmod(configFile, 0o600)
  process.loadEnvFile(configFile)
  if (!/^[a-f0-9]{64}$/.test(process.env.GARIMPO_CONNECTOR_TOKEN || '') || !process.env.GARIMPO_WORKSPACE_ID) throw new Error('O arquivo garimpo.env está incompleto. Gere outro arquivo no CRM.')
  const endpoint = new URL(process.env.SUPABASE_URL || '')
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw new Error('Endereço Supabase inválido no arquivo de configuração.')
  let model = models.includes(process.env.PROSPECTING_AI_MODEL) ? process.env.PROSPECTING_AI_MODEL : ''
  if (!model) {
    models.forEach((name, index) => console.log(`  ${index + 1}. ${name}`))
    const terminal = createInterface({ input: process.stdin, output: process.stdout })
    try {
      const answer = await terminal.question('Escolha o número do modelo que deseja usar [1]: ')
      model = models[Number(answer.trim() || '1') - 1]
    } finally { terminal.close() }
    if (!model) throw new Error('Número de modelo inválido. Execute novamente para escolher.')
  }
  let configuration = await readFile(configFile, 'utf8')
  configuration = /^PROSPECTING_AI_MODEL=.*$/m.test(configuration) ? configuration.replace(/^PROSPECTING_AI_MODEL=.*$/m, `PROSPECTING_AI_MODEL=${model}`) : configuration + `\nPROSPECTING_AI_MODEL=${model}\n`
  for (const [key, value] of Object.entries({ GARIMPO_MEMORY_PROFILE: profile.economy ? 'low' : 'normal', GARIMPO_OLLAMA_RELEASE: profile.economy ? 'true' : 'false' })) {
    const pattern = new RegExp(`^${key}=.*$`, 'm')
    configuration = pattern.test(configuration) ? configuration.replace(pattern, `${key}=${value}`) : configuration + `\n${key}=${value}\n`
  }
  await writeFile(configFile, configuration, { mode: 0o600 })
  process.env.PROSPECTING_AI_MODEL = model
  console.log('Instalando as dependências do conector…')
  command('npm', ['ci', '--no-audit', '--no-fund'], directory, true)
  const { connectorConfig, workerClient } = await import('./bridge.mjs')
  await workerClient(connectorConfig(process.env))('verify')
  console.log('Acesso ao workspace confirmado. Preparando Firecrawl oficial…')
  const runtime = path.join(directory, 'firecrawl-runtime')
  if (!existsSync(runtime)) {
    await mkdir(runtime)
    command('git', ['init'], runtime)
    command('git', ['remote', 'add', 'origin', officialRepository], runtime)
    command('git', ['fetch', '--depth=1', 'origin', revision], runtime, true)
    command('git', ['checkout', '--detach', 'FETCH_HEAD'], runtime, true)
  }
  if (command('git', ['remote', 'get-url', 'origin'], runtime) !== officialRepository || command('git', ['rev-parse', 'HEAD'], runtime) !== revision) throw new Error('A pasta firecrawl-runtime contém outra origem ou versão. Preserve seus arquivos e escolha uma pasta nova para o conector.')
  const garimpo = path.join(runtime, 'garimpo')
  await mkdir(garimpo, { recursive: true })
  for (const name of ['compose.override.yaml', 'compose.low-memory.yaml', 'searxng-settings.yml']) await copyFile(path.join(directory, name), path.join(garimpo, name))
  const runtimeEnv = path.join(runtime, '.env')
  let runtimeConfig = existsSync(runtimeEnv) ? await readFile(runtimeEnv, 'utf8') : ''
  for (const key of ['SEARXNG_SECRET', 'POSTGRES_PASSWORD']) {
    if (!new RegExp(`^${key}=.+$`, 'm').test(runtimeConfig)) runtimeConfig += `\n${key}=${randomBytes(32).toString('hex')}\n`
  }
  await writeFile(runtimeEnv, runtimeConfig, { mode: 0o600 }); await chmod(runtimeEnv, 0o600)
  const composeArgs = ['compose', '--project-name', 'realtalent-garimpo', '-f', 'docker-compose.yaml', '-f', 'garimpo/compose.override.yaml', ...(profile.economy ? ['-f', 'garimpo/compose.low-memory.yaml'] : [])]
  command('docker', [...composeArgs, 'config', '--quiet'], runtime, true)
  console.log('Iniciando o Firecrawl. A primeira compilação pode levar alguns minutos…')
  if (profile.economy) {
    for (const service of ['nuq-postgres', 'playwright-service', 'api']) command('docker', [...composeArgs, 'build', service], runtime, true)
    command('docker', [...composeArgs, 'up', '-d', '--no-build', 'api'], runtime, true)
  } else command('docker', [...composeArgs, 'up', '-d', '--build', 'api'], runtime, true)
  console.log('Firecrawl iniciado. Abrindo o conector; mantenha esta janela aberta durante as pesquisas.')
  const child = spawn(process.execPath, ['bridge.mjs', configFile], { cwd: directory, stdio: 'inherit' })
  process.exitCode = await new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 1)))
}

try { await main() }
catch (error) { console.error(error instanceof Error ? error.message : 'Não foi possível concluir a configuração.'); process.exitCode = 1 }
