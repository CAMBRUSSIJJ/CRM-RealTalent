import type { ContactRecord, Lead, WorkspaceSnapshot } from '../domain/types'
import type { CrmRepository } from '../repositories/crm-repository'

export interface WorkspaceBackupRestoreOptions {
  file: File
  workspaceId: string
  userId: string | null
  repository: CrmRepository
}

/**
 * Restores a portable workspace snapshot without coupling backup parsing to React.
 * The operation is compensating/transaction-like: entities created in this pass are
 * rolled back in reverse dependency order when a later step fails.
 */
export async function restoreWorkspaceBackupToRepository({ file, workspaceId, userId, repository }: WorkspaceBackupRestoreOptions) {
  const parsed = JSON.parse(await file.text()) as { workspace?: { snapshot?: WorkspaceSnapshot }; snapshot?: WorkspaceSnapshot }
  const source = parsed.workspace?.snapshot ?? parsed.snapshot
  if (!source || !Array.isArray(source.leads) || !Array.isArray(source.stages)) throw new Error('O arquivo não contém um snapshot completo reconhecível.')
  const target = await repository.getSnapshot(workspaceId)
  const warnings: string[] = []
  const created = { leads: [] as string[], contacts: [] as string[], relationships: [] as string[], activities: [] as string[], calls: [] as string[], events: [] as string[], playbooks: [] as string[], goals: [] as string[], rules: [] as string[] }
  const stageMap = new Map(source.stages.map((stage) => {
    const matched = target.stages.find((item) => item.name.trim().toLocaleLowerCase('pt-BR') === stage.name.trim().toLocaleLowerCase('pt-BR'))
      ?? target.stages.find((item) => item.isWon === stage.isWon && item.isLost === stage.isLost)
      ?? target.stages[0]
    return [stage.id, matched?.id ?? '']
  }))
  const leadMap = new Map<string, string>()
  const keyForLead = (lead: Lead) => `${lead.phone.replace(/\D/g, '')}|${lead.email.trim().toLocaleLowerCase('pt-BR')}|${lead.name.trim().toLocaleLowerCase('pt-BR')}|${lead.company.trim().toLocaleLowerCase('pt-BR')}`
  let imported = 0
  try {
    for (const lead of source.leads) {
      const existing = target.leads.find((item) => keyForLead(item) === keyForLead(lead))
      if (existing) { leadMap.set(lead.id, existing.id); warnings.push(`${lead.name}: lead já existente; dados operacionais vinculados ao cadastro atual.`); continue }
      const restored = await repository.createLead({
        workspaceId: workspaceId, name: lead.name, company: lead.company, phone: lead.phone, email: lead.email, city: lead.city,
        source: lead.source, stageId: stageMap.get(lead.stageId) || target.stages[0].id, status: lead.status, temperature: lead.temperature,
        priority: lead.priority, ownerId: null, ownerName: lead.ownerName || 'Equipe', value: lead.value, nextActionAt: lead.nextActionAt, notes: lead.notes, tags: lead.tags,
      })
      leadMap.set(lead.id, restored.id); created.leads.push(restored.id); imported += 1
    }
    // V100.54: restaura a inteligência da conta depois que os leads já recriaram empresas/contatos-base.
    const postLeadSnapshot = await repository.getSnapshot(workspaceId)
    const companyMap = new Map<string, string>()
    for (const sourceCompany of source.companies ?? []) {
      const mappedLeadIds = sourceCompany.leadIds.map((id) => leadMap.get(id)).filter((id): id is string => Boolean(id))
      const byMappedLead = mappedLeadIds.length ? postLeadSnapshot.companies.find((company) => company.leadIds.some((id) => mappedLeadIds.includes(id))) : null
      const byName = postLeadSnapshot.companies.find((company) => company.name.trim().toLocaleLowerCase('pt-BR') === sourceCompany.name.trim().toLocaleLowerCase('pt-BR'))
      const targetCompany = byMappedLead ?? byName
      if (targetCompany) companyMap.set(sourceCompany.id, targetCompany.id)
      else warnings.push(`${sourceCompany.name}: conta sem lead correspondente não pôde ser recriada automaticamente.`)
    }
    const contactMap = new Map<string, string>()
    const contactKey = (contact: ContactRecord) => `${contact.email.trim().toLocaleLowerCase('pt-BR')}|${contact.phone.replace(/\D/g, '')}|${contact.name.trim().toLocaleLowerCase('pt-BR')}`
    let contactSnapshot = await repository.getSnapshot(workspaceId)
    for (const sourceContact of source.contacts ?? []) {
      const targetCompanyId = sourceContact.companyId ? companyMap.get(sourceContact.companyId) ?? null : null
      if (!targetCompanyId) { warnings.push(`${sourceContact.name}: stakeholder ignorado porque a empresa não pôde ser vinculada.`); continue }
      const mappedLeadIds = sourceContact.leadIds.map((id) => leadMap.get(id)).filter((id): id is string => Boolean(id))
      const existing = contactSnapshot.contacts.find((contact) => contact.companyId === targetCompanyId && (contactKey(contact) === contactKey(sourceContact) || mappedLeadIds.some((id) => contact.leadIds.includes(id))))
      const payload = {
        companyId: targetCompanyId, name: sourceContact.name, jobTitle: sourceContact.jobTitle, phone: sourceContact.phone, email: sourceContact.email,
        decisionRole: sourceContact.decisionRole, influenceLevel: sourceContact.influenceLevel, relationshipStrength: sourceContact.relationshipStrength ?? 'unknown',
        relationshipScore: sourceContact.relationshipScore ?? 0, stance: sourceContact.stance ?? 'unknown', relationshipOwnerId: null,
        relationshipOwnerName: sourceContact.relationshipOwnerName || '', lastContactAt: sourceContact.lastContactAt ?? null, nextActionAt: sourceContact.nextActionAt ?? null,
        notes: sourceContact.notes ?? '', isPrimary: Boolean(sourceContact.isPrimary), consentStatus: sourceContact.consentStatus, doNotContact: sourceContact.doNotContact,
        doNotContactReason: sourceContact.doNotContactReason, leadIds: mappedLeadIds,
      }
      const restoredContact = existing ? await repository.updateContact(existing.id, payload) : await repository.createContact({ workspaceId: workspaceId, ...payload })
      contactMap.set(sourceContact.id, restoredContact.id)
      if (!existing) created.contacts.push(restoredContact.id)
      for (const sourceLeadId of sourceContact.leadIds) {
        const sourceLead = source.leads.find((item) => item.id === sourceLeadId)
        const targetLeadId = leadMap.get(sourceLeadId)
        if (sourceLead?.primaryContactId === sourceContact.id && targetLeadId) await repository.updateLead(targetLeadId, { primaryContactId: restoredContact.id })
      }
    }
    for (const relation of source.contactRelationships ?? []) {
      const companyId = companyMap.get(relation.companyId); const fromContactId = contactMap.get(relation.fromContactId); const toContactId = contactMap.get(relation.toContactId)
      if (!companyId || !fromContactId || !toContactId) continue
      try {
        const restoredRelation = await repository.createContactRelationship({ workspaceId: workspaceId, companyId, fromContactId, toContactId, relationshipType: relation.relationshipType, strength: relation.strength, notes: relation.notes })
        created.relationships.push(restoredRelation.id)
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (!/duplicate|unique|já existe/i.test(message)) throw error
      }
    }
    contactSnapshot = await repository.getSnapshot(workspaceId)
  
    for (const activity of source.activities.filter((item) => item.sourceType !== 'call' && item.sourceType !== 'calendar')) {
      const restored = await repository.createActivity({ workspaceId: workspaceId, leadId: activity.leadId ? leadMap.get(activity.leadId) ?? null : null, contactId: activity.contactId ? contactMap.get(activity.contactId) ?? null : null, type: activity.type, title: activity.title, description: activity.description, dueAt: activity.dueAt, completedAt: activity.completedAt, assignedTo: null, sourceType: activity.sourceType, sourceId: activity.sourceId })
      created.activities.push(restored.id); imported += 1
    }
    for (const call of source.calls) {
      const leadId = leadMap.get(call.leadId); if (!leadId) { warnings.push('Uma ligação sem lead correspondente foi ignorada.'); continue }
      const restored = await repository.createCall({ workspaceId: workspaceId, leadId, contactId: call.contactId ? contactMap.get(call.contactId) ?? null : null, userId: null, outcome: call.outcome, durationSeconds: call.durationSeconds, notes: call.notes, transcript: call.transcript, recordingPath: null, consentAt: call.consentAt ?? null, startedAt: call.startedAt, endedAt: call.endedAt })
      created.calls.push(restored.id); imported += 1
      if (call.recordingPath) warnings.push(`Ligação de ${source.leads.find((lead) => lead.id === call.leadId)?.name ?? 'lead'}: metadados restaurados sem o arquivo de áudio.`)
    }
    for (const event of source.events) {
      const restored = await repository.createCalendarEvent({ workspaceId: workspaceId, leadId: event.leadId ? leadMap.get(event.leadId) ?? null : null, contactId: event.contactId ? contactMap.get(event.contactId) ?? null : null, title: event.title, description: event.description, startsAt: event.startsAt, endsAt: event.endsAt, allDay: event.allDay, location: event.location, status: event.status, assignedTo: null })
      created.events.push(restored.id); imported += 1
    }
    for (const playbook of source.playbooks) {
      if (target.playbooks.some((item) => item.kind === playbook.kind && item.title.toLocaleLowerCase('pt-BR') === playbook.title.toLocaleLowerCase('pt-BR'))) continue
      const restored = await repository.createPlaybook({ workspaceId: workspaceId, kind: playbook.kind, title: playbook.title, category: playbook.category, content: playbook.content, tags: playbook.tags, guidance: playbook.guidance, active: playbook.active })
      created.playbooks.push(restored.id); imported += 1
    }
    for (const goal of source.goals) {
      if (target.goals.some((item) => item.metric === goal.metric && item.periodStart === goal.periodStart && item.periodEnd === goal.periodEnd)) continue
      const restored = await repository.createGoal({ workspaceId: workspaceId, userId: null, userName: goal.userName || 'Equipe', metric: goal.metric, targetValue: goal.targetValue, periodStart: goal.periodStart, periodEnd: goal.periodEnd })
      created.goals.push(restored.id); imported += 1
    }
    for (const rule of source.automationRules) {
      if (target.automationRules.some((item) => item.name.toLocaleLowerCase('pt-BR') === rule.name.toLocaleLowerCase('pt-BR'))) continue
      const actions = rule.actions.map((action) => action.type === 'move_stage' ? { ...action, value: stageMap.get(action.value) ?? action.value } : action)
      const conditions = rule.conditions.map((condition) => condition.field === 'stage_id' ? { ...condition, value: stageMap.get(condition.value) ?? condition.value } : condition)
      const restored = await repository.createAutomationRule({ workspaceId: workspaceId, name: rule.name, enabled: false, triggerType: rule.triggerType, conditions, actions, createdBy: userId })
      created.rules.push(restored.id); imported += 1
    }
    if (source.automationRules.some((rule) => rule.enabled)) warnings.push('Automações restauradas em modo desativado para revisão segura.')
  } catch (restoreError) {
    await Promise.allSettled(created.rules.reverse().map((id) => repository.deleteAutomationRule(id)))
    await Promise.allSettled(created.goals.reverse().map((id) => repository.deleteGoal(id)))
    await Promise.allSettled(created.playbooks.reverse().map((id) => repository.deletePlaybook(id)))
    await Promise.allSettled(created.events.reverse().map((id) => repository.deleteCalendarEvent(id)))
    await Promise.allSettled(created.calls.reverse().map((id) => repository.deleteCall(id)))
    await Promise.allSettled(created.activities.reverse().map((id) => repository.deleteActivity(id)))
    await Promise.allSettled(created.relationships.reverse().map((id) => repository.deleteContactRelationship(id)))
    await Promise.allSettled(created.contacts.reverse().map((id) => repository.deleteContact(id)))
    await Promise.allSettled(created.leads.reverse().map((id) => repository.deleteLead(id)))
    throw restoreError
  }
  return { imported, warnings }
}
