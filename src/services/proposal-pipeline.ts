import type { ForecastCategory, PipelineStage } from '../domain/types'

const normalizeStageName = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()

const PROPOSAL_STAGE_TOKENS = ['proposta', 'proposal', 'orcamento', 'quote']

export const isProposalPipelineStage = (stage: PipelineStage) => {
  if (stage.isWon || stage.isLost) return false
  const normalized = normalizeStageName(stage.name)
  return PROPOSAL_STAGE_TOKENS.some((token) => normalized.includes(token))
}

export const proposalPipelineStages = (stages: PipelineStage[]) => stages
  .filter(isProposalPipelineStage)
  .sort((a, b) => a.order - b.order)

export const primaryProposalPipelineStage = (stages: PipelineStage[]) => proposalPipelineStages(stages)[0] ?? null

export const proposalPipelineStageIds = (stages: PipelineStage[]) => new Set(proposalPipelineStages(stages).map((stage) => stage.id))


export const resolveProposalInitialLeadId = (proposalLeadId: string | null | undefined, initialLeadId: string | null | undefined, fallbackLeadId: string | null | undefined) => proposalLeadId || initialLeadId || fallbackLeadId || ''

export interface ProposalStepOneValidationInput {
  leadId: string
  availableLeadIds: Iterable<string>
  title: string
  forecastCategory: ForecastCategory
  probability: string | number
}

export const validateProposalStepOne = (input: ProposalStepOneValidationInput) => {
  const leadIds = input.availableLeadIds instanceof Set ? input.availableLeadIds : new Set(input.availableLeadIds)
  const selectedLeadExists = Boolean(input.leadId && leadIds.has(input.leadId))
  const probability = Number(input.probability)
  const validProbability = Number.isFinite(probability) && probability >= 0 && probability <= 100
  const validForecastCategory = ['pipeline', 'best_case', 'commit', 'closed', 'omitted'].includes(input.forecastCategory)
  const valid = selectedLeadExists && Boolean(input.title.trim()) && validProbability && validForecastCategory
  const message = valid ? ''
    : !selectedLeadExists ? 'Selecione uma oportunidade ou contato válido.'
      : !input.title.trim() ? 'Informe um título para a proposta.'
        : !validProbability ? 'A probabilidade deve ficar entre 0% e 100%.'
          : !validForecastCategory ? 'Selecione uma categoria de forecast válida.' : 'Revise os campos obrigatórios.'
  return { valid, selectedLeadExists, validProbability, validForecastCategory, probability, message }
}
