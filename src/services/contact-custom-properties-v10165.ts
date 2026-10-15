import { getSupabaseClient } from '../lib/supabase'
import { safeStorage } from '../lib/storage'

export type ContactCustomPropertyType = 'text' | 'number' | 'currency' | 'date' | 'checkbox' | 'select'
export type ContactCustomPropertyValue = string | number | boolean | null

export interface ContactCustomProperty {
  id: string
  workspaceId: string
  createdBy: string
  name: string
  key: string
  type: ContactCustomPropertyType
  options: string[]
  position: number
  createdAt: string
  updatedAt: string
}

export type ContactCustomValueMap = Record<string, Record<string, ContactCustomPropertyValue>>

export interface ContactCustomPropertyContext {
  mode: 'local' | 'supabase'
  workspaceId: string
  userId: string
}

export interface ContactCustomPropertyInput {
  id?: string
  name: string
  type: ContactCustomPropertyType
  options?: string[]
  position?: number
}

const DEF_PREFIX = 'realtalent-crm-v10165-contact-properties:'
const VALUE_PREFIX = 'realtalent-crm-v10165-contact-property-values:'
const defKey = (context: ContactCustomPropertyContext) => `${DEF_PREFIX}${context.workspaceId}`
const valueKey = (context: ContactCustomPropertyContext) => `${VALUE_PREFIX}${context.workspaceId}`
const randomId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
const slug = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'propriedade'

const normalizeProperty = (value: Partial<ContactCustomProperty> & Record<string, unknown>): ContactCustomProperty => ({
  id: String(value.id ?? randomId()),
  workspaceId: String(value.workspaceId ?? ''),
  createdBy: String(value.createdBy ?? ''),
  name: String(value.name ?? 'Propriedade'),
  key: String(value.key ?? slug(String(value.name ?? 'propriedade'))),
  type: ['text','number','currency','date','checkbox','select'].includes(String(value.type)) ? value.type as ContactCustomPropertyType : 'text',
  options: Array.isArray(value.options) ? value.options.map(String).map((item) => item.trim()).filter(Boolean) : [],
  position: Number.isFinite(Number(value.position)) ? Number(value.position) : 100,
  createdAt: String(value.createdAt ?? new Date().toISOString()),
  updatedAt: String(value.updatedAt ?? new Date().toISOString()),
})

