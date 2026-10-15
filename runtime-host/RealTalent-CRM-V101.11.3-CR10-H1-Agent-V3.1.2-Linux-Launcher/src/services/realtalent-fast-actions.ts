export type FastActionIntent = 'create_task' | 'create_followups' | 'complete_task' | null

export interface FastActionTaskCandidate {
  id: string
  title: string
  status: string
  dueAt?: string | null
  assigneeId?: string | null
  teamId?: string | null
}

export interface FastActionParseResult {
  intent: FastActionIntent
  title: string | null
  dueAt: string | null
  taskId: string | null
  taskTitle: string | null
  priority: 'low' | 'normal' | 'high' | 'urgent'
  contactQuery: string | null
  assigneeQuery: string | null
  assignToCurrentUser: boolean
  explicitTime: boolean
  taskType: 'call' | 'generic'
  missing: Array<'title' | 'dueAt' | 'task'>
}

const normalize = (value: string) => value
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[“”"']/g, ' ').replace(/\s+/g, ' ').trim()

const containsAny = (value: string, terms: string[]) => terms.some((term) => value.includes(term))

const hasDateSignal = (query: string) => /\b(hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/.test(query)
  || /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(query)
  || /\b(?:as|a)\s*\d{1,2}(?::\d{2})?\s*h?\b/.test(query)

const hasExplicitTimeSignal = (query: string) => /\b(?:as|a)\s*\d{1,2}(?::\d{2})?\s*h?\b/.test(query)
  || /\b\d{1,2}:\d{2}\b/.test(query)

export const detectFastActionIntent = (raw: string): FastActionIntent => {
  const query = normalize(raw)
  if (!query) return null
  if (containsAny(query, [
    'conclua a tarefa', 'concluir a tarefa', 'concluir tarefa', 'finalize a tarefa', 'finalizar a tarefa',
    'marque a tarefa', 'marca a tarefa', 'tarefa como concluida', 'tarefa como feita', 'dar baixa na tarefa',
  ])) return 'complete_task'
  if (containsAny(query, [
    'crie um follow', 'crie follow', 'criar follow', 'cria follow', 'agende um follow', 'agende follow',
    'agenda follow', 'marque um follow', 'follow-up para', 'follow up para',
  ])) return 'create_followups'
  if (containsAny(query, [
    'crie uma tarefa', 'criar uma tarefa', 'criar tarefa', 'cria uma tarefa', 'cria tarefa',
    'adicione uma tarefa', 'adicionar uma tarefa', 'adicione tarefa', 'marca uma tarefa', 'marque uma tarefa',
    'me lembra de', 'me lembre de', 'lembre-me de', 'lembra de', 'nova tarefa', 'quero fazer a tarefa', 'quero criar uma tarefa', 'fazer uma tarefa',
  ])) return 'create_task'

  // Natural action bridge: the seller should not need to say the word "tarefa".
  // Commands such as "crie ligar para Camila amanhã às 14:30" are task creation.
  const commandVerb = /\b(crie|cria|criar|adicione|adiciona|adicionar|agende|agenda|agendar|marque|marca|marcar|coloque|coloca|colocar)\b/.test(query)
  const actionableVerb = /\b(ligar|telefone|telefonar|retornar|retorno|falar|contatar|contactar|enviar|mandar|revisar|cobrar|lembrar|preparar)\b/.test(query)
  if (commandVerb && actionableVerb && hasDateSignal(query)) return 'create_task'
  return null
}

const nextWeekday = (from: Date, targetDay: number) => {
  const due = new Date(from)
  let diff = (targetDay - due.getDay() + 7) % 7
  if (diff === 0) diff = 7
  due.setDate(due.getDate() + diff)
  due.setHours(9, 0, 0, 0)
  return due
}

const parseDueAt = (raw: string, now: Date): string | null => {
  const query = normalize(raw)
  if (!hasDateSignal(query)) return null
  let due = new Date(now)
  if (query.includes('amanha')) {
    due.setDate(due.getDate() + 1)
    due.setHours(9, 0, 0, 0)
  } else if (query.includes('hoje')) {
    due.setHours(Math.max(due.getHours() + 1, 9), 0, 0, 0)
  } else {
    const weekdays: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 }
    const weekday = Object.keys(weekdays).find((name) => query.includes(name))
    if (weekday) due = nextWeekday(now, weekdays[weekday])
    const dateMatch = query.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/)
    if (dateMatch) {
      const yearRaw = dateMatch[3] ? Number(dateMatch[3]) : now.getFullYear()
      const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw
      const candidate = new Date(year, Number(dateMatch[2]) - 1, Number(dateMatch[1]), 9, 0, 0, 0)
      if (Number.isFinite(candidate.getTime())) due = candidate
    }
  }
  const hourMatch = query.match(/\b(?:as|a)\s*(\d{1,2})(?::(\d{2}))?\s*h?\b/) ?? query.match(/\b(\d{1,2}):(\d{2})\b/)
  if (hourMatch) due.setHours(Math.min(23, Number(hourMatch[1])), Math.min(59, Number(hourMatch[2] ?? 0)), 0, 0)
  return due.toISOString()
}

