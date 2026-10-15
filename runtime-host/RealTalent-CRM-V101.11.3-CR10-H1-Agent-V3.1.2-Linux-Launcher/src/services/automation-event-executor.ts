import type { ActivityItem, AutomationRule, AutomationRun, Lead, WorkspaceSnapshot } from '../domain/types'
import type { CrmRepository } from '../repositories/crm-repository'
import { automationCorrelationId, automationEventKey, automationLoopDetected, conditionMatches, ruleMatches, type AutomationEvent } from './automation-engine'
import { actionLabels, automationRunForLeadToday, describeAutomationAction, latestAutomationRunForLead, readAutomationGuard, validateAutomationRule, visibleAutomationConditions } from './automation-workspace'
import { recordContactDraft, recordSellerNotification } from './automation-operations'
import { dispatchAutomationWebhook } from './automation-webhooks'
import { enqueueWorkflowExecution, workflowControlCondition, workflowRuntimeRequired } from '../platform/workflows/workflow-runtime'
import { loadWorkspaceSnapshotSlicesById } from './snapshot-refresh'

export interface AutomationEventExecutorOptions {
  workspaceId: string | null
  repository: CrmRepository
  notify(type: 'success' | 'error' | 'info', message: string): void
  refreshData(): Promise<void>
}

export interface ExecuteAutomationEventOptions {
  ruleId?: string
  forceRule?: boolean
  refreshAfter?: boolean
  baseSnapshot?: WorkspaceSnapshot
}

