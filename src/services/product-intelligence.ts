import type { ProductLifecycleStatus, ProductRecord, ProposalLineItem, WorkspaceSnapshot } from '../domain/types'

export interface ProductCommercialIntelligence {
  productId: string
  proposals: number
  openProposals: number
  wonProposals: number
  lostProposals: number
  winRate: number | null
  averageSoldUnitPrice: number
  averageDiscountPercent: number
  pipelineTcv: number
  bookingsTcv: number
  bookedMrr: number
  averageMarginPercent: number
  coSold: Array<{ productId: string; name: string; count: number }>
}

export interface ProductReadinessDimension { key: 'identity' | 'pricing' | 'positioning' | 'sales'; label: string; score: number }

const itemTcv = (item: ProposalLineItem, months: number) => item.billingType === 'recurring'
  ? Math.max(0, item.recurringMonthlyTotal) * Math.max(1, months || 12)
  : Math.max(0, item.lineTotal)

const itemMargin = (item: ProposalLineItem) => {
  const cost = Math.max(0, item.unitCostSnapshot ?? 0) * Math.max(0, item.quantity || 0)
  const net = Math.max(0, item.lineTotal - item.lineTax)
  return net > 0 ? (net - cost) / net * 100 : 0
}

export const buildProductCommercialIntelligence = (snapshot: WorkspaceSnapshot, productId: string): ProductCommercialIntelligence => {
  const current = snapshot.proposals.filter((proposal) => proposal.isCurrentVersion && proposal.items.some((item) => item.productId === productId))
  const won = current.filter((proposal) => Boolean(proposal.closedWonAt))
  const lost = current.filter((proposal) => proposal.status === 'rejected')
  const open = current.filter((proposal) => !proposal.closedWonAt && !['rejected', 'cancelled', 'expired'].includes(proposal.status))
  const lines = current.flatMap((proposal) => proposal.items.filter((item) => item.productId === productId))
  const decided = won.length + lost.length
  const coSold = new Map<string, number>()
  current.forEach((proposal) => proposal.items.forEach((item) => {
    if (!item.productId || item.productId === productId) return
    coSold.set(item.productId, (coSold.get(item.productId) ?? 0) + 1)
  }))
  const productName = new Map(snapshot.products.map((product) => [product.id, product.name]))
  return {
    productId,
    proposals: current.length,
    openProposals: open.length,
    wonProposals: won.length,
    lostProposals: lost.length,
    winRate: decided ? won.length / decided * 100 : null,
    averageSoldUnitPrice: lines.length ? lines.reduce((sum, item) => sum + item.unitPrice, 0) / lines.length : 0,
    averageDiscountPercent: lines.length ? lines.reduce((sum, item) => sum + item.discountPercent, 0) / lines.length : 0,
    pipelineTcv: open.reduce((sum, proposal) => sum + proposal.items.filter((item) => item.productId === productId).reduce((inner, item) => inner + itemTcv(item, proposal.contractTermMonths), 0), 0),
    bookingsTcv: won.reduce((sum, proposal) => sum + proposal.items.filter((item) => item.productId === productId).reduce((inner, item) => inner + itemTcv(item, proposal.contractTermMonths), 0), 0),
    bookedMrr: won.reduce((sum, proposal) => sum + proposal.items.filter((item) => item.productId === productId).reduce((inner, item) => inner + Math.max(0, item.recurringMonthlyTotal), 0), 0),
    averageMarginPercent: lines.length ? lines.reduce((sum, item) => sum + itemMargin(item), 0) / lines.length : 0,
    coSold: [...coSold.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, count]) => ({ productId: id, name: productName.get(id) ?? 'Produto removido', count })),
  }
}

export const productLifecycleLabel = (status: ProductLifecycleStatus | undefined) => ({ draft: 'Rascunho', ready: 'Pronto para vender', active: 'Ativo no catálogo', archived: 'Arquivado' }[status ?? 'draft'])

export const productCommercialHealth = (product: ProductRecord) => {
  const pricingMode = product.pricingMode ?? 'fixed'
  const hasValidPrice = pricingMode === 'free' || pricingMode === 'quote' || pricingMode === 'custom' || product.unitPrice > 0
  const identityScore = Math.round(([Boolean(product.name.trim()), Boolean(product.category.trim()), Boolean(product.description.trim()), Boolean(product.unitLabel?.trim())].filter(Boolean).length / 4) * 100)
  const pricingScore = Math.round(([hasValidPrice, product.billingType === 'one_time' || Boolean(product.billingInterval), Number.isFinite(product.taxRate), (product.maxDiscountPercent ?? 0) >= (product.defaultDiscountPercent ?? 0)].filter(Boolean).length / 4) * 100)
  const positioningScore = Math.round(([Boolean(product.valueProposition?.trim()), Boolean(product.targetCustomer?.trim())].filter(Boolean).length / 2) * 100)
  const salesSignals = [product.salesProblems?.length, product.salesBenefits?.length, product.discoveryQuestions?.length, product.objectionNotes?.length, product.salesProofs?.length].filter((value) => Number(value) > 0).length
  const salesScore = Math.round(Math.min(1, salesSignals / 3) * 100)
  const dimensions: ProductReadinessDimension[] = [
    { key: 'identity', label: 'Identidade', score: identityScore },
    { key: 'pricing', label: 'Preço', score: pricingScore },
    { key: 'positioning', label: 'Posicionamento', score: positioningScore },
    { key: 'sales', label: 'Venda', score: salesScore },
  ]
  const score = Math.round(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length)
  const gaps: string[] = []
  if (!product.description.trim()) gaps.push('Descrição comercial ausente')
  if (!product.valueProposition?.trim()) gaps.push('Proposta de valor ausente')
  if (!product.targetCustomer?.trim()) gaps.push('Público-alvo não definido')
  if (!hasValidPrice) gaps.push('Preço comercial não definido')
  if (!salesSignals) gaps.push('Conhecimento de venda ainda não estruturado')
  const ready = identityScore >= 75 && pricingScore >= 75 && positioningScore >= 100
  const sellable = Boolean(product.active && (product.lifecycleStatus ?? (product.active ? 'active' : 'draft')) === 'active' && ready)
  return { score, gaps, dimensions, ready, sellable }
}
