import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const exists = (file) => fs.existsSync(path.join(root, file))
const checks = []
const check = (label, ok) => checks.push({ label, ok: Boolean(ok) })

const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const version = read('src/lib/app-version.ts')
const health = JSON.parse(read('public/health.json'))
const page = read('src/features/proposals/proposals-page.tsx')
const pipelineService = read('src/services/proposal-pipeline.ts')
const context = read('src/app/app-context.tsx')
const css = read('src/styles/proposals-v10078.css')
const audit = read('src/services/functional-capability-audit.ts')
const map = read('src/features/commercial-map/commercial-map-page.tsx')

const TARGET_VERSION = '100.78.0'
const atLeastTarget = (() => {
  const current = pkg.version.split('.').map(Number)
  const target = TARGET_VERSION.split('.').map(Number)
  for (let index = 0; index < Math.max(current.length, target.length); index += 1) {
    const left = current[index] ?? 0
    const right = target[index] ?? 0
    if (left !== right) return left > right
  }
  return true
})()

check('versão inclui ou sucede 100.78.0', atLeastTarget && version.includes(`APP_VERSION = '${pkg.version}'`))
check('package-lock acompanha versão', lock.version === pkg.version && lock.packages?.['']?.version === pkg.version)
check('VERSION acompanha pacote', read('VERSION').trim() === `V${pkg.version}`)
check('backup schema preservado', version.includes("BACKUP_SCHEMA_VERSION = '100.54'"))
check('health acompanha pacote', health.version === pkg.version)
check('bridge do Território acompanha pacote', map.includes('version: APP_VERSION'))
check('serviço reconhece etapa Proposta', pipelineService.includes('isProposalPipelineStage') && pipelineService.includes("'proposta'") && pipelineService.includes("'orcamento'"))
check('etapas ganhas/perdidas não contam como Proposta', pipelineService.includes('stage.isWon || stage.isLost'))
check('workspace filtra propostas por Pipeline', page.includes('pipelineProposalLeadIds.has(proposal.leadId)'))
check('somente leads ativos entram na fila de Propostas', page.includes("lead.status === 'active' && proposalStageIds.has(lead.stageId)"))
check('hero explica sincronização', (page.includes('sincronizado com Pipeline') && page.includes('Criar uma proposta move o negócio')) || ((page.includes('workspace-page-header-v10166 proposals-page-header-v10166') || page.includes('WorkspacePageHeader')) && page.includes('vinculadas ao Pipeline')))
check('criação bloqueia sem etapa Proposta', page.includes('disabled={!canWrite || !proposalStages.length}'))
check('alerta de etapa ausente existe', page.includes('Etapa de Proposta não encontrada no Pipeline'))
check('criação exige e move lead para etapa Proposta', context.includes('Configure uma etapa de Proposta no Pipeline antes de criar propostas.') && context.includes('repository.moveLead(lead.id, proposalStage.id)'))
check('mudança automática dispara stage_changed', context.includes("triggerType: 'stage_changed'") && context.includes('proposalStage.id'))
check('falha ao criar proposta tenta restaurar etapa anterior', context.includes('repository.moveLead(lead.id, lead.stageId).catch'))
check('seletor de proposta prioriza etapa Proposta', page.includes('proposalPipelineStageIds(snapshot?.stages ?? [])'))
check('catálogo possui busca', page.includes('productQuery') && page.includes('Buscar produto, SKU'))
check('catálogo possui filtro de categoria', page.includes('productCategory') && page.includes('Todas as categorias'))
check('catálogo possui filtro de status', page.includes('productStatus') && page.includes('Somente inativos'))
check('catálogo permite disponibilidade no editor', page.includes('Disponível no catálogo') && page.includes('setActive'))
check('catálogo permite editar', page.includes('<FilePenLine size={14}/> Editar'))
check('catálogo permite duplicar', page.includes('duplicateProduct') && page.includes('<CopyPlus size={14}/> Duplicar'))
check('cópia nasce inativa', page.includes('active: false'))
check('catálogo permite ativar/desativar', page.includes("product.active ? 'Desativar' : 'Ativar'") || (page.includes('setLifecycle') && page.includes('Ativo no catálogo') && page.includes('Arquivado')))
check('catálogo mostra uso em propostas', page.includes('productUsageCount') && (page.includes('Usado em ${usageCount} proposta(s)') || page.includes('propostas vigentes') || (page.includes('historicalUsage') && page.includes('usos históricos'))))
check('exclusão usada é bloqueada na UI', page.includes('disabled={!canWrite || usageCount > 0}') || page.includes('disabled={!canWrite || historicalUsage > 0}'))
check('layout específico importado', page.includes("../../styles/proposals-v10078.css") || (read('src/main.tsx').includes("./styles/proposals-workspace.css") && read('src/styles/proposals-workspace.css').includes('V100.78')))
check('CSS possui catálogo responsivo', css.includes('.catalog-toolbar') && css.includes('.product-grid--v10078') && css.includes('@media(max-width:720px)'))
check('CSS padroniza cards de proposta', css.includes('.proposal-work-card:hover') && css.includes('.proposal-table-wrap'))
check('auditoria funcional de Propostas atualizada', audit.includes('workspace operacional agora é sincronizado com a etapa de Proposta do Pipeline'))
check('auditoria funcional de Catálogo atualizada', audit.includes('busca, filtros, duplicação, ativação/desativação'))
check('sem migration V100.78', !fs.readdirSync(path.join(root, 'supabase/migrations')).some((name) => /100[_-]?78/i.test(name)))
check('release notes existem', exists('RELEASE_NOTES_V100.78.0.md'))
check('documentação existe', exists('docs/V100.78.0-PROPOSTAS-CATALOGO-2.0.md'))
check('npm check inclui V100.78', String(pkg.scripts['check:legacy']).includes('qa:v100.78.0'))

const failed = checks.filter((item) => !item.ok)
for (const item of checks) console.log(`${item.ok ? '✓' : '✗'} ${item.label}`)
if (failed.length) {
  console.error(`\nV100.78.0 Propostas + Catálogo audit falhou: ${checks.length - failed.length}/${checks.length}.`)
  process.exit(1)
}
console.log(`\nV100.78.0 Propostas + Catálogo 2.0: ${checks.length}/${checks.length} contratos aprovados.`)