/** Pure application-service factory: automation execution is no longer embedded in React context. */
export const createAutomationEventExecutor = ({ workspaceId, repository, notify, refreshData }: AutomationEventExecutorOptions) => async (
  event: AutomationEvent,
  options: ExecuteAutomationEventOptions = {},
) => {

    if (!workspaceId) return 0
    if (event.lead?.doNotContact) return 0
    const base = options.baseSnapshot ?? await loadWorkspaceSnapshotSlicesById(repository, workspaceId, ['commercial', 'stages', 'automationRules'])
    const candidates = options.ruleId ? base.automationRules.filter((rule) => rule.id === options.ruleId) : base.automationRules
    const rules = candidates.filter((rule) => options.forceRule
      ? rule.triggerType === event.triggerType && visibleAutomationConditions(rule.conditions).every((condition) => conditionMatches(condition, event))
      : ruleMatches(rule, event))
    let executed = 0
    for (const rule of rules) {
      const guard = readAutomationGuard(rule.conditions)
      const correlationId = automationCorrelationId(event)
      const durableEventKey = automationEventKey(rule.id, event)
      const validation = validateAutomationRule(rule, base.stages)
      const chainDepth = Math.max(0, Number(event.chainDepth ?? 0))
      const eventKey = options.forceRule
        ? `${automationEventKey(rule.id, event)}:manual:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`
        : durableEventKey
      const run = await repository.startAutomationRun({
        workspaceId: workspaceId, ruleId: rule.id, eventKey,
        input: {
          triggerType: event.triggerType, entityId: event.entityId, leadId: event.lead?.id ?? null,
          callOutcome: event.callOutcome ?? null, stageId: event.stageId ?? null, activityType: event.activityType ?? null,
          eventStatus: event.eventStatus ?? null, mode: guard.mode, correlationId, chainDepth, originRuleIds: event.originRuleIds ?? [],
        },
      })
      if (!run) continue
      const runStartedAt = Date.now()
      const preview = rule.actions.slice(0, guard.maxActionsPerRun).map((action) => describeAutomationAction(action, base.stages))
      const loopReason = automationLoopDetected(rule.id, event, guard.maxChainDepth)
      if (!options.forceRule && loopReason) {
        await repository.finishAutomationRun(run.id, 'success', {
          message: loopReason === 'rule_cycle' ? 'Execução bloqueada: a regra já participou desta cadeia.' : 'Execução bloqueada: profundidade máxima da cadeia atingida.',
          skippedReason: loopReason, actionPreview: preview, correlationId, chainDepth, durationMs: Date.now() - runStartedAt,
        })
        continue
      }
      if (validation.errors.length) {
        const message = validation.errors.join(' ')
        await repository.finishAutomationRun(run.id, 'failed', { message, actionPreview: preview, warnings: validation.warnings, correlationId, chainDepth, durationMs: Date.now() - runStartedAt }, message)
        continue
      }
      if (guard.mode === 'simulation' && !options.forceRule) {
        await repository.finishAutomationRun(run.id, 'success', {
          message: `Simulação concluída: ${preview.length} ação(ões) seriam executadas.`, simulated: true,
          actionPreview: preview, matchedLeadIds: event.lead ? [event.lead.id] : [], warnings: validation.warnings, correlationId, chainDepth, durationMs: Date.now() - runStartedAt,
        })
        executed += 1
        continue
      }
      if (event.lead) {
        const currentRuns = (await repository.listAutomationRuns(workspaceId)).filter((item) => item.id !== run.id)
        const loopWindowStart = Date.now() - guard.loopWindowMinutes * 60_000
        const repeatedInChain = currentRuns.some((item) => item.ruleId === rule.id && item.input.correlationId === correlationId && new Date(item.startedAt).getTime() >= loopWindowStart && item.status !== 'undone')
        if (!options.forceRule && repeatedInChain) {
          await repository.finishAutomationRun(run.id, 'success', {
            message: 'Execução ignorada pela janela anti-loop.', skippedReason: 'loop_window', actionPreview: preview,
            matchedLeadIds: [event.lead.id], warnings: validation.warnings, correlationId, chainDepth, durationMs: Date.now() - runStartedAt,
          })
          continue
        }
        const todayRuns = automationRunForLeadToday(currentRuns, rule.id, event.lead.id)
        if (!options.forceRule && todayRuns.length >= guard.maxRunsPerLeadPerDay) {
          await repository.finishAutomationRun(run.id, 'success', {
            message: 'Execução ignorada pelo limite diário de segurança.', skippedReason: 'daily_limit', actionPreview: preview,
            matchedLeadIds: [event.lead.id], warnings: validation.warnings, correlationId, chainDepth, durationMs: Date.now() - runStartedAt,
          })
          continue
        }
        const latest = latestAutomationRunForLead(currentRuns, rule.id, event.lead.id)
        if (!options.forceRule && latest && guard.cooldownHours > 0 && Date.now() - new Date(latest.startedAt).getTime() < guard.cooldownHours * 3_600_000) {
          await repository.finishAutomationRun(run.id, 'success', {
            message: 'Execução ignorada pelo intervalo de segurança.', skippedReason: 'cooldown', actionPreview: preview,
            matchedLeadIds: [event.lead.id], warnings: validation.warnings, correlationId, chainDepth, durationMs: Date.now() - runStartedAt,
          })
          continue
        }
      }
      if (!options.forceRule && repository.mode === 'supabase' && workflowRuntimeRequired(rule)) {
        try {
          await enqueueWorkflowExecution({
            workspaceId, rule, triggerType: event.triggerType, entityId: event.entityId, leadId: event.lead?.id ?? null,
            idempotencyKey: durableEventKey, correlationId,
            input: { triggerType: event.triggerType, entityId: event.entityId, leadId: event.lead?.id ?? null },
            context: { callOutcome: event.callOutcome ?? null, stageId: event.stageId ?? null, activityId: event.activityId ?? null, activityType: event.activityType ?? null, eventStatus: event.eventStatus ?? null, attemptCount: event.attemptCount ?? 0, chainDepth: event.chainDepth ?? 0, originRuleIds: event.originRuleIds ?? [] },
          })
          await repository.finishAutomationRun(run.id, 'success', {
            message: 'Workflow persistente enfileirado no Runtime 3.0.', actionPreview: preview, matchedLeadIds: event.lead ? [event.lead.id] : [],
            warnings: validation.warnings, correlationId, chainDepth, durationMs: Date.now() - runStartedAt,
          })
          executed += 1
        } catch (runtimeError) {
          const message = runtimeError instanceof Error ? runtimeError.message : 'Não foi possível iniciar o workflow persistente.'
          await repository.finishAutomationRun(run.id, 'failed', { message, actionPreview: preview, warnings: validation.warnings, correlationId, chainDepth, durationMs: Date.now() - runStartedAt }, message)
          notify('error', message)
        }
        continue
      }
      const mutations: NonNullable<AutomationRun['output']['mutations']> = []
      const warnings = [...validation.warnings]
      const actionMessages: string[] = []
      const webhookDeliveryIds: string[] = []
      const webhookRequests: string[] = []
      const workingActivities = await repository.listActivities(workspaceId)
      const workingEvents = await repository.listCalendarEvents(workspaceId)
      let currentLead = event.lead ? { ...event.lead, tags: [...event.lead.tags] } : null
      const dueFor = (action: AutomationRule['actions'][number]) => {
        const now = new Date()
        const due = new Date(now)
        due.setDate(due.getDate() + Math.max(0, Number(action.delayDays ?? 0)))
        due.setHours(due.getHours() + Math.max(0, Number(action.delayHours ?? 0)))
        due.setMinutes(0, 0, 0)
        if (due.getTime() <= now.getTime()) due.setHours(due.getHours() + 1)
        return due
      }
      const createActivityAction = async (type: ActivityItem['type'], title: string, dueAt: string | null, completedAt: string | null = null) => {
        const relatedLeadId = currentLead?.id ?? null
        const commercialNextAlreadyExists = event.triggerType === 'call_outcome' && ['call', 'followup'].includes(type)
          && workingActivities.some((activity) => activity.leadId === relatedLeadId && !activity.completedAt && activity.sourceId === `commercial:${event.entityId}:next`)
        if (commercialNextAlreadyExists) { actionMessages.push(`Próximo passo já criado pelo resultado da ligação: ${title}`); return null }
        const duplicate = guard.preventDuplicates && workingActivities.some((activity) => {
          if (activity.leadId !== relatedLeadId || activity.type !== type || activity.title.toLocaleLowerCase('pt-BR') !== title.toLocaleLowerCase('pt-BR')) return false
          if (completedAt) return Boolean(activity.completedAt)
          if (activity.completedAt) return false
          if (!dueAt || !activity.dueAt) return dueAt === activity.dueAt
          return new Date(activity.dueAt).toDateString() === new Date(dueAt).toDateString()
        })
        if (duplicate) { actionMessages.push(`Duplicidade evitada: ${title}`); return null }
        const activity = await repository.createActivity({
          workspaceId: workspaceId, leadId: relatedLeadId, type, title,
          description: `Criado pela automação “${rule.name}”.`, dueAt, completedAt, assignedTo: currentLead?.ownerId ?? null,
          sourceType: 'system', sourceId: run.id,
        })
        workingActivities.unshift(activity)
        mutations.push({ kind: 'activity_create', activityId: activity.id })
        actionMessages.push(title)
        return activity
      }
      const executeAction = async (action: AutomationRule['actions'][number]) => {
        const lead = currentLead
        if (!lead && !['internal_alert', 'create_note', 'send_webhook'].includes(action.type)) throw new Error('A automação exige um lead relacionado.')
        if (action.type === 'create_followup' || action.type === 'create_call') {
          const title = action.value.trim() || `${actionLabels[action.type]} — ${rule.name}`
          await createActivityAction(action.type === 'create_call' ? 'call' : 'followup', title, dueFor(action).toISOString())
        } else if (action.type === 'create_meeting') {
          const starts = dueFor(action); const ends = new Date(starts.getTime() + Math.max(15, Number(action.durationMinutes ?? 30)) * 60_000)
          const title = action.value.trim() || `Reunião — ${rule.name}`
          const commercialMeetingExists = event.triggerType === 'call_outcome' && workingEvents.some((item) => item.leadId === lead?.id && item.status !== 'cancelled' && item.description.includes(`[[CRM_COMMERCIAL_ACTION:${event.entityId}]]`))
          const duplicate = commercialMeetingExists || (guard.preventDuplicates && workingEvents.some((item) => item.leadId === lead?.id && item.status !== 'cancelled' && item.title.toLocaleLowerCase('pt-BR') === title.toLocaleLowerCase('pt-BR') && new Date(item.startsAt).toDateString() === starts.toDateString()))
          if (duplicate) { actionMessages.push(`Duplicidade evitada: ${title}`); return }
          const calendarEvent = await repository.createCalendarEvent({
            workspaceId: workspaceId, leadId: lead!.id, title, description: `Criado pela automação “${rule.name}”.`,
            startsAt: starts.toISOString(), endsAt: ends.toISOString(), allDay: false, location: '', status: 'tentative', assignedTo: lead!.ownerId,
          })
          workingEvents.unshift(calendarEvent); mutations.push({ kind: 'event_create', eventId: calendarEvent.id }); actionMessages.push(title)
        } else if (action.type === 'create_note') {
          await createActivityAction('note', action.value.trim() || `Nota automática — ${rule.name}`, null, new Date().toISOString())
        } else if (action.type === 'internal_alert') {
          const title = action.value.trim() || `Lead exige atenção — ${rule.name}`
          await recordSellerNotification({
            workspaceId: workspaceId, userId: lead?.ownerId ?? null, leadId: lead?.id ?? null, title,
            body: lead ? `${lead.name}${lead.company ? ` · ${lead.company}` : ''} está pronto para a próxima ação.` : 'A automação gerou um aviso operacional.',
            severity: 'warning', actionRoute: 'automations', sourceType: 'automation_run', sourceId: run.id,
          })
          await createActivityAction('followup', `Alerta interno — ${title}`, new Date().toISOString())
        } else if (action.type === 'assisted_whatsapp' || action.type === 'assisted_email') {
          const channel = action.type === 'assisted_whatsapp' ? 'WhatsApp' : 'e-mail'
          const firstName = lead!.name.trim().split(/\s+/)[0] || 'tudo bem'
          const defaultMessage = action.type === 'assisted_whatsapp'
            ? `Olá, ${firstName}! Tudo bem? Analisei ${lead!.company ? `a ${lead!.company}` : 'seu perfil'} e gostaria de conversar rapidamente sobre como podemos apoiar seu processo comercial. Posso te explicar em poucos minutos?`
            : `Olá, ${firstName}!\n\nAnalisei ${lead!.company ? `a ${lead!.company}` : 'seu perfil'} e identifiquei uma oportunidade de conversa sobre o processo comercial. Podemos marcar uma conversa rápida?\n\nAtenciosamente,\nEquipe RealTalent`
          const message = action.value.trim() || defaultMessage
          await recordContactDraft({
            workspaceId: workspaceId, leadId: lead!.id, channel: action.type === 'assisted_whatsapp' ? 'whatsapp' : 'email',
            subject: action.type === 'assisted_email' ? `Contato RealTalent — ${lead!.company || lead!.name}` : '', message,
            sourceType: 'automation_run', sourceId: run.id,
          })
          await createActivityAction('followup', `${channel} preparado — ${rule.name}`, new Date().toISOString())
        } else if (action.type === 'send_webhook') {
          webhookRequests.push(action.value)
          actionMessages.push('Webhook preparado para despacho após a confirmação da execução')
        } else if (action.type === 'add_tag' || action.type === 'remove_tag') {
          const before = { tags: [...lead!.tags] }
          const tag = action.value.trim(); if (!tag) throw new Error('A tag da automação está vazia.')
          const tags = action.type === 'add_tag' ? Array.from(new Set([...lead!.tags, tag])) : lead!.tags.filter((item) => item.toLocaleLowerCase('pt-BR') !== tag.toLocaleLowerCase('pt-BR'))
          currentLead = await repository.updateLead(lead!.id, { tags })
          mutations.push({ kind: 'lead_update', leadId: currentLead.id, before }); actionMessages.push(`${actionLabels[action.type]}: ${tag}`)
        } else if (action.type === 'set_priority') {
          const priority = action.value as Lead['priority']
          if (!['low', 'medium', 'high', 'urgent'].includes(priority)) throw new Error('Prioridade inválida na automação.')
          const before = { priority: lead!.priority }; currentLead = await repository.updateLead(lead!.id, { priority })
          mutations.push({ kind: 'lead_update', leadId: currentLead.id, before }); actionMessages.push(`Prioridade: ${priority}`)
        } else if (action.type === 'set_temperature') {
          const temperature = action.value as Lead['temperature']
          if (!['cold', 'warm', 'hot'].includes(temperature)) throw new Error('Temperatura inválida na automação.')
          const before = { temperature: lead!.temperature }; currentLead = await repository.updateLead(lead!.id, { temperature })
          mutations.push({ kind: 'lead_update', leadId: currentLead.id, before }); actionMessages.push(`Temperatura: ${temperature}`)
        } else if (action.type === 'assign_owner') {
          const ownerName = action.value.trim(); if (!ownerName) throw new Error('Informe o responsável da automação.')
          const ownerReference = base.leads.find((item) => item.ownerId && item.ownerName.toLocaleLowerCase('pt-BR') === ownerName.toLocaleLowerCase('pt-BR'))
          const before = { ownerId: lead!.ownerId, ownerName: lead!.ownerName }
          currentLead = await repository.updateLead(lead!.id, { ownerId: ownerReference?.ownerId ?? null, ownerName })
          mutations.push({ kind: 'lead_update', leadId: currentLead.id, before }); actionMessages.push(`Responsável: ${ownerName}`)
        } else if (action.type === 'move_stage' || action.type === 'mark_lost') {
          const target = action.type === 'mark_lost' ? base.stages.find((stage) => stage.isLost) : base.stages.find((stage) => stage.id === action.value)
          const before = { stageId: lead!.stageId, status: lead!.status }
          if (action.type === 'mark_lost' && !target) {
            currentLead = await repository.updateLead(lead!.id, { status: 'lost' })
            mutations.push({ kind: 'lead_update', leadId: currentLead.id, before }); actionMessages.push('Marcado como perdido')
          } else {
            if (!target) throw new Error('A etapa configurada não existe.')
            currentLead = await repository.moveLead(lead!.id, target.id)
            mutations.push({ kind: 'lead_update', leadId: currentLead.id, before }); actionMessages.push(`Movido para ${target.name}`)
          }
        } else if (action.type === 'start_cadence') {
          const cadenceName = action.value.trim() || 'Cadência automática'
          for (const [index, offset] of [0, 2, 5].entries()) {
            const due = new Date(); due.setDate(due.getDate() + offset); due.setMinutes(0, 0, 0)
            await createActivityAction(index === 1 ? 'call' : 'followup', `${cadenceName} · Etapa ${index + 1}`, due.toISOString())
          }
        } else if (action.type === 'end_cadence') {
          const pending = workingActivities.filter((activity) => activity.leadId === lead?.id && !activity.completedAt && ['followup', 'call', 'meeting'].includes(activity.type))
          for (const activity of pending) {
            const resolvedAt = new Date().toISOString()
            await repository.updateActivity(activity.id, { completedAt: resolvedAt, resolutionStatus: 'superseded', resolutionReason: 'cadence_ended' })
            mutations.push({ kind: 'activity_update', activityId: activity.id, before: { completedAt: activity.completedAt, resolutionStatus: activity.resolutionStatus, resolutionReason: activity.resolutionReason } })
            activity.completedAt = resolvedAt
            activity.resolutionStatus = 'superseded'
            activity.resolutionReason = 'cadence_ended'
          }
          actionMessages.push(`${pending.length} atividade(s) pendente(s) encerrada(s)`)
        }
      }
      let completedOutput: AutomationRun['output'] | null = null
      try {
        let skipActions = 0
        for (const action of rule.actions.slice(0, guard.maxActionsPerRun)) {
          if (skipActions > 0) { skipActions -= 1; actionMessages.push(`Etapa ignorada pela ramificação: ${actionLabels[action.type]}`); continue }
          if (action.type === 'wait') {
            const duration = [action.delayDays ? `${action.delayDays}d` : '', action.delayHours ? `${action.delayHours}h` : '', action.delayMinutes ? `${action.delayMinutes}min` : ''].filter(Boolean).join(' ') || '1min'
            warnings.push(`A espera de ${duration} foi compactada neste teste/execução local. Em produção cloud, o Workflow Runtime 3.0 persiste e retoma a execução após o prazo.`)
            actionMessages.push(`Aguardar ${duration}`)
            continue
          }
          if (action.type === 'branch_if') {
            const branchCondition = workflowControlCondition(action)
            const matched = branchCondition ? conditionMatches(branchCondition, { ...event, lead: currentLead }) : false
            actionMessages.push(`Ramificação ${matched ? 'verdadeira' : 'falsa'}: ${action.branchField ?? 'condição não configurada'}`)
            if (!matched) skipActions = Math.max(1, Number(action.branchSkip ?? 1))
            continue
          }
          try { await executeAction(action) }
          catch (actionError) {
            const message = actionError instanceof Error ? actionError.message : 'Falha em uma ação da automação.'
            warnings.push(`${actionLabels[action.type]}: ${message}`)
            if (guard.stopOnError) throw actionError
          }
        }
        completedOutput = {
          message: `${actionMessages.length} ação(ões) processada(s).`, mutations, matchedLeadIds: currentLead ? [currentLead.id] : [],
          actionPreview: actionMessages, warnings: [...warnings], correlationId, chainDepth, durationMs: Date.now() - runStartedAt, webhookDeliveryIds,
        }
        await repository.finishAutomationRun(run.id, 'success', completedOutput)
        executed += 1
      } catch (automationError) {
        const message = automationError instanceof Error ? automationError.message : 'Falha ao executar automação.'
        const rollbackWarnings: string[] = []
        for (const mutation of [...mutations].reverse()) {
          try {
            if (mutation.kind === 'activity_create' && mutation.activityId) await repository.deleteActivity(mutation.activityId)
            if (mutation.kind === 'activity_update' && mutation.activityId && mutation.before) await repository.updateActivity(mutation.activityId, { completedAt: mutation.before.completedAt ?? null, resolutionStatus: mutation.before.resolutionStatus ?? (mutation.before.completedAt ? 'completed' : 'pending'), resolutionReason: mutation.before.resolutionReason ?? null })
            if (mutation.kind === 'event_create' && mutation.eventId) await repository.deleteCalendarEvent(mutation.eventId)
            if (mutation.kind === 'lead_update' && mutation.leadId && mutation.before) await repository.updateLead(mutation.leadId, mutation.before)
          } catch (rollbackError) {
            rollbackWarnings.push(rollbackError instanceof Error ? rollbackError.message : 'Falha ao restaurar uma alteração parcial.')
          }
        }
        const rollbackMessage = rollbackWarnings.length ? 'Algumas alterações parciais não puderam ser restauradas.' : 'Alterações parciais restauradas automaticamente.'
        await repository.finishAutomationRun(run.id, 'failed', { message: `${message} ${rollbackMessage}`, mutations: rollbackWarnings.length ? mutations : [], matchedLeadIds: currentLead ? [currentLead.id] : [], actionPreview: actionMessages, warnings: [...warnings, ...rollbackWarnings], correlationId, chainDepth, durationMs: Date.now() - runStartedAt, webhookDeliveryIds }, message)
      }
      if (completedOutput && webhookRequests.length) {
        for (const webhookId of webhookRequests) {
          try {
            const delivery = await dispatchAutomationWebhook({
              workspaceId: workspaceId, webhookId, runId: run.id, rule, lead: currentLead,
              eventType: event.triggerType, correlationId,
            })
            webhookDeliveryIds.push(delivery.id)
          } catch (webhookError) {
            warnings.push(`Webhook: ${webhookError instanceof Error ? webhookError.message : 'Não foi possível criar a entrega.'}`)
          }
        }
        try {
          await repository.finishAutomationRun(run.id, 'success', {
            ...completedOutput,
            message: `${actionMessages.length} ação(ões) processada(s); ${webhookDeliveryIds.length} webhook(s) enfileirado(s).`,
            warnings: [...warnings], webhookDeliveryIds, durationMs: Date.now() - runStartedAt,
          })
        } catch {
          notify('info', 'A automação foi concluída, mas o vínculo final com o log de webhook precisa ser revisado.')
        }
      }
    }
    if (executed && options.refreshAfter !== false) await refreshData()
    return executed
}
