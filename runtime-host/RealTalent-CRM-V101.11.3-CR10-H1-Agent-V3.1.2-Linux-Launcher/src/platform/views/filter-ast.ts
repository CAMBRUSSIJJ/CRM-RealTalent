import { fieldRegistry } from '../metadata/field-registry'
import type { CoreObjectKey, FieldKind } from '../metadata/types'
import type { ViewDerivedFieldDefinition } from './view-definition'

export type FilterLogicalOperator = 'and' | 'or'
export type FilterComparisonOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'not_contains'
  | 'in'
  | 'not_in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'is_empty'
  | 'is_not_empty'
  | 'before'
  | 'after'
  | 'on_or_before'
  | 'on_or_after'
  | 'includes'
  | 'not_includes'

export type FilterScalar = string | number | boolean | null
export type FilterValue = FilterScalar | FilterScalar[]

export interface FilterCondition {
  kind: 'condition'
  id: string
  fieldId: string
  operator: FilterComparisonOperator
  value?: FilterValue
}

export interface FilterGroup {
  kind: 'group'
  id: string
  operator: FilterLogicalOperator
  children: FilterAst[]
}

export interface FilterNot {
  kind: 'not'
  id: string
  child: FilterAst
}

export type FilterAst = FilterCondition | FilterGroup | FilterNot

export interface FilterValidationIssue {
  severity: 'error' | 'warning'
  code: 'unknown_field' | 'unsupported_operator' | 'missing_value' | 'unexpected_value' | 'invalid_group'
  nodeId: string
  fieldId?: string
  message: string
}

const valueOperators = new Set<FilterComparisonOperator>([
  'eq', 'neq', 'contains', 'not_contains', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte',
  'before', 'after', 'on_or_before', 'on_or_after', 'includes', 'not_includes',
])

const operatorMatrix: Record<FieldKind, readonly FilterComparisonOperator[]> = {
  id: ['eq', 'neq', 'in', 'not_in', 'is_empty', 'is_not_empty'],
  text: ['eq', 'neq', 'contains', 'not_contains', 'in', 'not_in', 'is_empty', 'is_not_empty'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'is_empty', 'is_not_empty'],
  boolean: ['eq', 'neq', 'is_empty', 'is_not_empty'],
  date: ['eq', 'neq', 'before', 'after', 'on_or_before', 'on_or_after', 'is_empty', 'is_not_empty'],
  enum: ['eq', 'neq', 'in', 'not_in', 'is_empty', 'is_not_empty'],
  relation: ['eq', 'neq', 'in', 'not_in', 'is_empty', 'is_not_empty'],
  'relation-list': ['includes', 'not_includes', 'is_empty', 'is_not_empty'],
  tags: ['includes', 'not_includes', 'contains', 'not_contains', 'is_empty', 'is_not_empty'],
}

export const filterOperatorsForKind = (kind: FieldKind) => operatorMatrix[kind]

export const emptyFilterAst = (): FilterGroup => ({ kind: 'group', id: 'root', operator: 'and', children: [] })

export const andFilter = (...children: FilterAst[]): FilterGroup => ({
  kind: 'group',
  id: `and-${children.map((item) => item.id).join('-') || 'empty'}`,
  operator: 'and',
  children,
})

export const condition = (id: string, fieldId: string, operator: FilterComparisonOperator, value?: FilterValue): FilterCondition => ({
  kind: 'condition', id, fieldId, operator, ...(value === undefined ? {} : { value }),
})

const resolveFieldKind = (objectKey: CoreObjectKey, fieldId: string, derivedFields: ViewDerivedFieldDefinition[]): FieldKind | null => {
  const derived = derivedFields.find((field) => field.id === fieldId)
  if (derived) return derived.kind
  const prefix = `${objectKey}.`
  const fieldName = fieldId.startsWith(prefix) ? fieldId.slice(prefix.length) : fieldId
  return fieldRegistry.get(objectKey, fieldName)?.kind ?? null
}

export const validateFilterAst = (
  ast: FilterAst,
  objectKey: CoreObjectKey,
  derivedFields: ViewDerivedFieldDefinition[] = [],
): FilterValidationIssue[] => {
  const issues: FilterValidationIssue[] = []
  const visit = (node: FilterAst) => {
    if (node.kind === 'group') {
      if (!Array.isArray(node.children)) issues.push({ severity: 'error', code: 'invalid_group', nodeId: node.id, message: 'Grupo de filtro inválido.' })
      else node.children.forEach(visit)
      return
    }
    if (node.kind === 'not') {
      visit(node.child)
      return
    }
    const fieldKind = resolveFieldKind(objectKey, node.fieldId, derivedFields)
    if (!fieldKind) {
      issues.push({ severity: 'warning', code: 'unknown_field', nodeId: node.id, fieldId: node.fieldId, message: `Campo não registrado na metadata: ${node.fieldId}.` })
      return
    }
    if (!operatorMatrix[fieldKind].includes(node.operator)) {
      issues.push({ severity: 'error', code: 'unsupported_operator', nodeId: node.id, fieldId: node.fieldId, message: `Operador ${node.operator} não é válido para ${fieldKind}.` })
    }
    if (valueOperators.has(node.operator) && node.value === undefined) {
      issues.push({ severity: 'error', code: 'missing_value', nodeId: node.id, fieldId: node.fieldId, message: `O filtro ${node.fieldId} exige valor.` })
    }
    if (!valueOperators.has(node.operator) && node.value !== undefined) {
      issues.push({ severity: 'warning', code: 'unexpected_value', nodeId: node.id, fieldId: node.fieldId, message: `O filtro ${node.fieldId} ignora o valor informado.` })
    }
  }
  visit(ast)
  return issues
}
