import type { Playbook, PlaybookExecutionMode } from '../domain/types'
import { graphExecutionOrder } from './playbook-conversation-graph'

export interface PlaybookExecutionStep {
  id: string
  order: number
  title: string
  content: string
  kind: 'content' | 'discovery' | 'objection' | 'success'
}

export const executionModeLabels: Record<PlaybookExecutionMode, string> = {
  step_by_step: 'Passo a passo',
  checklist: 'Checklist',
  call: 'Ligação',
  meeting: 'Reunião',
}

export function recommendedExecutionMode(playbook: Playbook): PlaybookExecutionMode {
  const explicit = playbook.guidance?.executionModes?.[0]
  if (explicit) return explicit
  if (playbook.kind === 'checklist') return 'checklist'
  if (playbook.kind === 'objection') return 'call'
  return 'step_by_step'
}

function cleanLines(values?: string[]) {
  return (values ?? []).map((item) => item.trim()).filter(Boolean)
}

export function derivePlaybookSteps(playbook: Playbook): PlaybookExecutionStep[] {
  const guidance = playbook.guidance ?? {}
  if (guidance.conversationGraph?.nodes?.length) {
    return graphExecutionOrder(guidance.conversationGraph)
      .filter((node) => node.type !== 'stage' && (node.content.trim() || node.title.trim()))
      .map((node, index) => ({
        id: node.id,
        order: index + 1,
        title: node.title,
        content: node.content || node.objective || node.title,
        kind: node.type === 'question' ? 'discovery' as const : node.type === 'objection' ? 'objection' as const : node.type === 'outcome' ? 'success' as const : 'content' as const,
      }))
  }
  const paragraphs = playbook.content
    .split(/\n\s*\n/g)
    .map((item) => item.trim())
    .filter(Boolean)
  const contentSteps = paragraphs.map((content, index) => ({
    id: `content-${index + 1}`,
    order: index + 1,
    title: paragraphs.length > 1 ? `Etapa ${index + 1}` : playbook.title,
    content,
    kind: 'content' as const,
  }))
  const discovery = cleanLines(guidance.discoveryQuestions).map((content, index) => ({
    id: `discovery-${index + 1}`,
    order: contentSteps.length + index + 1,
    title: `Discovery ${index + 1}`,
    content,
    kind: 'discovery' as const,
  }))
  const objections = cleanLines(guidance.objectionPrompts).map((content, index) => ({
    id: `objection-${index + 1}`,
    order: contentSteps.length + discovery.length + index + 1,
    title: `Objeção ${index + 1}`,
    content,
    kind: 'objection' as const,
  }))
  const success = cleanLines(guidance.successCriteria).map((content, index) => ({
    id: `success-${index + 1}`,
    order: contentSteps.length + discovery.length + objections.length + index + 1,
    title: `Critério de sucesso ${index + 1}`,
    content,
    kind: 'success' as const,
  }))
  return [...contentSteps, ...discovery, ...objections, ...success]
}

export function playbookExecutionCoverage(playbook: Playbook) {
  const guidance = playbook.guidance ?? {}
  const modes = guidance.executionModes?.length ?? 0
  const contextual = (guidance.stageIds?.length ?? 0) + (guidance.decisionRoles?.length ?? 0) + (guidance.segments?.length ?? 0) + (guidance.personas?.length ?? 0)
  const conversation = (guidance.discoveryQuestions?.length ?? 0) + (guidance.objectionPrompts?.length ?? 0) + (guidance.meetingAgenda?.length ?? 0)
  return { modes, contextual, conversation, ready: modes > 0 && (contextual > 0 || conversation > 0) }
}
