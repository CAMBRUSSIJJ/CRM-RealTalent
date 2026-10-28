export interface AgentConversationTurn { user: string; assistant: string }

const MAX_TURNS = 16
const clipped = (value: unknown, max: number, multiline = false) => String(value ?? '')
  .replace(/\r/g, '').replace(/\t/g, ' ')
  .replace(multiline ? /[ ]+/g : /\n+/g, ' ')
  .replace(/\n{3,}/g, '\n\n').trim().slice(0, max)

// Transient workspace-scoped context (sessionStorage only). Not a durable CRM memory.
export function appendAgentConversationTurn(history: AgentConversationTurn[], user: string, assistant: string): AgentConversationTurn[] {
  const cleanUser = clipped(user, 360)
  const cleanAssistant = clipped(assistant, 2600, true)
  if (!cleanUser || !cleanAssistant) return history.slice(-MAX_TURNS)
  return [...history.slice(-MAX_TURNS + 1), { user: cleanUser, assistant: cleanAssistant }]
}

export function parseAgentConversationTurns(raw: unknown): AgentConversationTurn[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((row): row is AgentConversationTurn => Boolean(row) && typeof row.user === 'string' && typeof row.assistant === 'string')
    .slice(-MAX_TURNS)
    .map((row) => ({ user: clipped(row.user, 360), assistant: clipped(row.assistant, 2600, true) }))
    .filter((row) => Boolean(row.user && row.assistant))
}

export function formatAgentConversationContext(history: AgentConversationTurn[], previousPrompt = '', previousAnswer = ''): string {
  const turns = parseAgentConversationTurns(history)
  const effective = turns.length ? turns : previousPrompt && previousAnswer
    ? appendAgentConversationTurn([], previousPrompt, previousAnswer) : []
  return effective.map((turn) => `Usuário: ${turn.user}\nRealTalent: ${turn.assistant}`).join('\n').slice(-4800)
}
