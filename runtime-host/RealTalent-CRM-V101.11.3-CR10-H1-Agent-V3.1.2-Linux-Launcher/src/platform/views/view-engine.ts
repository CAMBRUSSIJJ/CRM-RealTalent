import type { FieldKind, PlatformRecord } from '../metadata/types'
import { fieldRegistry } from '../metadata/field-registry'
import type { FilterAst, FilterCondition, FilterScalar } from './filter-ast'
import { validateFilterAst } from './filter-ast'
import type { ViewDefinition, ViewGroupDefinition, ViewSortDefinition } from './view-definition'

export type ViewValueResolver<T> = (record: T, fieldId: string) => unknown

export interface ViewExecutionResult<T> {
  records: T[]
  groups: Array<{ key: string; label: string; records: T[] }>
  diagnostics: ReturnType<typeof validateFilterAst>
}

const normalizeText = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('pt-BR')
const asNumber = (value: unknown) => typeof value === 'number' ? value : Number(value)
const asTimestamp = (value: unknown) => {
  if (value === null || value === undefined || value === '') return Number.NaN
  const timestamp = new Date(String(value)).getTime()
  return Number.isFinite(timestamp) ? timestamp : Number.NaN
}

const resolveRelativeDate = (value: FilterScalar | undefined): FilterScalar | undefined => {
  if (typeof value !== 'string' || !value.startsWith('@')) return value
  const now = new Date()
  if (value === '@now') return now.toISOString()
  if (value === '@startOfToday') { now.setHours(0, 0, 0, 0); return now.toISOString() }
  if (value === '@endOfToday') { now.setHours(23, 59, 59, 999); return now.toISOString() }
  const daysAgo = value.match(/^@daysAgo:(\d+)$/)
  if (daysAgo) { now.setDate(now.getDate() - Number(daysAgo[1])); return now.toISOString() }
  const daysAhead = value.match(/^@daysAhead:(\d+)$/)
  if (daysAhead) { now.setDate(now.getDate() + Number(daysAhead[1])); return now.toISOString() }
  return value
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)

const compareScalar = (left: unknown, right: unknown, kind: FieldKind | null): number => {
  if (kind === 'number') {
    const a = asNumber(left); const b = asNumber(right)
    if (!Number.isFinite(a) && !Number.isFinite(b)) return 0
    if (!Number.isFinite(a)) return 1
    if (!Number.isFinite(b)) return -1
    return a - b
  }
  if (kind === 'date') {
    const a = asTimestamp(left); const b = asTimestamp(right)
    if (!Number.isFinite(a) && !Number.isFinite(b)) return 0
    if (!Number.isFinite(a)) return 1
    if (!Number.isFinite(b)) return -1
    return a - b
  }
  return String(left ?? '').localeCompare(String(right ?? ''), 'pt-BR', { numeric: true, sensitivity: 'base' })
}

const conditionMatches = (recordValue: unknown, node: FilterCondition, fieldKind: FieldKind | null) => {
  const rawValue = Array.isArray(node.value) ? node.value.map(resolveRelativeDate) : resolveRelativeDate(node.value)
  if (node.operator === 'is_empty') return isEmpty(recordValue)
  if (node.operator === 'is_not_empty') return !isEmpty(recordValue)
  if (node.operator === 'includes' || node.operator === 'not_includes') {
    const values = Array.isArray(recordValue) ? recordValue : [recordValue]
    const matched = values.some((item) => normalizeText(item) === normalizeText(rawValue))
    return node.operator === 'includes' ? matched : !matched
  }
  if (node.operator === 'contains' || node.operator === 'not_contains') {
    const matched = normalizeText(recordValue).includes(normalizeText(rawValue))
    return node.operator === 'contains' ? matched : !matched
  }
  if (node.operator === 'in' || node.operator === 'not_in') {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue]
    const matched = values.some((item) => normalizeText(item) === normalizeText(recordValue))
    return node.operator === 'in' ? matched : !matched
  }
  if (node.operator === 'eq' || node.operator === 'neq') {
    const matched = fieldKind === 'number'
      ? asNumber(recordValue) === asNumber(rawValue)
      : normalizeText(recordValue) === normalizeText(rawValue)
    return node.operator === 'eq' ? matched : !matched
  }
  if (['before', 'after', 'on_or_before', 'on_or_after'].includes(node.operator)) {
    const left = asTimestamp(recordValue); const right = asTimestamp(rawValue)
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false
    if (node.operator === 'before') return left < right
    if (node.operator === 'after') return left > right
    if (node.operator === 'on_or_before') return left <= right
    return left >= right
  }
  const left = asNumber(recordValue); const right = asNumber(rawValue)
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false
  if (node.operator === 'gt') return left > right
  if (node.operator === 'gte') return left >= right
  if (node.operator === 'lt') return left < right
  if (node.operator === 'lte') return left <= right
  return true
}

