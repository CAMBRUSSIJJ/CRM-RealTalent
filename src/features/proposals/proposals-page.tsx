import { useEffect, useMemo, useState } from 'react'
import {
  BadgeDollarSign, Boxes, CalendarClock, Check, ChevronDown, ChevronRight, CircleDollarSign,
  CopyPlus, FilePenLine, FileText, Flag, Plus, ReceiptText, Search, Send, Star, TrendingUp, XCircle,
} from 'lucide-react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { StatusPill } from '../../components/ui/status-pill'
import type {
  ForecastCategory, ProductBillingInterval, ProductBillingType, ProductRecord, ProposalLineItem,
  ProposalRecord, ProposalStatus, RevenueStatus, RevenueType,
} from '../../domain/types'
import { formatCurrency } from '../../domain/formatters'
import { createId } from '../../lib/id'
import { calculateProposalLine, calculateProposalTotals, calculateRevenueForecast, calculateRevenueSeries } from '../../services/revenue-forecast'

type Tab = 'proposals' | 'products' | 'revenue' | 'forecast'
type ProposalFilter = 'all' | 'draft' | 'waiting' | 'accepted' | 'closed' | 'expired'
type OfficialFilter = 'all' | 'official' | 'alternative'
type ProposalSort = 'updated' | 'close' | 'tcv' | 'mrr' | 'validity'

const proposalStatus: Record<ProposalStatus, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  sent: { label: 'Enviada', tone: 'info' },
  viewed: { label: 'Visualizada', tone: 'warning' },
  accepted: { label: 'Aceita', tone: 'success' },
  rejected: { label: 'Recusada', tone: 'danger' },
  expired: { label: 'Expirada', tone: 'warning' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
}
const forecastLabels: Record<ForecastCategory, string> = { pipeline: 'Pipeline', best_case: 'Melhor cenário', commit: 'Comprometido', closed: 'Fechado', omitted: 'Fora da previsão' }
const percent = (value: number) => `${Math.round(value)}%`
const dateInput = (date: Date) => { const copy = new Date(date); copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset()); return copy.toISOString().slice(0, 10) }
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value)) : '—'
const isPast = (value: string | null) => Boolean(value && new Date(`${value}T23:59:59`).getTime() < Date.now())

const newLine = (product?: ProductRecord): ProposalLineItem => {
  const base = calculateProposalLine({ quantity: 1, unitPrice: product?.unitPrice ?? 0, discountPercent: 0, taxRate: product?.taxRate ?? 0, billingType: product?.billingType ?? 'one_time', billingInterval: product?.billingInterval ?? null })
  return { id: createId('proposal-item'), productId: product?.id ?? null, name: product?.name ?? '', description: product?.description ?? '', billingType: product?.billingType ?? 'one_time', billingInterval: product?.billingInterval ?? null, ...base }
}

function ProductModal({ open, product, onClose }: { open: boolean; product: ProductRecord | null; onClose(): void }) {
  const { createProduct, updateProduct } = useApp()
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('0')
  const [billingType, setBillingType] = useState<ProductBillingType>('one_time')
  const [interval, setInterval] = useState<ProductBillingInterval>(null)
  const [taxRate, setTaxRate] = useState('0')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(product?.name ?? '')
    setSku(product?.sku ?? '')
    setDescription(product?.description ?? '')
    setCategory(product?.category ?? '')
    setPrice(String(product?.unitPrice ?? 0))
    setBillingType(product?.billingType ?? 'one_time')
    setInterval(product?.billingInterval ?? null)
    setTaxRate(String(product?.taxRate ?? 0))
  }, [open, product])

  const submit = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const input = { name, sku, description, category, active: product?.active ?? true, unitPrice: Number(price || 0), billingType, billingInterval: billingType === 'recurring' ? (interval ?? 'month' as const) : null, taxRate: Number(taxRate || 0) }
      if (product) await updateProduct(product.id, input)
      else await createProduct(input)
      onClose()
    } finally { setSaving(false) }
  }

  return <Modal open={open} title={product ? 'Editar produto ou serviço' : 'Novo produto ou serviço'} subtitle="Cadastre preço, imposto e recorrência para reutilizar nas propostas." size="lg" onClose={onClose} footer={<><span className="modal__footer-spacer"/><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={() => void submit()}>Salvar</Button></>}>
    <div className="form-grid">
      <label className="form-field"><span>Nome</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="form-field"><span>SKU</span><input value={sku} onChange={(event) => setSku(event.target.value)} placeholder="Opcional" /></label>
      <label className="form-field form-field--full"><span>Descrição</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label>
      <label className="form-field"><span>Categoria</span><input value={category} onChange={(event) => setCategory(event.target.value)} /></label>
      <label className="form-field"><span>Preço unitário (R$)</span><input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
      <label className="form-field"><span>Cobrança</span><select value={billingType} onChange={(event) => { const next = event.target.value as ProductBillingType; setBillingType(next); setInterval(next === 'recurring' ? 'month' : null) }}><option value="one_time">Única</option><option value="recurring">Recorrente</option></select></label>
      {billingType === 'recurring' ? <label className="form-field"><span>Periodicidade</span><select value={interval ?? 'month'} onChange={(event) => setInterval(event.target.value as ProductBillingInterval)}><option value="month">Mensal</option><option value="quarter">Trimestral</option><option value="year">Anual</option></select></label> : null}
      <label className="form-field"><span>Imposto (%)</span><input type="number" min="0" step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /></label>
    </div>
  </Modal>
}

