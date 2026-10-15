import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const patch = (relative, transform) => {
  const file = path.resolve(root, relative)
  const before = fs.readFileSync(file, 'utf8')
  const after = transform(before)
  if (after === before) return false
  fs.writeFileSync(file, after, 'utf8')
  console.log(`✓ Universal Agent: ${relative}`)
  return true
}

patch('src/services/realtalent-crm-capability-runtime-client.ts', (source) => source.replace(
  "from './realtalent-crm-universal-capabilities'",
  "from './realtalent-crm-universal-registry'",
))

patch('src/features/assistant/assistant-drawer.tsx', (source) => source.replace(
  "from '../../services/realtalent-crm-capability-executor'",
  "from '../../services/realtalent-crm-universal-executor'",
))

patch('src/services/realtalent-assistant-provider.ts', (source) => source.replace(
  "from './realtalent-crm-slot-filling'",
  "from './realtalent-crm-universal-slot-filling'",
))

patch('src/services/realtalent-crm-universal-executor.ts', (source) => {
  let next = source
  if (!next.includes('UNIVERSAL_ADMIN_CAPABILITIES')) {
    next = next.replace(
      "import { UNIVERSAL_EXTRA_CAPABILITIES } from './realtalent-crm-universal-capabilities'",
      "import { UNIVERSAL_EXTRA_CAPABILITIES } from './realtalent-crm-universal-capabilities'\nimport { UNIVERSAL_ADMIN_CAPABILITIES } from './realtalent-crm-universal-registry'",
    )
    next = next.replace(
      "import { executeUniversalContacts } from './realtalent-crm-universal-executor-contacts'",
      "import { executeUniversalContacts } from './realtalent-crm-universal-executor-contacts'\nimport { executeUniversalAdmin } from './realtalent-crm-universal-executor-admin'",
    )
    next = next.replace(
      "const EXTRA_IDS = new Set(UNIVERSAL_EXTRA_CAPABILITIES.filter((item) => item.execution === 'native').map((item) => item.id))",
      "const EXTRA_IDS = new Set([...UNIVERSAL_EXTRA_CAPABILITIES, ...UNIVERSAL_ADMIN_CAPABILITIES].filter((item) => item.execution === 'native').map((item) => item.id))",
    )
    next = next.replace(
      "  const adminResult = await executeAutomationAndWorkspace(step, runtime); if (adminResult) return adminResult\n  throw new Error",
      "  const adminResult = await executeAutomationAndWorkspace(step, runtime); if (adminResult) return adminResult\n  const extendedAdminResult = await executeUniversalAdmin(step, runtime); if (extendedAdminResult) return extendedAdminResult\n  throw new Error",
    )
  }
  return next
})

