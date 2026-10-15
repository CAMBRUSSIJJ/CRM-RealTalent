import type { RelationDefinition } from './types'

class RelationRegistry {
  private readonly definitions = new Map<string, RelationDefinition>()

  register(definition: RelationDefinition) {
    if (this.definitions.has(definition.id)) throw new Error(`Relação já registrada: ${definition.id}`)
    const frozen = Object.freeze({ ...definition })
    this.definitions.set(definition.id, frozen)
    return frozen
  }

  get(id: string) { return this.definitions.get(id) ?? null }
  list() { return [...this.definitions.values()] }
}

export const relationRegistry = new RelationRegistry()

const relations: RelationDefinition[] = [
  { id: 'lead-company', label: 'Registro comercial → Empresa', fromObject: 'lead', fromField: 'companyId', toObject: 'company', cardinality: 'one', nullable: true, inverseRelationId: 'company-leads' },
  { id: 'company-leads', label: 'Empresa → Registros comerciais', fromObject: 'company', fromField: 'leadIds', toObject: 'lead', cardinality: 'many', inverseRelationId: 'lead-company' },
  { id: 'lead-primary-contact', label: 'Registro comercial → Pessoa principal', fromObject: 'lead', fromField: 'primaryContactId', toObject: 'contact', cardinality: 'one', nullable: true },
  { id: 'lead-opportunity', label: 'Registro comercial → Oportunidade', fromObject: 'lead', fromField: 'opportunityId', toObject: 'opportunity', cardinality: 'one', nullable: true, inverseRelationId: 'opportunity-lead' },
  { id: 'contact-company', label: 'Pessoa → Empresa', fromObject: 'contact', fromField: 'companyId', toObject: 'company', cardinality: 'one', nullable: true },
  { id: 'contact-leads', label: 'Pessoa → Registros comerciais', fromObject: 'contact', fromField: 'leadIds', toObject: 'lead', cardinality: 'many' },
  { id: 'opportunity-lead', label: 'Oportunidade → Registro comercial', fromObject: 'opportunity', fromField: 'leadId', toObject: 'lead', cardinality: 'one', nullable: false, inverseRelationId: 'lead-opportunity' },
  { id: 'opportunity-company', label: 'Oportunidade → Empresa', fromObject: 'opportunity', fromField: 'companyId', toObject: 'company', cardinality: 'one', nullable: true },
  { id: 'opportunity-primary-contact', label: 'Oportunidade → Pessoa principal', fromObject: 'opportunity', fromField: 'primaryContactId', toObject: 'contact', cardinality: 'one', nullable: true },
]

for (const relation of relations) relationRegistry.register(relation)