function ProposalModal({ open, proposal, onClose }: { open: boolean; proposal: ProposalRecord | null; onClose(): void }) {
  const { snapshot, createProposal, updateProposal } = useApp()
  const leads = useMemo(() => snapshot?.leads.filter((lead) => lead.status === 'active' || lead.id === proposal?.leadId) ?? [], [proposal?.leadId, snapshot])
  const products = useMemo(() => snapshot?.products.filter((item) => item.active) ?? [], [snapshot])
  const [leadId, setLeadId] = useState('')
  const [title, setTitle] = useState('Proposta comercial')
  const [forecastCategory, setForecastCategory] = useState<ForecastCategory>('pipeline')
  const [probability, setProbability] = useState('30')
  const [validUntil, setValidUntil] = useState('')
  const [expectedCloseAt, setExpectedCloseAt] = useState('')
  const [contractStartAt, setContractStartAt] = useState('')
  const [contractEndAt, setContractEndAt] = useState('')
  const [contractTermMonths, setContractTermMonths] = useState('12')
  const [autoRenew, setAutoRenew] = useState(true)
  const [postSaleStartAt, setPostSaleStartAt] = useState('')
  const [postSaleCadenceName, setPostSaleCadenceName] = useState('Onboarding padrão')
  const [makeOfficial, setMakeOfficial] = useState(true)
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('Validade sujeita à disponibilidade e aceite formal.')
  const [items, setItems] = useState<ProposalLineItem[]>([newLine()])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const validity = new Date(); validity.setDate(validity.getDate() + 15)
    const close = new Date(); close.setDate(close.getDate() + 10)
    const start = new Date(); start.setDate(start.getDate() + 20)
    setLeadId(proposal?.leadId ?? leads[0]?.id ?? '')
    setTitle(proposal?.title ?? 'Proposta comercial')
    setForecastCategory(proposal?.forecastCategory ?? 'pipeline')
    setProbability(String(proposal?.probability ?? 30))
    setValidUntil(proposal?.validUntil ?? dateInput(validity))
    setExpectedCloseAt(proposal?.expectedCloseAt ?? dateInput(close))
    setContractStartAt(proposal?.contractStartAt ?? dateInput(start))
    setContractEndAt(proposal?.contractEndAt ?? '')
    setContractTermMonths(String(proposal?.contractTermMonths ?? 12))
    setAutoRenew(proposal?.autoRenew ?? true)
    setPostSaleStartAt(proposal?.postSaleStartAt ?? dateInput(start))
    setPostSaleCadenceName(proposal?.postSaleCadenceName ?? 'Onboarding padrão')
    setMakeOfficial(proposal?.isOfficial ?? true)
    setNotes(proposal?.notes ?? '')
    setTerms(proposal?.terms ?? 'Validade sujeita à disponibilidade e aceite formal.')
    setItems(proposal?.items.length ? proposal.items : [newLine()])
  }, [open, proposal, leads])

  const term = Math.max(1, Number(contractTermMonths || 12))
  const totals = useMemo(() => calculateProposalTotals(items, term), [items, term])
  const patchLine = (id: string, patch: Partial<ProposalLineItem>) => setItems((current) => current.map((item) => {
    if (item.id !== id) return item
    const next = { ...item, ...patch }
    return { ...next, ...calculateProposalLine(next) }
  }))
  const pickProduct = (lineId: string, productId: string) => {
    const product = products.find((item) => item.id === productId)
    if (!product) return
    const next = newLine(product)
    patchLine(lineId, { ...next, id: lineId })
  }

  const submit = async () => {
    if (!leadId || !title.trim() || !items.length || items.some((item) => !item.name.trim())) return
    setSaving(true)
    try {
      const lead = snapshot?.leads.find((item) => item.id === leadId)
      const input = {
        leadId,
        opportunityId: lead?.opportunityId ?? null,
        companyId: lead?.companyId ?? null,
        contactId: lead?.primaryContactId ?? null,
        title,
        status: proposal?.status ?? 'draft' as ProposalStatus,
        forecastCategory,
        probability: Number(probability || 0),
        currency: 'BRL' as const,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        recurringMonthlyTotal: totals.recurringMonthlyTotal,
        oneTimeTotal: totals.oneTimeTotal,
        annualRecurringTotal: totals.annualRecurringTotal,
        totalContractValue: totals.totalContractValue,
        isOfficial: proposal?.isOfficial ?? makeOfficial,
        isCurrentVersion: true,
        expectedCloseAt: expectedCloseAt || null,
        contractStartAt: contractStartAt || null,
        contractEndAt: contractEndAt || null,
        contractTermMonths: term,
        autoRenew,
        postSaleStartAt: postSaleStartAt || null,
        postSaleCadenceName,
        validUntil: validUntil || null,
        ownerId: lead?.ownerId ?? null,
        notes,
        terms,
        items,
      }
      if (proposal) await updateProposal(proposal.id, input)
      else await createProposal(input)
      onClose()
    } finally { setSaving(false) }
  }

  return <Modal open={open} size="full" title={proposal ? `Editar ${proposal.proposalNumber} · v${proposal.version}` : 'Nova proposta'} subtitle="Separe validade, previsão de fechamento, contrato e pós-venda." onClose={onClose} footer={<><div className="proposal-modal-totals"><span>TCV <strong>{formatCurrency(totals.totalContractValue)}</strong></span><span>MRR <strong>{formatCurrency(totals.recurringMonthlyTotal)}</strong></span><span>ARR <strong>{formatCurrency(totals.annualRecurringTotal)}</strong></span><span>Única <strong>{formatCurrency(totals.oneTimeTotal)}</strong></span></div><span className="modal__footer-spacer"/><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={() => void submit()}>Salvar proposta</Button></>}>
    <div className="proposal-editor">
      <section className="proposal-editor__meta">
        <div className="form-grid">
          <label className="form-field"><span>Lead</span><select value={leadId} disabled={Boolean(proposal)} onChange={(event) => setLeadId(event.target.value)}>{leads.map((lead) => <option value={lead.id} key={lead.id}>{lead.name} · {lead.company}</option>)}</select></label>
          <label className="form-field"><span>Título</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="form-field"><span>Categoria do forecast</span><select value={forecastCategory} onChange={(event) => setForecastCategory(event.target.value as ForecastCategory)}><option value="pipeline">Pipeline</option><option value="best_case">Melhor cenário</option><option value="commit">Comprometido</option><option value="omitted">Fora da previsão</option></select></label>
          <label className="form-field"><span>Probabilidade (%)</span><input type="number" min="0" max="100" value={probability} onChange={(event) => setProbability(event.target.value)} /></label>
          <label className="form-field"><span>Fechamento previsto</span><input type="date" value={expectedCloseAt} onChange={(event) => setExpectedCloseAt(event.target.value)} /></label>
          <label className="form-field"><span>Validade para aceite</span><input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></label>
          <label className="form-field"><span>Início do contrato</span><input type="date" value={contractStartAt} onChange={(event) => setContractStartAt(event.target.value)} /></label>
          <label className="form-field"><span>Duração (meses)</span><input type="number" min="1" max="600" value={contractTermMonths} onChange={(event) => setContractTermMonths(event.target.value)} /></label>
          <label className="form-field"><span>Fim do contrato</span><input type="date" value={contractEndAt} onChange={(event) => setContractEndAt(event.target.value)} /></label>
          <label className="form-field"><span>Início do pós-venda</span><input type="date" value={postSaleStartAt} onChange={(event) => setPostSaleStartAt(event.target.value)} /></label>
          <label className="form-field"><span>Cadência pós-venda</span><input value={postSaleCadenceName} onChange={(event) => setPostSaleCadenceName(event.target.value)} /></label>
          <label className="form-field proposal-check"><input type="checkbox" checked={autoRenew} onChange={(event) => setAutoRenew(event.target.checked)} /><span>Renovação automática</span></label>
          {!proposal ? <label className="form-field proposal-check"><input type="checkbox" checked={makeOfficial} onChange={(event) => setMakeOfficial(event.target.checked)} /><span>Definir como proposta oficial</span></label> : null}
          <label className="form-field form-field--full"><span>Observações internas</span><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <label className="form-field form-field--full"><span>Condições comerciais</span><textarea rows={3} value={terms} onChange={(event) => setTerms(event.target.value)} /></label>
        </div>
      </section>
      <section className="proposal-line-items">
        <header><div><strong>Itens da proposta</strong><small>O TCV considera a duração do contrato; o valor do documento continua separado.</small></div><Button size="sm" variant="secondary" onClick={() => setItems((current) => [...current, newLine()])}><Plus size={14}/> Adicionar item</Button></header>
        {items.map((item) => <article key={item.id}><div className="proposal-item-grid">
          <label><span>Produto</span><select value={item.productId ?? ''} onChange={(event) => pickProduct(item.id, event.target.value)}><option value="">Item manual</option>{products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
          <label className="proposal-item-name"><span>Nome</span><input value={item.name} onChange={(event) => patchLine(item.id, { name: event.target.value })} /></label>
          <label><span>Qtd.</span><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => patchLine(item.id, { quantity: Number(event.target.value) })} /></label>
          <label><span>Unitário</span><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => patchLine(item.id, { unitPrice: Number(event.target.value) })} /></label>
          <label><span>Desconto</span><input type="number" min="0" max="100" value={item.discountPercent} onChange={(event) => patchLine(item.id, { discountPercent: Number(event.target.value) })} /></label>
          <label><span>Cobrança</span><select value={item.billingType} onChange={(event) => patchLine(item.id, { billingType: event.target.value as ProductBillingType, billingInterval: event.target.value === 'recurring' ? 'month' : null })}><option value="one_time">Única</option><option value="recurring">Recorrente</option></select></label>
          <div className="proposal-item-total"><span>Total</span><strong>{formatCurrency(item.lineTotal)}</strong>{item.recurringMonthlyTotal ? <small>{formatCurrency(item.recurringMonthlyTotal)} MRR</small> : null}</div>
          <button type="button" title="Remover item" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((line) => line.id !== item.id))}>×</button>
        </div></article>)}
      </section>
    </div>
  </Modal>
}

