// Semantic contract for the modern RealTalent communication workspace.
// Keep these checks tied to user-visible features, not old release comments or
// CSS classes removed by visual refactors. The launcher must still fail if a
// real WhatsApp chat panel or Pure Chat composer disappears.
export const COMMUNICATIONS_PAGE_REQUIREMENTS = Object.freeze([
  ['WhatsApp conversation panel', 'WhatsAppChatPanel'],
  ['Commercial actions outside chat', 'WhatsAppWorkToolbar'],
  ['Channel navigation', 'communications-central-v3__channels'],
  ['Conversation inbox', 'communications-central-v3__inbox'],
  ['Conversation thread', 'communications-central-v3__thread'],
  ['WhatsApp contact and group actions', 'communications-central-v3__create-tools'],
  ['Conversation filters', 'communications-central-v3__inbox-tabs'],
])

export const WHATSAPP_CHAT_REQUIREMENTS = Object.freeze([
  ['Pure Chat composer', 'whatsapp-chat__composer--pure'],
  ['Standalone chat layout', 'whatsapp-pure-chat'],
  ['WhatsApp connection management', 'WhatsAppConnectionCenter'],
])

export const DEPRECATED_CHAT_ACTIONS = Object.freeze([
  'Respostas rápidas',
  'Criar follow-up',
  'Salvar como nota',
])

export function assertCommunicationSourceLineage({ page, chat }) {
  if (typeof page !== 'string' || typeof chat !== 'string') {
    throw new Error('source de Comunicação inválido: arquivos de página ou chat ausentes.')
  }
  for (const [feature, token] of COMMUNICATIONS_PAGE_REQUIREMENTS) {
    if (!page.includes(token)) throw new Error(`source de Comunicação regrediu: ${feature} ausente (${token}).`)
  }
  for (const [feature, token] of WHATSAPP_CHAT_REQUIREMENTS) {
    if (!chat.includes(token)) throw new Error(`source de WhatsApp regrediu: ${feature} ausente (${token}).`)
  }
  for (const control of DEPRECATED_CHAT_ACTIONS) {
    if (chat.includes(control)) throw new Error(`source de WhatsApp regrediu: ação comercial antiga voltou ao chat (${control}).`)
  }
  return true
}