const stripScheduling = (raw: string) => raw
  .replace(/(?:^|\s)(?:hoje|amanhã|amanha|segunda(?:-feira)?|terça(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sábado|sabado|domingo)(?=\s|$|[,.!?])/gi, ' ')
  .replace(/\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?/g, ' ')
  .replace(/(?:às|as|a)\s*\d{1,2}(?::\d{2})?\s*h?/gi, ' ')
  .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
  .replace(/\s+/g, ' ').trim()

const stripAssigneeClause = (raw: string) => raw
  .replace(/\b(?:eu\s+que\s+vou|eu\s+vou)\s+(?:fazer|ligar|executar|realizar)?\b.*$/i, ' ')
  .replace(/\bquem\s+vai\s+(?:fazer|ligar|executar|realizar)(?:\s+é|\s+eh)?\s+(?:o\s+|a\s+)?[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]*$/i, ' ')
  .replace(/\brespons[aá]vel(?:\s+ser[aá])?\s*(?:é|eh|:)?\s*(?:o\s+|a\s+)?[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]*$/i, ' ')
  .trim()

const extractContactQuery = (raw: string): string | null => {
  const clean = stripAssigneeClause(raw)
  const match = clean.match(/\b(?:ligar|telefonar|retornar|falar|contatar|contactar)\s+(?:para|pra|com|a)\s+(.+?)(?=\s+(?:hoje|amanhã|amanha|segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo|às|as\s+\d|a\s+\d)|[,.;!?]|$)/i)
  if (!match?.[1]) return null
  const candidate = match[1].replace(/\b(?:eu|quem|respons[aá]vel)\b.*$/i, '').replace(/^(?:o|a)\s+/i, '').trim()
  return candidate || null
}

const extractAssignee = (raw: string): { query: string | null; current: boolean } => {
  const normalized = normalize(raw)
  if (/\b(eu que vou|eu vou)\b/.test(normalized) || /\bpara mim\b/.test(normalized)) return { query: null, current: true }
  const explicit = raw.match(/\brespons[aá]vel(?:\s+ser[aá])?\s*(?:é|eh|:)?\s*(?:o\s+|a\s+)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,60}?)(?=\s+(?:hoje|amanhã|amanha|às|as\s+\d|a\s+\d)|[,.;!?]|$)/i)
    ?? raw.match(/\bquem\s+vai\s+(?:fazer|ligar|executar|realizar)(?:\s+é|\s+eh)?\s+(?:o\s+|a\s+)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,60}?)(?=\s+(?:hoje|amanhã|amanha|às|as\s+\d|a\s+\d)|[,.;!?]|$)/i)
  return { query: explicit?.[1]?.trim() || null, current: false }
}