function RevenueModal({ open, proposal, onClose }: { open: boolean; proposal: ProposalRecord | null; onClose(): void }) {
  const { snapshot, createRevenueEntry } = useApp()
  const [proposalId, setProposalId] = useState('')
  const [leadId, setLeadId] = useState('')
  const [type, setType] = useState<RevenueType>('one_time')
  const [status, setStatus] = useState<RevenueStatus>('recognized')
  const [amount, setAmount] = useState('0')
  const [mrr, setMrr] = useState('0')
  const [competenceDate, setCompetenceDate] = useState(dateInput(new Date()))
  const [servicePeriodStart, setServicePeriodStart] = useState('')
  const [servicePeriodEnd, setServicePeriodEnd] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [description, setDescription] = useState('Receita manual')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const selected = proposal ?? snapshot?.proposals.find((item) => item.closedWonAt && item.isOfficial && item.isCurrentVersion) ?? null
    setProposalId(selected?.id ?? '')
    setLeadId(selected?.leadId ?? '')
    const recurring = Boolean(selected?.recurringMonthlyTotal && !selected.oneTimeTotal)
    setType(recurring ? 'recurring' : 'one_time')
    setAmount(String(recurring ? selected?.recurringMonthlyTotal ?? 0 : selected?.oneTimeTotal ?? 0))
    setMrr(String(selected?.recurringMonthlyTotal ?? 0))
    setCompetenceDate(dateInput(new Date()))
    setServicePeriodStart(selected?.contractStartAt ?? '')
    setServicePeriodEnd(selected?.contractEndAt ?? '')
    setAdjustmentReason('')
    setDescription(selected ? `${selected.proposalNumber} · ${recurring ? 'mensalidade' : 'receita única'}` : 'Receita manual')
  }, [open, proposal, snapshot])

  const selectedProposal = snapshot?.proposals.find((item) => item.id === proposalId) ?? null
  const selectProposal = (id: string) => {
    setProposalId(id)
    const next = snapshot?.proposals.find((item) => item.id === id)
    if (!next) return
    setLeadId(next.leadId)
    setAmount(String(type === 'recurring' ? next.recurringMonthlyTotal : next.oneTimeTotal))
    setMrr(String(next.recurringMonthlyTotal))
    setServicePeriodStart(next.contractStartAt ?? '')
    setServicePeriodEnd(next.contractEndAt ?? '')
    setDescription(`${next.proposalNumber} · ${type === 'recurring' ? 'mensalidade' : 'receita única'}`)
  }

  const submit = async () => {
    setSaving(true)
    try {
      const lead = snapshot?.leads.find((item) => item.id === leadId)
      await createRevenueEntry({
        proposalId: proposalId || null,
        leadId: leadId || null,
        opportunityId: selectedProposal?.opportunityId ?? lead?.opportunityId ?? null,
        revenueType: type,
        status,
        amount: Number(amount || 0),
        recurringMonthlyAmount: type === 'recurring' ? Number(mrr || amount || 0) : 0,
        recognizedAt: new Date(`${competenceDate}T12:00:00`).toISOString(),
        competenceDate,
        servicePeriodStart: servicePeriodStart || null,
        servicePeriodEnd: servicePeriodEnd || null,
        adjustmentReason,
        description,
        ownerId: selectedProposal?.ownerId ?? lead?.ownerId ?? null,
      })
      onClose()
    } finally { setSaving(false) }
  }

  return <Modal open={open} title="Registrar receita por competência" subtitle="O aceite e o fechamento não geram receita automaticamente." size="lg" onClose={onClose} footer={<><span className="modal__footer-spacer"/><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={() => void submit()}>Registrar</Button></>}>
    <div className="form-grid">
      <label className="form-field form-field--full"><span>Proposta ganha</span><select value={proposalId} onChange={(event) => selectProposal(event.target.value)}><option value="">Lançamento sem proposta</option>{snapshot?.proposals.filter((item) => item.closedWonAt && item.isOfficial && item.isCurrentVersion).map((item) => <option value={item.id} key={item.id}>{item.proposalNumber} · {item.title}</option>)}</select></label>
      <label className="form-field"><span>Tipo</span><select value={type} onChange={(event) => { const next = event.target.value as RevenueType; setType(next); if (selectedProposal) { setAmount(String(next === 'recurring' ? selectedProposal.recurringMonthlyTotal : selectedProposal.oneTimeTotal)); setDescription(`${selectedProposal.proposalNumber} · ${next === 'recurring' ? 'mensalidade' : 'receita única'}`) } }}><option value="one_time">Receita única</option><option value="recurring">Receita recorrente</option></select></label>
      <label className="form-field"><span>Situação</span><select value={status} onChange={(event) => setStatus(event.target.value as RevenueStatus)}><option value="recognized">Reconhecida</option><option value="forecast">Prevista</option></select></label>
      <label className="form-field"><span>Valor da competência (R$)</span><input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      {type === 'recurring' ? <label className="form-field"><span>MRR ativo (R$)</span><input type="number" min="0" step="0.01" value={mrr} onChange={(event) => setMrr(event.target.value)} /></label> : null}
      <label className="form-field"><span>Competência</span><input type="date" value={competenceDate} onChange={(event) => setCompetenceDate(event.target.value)} /></label>
      <label className="form-field"><span>Início do serviço</span><input type="date" value={servicePeriodStart} onChange={(event) => setServicePeriodStart(event.target.value)} /></label>
      <label className="form-field"><span>Fim do serviço</span><input type="date" value={servicePeriodEnd} onChange={(event) => setServicePeriodEnd(event.target.value)} /></label>
      <label className="form-field"><span>Motivo de ajuste</span><input value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder="Obrigatório apenas em correções" /></label>
      <label className="form-field form-field--full"><span>Descrição</span><input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    </div>
  </Modal>
}

