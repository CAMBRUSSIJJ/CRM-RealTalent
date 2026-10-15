import type { CrmCapabilityPlanStep } from './realtalent-crm-capability-planner'
import type { CrmCapabilityExecutionRuntime, CrmCapabilityStepResult } from './realtalent-crm-capability-executor'
import { assertRecordU, resolveContactU, resolveLeadU, resolveLeadsU, targetQuery, uarg, ubest, uiso, unum } from './realtalent-crm-universal-executor-helpers'

export async function executeUniversalContacts(step: CrmCapabilityPlanStep, runtime: CrmCapabilityExecutionRuntime): Promise<CrmCapabilityStepResult | null> {
  const { actions, snapshot } = runtime

  if (step.capabilityId === 'contacts.relationship_create') {
    const from = resolveContactU(runtime, uarg(step, 'from_contact_query'))
    const to = resolveContactU(runtime, uarg(step, 'to_contact_query'))
    if (!from || !to) throw new Error('Não encontrei os dois contatos necessários para criar a relação.')
    if (from.id === to.id) throw new Error('A relação precisa envolver dois contatos diferentes.')
    const company = ubest(snapshot.companies, uarg(step, 'company_query'), (item) => [item.id, item.name, item.legalName])
    const companyId = from.companyId || to.companyId || company?.id || ''
    if (!companyId) throw new Error('Os contatos precisam estar vinculados a uma empresa para criar a relação.')
    const created = await actions.createContactRelationship({ workspaceId: runtime.workspaceId, companyId, fromContactId: from.id, toContactId: to.id, relationshipType: (uarg(step, 'relationship_type') || 'works_with') as any, strength: Math.max(0, Math.min(100, unum(uarg(step, 'strength'), 50))), notes: uarg(step, 'notes') } as any)
    return { ok: true, summary: `Relação entre ${from.name} e ${to.name} criada.`, evidence: { source: 'repository', entityType: 'contact_relationship', entityId: created.id, state: 'persisted' } }
  }

  if (step.capabilityId === 'contacts.relationship_update' || step.capabilityId === 'contacts.relationship_delete') {
    const relationship = ubest(snapshot.contactRelationships, targetQuery(step), (item) => [item.id, item.relationshipType, item.notes])
    if (!relationship) throw new Error('Não encontrei a relação entre contatos.')
    if (step.capabilityId === 'contacts.relationship_delete') {
      await actions.deleteContactRelationship(relationship.id)
      return { ok: true, summary: 'Relação entre contatos excluída.' }
    }
    const patch: Record<string, unknown> = {}
    if (uarg(step, 'relationship_type')) patch.relationshipType = uarg(step, 'relationship_type')
    if (uarg(step, 'strength')) patch.strength = Math.max(0, Math.min(100, unum(uarg(step, 'strength'))))
    if (uarg(step, 'notes')) patch.notes = uarg(step, 'notes')
    await actions.updateContactRelationship(relationship.id, patch as any)
    return { ok: true, summary: 'Relação entre contatos atualizada.' }
  }

  if (['leads.bulk_move','leads.bulk_update','leads.reclassify','leads.bulk_tag','leads.bulk_delete'].includes(step.capabilityId)) {
    const leads = resolveLeadsU(runtime, uarg(step, 'record_queries'))
    if (!leads.length) throw new Error('Não encontrei os leads informados para a ação em lote.')
    for (const lead of leads) assertRecordU(runtime, step.capabilityId === 'leads.bulk_move' ? 'pipeline' : 'contacts', lead.ownerId)
    const ids = leads.map((item) => item.id)

    if (step.capabilityId === 'leads.bulk_move') {
      const stage = ubest(snapshot.stages, uarg(step, 'stage_query'), (item) => [item.id, item.name])
      if (!stage) throw new Error('Não encontrei a etapa de destino do pipeline.')
      const moved = await actions.bulkMoveLeads(ids, stage.id, uarg(step, 'loss_reason') || null)
      return { ok: true, summary: `${moved.length} oportunidade(s) movida(s) para ${stage.name}.` }
    }

    if (step.capabilityId === 'leads.bulk_update') {
      const patch: Record<string, unknown> = {}
      for (const key of ['priority','temperature','owner_id','owner_name','next_action_at','status','notes'] as const) {
        const value = uarg(step, key)
        if (!value) continue
        const field = ({ owner_id: 'ownerId', owner_name: 'ownerName', next_action_at: 'nextActionAt' } as Record<string,string>)[key] || key
        patch[field] = key === 'next_action_at' ? (uiso(value) || value) : value
      }
      const count = await actions.bulkUpdateLeads(ids, patch as any)
      return { ok: true, summary: `${count} lead(s) atualizado(s) em lote.` }
    }

    if (step.capabilityId === 'leads.reclassify') {
      const priority = (uarg(step, 'priority') || 'medium') as any
      const temperature = (uarg(step, 'temperature') || 'warm') as any
      const count = await actions.reclassifyLeads(leads.map((lead) => ({ leadId: lead.id, priority, temperature })))
      return { ok: true, summary: `${count} lead(s) reclassificado(s).` }
    }

    if (step.capabilityId === 'leads.bulk_tag') {
      const tag = uarg(step, 'tag').trim()
      if (!tag) throw new Error('Informe a tag que deseja adicionar.')
      const count = await actions.bulkAddLeadTag(ids, tag)
      return { ok: true, summary: `Tag “${tag}” adicionada a ${count} lead(s).` }
    }

    const count = await actions.bulkDeleteLeads(ids)
    return { ok: true, summary: `${count} lead(s) excluído(s).` }
  }

  if (step.capabilityId === 'leads.merge') {
    const primary = resolveLeadU(runtime, uarg(step, 'primary_query'))
    const duplicate = resolveLeadU(runtime, uarg(step, 'duplicate_query'))
    if (!primary || !duplicate) throw new Error('Não encontrei o lead principal e o duplicado para mesclar.')
    if (primary.id === duplicate.id) throw new Error('O lead principal e o duplicado precisam ser registros diferentes.')
    assertRecordU(runtime, 'contacts', primary.ownerId)
    assertRecordU(runtime, 'contacts', duplicate.ownerId)
    const merged = await actions.mergeLeads(primary.id, duplicate.id)
    return { ok: true, summary: `Lead duplicado mesclado em ${merged.company || merged.name}.`, evidence: { source: 'repository', entityType: 'lead', entityId: merged.id, state: 'persisted' } }
  }

  return null
}
