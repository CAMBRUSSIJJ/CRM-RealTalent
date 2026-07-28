import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const migrationPath = path.join(root, 'supabase/migrations/202607230004_v100_39_connect_desktop.sql')
const servicePath = path.join(root, 'src/services/integration-framework.ts')
const panelPath = path.join(root, 'src/features/settings/integration-framework-panel.tsx')
for (const file of [migrationPath, servicePath, panelPath]) if (!fs.existsSync(file)) throw new Error(`Arquivo ausente: ${path.relative(root, file)}`)
const migration = fs.readFileSync(migrationPath, 'utf8')
const service = fs.readFileSync(servicePath, 'utf8')
const panel = fs.readFileSync(panelPath, 'utf8')
const markers = [
  [migration, 'public.realtalent_connect_devices'],
  [migration, 'public.register_realtalent_connect_device'],
  [migration, 'public.heartbeat_realtalent_connect_device'],
  [migration, 'public.get_realtalent_connect_queue'],
  [migration, 'status not in (\'paused\',\'revoked\')'],
  [service, "from('realtalent_connect_devices')"],
  [service, 'updateConnectDevice'],
  [panel, "['devices','RealTalent Connect']"],
  [panel, "deviceAction(device.id, 'revoke')"],
]
const missing = markers.filter(([content, marker]) => !content.includes(marker)).map(([, marker]) => marker)
if (missing.length) throw new Error(`Integração Connect incompleta: ${missing.join(', ')}`)
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const releaseLabel = `V${packageJson.version.replace(/\.0$/, '').replaceAll('.', '-')}`
const report = { passed: true, version: packageJson.version, checks: markers.length, missing: [] }
fs.writeFileSync(path.join(root, `CONNECT-INTEGRATION-AUDIT-${releaseLabel}.json`), JSON.stringify(report, null, 2) + '\n')
console.log(`Integração CRM/Connect aprovada: ${markers.length} contratos verificados.`)
