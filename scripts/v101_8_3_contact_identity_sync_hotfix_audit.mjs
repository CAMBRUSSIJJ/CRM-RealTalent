import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const exists = (file) => fs.existsSync(path.join(root, file))
const checks = []
const check = (label, ok) => checks.push({ label, ok: Boolean(ok) })

const pkg = JSON.parse(read('package.json'))
const core = read('src/repositories/local-repository-core.ts')
const local = read('src/repositories/local-crm-repository.ts')
const supabase = read('src/repositories/supabase-crm-repository.ts')
const tests = read('src/repositories/local-crm-repository.test.ts')
const migrationName = '202610010001_v101_8_3_hotfix1_contact_identity_sync.sql'
const migration = read(`supabase/migrations/${migrationName}`)
const launcher = ((read('start-linux.sh') + '\n' + (fs.existsSync('start-linux-legacy.sh') ? read('start-linux-legacy.sh') : '') + '\n' + (fs.existsSync('scripts/start.mjs') ? read('scripts/start.mjs') : '')) + '\n' + (exists?.('start-linux-legacy.sh') ? read('start-linux-legacy.sh') : '') + '\n' + (exists?.('scripts/start.mjs') ? read('scripts/start.mjs') : ''))

check('baseline V101.8.3-H1 permanece incorporada', (['101.9.0','101.9.1','101.9.2','101.9.3','101.9.4','101.9.5','101.9.6','101.9.7','101.9.8','101.9.9','101.10.0','101.10.1','101.10.2','101.10.3','101.10.4','101.10.5','101.10.6','101.10.7','101.10.8','101.10.9','101.11.0','101.11.1','101.11.2','101.11.3'].includes(pkg.version) || /^101\.8\.(3|4)$/.test(pkg.version)) && (['V101.9.0','V101.9.1','V101.9.2','V101.9.3','V101.9.4','V101.9.5','V101.9.6','V101.9.7','V101.9.8','V101.9.9','V101.10.0','V101.10.1','V101.10.2','V101.10.3','V101.10.4','V101.10.5','V101.10.6','V101.10.7','V101.10.8','V101.10.9','V101.11.0','V101.11.1','V101.11.2','V101.11.3'].includes(read('VERSION').trim()) || /^V101\.8\.(3|4)$/.test(read('VERSION').trim())))
check('reconciliação de identidade existe no core local', core.includes('reconcilePrimaryIdentity') && core.includes('syncLeadIdentityToPrimaryContact') && core.includes('syncContactIdentityToPrimaryLeads'))
check('reconciliação preserva dados estruturados e enriquece vazios', core.includes("contact.phone.trim() ? contact.phone : lead.phone") && core.includes("contact.decisionRole !== 'unknown'") && core.includes('contact.doNotContact || lead.doNotContact'))
check('Lead atualiza contato primário antes da estrutura', local.indexOf('syncLeadIdentityToPrimaryContact(db, next, input)') < local.indexOf('synchronizeStructureInDatabase(db, current.workspaceId)'))
check('ContactRecord atualiza somente leads primários', local.includes('syncContactIdentityToPrimaryLeads(db, next, input)') && core.includes('lead.primaryContactId !== contact.id'))
check('bulk update preserva paridade de identidade', local.includes('syncLeadIdentityToPrimaryContact(db, lead, input)') && local.includes('synchronizeStructureInDatabase(db, workspaceId)'))
check('merge preserva identidade consolidada', local.includes('syncLeadIdentityToPrimaryContact(db, merged)'))
check('e-mail de contato é normalizado no modo local', local.includes("email: input.email.trim().toLocaleLowerCase('pt-BR')"))
check('Supabase sincroniza Lead → ContactRecord', supabase.includes('contactIdentityPayloadFromLead') && supabase.includes('contactSyncError'))
check('Supabase sincroniza ContactRecord → Lead', supabase.includes('leadIdentityPayloadFromContact') && supabase.includes('leadSyncError'))
check('migration de reparo existe', exists(`supabase/migrations/${migrationName}`) && migration.includes('Heal legacy divergence'))
check('migration enriquece vazios antes de eleger ContactRecord canônico', migration.includes('update public.contacts c') && migration.includes("c.decision_role = 'unknown'") && migration.includes('do_not_contact = c.do_not_contact or exists'))
check('triggers bidirecionais possuem guarda de recursão', migration.includes('leads_primary_contact_identity_sync') && migration.includes('contacts_primary_lead_identity_sync') && (migration.match(/pg_trigger_depth\(\) > 1/g)?.length ?? 0) >= 2)
check('testes cobrem reparo, ida, volta e isolamento comercial', tests.includes('V101.8.3-H1 — identidade Lead ↔ ContactRecord') && tests.includes('fonte canônica') && tests.includes('propaga edição do Lead') && tests.includes('propaga edição do ContactRecord') && tests.includes('não mistura campos comerciais'))
check('hotfix possui release notes e documentação', exists('RELEASE_NOTES_V101.8.3-HOTFIX1.md') && exists('docs/V101.8.3-HOTFIX1-CONTACT-IDENTITY-SYNC.md'))
check('QA do hotfix está registrado no gate', pkg.scripts['qa:v101.8.3:identity-sync'] === 'node scripts/v101_8_3_contact_identity_sync_hotfix_audit.mjs' && String(pkg.scripts['check:legacy']).includes('qa:v101.8.3:identity-sync'))
check('launcher preserva identidade sync e Connect One-Tap na release atual', (launcher.includes(`RealTalent CRM V${pkg.version}`) || launcher.includes(`const RELEASE = '${pkg.version}'`)) && launcher.includes('Contact Identity Sync') && launcher.includes('Connect One-Tap para iPhone'))

for (const item of checks) console.log(`${item.ok ? 'OK' : 'FAIL'}  ${item.label}`)
const failed = checks.filter((item) => !item.ok)
if (failed.length) {
  console.error(`\nV101.8.3-H1 Contact Identity Sync falhou: ${checks.length - failed.length}/${checks.length}.`)
  for (const item of failed) console.error(`- ${item.label}`)
  process.exit(1)
}
console.log(`\nV101.8.3-H1 Contact Identity Sync: ${checks.length}/${checks.length} contratos aprovados.`)
