import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const sourceFiles = []
const walk = (dir) => {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) sourceFiles.push(full)
  }
}
walk(path.join(root, 'src'))
walk(path.join(root, 'public'))

for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8')
  const rel = path.relative(root, file).replaceAll('\\', '/')
  if (/setConnectCommand|connectCommand/.test(text)) failures.push(`${rel}: referência residual ao RealTalent Connect.`)
  if (/<CallWorkspaceModal[^\n]*\b(initialLeadId|queueLeadIds)=/.test(text)) failures.push(`${rel}: CallWorkspaceModal ainda usa props legadas; use config={CallSessionConfig}.`)
}

const callWorkspace = read('src/features/calls/call-workspace-modal.tsx')
if (!/config:\s*CallSessionConfig\s*\|\s*null/.test(callWorkspace)) failures.push('CallWorkspaceModal não declara o contrato canônico CallSessionConfig.')

const quickConfig = read('src/features/calls/call-session-config.ts')
if (!/buildQuickCallSessionConfig/.test(quickConfig)) failures.push('Helper central buildQuickCallSessionConfig ausente.')

const mapRuntime = read('public/commercial-map-runtime.js')
if (/state\.tab\s*=\s*['"]location['"]|state\.tab===['"]location['"]/.test(mapRuntime)) failures.push('Território ainda usa tab órfã "location"; use locationQueue transitório.')
if (!/locationQueue/.test(mapRuntime)) failures.push('Território não possui estado explícito para fila de localização.')

const modalSource = read('src/components/ui/modal.tsx')
if (!/const closeRef = useRef\(onClose\)/.test(modalSource)) failures.push('Modal global não estabiliza onClose; callbacks recriados podem rearmar efeitos de foco.')
if (!/const modalStack:\s*string\[\]/.test(modalSource) || !/isTopModal/.test(modalSource)) failures.push('Modal global não possui stack explícita para overlays empilhados.')
if (!/\.modal__body \$\{focusableSelector\}/.test(modalSource)) failures.push('Modal global não prioriza controles do corpo no foco inicial.')
if (/\[onClose,\s*open\]/.test(modalSource)) failures.push('Modal global ainda depende de onClose no efeito de foco e pode roubar foco a cada render.')

const leadDrawerSource = read('src/features/leads/lead-details-drawer.tsx')
if (!/createPortal\(drawer, document\.body\)/.test(leadDrawerSource)) failures.push('Ficha lateral de Lead não usa portal; pode sofrer clipping por animações/containers de rota.')
if (/stakeholder\(s\)/.test(leadDrawerSource)) failures.push('Ficha lateral ainda usa pluralização técnica stakeholder(s).')

const defaultsSource = read('src/domain/defaults.ts')
if (/DEMO_PRODUCTS\s*\[\s*\d+\s*\]/.test(defaultsSource)) failures.push('Dados demo usam índice numérico em DEMO_PRODUCTS; use busca por id para evitar referência undefined após remoção de produto.')

const packageJson = JSON.parse(read('package.json'))
const checkScript = String(packageJson.scripts?.check ?? '')
const architectureScript = String(packageJson.scripts?.['qa:architecture'] ?? '')
if (!checkScript.includes('integration:audit') && !(checkScript.includes('qa:architecture') && architectureScript.includes('integration:audit'))) failures.push('npm run check não executa integration:audit diretamente ou via qa:architecture.')

if (failures.length) {
  console.error('Auditoria de contratos falhou:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}
console.log(`Auditoria de contratos aprovada em ${sourceFiles.length} arquivos.`)
