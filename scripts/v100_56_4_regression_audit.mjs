import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const local = read('src/repositories/local-crm-repository.ts')
const supabase = read('src/repositories/supabase-crm-repository.ts')
const integrity = read('src/services/data-integrity.ts')
const migration = read('supabase/migrations/202609150001_v100_56_4_full_qa_data_consistency.sql')
const appVersion = read('src/lib/app-version.ts')
const versionMatch = appVersion.match(/APP_VERSION = '(\d+)\.(\d+)\.(\d+)'/)
const currentVersion = versionMatch ? versionMatch.slice(1).map(Number) : [0, 0, 0]
const atLeastV100564 = currentVersion[0] > 100 || (currentVersion[0] === 100 && (currentVersion[1] > 56 || (currentVersion[1] === 56 && currentVersion[2] >= 4)))

const checks = [
  ['versão inclui ou sucede o hardening V100.56.4', atLeastV100564],
  ['deleção local protege histórico comercial', local.includes('assertLeadsCanBeDeleted') && local.includes('removeLeadDependencies')],
  ['mesclagem local migra propostas', /mergeLeads[\s\S]*db\.proposals/.test(local)],
  ['mesclagem local migra receita', /mergeLeads[\s\S]*db\.revenueEntries/.test(local)],
  ['sincronização local preserva cadastros mestres', !/function synchronizeStructureInDatabase[\s\S]{0,5000}db\.companies\s*=\s*db\.companies\.filter\([^\n]*leadIds\.length/.test(local)],
  ['agenda local valida intervalo', /createCalendarEvent[\s\S]{0,800}assertDateRange/.test(local)],
  ['propostas locais validam payload', local.includes('assertProposalValues(input)')],
  ['importação local evita IDs repetidos no lote', /importLeads[\s\S]*existing\.add\(/.test(local)],
  ['Supabase valida intervalo de agenda', /createCalendarEvent[\s\S]{0,500}assertDateRange/.test(supabase)],
  ['Supabase valida propostas antes do RPC', /createProposal[\s\S]{0,300}assertProposalPayload\(input\)/.test(supabase)],
  ['Supabase valida receita', /createRevenueEntry[\s\S]{0,800}assertDateOnlyRange/.test(supabase)],
  ['Supabase valida metas positivas', /createGoal[\s\S]{0,500}targetValue[\s\S]{0,200}maior que zero/.test(supabase)],
  ['migration protege referências entre workspaces', migration.includes('assert_workspace_references_v100564')],
  ['migration protege exclusão de histórico', migration.includes('protect_lead_history_v100564')],
  ['migration mescla dados comerciais', migration.includes('update public.sales_proposals set lead_id=p_primary_lead_id') && migration.includes('update public.revenue_entries set lead_id=p_primary_lead_id')],
  ['migration preserva empresa manual', !/create or replace function public\.sync_commercial_structure[\s\S]*delete from public\.companies c where c\.organization_id=p_organization_id and cardinality\(c\.lead_ids\)=0/.test(migration)],
  ['migration corrige owner_name inexistente', !migration.includes('v_lead.owner_name') && migration.includes('v_owner_name')],
  ['fechamento exige etapa ganha', migration.includes("Configure uma etapa marcada como ganha antes de fechar a oportunidade")],
  ['envio de proposta sincroniza oportunidade', /if p_status='sent'[\s\S]{0,1200}update public\.opportunities/.test(migration)],
  ['diagnóstico detecta proposta duplicada', integrity.includes('proposal_number') && integrity.includes('duplicate')],
  ['diagnóstico cobre receita e oportunidade', integrity.includes('revenueEntries') && integrity.includes('opportunities')],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [label, ok] of checks) console.log(`${ok ? 'OK' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`\nFalharam ${failed.length} de ${checks.length} contratos de regressão.`)
  process.exit(1)
}
console.log(`\nAuditoria V100.56.4 aprovada: ${checks.length}/${checks.length} contratos críticos.`)
