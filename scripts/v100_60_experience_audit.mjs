import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const packageJson = JSON.parse(read('package.json'))
const checks = []
const check = (label, condition) => checks.push({ label, ok: Boolean(condition) })
const contains = (file, value) => read(file).includes(value)
const excludes = (file, value) => !read(file).includes(value)

const versionParts = packageJson.version.split('.').map(Number)
const atLeast10060 = versionParts[0] > 100 || (versionParts[0] === 100 && (versionParts[1] > 60 || (versionParts[1] === 60 && versionParts[2] >= 0)))
check('Versão inclui ou sucede V100.60.0', atLeast10060)
check('VERSION acompanha package.json', read('VERSION').trim() === `V${packageJson.version}`)
check('Título do HTML identifica RealTalent CRM', contains('index.html', `RealTalent CRM V${packageJson.version}`))
check('APP_VERSION acompanha package.json', contains('src/lib/app-version.ts', `APP_VERSION = '${packageJson.version}'`))
check('Health endpoint acompanha package.json', contains('public/health.json', `"version": "${packageJson.version}"`))
check('Bridge do Território acompanha package.json', contains('src/features/commercial-map/commercial-map-page.tsx', "import { APP_VERSION } from '../../lib/app-version'") && contains('src/features/commercial-map/commercial-map-page.tsx', 'version: APP_VERSION'))
check('Schema de backup preservado em 100.54', contains('src/lib/app-version.ts', "BACKUP_SCHEMA_VERSION = '100.54'"))

check('Overlay Manager possui fechamento transitório', contains('src/app/overlay-manager.ts', 'closeTransientOverlays'))
check('Navegação global fecha overlays transitórios', contains('src/app/app-context.tsx', 'closeTransientOverlays()'))
check('Modal registra overlay compartilhado', contains('src/components/ui/modal.tsx', 'registerOverlay'))
check('Ficha lateral registra overlay compartilhado', contains('src/features/leads/lead-details-drawer.tsx', 'useOverlayDialog') || contains('src/features/leads/lead-details-drawer.tsx', 'registerOverlay'))

check('Lead usa Cadastro rápido', contains('src/features/leads/lead-form.tsx', 'Cadastro rápido'))
check('Lead usa conceito Pronto para prospectar', contains('src/features/leads/lead-form.tsx', 'Pronto para prospectar'))
check('Lead possui expansão Mais informações', contains('src/features/leads/lead-form.tsx', 'Mais informações'))
check('Lead sugere empresa já existente', contains('src/features/leads/lead-form.tsx', 'Empresa já existente') && contains('src/features/leads/lead-form.tsx', 'Usar empresa'))
check('Indicador Cadastro assistido foi removido do formulário', excludes('src/features/leads/lead-form.tsx', 'Cadastro assistido'))
check('Novo Lead oferece Salvar e trabalhar', contains('src/features/leads/create-lead-modal.tsx', 'Salvar e trabalhar'))
check('Novo Lead oferece ações pós-salvamento', ['Salvar e ligar', 'Salvar e criar follow-up', 'Salvar e adicionar outro'].every((value) => contains('src/features/leads/create-lead-modal.tsx', value)))
check('Ficha comercial possui edição inline', contains('src/features/leads/lead-details-drawer.tsx', 'Editar dados') && contains('src/features/leads/lead-details-drawer.tsx', 'saveInlineSummary'))

