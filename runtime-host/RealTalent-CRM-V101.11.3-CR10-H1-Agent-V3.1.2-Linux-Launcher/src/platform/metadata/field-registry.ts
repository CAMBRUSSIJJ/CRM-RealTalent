import type { CoreObjectKey, FieldDefinition } from './types'

class FieldRegistry {
  private readonly definitions = new Map<string, FieldDefinition>()

  register(definition: FieldDefinition) {
    const key = `${definition.objectKey}.${definition.field}`
    if (this.definitions.has(key)) throw new Error(`Campo já registrado: ${key}`)
    const frozen = Object.freeze({ ...definition })
    this.definitions.set(key, frozen)
    return frozen
  }

  get(objectKey: CoreObjectKey, field: string) { return this.definitions.get(`${objectKey}.${field}`) ?? null }
  list(objectKey?: CoreObjectKey) { return [...this.definitions.values()].filter((field) => !objectKey || field.objectKey === objectKey) }
}

export const fieldRegistry = new FieldRegistry()

const fields: FieldDefinition[] = [
  { id: 'lead.id', objectKey: 'lead', field: 'id', label: 'ID', kind: 'id', required: true },
  { id: 'lead.workspaceId', objectKey: 'lead', field: 'workspaceId', label: 'Workspace', kind: 'id', required: true },
  { id: 'lead.name', objectKey: 'lead', field: 'name', label: 'Nome / contato', kind: 'text', required: true },
  { id: 'lead.company', objectKey: 'lead', field: 'company', label: 'Empresa (legado)', kind: 'text' },
  { id: 'lead.phone', objectKey: 'lead', field: 'phone', label: 'Telefone', kind: 'text' },
  { id: 'lead.email', objectKey: 'lead', field: 'email', label: 'E-mail', kind: 'text' },
  { id: 'lead.companyId', objectKey: 'lead', field: 'companyId', label: 'Empresa', kind: 'relation', nullable: true, relationId: 'lead-company' },
  { id: 'lead.primaryContactId', objectKey: 'lead', field: 'primaryContactId', label: 'Pessoa principal', kind: 'relation', nullable: true, relationId: 'lead-primary-contact' },
  { id: 'lead.opportunityId', objectKey: 'lead', field: 'opportunityId', label: 'Oportunidade', kind: 'relation', nullable: true, relationId: 'lead-opportunity' },
  { id: 'lead.stageId', objectKey: 'lead', field: 'stageId', label: 'Etapa', kind: 'id', required: true },
  { id: 'lead.status', objectKey: 'lead', field: 'status', label: 'Status', kind: 'enum', required: true, enumValues: ['active', 'won', 'lost', 'archived'] },
  { id: 'lead.temperature', objectKey: 'lead', field: 'temperature', label: 'Temperatura', kind: 'enum', enumValues: ['cold', 'warm', 'hot'] },
  { id: 'lead.priority', objectKey: 'lead', field: 'priority', label: 'Prioridade', kind: 'enum', enumValues: ['low', 'medium', 'high', 'urgent'] },
  { id: 'lead.value', objectKey: 'lead', field: 'value', label: 'Valor', kind: 'number' },
  { id: 'lead.tags', objectKey: 'lead', field: 'tags', label: 'Tags', kind: 'tags' },
  { id: 'lead.city', objectKey: 'lead', field: 'city', label: 'Cidade', kind: 'text' },
  { id: 'lead.source', objectKey: 'lead', field: 'source', label: 'Origem', kind: 'text' },
  { id: 'lead.ownerId', objectKey: 'lead', field: 'ownerId', label: 'Responsável', kind: 'id', nullable: true },
  { id: 'lead.ownerName', objectKey: 'lead', field: 'ownerName', label: 'Nome do responsável', kind: 'text' },
  { id: 'lead.nextActionAt', objectKey: 'lead', field: 'nextActionAt', label: 'Próxima ação', kind: 'date', nullable: true },
  { id: 'lead.lastContactAt', objectKey: 'lead', field: 'lastContactAt', label: 'Último contato', kind: 'date', nullable: true },
  { id: 'lead.expectedCloseAt', objectKey: 'lead', field: 'expectedCloseAt', label: 'Fechamento esperado', kind: 'date', nullable: true },
  { id: 'lead.createdAt', objectKey: 'lead', field: 'createdAt', label: 'Criado em', kind: 'date', required: true },
  { id: 'lead.updatedAt', objectKey: 'lead', field: 'updatedAt', label: 'Atualizado em', kind: 'date', required: true },
  { id: 'lead.doNotContact', objectKey: 'lead', field: 'doNotContact', label: 'Não contatar', kind: 'boolean' },

  { id: 'contact.id', objectKey: 'contact', field: 'id', label: 'ID', kind: 'id', required: true },
  { id: 'contact.workspaceId', objectKey: 'contact', field: 'workspaceId', label: 'Workspace', kind: 'id', required: true },
  { id: 'contact.name', objectKey: 'contact', field: 'name', label: 'Nome', kind: 'text', required: true },
  { id: 'contact.phone', objectKey: 'contact', field: 'phone', label: 'Telefone', kind: 'text' },
  { id: 'contact.email', objectKey: 'contact', field: 'email', label: 'E-mail', kind: 'text' },
  { id: 'contact.jobTitle', objectKey: 'contact', field: 'jobTitle', label: 'Cargo', kind: 'text' },
  { id: 'contact.companyId', objectKey: 'contact', field: 'companyId', label: 'Empresa', kind: 'relation', nullable: true, relationId: 'contact-company' },
  { id: 'contact.leadIds', objectKey: 'contact', field: 'leadIds', label: 'Registros comerciais', kind: 'relation-list', relationId: 'contact-leads' },
  { id: 'contact.isPrimary', objectKey: 'contact', field: 'isPrimary', label: 'Contato principal', kind: 'boolean' },
  { id: 'contact.decisionRole', objectKey: 'contact', field: 'decisionRole', label: 'Papel decisório', kind: 'enum' },
  { id: 'contact.influenceLevel', objectKey: 'contact', field: 'influenceLevel', label: 'Influência', kind: 'number' },

  { id: 'company.id', objectKey: 'company', field: 'id', label: 'ID', kind: 'id', required: true },
  { id: 'company.workspaceId', objectKey: 'company', field: 'workspaceId', label: 'Workspace', kind: 'id', required: true },
  { id: 'company.name', objectKey: 'company', field: 'name', label: 'Nome', kind: 'text', required: true },
  { id: 'company.cnpj', objectKey: 'company', field: 'cnpj', label: 'CNPJ', kind: 'text' },
  { id: 'company.domain', objectKey: 'company', field: 'domain', label: 'Domínio', kind: 'text' },
  { id: 'company.website', objectKey: 'company', field: 'website', label: 'Website', kind: 'text' },
  { id: 'company.segment', objectKey: 'company', field: 'segment', label: 'Segmento', kind: 'text' },
  { id: 'company.leadIds', objectKey: 'company', field: 'leadIds', label: 'Registros comerciais', kind: 'relation-list', relationId: 'company-leads' },

  { id: 'opportunity.id', objectKey: 'opportunity', field: 'id', label: 'ID', kind: 'id', required: true },
  { id: 'opportunity.workspaceId', objectKey: 'opportunity', field: 'workspaceId', label: 'Workspace', kind: 'id', required: true },
  { id: 'opportunity.title', objectKey: 'opportunity', field: 'title', label: 'Título', kind: 'text', required: true },
  { id: 'opportunity.leadId', objectKey: 'opportunity', field: 'leadId', label: 'Registro comercial', kind: 'relation', required: true, relationId: 'opportunity-lead' },
  { id: 'opportunity.companyId', objectKey: 'opportunity', field: 'companyId', label: 'Empresa', kind: 'relation', nullable: true, relationId: 'opportunity-company' },
  { id: 'opportunity.primaryContactId', objectKey: 'opportunity', field: 'primaryContactId', label: 'Pessoa principal', kind: 'relation', nullable: true, relationId: 'opportunity-primary-contact' },
  { id: 'opportunity.stageId', objectKey: 'opportunity', field: 'stageId', label: 'Etapa', kind: 'id', required: true },
  { id: 'opportunity.status', objectKey: 'opportunity', field: 'status', label: 'Status', kind: 'enum', required: true },
  { id: 'opportunity.value', objectKey: 'opportunity', field: 'value', label: 'Valor', kind: 'number' },
  { id: 'opportunity.expectedCloseAt', objectKey: 'opportunity', field: 'expectedCloseAt', label: 'Previsão de fechamento', kind: 'date', nullable: true },
]

for (const field of fields) fieldRegistry.register(field)