export function ProposalsPage() {
  const {
    snapshot, canWrite, updateProduct, deleteProduct, updateProposalStatus, createProposalRevision,
    setOfficialProposal, closeOpportunityFromProposal, deleteProposal, updateRevenueEntryStatus,
  } = useApp()
  const [tab, setTab] = useState<Tab>('proposals')
  const [productModal, setProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null)
  const [proposalModal, setProposalModal] = useState(false)
  const [editingProposal, setEditingProposal] = useState<ProposalRecord | null>(null)
  const [revenueModal, setRevenueModal] = useState(false)
  const [revenueProposal, setRevenueProposal] = useState<ProposalRecord | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProposalFilter>('all')
  const [officialFilter, setOfficialFilter] = useState<OfficialFilter>('all')
  const [sort, setSort] = useState<ProposalSort>('updated')
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const forecast = useMemo(() => snapshot ? calculateRevenueForecast(snapshot) : null, [snapshot])
  const series = useMemo(() => snapshot ? calculateRevenueSeries(snapshot) : [], [snapshot])
  const maxSeries = Math.max(1, ...series.flatMap((item) => [item.recognized, item.forecast]))
  if (!snapshot || !forecast) return null

  const leadName = (id: string) => {
    const lead = snapshot.leads.find((item) => item.id === id)
    return lead ? `${lead.name}${lead.company ? ` · ${lead.company}` : ''}` : 'Lead removido'
  }
  const ownerName = (proposal: ProposalRecord) => snapshot.leads.find((item) => item.id === proposal.leadId)?.ownerName || 'Não atribuído'

  const currentProposals = snapshot.proposals.filter((proposal) => proposal.isCurrentVersion)
  const filtered = currentProposals.filter((proposal) => {
    const lead = snapshot.leads.find((item) => item.id === proposal.leadId)
    const normalized = `${proposal.proposalNumber} ${proposal.title} ${lead?.name ?? ''} ${lead?.company ?? ''}`.toLowerCase()
    const matchesQuery = normalized.includes(query.trim().toLowerCase())
    const matchesOfficial = officialFilter === 'all' || (officialFilter === 'official' ? proposal.isOfficial : !proposal.isOfficial)
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'draft' && proposal.status === 'draft')
      || (statusFilter === 'waiting' && ['sent', 'viewed'].includes(proposal.status))
      || (statusFilter === 'accepted' && proposal.status === 'accepted' && !proposal.closedWonAt)
      || (statusFilter === 'closed' && Boolean(proposal.closedWonAt))
      || (statusFilter === 'expired' && (proposal.status === 'expired' || isPast(proposal.validUntil)))
    return matchesQuery && matchesOfficial && matchesStatus
  }).sort((a, b) => {
    if (sort === 'tcv') return b.totalContractValue - a.totalContractValue
    if (sort === 'mrr') return b.recurringMonthlyTotal - a.recurringMonthlyTotal
    if (sort === 'close') return (a.expectedCloseAt ?? '9999').localeCompare(b.expectedCloseAt ?? '9999')
    if (sort === 'validity') return (a.validUntil ?? '9999').localeCompare(b.validUntil ?? '9999')
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const toggleSelected = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const toggleAll = () => setSelectedIds((current) => paged.every((item) => current.includes(item.id)) ? current.filter((id) => !paged.some((item) => item.id === id)) : [...new Set([...current, ...paged.map((item) => item.id)])])
  const toggleExpanded = (groupId: string) => setExpandedGroups((current) => current.includes(groupId) ? current.filter((item) => item !== groupId) : [...current, groupId])
  const statusAction = async (proposal: ProposalRecord, status: ProposalStatus) => { if (canWrite) await updateProposalStatus(proposal.id, status) }
  const cancelSelected = async () => {
    for (const id of selectedIds) {
      const proposal = snapshot.proposals.find((item) => item.id === id)
      if (proposal && !proposal.closedWonAt && ['draft', 'sent', 'viewed', 'accepted'].includes(proposal.status)) await updateProposalStatus(id, 'cancelled')
    }
    setSelectedIds([])
  }

  return <div className="page-stack proposals-page">
    <section className="panel proposals-hero"><div><span className="eyebrow">Receita comercial</span><h2>Propostas, contratos e forecast</h2><p>Uma versão oficial por oportunidade, fechamento separado e receita por competência.</p></div><Button onClick={() => { setEditingProposal(null); setProposalModal(true) }} disabled={!canWrite}><Plus size={17}/> Nova proposta</Button></section>
    <section className="proposal-kpis">
      <article><span><FileText/></span><small>TCV no Pipeline</small><strong>{formatCurrency(forecast.pipelineTotal)}</strong><em>{forecast.proposals.length} proposta(s) oficiais no mês</em></article>
      <article><span><TrendingUp/></span><small>TCV ponderado</small><strong>{formatCurrency(forecast.weightedForecast)}</strong><em>probabilidade da oportunidade</em></article>
      <article><span><CircleDollarSign/></span><small>Receita reconhecida</small><strong>{formatCurrency(forecast.closedRevenue)}</strong><em>competência atual</em></article>
      <article><span><BadgeDollarSign/></span><small>MRR ativo + previsto</small><strong>{formatCurrency(forecast.activeMrrForecast)}</strong><em>ARR ponderado {formatCurrency(forecast.weightedArr)}</em></article>
    </section>
    <nav className="proposal-tabs" aria-label="Áreas de propostas">{([{ id: 'proposals', label: 'Propostas', icon: FileText }, { id: 'products', label: 'Produtos', icon: Boxes }, { id: 'revenue', label: 'Receita', icon: ReceiptText }, { id: 'forecast', label: 'Forecast', icon: TrendingUp }] as const).map(({ id, label, icon: Icon }) => <button key={id} type="button" className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}><Icon size={16}/>{label}</button>)}</nav>

    {tab === 'proposals' ? <section className="panel proposal-table-panel">
      <div className="proposal-table-toolbar">
        <label className="search-field"><Search size={17}/><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Buscar proposta ou cliente" /></label>
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as ProposalFilter); setPage(1) }}><option value="all">Todos os status</option><option value="draft">Em elaboração</option><option value="waiting">Aguardando cliente</option><option value="accepted">Aceite pendente de fechamento</option><option value="closed">Negócios ganhos</option><option value="expired">Vencidas</option></select>
        <select value={officialFilter} onChange={(event) => { setOfficialFilter(event.target.value as OfficialFilter); setPage(1) }}><option value="all">Oficiais e alternativas</option><option value="official">Somente oficiais</option><option value="alternative">Somente alternativas</option></select>
        <select value={sort} onChange={(event) => setSort(event.target.value as ProposalSort)}><option value="updated">Atualização recente</option><option value="close">Fechamento previsto</option><option value="validity">Validade</option><option value="tcv">Maior TCV</option><option value="mrr">Maior MRR</option></select>
      </div>
      {selectedIds.length ? <div className="proposal-bulk-bar"><strong>{selectedIds.length} selecionada(s)</strong><Button size="sm" variant="secondary" onClick={() => void cancelSelected()}>Cancelar selecionadas</Button><button type="button" onClick={() => setSelectedIds([])}>Limpar</button></div> : null}
      <div className="proposal-table-wrap"><table className="proposal-table"><thead><tr>
        <th><button type="button" className={`pipeline-select ${paged.length && paged.every((item) => selectedIds.includes(item.id)) ? 'is-selected' : ''}`} onClick={toggleAll}>{paged.length && paged.every((item) => selectedIds.includes(item.id)) ? <Check size={13}/> : null}</button></th>
        <th>Proposta</th><th>Oficial</th><th>Status</th><th>Forecast</th><th>Fechamento</th><th>Validade</th><th>TCV</th><th>MRR</th><th>Responsável</th><th>Próxima ação</th><th />
      </tr></thead><tbody>{paged.map((proposal) => {
        const history = snapshot.proposals.filter((item) => item.proposalGroupId === proposal.proposalGroupId && item.id !== proposal.id).sort((a, b) => b.version - a.version)
        const expanded = expandedGroups.includes(proposal.proposalGroupId)
        const nextAction = proposal.closedWonAt ? 'Reconhecer receita' : proposal.status === 'accepted' ? 'Fechar negócio' : proposal.status === 'draft' ? 'Revisar e enviar' : ['sent', 'viewed'].includes(proposal.status) ? 'Aguardar / follow-up' : 'Sem ação'
        return <ProposalRows key={proposal.id} proposal={proposal} history={history} expanded={expanded} selected={selectedIds.includes(proposal.id)} leadLabel={leadName(proposal.leadId)} ownerLabel={ownerName(proposal)} nextAction={nextAction} canWrite={canWrite} onToggleSelected={() => toggleSelected(proposal.id)} onToggleExpanded={() => toggleExpanded(proposal.proposalGroupId)} onEdit={() => { setEditingProposal(proposal); setProposalModal(true) }} onStatus={(status) => void statusAction(proposal, status)} onRevision={() => void createProposalRevision(proposal.id)} onOfficial={() => void setOfficialProposal(proposal.id)} onCloseWon={() => void closeOpportunityFromProposal(proposal.id)} onRevenue={() => { setRevenueProposal(proposal); setRevenueModal(true) }} onDelete={() => void deleteProposal(proposal.id)} />
      })}</tbody></table></div>
      {!paged.length ? <div className="empty-state"><FileText/><strong>Nenhuma proposta encontrada</strong><p>Ajuste os filtros ou crie uma proposta.</p></div> : null}
      <footer className="proposal-pagination"><span>{filtered.length} proposta(s) vigente(s)</span><label>Por página <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}><option value="10">10</option><option value="20">20</option><option value="50">50</option></select></label><Button size="sm" variant="secondary" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button><strong>{safePage} / {totalPages}</strong><Button size="sm" variant="secondary" disabled={safePage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Próxima</Button></footer>
    </section> : null}

    {tab === 'products' ? <section className="panel"><div className="panel__heading"><div><span className="eyebrow">Catálogo</span><h3>Produtos e serviços</h3></div><Button size="sm" onClick={() => { setEditingProduct(null); setProductModal(true) }} disabled={!canWrite}><Plus size={15}/> Novo item</Button></div><div className="product-grid">{snapshot.products.map((product) => <article key={product.id}><div><span>{product.category || 'Sem categoria'}</span><strong>{product.name}</strong><small>{product.sku || 'Sem SKU'}</small></div><div><strong>{formatCurrency(product.unitPrice)}</strong><small>{product.billingType === 'recurring' ? `recorrente · ${product.billingInterval === 'year' ? 'anual' : product.billingInterval === 'quarter' ? 'trimestral' : 'mensal'}` : 'pagamento único'}</small></div><StatusPill tone={product.active ? 'success' : 'neutral'}>{product.active ? 'Ativo' : 'Inativo'}</StatusPill><div><button type="button" onClick={() => { setEditingProduct(product); setProductModal(true) }}><FilePenLine size={16}/></button><button type="button" onClick={() => void updateProduct(product.id, { active: !product.active })}>{product.active ? 'Pausar' : 'Ativar'}</button><button type="button" onClick={() => void deleteProduct(product.id)}>{product.active ? 'Excluir / desativar' : 'Excluir'}</button></div></article>)}</div></section> : null}

    {tab === 'revenue' ? <section className="panel"><div className="panel__heading"><div><span className="eyebrow">Reconhecimento</span><h3>Receitas por competência</h3></div><Button size="sm" onClick={() => { setRevenueProposal(null); setRevenueModal(true) }} disabled={!canWrite}><Plus size={15}/> Registrar receita</Button></div><div className="revenue-list">{snapshot.revenueEntries.map((entry) => <article key={entry.id}><span className={`revenue-icon revenue-icon--${entry.revenueType}`}>{entry.revenueType === 'recurring' ? <CalendarClock/> : <CircleDollarSign/>}</span><div><strong>{entry.description}</strong><small>Competência {formatDate(entry.competenceDate)} · {entry.proposalId ? 'vinculada à proposta' : 'lançamento manual'}</small>{entry.adjustmentReason ? <small>Ajuste: {entry.adjustmentReason}</small> : null}</div><div><strong>{formatCurrency(entry.amount)}</strong>{entry.recurringMonthlyAmount ? <small>{formatCurrency(entry.recurringMonthlyAmount)} MRR ativo</small> : null}</div><StatusPill tone={entry.status === 'recognized' ? 'success' : entry.status === 'forecast' ? 'info' : 'neutral'}>{entry.status === 'recognized' ? 'Reconhecida' : entry.status === 'forecast' ? 'Prevista' : 'Cancelada'}</StatusPill><button type="button" disabled={!canWrite} onClick={() => void updateRevenueEntryStatus(entry.id, entry.status === 'cancelled' ? 'recognized' : 'cancelled')}>{entry.status === 'cancelled' ? 'Reativar' : 'Cancelar'}</button></article>)}</div></section> : null}

    {tab === 'forecast' ? <><section className="forecast-categories">{forecast.byCategory.filter((item) => item.category !== 'omitted').map((item) => <article key={item.category}><span>{forecastLabels[item.category]}</span><strong>{formatCurrency(item.value)}</strong><small>{formatCurrency(item.weightedValue)} ponderado · {item.proposals} oficial(is)</small><small>{formatCurrency(item.mrr)} MRR · {formatCurrency(item.arr)} ARR</small><div><i style={{ width: `${forecast.pipelineTotal ? Math.min(100, item.value / forecast.pipelineTotal * 100) : 0}%` }}/></div></article>)}</section><section className="panel"><div className="panel__heading"><div><span className="eyebrow">Receita e bookings</span><h3>Receita reconhecida e TCV previsto</h3></div><StatusPill tone="info">Melhor cenário {formatCurrency(forecast.bestCaseForecast)}</StatusPill></div><div className="revenue-series">{series.map((item) => <article key={item.month}><span>{item.month}</span><div><i className="is-recognized" style={{ height: `${Math.max(4, item.recognized / maxSeries * 100)}%` }} title={`Reconhecido ${formatCurrency(item.recognized)}`}/><i className="is-forecast" style={{ height: `${Math.max(4, item.forecast / maxSeries * 100)}%` }} title={`TCV ponderado previsto ${formatCurrency(item.forecast)}`}/></div><small>{formatCurrency(item.recognized + item.forecast)}</small></article>)}</div><div className="forecast-summary"><div><span>Comprometido</span><strong>{formatCurrency(forecast.commitForecast)}</strong></div><ChevronRight/><div><span>Ponderado</span><strong>{formatCurrency(forecast.weightedForecast)}</strong></div><ChevronRight/><div><span>Melhor cenário</span><strong>{formatCurrency(forecast.bestCaseForecast)}</strong></div><ChevronRight/><div><span>MRR ponderado</span><strong>{formatCurrency(forecast.weightedMrr)}</strong></div></div></section></> : null}

    <ProductModal open={productModal} product={editingProduct} onClose={() => setProductModal(false)}/>
    <ProposalModal open={proposalModal} proposal={editingProposal} onClose={() => setProposalModal(false)}/>
    <RevenueModal open={revenueModal} proposal={revenueProposal} onClose={() => setRevenueModal(false)}/>
  </div>
}

