import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const router = path.resolve(root, 'runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-semantic-router.mjs')
const gateway = path.resolve(root, 'runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs')

if (!fs.existsSync(router) || !fs.existsSync(gateway)) throw new Error('Fonte semântica definitiva não encontrada.')
const routerSource = fs.readFileSync(router, 'utf8')
const gatewaySource = fs.readFileSync(gateway, 'utf8')
if (!routerSource.includes('preserveExplicitPlannerArguments')) throw new Error('Preservação de entidades explícitas não está no roteador estático.')
if (!gatewaySource.includes('preserveExplicitPlannerArguments')) throw new Error('Gateway não está usando a preservação de entidades estática.')

console.log('✓ preserve-agent-entities.mjs agora é somente verificador; nenhum arquivo foi reescrito.')
