import type { CompanyRecord, ContactRecord, Lead, OpportunityRecord } from '../../domain/types'
import type { CoreObjectKey, CoreRecord, ObjectDefinition } from './types'

class ObjectRegistry {
  private readonly definitions = new Map<CoreObjectKey, ObjectDefinition>()

  register<TRecord extends CoreRecord>(definition: ObjectDefinition<TRecord>) {
    if (this.definitions.has(definition.key)) throw new Error(`Objeto já registrado: ${definition.key}`)
    const frozen = Object.freeze({ ...definition }) as ObjectDefinition
    this.definitions.set(definition.key, frozen)
    return frozen
  }

  get(key: CoreObjectKey) {
    const definition = this.definitions.get(key)
    if (!definition) throw new Error(`Objeto não registrado: ${key}`)
    return definition
  }

  has(key: CoreObjectKey) { return this.definitions.has(key) }
  list() { return [...this.definitions.values()] }
}

export const objectRegistry = new ObjectRegistry()

objectRegistry.register<Lead>({
  key: 'lead', label: 'Registro comercial', pluralLabel: 'Registros comerciais', sourceCollection: 'leads',
  idField: 'id', workspaceField: 'workspaceId', primaryLabelField: 'name', adapterId: 'lead-v10193', legacy: true, authority: 'legacy-projection',
})
objectRegistry.register<ContactRecord>({
  key: 'contact', label: 'Pessoa', pluralLabel: 'Pessoas', sourceCollection: 'contacts',
  idField: 'id', workspaceField: 'workspaceId', primaryLabelField: 'name', adapterId: 'contact-v10193', legacy: false, authority: 'canonical',
})
objectRegistry.register<CompanyRecord>({
  key: 'company', label: 'Empresa', pluralLabel: 'Empresas', sourceCollection: 'companies',
  idField: 'id', workspaceField: 'workspaceId', primaryLabelField: 'name', adapterId: 'company-v10193', legacy: false, authority: 'canonical',
})
objectRegistry.register<OpportunityRecord>({
  key: 'opportunity', label: 'Oportunidade', pluralLabel: 'Oportunidades', sourceCollection: 'opportunities',
  idField: 'id', workspaceField: 'workspaceId', primaryLabelField: 'title', adapterId: 'opportunity-v10193', legacy: false, authority: 'canonical',
})
