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

patch('src/services/realtalent-crm-universal-slot-filling.ts', (source) => source.replace(
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
  return next
})

console.log('✓ RealTalent Universal CRM Control habilitado no workspace local.')