const metadataFieldKind = (view: ViewDefinition, fieldId: string): FieldKind | null => {
  const derived = view.derivedFields?.find((field) => field.id === fieldId)
  if (derived) return derived.kind
  const prefix = `${view.objectKey}.`
  const field = fieldId.startsWith(prefix) ? fieldId.slice(prefix.length) : fieldId
  return fieldRegistry.get(view.objectKey, field)?.kind ?? null
}

export const defaultPlatformRecordResolver: ViewValueResolver<PlatformRecord> = (record, fieldId) => {
  const prefix = `${record.objectKey}.`
  const field = fieldId.startsWith(prefix) ? fieldId.slice(prefix.length) : fieldId
  if (field === 'id') return record.id
  if (field === 'workspaceId') return record.workspaceId
  if (field === 'label') return record.label
  if (field in record.attributes) return record.attributes[field]
  if (field in record.relationIds) return record.relationIds[field]
  return (record.legacy as unknown as Record<string, unknown>)[field]
}

const evaluateAst = <T>(node: FilterAst, record: T, resolver: ViewValueResolver<T>, view: ViewDefinition): boolean => {
  if (node.kind === 'group') {
    if (node.operator === 'and') return node.children.every((child) => evaluateAst(child, record, resolver, view))
    return node.children.some((child) => evaluateAst(child, record, resolver, view))
  }
  if (node.kind === 'not') return !evaluateAst(node.child, record, resolver, view)
  return conditionMatches(resolver(record, node.fieldId), node, metadataFieldKind(view, node.fieldId))
}

const compareWithSort = <T>(a: T, b: T, sort: ViewSortDefinition, resolver: ViewValueResolver<T>, view: ViewDefinition) => {
  const left = resolver(a, sort.fieldId)
  const right = resolver(b, sort.fieldId)
  const leftEmpty = isEmpty(left); const rightEmpty = isEmpty(right)
  if (leftEmpty || rightEmpty) {
    if (leftEmpty && rightEmpty) return 0
    const emptyOrder = sort.nulls === 'first' ? -1 : 1
    return leftEmpty ? emptyOrder : -emptyOrder
  }
  const kind = sort.strategy === 'number' ? 'number' : sort.strategy === 'date' ? 'date' : sort.strategy === 'text' ? 'text' : metadataFieldKind(view, sort.fieldId)
  const result = compareScalar(left, right, kind)
  return sort.direction === 'asc' ? result : -result
}

const groupRecords = <T>(records: T[], grouping: ViewGroupDefinition[], resolver: ViewValueResolver<T>) => {
  if (!grouping.length) return [{ key: '__all__', label: 'Todos', records }]
  const group = grouping[0]
  const buckets = new Map<string, T[]>()
  for (const record of records) {
    const raw = resolver(record, group.fieldId)
    const key = isEmpty(raw) ? '__empty__' : String(raw)
    const bucket = buckets.get(key) ?? []
    bucket.push(record)
    buckets.set(key, bucket)
  }
  const groups = [...buckets.entries()].map(([key, value]) => ({ key, label: key === '__empty__' ? (group.emptyLabel ?? 'Sem valor') : key, records: value }))
  return group.direction === 'desc' ? groups.reverse() : groups
}

export const executeView = <T>(view: ViewDefinition, input: readonly T[], resolver: ViewValueResolver<T>): ViewExecutionResult<T> => {
  const diagnostics = validateFilterAst(view.filters, view.objectKey, view.derivedFields ?? [])
  const records = input.filter((record) => evaluateAst(view.filters, record, resolver, view))
  const sorted = view.sort.length ? [...records].sort((a, b) => {
    for (const sort of view.sort) {
      const result = compareWithSort(a, b, sort, resolver, view)
      if (result !== 0) return result
    }
    return 0
  }) : [...records]
  return { records: sorted, groups: groupRecords(sorted, view.grouping, resolver), diagnostics }
}