function ProposalRows(props: {
  proposal: ProposalRecord
  history: ProposalRecord[]
  expanded: boolean
  selected: boolean
  leadLabel: string
  ownerLabel: string
  nextAction: string
  canWrite: boolean
  onToggleSelected(): void
  onToggleExpanded(): void
  onEdit(): void
  onStatus(status: ProposalStatus): void
  onRevision(): void
  onOfficial(): void
  onCloseWon(): void
  onRevenue(): void
  onDelete(): void
}) {
  const { proposal, history, expanded } = props
  return <>
    <tr className={`${props.selected ? 'is-selected' : ''} ${proposal.isOfficial ? 'is-official' : ''}`}>
      <td><button type="button" className={`pipeline-select ${props.selected ? 'is-selected' : ''}`} onClick={props.onToggleSelected}>{props.selected ? <Check size={13}/> : null}</button></td>
      <td><div className="proposal-table__identity"><button type="button" disabled={!history.length} onClick={props.onToggleExpanded}>{history.length ? expanded ? <ChevronDown size={15}/> : <ChevronRight size={15}/> : <span/>}</button><div><span>{proposal.proposalNumber} · v{proposal.version}</span><strong>{proposal.title}</strong><small>{props.leadLabel}{history.length ? ` · ${history.length} revisão(ões) anterior(es)` : ''}</small></div></div></td>
      <td>{proposal.isOfficial ? <span className="proposal-official"><Star size={14}/> Oficial</span> : <button type="button" className="proposal-alternative" disabled={!props.canWrite} onClick={props.onOfficial}><Flag size={14}/> Alternativa</button>}</td>
      <td><StatusPill tone={proposalStatus[proposal.status].tone}>{proposalStatus[proposal.status].label}</StatusPill>{proposal.closedWonAt ? <small className="proposal-closed-label">Negócio ganho</small> : null}</td>
      <td><span className="proposal-forecast-cell">{forecastLabels[proposal.forecastCategory]}<small>{percent(proposal.probability)}</small></span></td>
      <td>{formatDate(proposal.expectedCloseAt)}</td>
      <td className={isPast(proposal.validUntil) && !['accepted', 'cancelled', 'rejected'].includes(proposal.status) ? 'text-danger' : ''}>{formatDate(proposal.validUntil)}</td>
      <td><strong>{formatCurrency(proposal.totalContractValue)}</strong><small className="proposal-cell-note">Única {formatCurrency(proposal.oneTimeTotal)}</small></td>
      <td><strong>{formatCurrency(proposal.recurringMonthlyTotal)}</strong><small className="proposal-cell-note">ARR {formatCurrency(proposal.annualRecurringTotal)}</small></td>
      <td>{props.ownerLabel}</td>
      <td><span className="proposal-next-action">{props.nextAction}</span></td>
      <td><div className="proposal-list__actions"><button type="button" title="Editar" disabled={!props.canWrite || proposal.status !== 'draft'} onClick={props.onEdit}><FilePenLine size={16}/></button>{proposal.status === 'draft' ? <button type="button" title="Enviar" disabled={!props.canWrite} onClick={() => props.onStatus('sent')}><Send size={16}/></button> : null}{['sent', 'viewed'].includes(proposal.status) ? <button type="button" title="Registrar aceite" disabled={!props.canWrite} onClick={() => props.onStatus('accepted')}><Check size={16}/></button> : null}{['sent', 'viewed'].includes(proposal.status) ? <button type="button" title="Recusar proposta" disabled={!props.canWrite} onClick={() => props.onStatus('rejected')}><XCircle size={16}/></button> : null}{proposal.status === 'accepted' && !proposal.closedWonAt ? <button type="button" title="Fechar oportunidade como ganha" disabled={!props.canWrite} onClick={props.onCloseWon}><BadgeDollarSign size={16}/></button> : null}{proposal.closedWonAt ? <button type="button" title="Reconhecer receita" disabled={!props.canWrite} onClick={props.onRevenue}><ReceiptText size={16}/></button> : null}<button type="button" title={proposal.closedWonAt ? 'Negócio ganho não pode ser revisado' : 'Nova revisão'} disabled={!props.canWrite || Boolean(proposal.closedWonAt)} onClick={props.onRevision}><CopyPlus size={16}/></button><button type="button" title="Excluir" disabled={!props.canWrite || proposal.isOfficial || proposal.status === 'accepted' || Boolean(proposal.closedWonAt)} onClick={props.onDelete}><span>×</span></button></div></td>
    </tr>
    {expanded ? history.map((revision) => <tr className="proposal-history-row" key={revision.id}><td/><td><div className="proposal-history"><span>{revision.proposalNumber} · v{revision.version}</span><strong>{revision.title}</strong><small>Substituída pela revisão vigente</small></div></td><td><span>Histórico</span></td><td><StatusPill tone={proposalStatus[revision.status].tone}>{proposalStatus[revision.status].label}</StatusPill></td><td>{forecastLabels[revision.forecastCategory]}</td><td>{formatDate(revision.expectedCloseAt)}</td><td>{formatDate(revision.validUntil)}</td><td>{formatCurrency(revision.totalContractValue)}</td><td>{formatCurrency(revision.recurringMonthlyTotal)}</td><td/><td/><td/></tr>) : null}
  </>
}
