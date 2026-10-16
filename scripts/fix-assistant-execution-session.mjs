import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const relative = 'src/features/assistant/assistant-drawer.tsx'
const file = path.resolve(root, relative)
let source = fs.readFileSync(file, 'utf8')

const replaceRequired = (from, to, label) => {
  if (source.includes(to)) return
  if (!source.includes(from)) throw new Error(`Não encontrei o anchor para ${label} em ${relative}.`)
  source = source.replace(from, to)
}

replaceRequired(
  "    setPendingCapability(null)\n  }, [sessionKey])",
  "    setPendingCapability(null)\n    setExecutedPlanId(null)\n  }, [sessionKey])",
  'reset do plano executado ao trocar sessão',
)

replaceRequired(
  "const parsed = JSON.parse(saved) as { answer?: AssistantAnswer | null; previousLeadIds?: string[]; lastUserPrompt?: string; pendingAction?: { kind: 'create_task' | 'create_followups' | 'complete_task'; seed: string } | null; pendingCapability?: CrmPendingCapability | null }",
  "const parsed = JSON.parse(saved) as { answer?: AssistantAnswer | null; previousLeadIds?: string[]; lastUserPrompt?: string; pendingAction?: { kind: 'create_task' | 'create_followups' | 'complete_task'; seed: string } | null; pendingCapability?: CrmPendingCapability | null; executedPlanId?: string | null }",
  'tipo da sessão do Agent',
)

replaceRequired(
  "        if (typeof parsed.lastUserPrompt === 'string') setLastUserPrompt(parsed.lastUserPrompt)\n        if (parsed.pendingAction?.kind",
  "        if (typeof parsed.lastUserPrompt === 'string') setLastUserPrompt(parsed.lastUserPrompt)\n        if (typeof parsed.executedPlanId === 'string') setExecutedPlanId(parsed.executedPlanId)\n        if (parsed.pendingAction?.kind",
  'restauração do plano executado',
)

replaceRequired(
  "JSON.stringify({ answer, previousLeadIds, lastUserPrompt, pendingAction, pendingCapability })",
  "JSON.stringify({ answer, previousLeadIds, lastUserPrompt, pendingAction, pendingCapability, executedPlanId })",
  'persistência do plano executado',
)

replaceRequired(
  "[answer, previousLeadIds, lastUserPrompt, pendingAction, pendingCapability, sessionKey, sessionRestored]",
  "[answer, previousLeadIds, lastUserPrompt, pendingAction, pendingCapability, executedPlanId, sessionKey, sessionRestored]",
  'dependências da persistência de sessão',
)

replaceRequired(
  "    const effectivePrompt = pendingCapability\n      ? continuationPrompt(pendingCapability, userPrompt)\n      : pendingAction && !directAction ? `${pendingAction.seed} ${userPrompt}` : userPrompt",
  "    const effectivePrompt = pendingCapability\n      ? userPrompt\n      : pendingAction && !directAction ? `${pendingAction.seed} ${userPrompt}` : userPrompt",
  'resposta curta de slot pendente sem reescrever a fala do usuário',
)

source = source.replace(
  "import { continuationPrompt, type CrmPendingCapability } from '../../services/realtalent-crm-universal-slot-filling'",
  "import { type CrmPendingCapability } from '../../services/realtalent-crm-universal-slot-filling'",
)
source = source.replace(
  "import { continuationPrompt, type CrmPendingCapability } from '../../services/realtalent-crm-slot-filling'",
  "import { type CrmPendingCapability } from '../../services/realtalent-crm-slot-filling'",
)

fs.writeFileSync(file, source, 'utf8')
console.log('✓ Assistant: sessão persistente + resposta curta de slot pendente preservada literalmente.')
