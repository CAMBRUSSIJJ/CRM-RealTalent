import type { Database } from '../lib/supabase.types'
import type { NewProductInput, UpdateProductInput } from './crm-repository'

export const productInsertPayload = (input: NewProductInput): Database['public']['Tables']['products']['Insert'] => ({
  organization_id: input.workspaceId,
  name: input.name.trim(),
  sku: input.sku.trim(),
  description: input.description.trim(),
  category: input.category.trim(),
  active: input.active,
  unit_price: input.unitPrice,
  unit_cost: input.unitCost ?? 0,
  product_kind: input.kind ?? 'service',
  commercial_type: input.commercialType ?? undefined,
  unit_label: input.unitLabel?.trim() || 'unidade',
  default_discount_percent: input.defaultDiscountPercent ?? 0,
  max_discount_percent: input.maxDiscountPercent ?? 20,
  min_margin_percent: input.minMarginPercent ?? 0,
  value_proposition: input.valueProposition?.trim() ?? '',
  target_customer: input.targetCustomer?.trim() ?? '',
  sales_notes: input.salesNotes?.trim() ?? '',
  pricing_mode: input.pricingMode ?? 'fixed',
  lifecycle_status: input.lifecycleStatus ?? (input.active ? 'active' : 'draft'),
  sales_problems: input.salesProblems ?? [],
  sales_benefits: input.salesBenefits ?? [],
  discovery_questions: input.discoveryQuestions ?? [],
  objection_notes: input.objectionNotes ?? [],
  sales_proofs: input.salesProofs ?? [],
  competitors: input.competitors ?? [],
  bundle_items: input.bundleItems ?? [],
  billing_type: input.billingType,
  billing_interval: input.billingType === 'recurring' ? (input.billingInterval ?? 'month') : null,
  tax_rate: input.taxRate,
})

export const productUpdatePayload = (input: UpdateProductInput): Database['public']['Tables']['products']['Update'] => {
  const patch: Database['public']['Tables']['products']['Update'] = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.sku !== undefined) patch.sku = input.sku.trim()
  if (input.description !== undefined) patch.description = input.description.trim()
  if (input.category !== undefined) patch.category = input.category.trim()
  if (input.active !== undefined) patch.active = input.active
  if (input.unitPrice !== undefined) patch.unit_price = input.unitPrice
  if (input.unitCost !== undefined) patch.unit_cost = input.unitCost
  if (input.kind !== undefined) patch.product_kind = input.kind
  if (input.commercialType !== undefined) patch.commercial_type = input.commercialType
  if (input.unitLabel !== undefined) patch.unit_label = input.unitLabel.trim()
  if (input.defaultDiscountPercent !== undefined) patch.default_discount_percent = input.defaultDiscountPercent
  if (input.maxDiscountPercent !== undefined) patch.max_discount_percent = input.maxDiscountPercent
  if (input.minMarginPercent !== undefined) patch.min_margin_percent = input.minMarginPercent
  if (input.valueProposition !== undefined) patch.value_proposition = input.valueProposition.trim()
  if (input.targetCustomer !== undefined) patch.target_customer = input.targetCustomer.trim()
  if (input.salesNotes !== undefined) patch.sales_notes = input.salesNotes.trim()
  if (input.pricingMode !== undefined) patch.pricing_mode = input.pricingMode
  if (input.lifecycleStatus !== undefined) patch.lifecycle_status = input.lifecycleStatus
  if (input.salesProblems !== undefined) patch.sales_problems = input.salesProblems
  if (input.salesBenefits !== undefined) patch.sales_benefits = input.salesBenefits
  if (input.discoveryQuestions !== undefined) patch.discovery_questions = input.discoveryQuestions
  if (input.objectionNotes !== undefined) patch.objection_notes = input.objectionNotes
  if (input.salesProofs !== undefined) patch.sales_proofs = input.salesProofs
  if (input.competitors !== undefined) patch.competitors = input.competitors
  if (input.bundleItems !== undefined) patch.bundle_items = input.bundleItems
  if (input.billingType !== undefined) patch.billing_type = input.billingType
  if (input.billingInterval !== undefined) patch.billing_interval = input.billingInterval
  if (input.taxRate !== undefined) patch.tax_rate = input.taxRate
  return patch
}