const readLocalProperties = (context: ContactCustomPropertyContext): ContactCustomProperty[] => {
  try {
    const parsed = JSON.parse(safeStorage.getItem(defKey(context)) ?? '[]')
    return Array.isArray(parsed) ? parsed.map(normalizeProperty).sort((a,b) => a.position - b.position || a.name.localeCompare(b.name, 'pt-BR')) : []
  } catch { return [] }
}
const writeLocalProperties = (context: ContactCustomPropertyContext, properties: ContactCustomProperty[]) => safeStorage.setItem(defKey(context), JSON.stringify(properties))
const readLocalValues = (context: ContactCustomPropertyContext): ContactCustomValueMap => {
  try {
    const parsed = JSON.parse(safeStorage.getItem(valueKey(context)) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as ContactCustomValueMap : {}
  } catch { return {} }
}
const writeLocalValues = (context: ContactCustomPropertyContext, values: ContactCustomValueMap) => safeStorage.setItem(valueKey(context), JSON.stringify(values))

const mapPropertyRow = (row: any): ContactCustomProperty => normalizeProperty({
  id: row.id,
  workspaceId: row.organization_id,
  createdBy: row.created_by,
  name: row.name,
  key: row.key,
  type: row.property_type,
  options: row.options,
  position: row.position,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const customColumnId = (propertyId: string) => `custom:${propertyId}`
export const customPropertyIdFromColumn = (column: string) => column.startsWith('custom:') ? column.slice('custom:'.length) : null

export async function listContactCustomProperties(context: ContactCustomPropertyContext): Promise<ContactCustomProperty[]> {
  const client = getSupabaseClient()
  if (context.mode === 'supabase' && client && context.userId) {
    const { data, error } = await (client as any).from('contact_custom_properties').select('*').eq('organization_id', context.workspaceId).order('position').order('name')
    if (!error) {
      const properties = (data ?? []).map(mapPropertyRow)
      writeLocalProperties(context, properties)
      return properties
    }
  }
  return readLocalProperties(context)
}

export async function saveContactCustomProperty(context: ContactCustomPropertyContext, input: ContactCustomPropertyInput): Promise<ContactCustomProperty> {
  const now = new Date().toISOString()
  const current = await listContactCustomProperties(context)
  const previous = input.id ? current.find((item) => item.id === input.id) : null
  const baseKey = previous?.key ?? slug(input.name)
  const uniqueKey = previous?.key ?? (() => {
    let candidate = baseKey, suffix = 2
    while (current.some((item) => item.key === candidate)) candidate = `${baseKey}_${suffix++}`
    return candidate
  })()
  const property: ContactCustomProperty = {
    id: previous?.id ?? input.id ?? randomId(),
    workspaceId: context.workspaceId,
    createdBy: previous?.createdBy ?? context.userId,
    name: input.name.trim(),
    key: uniqueKey,
    type: input.type,
    options: input.type === 'select' ? [...new Set((input.options ?? []).map((item) => item.trim()).filter(Boolean))] : [],
    position: input.position ?? previous?.position ?? (current.length ? Math.max(...current.map((item) => item.position)) + 1 : 0),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  }
  if (!property.name) throw new Error('Informe o nome da propriedade.')
  if (property.type === 'select' && property.options.length === 0) throw new Error('Adicione pelo menos uma opção para a propriedade de seleção.')

  const client = getSupabaseClient()
  if (context.mode === 'supabase' && client && context.userId) {
    const payload = { id: property.id, organization_id: context.workspaceId, created_by: property.createdBy, name: property.name, key: property.key, property_type: property.type, options: property.options, position: property.position, updated_at: now }
    const { data, error } = await (client as any).from('contact_custom_properties').upsert(payload, { onConflict: 'id' }).select().single()
    if (error) throw error
    return mapPropertyRow(data)
  }
  const next = previous ? current.map((item) => item.id === property.id ? property : item) : [...current, property]
  writeLocalProperties(context, next)
  return property
}

export async function deleteContactCustomProperty(context: ContactCustomPropertyContext, propertyId: string): Promise<void> {
  const client = getSupabaseClient()
  if (context.mode === 'supabase' && client && context.userId) {
    const { error } = await (client as any).from('contact_custom_properties').delete().eq('organization_id', context.workspaceId).eq('id', propertyId)
    if (error) throw error
    return
  }
  writeLocalProperties(context, readLocalProperties(context).filter((item) => item.id !== propertyId))
  const values = readLocalValues(context)
  for (const leadId of Object.keys(values)) {
    if (values[leadId]) delete values[leadId][propertyId]
    if (Object.keys(values[leadId] ?? {}).length === 0) delete values[leadId]
  }
  writeLocalValues(context, values)
}

export async function listContactCustomValues(context: ContactCustomPropertyContext): Promise<ContactCustomValueMap> {
  const client = getSupabaseClient()
  if (context.mode === 'supabase' && client && context.userId) {
    const { data, error } = await (client as any).from('contact_custom_property_values').select('lead_id,property_id,value_json').eq('organization_id', context.workspaceId)
    if (!error) {
      const values: ContactCustomValueMap = {}
      for (const row of data ?? []) {
        const leadId = String(row.lead_id), propertyId = String(row.property_id)
        values[leadId] = values[leadId] ?? {}
        values[leadId][propertyId] = row.value_json as ContactCustomPropertyValue
      }
      writeLocalValues(context, values)
      return values
    }
  }
  return readLocalValues(context)
}

export async function setContactCustomValue(context: ContactCustomPropertyContext, leadId: string, propertyId: string, value: ContactCustomPropertyValue): Promise<void> {
  const client = getSupabaseClient()
  if (context.mode === 'supabase' && client && context.userId) {
    if (value === null || value === '') {
      const { error } = await (client as any).from('contact_custom_property_values').delete().eq('organization_id', context.workspaceId).eq('lead_id', leadId).eq('property_id', propertyId)
      if (error) throw error
      return
    }
    const { error } = await (client as any).from('contact_custom_property_values').upsert({ organization_id: context.workspaceId, lead_id: leadId, property_id: propertyId, value_json: value, updated_by: context.userId, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,lead_id,property_id' })
    if (error) throw error
    return
  }
  const values = readLocalValues(context)
  values[leadId] = values[leadId] ?? {}
  if (value === null || value === '') delete values[leadId][propertyId]
  else values[leadId][propertyId] = value
  if (Object.keys(values[leadId]).length === 0) delete values[leadId]
  writeLocalValues(context, values)
}

export const formatContactCustomValue = (property: ContactCustomProperty, value: ContactCustomPropertyValue | undefined): string => {
  if (value === undefined || value === null || value === '') return '—'
  if (property.type === 'checkbox') return value === true ? 'Sim' : 'Não'
  if (property.type === 'currency') return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)
  if (property.type === 'number') return new Intl.NumberFormat('pt-BR').format(Number(value) || 0)
  if (property.type === 'date') {
    const date = new Date(String(value) + (String(value).length <= 10 ? 'T12:00:00' : ''))
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('pt-BR').format(date)
  }
  return String(value)
}

export const compareContactCustomValues = (property: ContactCustomProperty, left: ContactCustomPropertyValue | undefined, right: ContactCustomPropertyValue | undefined): number => {
  if (left == null && right == null) return 0
  if (left == null) return 1
  if (right == null) return -1
  if (property.type === 'number' || property.type === 'currency') return Number(left) - Number(right)
  if (property.type === 'checkbox') return Number(Boolean(left)) - Number(Boolean(right))
  if (property.type === 'date') return String(left).localeCompare(String(right))
  return String(left).localeCompare(String(right), 'pt-BR')
}