check('Account 360 utiliza grafo de relacionamentos', contains('src/features/leads/account-360-modal.tsx', '<AccountRelationshipGraph'))
check('Grafo desenha relações em SVG', contains('src/features/leads/account-relationship-graph.tsx', '<svg') && contains('src/features/leads/account-relationship-graph.tsx', 'relationshipTypeLabels'))
check('Grafo oferece zoom e fit view', contains('src/features/leads/account-relationship-graph.tsx', 'ZoomIn') && contains('src/features/leads/account-relationship-graph.tsx', 'fitView'))
check('Grafo oferece pan do canvas', contains('src/features/leads/account-relationship-graph.tsx', 'panDrag') && contains('src/features/leads/account-relationship-graph.tsx', 'setPan'))
check('Grafo oferece arraste de nodes', contains('src/features/leads/account-relationship-graph.tsx', 'onPointerMove={pointerMove}') && contains('src/features/leads/account-relationship-graph.tsx', 'setPointerCapture'))
check('Arraste não dispara edição acidental', contains('src/features/leads/account-relationship-graph.tsx', 'suppressClick'))
check('Grafo oferece gaps clicáveis do buying committee', contains('src/features/leads/account-relationship-graph.tsx', 'relationship-graph-gap') && contains('src/features/leads/account-relationship-graph.tsx', 'onAddRole'))

check('Propostas inicia em Cards', contains('src/features/proposals/proposals-page.tsx', "useState<'cards' | 'list'>('cards')"))
check('Workspace possui alternância Cards/Lista', contains('src/features/proposals/proposals-page.tsx', 'proposal-view-switch') || contains('src/features/proposals/proposals-page.tsx', 'WorkspaceDisplayMenu'))
check('Workspace possui KPIs comerciais', ['Em negociação', 'Aguardando resposta', 'Vencendo em 7 dias', 'Aceites para fechar'].every((value) => contains('src/features/proposals/proposals-page.tsx', value)))
check('Abrir proposta usa Proposal 360', contains('src/features/proposals/proposals-page.tsx', '<Proposal360Modal'))
check('Proposal 360 possui linha do tempo e stakeholders', contains('src/features/proposals/proposal-360-modal.tsx', 'Linha do tempo') && contains('src/features/proposals/proposal-360-modal.tsx', 'Stakeholders relacionados'))
check('Proposal 360 possui ações contextuais', ['Reconhecer receita', 'Fechar negócio', 'Revisar e enviar', 'Registrar visualização', 'Criar follow-up'].every((value) => contains('src/features/proposals/proposal-360-modal.tsx', value)))
check('Proposal 360 protege exclusão de alternativa', contains('src/features/proposals/proposal-360-modal.tsx', 'Excluir alternativa'))
check('Editor de proposta usa wizard em 4 etapas', ['Cliente', 'Itens e preço', 'Condições', 'Revisar e salvar'].every((value) => contains('src/features/proposals/proposals-page.tsx', value)))
check('Follow-up de proposta cria atividade real', contains('src/features/proposals/proposals-page.tsx', 'createProposalFollowup') && contains('src/features/proposals/proposals-page.tsx', "type: 'followup'"))

check('CSS de Leads está carregado por rota', contains('src/features/leads/leads-page.tsx', "../../styles/lead-experience-v10060.css"))
check('CSS de Propostas está carregado por rota', contains('src/features/proposals/proposals-page.tsx', "../../styles/proposal-experience-v10060.css"))
check('CSS possui tratamento responsivo', contains('src/styles/lead-experience-v10060.css', '@media') && contains('src/styles/proposal-experience-v10060.css', '@media'))
check('Release não adicionou dependência React Flow', !('@xyflow/react' in (packageJson.dependencies ?? {})) && !('reactflow' in (packageJson.dependencies ?? {})))
check('Migrações históricas preservadas e extensíveis', fs.readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).length >= 35)
check('Notas da V100.60.0 existem', fs.existsSync(path.join(root, 'RELEASE_NOTES_V100.60.0.md')))

const failed = checks.filter((item) => !item.ok)
for (const item of checks) console.log(`${item.ok ? 'OK ' : 'FAIL'} ${item.label}`)
console.log(`\nV100.60 Sales Experience Audit: ${checks.length - failed.length}/${checks.length} contratos aprovados.`)
if (failed.length) {
  console.error(`Falharam: ${failed.map((item) => item.label).join('; ')}`)
  process.exit(1)
}
