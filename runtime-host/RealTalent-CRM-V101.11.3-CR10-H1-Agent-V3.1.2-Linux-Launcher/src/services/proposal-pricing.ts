import type { ProductRecord, ProposalLineItem } from '../domain/types'

export type ProposalPricingSource = 'catalog' | 'manual'

export interface ProposalPricingPolicyResult {
  marginPercent: number
  grossMarginAmount: number
  discountWithinPolicy: boolean
  marginWithinPolicy: boolean
  requiresApproval: boolean
  reasons: string[]
}

export const calculateProposalLine = (item: Pick<ProposalLineItem, 'quantity' | 'unitPrice' | 'discountPercent' | 'taxRate' | 'billingType' | 'billingInterval'>) => {
  const quantity = Math.max(0.01, Number(item.quantity || 1))
  const unitPrice = Math.max(0, Number(item.unitPrice || 0))
  const discountPercent = Math.min(100, Math.max(0, Number(item.discountPercent || 0)))
  const taxRate = Math.max(0, Number(item.taxRate || 0))
  const lineSubtotal = quantity * unitPrice
  const lineDiscount = lineSubtotal * discountPercent / 100
  const taxable = lineSubtotal - lineDiscount
  const lineTax = taxable * taxRate / 100
  const lineTotal = taxable + lineTax
  const recurringMonthlyTotal = item.billingType === 'recurring'
    ? lineTotal * (item.billingInterval === 'year' ? 1 / 12 : item.billingInterval === 'quarter' ? 1 / 3 : 1)
    : 0
  return { quantity, unitPrice, discountPercent, taxRate, lineSubtotal, lineDiscount, lineTax, lineTotal, recurringMonthlyTotal }
}

export const calculateProposalTotals = (items: ProposalLineItem[], contractTermMonths = 12) => {
  const base = items.reduce((totals, item) => {
    const line = calculateProposalLine(item)
    totals.subtotal += line.lineSubtotal
    totals.discountTotal += line.lineDiscount
    totals.taxTotal += line.lineTax
    totals.total += line.lineTotal
    totals.recurringMonthlyTotal += line.recurringMonthlyTotal
    if (item.billingType === 'one_time') totals.oneTimeTotal += line.lineTotal
    return totals
  }, { subtotal: 0, discountTotal: 0, taxTotal: 0, total: 0, recurringMonthlyTotal: 0, oneTimeTotal: 0 })
  const term = Math.max(1, Number(contractTermMonths || 12))
  return {
    ...base,
    annualRecurringTotal: base.recurringMonthlyTotal * 12,
    totalContractValue: base.oneTimeTotal + base.recurringMonthlyTotal * term,
  }
}

export const createProposalLineFromProduct = (product: ProductRecord, id: string): ProposalLineItem => {
  const calculated = calculateProposalLine({
    quantity: 1,
    unitPrice: product.unitPrice,
    discountPercent: product.defaultDiscountPercent ?? 0,
    taxRate: product.taxRate,
    billingType: product.billingType,
    billingInterval: product.billingInterval,
  })
  return {
    id,
    productId: product.id,
    name: product.name,
    description: product.description,
    billingType: product.billingType,
    billingInterval: product.billingInterval,
    pricingSource: 'catalog',
    catalogUnitPrice: product.unitPrice,
    unitCostSnapshot: product.unitCost ?? 0,
    catalogDiscountPercent: product.defaultDiscountPercent ?? 0,
    pricingOverridden: false,
    ...calculated,
  }
}

export const detachProposalLineFromCatalog = (item: ProposalLineItem): ProposalLineItem => ({
  ...item,
  productId: null,
  pricingSource: 'manual',
  catalogUnitPrice: undefined,
  unitCostSnapshot: undefined,
  catalogDiscountPercent: undefined,
  pricingOverridden: false,
})

export const proposalPricingPolicy = (item: ProposalLineItem, product?: ProductRecord | null): ProposalPricingPolicyResult => {
  const cost = Math.max(0, Number(item.unitCostSnapshot ?? product?.unitCost ?? 0))
  const quantity = Math.max(0.01, Number(item.quantity || 1))
  const netBeforeTax = Math.max(0, Number(item.lineSubtotal || quantity * item.unitPrice) - Number(item.lineDiscount || 0))
  const totalCost = cost * quantity
  const grossMarginAmount = netBeforeTax - totalCost
  const marginPercent = netBeforeTax > 0 ? grossMarginAmount / netBeforeTax * 100 : 0
  const maxDiscount = Math.max(0, Math.min(100, Number(product?.maxDiscountPercent ?? 100)))
  const minMargin = Math.max(0, Math.min(100, Number(product?.minMarginPercent ?? 0)))
  const discountWithinPolicy = item.discountPercent <= maxDiscount
  const marginWithinPolicy = marginPercent >= minMargin
  const reasons: string[] = []
  if (!discountWithinPolicy) reasons.push(`Desconto acima do limite de ${Math.round(maxDiscount)}%.`)
  if (!marginWithinPolicy) reasons.push(`Margem abaixo do mínimo de ${Math.round(minMargin)}%.`)
  return { marginPercent, grossMarginAmount, discountWithinPolicy, marginWithinPolicy, requiresApproval: Boolean(product && (!discountWithinPolicy || !marginWithinPolicy)), reasons }
}

export const proposalLineIsOverridden = (item: ProposalLineItem, product?: ProductRecord | null) => {
  if (!item.productId || !product) return false
  const epsilon = 0.005
  return Math.abs(item.unitPrice - product.unitPrice) > epsilon
    || Math.abs(item.discountPercent - (product.defaultDiscountPercent ?? 0)) > epsilon
    || Math.abs(item.taxRate - product.taxRate) > epsilon
    || item.billingType !== product.billingType
    || item.billingInterval !== product.billingInterval
}

export const contractEndFromStartAndMonths = (start: string, months: number) => {
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return ''
  const date = new Date(`${start}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  const term = Math.max(1, Math.round(months || 1))
  const originalDay = date.getUTCDate()
  const targetMonthIndex = date.getUTCMonth() + term
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const anniversary = new Date(Date.UTC(targetYear, targetMonth, Math.min(originalDay, lastDayOfTargetMonth)))
  anniversary.setUTCDate(anniversary.getUTCDate() - 1)
  return anniversary.toISOString().slice(0, 10)
}
