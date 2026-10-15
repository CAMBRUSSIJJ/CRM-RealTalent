import type { CoreObjectKey } from '../metadata/types'
import { createRecordPageDefinition, type RecordPageDefinition } from './record-page-definition'

class RecordPageRegistry {
  private readonly definitions = new Map<string, RecordPageDefinition>()

  register(definition: RecordPageDefinition) {
    if (this.definitions.has(definition.id)) throw new Error(`Record page já registrada: ${definition.id}`)
    const frozen = Object.freeze(definition)
    this.definitions.set(definition.id, frozen)
    return frozen
  }

  get(id: string) {
    const definition = this.definitions.get(id)
    if (!definition) throw new Error(`Record page não registrada: ${id}`)
    return definition
  }

  findBySurface(surface: string) {
    return this.list().find((definition) => definition.surface === surface) ?? null
  }

  listForObject(objectKey: CoreObjectKey) {
    return this.list().filter((definition) => definition.acceptedObjectKeys.includes(objectKey))
  }

  list() {
    return [...this.definitions.values()]
  }
}

export const recordPageRegistry = new RecordPageRegistry()

export const contactPersonRecordPageDefinition = recordPageRegistry.register(createRecordPageDefinition({
  id: 'contact-person-record-v10192',
  surface: 'contacts',
  label: 'Contato / Pessoa',
  canonicalObjectKey: 'contact',
  acceptedObjectKeys: ['contact', 'lead'],
  defaultTabId: 'overview',
  tabs: [
    { id: 'overview', label: 'Visão geral', widgetIds: ['sales-intelligence', 'recent-timeline', 'next-actions'] },
    { id: 'activities', label: 'Atividades', widgetIds: ['full-timeline'] },
    { id: 'notes', label: 'Notas', widgetIds: ['notes'] },
    { id: 'account', label: 'Conta & decisores', widgetIds: ['account-stakeholders'] },
  ],
  widgets: [
    { id: 'identity', kind: 'identity', title: 'Identidade', region: 'left' },
    { id: 'communication', kind: 'communication', title: 'Comunicação', region: 'left' },
    {
      id: 'key-fields',
      kind: 'fields',
      title: 'Informações-chave',
      region: 'left',
      fieldIds: ['contact.email', 'contact.phone', 'lead.ownerName', 'lead.company', 'lead.stageId', 'lead.nextActionAt', 'lead.value'],
    },
    { id: 'sales-intelligence', kind: 'custom', title: 'Inteligência comercial', region: 'main', tabIds: ['overview'] },
    { id: 'recent-timeline', kind: 'timeline', title: 'Interações recentes', region: 'main', tabIds: ['overview'] },
    { id: 'next-actions', kind: 'quick-actions', title: 'Próximos passos', region: 'main', tabIds: ['overview'] },
    { id: 'full-timeline', kind: 'timeline', title: 'Histórico de atividades', region: 'main', tabIds: ['activities'] },
    { id: 'notes', kind: 'notes', title: 'Notas do contato', region: 'main', tabIds: ['notes'] },
    { id: 'account-stakeholders', kind: 'related-records', title: 'Conta e mapa de decisores', region: 'main', tabIds: ['account'], relationIds: ['contact-company', 'contact-leads'] },
    { id: 'company', kind: 'related-records', title: 'Empresa', region: 'right', relationIds: ['contact-company', 'lead-company'] },
    { id: 'opportunities', kind: 'related-records', title: 'Oportunidades', region: 'right', relationIds: ['lead-opportunity', 'opportunity-primary-contact'] },
    { id: 'account-health', kind: 'custom', title: 'Conta e decisores', region: 'right' },
  ],
  layout: {
    left: ['identity', 'communication', 'key-fields'],
    main: ['sales-intelligence', 'recent-timeline', 'next-actions', 'full-timeline', 'notes', 'account-stakeholders'],
    right: ['company', 'opportunities', 'account-health'],
  },
  extensions: {
    migration: 'V101.9.2',
    compatibility: 'Lead continua aceito como source até Person/Company/Opportunity Canonical Model da V101.9.3.',
  },
}))
