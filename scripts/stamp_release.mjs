import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = packageJson.version.replace(/\.0$/, '')
const channel = process.env.VITE_RELEASE_CHANNEL || process.env.RELEASE_CHANNEL || 'development'
const commit = (process.env.VITE_COMMIT_SHA || process.env.GITHUB_SHA || 'local').slice(0, 40)
const health = {
  status: 'ok',
  application: 'RealTalent CRM',
  version,
  release: 'Produção e Homologação Real',
  channel,
  commit,
  builtAt: new Date().toISOString(),
}
fs.writeFileSync(path.join(root, 'public', 'health.json'), JSON.stringify(health, null, 2) + '\n')
console.log(`Release ${version} marcada para ${channel} (${commit.slice(0, 12)}).`)
