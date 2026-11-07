#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectUiBuild } from './runtime-ui-build-integrity.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.PORT || 4188)
const local = inspectUiBuild(root)

console.log('Pasta da instalação:', root)
console.log('Arquivos de interface compilados nesta instalação:', local.fresh ? 'ATUALIZADOS' : 'DESATUALIZADOS')
console.log('Versão da fonte (SHA):', local.sourceFingerprint.slice(0, 16))
console.log('Versão do build local:', (local.builtFingerprint ?? '-').slice(0, 16))
if (local.builtAt) console.log('Build gerado em:', local.builtAt)
if (!local.fresh) console.log('AÇÃO: execute ./start-linux.sh para recompilar esta instalação.')

try {
  const url = `http://127.0.0.1:${port}/rt-ui-build.json?check=${Date.now()}`
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(3500) })
  if (!response.ok) throw new Error(`HTTP ${response.status}: nenhum build identificável nesta porta`)
  const served = await response.json()
  const sameSource = served.sourceFingerprint === local.sourceFingerprint
  const sameBuild = sameSource && served.builtAt === local.builtAt
  console.log('CRM no navegador (porta '+port+'):', sameBuild ? 'ESTA instalação e build' : 'OUTRA compilação / instância')
  console.log('Versão servida:', String(served.sourceFingerprint ?? '-').slice(0, 16))
  console.log('Interface Comunicações:', served.communicationsUi ?? 'não identificada')
  console.log('Interface Ligações:', served.callingFlow ?? 'não identificada')
  if (!sameBuild || !local.fresh) {
    console.error('DIVERGÊNCIA: o CRM aberto não corresponde ao código atualizado. Encerre o CRM antigo e inicie esta pasta novamente.')
    process.exitCode = 2
  } else console.log('OK: o navegador está recebendo exatamente o build atualizado.')
} catch (error) {
  console.error('Não foi possível identificar a instância servida:', error instanceof Error ? error.message : error)
  console.error('Abra o CRM pelo ./start-linux.sh desta pasta e execute novamente.')
  process.exitCode = 2
}