const extractTaskTitle = (raw: string, contactQuery: string | null): string | null => {
  let value = stripAssigneeClause(stripScheduling(raw))
  value = value
    .replace(/^\s*(?:por favor[, ]*)?(?:voce |você )?(?:consegue |pode |poderia )?/i, '')
    .replace(/^\s*(?:quero\s+(?:fazer|criar)\s+(?:uma\s+)?tarefa|fazer\s+(?:uma\s+)?tarefa)\s*/i, '')
    .replace(/^\s*(?:crie|cria|criar|adicione|adicionar|agende|agenda|agendar|marque|marca|marcar|coloque|coloca|colocar)\s+(?:uma\s+)?tarefa\s*/i, '')
    .replace(/^\s*(?:crie|cria|criar|adicione|adicionar|agende|agenda|agendar|marque|marca|marcar|coloque|coloca|colocar)\s+/i, '')
    .replace(/^\s*(?:me\s+)?(?:lembra|lembre)(?:-me)?\s+de\s+/i, '')
    .replace(/^\s*(?:para\s+mim[?.,!]*\s*)?(?:para\s+eu\s+)?/i, '')
    .replace(/[?.!,;:]+$/g, '')
    .trim()
  const normalized = normalize(value)
  if (!value || ['mim', 'para mim', 'uma', 'isso', 'algo'].includes(normalized)) return null
  if (/\bligar\b/i.test(value) && contactQuery) return `Ligar para ${contactQuery}`
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const priorityFromText = (raw: string): 'low' | 'normal' | 'high' | 'urgent' => {
  const query = normalize(raw)
  if (containsAny(query, ['urgente', 'agora', 'o quanto antes', 'prioridade maxima'])) return 'urgent'
  if (containsAny(query, ['prioridade alta', 'importante'])) return 'high'
  if (containsAny(query, ['prioridade baixa', 'sem pressa'])) return 'low'
  return 'normal'
}

const taskTokens = (value: string) => normalize(value).split(/[^a-z0-9]+/).filter((token) => token.length >= 3 && !['tarefa', 'concluir', 'conclua', 'finalizar', 'finalize', 'marque', 'como', 'feita', 'concluida'].includes(token))

const chooseTask = (raw: string, tasks: FastActionTaskCandidate[]) => {
  const open = tasks.filter((task) => !['completed', 'cancelled'].includes(task.status))
  if (!open.length) return null
  const tokens = taskTokens(raw)
  if (!tokens.length) return open.length === 1 ? open[0] : null
  const ranked = open.map((task) => {
    const haystack = normalize(task.title)
    const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0)
    return { task, score }
  }).sort((a, b) => b.score - a.score)
  if (!ranked[0] || ranked[0].score === 0) return null
  if (ranked[1] && ranked[0].score === ranked[1].score) return null
  return ranked[0].task
}

export const parseFastAction = (raw: string, now = new Date(), tasks: FastActionTaskCandidate[] = [], forcedIntent: FastActionIntent = null): FastActionParseResult => {
  const intent = forcedIntent ?? detectFastActionIntent(raw)
  const assignee = extractAssignee(raw)
  const contactQuery = extractContactQuery(raw)
  const base: FastActionParseResult = {
    intent, title: null, dueAt: null, taskId: null, taskTitle: null, priority: priorityFromText(raw),
    contactQuery, assigneeQuery: assignee.query, assignToCurrentUser: assignee.current,
    explicitTime: hasExplicitTimeSignal(normalize(raw)), taskType: /\b(ligar|telefonar|telefone)\b/.test(normalize(raw)) ? 'call' : 'generic', missing: [],
  }
  if (!intent) return base
  if (intent === 'create_task') {
    const title = extractTaskTitle(raw, contactQuery)
    const dueAt = parseDueAt(raw, now)
    return { ...base, title, dueAt, missing: [...(!title ? ['title' as const] : []), ...(!dueAt ? ['dueAt' as const] : [])] }
  }
  if (intent === 'create_followups') {
    const dueAt = parseDueAt(raw, now)
    return { ...base, dueAt, missing: dueAt ? [] : ['dueAt'] }
  }
  const task = chooseTask(raw, tasks)
  return { ...base, taskId: task?.id ?? null, taskTitle: task?.title ?? null, missing: task ? [] : ['task'] }
}