patch('src/services/realtalent-crm-execution-truth.ts', (source) => {
  let next = source
  const collectionAnchor = "const collectionForCapability = (snapshot: WorkspaceSnapshot, capabilityId: string): Array<{ id: string; [key: string]: unknown }> | null => {\n"
  if (next.includes(collectionAnchor) && !next.includes("capabilityId.startsWith('contacts.relationship_')")) {
    next = next.replace(collectionAnchor, `${collectionAnchor}  if (capabilityId.startsWith('contacts.relationship_')) return snapshot.contactRelationships as any[]\n  if (capabilityId.startsWith('buyer_rooms.')) return (snapshot.buyerRooms ?? []) as any[]\n  if (capabilityId.startsWith('cadences.')) return snapshot.activities as any[]\n`)
  }

  const slicesAnchor = "export const executionTruthSlicesForCapability = (capabilityId: string): SnapshotSlice[] => {\n"
  if (next.includes(slicesAnchor) && !next.includes("if (capabilityId.startsWith('buyer_rooms.')) return ['proposals', 'buyerRooms']")) {
    next = next.replace(slicesAnchor, `${slicesAnchor}  if (capabilityId.startsWith('contacts.relationship_')) return ['commercial']\n  if (capabilityId.startsWith('cadences.')) return ['commercial', 'activities']\n  if (capabilityId.startsWith('buyer_rooms.')) return ['proposals', 'buyerRooms']\n  if (capabilityId === 'calls.register_outcome') return ['commercial', 'calls', 'activities', 'events']\n  if (capabilityId === 'workspace.sync_structure') return ['commercial']\n  if (capabilityId === 'workspace.clear_operational_data') return ['commercial','stages','activities','calls','events','playbooks','products','proposals','buyerRooms','revenue','goals','automationRules','automationRuns']\n`)
  }

  const verifyAnchor = "  if (step.capabilityId === 'prospecting.send_to_crm' && after.leads.length > before.leads.length) {\n    base.status = 'verified'; base.checks.push('Novos registros comerciais foram relidos após a conversão do Garimpo.'); return base\n  }\n"
  if (next.includes(verifyAnchor) && !next.includes('Universal CRM readback confirmou')) {
    const universalVerification = `\n  // Universal CRM Control — mutation-specific readback.\n  if (step.capabilityId === 'contacts.relationship_create' && familyCreated(before, after, step.capabilityId)) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a nova relação entre contatos.'); return base }\n  if (step.capabilityId === 'contacts.relationship_update' && familyChanged(before, after, step.capabilityId)) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a alteração da relação entre contatos.'); return base }\n  if (step.capabilityId === 'contacts.relationship_delete' && familyDeleted(before, after, step.capabilityId)) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a remoção da relação entre contatos.'); return base }\n  if (['leads.bulk_move','leads.bulk_update','leads.reclassify','leads.bulk_tag','leads.merge'].includes(step.capabilityId) && JSON.stringify(before.leads) !== JSON.stringify(after.leads)) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou alteração efetiva nos leads.'); return base }\n  if (step.capabilityId === 'leads.bulk_delete' && after.leads.length < before.leads.length) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a exclusão em lote.'); return base }\n  if (step.capabilityId === 'activities.register_outcome' && JSON.stringify(before.activities) !== JSON.stringify(after.activities)) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou o resultado da atividade.'); return base }\n  if (step.capabilityId === 'cadences.create' && after.activities.length > before.activities.length) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a criação da cadência.'); return base }\n  if (step.capabilityId === 'cadences.update_state' && JSON.stringify(before.activities) !== JSON.stringify(after.activities)) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a mudança de estado da cadência.'); return base }\n  if (step.capabilityId === 'calls.register_outcome' && after.calls.length > before.calls.length) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou o novo registro de ligação.'); return base }\n  if (step.capabilityId === 'proposals.create_revision' && after.proposals.length > before.proposals.length) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a nova revisão da proposta.'); return base }\n  if (step.capabilityId === 'catalog.reconcile_proposal_items' && JSON.stringify(before.proposals) !== JSON.stringify(after.proposals)) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a reconciliação dos itens da proposta.'); return base }\n  if (step.capabilityId === 'automations.undo_run' && JSON.stringify(before.automationRuns) !== JSON.stringify(after.automationRuns)) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou o undo da automação.'); return base }\n  if (step.capabilityId === 'workspace.select' && before.workspace.id !== after.workspace.id) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a troca de workspace.'); return base }\n  if (step.capabilityId === 'workspace.sync_structure' && (JSON.stringify(before.companies) !== JSON.stringify(after.companies) || JSON.stringify(before.contacts) !== JSON.stringify(after.contacts) || JSON.stringify(before.opportunities) !== JSON.stringify(after.opportunities))) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a sincronização da estrutura comercial.'); return base }\n  if (step.capabilityId === 'workspace.clear_operational_data') { const beforeCount = before.leads.length + before.activities.length + before.calls.length + before.events.length + before.proposals.length + before.goals.length; const afterCount = after.leads.length + after.activities.length + after.calls.length + after.events.length + after.proposals.length + after.goals.length; if (afterCount < beforeCount) { base.status = 'verified'; base.checks.push('Universal CRM readback confirmou a limpeza dos dados operacionais.'); return base } }\n`
    next = next.replace(verifyAnchor, `${verifyAnchor}${universalVerification}`)
  }
  return next
})

console.log('✓ RealTalent Universal CRM Control habilitado no workspace local.')
