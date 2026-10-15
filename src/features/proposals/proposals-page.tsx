import { NativeSelectionSelect, SelectionCheckbox } from '../../components/selection'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowRight, BadgeDollarSign, BarChart3, BookOpen, Boxes, CalendarClock, Check, ChevronDown, ChevronRight, CircleDollarSign,
  CopyPlus, FilePenLine, FileText, Flag, Handshake, LayoutGrid, Lightbulb, Link2, List, MessageCircle, MoreHorizontal, PackagePlus, Plus, ReceiptText, ShoppingBasket, RotateCcw, Search, Send, ShieldCheck, Sparkles, Star, Target, TrendingUp, XCircle,
} from 'lucide-react'
import { useAppActions, useAppNavigation, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { StatusPill } from '../../components/ui/status-pill'
import { WorkspaceDisplayMenu, WorkspaceFilterMenu, WorkspaceSortMenu, type WorkspaceFilterField } from '../../components/workspace/workspace-filter-system'
import { WorkspaceCommandBar, WorkspaceCommandGroup, WorkspacePageHeader, WorkspaceSummaryMetric, WorkspaceSummaryStrip, WorkspaceViewStrip } from '../../components/workspace/workspace-shell'
import { PRODUCT_CATEGORIES, PRODUCT_COMMERCIAL_TYPES, inferProductCommercialType } from '../../services/product-taxonomy'
import type {
  ForecastCategory, ProductBillingInterval, ProductBillingType, ProductCommercialType, ProductLifecycleStatus, ProductPricingMode, ProductRecord, ProposalLineItem,
  BuyerRoom, ProposalRecord, ProposalStatus, RevenueStatus, RevenueType, WorkspaceSnapshot,
} from '../../domain/types'
import { formatCurrency } from '../../domain/formatters'
import { createId } from '../../lib/id'
import { calculateRevenueForecast } from '../../services/revenue-forecast'
import { calculateProposalLine, calculateProposalTotals, contractEndFromStartAndMonths, createProposalLineFromProduct, proposalLineIsOverridden, proposalPricingPolicy } from '../../services/proposal-pricing'
import { RevenueIntelligencePanel } from '../revenue-intelligence/revenue-intelligence-panel'
import { Proposal360Modal } from './proposal-360-modal'
import { BuyerRoomModal } from './buyer-room-modal'
import { buildBuyerRoomDraft, buyerRoomProgress } from '../../services/buyer-room'
import { proposalPipelineStageIds, proposalPipelineStages, resolveProposalInitialLeadId, validateProposalStepOne } from '../../services/proposal-pipeline'
import { SalesMessageModal } from '../pipeline/sales-message-modal'
import { buildProductCommercialIntelligence, productCommercialHealth } from '../../services/product-intelligence'
import { accessCanApprove, canEditSensitiveField, canViewSensitiveField } from '../../services/team-access-control'
import { proposalApprovalReasons } from '../../services/team-governance'
import { classifyCommercialFailure, clearRecoveryDraft, writeRecoveryDraft } from '../../services/commercial-failure-recovery'

type Tab = 'proposals' | 'rooms' | 'products' | 'revenue' | 'forecast'
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
const productMarginPercent = (product: ProductRecord) => {
  const price = Math.max(0, product.unitPrice || 0)
  const cost = Math.max(0, product.unitCost ?? 0)
  return price > 0 ? (price - cost) / price * 100 : 0
}

function ProductModal({ open, product, onClose, onCreated }: { open: boolean; product: ProductRecord | null; onClose(): void; onCreated?(product: ProductRecord): void }) {
  const { teamAccess } = useAppWorkspace()
  const { createProduct, updateProduct } = useAppActions()
  const canViewCost = canViewSensitiveField(teamAccess,'proposal_cost')
  const canEditCost = canEditSensitiveField(teamAccess,'proposal_cost')
  const canViewMargin = canViewSensitiveField(teamAccess,'proposal_margin')
  const canEditMargin = canEditSensitiveField(teamAccess,'proposal_margin')
  const canViewDiscount = canViewSensitiveField(teamAccess,'proposal_discount')
  const canEditDiscount = canEditSensitiveField(teamAccess,'proposal_discount')
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('0')
  const [cost, setCost] = useState('0')
  const [kind, setKind] = useState<'product' | 'service'>('service')
  const [commercialType, setCommercialType] = useState<ProductCommercialType>('service')
  const [unitLabel, setUnitLabel] = useState('unidade')
  const [defaultDiscount, setDefaultDiscount] = useState('0')
  const [maxDiscount, setMaxDiscount] = useState('20')
  const [minMargin, setMinMargin] = useState('0')
  const [billingType, setBillingType] = useState<ProductBillingType>('one_time')
  const [interval, setInterval] = useState<ProductBillingInterval>(null)
  const [taxRate, setTaxRate] = useState('0')
  const [active, setActive] = useState(false)
  const [pricingMode, setPricingMode] = useState<ProductPricingMode>('fixed')
  const [valueProposition, setValueProposition] = useState('')
  const [targetCustomer, setTargetCustomer] = useState('')
  const [salesNotes, setSalesNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(product?.name ?? '')
    setSku(product?.sku ?? '')
    setDescription(product?.description ?? '')
    setCategory(product?.category ?? '')
    setPrice(String(product?.unitPrice ?? 0))
    setCost(String(product?.unitCost ?? 0))
    setKind(product?.kind ?? 'service')
    setCommercialType(product?.commercialType ?? inferProductCommercialType(product?.category ?? '', product?.kind ?? 'service'))
    setUnitLabel(product?.unitLabel ?? 'unidade')
    setDefaultDiscount(String(product?.defaultDiscountPercent ?? 0))
    setMaxDiscount(String(product?.maxDiscountPercent ?? 20))
    setMinMargin(String(product?.minMarginPercent ?? 0))
    setBillingType(product?.billingType ?? 'one_time')
    setInterval(product?.billingInterval ?? null)
    setTaxRate(String(product?.taxRate ?? 0))
    setActive(product?.active ?? false)
    setPricingMode(product?.pricingMode ?? 'fixed')
    setValueProposition(product?.valueProposition ?? '')
    setTargetCustomer(product?.targetCustomer ?? '')
    setSalesNotes(product?.salesNotes ?? '')
  }, [open, product])

  const numericPrice = Math.max(0, Number(price || 0))
  const numericCost = Math.max(0, Number(cost || 0))
  const numericDefaultDiscount = Math.max(0, Math.min(100, Number(defaultDiscount || 0)))
  const numericMaxDiscount = Math.max(0, Math.min(100, Number(maxDiscount || 0)))
  const numericMinMargin = Math.max(0, Math.min(100, Number(minMargin || 0)))
  const netReference = numericPrice * (1 - numericDefaultDiscount / 100)
  const referenceMargin = netReference > 0 ? (netReference - numericCost) / netReference * 100 : 0
  const policyNeedsAttention = numericDefaultDiscount > numericMaxDiscount || referenceMargin < numericMinMargin

  const submit = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const input = {
        name, sku, description, category, active,
        unitPrice: numericPrice,
        unitCost: numericCost,
        kind,
        commercialType,
        unitLabel: unitLabel.trim() || 'unidade',
        defaultDiscountPercent: numericDefaultDiscount,
        maxDiscountPercent: numericMaxDiscount,
        minMarginPercent: numericMinMargin,
        valueProposition,
        targetCustomer,
        salesNotes,
        pricingMode,
        lifecycleStatus: (product?.lifecycleStatus ?? (active ? 'active' : 'draft')) as ProductLifecycleStatus,
        salesProblems: product?.salesProblems ?? [],
        salesBenefits: product?.salesBenefits ?? [],
        discoveryQuestions: product?.discoveryQuestions ?? [],
        objectionNotes: product?.objectionNotes ?? [],
        salesProofs: product?.salesProofs ?? [],
        competitors: product?.competitors ?? [],
        bundleItems: product?.bundleItems ?? [],
        billingType,
        billingInterval: billingType === 'recurring' ? (interval ?? 'month' as const) : null,
        taxRate: Math.max(0, Number(taxRate || 0)),
      }
      if (product) await updateProduct(product.id, input)
      else {
        const created = await createProduct(input)
        onCreated?.(created)
      }
      onClose()
    } finally { setSaving(false) }
  }

  if (!product) return <Modal open={open} title="Novo produto ou serviço" subtitle="Crie o essencial agora. O Product Studio completa posicionamento, política e inteligência depois." size="md" onClose={onClose} footer={<><span className="modal__footer-spacer"/><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={() => void submit()}>Criar produto</Button></>}>
    <div className="catalog-quick-create">
      <div className="catalog-quick-create__hero"><Sparkles size={18}/><span><strong>Produto primeiro, formulário depois</strong><small>Nome, modelo de cobrança e preço são suficientes para entrar no catálogo.</small></span></div>
      <div className="form-grid">
        <label className="form-field form-field--full"><span>Nome</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: RealTalent CRM Pro" /></label>
        <label className="form-field"><span>Tipo</span><NativeSelectionSelect value={kind} onChange={(event) => setKind(event.target.value as 'product' | 'service')}><option value="service">Serviço</option><option value="product">Produto</option></NativeSelectionSelect></label>
        <label className="form-field"><span>Categoria</span><NativeSelectionSelect value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Selecionar categoria</option>{PRODUCT_CATEGORIES.map((item)=><option key={item} value={item}>{item}</option>)}</NativeSelectionSelect></label><label className="form-field"><span>Tipo comercial</span><NativeSelectionSelect value={commercialType} onChange={(event)=>setCommercialType(event.target.value as ProductCommercialType)}>{PRODUCT_COMMERCIAL_TYPES.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</NativeSelectionSelect></label>
        <label className="form-field"><span>Precificação</span><NativeSelectionSelect value={pricingMode} onChange={(event) => { const next = event.target.value as ProductPricingMode; setPricingMode(next); if (next === 'free') setPrice('0') }}><option value="fixed">Preço fixo</option><option value="from">A partir de</option><option value="quote">Sob consulta</option><option value="free">Gratuito</option><option value="custom">Personalizado</option></NativeSelectionSelect></label>
        <label className="form-field"><span>Preço de tabela (R$)</span><input type="number" min="0" step="0.01" value={price} disabled={pricingMode === 'free' || pricingMode === 'quote'} onChange={(event) => setPrice(event.target.value)} /></label>
        <label className="form-field"><span>Modelo de cobrança</span><NativeSelectionSelect value={billingType} onChange={(event) => { const next = event.target.value as ProductBillingType; setBillingType(next); setInterval(next === 'recurring' ? 'month' : null) }}><option value="one_time">Única</option><option value="recurring">Recorrente</option></NativeSelectionSelect></label>
        {billingType === 'recurring' ? <label className="form-field"><span>Periodicidade</span><NativeSelectionSelect value={interval ?? 'month'} onChange={(event) => setInterval(event.target.value as ProductBillingInterval)}><option value="month">Mensal</option><option value="quarter">Trimestral</option><option value="year">Anual</option></NativeSelectionSelect></label> : null}
      </div>
    </div>
  </Modal>

  return <Modal open={open} title={`Editar · ${product.name}`} subtitle="Ajuste os dados estruturais. Performance e inteligência ficam no Product Studio." size="lg" onClose={onClose} footer={<><span className="modal__footer-spacer"/><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={() => void submit()}>Salvar</Button></>}>
    <div className="catalog-product-editor">
      <section className="catalog-product-section"><header><span>Identidade</span><small>Como o item aparece para o time comercial.</small></header><div className="form-grid">
        <label className="form-field"><span>Nome</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label className="form-field"><span>SKU</span><input value={sku} onChange={(event) => setSku(event.target.value)} placeholder="Opcional" /></label>
        <label className="form-field form-field--full"><span>Descrição</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label>
        <label className="form-field"><span>Categoria</span><NativeSelectionSelect value={category} onChange={(event)=>setCategory(event.target.value)}><option value="">Selecionar categoria</option>{PRODUCT_CATEGORIES.map((item)=><option key={item} value={item}>{item}</option>)}</NativeSelectionSelect></label><label className="form-field"><span>Tipo comercial</span><NativeSelectionSelect value={commercialType} onChange={(event)=>setCommercialType(event.target.value as ProductCommercialType)}>{PRODUCT_COMMERCIAL_TYPES.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</NativeSelectionSelect></label><label className="form-field"><span>Natureza</span><NativeSelectionSelect value={kind} onChange={(event) => setKind(event.target.value as 'product' | 'service')}><option value="service">Serviço</option><option value="product">Produto</option></NativeSelectionSelect></label><label className="form-field"><span>Unidade comercial</span><input value={unitLabel} onChange={(event) => setUnitLabel(event.target.value)} /></label>
      </div></section>
      <section className="catalog-product-section catalog-product-section--pricing"><header><span>Preço e margem</span><small>Referência usada na composição da proposta.</small></header><div className="form-grid">
        <label className="form-field"><span>Preço de tabela (R$)</span><input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></label><label className="form-field"><span>Custo unitário (R$)</span>{canViewCost?<input type="number" min="0" step="0.01" value={cost} disabled={!canEditCost} onChange={(event) => setCost(event.target.value)} />:<strong className="field-restricted-h223">Restrito pelo perfil</strong>}</label><label className="form-field"><span>Desconto padrão (%)</span>{canViewDiscount?<input type="number" min="0" max="100" step="0.01" disabled={!canEditDiscount} value={defaultDiscount} onChange={(event) => setDefaultDiscount(event.target.value)} />:<strong className="field-restricted-h223">Restrito pelo perfil</strong>}</label><div className={`catalog-margin-preview ${policyNeedsAttention ? 'is-warning' : 'is-healthy'}`}><span>Margem de referência</span><strong>{canViewMargin?(numericPrice > 0 ? `${Math.round(referenceMargin)}%` : '—'):'Restrita'}</strong><small>{canViewMargin?`${formatCurrency(Math.max(0, netReference - numericCost))} por ${unitLabel || 'unidade'}.`:'Margem protegida pelo perfil.'}</small></div>
      </div></section>
      <section className="catalog-product-section"><header><span>Cobrança</span><small>Define MRR/ARR e composição do TCV.</small></header><div className="form-grid"><label className="form-field"><span>Modelo</span><NativeSelectionSelect value={billingType} onChange={(event) => { const next = event.target.value as ProductBillingType; setBillingType(next); setInterval(next === 'recurring' ? 'month' : null) }}><option value="one_time">Única</option><option value="recurring">Recorrente</option></NativeSelectionSelect></label>{billingType === 'recurring' ? <label className="form-field"><span>Periodicidade</span><NativeSelectionSelect value={interval ?? 'month'} onChange={(event) => setInterval(event.target.value as ProductBillingInterval)}><option value="month">Mensal</option><option value="quarter">Trimestral</option><option value="year">Anual</option></NativeSelectionSelect></label> : null}<label className="form-field"><span>Imposto (%)</span><input type="number" min="0" step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /></label></div></section>
      <section className="catalog-product-section catalog-product-section--policy"><header><span>Política comercial</span><small>Guardrails orientam negociação sem bloquear o vendedor.</small></header><div className="form-grid"><label className="form-field"><span>Desconto máximo recomendado (%)</span>{canViewDiscount?<input type="number" min="0" max="100" step="0.01" disabled={!canEditDiscount} value={maxDiscount} onChange={(event) => setMaxDiscount(event.target.value)} />:<strong className="field-restricted-h223">Restrito pelo perfil</strong>}</label><label className="form-field"><span>Margem mínima recomendada (%)</span>{canViewMargin?<input type="number" min="0" max="100" step="0.01" disabled={!canEditMargin} value={minMargin} onChange={(event) => setMinMargin(event.target.value)} />:<strong className="field-restricted-h223">Restrito pelo perfil</strong>}</label><SelectionCheckbox className="form-field form-field--full catalog-active-selection" checked={active} onCheckedChange={setActive} label="Disponível no catálogo" description="Itens inativos permanecem no histórico, mas não entram em novas propostas." /></div></section>
      <section className="catalog-product-section catalog-product-section--sales"><header><span>DNA comercial</span><small>Conhecimento que o time usa para vender este produto.</small></header><div className="form-grid"><label className="form-field form-field--full"><span>Proposta de valor</span><textarea rows={2} value={valueProposition} onChange={(event) => setValueProposition(event.target.value)} placeholder="Qual transformação este produto entrega?" /></label><label className="form-field form-field--full"><span>Para quem</span><textarea rows={2} value={targetCustomer} onChange={(event) => setTargetCustomer(event.target.value)} placeholder="Perfil de cliente ideal, contexto ou segmento." /></label><label className="form-field form-field--full"><span>Conhecimento de venda</span><textarea rows={4} value={salesNotes} onChange={(event) => setSalesNotes(event.target.value)} placeholder="Argumentos, objeções, provas, concorrentes e observações." /></label></div></section>
    </div>
  </Modal>
}

function CatalogProductPicker({ open, products, onClose, onPick }: { open: boolean; products: ProductRecord[]; onClose(): void; onPick(product: ProductRecord): void }) {
  const [query, setQuery] = useState('')
  useEffect(() => { if (open) setQuery('') }, [open])
  const filtered = products.filter((product) => `${product.name} ${product.sku} ${product.category} ${product.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <Modal open={open} title="Adicionar produto do catálogo" subtitle="A proposta usa o produto mestre e cria apenas um snapshot comercial para esta negociação." size="lg" onClose={onClose}>
    <div className="proposal-catalog-picker">
      <label className="search-field"><Search size={16}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto, SKU, categoria ou descrição" /></label>
      <div className="proposal-catalog-picker__grid">{filtered.map((product) => <button type="button" key={product.id} className="proposal-catalog-picker__card" onClick={() => onPick(product)}>
        <span className="proposal-catalog-picker__type">{product.bundleItems?.length ? 'Oferta' : product.kind === 'product' ? 'Produto' : 'Serviço'} · {product.category || 'Sem categoria'}</span><strong>{product.name}</strong><small>{product.sku || 'Sem SKU'}{product.description ? ` · ${product.description}` : ''}</small>
        <div><span><b>{product.pricingMode === 'free' ? 'Gratuito' : product.pricingMode === 'quote' ? 'Sob consulta' : product.pricingMode === 'from' ? `A partir de ${formatCurrency(product.unitPrice)}` : formatCurrency(product.unitPrice)}</b>{product.pricingMode === 'quote' || product.pricingMode === 'free' ? '' : product.billingType === 'recurring' ? ` / ${product.billingInterval === 'year' ? 'ano' : product.billingInterval === 'quarter' ? 'trimestre' : 'mês'}` : ' · único'}</span><span>{product.bundleItems?.length ? `${product.bundleItems.length} componente(s)` : `Margem ${Math.round(productMarginPercent(product))}%`}</span></div><em><PackagePlus size={14}/> {product.bundleItems?.length ? 'Adicionar oferta' : 'Adicionar'}</em>
      </button>)}</div>
      {!filtered.length ? <div className="empty-state"><Boxes/><strong>Nenhum produto disponível</strong><p>Cadastre ou ative um produto no Catálogo antes de montar a proposta.</p></div> : null}
    </div>
  </Modal>
}

function StructuredListEditor({ title, description, values, onChange, placeholder, disabled }: { title: string; description: string; values: string[]; onChange(values: string[]): void; placeholder: string; disabled?: boolean }) {
  return <section className="product-knowledge-block"><header><div><strong>{title}</strong><small>{description}</small></div>{!disabled ? <button type="button" onClick={() => onChange([...values, ''])}><Plus size={13}/> Adicionar</button> : null}</header>
    <div className="product-knowledge-list">{values.length ? values.map((value, index) => <div key={`${title}-${index}`}><input value={value} disabled={disabled} onChange={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={placeholder}/>{!disabled ? <button type="button" aria-label={`Remover ${title}`} onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}>×</button> : null}</div>) : <p>Nenhum item estruturado ainda.</p>}</div>
  </section>
}

function CatalogReconciliationModal({ open, legacyItems, products, onClose, onApply }: { open: boolean; legacyItems: Array<{ name: string; count: number }>; products: ProductRecord[]; onClose(): void; onApply(name: string, productId: string): Promise<number> }) {
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) setMapping({}) }, [open])
  const mapped = legacyItems.filter((item) => mapping[item.name])
  const apply = async () => {
    if (!mapped.length) return
    setSaving(true)
    try {
      for (const item of mapped) await onApply(item.name, mapping[item.name])
      onClose()
    } finally { setSaving(false) }
  }
  return <Modal open={open} title="Reconciliar histórico com o catálogo" subtitle="Vincule itens antigos às entidades de produto atuais. O CRM preserva preço e desconto históricos e passa a incluir esses registros na inteligência por produto." size="lg" onClose={onClose} footer={<><span className="modal__footer-spacer"/><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} disabled={!mapped.length} onClick={() => void apply()}>Vincular {mapped.reduce((sum, item) => sum + item.count, 0)} item(ns)</Button></>}>
    <div className="catalog-reconcile-list">{legacyItems.map((item) => <article key={item.name}><div><Link2 size={15}/><span><strong>{item.name}</strong><small>{item.count} ocorrência(s) histórica(s) sem produto</small></span></div><NativeSelectionSelect value={mapping[item.name] ?? ''} onChange={(event) => setMapping((current) => ({ ...current, [item.name]: event.target.value }))}><option value="">Escolher produto...</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ''}</option>)}</NativeSelectionSelect></article>)}</div>
  </Modal>
}

const pricingModeLabels: Record<ProductPricingMode, string> = { fixed: 'Preço fixo', from: 'A partir de', quote: 'Sob consulta', free: 'Gratuito', custom: 'Personalizado' }
const lifecycleLabels: Record<ProductLifecycleStatus, string> = { draft: 'Rascunho', ready: 'Pronto para vender', active: 'Ativo no catálogo', archived: 'Arquivado' }

const structuredSalesNotes = (product: ProductRecord) => {
  const sections: Array<[string, string[]]> = [
    ['Problemas', product.salesProblems ?? []], ['Benefícios', product.salesBenefits ?? []], ['Perguntas', product.discoveryQuestions ?? []],
    ['Objeções', product.objectionNotes ?? []], ['Provas', product.salesProofs ?? []], ['Concorrentes', product.competitors ?? []],
  ]
  const generated = sections.filter(([, values]) => values.some((value) => value.trim())).map(([title, values]) => `[${title}]\n${values.map((value) => `- ${value.trim()}`).filter((value) => value !== '- ').join('\n')}`).join('\n\n')
  return generated || product.salesNotes || ''
}

function ProductStudioModal({ open, product, snapshot, canWrite, onClose }: { open: boolean; product: ProductRecord | null; snapshot: WorkspaceSnapshot; canWrite: boolean; onClose(): void }) {
  const { teamAccess } = useAppWorkspace()
  const canViewCost = canViewSensitiveField(teamAccess,'proposal_cost')
  const canEditCost = canEditSensitiveField(teamAccess,'proposal_cost')
  const canViewMargin = canViewSensitiveField(teamAccess,'proposal_margin')
  const canEditMargin = canEditSensitiveField(teamAccess,'proposal_margin')
  const canViewDiscount = canViewSensitiveField(teamAccess,'proposal_discount')
  const canEditDiscount = canEditSensitiveField(teamAccess,'proposal_discount')
  const { updateProduct } = useAppActions()
  const [tab, setTab] = useState<'overview' | 'pricing' | 'offer' | 'sales' | 'performance'>('overview')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const current = product ? snapshot.products.find((item) => item.id === product.id) ?? product : null
  const [draft, setDraft] = useState<ProductRecord | null>(current)

  useEffect(() => { if (open && current) { setTab('overview'); setEditing(false); setDraft(current) } }, [open, current?.id, current?.updatedAt])
  if (!current || !draft) return null

  const intelligence = buildProductCommercialIntelligence(snapshot, current.id)
  const health = productCommercialHealth(draft)
  const billingLabel = draft.billingType === 'recurring' ? (draft.billingInterval === 'year' ? 'Anual' : draft.billingInterval === 'quarter' ? 'Trimestral' : 'Mensal') : 'Pagamento único'
  const lifecycle = draft.lifecycleStatus ?? (draft.active ? 'active' : 'draft')
  const pricingMode = draft.pricingMode ?? 'fixed'
  const isOffer = Boolean(draft.bundleItems?.length)
  const bundleValue = (draft.bundleItems ?? []).reduce((sum, item) => {
    const component = snapshot.products.find((candidate) => candidate.id === item.productId)
    return sum + (component?.unitPrice ?? 0) * Math.max(1, item.quantity || 1)
  }, 0)

  const patch = (next: Partial<ProductRecord>) => setDraft((value) => value ? { ...value, ...next } : value)
  const save = async () => {
    if (!canWrite) return
    setSaving(true)
    try {
      const nextLifecycle = draft.lifecycleStatus ?? (draft.active ? 'active' : 'draft')
      const active = nextLifecycle === 'active'
      const updated = await updateProduct(current.id, {
        name: draft.name, sku: draft.sku, description: draft.description, category: draft.category, commercialType: draft.commercialType, active,
        unitPrice: pricingMode === 'free' ? 0 : draft.unitPrice, unitCost: draft.unitCost ?? 0, kind: draft.kind, unitLabel: draft.unitLabel,
        defaultDiscountPercent: draft.defaultDiscountPercent ?? 0, maxDiscountPercent: draft.maxDiscountPercent ?? 20, minMarginPercent: draft.minMarginPercent ?? 0,
        valueProposition: draft.valueProposition ?? '', targetCustomer: draft.targetCustomer ?? '', salesNotes: structuredSalesNotes(draft), pricingMode,
        lifecycleStatus: nextLifecycle, salesProblems: (draft.salesProblems ?? []).map((item) => item.trim()).filter(Boolean), salesBenefits: (draft.salesBenefits ?? []).map((item) => item.trim()).filter(Boolean),
        discoveryQuestions: (draft.discoveryQuestions ?? []).map((item) => item.trim()).filter(Boolean), objectionNotes: (draft.objectionNotes ?? []).map((item) => item.trim()).filter(Boolean),
        salesProofs: (draft.salesProofs ?? []).map((item) => item.trim()).filter(Boolean), competitors: (draft.competitors ?? []).map((item) => item.trim()).filter(Boolean), bundleItems: draft.bundleItems ?? [],
        billingType: draft.billingType, billingInterval: draft.billingType === 'recurring' ? (draft.billingInterval ?? 'month') : null, taxRate: draft.taxRate,
      })
      setDraft(updated); setEditing(false)
    } finally { setSaving(false) }
  }

  const setLifecycle = (status: ProductLifecycleStatus) => {
    if (status === 'active' && !health.ready) return
    patch({ lifecycleStatus: status, active: status === 'active' })
  }
  const priceLabel = pricingMode === 'free' ? 'Gratuito' : pricingMode === 'quote' ? 'Sob consulta' : pricingMode === 'from' ? `A partir de ${formatCurrency(draft.unitPrice)}` : formatCurrency(draft.unitPrice)

  return <Modal open={open} title={current.name} subtitle={`${isOffer ? 'Oferta' : current.kind === 'product' ? 'Produto' : 'Serviço'} · ${current.category || 'Sem categoria'} · ${current.sku || 'Sem SKU'}`} size="full" onClose={onClose} footer={<><div className="product-studio-footer"><span>{health.score}/100</span><small>product readiness</small></div><span className="modal__footer-spacer"/><Button variant="secondary" onClick={onClose}>Fechar</Button>{canWrite && editing ? <><Button variant="secondary" onClick={() => { setDraft(current); setEditing(false) }}>Descartar</Button><Button loading={saving} onClick={() => void save()}>Salvar alterações</Button></> : canWrite ? <Button onClick={() => setEditing(true)}><FilePenLine size={14}/> Editar no Studio</Button> : null}</>}>
    <div className="product-studio product-studio--h13">
      <aside className="product-studio__identity"><div className="product-studio__icon"><Boxes size={26}/></div><span className={`product-lifecycle product-lifecycle--${lifecycle}`}>{lifecycleLabels[lifecycle]}</span><h3>{draft.name}</h3><p>{draft.description || 'Sem descrição comercial.'}</p><div className="product-studio__quick"><strong>{priceLabel}</strong><small>{billingLabel} · por {draft.unitLabel || 'unidade'}</small></div><div className="product-readiness-mini">{health.dimensions.map((item) => <div key={item.key}><span>{item.label}</span><i><b style={{ width: `${item.score}%` }}/></i><strong>{item.score}%</strong></div>)}</div></aside>
      <main className="product-studio__main">
        <nav className="product-studio__tabs"><button type="button" className={tab === 'overview' ? 'is-active' : ''} onClick={() => setTab('overview')}><Target size={14}/> Visão geral</button><button type="button" className={tab === 'pricing' ? 'is-active' : ''} onClick={() => setTab('pricing')}><CircleDollarSign size={14}/> Preço</button><button type="button" className={tab === 'offer' ? 'is-active' : ''} onClick={() => setTab('offer')}><ShoppingBasket size={14}/> Oferta</button><button type="button" className={tab === 'sales' ? 'is-active' : ''} onClick={() => setTab('sales')}><BookOpen size={14}/> Venda</button><button type="button" className={tab === 'performance' ? 'is-active' : ''} onClick={() => setTab('performance')}><BarChart3 size={14}/> Performance</button></nav>

        {tab === 'overview' ? <div className="product-studio__content">
          <section className="product-studio-card product-readiness-card"><header><ShieldCheck size={16}/><strong>Product Readiness</strong><StatusPill tone={health.ready ? 'success' : 'warning'}>{health.ready ? 'Pronto' : `${health.score}% completo`}</StatusPill></header><div className="product-readiness-grid">{health.dimensions.map((item) => <article key={item.key}><span>{item.label}</span><strong>{item.score}%</strong><i><b style={{ width: `${item.score}%` }}/></i></article>)}</div>{health.gaps.length ? <div className="product-readiness-gaps">{health.gaps.map((gap) => <span key={gap}>• {gap}</span>)}</div> : <p>O produto possui os elementos essenciais para venda.</p>}</section>
          {editing ? <section className="product-studio-card product-inline-editor"><header><strong>Identidade e posicionamento</strong><small>Edite sem sair do Product Studio.</small></header><div className="form-grid"><label className="form-field"><span>Nome</span><input value={draft.name} onChange={(event) => patch({ name: event.target.value })}/></label><label className="form-field"><span>SKU</span><input value={draft.sku} onChange={(event) => patch({ sku: event.target.value })}/></label><label className="form-field form-field--full"><span>Descrição</span><textarea rows={3} value={draft.description} onChange={(event) => patch({ description: event.target.value })}/></label><label className="form-field"><span>Categoria</span><NativeSelectionSelect value={draft.category} onChange={(event)=>patch({category:event.target.value})}><option value="">Selecionar categoria</option>{PRODUCT_CATEGORIES.map((item)=><option key={item} value={item}>{item}</option>)}</NativeSelectionSelect></label><label className="form-field"><span>Tipo comercial</span><NativeSelectionSelect value={draft.commercialType ?? inferProductCommercialType(draft.category,draft.kind)} onChange={(event)=>patch({commercialType:event.target.value as ProductCommercialType})}>{PRODUCT_COMMERCIAL_TYPES.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</NativeSelectionSelect></label><label className="form-field"><span>Unidade comercial</span><input value={draft.unitLabel ?? ''} onChange={(event) => patch({ unitLabel: event.target.value })}/></label><label className="form-field form-field--full"><span>Para quem</span><textarea rows={2} value={draft.targetCustomer ?? ''} onChange={(event) => patch({ targetCustomer: event.target.value })}/></label><label className="form-field form-field--full"><span>Proposta de valor</span><textarea rows={2} value={draft.valueProposition ?? ''} onChange={(event) => patch({ valueProposition: event.target.value })}/></label></div><div className="product-lifecycle-choice"><span>Ciclo comercial</span>{(['draft','ready','active','archived'] as ProductLifecycleStatus[]).map((status) => <button type="button" key={status} className={lifecycle === status ? 'is-active' : ''} disabled={status === 'active' && !health.ready} onClick={() => setLifecycle(status)}>{lifecycleLabels[status]}</button>)}</div>{!health.ready ? <small className="product-lifecycle-hint">Complete identidade, preço e posicionamento antes de ativar no catálogo.</small> : null}</section> : <section className="product-dna-grid"><article><Target/><span><small>Para quem</small><strong>{draft.targetCustomer?.trim() || 'Não definido'}</strong></span></article><article><Lightbulb/><span><small>Proposta de valor</small><strong>{draft.valueProposition?.trim() || 'Não definida'}</strong></span></article><article><ShieldCheck/><span><small>Status comercial</small><strong>{lifecycleLabels[lifecycle]}</strong></span></article></section>}
        </div> : null}

        {tab === 'pricing' ? <div className="product-studio__content">{editing ? <section className="product-studio-card product-inline-editor"><header><strong>Preço e política comercial</strong><small>A semântica do preço evita tratar grátis ou sob consulta como informação ausente.</small></header><div className="form-grid"><label className="form-field"><span>Tipo de precificação</span><NativeSelectionSelect value={pricingMode} onChange={(event) => { const next = event.target.value as ProductPricingMode; patch({ pricingMode: next, ...(next === 'free' ? { unitPrice: 0 } : {}) }) }}><option value="fixed">Preço fixo</option><option value="from">A partir de</option><option value="quote">Sob consulta</option><option value="free">Gratuito</option><option value="custom">Personalizado</option></NativeSelectionSelect></label><label className="form-field"><span>Preço de tabela</span><input type="number" min="0" step="0.01" disabled={pricingMode === 'free' || pricingMode === 'quote'} value={draft.unitPrice} onChange={(event) => patch({ unitPrice: Number(event.target.value) })}/></label><label className="form-field"><span>Custo</span>{canViewCost?<input type="number" min="0" step="0.01" disabled={!canEditCost} value={draft.unitCost ?? 0} onChange={(event) => patch({ unitCost: Number(event.target.value) })}/>:<strong className="field-restricted-h223">Restrito pelo perfil</strong>}</label><label className="form-field"><span>Modelo</span><NativeSelectionSelect value={draft.billingType} onChange={(event) => patch({ billingType: event.target.value as ProductBillingType, billingInterval: event.target.value === 'recurring' ? (draft.billingInterval ?? 'month') : null })}><option value="one_time">Única</option><option value="recurring">Recorrente</option></NativeSelectionSelect></label>{draft.billingType === 'recurring' ? <label className="form-field"><span>Periodicidade</span><NativeSelectionSelect value={draft.billingInterval ?? 'month'} onChange={(event) => patch({ billingInterval: event.target.value as ProductBillingInterval })}><option value="month">Mensal</option><option value="quarter">Trimestral</option><option value="year">Anual</option></NativeSelectionSelect></label> : null}<label className="form-field"><span>Desconto padrão (%)</span>{canViewDiscount?<input type="number" min="0" max="100" disabled={!canEditDiscount} value={draft.defaultDiscountPercent ?? 0} onChange={(event) => patch({ defaultDiscountPercent: Number(event.target.value) })}/>:<strong className="field-restricted-h223">Restrito</strong>}</label><label className="form-field"><span>Desconto máximo (%)</span>{canViewDiscount?<input type="number" min="0" max="100" disabled={!canEditDiscount} value={draft.maxDiscountPercent ?? 20} onChange={(event) => patch({ maxDiscountPercent: Number(event.target.value) })}/>:<strong className="field-restricted-h223">Restrito</strong>}</label><label className="form-field"><span>Margem mínima (%)</span>{canViewMargin?<input type="number" min="0" max="100" disabled={!canEditMargin} value={draft.minMarginPercent ?? 0} onChange={(event) => patch({ minMarginPercent: Number(event.target.value) })}/>:<strong className="field-restricted-h223">Restrita</strong>}</label><label className="form-field"><span>Imposto (%)</span><input type="number" min="0" value={draft.taxRate} onChange={(event) => patch({ taxRate: Number(event.target.value) })}/></label></div></section> : <><section className="product-metric-grid"><article><small>Precificação</small><strong>{pricingModeLabels[pricingMode]}</strong><span>{priceLabel}</span></article><article><small>Custo</small><strong>{canViewCost?formatCurrency(draft.unitCost ?? 0):'Restrito'}</strong><span>{canViewCost?`por ${draft.unitLabel || 'unidade'}`:'campo sensível'}</span></article><article><small>Margem tabela</small><strong>{canViewMargin?(pricingMode === 'free' || pricingMode === 'quote' ? '—' : `${Math.round(productMarginPercent(draft))}%`):'Restrita'}</strong><span>antes de impostos</span></article><article><small>Desconto máximo</small><strong>{canViewDiscount?`${draft.maxDiscountPercent ?? 20}%`:'Restrito'}</strong><span>recomendado</span></article></section><section className="product-studio-card"><header><ShieldCheck size={16}/><strong>Política comercial</strong></header><p>{canViewDiscount?`Desconto padrão ${draft.defaultDiscountPercent ?? 0}%`:'Desconto restrito'} · {canViewMargin?`margem mínima ${draft.minMarginPercent ?? 0}%`:'margem restrita'} · imposto {draft.taxRate ?? 0}%.</p></section></>}
        </div> : null}

        {tab === 'offer' ? <div className="product-studio__content"><section className="product-studio-card product-offer-builder"><header><ShoppingBasket size={16}/><div><strong>Offer Builder</strong><small>Combine produtos do catálogo em uma composição reutilizável.</small></div>{editing ? <button type="button" onClick={() => patch({ bundleItems: [...(draft.bundleItems ?? []), { productId: '', quantity: 1 }] })}><Plus size={13}/> Componente</button> : null}</header>{editing ? <div className="product-offer-lines">{(draft.bundleItems ?? []).map((item, index) => <div key={`bundle-${index}`}><NativeSelectionSelect value={item.productId} onChange={(event) => patch({ bundleItems: (draft.bundleItems ?? []).map((line, lineIndex) => lineIndex === index ? { ...line, productId: event.target.value } : line) })}><option value="">Escolher produto...</option>{snapshot.products.filter((candidate) => candidate.id !== current.id && !(candidate.bundleItems?.length)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</NativeSelectionSelect><input type="number" min="1" step="1" value={item.quantity} onChange={(event) => patch({ bundleItems: (draft.bundleItems ?? []).map((line, lineIndex) => lineIndex === index ? { ...line, quantity: Math.max(1, Number(event.target.value) || 1) } : line) })}/><button type="button" onClick={() => patch({ bundleItems: (draft.bundleItems ?? []).filter((_, lineIndex) => lineIndex !== index) })}>×</button></div>)}</div> : (draft.bundleItems?.length ? <div className="product-offer-summary">{draft.bundleItems.map((item) => { const component = snapshot.products.find((candidate) => candidate.id === item.productId); return <article key={item.productId}><span><strong>{component?.name ?? 'Produto removido'}</strong><small>{item.quantity} × {formatCurrency(component?.unitPrice ?? 0)}</small></span><strong>{formatCurrency((component?.unitPrice ?? 0) * item.quantity)}</strong></article> })}<footer><span>Referência dos componentes</span><strong>{formatCurrency(bundleValue)}</strong></footer></div> : <p>Este registro é um produto individual. Adicione componentes para transformá-lo em uma oferta reutilizável.</p>)}</section></div> : null}

        {tab === 'sales' ? <div className="product-studio__content"><StructuredListEditor title="Problemas que resolve" description="Dores e situações que justificam a compra." values={draft.salesProblems ?? []} onChange={(values) => patch({ salesProblems: values })} placeholder="Ex.: follow-ups perdidos" disabled={!editing}/><StructuredListEditor title="Benefícios" description="Resultados e transformações que o vendedor pode conectar ao problema." values={draft.salesBenefits ?? []} onChange={(values) => patch({ salesBenefits: values })} placeholder="Ex.: previsibilidade comercial" disabled={!editing}/><StructuredListEditor title="Perguntas de descoberta" description="Perguntas reutilizáveis pelo Playbook e Calling." values={draft.discoveryQuestions ?? []} onChange={(values) => patch({ discoveryQuestions: values })} placeholder="Ex.: Como vocês acompanham oportunidades hoje?" disabled={!editing}/><StructuredListEditor title="Objeções" description="Objeções frequentes e orientação comercial." values={draft.objectionNotes ?? []} onChange={(values) => patch({ objectionNotes: values })} placeholder="Ex.: Já usamos outro CRM — investigar satisfação e gaps" disabled={!editing}/><StructuredListEditor title="Provas" description="Cases, evidências e ativos que reforçam a venda." values={draft.salesProofs ?? []} onChange={(values) => patch({ salesProofs: values })} placeholder="Ex.: Case Barbearia Alpha" disabled={!editing}/><StructuredListEditor title="Concorrentes" description="Alternativas que aparecem com frequência na negociação." values={draft.competitors ?? []} onChange={(values) => patch({ competitors: values })} placeholder="Ex.: HubSpot" disabled={!editing}/><section className="product-studio-card"><header><Sparkles size={16}/><strong>Frequentemente vendido junto</strong></header>{intelligence.coSold.length ? <div className="product-cross-sell">{intelligence.coSold.map((item) => <span key={item.productId}><strong>{item.name}</strong><small>{item.count} proposta(s) em conjunto</small></span>)}</div> : <p>Ainda não há dados suficientes de combinação entre produtos.</p>}</section></div> : null}

        {tab === 'performance' ? <div className="product-studio__content"><section className="product-metric-grid"><article><small>Propostas</small><strong>{intelligence.proposals}</strong><span>{intelligence.openProposals} abertas</span></article><article><small>Win rate</small><strong>{intelligence.winRate === null ? '—' : `${Math.round(intelligence.winRate)}%`}</strong><span>{intelligence.wonProposals} ganhas · {intelligence.lostProposals} perdidas</span></article><article><small>Preço médio vendido</small><strong>{formatCurrency(intelligence.averageSoldUnitPrice)}</strong><span>desconto médio {Math.round(intelligence.averageDiscountPercent)}%</span></article><article><small>Bookings</small><strong>{formatCurrency(intelligence.bookingsTcv)}</strong><span>MRR ganho {formatCurrency(intelligence.bookedMrr)}</span></article></section><section className="product-funnel"><div><span>Propostas</span><strong>{intelligence.proposals}</strong></div><ArrowRight/><div><span>Decididas</span><strong>{intelligence.wonProposals + intelligence.lostProposals}</strong></div><ArrowRight/><div><span>Ganhas</span><strong>{intelligence.wonProposals}</strong></div></section><section className="product-studio-card"><header><TrendingUp size={16}/><strong>Pipeline por produto</strong></header><p>Pipeline aberto {formatCurrency(intelligence.pipelineTcv)} · margem média vendida {Math.round(intelligence.averageMarginPercent)}%.</p></section></div> : null}
      </main>
    </div>
  </Modal>
}

function ProposalModal({ open, proposal, initialLeadId = '', onClose }: { open: boolean; proposal: ProposalRecord | null; initialLeadId?: string; onClose(): void }) {
  const { notify } = useAppUi()
  const { snapshot, teamAccess, canTeamAccessRecord } = useAppWorkspace()
  const canViewDiscount = canViewSensitiveField(teamAccess,'proposal_discount')
  const canEditDiscount = canEditSensitiveField(teamAccess,'proposal_discount')
  const canViewMargin = canViewSensitiveField(teamAccess,'proposal_margin')
  const canViewCost = canViewSensitiveField(teamAccess,'proposal_cost')
  const canViewTotal = canViewSensitiveField(teamAccess,'proposal_total')
  const { createProposal, updateProposal } = useAppActions()
  const proposalStageIds = useMemo(() => proposalPipelineStageIds(snapshot?.stages ?? []), [snapshot?.stages])
  const leads = useMemo(() => snapshot?.leads.filter((lead) => canTeamAccessRecord('proposals', lead.ownerId) && (
    (lead.status === 'active' && proposalStageIds.has(lead.stageId))
    || lead.id === proposal?.leadId
    || lead.id === initialLeadId
  )) ?? [], [canTeamAccessRecord, initialLeadId, proposal?.leadId, proposalStageIds, snapshot?.leads])
  const products = useMemo(() => snapshot?.products.filter((item) => item.active && (item.lifecycleStatus ?? 'active') === 'active') ?? [], [snapshot])
  const opportunityByLeadId = useMemo(() => new Map((snapshot?.opportunities ?? []).map((item) => [item.leadId, item])), [snapshot?.opportunities])
  const [leadId, setLeadId] = useState('')
  const [title, setTitle] = useState('Proposta comercial')
  const [forecastCategory, setForecastCategory] = useState<ForecastCategory>('pipeline')
  const [probability, setProbability] = useState('30')
  const [validUntil, setValidUntil] = useState('')
  const [expectedCloseAt, setExpectedCloseAt] = useState('')
  const [contractStartAt, setContractStartAt] = useState('')
  const [contractEndAt, setContractEndAt] = useState('')
  const [contractEndMode, setContractEndMode] = useState<'auto' | 'manual'>('auto')
  const [contractTermMonths, setContractTermMonths] = useState('12')
  const [autoRenew, setAutoRenew] = useState(true)
  const [postSaleStartAt, setPostSaleStartAt] = useState('')
  const [postSaleCadenceName, setPostSaleCadenceName] = useState('Onboarding padrão')
  const [makeOfficial, setMakeOfficial] = useState(true)
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('Validade sujeita à disponibilidade e aceite formal.')
  const [items, setItems] = useState<ProposalLineItem[]>([])
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false)
  const [catalogReplaceLineId, setCatalogReplaceLineId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState(1)

  useEffect(() => {
    if (!open) return
    setStep(1)
    const validity = new Date(); validity.setDate(validity.getDate() + 15)
    const close = new Date(); close.setDate(close.getDate() + 10)
    const start = new Date(); start.setDate(start.getDate() + 20)
    setLeadId(resolveProposalInitialLeadId(proposal?.leadId, initialLeadId, leads[0]?.id))
    setTitle(proposal?.title ?? 'Proposta comercial')
    setForecastCategory(proposal?.forecastCategory ?? 'pipeline')
    setProbability(String(proposal?.probability ?? 30))
    setValidUntil(proposal?.validUntil ?? dateInput(validity))
    setExpectedCloseAt(proposal?.expectedCloseAt ?? dateInput(close))
    setContractStartAt(proposal?.contractStartAt ?? dateInput(start))
    setContractEndAt(proposal?.contractEndAt ?? '')
    setContractEndMode(proposal?.contractEndAt ? 'manual' : 'auto')
    setContractTermMonths(String(proposal?.contractTermMonths ?? 12))
    setAutoRenew(proposal?.autoRenew ?? true)
    setPostSaleStartAt(proposal?.postSaleStartAt ?? dateInput(start))
    setPostSaleCadenceName(proposal?.postSaleCadenceName ?? 'Onboarding padrão')
    setMakeOfficial(proposal?.isOfficial ?? true)
    setNotes(proposal?.notes ?? '')
    setTerms(proposal?.terms ?? 'Validade sujeita à disponibilidade e aceite formal.')
    setItems(proposal?.items.length ? proposal.items.map((item) => { const product = (snapshot?.products ?? []).find((candidate) => candidate.id === item.productId); const enriched = { ...item, pricingSource: item.pricingSource ?? (product ? 'catalog' : 'manual'), catalogUnitPrice: item.catalogUnitPrice ?? product?.unitPrice, unitCostSnapshot: item.unitCostSnapshot ?? product?.unitCost, catalogDiscountPercent: item.catalogDiscountPercent ?? product?.defaultDiscountPercent }; return { ...enriched, pricingOverridden: item.pricingOverridden ?? proposalLineIsOverridden(enriched, product) } }) : [])
  }, [initialLeadId, leads, open, proposal])

  const term = Math.max(1, Number(contractTermMonths || 12))
  const totals = useMemo(() => calculateProposalTotals(items, term), [items, term])
  const approvalReasons = useMemo(() => proposalApprovalReasons(teamAccess,items,products,totals.totalContractValue),[items,products,teamAccess,totals.totalContractValue])
  const approvalRequired = approvalReasons.length>0 && !accessCanApprove(teamAccess,'proposals')
  const patchLine = (id: string, patch: Partial<ProposalLineItem>) => setItems((current) => current.map((item) => {
    if (item.id !== id) return item
    const next = { ...item, ...patch }
    const calculated = { ...next, ...calculateProposalLine(next) }
    const product = products.find((candidate) => candidate.id === calculated.productId) ?? null
    return { ...calculated, pricingSource: calculated.productId ? 'catalog' : 'manual', pricingOverridden: proposalLineIsOverridden(calculated, product) }
  }))
  const openCatalogPicker = (replaceLineId: string | null = null) => { setCatalogReplaceLineId(replaceLineId); setCatalogPickerOpen(true) }
  const addCatalogProduct = (product: ProductRecord) => {
    const buildLines = () => {
      const bundle = (product.bundleItems ?? []).map((component) => {
        const child = products.find((candidate) => candidate.id === component.productId)
        if (!child) return null
        const line = createProposalLineFromProduct(child, createId('proposal-item'))
        const quantity = Math.max(1, component.quantity || 1)
        const next = { ...line, quantity }
        return { ...next, ...calculateProposalLine(next) }
      }).filter((line): line is ProposalLineItem => Boolean(line))
      return bundle.length ? bundle : [createProposalLineFromProduct(product, createId('proposal-item'))]
    }
    const nextLines = buildLines()
    setItems((current) => {
      if (!catalogReplaceLineId) return [...current, ...nextLines]
      const index = current.findIndex((item) => item.id === catalogReplaceLineId)
      if (index < 0) return [...current, ...nextLines]
      const replacement = nextLines.map((line, lineIndex) => lineIndex === 0 ? { ...line, id: catalogReplaceLineId } : line)
      return [...current.slice(0, index), ...replacement, ...current.slice(index + 1)]
    })
    setCatalogReplaceLineId(null)
    setCatalogPickerOpen(false)
  }
  const restoreCatalogPricing = (lineId: string) => {
    const item = items.find((line) => line.id === lineId)
    const product = products.find((candidate) => candidate.id === item?.productId)
    if (!item || !product) return
    setItems((current) => current.map((line) => line.id === lineId ? createProposalLineFromProduct(product, lineId) : line))
  }

  useEffect(() => {
    if (!contractStartAt || contractEndMode !== 'auto') return
    const automaticEnd = contractEndFromStartAndMonths(contractStartAt, term)
    if (automaticEnd) setContractEndAt(automaticEnd)
  }, [contractEndMode, contractStartAt, term])

  const stepOneValidation = validateProposalStepOne({ leadId, availableLeadIds: leads.map((lead) => lead.id), title, forecastCategory, probability })
  const canAdvance = step === 1 ? stepOneValidation.valid : step === 2 ? Boolean(items.length && items.every((item) => item.name.trim() && Number.isFinite(item.quantity) && item.quantity > 0 && (proposal ? true : Boolean(item.productId)))) : true
  const stepValidationMessage = step === 1 ? stepOneValidation.message : ''

  const submit = async () => {
    if (!leadId || !title.trim() || !items.length || items.some((item) => !item.name.trim())) return
    setSaving(true)
    try {
      const lead = snapshot?.leads.find((item) => item.id === leadId)
      const opportunity = opportunityByLeadId.get(leadId) ?? null
      const input = {
        leadId,
        opportunityId: opportunity?.id ?? lead?.opportunityId ?? null,
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
      const recoveryKey = `proposal:${proposal?.id ?? leadId ?? 'new'}`
      writeRecoveryDraft(recoveryKey, input)
      if (proposal) await updateProposal(proposal.id, input)
      else await createProposal(input)
      clearRecoveryDraft(recoveryKey)
      onClose()
    } catch (error) {
      const recovery = classifyCommercialFailure(error)
      notify(recovery.kind === 'approval' || recovery.kind === 'permission' ? 'warning' : 'error', `${recovery.title}. ${recovery.message}`, { persistent: true, action: recovery.retryable ? { label: recovery.actionLabel ?? 'Tentar novamente', run: submit } : undefined })
    } finally { setSaving(false) }
  }

  const selectedLead = leads.find((lead) => lead.id === leadId) ?? null
  const selectedOpportunity = selectedLead ? opportunityByLeadId.get(selectedLead.id) ?? null : null
  return <Modal open={open} size="full" title={proposal ? `Editar ${proposal.proposalNumber} · v${proposal.version}` : 'Nova proposta'} subtitle="Crie a proposta em quatro etapas: cliente, itens, condições e revisão." onClose={onClose} footer={<><div className="proposal-modal-totals"><span>TCV <strong>{canViewTotal?formatCurrency(totals.totalContractValue):'Restrito'}</strong></span><span>MRR <strong>{canViewTotal?formatCurrency(totals.recurringMonthlyTotal):'Restrito'}</strong></span><span>ARR <strong>{canViewTotal?formatCurrency(totals.annualRecurringTotal):'Restrito'}</strong></span><span>Única <strong>{canViewTotal?formatCurrency(totals.oneTimeTotal):'Restrito'}</strong></span></div><span className="modal__footer-spacer"/>{step > 1 ? <Button variant="secondary" onClick={() => setStep((current) => Math.max(1, current - 1))}>Voltar</Button> : <Button variant="secondary" onClick={onClose}>Cancelar</Button>}{step < 4 ? <Button disabled={!canAdvance} onClick={() => setStep((current) => Math.min(4, current + 1))}>Continuar</Button> : <Button loading={saving} onClick={() => void submit()}>Salvar proposta</Button>}</>}>
    <div className="proposal-wizard">
      <nav className="proposal-wizard__steps" aria-label="Etapas da proposta">{['Cliente', 'Itens e preço', 'Condições', 'Revisar e salvar'].map((label, index) => <button key={label} type="button" className={`${step === index + 1 ? 'is-active' : ''} ${step > index + 1 ? 'is-complete' : ''}`} onClick={() => { if (index + 1 < step) setStep(index + 1) }}><span>{step > index + 1 ? '✓' : index + 1}</span><strong>{label}</strong></button>)}</nav>
      <div className="proposal-editor proposal-editor--wizard">
        {step === 1 ? <section className="proposal-wizard__panel">
          <header><span className="eyebrow">Etapa 1 de 4</span><h3>Cliente e oportunidade</h3><p>Use o contexto comercial já existente e defina como a proposta entra no forecast.</p></header>
          <div className="form-grid">
            <label className="form-field"><span>Oportunidade / contato</span><NativeSelectionSelect autoFocus data-autofocus value={leadId} disabled={Boolean(proposal)} onChange={(event) => setLeadId(event.target.value)}>{leads.map((lead) => { const opportunity = opportunityByLeadId.get(lead.id); return <option value={lead.id} key={lead.id}>{opportunity?.title || lead.company || lead.name} · {lead.name}</option> })}</NativeSelectionSelect></label>
            <label className="form-field"><span>Título</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            <label className="form-field"><span>Categoria do forecast</span><NativeSelectionSelect value={forecastCategory} onChange={(event) => setForecastCategory(event.target.value as ForecastCategory)}><option value="pipeline">Pipeline</option><option value="best_case">Melhor cenário</option><option value="commit">Comprometido</option><option value="omitted">Fora da previsão</option></NativeSelectionSelect></label>
            <label className="form-field"><span>Probabilidade (%)</span><input type="number" min="0" max="100" value={probability} onChange={(event) => setProbability(event.target.value)} /></label>
            <div className="proposal-forecast-help-v10173 form-field--full"><strong>Como o forecast funciona</strong><span>A categoria define o cenário comercial; a probabilidade define o peso financeiro usado na previsão.</span></div>
            {!proposal ? <SelectionCheckbox className="form-field form-field--full proposal-official-selection" checked={makeOfficial} onCheckedChange={setMakeOfficial} label="Definir como proposta oficial" description="Será a referência principal da oportunidade e do forecast." /> : null}
          </div>
          {stepValidationMessage ? <div className="proposal-wizard__validation" role="status"><AlertTriangle size={15}/><span><strong>Para continuar</strong>{stepValidationMessage}</span></div> : null}
          {selectedLead ? <div className="proposal-wizard__client proposal-wizard__client-v10166"><span className="lead-cell__avatar">{selectedLead.name.split(/\s+/).filter(Boolean).slice(0,2).map((part) => part[0]).join('').toUpperCase()}</span><span><small>Oportunidade</small><strong>{selectedOpportunity?.title || selectedLead.company || selectedLead.name}</strong><small>{selectedLead.name} · {selectedLead.company || 'Sem empresa'} · {selectedLead.ownerName || 'Equipe'}</small></span><em>{formatCurrency(selectedOpportunity?.value ?? selectedLead.value)} no Pipeline</em></div> : null}
        </section> : null}

        {step === 2 ? <section className="proposal-line-items proposal-wizard__panel proposal-pricing-workspace proposal-pricing-workspace--catalog-first">
          <header><div><span className="eyebrow">Etapa 2 de 4</span><h3>Produtos e preço negociado</h3><p>O produto vem do catálogo com identidade, cobrança, imposto e política já definidos. Aqui você negocia apenas quantidade, preço e desconto.</p></div><Button size="sm" onClick={() => openCatalogPicker()}><PackagePlus size={14}/> Adicionar produto</Button></header>
          <div className="proposal-pricing-summary">
            <div><span>Subtotal</span><strong>{canViewTotal?formatCurrency(totals.subtotal):'Restrito'}</strong></div><div><span>Descontos</span><strong>{canViewDiscount?formatCurrency(totals.discountTotal):'Restrito'}</strong></div><div><span>Impostos</span><strong>{canViewTotal?formatCurrency(totals.taxTotal):'Restrito'}</strong></div><div><span>MRR</span><strong>{canViewTotal?formatCurrency(totals.recurringMonthlyTotal):'Restrito'}</strong></div><div className="is-primary"><span>TCV · {term} meses</span><strong>{canViewTotal?formatCurrency(totals.totalContractValue):'Restrito'}</strong></div>
          </div>
          {!items.length ? <div className="proposal-catalog-empty"><div className="proposal-catalog-empty__icon"><ShoppingBasket size={28}/></div><div><strong>Monte a proposta a partir do catálogo</strong><p>Escolha produtos já preparados pelo time. O CRM traz preço de tabela, cobrança, imposto, custo e guardrails automaticamente.</p></div><Button onClick={() => openCatalogPicker()}><PackagePlus size={15}/> Escolher produto</Button></div> : null}
          <div className="proposal-pricing-items">
            {items.map((item, index) => {
              const product = products.find((candidate) => candidate.id === item.productId) ?? null
              const policy = proposalPricingPolicy(item, product)
              const sourceLabel = item.productId ? (item.pricingOverridden ? 'Preço negociado' : 'Preço de tabela') : 'Item legado/manual'
              return <article key={item.id} className={`proposal-price-card proposal-price-card--catalog-first ${policy.requiresApproval ? 'has-policy-warning' : ''}`}>
                <div className="proposal-price-card__top"><div><span className="eyebrow">Item {index + 1} · {product?.category || 'Catálogo'}</span><strong>{item.name || product?.name || 'Produto'}</strong><small>{product?.sku || 'Sem SKU'} · {product?.billingType === 'recurring' ? `recorrente ${product.billingInterval === 'year' ? 'anual' : product.billingInterval === 'quarter' ? 'trimestral' : 'mensal'}` : 'pagamento único'}</small></div><div className="proposal-price-card__badges"><span className={`proposal-price-source ${item.productId ? 'is-catalog' : 'is-manual'}`}>{sourceLabel}</span>{policy.requiresApproval ? <span className="proposal-price-source is-warning"><AlertTriangle size={12}/> Revisar política</span> : null}</div></div>
                {item.productId ? <div className="proposal-product-reference"><div><span>Preço tabela</span><strong>{formatCurrency(item.catalogUnitPrice ?? product?.unitPrice ?? 0)}</strong></div><div><span>Custo snapshot</span><strong>{canViewCost?formatCurrency(item.unitCostSnapshot ?? product?.unitCost ?? 0):'Restrito'}</strong></div><div><span>Cobrança</span><strong>{product?.billingType === 'recurring' ? (product.billingInterval === 'year' ? 'Anual' : product.billingInterval === 'quarter' ? 'Trimestral' : 'Mensal') : 'Única'}</strong></div><button type="button" onClick={() => openCatalogPicker(item.id)}>Trocar produto</button></div> : <div className="proposal-legacy-manual"><AlertTriangle size={15}/><span><strong>Item manual legado</strong>Esta proposta antiga mantém o item, mas novas propostas usam somente produtos do catálogo.</span></div>}
                <div className="proposal-price-card__fields proposal-price-card__fields--catalog-first">
                  {!item.productId ? <label className="form-field proposal-item-name"><span>Nome legado</span><input value={item.name} onChange={(event) => patchLine(item.id, { name: event.target.value })} /></label> : null}
                  <label className="form-field"><span>Quantidade</span><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => patchLine(item.id, { quantity: Number(event.target.value) })} /></label>
                  <label className="form-field"><span>Preço negociado</span><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => patchLine(item.id, { unitPrice: Number(event.target.value) })} /></label>
                  <label className="form-field"><span>Desconto (%)</span>{canViewDiscount?<input type="number" min="0" max="100" step="0.01" disabled={!canEditDiscount} value={item.discountPercent} onChange={(event) => patchLine(item.id, { discountPercent: Number(event.target.value) })} />:<strong className="field-restricted-h223">Restrito pelo perfil</strong>}</label>
                  {item.productId && item.pricingOverridden ? <button type="button" className="proposal-restore-price proposal-restore-price--inline" onClick={() => restoreCatalogPricing(item.id)}><RotateCcw size={13}/> Restaurar tabela</button> : null}
                </div>
                <div className="proposal-price-card__footer"><div><span>Preço líquido</span><strong>{formatCurrency(Math.max(0, item.unitPrice * (1 - item.discountPercent / 100)))}</strong><small>{canViewDiscount?(item.discountPercent ? `${item.discountPercent}% de desconto` : 'Sem desconto'):'Desconto restrito'}</small></div><div><span>Margem comercial</span><strong>{canViewMargin?`${Math.round(policy.marginPercent)}%`:'Restrita'}</strong><small>{canViewMargin?(policy.grossMarginAmount >= 0 ? formatCurrency(policy.grossMarginAmount) : 'Margem negativa'):'Campo sensível'}</small></div><div><span>Total da linha</span><strong>{canViewTotal?formatCurrency(item.lineTotal):'Restrito'}</strong><small>{item.billingType === 'recurring' ? `${formatCurrency(item.recurringMonthlyTotal)} MRR` : 'Cobrança única'}</small></div><button type="button" className="proposal-price-card__remove" disabled={items.length <= 1 && Boolean(proposal)} onClick={() => setItems((current) => current.filter((line) => line.id !== item.id))}>Remover</button></div>
                {policy.requiresApproval ? <div className="pricing-policy-alert proposal-line-policy"><AlertTriangle size={15}/><span><strong>Fora da política recomendada</strong>{policy.reasons.join(' ')}</span></div> : <div className="pricing-policy-ok proposal-line-policy"><ShieldCheck size={15}/><span><strong>Dentro da política comercial</strong>Preço e margem respeitam os guardrails do catálogo.</span></div>}
              </article>
            })}
          </div>
          <CatalogProductPicker open={catalogPickerOpen} products={products} onClose={() => { setCatalogPickerOpen(false); setCatalogReplaceLineId(null) }} onPick={addCatalogProduct}/>
        </section> : null}

        {step === 3 ? <section className="proposal-wizard__panel proposal-conditions-workspace">
          <header><span className="eyebrow">Etapa 3 de 4</span><h3>Condições comerciais</h3><p>Datas e renovação seguem uma lógica operacional clara; o fim do contrato pode ser calculado automaticamente pelo prazo.</p></header>
          <div className="proposal-condition-grid">
            <section><header><strong>Negociação</strong><small>Prazos de fechamento e aceite.</small></header><div className="form-grid">
              <label className="form-field"><span>Fechamento previsto</span><input type="date" value={expectedCloseAt} onChange={(event) => setExpectedCloseAt(event.target.value)} /></label>
              <label className="form-field"><span>Validade para aceite</span><input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></label>
            </div></section>
            <section><header><strong>Contrato</strong><small>Período usado na composição do TCV.</small></header><div className="form-grid">
              <label className="form-field"><span>Início do contrato</span><input type="date" value={contractStartAt} onChange={(event) => setContractStartAt(event.target.value)} /></label>
              <label className="form-field"><span>Duração (meses)</span><input type="number" min="1" max="600" value={contractTermMonths} onChange={(event) => setContractTermMonths(event.target.value)} /></label>
              <div className="form-field form-field--full"><span>Fim do contrato</span><div className="proposal-date-mode"><button type="button" className={contractEndMode === 'auto' ? 'is-active' : ''} onClick={() => setContractEndMode('auto')}>Automático</button><button type="button" className={contractEndMode === 'manual' ? 'is-active' : ''} onClick={() => setContractEndMode('manual')}>Personalizado</button></div><input type="date" value={contractEndAt} readOnly={contractEndMode === 'auto'} onChange={(event) => setContractEndAt(event.target.value)} /><small>{contractEndMode === 'auto' ? 'Calculado a partir do início + duração.' : 'Data definida manualmente.'}</small></div>
              <div className="form-field form-field--full"><span>Renovação</span><div className="proposal-choice"><button type="button" className={autoRenew ? 'is-active' : ''} onClick={() => setAutoRenew(true)}>Automática</button><button type="button" className={!autoRenew ? 'is-active' : ''} onClick={() => setAutoRenew(false)}>Manual</button></div></div>
            </div></section>
            <section><header><strong>Pós-venda</strong><small>Define o início e a cadência após o aceite.</small></header><div className="form-grid">
              <label className="form-field"><span>Início do pós-venda</span><input type="date" value={postSaleStartAt} onChange={(event) => setPostSaleStartAt(event.target.value)} /></label>
              <label className="form-field"><span>Cadência pós-venda</span><input value={postSaleCadenceName} onChange={(event) => setPostSaleCadenceName(event.target.value)} /></label>
            </div></section>
            <section><header><strong>Observações e termos</strong><small>Conteúdo complementar da negociação.</small></header><div className="form-grid">
              <label className="form-field form-field--full"><span>Observações internas</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
              <label className="form-field form-field--full"><span>Condições comerciais</span><textarea rows={4} value={terms} onChange={(event) => setTerms(event.target.value)} /></label>
            </div></section>
          </div>
        </section> : null}

        {step === 4 ? <section className="proposal-wizard__panel proposal-review">
          <header><span className="eyebrow">Etapa 4 de 4</span><h3>Revisar antes de salvar</h3><p>Confira cliente, itens, valores e condições. Depois de enviada, a proposta deixa de ser editável e novas mudanças viram revisão.</p></header>
          <div className="proposal-review__hero"><div><small>Cliente</small><strong>{selectedLead?.company || selectedLead?.name || 'Não selecionado'}</strong><span>{selectedLead?.name || ''}</span></div><div><small>Título</small><strong>{title}</strong><span>{forecastLabels[forecastCategory]} · {percent(Number(probability || 0))}</span></div></div>
          {approvalRequired?<div className="proposal-approval-banner-h223"><AlertTriangle size={17}/><div><strong>Esta proposta exige aprovação</strong><span>{approvalReasons.join(' ')}</span><small>Ao salvar, ela permanece como rascunho e entra automaticamente na fila do gestor.</small></div></div>:null}
          <div className="proposal-review__money"><div><span>TCV</span><strong>{canViewTotal?formatCurrency(totals.totalContractValue):'Restrito'}</strong></div><div><span>MRR</span><strong>{canViewTotal?formatCurrency(totals.recurringMonthlyTotal):'Restrito'}</strong></div><div><span>ARR</span><strong>{canViewTotal?formatCurrency(totals.annualRecurringTotal):'Restrito'}</strong></div><div><span>Total do documento</span><strong>{canViewTotal?formatCurrency(totals.total):'Restrito'}</strong></div></div>
          <div className="proposal-review__items">{items.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{item.quantity} × {canViewTotal?formatCurrency(item.unitPrice):'valor restrito'}{canViewDiscount&&item.discountPercent ? ` · ${item.discountPercent}% desconto` : ''}</small></span><strong>{canViewTotal?formatCurrency(item.lineTotal):'Restrito'}</strong></div>)}</div>
          <div className="proposal-review__conditions"><span>Validade <strong>{formatDate(validUntil)}</strong></span><span>Fechamento <strong>{formatDate(expectedCloseAt)}</strong></span><span>Contrato <strong>{term} meses</strong></span><span>Pós-venda <strong>{postSaleCadenceName || 'Não definido'}</strong></span></div>
        </section> : null}
      </div>
    </div>
  </Modal>
}

function RevenueModal({ open, proposal, onClose }: { open: boolean; proposal: ProposalRecord | null; onClose(): void }) {
  const { snapshot, teamAccess } = useAppWorkspace()
  const canViewRevenue = canViewSensitiveField(teamAccess,'revenue_amount')
  const canEditRevenue = canEditSensitiveField(teamAccess,'revenue_amount')
  const { createRevenueEntry } = useAppActions()
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

  return <Modal open={open} title="Registrar receita por competência" subtitle="O aceite e o fechamento não geram receita automaticamente." size="lg" onClose={onClose} footer={<><span className="modal__footer-spacer"/><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} disabled={!canEditRevenue} onClick={() => void submit()}>Registrar</Button></>}>
    <div className="form-grid">
      <label className="form-field form-field--full"><span>Proposta ganha</span><NativeSelectionSelect value={proposalId} onChange={(event) => selectProposal(event.target.value)}><option value="">Lançamento sem proposta</option>{snapshot?.proposals.filter((item) => item.closedWonAt && item.isOfficial && item.isCurrentVersion).map((item) => <option value={item.id} key={item.id}>{item.proposalNumber} · {item.title}</option>)}</NativeSelectionSelect></label>
      <label className="form-field"><span>Tipo</span><NativeSelectionSelect value={type} onChange={(event) => { const next = event.target.value as RevenueType; setType(next); if (selectedProposal) { setAmount(String(next === 'recurring' ? selectedProposal.recurringMonthlyTotal : selectedProposal.oneTimeTotal)); setDescription(`${selectedProposal.proposalNumber} · ${next === 'recurring' ? 'mensalidade' : 'receita única'}`) } }}><option value="one_time">Receita única</option><option value="recurring">Receita recorrente</option></NativeSelectionSelect></label>
      <label className="form-field"><span>Situação</span><NativeSelectionSelect value={status} onChange={(event) => setStatus(event.target.value as RevenueStatus)}><option value="recognized">Reconhecida</option><option value="forecast">Prevista</option></NativeSelectionSelect></label>
      <label className="form-field"><span>Valor da competência (R$)</span>{canViewRevenue?<input type="number" min="0" step="0.01" disabled={!canEditRevenue} value={amount} onChange={(event) => setAmount(event.target.value)} />:<strong className="field-restricted-h223">Restrito pelo perfil</strong>}</label>
      {type === 'recurring' ? <label className="form-field"><span>MRR da competência (R$)</span>{canViewRevenue?<input type="number" min="0" step="0.01" disabled={!canEditRevenue} value={mrr} onChange={(event) => setMrr(event.target.value)} />:<strong className="field-restricted-h223">Restrito pelo perfil</strong>}</label> : null}
      <label className="form-field"><span>Competência</span><input type="date" value={competenceDate} onChange={(event) => setCompetenceDate(event.target.value)} /></label>
      <label className="form-field"><span>Início do serviço</span><input type="date" value={servicePeriodStart} onChange={(event) => setServicePeriodStart(event.target.value)} /></label>
      <label className="form-field"><span>Fim do serviço</span><input type="date" value={servicePeriodEnd} onChange={(event) => setServicePeriodEnd(event.target.value)} /></label>
      <label className="form-field"><span>Motivo de ajuste</span><input value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder="Obrigatório apenas em correções" /></label>
      <label className="form-field form-field--full"><span>Descrição</span><input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    </div>
  </Modal>
}

export function ProposalsPage() {
  const { snapshot, teamAccess, canTeamAccess, canTeamAccessRecord } = useAppWorkspace()
  const { routeContext, clearRouteContext } = useAppNavigation()
  const { createProduct, updateProduct, deleteProduct, updateProposalStatus, createProposalRevision, createActivity, createBuyerRoom, setOfficialProposal, closeOpportunityFromProposal, deleteProposal, updateRevenueEntryStatus, reconcileProposalItems } = useAppActions()
  const [tab, setTab] = useState<Tab>('proposals')
  const [productModal, setProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null)
  const [productStudio, setProductStudio] = useState<ProductRecord | null>(null)
  const [catalogView, setCatalogView] = useState<'cards' | 'table'>('cards')
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
  const [proposalView, setProposalView] = useState<'cards' | 'list'>('cards')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [viewingProposal, setViewingProposal] = useState<ProposalRecord | null>(null)
  const [messageProposal, setMessageProposal] = useState<ProposalRecord | null>(null)
  const [buyerRoomId, setBuyerRoomId] = useState<string | null>(null)
  const [buyerRoomSeed, setBuyerRoomSeed] = useState<BuyerRoom | null>(null)
  const [productQuery, setProductQuery] = useState('')
  const [productCategory, setProductCategory] = useState('all')
  const [productStatus, setProductStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [revenueStatusFilter, setRevenueStatusFilter] = useState<'all' | RevenueStatus>('all')
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const canProposalCreate = canTeamAccess('create','proposals')
  const canProposalEdit = canTeamAccess('edit','proposals')
  const canProposalDelete = canTeamAccess('delete','proposals')
  const canProposalExport = canTeamAccess('export','proposals')
  const canViewProposalTotal = canViewSensitiveField(teamAccess,'proposal_total')
  const canViewProposalMargin = canViewSensitiveField(teamAccess,'proposal_margin')
  const canViewProposalCost = canViewSensitiveField(teamAccess,'proposal_cost')
  const canViewRevenueAmount = canViewSensitiveField(teamAccess,'revenue_amount')

  useEffect(() => {
    if (routeContext.proposalId && snapshot?.proposals.some((item) => item.id === routeContext.proposalId)) {
      const proposal = snapshot.proposals.find((item) => item.id === routeContext.proposalId) ?? null
      setViewingProposal(proposal); setTab('proposals')
    } else if (routeContext.action === 'create-proposal' && routeContext.leadId) {
      setEditingProposal(null); setProposalModal(true); setTab('proposals')
    } else if (routeContext.action === 'forecast') {
      setTab('forecast')
      clearRouteContext(['action'])
    } else if (routeContext.action === 'follow-proposal' && routeContext.leadId) {
      const proposal = snapshot?.proposals
        .filter((item) => item.leadId === routeContext.leadId && item.isCurrentVersion)
        .sort((a, b) => Number(b.isOfficial) - Number(a.isOfficial) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null
      if (proposal) { setViewingProposal(proposal); setTab('proposals') }
    }
  }, [routeContext.action, routeContext.leadId, routeContext.proposalId, snapshot?.proposals])

  const forecast = useMemo(() => snapshot ? calculateRevenueForecast(snapshot) : null, [snapshot])
  if (!snapshot || !forecast) return null

  const leadName = (id: string) => {
    const lead = snapshot.leads.find((item) => item.id === id)
    return lead ? `${lead.name}${lead.company ? ` · ${lead.company}` : ''}` : 'Contato removido'
  }
  const ownerName = (proposal: ProposalRecord) => snapshot.leads.find((item) => item.id === proposal.leadId)?.ownerName || 'Não atribuído'
  const proposalNextAction = (proposal: ProposalRecord) => proposal.closedWonAt ? 'Reconhecer receita' : proposal.status === 'accepted' ? 'Aceite registrado' : proposal.status === 'draft' ? 'Revisar e enviar' : proposal.status === 'viewed' ? 'Fazer follow-up' : proposal.status === 'sent' ? 'Aguardar visualização / follow-up' : 'Sem ação pendente'

  const proposalStages = proposalPipelineStages(snapshot.stages)
  const proposalStageIds = proposalPipelineStageIds(snapshot.stages)
  const pipelineProposalLeadIds = new Set(snapshot.leads.filter((lead) => lead.status === 'active' && proposalStageIds.has(lead.stageId)).map((lead) => lead.id))
  const currentProposals = snapshot.proposals.filter((proposal) => { const lead = snapshot.leads.find((item) => item.id === proposal.leadId); return proposal.isCurrentVersion && pipelineProposalLeadIds.has(proposal.leadId) && canTeamAccessRecord('proposals', proposal.ownerId ?? lead?.ownerId ?? null) })
  const proposalWorkspaceStats = {
    negotiating: currentProposals.filter((proposal) => proposal.isOfficial && ['draft', 'sent', 'viewed', 'accepted'].includes(proposal.status) && !proposal.closedWonAt).reduce((sum, proposal) => sum + proposal.totalContractValue, 0),
    waiting: currentProposals.filter((proposal) => proposal.isOfficial && ['sent', 'viewed'].includes(proposal.status)).reduce((sum, proposal) => sum + proposal.totalContractValue, 0),
    expiringSoon: currentProposals.filter((proposal) => proposal.validUntil && !['accepted', 'rejected', 'cancelled'].includes(proposal.status) && new Date(`${proposal.validUntil}T23:59:59`).getTime() >= Date.now() && new Date(`${proposal.validUntil}T23:59:59`).getTime() <= Date.now() + 7 * 86_400_000).length,
    wonBookings: currentProposals.filter((proposal) => Boolean(proposal.closedWonAt)).reduce((sum, proposal) => sum + proposal.totalContractValue, 0),
  }
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

  const activeProposalFilterCount = (statusFilter !== 'all' ? 1 : 0) + (officialFilter !== 'all' ? 1 : 0)
  const universalProposalFilters: WorkspaceFilterField[] = [
    { key: 'status', label: 'Status', value: statusFilter, allValue: 'all', allLabel: 'Todos os status', group: 'Proposta', options: [{ value: 'draft', label: 'Em elaboração' }, { value: 'waiting', label: 'Aguardando cliente' }, { value: 'accepted', label: 'Aceite pendente' }, { value: 'closed', label: 'Fechadas' }, { value: 'expired', label: 'Vencidas' }] },
    { key: 'official', label: 'Tipo', value: officialFilter, allValue: 'all', allLabel: 'Oficiais e alternativas', group: 'Proposta', options: [{ value: 'official', label: 'Somente oficiais' }, { value: 'alternative', label: 'Somente alternativas' }] },
  ]
  const changeProposalQuickFilter = (key: string, value: string) => { if (key === 'status') setStatusFilter(value as ProposalFilter); else if (key === 'official') setOfficialFilter(value as OfficialFilter); setPage(1) }
  const clearProposalFilters = () => { setStatusFilter('all'); setOfficialFilter('all'); setPage(1) }
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const toggleSelected = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const toggleAll = () => setSelectedIds((current) => paged.every((item) => current.includes(item.id)) ? current.filter((id) => !paged.some((item) => item.id === id)) : [...new Set([...current, ...paged.map((item) => item.id)])])
  const toggleExpanded = (groupId: string) => setExpandedGroups((current) => current.includes(groupId) ? current.filter((item) => item !== groupId) : [...current, groupId])
  const statusAction = async (proposal: ProposalRecord, status: ProposalStatus) => {
    if (!canProposalEdit) return
    const updated = await updateProposalStatus(proposal.id, status)
    if (status === 'accepted' && !updated.closedWonAt) await closeOpportunityFromProposal(updated.id)
  }
  const createProposalFollowup = async (proposal: ProposalRecord) => {
    if (!canProposalEdit) return
    const lead = snapshot.leads.find((item) => item.id === proposal.leadId)
    const due = new Date(); due.setDate(due.getDate() + 1); due.setHours(9, 0, 0, 0)
    await createActivity({ leadId: proposal.leadId, contactId: proposal.contactId ?? null, type: 'followup', title: `Follow-up da proposta ${proposal.proposalNumber}`, description: `Retomar negociação de ${proposal.title}.`, dueAt: due.toISOString(), completedAt: null, assignedTo: lead?.ownerId ?? proposal.ownerId ?? null })
  }

  const openBuyerRoom = async (proposal: ProposalRecord) => {
    let room = (snapshot.buyerRooms ?? []).find((item) => item.proposalId === proposal.id) ?? null
    if (!room) {
      if (!canProposalCreate) return
      room = await createBuyerRoom(buildBuyerRoomDraft(proposal, snapshot))
    }
    setBuyerRoomSeed(room); setBuyerRoomId(room.id); setViewingProposal(null)
  }
  const activeBuyerRoom = (snapshot.buyerRooms ?? []).find((item) => item.id === buyerRoomId) ?? buyerRoomSeed
  const activeBuyerRoomProposal = activeBuyerRoom ? snapshot.proposals.find((item) => item.id === activeBuyerRoom.proposalId) ?? null : null
  const cancelSelected = async () => {
    for (const id of selectedIds) {
      const proposal = snapshot.proposals.find((item) => item.id === id)
      if (proposal && !proposal.closedWonAt && ['draft', 'sent', 'viewed', 'accepted'].includes(proposal.status)) await updateProposalStatus(id, 'cancelled')
    }
    setSelectedIds([])
  }

  const productCategories = [...new Set(snapshot.products.map((product) => product.category.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const filteredProducts = snapshot.products.filter((product) => {
    const searchable = `${product.name} ${product.sku} ${product.category} ${product.description}`.toLowerCase()
    const matchesQuery = searchable.includes(productQuery.trim().toLowerCase())
    const matchesCategory = productCategory === 'all' || product.category === productCategory
    const matchesStatus = productStatus === 'all' || (productStatus === 'active' ? product.active : !product.active)
    return matchesQuery && matchesCategory && matchesStatus
  })
  const universalCatalogFilters: WorkspaceFilterField[] = [
    { key: 'category', label: 'Categoria', value: productCategory, allValue: 'all', allLabel: 'Todas as categorias', group: 'Catálogo', options: productCategories.map((category) => ({ value: category, label: category })) },
    { key: 'status', label: 'Status', value: productStatus, allValue: 'all', allLabel: 'Ativos e inativos', group: 'Catálogo', options: [{ value: 'active', label: 'Somente ativos' }, { value: 'inactive', label: 'Somente inativos' }] },
  ]
  const catalogFilterCount = (productCategory !== 'all' ? 1 : 0) + (productStatus !== 'all' ? 1 : 0)
  const clearCatalogFilters = () => { setProductCategory('all'); setProductStatus('all') }
  const universalRevenueFilters: WorkspaceFilterField[] = [{ key: 'status', label: 'Status', value: revenueStatusFilter, allValue: 'all', allLabel: 'Todos', group: 'Receita', options: [{ value: 'recognized', label: 'Reconhecida' }, { value: 'forecast', label: 'Prevista' }, { value: 'cancelled', label: 'Cancelada' }] }]
  const productUsageCount = (productId: string) => snapshot.proposals.filter((proposal) => proposal.isCurrentVersion && proposal.items.some((item) => item.productId === productId)).length
  const productHistoricalUsageCount = (productId: string) => snapshot.proposals.filter((proposal) => proposal.items.some((item) => item.productId === productId)).length
  const legacyCatalogItems = [...snapshot.proposals.reduce((acc, proposal) => {
    for (const item of proposal.items) {
      if (item.productId || !item.name.trim()) continue
      const key = item.name.trim().toLocaleLowerCase('pt-BR')
      const current = acc.get(key) ?? { name: item.name.trim(), count: 0 }
      current.count += 1
      acc.set(key, current)
    }
    return acc
  }, new Map<string, { name: string; count: number }>()).values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'))
  const activeCatalogProducts = snapshot.products.filter((product) => product.active && (product.lifecycleStatus ?? 'active') === 'active')
  const recurringCatalogProducts = activeCatalogProducts.filter((product) => product.billingType === 'recurring')
  const currentCatalogProposals = snapshot.proposals.filter((proposal) => proposal.isCurrentVersion)
  const linkedCatalogProposalIds = new Set(currentCatalogProposals.filter((proposal) => proposal.items.some((item) => item.productId)).map((proposal) => proposal.id))
  const catalogStats = {
    active: activeCatalogProducts.length,
    recurring: recurringCatalogProducts.length,
    averageMargin: activeCatalogProducts.length ? activeCatalogProducts.reduce((sum, product) => sum + productMarginPercent(product), 0) / activeCatalogProducts.length : 0,
    proposalAdoption: currentCatalogProposals.length ? linkedCatalogProposalIds.size / currentCatalogProposals.length * 100 : 0,
    recurringListPriceMrr: recurringCatalogProducts.reduce((sum, product) => sum + (product.billingInterval === 'year' ? product.unitPrice / 12 : product.billingInterval === 'quarter' ? product.unitPrice / 3 : product.unitPrice), 0),
    bookings: currentCatalogProposals.filter((proposal) => proposal.closedWonAt && proposal.items.some((item) => item.productId)).reduce((sum, proposal) => sum + proposal.totalContractValue, 0),
    openPipeline: currentCatalogProposals.filter((proposal) => !proposal.closedWonAt && !['rejected','cancelled','expired'].includes(proposal.status) && proposal.items.some((item) => item.productId)).reduce((sum, proposal) => sum + proposal.totalContractValue, 0),
  }
  const duplicateProduct = async (product: ProductRecord) => {
    if (!canProposalCreate) return
    await createProduct({
      name: `${product.name} (cópia)`,
      sku: product.sku ? `${product.sku}-COPIA` : '',
      description: product.description,
      category: product.category,
      active: false,
      unitPrice: product.unitPrice,
      unitCost: product.unitCost ?? 0,
      kind: product.kind ?? 'service',
      unitLabel: product.unitLabel ?? 'unidade',
      defaultDiscountPercent: product.defaultDiscountPercent ?? 0,
      maxDiscountPercent: product.maxDiscountPercent ?? 20,
      minMarginPercent: product.minMarginPercent ?? 0,
      valueProposition: product.valueProposition ?? '',
      targetCustomer: product.targetCustomer ?? '',
      salesNotes: product.salesNotes ?? '',
      pricingMode: product.pricingMode ?? 'fixed',
      lifecycleStatus: 'draft',
      salesProblems: product.salesProblems ?? [],
      salesBenefits: product.salesBenefits ?? [],
      discoveryQuestions: product.discoveryQuestions ?? [],
      objectionNotes: product.objectionNotes ?? [],
      salesProofs: product.salesProofs ?? [],
      competitors: product.competitors ?? [],
      bundleItems: product.bundleItems ?? [],
      billingType: product.billingType,
      billingInterval: product.billingInterval,
      taxRate: product.taxRate,
    })
  }

  return <div className={`page-stack proposals-page proposals-page-v10166 proposals-page-h20 ${filtersOpen ? 'proposals-page-v10166--filters-open' : ''}`}>
    <WorkspacePageHeader className="proposal-page-header-h20" data-can-export={canProposalExport ? 'true' : 'false'} eyebrow="Fechamento comercial" icon={FileText} title="Propostas" description="Crie, acompanhe e avance propostas vinculadas ao Pipeline sem sair do fluxo comercial." actions={<Button onClick={() => { setEditingProposal(null); setProposalModal(true) }} disabled={!canProposalCreate || !proposalStages.length}><Plus size={17}/> Nova proposta</Button>} />
    {!proposalStages.length ? <section className="proposal-sync-alert"><strong>Etapa de Proposta não encontrada no Pipeline.</strong><span>Crie ou renomeie uma etapa para “Proposta” antes de cadastrar novas propostas.</span></section> : null}
    <WorkspaceSummaryStrip className="proposal-summary-strip-h20">
      <WorkspaceSummaryMetric icon={FileText} label="Em negociação" value={canViewProposalTotal?formatCurrency(proposalWorkspaceStats.negotiating):'Restrito'} meta="TCV ativo" />
      <WorkspaceSummaryMetric icon={TrendingUp} label="Aguardando resposta" value={canViewProposalTotal?formatCurrency(proposalWorkspaceStats.waiting):'Restrito'} meta="valor em decisão" />
      <WorkspaceSummaryMetric icon={CalendarClock} tone={proposalWorkspaceStats.expiringSoon ? 'warning' : 'neutral'} label="Vencendo em 7 dias" value={proposalWorkspaceStats.expiringSoon} meta="propostas com prazo próximo" />
      <WorkspaceSummaryMetric icon={BadgeDollarSign} tone="success" label="Bookings ganhos" value={canViewProposalTotal?formatCurrency(proposalWorkspaceStats.wonBookings):'Restrito'} meta="fechamentos confirmados" />
    </WorkspaceSummaryStrip>
    <WorkspaceViewStrip className="proposal-area-view-strip-h20" value={tab} onChange={setTab} ariaLabel="Áreas de propostas" items={[
      { id: 'proposals', label: 'Propostas', icon: FileText },
      { id: 'rooms', label: 'Buyer Rooms', icon: Handshake, badge: (snapshot.buyerRooms ?? []).filter((room) => { const proposal=snapshot.proposals.find((item)=>item.id===room.proposalId); const lead=snapshot.leads.find((item)=>item.id===room.leadId); return room.status !== 'archived' && canTeamAccessRecord('proposals', proposal?.ownerId ?? lead?.ownerId ?? null) }).length },
      { id: 'products', label: 'Catálogo', icon: Boxes, badge: activeCatalogProducts.length },
      { id: 'revenue', label: 'Receita realizada', icon: ReceiptText },
      { id: 'forecast', label: 'Revenue Intelligence', icon: TrendingUp },
    ] as const} />

    {tab === 'proposals' ? <section className="panel proposal-table-panel proposal-table-panel-v10166 proposal-table-panel-h20">
      <WorkspaceCommandBar className="proposal-command-bar-h20">
        <WorkspaceCommandGroup>
          <label className="search-field workspace-search-v10166 proposal-search-h20"><Search size={17}/><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Buscar proposta ou cliente" /></label>
        </WorkspaceCommandGroup>
        <WorkspaceCommandGroup align="end" className="proposal-toolbar-actions-v10166">
          <WorkspaceFilterMenu workspaceKey={`proposals:${snapshot.workspace.id}`} fields={universalProposalFilters} activeCount={activeProposalFilterCount} onOpenAdvanced={() => setFiltersOpen(true)} onClearAll={clearProposalFilters} onChange={changeProposalQuickFilter} />
          <WorkspaceSortMenu value={sort} onChange={(value) => setSort(value as ProposalSort)} options={[{ value: 'updated', label: 'Atualização recente' }, { value: 'close', label: 'Fechamento previsto' }, { value: 'validity', label: 'Validade' }, { value: 'tcv', label: 'Maior TCV' }, { value: 'mrr', label: 'Maior MRR' }]} />
          <WorkspaceDisplayMenu value={proposalView} onChange={(value) => setProposalView(value as typeof proposalView)} modes={[{ value: 'cards', label: 'Cards', icon: <LayoutGrid size={15}/> }, { value: 'list', label: 'Lista', icon: <List size={15}/> }]} />
        </WorkspaceCommandGroup>
      </WorkspaceCommandBar>

      {activeProposalFilterCount ? <div className="workspace-filter-chips-v10166 proposal-filter-chips-v10166">
        {statusFilter !== 'all' ? <button type="button" onClick={() => { setStatusFilter('all'); setPage(1) }}>Status: {statusFilter === 'draft' ? 'Em elaboração' : statusFilter === 'waiting' ? 'Aguardando cliente' : statusFilter === 'accepted' ? 'Aceite pendente' : statusFilter === 'closed' ? 'Fechadas' : 'Vencidas'} ×</button> : null}
        {officialFilter !== 'all' ? <button type="button" onClick={() => { setOfficialFilter('all'); setPage(1) }}>{officialFilter === 'official' ? 'Somente oficiais' : 'Somente alternativas'} ×</button> : null}
        <button type="button" className="is-clear" onClick={clearProposalFilters}>Limpar</button>
      </div> : null}
      {filtersOpen ? <aside className="workspace-settings-drawer-v10166 proposal-filter-drawer-v10166" aria-label="Filtros de propostas">
        <header><div><span>Propostas</span><strong>Filtros e exibição</strong></div><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Fechar filtros">×</button></header>
        <div className="workspace-settings-drawer-v10166__body">
          <section><div className="workspace-settings-section-title-v10166"><strong>Status comercial</strong><span>Mostre somente propostas no momento relevante da negociação.</span></div>
            <label className="field"><span>Status</span><NativeSelectionSelect value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as ProposalFilter); setPage(1) }}><option value="all">Todos os status</option><option value="draft">Em elaboração</option><option value="waiting">Aguardando cliente</option><option value="accepted">Aceite pendente de fechamento</option><option value="closed">Fechadas</option><option value="expired">Vencidas</option></NativeSelectionSelect></label>
            <label className="field"><span>Tipo de proposta</span><NativeSelectionSelect value={officialFilter} onChange={(event) => { setOfficialFilter(event.target.value as OfficialFilter); setPage(1) }}><option value="all">Oficiais e alternativas</option><option value="official">Somente oficiais</option><option value="alternative">Somente alternativas</option></NativeSelectionSelect></label>
          </section>
          <section><div className="workspace-settings-section-title-v10166"><strong>Classificação e visual</strong><span>Escolha a ordem e o formato sem ocupar espaço na toolbar principal.</span></div>
            <label className="field"><span>Classificar por</span><NativeSelectionSelect value={sort} onChange={(event) => setSort(event.target.value as ProposalSort)}><option value="updated">Atualização recente</option><option value="close">Fechamento previsto</option><option value="validity">Validade</option><option value="tcv">Maior TCV</option><option value="mrr">Maior MRR</option></NativeSelectionSelect></label>
            <div className="workspace-view-choice-v10166"><button type="button" className={proposalView === 'cards' ? 'is-active' : ''} onClick={() => setProposalView('cards')}><LayoutGrid size={16}/> Cards</button><button type="button" className={proposalView === 'list' ? 'is-active' : ''} onClick={() => setProposalView('list')}><List size={16}/> Lista</button></div>
          </section>
        </div>
        <footer><Button variant="secondary" onClick={clearProposalFilters}>Limpar filtros</Button><Button onClick={() => setFiltersOpen(false)}>Concluir</Button></footer>
      </aside> : null}
      {selectedIds.length ? <div className="proposal-bulk-bar"><strong>{selectedIds.length} selecionada(s)</strong><Button size="sm" variant="secondary" onClick={() => void cancelSelected()}>Cancelar selecionadas</Button><button type="button" onClick={() => setSelectedIds([])}>Limpar</button></div> : null}
      {proposalView === 'cards' ? <div className="proposal-card-grid">{paged.map((proposal) => {
        const nextAction = proposalNextAction(proposal)
        const lead = snapshot.leads.find((item) => item.id === proposal.leadId)
        const daysToValidity = proposal.validUntil ? Math.ceil((new Date(`${proposal.validUntil}T23:59:59`).getTime() - Date.now()) / 86_400_000) : null
        return <article key={proposal.id} className={`proposal-work-card proposal-work-card--${proposal.status} ${proposal.isOfficial ? 'is-official' : ''}`}>
          <button type="button" className="proposal-work-card__body" onClick={() => setViewingProposal(proposal)}>
            <header><span>{proposal.proposalNumber} · v{proposal.version}</span><StatusPill tone={proposalStatus[proposal.status].tone}>{proposalStatus[proposal.status].label}</StatusPill></header>
            <h3>{lead?.company || lead?.name || 'Cliente removido'}</h3><p>{proposal.title}</p>
            <div className="proposal-work-card__products">{proposal.items.slice(0, 2).map((item) => <span key={item.id}>{item.name}</span>)}{proposal.items.length > 2 ? <em>+{proposal.items.length - 2}</em> : null}</div>
            <div className="proposal-work-card__money"><span><small>TCV</small><strong>{canViewProposalTotal?formatCurrency(proposal.totalContractValue):'Restrito'}</strong></span><span><small>MRR</small><strong>{canViewProposalTotal?formatCurrency(proposal.recurringMonthlyTotal):'Restrito'}</strong></span></div>
            <div className="proposal-work-card__signals"><span>{proposal.status === 'viewed' ? `Visualizada ${proposal.viewedAt ? formatDate(proposal.viewedAt.slice(0,10)) : ''}` : `Atualizada ${formatDate(proposal.updatedAt.slice(0,10))}`}</span><span className={daysToValidity !== null && daysToValidity <= 3 ? 'is-danger' : ''}>{daysToValidity === null ? 'Sem validade definida' : daysToValidity < 0 ? 'Validade vencida' : `Vence em ${daysToValidity} dia(s)`}</span></div>
            <div className="proposal-work-card__next"><small>Próxima ação</small><strong>{nextAction}</strong></div>{(snapshot.buyerRooms ?? []).some((room) => room.proposalId === proposal.id) ? <div className="proposal-room-chip"><Handshake size={13}/> Buyer Room ativa</div> : null}
          </button>
          <footer><Button size="sm" onClick={() => setViewingProposal(proposal)}>{nextAction === 'Sem ação pendente' ? 'Abrir proposta' : `Abrir · ${nextAction}`}</Button><button type="button" title="WhatsApp" aria-label={`WhatsApp da proposta ${proposal.proposalNumber}`} disabled={!lead?.phone || lead.doNotContact} onClick={() => setMessageProposal(proposal)}><MessageCircle size={15}/></button><button type="button" aria-label="Abrir detalhes" onClick={() => setViewingProposal(proposal)}>•••</button></footer>
        </article>
      })}</div> : <div className="proposal-table-wrap"><table className="proposal-table"><thead><tr>
        <th><button type="button" className={`pipeline-select ${paged.length && paged.every((item) => selectedIds.includes(item.id)) ? 'is-selected' : ''}`} onClick={toggleAll}>{paged.length && paged.every((item) => selectedIds.includes(item.id)) ? <Check size={13}/> : null}</button></th>
        <th>Proposta</th><th>Oficial</th><th>Status</th><th>Forecast</th><th>Fechamento</th><th>Validade</th><th>TCV</th><th>MRR</th><th>Responsável</th><th>Próxima ação</th><th />
      </tr></thead><tbody>{paged.map((proposal) => {
        const history = snapshot.proposals.filter((item) => item.proposalGroupId === proposal.proposalGroupId && item.id !== proposal.id).sort((a, b) => b.version - a.version)
        const expanded = expandedGroups.includes(proposal.proposalGroupId)
        const nextAction = proposalNextAction(proposal)
        return <ProposalRows key={proposal.id} proposal={proposal} history={history} expanded={expanded} selected={selectedIds.includes(proposal.id)} leadLabel={leadName(proposal.leadId)} ownerLabel={ownerName(proposal)} nextAction={nextAction} canWrite={canProposalEdit} canViewTotal={canViewProposalTotal} onOpen={() => setViewingProposal(proposal)} onToggleSelected={() => toggleSelected(proposal.id)} onToggleExpanded={() => toggleExpanded(proposal.proposalGroupId)} onEdit={() => { setEditingProposal(proposal); setProposalModal(true) }} onStatus={(status) => void statusAction(proposal, status)} onRevision={() => void createProposalRevision(proposal.id)} onOfficial={() => void setOfficialProposal(proposal.id)} onCloseWon={() => void closeOpportunityFromProposal(proposal.id)} onRevenue={() => { setRevenueProposal(proposal); setRevenueModal(true) }} onDelete={() => void deleteProposal(proposal.id)} onWhatsApp={() => setMessageProposal(proposal)} />
      })}</tbody></table></div>}
      {!paged.length ? <div className="empty-state"><FileText/><strong>Nenhuma proposta encontrada</strong><p>Ajuste os filtros ou mova um negócio para a etapa de Proposta no Pipeline.</p></div> : null}
      <footer className="proposal-pagination"><span>{filtered.length} proposta(s) vigente(s)</span><label>Por página <NativeSelectionSelect value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}><option value="10">10</option><option value="20">20</option><option value="50">50</option></NativeSelectionSelect></label><Button size="sm" variant="secondary" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button><strong>{safePage} / {totalPages}</strong><Button size="sm" variant="secondary" disabled={safePage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Próxima</Button></footer>
    </section> : null}

    {tab === 'rooms' ? <section className="panel buyer-room-workspace"><div className="panel__heading"><div><span className="eyebrow">Buyer collaboration</span><h3>Buyer Rooms e planos de fechamento</h3><p>Compartilhe proposta, stakeholders e próximos passos em um espaço privado por negócio.</p></div><StatusPill tone="info">{(snapshot.buyerRooms ?? []).filter((room) => { const proposal=snapshot.proposals.find((item)=>item.id===room.proposalId); const lead=snapshot.leads.find((item)=>item.id===room.leadId); return room.status !== 'archived' && canTeamAccessRecord('proposals', proposal?.ownerId ?? lead?.ownerId ?? null) }).length} sala(s)</StatusPill></div>{(snapshot.buyerRooms ?? []).length ? <div className="buyer-room-workspace-grid">{(snapshot.buyerRooms ?? []).filter((room) => { const proposal=snapshot.proposals.find((item)=>item.id===room.proposalId); const lead=snapshot.leads.find((item)=>item.id===room.leadId); return room.status !== 'archived' && canTeamAccessRecord('proposals', proposal?.ownerId ?? lead?.ownerId ?? null) }).sort((a,b)=>new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime()).map((room) => { const proposal = snapshot.proposals.find((item)=>item.id===room.proposalId); const lead = snapshot.leads.find((item)=>item.id===room.leadId); const progress = buyerRoomProgress(room); return <article className="buyer-room-workspace-card" key={room.id}><header><span><Handshake size={16}/> {proposal?.proposalNumber ?? 'Proposta'}</span><StatusPill tone={room.status === 'completed' ? 'success' : room.status === 'active' ? 'warning' : room.shareEnabled ? 'info' : 'neutral'}>{room.status === 'completed' ? 'Concluída' : room.status === 'active' ? 'Em andamento' : room.shareEnabled ? 'Compartilhada' : 'Rascunho'}</StatusPill></header><div><h4>{room.title}</h4><p>{lead?.company || lead?.name || 'Cliente'}</p></div><div className="buyer-room-workspace-card__progress"><i style={{width:`${progress}%`}}/></div><small>{progress}% concluído · {room.viewCount} abertura(s)</small><footer><span>{room.lastOpenedAt ? `Última abertura ${formatDate(room.lastOpenedAt.slice(0,10))}` : room.shareEnabled ? 'Ainda não aberta pelo comprador' : 'Link ainda desativado'}</span><Button size="sm" variant="secondary" onClick={() => { setBuyerRoomId(room.id); setBuyerRoomSeed(room) }}><Link2 size={14}/> Gerenciar</Button></footer></article> })}</div> : <div className="empty-state"><Handshake/><strong>Nenhuma Buyer Room criada</strong><p>Abra uma proposta e escolha “Buyer Room” para criar o plano compartilhado.</p></div>}</section> : null}

    {tab === 'products' ? <section className="panel catalog-workspace catalog-workspace--professional catalog-product-studio-home">
      <div className="panel__heading catalog-heading"><div><span className="eyebrow">Commercial Product Studio</span><h3>Produtos comerciais</h3><p>O catálogo é a fonte de verdade que conecta produto, proposta, negociação, bookings e inteligência de venda.</p></div><Button size="sm" onClick={() => { setEditingProduct(null); setProductModal(true) }} disabled={!canProposalCreate}><Plus size={15}/> Novo produto</Button></div>
      <div className="catalog-value-chain"><span><Boxes size={15}/> Catálogo</span><ArrowRight/><span><FileText size={15}/> Propostas</span><ArrowRight/><span><Handshake size={15}/> Aceite</span><ArrowRight/><span><BadgeDollarSign size={15}/> Bookings</span><ArrowRight/><span><TrendingUp size={15}/> Inteligência</span></div>
      <div className="catalog-insights-professional catalog-insights-professional--studio" aria-label="Indicadores do catálogo">
        <article><small>Disponíveis</small><strong>{catalogStats.active}</strong><span>{snapshot.products.length - catalogStats.active} inativo(s)</span></article>
        <article><small>Pipeline com catálogo</small><strong>{formatCurrency(catalogStats.openPipeline)}</strong><span>Uso do catálogo em propostas: {Math.round(catalogStats.proposalAdoption)}%</span></article>
        <article><small>Bookings por produto</small><strong>{formatCurrency(catalogStats.bookings)}</strong><span>propostas ganhas vinculadas</span></article>
        <article><small>Margem média de tabela</small><strong>{canViewProposalMargin?`${Math.round(catalogStats.averageMargin)}%`:'Restrita'}</strong><span>{canViewProposalMargin?'preço menos custo cadastrado':'campo sensível'}</span></article>
      </div>
      {legacyCatalogItems.length ? <div className="catalog-reconciliation-banner"><div><Link2 size={16}/><span><strong>{legacyCatalogItems.reduce((sum, item) => sum + item.count, 0)} item(ns) históricos ainda não estão ligados ao catálogo</strong><small>Reconcilie nomes antigos uma vez para recuperar win rate, bookings, margem e mix por produto no histórico.</small></span></div><Button size="sm" variant="secondary" onClick={() => setReconcileOpen(true)}>Reconciliar histórico</Button></div> : null}
      <div className="catalog-toolbar catalog-toolbar--professional catalog-toolbar--studio">
        <label className="search-field"><Search size={16}/><input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Buscar produto, SKU, categoria ou descrição" /></label>
        <WorkspaceFilterMenu workspaceKey={`catalog:${snapshot.workspace.id}`} fields={universalCatalogFilters} activeCount={catalogFilterCount} onClearAll={clearCatalogFilters} onChange={(key, value) => { if (key === 'category') setProductCategory(value); else if (key === 'status') setProductStatus(value as typeof productStatus) }} />
        <WorkspaceDisplayMenu value={catalogView} onChange={(value) => setCatalogView(value as typeof catalogView)} modes={[{ value: 'cards', label: 'Cards', icon: <LayoutGrid size={15}/> }, { value: 'table', label: 'Tabela', icon: <List size={15}/> }]} />
        <span className="catalog-toolbar__count">{filteredProducts.length} de {snapshot.products.length}</span>
      </div>

      {catalogView === 'cards' ? <div className="product-studio-card-grid">{filteredProducts.map((product) => {
        const intelligence = buildProductCommercialIntelligence(snapshot, product.id)
        const health = productCommercialHealth(product)
        return <button type="button" className={`product-studio-home-card ${(product.lifecycleStatus ?? (product.active ? 'active' : 'draft')) !== 'active' ? 'is-inactive' : ''}`} key={product.id} onClick={() => setProductStudio(product)}>
          <header><span>{product.kind === 'product' ? 'Produto' : 'Serviço'} · {product.category || 'Sem categoria'}</span><StatusPill tone={(product.lifecycleStatus ?? (product.active ? 'active' : 'draft')) === 'active' ? 'info' : 'neutral'}>{lifecycleLabels[product.lifecycleStatus ?? (product.active ? 'active' : 'draft')]}</StatusPill></header>
          <div className="product-studio-home-card__body"><div><strong>{product.name}</strong><small>{product.sku || 'Sem SKU'}</small></div><p>{product.valueProposition?.trim() || product.description || 'Adicione a proposta de valor no Product Studio.'}</p></div>
          <div className="product-studio-home-card__price"><strong>{product.pricingMode === 'free' ? 'Gratuito' : product.pricingMode === 'quote' ? 'Sob consulta' : product.pricingMode === 'from' ? `A partir de ${formatCurrency(product.unitPrice)}` : formatCurrency(product.unitPrice)}</strong><span>{['free','quote'].includes(product.pricingMode ?? 'fixed') ? '' : product.billingType === 'recurring' ? `/${product.billingInterval === 'year' ? 'ano' : product.billingInterval === 'quarter' ? 'tri' : 'mês'}` : ' único'}</span><em>{['free','quote'].includes(product.pricingMode ?? 'fixed') ? 'política definida' : canViewProposalMargin?`${Math.round(productMarginPercent(product))}% margem`:'margem restrita'}</em></div>
          <footer><span><small>Propostas</small><strong>{intelligence.proposals}</strong></span><span><small>Win rate</small><strong>{intelligence.winRate === null ? '—' : `${Math.round(intelligence.winRate)}%`}</strong></span><span><small>Bookings</small><strong>{formatCurrency(intelligence.bookingsTcv)}</strong></span><span><small>Saúde</small><strong>{health.score}</strong></span></footer>
        </button>
      })}</div> : <div className="catalog-table-wrap"><table className="catalog-table catalog-table--studio"><thead><tr><th>Produto</th><th>Preço</th><th>Margem</th><th>Propostas</th><th>Win rate</th><th>Bookings</th><th>Status</th><th aria-label="Ações" /></tr></thead><tbody>
        {filteredProducts.map((product) => { const usageCount = productUsageCount(product.id); const historicalUsage = productHistoricalUsageCount(product.id); const intelligence = buildProductCommercialIntelligence(snapshot, product.id); const margin = productMarginPercent(product); return <tr key={product.id} className={(product.lifecycleStatus ?? (product.active ? 'active' : 'draft')) !== 'active' ? 'is-inactive' : ''}>
          <td><button type="button" className="catalog-product-open" onClick={() => setProductStudio(product)}><span>{product.kind === 'product' ? 'Produto' : 'Serviço'} · {product.category || 'Sem categoria'}</span><strong>{product.name}</strong><small>{product.sku || 'Sem SKU'}{product.targetCustomer ? ` · ${product.targetCustomer}` : ''}</small></button></td>
          <td><strong>{product.pricingMode === 'free' ? 'Gratuito' : product.pricingMode === 'quote' ? 'Sob consulta' : product.pricingMode === 'from' ? `A partir de ${formatCurrency(product.unitPrice)}` : formatCurrency(product.unitPrice)}</strong><small>{product.pricingMode === 'free' || product.pricingMode === 'quote' ? pricingModeLabels[product.pricingMode] : product.billingType === 'recurring' ? (product.billingInterval === 'year' ? 'anual' : product.billingInterval === 'quarter' ? 'trimestral' : 'mensal') : 'única'}</small></td><td><strong>{canViewProposalMargin?`${Math.round(margin)}%`:'Restrita'}</strong><small>{canViewProposalCost?`custo ${formatCurrency(product.unitCost ?? 0)}`:'custo restrito'}</small></td><td><strong>{usageCount}</strong><small>{historicalUsage !== usageCount ? `${historicalUsage} usos históricos` : 'vigentes'}</small></td><td><strong>{intelligence.winRate === null ? '—' : `${Math.round(intelligence.winRate)}%`}</strong><small>{intelligence.wonProposals} ganhas</small></td><td><strong>{formatCurrency(intelligence.bookingsTcv)}</strong><small>{formatCurrency(intelligence.bookedMrr)} MRR</small></td><td><StatusPill tone={(product.lifecycleStatus ?? (product.active ? 'active' : 'draft')) === 'active' ? 'info' : 'neutral'}>{lifecycleLabels[product.lifecycleStatus ?? (product.active ? 'active' : 'draft')]}</StatusPill></td>
          <td><details className="catalog-row-menu"><summary aria-label={`Ações de ${product.name}`}><MoreHorizontal size={17}/></summary><div><button type="button" onClick={() => setProductStudio(product)}><BarChart3 size={14}/> Abrir Studio</button><button type="button" disabled={!canProposalCreate} onClick={() => void duplicateProduct(product)}><CopyPlus size={14}/> Duplicar</button><button type="button" className="is-danger" disabled={!canProposalDelete || historicalUsage > 0} onClick={() => void deleteProduct(product.id)}>Excluir</button></div></details></td>
        </tr>})}
      </tbody></table></div>}
      {!filteredProducts.length ? <div className="empty-state"><Boxes/><strong>Nenhum produto encontrado</strong><p>Ajuste os filtros ou crie um produto comercial.</p></div> : null}
      <div className="catalog-footnote-professional"><Sparkles size={16}/><span><strong>O catálogo agora mede o que acontece depois do cadastro.</strong> Propostas, preço vendido, win rate, bookings e combinações de produtos voltam para o Product Studio como inteligência comercial.</span></div>
    </section> : null}

    {tab === 'revenue' ? <section className="panel revenue-workspace-v10081"><div className="panel__heading"><div><span className="eyebrow">Receita realizada · competência</span><h3>Lançamentos de receita</h3><p>Registre o que foi reconhecido por competência. Bookings e forecast ficam separados em Revenue Intelligence.</p></div><div className="workspace-toolbar-actions-v10170"><WorkspaceFilterMenu workspaceKey={`revenue:${snapshot.workspace.id}`} fields={universalRevenueFilters} activeCount={revenueStatusFilter === 'all' ? 0 : 1} onClearAll={() => setRevenueStatusFilter('all')} onChange={(_, value) => setRevenueStatusFilter(value as typeof revenueStatusFilter)} />{canProposalCreate ? <Button size="sm" onClick={() => { setRevenueProposal(null); setRevenueModal(true) }}><Plus size={15}/> Registrar receita</Button> : null}</div></div><div className="revenue-list">{snapshot.revenueEntries.filter((entry) => { const proposal = entry.proposalId ? snapshot.proposals.find((item) => item.id === entry.proposalId) : null; const lead = entry.leadId ? snapshot.leads.find((item) => item.id === entry.leadId) : null; const ownerId = entry.ownerId ?? proposal?.ownerId ?? lead?.ownerId ?? null; return canTeamAccessRecord('proposals', ownerId) && (revenueStatusFilter === 'all' || entry.status === revenueStatusFilter) }).sort((a,b) => b.competenceDate.localeCompare(a.competenceDate) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map((entry) => <article key={entry.id}><span className={`revenue-icon revenue-icon--${entry.revenueType}`}>{entry.revenueType === 'recurring' ? <CalendarClock/> : <CircleDollarSign/>}</span><div><strong>{entry.description}</strong><small>Competência {formatDate(entry.competenceDate)} · {entry.source === 'proposal_schedule' ? 'plano de receita da proposta' : entry.proposalId ? 'vinculada à proposta' : entry.leadId ? 'vinculada ao contato' : 'lançamento manual sem vínculo'}</small>{entry.installmentCount ? <small>Competência {entry.installmentIndex ?? 1} de {entry.installmentCount}</small> : null}{entry.adjustmentReason ? <small>Ajuste: {entry.adjustmentReason}</small> : null}</div><div><strong>{canViewRevenueAmount?formatCurrency(entry.amount):'Restrito'}</strong>{entry.recurringMonthlyAmount ? <small>{canViewRevenueAmount?formatCurrency(entry.recurringMonthlyAmount):'Restrito'} {entry.status === 'cancelled' ? 'MRR histórico' : entry.status === 'forecast' ? 'MRR previsto' : 'MRR da competência'}</small> : null}</div><StatusPill tone={entry.status === 'recognized' ? 'success' : entry.status === 'forecast' ? 'info' : 'neutral'}>{entry.status === 'recognized' ? 'Reconhecida' : entry.status === 'forecast' ? 'Prevista' : 'Cancelada'}</StatusPill><button type="button" disabled={!canProposalEdit} onClick={() => void updateRevenueEntryStatus(entry.id, entry.status === 'forecast' ? 'recognized' : entry.status === 'recognized' ? 'cancelled' : 'forecast')}>{entry.status === 'forecast' ? 'Reconhecer' : entry.status === 'recognized' ? 'Cancelar' : 'Reativar como prevista'}</button></article>)}</div></section> : null}

    {tab === 'forecast' ? <RevenueIntelligencePanel snapshot={snapshot} onOpenProposal={(proposal) => setViewingProposal(proposal)} /> : null}

    <CatalogReconciliationModal open={reconcileOpen} legacyItems={legacyCatalogItems} products={snapshot.products.filter((product) => (product.lifecycleStatus ?? (product.active ? 'active' : 'draft')) !== 'archived')} onClose={() => setReconcileOpen(false)} onApply={reconcileProposalItems}/>
    <ProductModal open={productModal} product={editingProduct} onClose={() => setProductModal(false)} onCreated={(product) => setProductStudio(product)}/>
    <ProductStudioModal open={Boolean(productStudio)} product={productStudio} snapshot={snapshot} canWrite={canProposalEdit} onClose={() => setProductStudio(null)}/>
    <Proposal360Modal open={Boolean(viewingProposal)} proposal={viewingProposal} snapshot={snapshot} canWrite={canProposalEdit} onClose={() => { setViewingProposal(null); if (routeContext.proposalId || routeContext.action === 'follow-proposal') clearRouteContext(['proposalId', 'leadId', 'action']) }} onEdit={(proposal) => { setViewingProposal(null); setEditingProposal(proposal); setProposalModal(true) }} onStatus={(proposal, status) => void statusAction(proposal, status)} onRevision={(proposal) => void createProposalRevision(proposal.id)} onOfficial={(proposal) => void setOfficialProposal(proposal.id)} onCloseWon={(proposal) => void closeOpportunityFromProposal(proposal.id)} onRevenue={(proposal) => { setViewingProposal(null); setRevenueProposal(proposal); setRevenueModal(true) }} onFollowup={(proposal) => void createProposalFollowup(proposal)} onBuyerRoom={(proposal) => void openBuyerRoom(proposal)} onDelete={(proposal) => void deleteProposal(proposal.id)}/>
    <BuyerRoomModal open={Boolean(activeBuyerRoom)} room={activeBuyerRoom} proposal={activeBuyerRoomProposal} onClose={() => { setBuyerRoomId(null); setBuyerRoomSeed(null) }}/>
    <ProposalModal open={proposalModal} proposal={editingProposal} initialLeadId={routeContext.action === 'create-proposal' ? routeContext.leadId ?? '' : ''} onClose={() => { setProposalModal(false); if (routeContext.proposalId || routeContext.action) clearRouteContext(['proposalId', 'leadId', 'action']) }}/>
    <RevenueModal open={revenueModal} proposal={revenueProposal} onClose={() => setRevenueModal(false)}/>
    <SalesMessageModal lead={snapshot.leads.find((lead) => lead.id === messageProposal?.leadId) ?? null} templatePurpose="proposal" proposalLabel={messageProposal ? `${messageProposal.proposalNumber} · ${messageProposal.title}` : ''} stageName="Proposta" open={Boolean(messageProposal)} onClose={() => setMessageProposal(null)} />
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
  canViewTotal: boolean
  onOpen(): void
  onToggleSelected(): void
  onToggleExpanded(): void
  onEdit(): void
  onStatus(status: ProposalStatus): void
  onRevision(): void
  onOfficial(): void
  onCloseWon(): void
  onRevenue(): void
  onDelete(): void
  onWhatsApp(): void
}) {
  const { proposal, history, expanded } = props
  return <>
    <tr className={`${props.selected ? 'is-selected' : ''} ${proposal.isOfficial ? 'is-official' : ''}`}>
      <td><button type="button" className={`pipeline-select ${props.selected ? 'is-selected' : ''}`} onClick={props.onToggleSelected}>{props.selected ? <Check size={13}/> : null}</button></td>
      <td><div className="proposal-table__identity"><button type="button" disabled={!history.length} onClick={props.onToggleExpanded}>{history.length ? expanded ? <ChevronDown size={15}/> : <ChevronRight size={15}/> : <span/>}</button><button type="button" className="proposal-table__open" onClick={props.onOpen}><span>{proposal.proposalNumber} · v{proposal.version}</span><strong>{proposal.title}</strong><small>{props.leadLabel}{history.length ? ` · ${history.length} revisão(ões) anterior(es)` : ''}</small></button></div></td>
      <td>{proposal.isOfficial ? <span className="proposal-official"><Star size={14}/> Oficial</span> : <button type="button" className="proposal-alternative" disabled={!props.canWrite} onClick={props.onOfficial}><Flag size={14}/> Alternativa</button>}</td>
      <td><StatusPill tone={proposalStatus[proposal.status].tone}>{proposalStatus[proposal.status].label}</StatusPill>{proposal.closedWonAt ? <small className="proposal-closed-label">Negócio ganho</small> : null}</td>
      <td><span className="proposal-forecast-cell">{forecastLabels[proposal.forecastCategory]}<small>{percent(proposal.probability)}</small></span></td>
      <td>{formatDate(proposal.expectedCloseAt)}</td>
      <td className={isPast(proposal.validUntil) && !['accepted', 'cancelled', 'rejected'].includes(proposal.status) ? 'text-danger' : ''}>{formatDate(proposal.validUntil)}</td>
      <td><strong>{props.canViewTotal?formatCurrency(proposal.totalContractValue):'Restrito'}</strong><small className="proposal-cell-note">Única {props.canViewTotal?formatCurrency(proposal.oneTimeTotal):'Restrito'}</small></td>
      <td><strong>{props.canViewTotal?formatCurrency(proposal.recurringMonthlyTotal):'Restrito'}</strong><small className="proposal-cell-note">ARR {props.canViewTotal?formatCurrency(proposal.annualRecurringTotal):'Restrito'}</small></td>
      <td>{props.ownerLabel}</td>
      <td><span className="proposal-next-action">{props.nextAction}</span></td>
      <td><div className="proposal-list__actions"><button type="button" title="WhatsApp" disabled={!props.canWrite} onClick={props.onWhatsApp}><MessageCircle size={16}/></button><button type="button" title="Editar" disabled={!props.canWrite || proposal.status !== 'draft'} onClick={props.onEdit}><FilePenLine size={16}/></button>{proposal.status === 'draft' ? <button type="button" title="Enviar" disabled={!props.canWrite} onClick={() => props.onStatus('sent')}><Send size={16}/></button> : null}{['sent', 'viewed'].includes(proposal.status) ? <button type="button" title="Aceitar e converter em ganho" disabled={!props.canWrite} onClick={() => props.onStatus('accepted')}><Check size={16}/></button> : null}{['sent', 'viewed'].includes(proposal.status) ? <button type="button" title="Recusar proposta" disabled={!props.canWrite} onClick={() => props.onStatus('rejected')}><XCircle size={16}/></button> : null}{proposal.status === 'accepted' && !proposal.closedWonAt ? <button type="button" title="Fechar oportunidade como ganha" disabled={!props.canWrite} onClick={props.onCloseWon}><BadgeDollarSign size={16}/></button> : null}{proposal.closedWonAt ? <button type="button" title="Reconhecer receita" disabled={!props.canWrite} onClick={props.onRevenue}><ReceiptText size={16}/></button> : null}<button type="button" title={proposal.closedWonAt ? 'Negócio ganho não pode ser revisado' : 'Nova revisão'} disabled={!props.canWrite || Boolean(proposal.closedWonAt)} onClick={props.onRevision}><CopyPlus size={16}/></button><button type="button" title="Excluir" disabled={!props.canWrite || proposal.isOfficial || proposal.status === 'accepted' || Boolean(proposal.closedWonAt)} onClick={props.onDelete}><span>×</span></button></div></td>
    </tr>
    {expanded ? history.map((revision) => <tr className="proposal-history-row" key={revision.id}><td/><td><div className="proposal-history"><span>{revision.proposalNumber} · v{revision.version}</span><strong>{revision.title}</strong><small>Substituída pela revisão vigente</small></div></td><td><span>Histórico</span></td><td><StatusPill tone={proposalStatus[revision.status].tone}>{proposalStatus[revision.status].label}</StatusPill></td><td>{forecastLabels[revision.forecastCategory]}</td><td>{formatDate(revision.expectedCloseAt)}</td><td>{formatDate(revision.validUntil)}</td><td>{props.canViewTotal?formatCurrency(revision.totalContractValue):'Restrito'}</td><td>{props.canViewTotal?formatCurrency(revision.recurringMonthlyTotal):'Restrito'}</td><td/><td/><td/></tr>) : null}
  </>
}
