import type { ActivityItem, AutomationRule, AutomationRun, CalendarEvent, CallRecord, CompanyRecord, ContactRecord, ContactRelationship, Goal, Lead, OpportunityRecord, PipelineStage, Playbook, ProductRecord, ProposalRecord, RevenueEntry, SocialProfile, UserProfile, Workspace } from './types'

export const DEMO_USER: UserProfile = {
  id: 'local-user',
  email: 'demo@realtalent.local',
  displayName: 'Camila',
}

export const DEMO_WORKSPACE: Workspace = {
  id: 'demo-workspace',
  name: 'RealTalent',
  slug: 'realtalent',
  role: 'owner',
  createdAt: '2026-07-16T12:00:00.000Z',
}

export const DEFAULT_STAGES: PipelineStage[] = [
  { id: 'stage-new', workspaceId: DEMO_WORKSPACE.id, name: 'Novo lead', order: 1, color: '#4361ee', probability: 10, isWon: false, isLost: false },
  { id: 'stage-contact', workspaceId: DEMO_WORKSPACE.id, name: 'Primeiro contato', order: 2, color: '#3a86ff', probability: 25, isWon: false, isLost: false },
  { id: 'stage-followup', workspaceId: DEMO_WORKSPACE.id, name: 'Follow-up', order: 3, color: '#8b5cf6', probability: 40, isWon: false, isLost: false },
  { id: 'stage-proposal', workspaceId: DEMO_WORKSPACE.id, name: 'Proposta', order: 4, color: '#f59e0b', probability: 65, isWon: false, isLost: false },
  { id: 'stage-negotiation', workspaceId: DEMO_WORKSPACE.id, name: 'Negociação', order: 5, color: '#f97316', probability: 80, isWon: false, isLost: false },
  { id: 'stage-won', workspaceId: DEMO_WORKSPACE.id, name: 'Fechado', order: 6, color: '#16a34a', probability: 100, isWon: true, isLost: false },
]

const now = new Date('2026-07-16T15:00:00.000Z')
const isoInDays = (days: number, hour = 14, minutes = 0) => {
  const date = new Date(now)
  date.setUTCDate(date.getUTCDate() + days)
  date.setUTCHours(hour, minutes, 0, 0)
  return date.toISOString()
}

export const DEMO_LEADS: Lead[] = [
  {
    id: 'lead-alpha', workspaceId: DEMO_WORKSPACE.id, name: 'Barbearia Alpha', company: 'Barbearia Alpha',
    phone: '(51) 99999-1001', email: 'contato@alpha.com.br', postalCode: '92010-300', street: 'Rua Tiradentes', addressNumber: '120', district: 'Centro', city: 'Canoas', state: 'RS', country: 'Brasil', formattedAddress: 'Rua Tiradentes, 120 · Centro · Canoas · RS · 92010-300 · Brasil', latitude: -29.9191, longitude: -51.1814, geocodeStatus: 'manual', geocodePrecision: 'manual', geocodeProvider: 'manual', geocodedAt: isoInDays(-1), source: 'Instagram', sourceDetail: 'Perfil empresarial', sourceUrl: 'https://instagram.com/barbeariaalpha', capturedAt: isoInDays(-12), consentStatus: 'legitimate_interest', doNotContact: false, companyId: 'company-alpha', primaryContactId: 'contact-alpha', opportunityId: 'opportunity-alpha', cnpj: '12.345.678/0001-10', website: 'https://barbeariaalpha.com.br', instagramUrl: 'https://instagram.com/barbeariaalpha', jobTitle: 'Proprietário', decisionRole: 'decision_maker', influenceLevel: 100,
    stageId: 'stage-proposal', status: 'active', temperature: 'hot', priority: 'high', ownerId: DEMO_USER.id,
    ownerName: 'Camila', value: 5000, nextActionAt: isoInDays(0, 13), expectedCloseAt: isoInDays(12).slice(0, 10), notes: 'Apresentar automação de agenda.',
    tags: ['barbearia', 'reunião'], createdAt: isoInDays(-12), updatedAt: isoInDays(-1),
  },
  {
    id: 'lead-bronx', workspaceId: DEMO_WORKSPACE.id, name: 'The Bronx Barber Shop', company: 'The Bronx',
    phone: '(51) 99826-6560', email: 'contato@thebronx.com.br', postalCode: '90040-060', street: 'Rua da República', addressNumber: '310', district: 'Cidade Baixa', city: 'Porto Alegre', state: 'RS', country: 'Brasil', formattedAddress: 'Rua da República, 310 · Cidade Baixa · Porto Alegre · RS · 90040-060 · Brasil', latitude: -30.0383, longitude: -51.2232, geocodeStatus: 'exact', geocodePrecision: 'rooftop', geocodeProvider: 'google', geocodedAt: isoInDays(-2), source: 'Garimpo', sourceDetail: 'Google Business Profile', sourceUrl: 'https://google.com/maps', capturedAt: isoInDays(-8), consentStatus: 'legitimate_interest', doNotContact: false, companyId: 'company-bronx', primaryContactId: 'contact-bronx', opportunityId: 'opportunity-bronx', website: 'https://thebronx.com.br', instagramUrl: 'https://instagram.com/thebronxbarber', jobTitle: 'Gerente', decisionRole: 'influencer', influenceLevel: 70,
    stageId: 'stage-contact', status: 'active', temperature: 'warm', priority: 'medium', ownerId: DEMO_USER.id,
    ownerName: 'Camila', value: 3200, nextActionAt: isoInDays(0, 16), expectedCloseAt: isoInDays(24).slice(0, 10), notes: 'Retomar contato pelo WhatsApp.',
    tags: ['barbearia'], createdAt: isoInDays(-8), updatedAt: isoInDays(-2),
  },
  {
    id: 'lead-diamond', workspaceId: DEMO_WORKSPACE.id, name: 'Diamond Barbearia', company: 'Diamond Barbearia',
    phone: '(51) 98454-6144', email: 'leo@diamond.com.br', postalCode: '92020-240', street: 'Avenida Guilherme Schell', addressNumber: '5400', district: 'Centro', city: 'Canoas', state: 'RS', country: 'Brasil', geocodeStatus: 'pending', geocodePrecision: 'unknown', source: 'Indicação', sourceDetail: 'Indicação de cliente', capturedAt: isoInDays(-18), consentStatus: 'consented', doNotContact: false, companyId: 'company-diamond', primaryContactId: 'contact-diamond', opportunityId: 'opportunity-diamond', cnpj: '45.123.987/0001-44', instagramUrl: 'https://instagram.com/diamondbarbearia', jobTitle: 'Sócio', decisionRole: 'decision_maker', influenceLevel: 95,
    stageId: 'stage-followup', status: 'active', temperature: 'hot', priority: 'urgent', ownerId: DEMO_USER.id,
    ownerName: 'Camila', value: 4200, nextActionAt: isoInDays(1, 12), expectedCloseAt: isoInDays(8).slice(0, 10), notes: 'Enviar proposta revisada.',
    tags: ['barbearia', 'quente'], createdAt: isoInDays(-18), updatedAt: isoInDays(-1),
  },
  {
    id: 'lead-morada', workspaceId: DEMO_WORKSPACE.id, name: 'Morada Barbearia', company: 'Morada Barbearia',
    phone: '(51) 99700-3311', email: '', district: 'Marechal Rondon', city: 'Canoas', state: 'RS', country: 'Brasil', geocodeStatus: 'approximate', geocodePrecision: 'district', geocodeProvider: 'city_fallback', geocodeError: 'Endereço sem rua e número.', source: 'Instagram', sourceDetail: 'Pesquisa manual', sourceUrl: 'https://instagram.com/moradabarbearia', capturedAt: isoInDays(-2), consentStatus: 'unknown', doNotContact: false, companyId: 'company-morada', primaryContactId: 'contact-morada', opportunityId: 'opportunity-morada', instagramUrl: 'https://instagram.com/moradabarbearia', jobTitle: '', decisionRole: 'unknown', influenceLevel: 20,
    stageId: 'stage-new', status: 'active', temperature: 'cold', priority: 'low', ownerId: DEMO_USER.id,
    ownerName: 'Camila', value: 2500, nextActionAt: isoInDays(2, 11), notes: '',
    tags: ['barbearia'], createdAt: isoInDays(-2), updatedAt: isoInDays(-2),
  },
]


export const DEMO_COMPANIES: CompanyRecord[] = [
  { id: 'company-alpha', workspaceId: DEMO_WORKSPACE.id, name: 'Barbearia Alpha', legalName: 'Barbearia Alpha Ltda.', cnpj: '12.345.678/0001-10', domain: 'barbeariaalpha.com.br', website: 'https://barbeariaalpha.com.br', segment: 'Barbearia', phone: '(51) 99999-1001', city: 'Canoas', state: 'RS', status: 'prospect', leadIds: ['lead-alpha'], createdAt: isoInDays(-12), updatedAt: isoInDays(-1) },
  { id: 'company-bronx', workspaceId: DEMO_WORKSPACE.id, name: 'The Bronx', legalName: '', cnpj: '', domain: 'thebronx.com.br', website: 'https://thebronx.com.br', segment: 'Barbearia', phone: '(51) 99826-6560', city: 'Porto Alegre', state: 'RS', status: 'prospect', leadIds: ['lead-bronx'], createdAt: isoInDays(-8), updatedAt: isoInDays(-2) },
  { id: 'company-diamond', workspaceId: DEMO_WORKSPACE.id, name: 'Diamond Barbearia', legalName: 'Diamond Barbearia Ltda.', cnpj: '45.123.987/0001-44', domain: 'diamond.com.br', website: '', segment: 'Barbearia', phone: '(51) 98454-6144', city: 'Canoas', state: 'RS', status: 'prospect', leadIds: ['lead-diamond'], createdAt: isoInDays(-18), updatedAt: isoInDays(-1) },
  { id: 'company-morada', workspaceId: DEMO_WORKSPACE.id, name: 'Morada Barbearia', legalName: '', cnpj: '', domain: '', website: '', segment: 'Barbearia', phone: '(51) 99700-3311', city: 'Canoas', state: 'RS', status: 'prospect', leadIds: ['lead-morada'], createdAt: isoInDays(-2), updatedAt: isoInDays(-2) },
]

export const DEMO_CONTACTS: ContactRecord[] = [
  { id: 'contact-alpha', workspaceId: DEMO_WORKSPACE.id, companyId: 'company-alpha', name: 'Carlos Almeida', jobTitle: 'Proprietário', phone: '(51) 99999-1001', email: 'carlos@alpha.com.br', decisionRole: 'economic_buyer', influenceLevel: 100, relationshipStrength: 'strong', relationshipScore: 82, stance: 'supportive', relationshipOwnerId: DEMO_USER.id, relationshipOwnerName: 'Camila', lastContactAt: isoInDays(-1, 10), nextActionAt: isoInDays(0, 13), notes: 'Principal interlocutor. Pediu proposta e demonstrou urgência para reduzir horários vazios.', isPrimary: true, consentStatus: 'legitimate_interest', doNotContact: false, doNotContactReason: '', leadIds: ['lead-alpha'], createdAt: isoInDays(-12), updatedAt: isoInDays(-1) },
  { id: 'contact-alpha-mariana', workspaceId: DEMO_WORKSPACE.id, companyId: 'company-alpha', name: 'Mariana Almeida', jobTitle: 'Sócia / Financeiro', phone: '(51) 99999-1022', email: 'mariana@alpha.com.br', decisionRole: 'finance', influenceLevel: 88, relationshipStrength: 'developing', relationshipScore: 48, stance: 'neutral', relationshipOwnerId: DEMO_USER.id, relationshipOwnerName: 'Camila', lastContactAt: null, nextActionAt: null, notes: 'Carlos informou que Mariana participa da aprovação financeira.', isPrimary: false, consentStatus: 'legitimate_interest', doNotContact: false, doNotContactReason: '', leadIds: [], createdAt: isoInDays(-4), updatedAt: isoInDays(-1) },
  { id: 'contact-alpha-joao', workspaceId: DEMO_WORKSPACE.id, companyId: 'company-alpha', name: 'João Ferreira', jobTitle: 'Gerente da operação', phone: '(51) 99999-1033', email: '', decisionRole: 'champion', influenceLevel: 72, relationshipStrength: 'trusted', relationshipScore: 91, stance: 'supportive', relationshipOwnerId: DEMO_USER.id, relationshipOwnerName: 'Camila', lastContactAt: isoInDays(-3, 16), nextActionAt: null, notes: 'Champion operacional. Conhece bem os problemas de no-show e agenda.', isPrimary: false, consentStatus: 'legitimate_interest', doNotContact: false, doNotContactReason: '', leadIds: [], createdAt: isoInDays(-7), updatedAt: isoInDays(-2) },
  { id: 'contact-bronx', workspaceId: DEMO_WORKSPACE.id, companyId: 'company-bronx', name: 'Rafael Martins', jobTitle: 'Gerente', phone: '(51) 99826-6560', email: 'contato@thebronx.com.br', decisionRole: 'influencer', influenceLevel: 70, relationshipStrength: 'developing', relationshipScore: 52, stance: 'neutral', relationshipOwnerId: DEMO_USER.id, relationshipOwnerName: 'Camila', lastContactAt: isoInDays(-2, 11), nextActionAt: isoInDays(0, 16), notes: 'Ainda precisamos identificar o proprietário ou decisor econômico.', isPrimary: true, consentStatus: 'legitimate_interest', doNotContact: false, doNotContactReason: '', leadIds: ['lead-bronx'], createdAt: isoInDays(-8), updatedAt: isoInDays(-2) },
  { id: 'contact-diamond', workspaceId: DEMO_WORKSPACE.id, companyId: 'company-diamond', name: 'Leo Martins', jobTitle: 'Sócio', phone: '(51) 98454-6144', email: 'leo@diamond.com.br', decisionRole: 'decision_maker', influenceLevel: 95, relationshipStrength: 'strong', relationshipScore: 78, stance: 'supportive', relationshipOwnerId: DEMO_USER.id, relationshipOwnerName: 'Camila', lastContactAt: isoInDays(-1, 15), nextActionAt: isoInDays(1, 12), notes: 'Decisor principal. Solicitou proposta revisada.', isPrimary: true, consentStatus: 'consented', doNotContact: false, doNotContactReason: '', leadIds: ['lead-diamond'], createdAt: isoInDays(-18), updatedAt: isoInDays(-1) },
  { id: 'contact-diamond-paula', workspaceId: DEMO_WORKSPACE.id, companyId: 'company-diamond', name: 'Paula Martins', jobTitle: 'Administrativo', phone: '', email: 'paula@diamond.com.br', decisionRole: 'finance', influenceLevel: 65, relationshipStrength: 'weak', relationshipScore: 30, stance: 'unknown', relationshipOwnerId: DEMO_USER.id, relationshipOwnerName: 'Camila', lastContactAt: null, nextActionAt: null, notes: 'Ainda não contatada; possível participante da validação financeira.', isPrimary: false, consentStatus: 'unknown', doNotContact: false, doNotContactReason: '', leadIds: [], createdAt: isoInDays(-3), updatedAt: isoInDays(-1) },
  { id: 'contact-morada', workspaceId: DEMO_WORKSPACE.id, companyId: 'company-morada', name: 'Contato Morada', jobTitle: '', phone: '(51) 99700-3311', email: '', decisionRole: 'unknown', influenceLevel: 20, relationshipStrength: 'unknown', relationshipScore: 10, stance: 'unknown', relationshipOwnerId: DEMO_USER.id, relationshipOwnerName: 'Camila', lastContactAt: null, nextActionAt: isoInDays(2, 11), notes: 'Precisamos identificar quem decide.', isPrimary: true, consentStatus: 'unknown', doNotContact: false, doNotContactReason: '', leadIds: ['lead-morada'], createdAt: isoInDays(-2), updatedAt: isoInDays(-2) },
]

export const DEMO_CONTACT_RELATIONSHIPS: ContactRelationship[] = [
  { id: 'rel-alpha-carlos-mariana', workspaceId: DEMO_WORKSPACE.id, companyId: 'company-alpha', fromContactId: 'contact-alpha', toContactId: 'contact-alpha-mariana', relationshipType: 'partner', strength: 95, notes: 'Sócios e participantes da decisão.', createdAt: isoInDays(-4), updatedAt: isoInDays(-1) },
  { id: 'rel-alpha-joao-carlos', workspaceId: DEMO_WORKSPACE.id, companyId: 'company-alpha', fromContactId: 'contact-alpha-joao', toContactId: 'contact-alpha', relationshipType: 'reports_to', strength: 88, notes: 'João responde diretamente ao proprietário.', createdAt: isoInDays(-4), updatedAt: isoInDays(-1) },
  { id: 'rel-diamond-leo-paula', workspaceId: DEMO_WORKSPACE.id, companyId: 'company-diamond', fromContactId: 'contact-diamond', toContactId: 'contact-diamond-paula', relationshipType: 'works_with', strength: 75, notes: 'Paula apoia validações administrativas e financeiras.', createdAt: isoInDays(-3), updatedAt: isoInDays(-1) },
]


export const DEMO_OPPORTUNITIES: OpportunityRecord[] = DEMO_LEADS.map((lead) => ({
  id: lead.opportunityId ?? `opportunity-${lead.id}`, workspaceId: lead.workspaceId, companyId: lead.companyId ?? null, primaryContactId: lead.primaryContactId ?? null,
  leadId: lead.id, title: `${lead.company || lead.name} — RealTalent`, stageId: lead.stageId, status: lead.status, value: lead.value, ownerId: lead.ownerId,
  expectedCloseAt: lead.expectedCloseAt ?? null, createdAt: lead.createdAt, updatedAt: lead.updatedAt,
}))

export const DEMO_SOCIAL_PROFILES: SocialProfile[] = [
  { id: 'social-alpha-instagram', workspaceId: DEMO_WORKSPACE.id, entityType: 'company', entityId: 'company-alpha', network: 'instagram', username: '@barbeariaalpha', url: 'https://instagram.com/barbeariaalpha', externalId: null, verified: false, source: 'Cadastro do lead', confidence: 95, lastCheckedAt: isoInDays(-1), createdAt: isoInDays(-12), updatedAt: isoInDays(-1) },
  { id: 'social-bronx-instagram', workspaceId: DEMO_WORKSPACE.id, entityType: 'company', entityId: 'company-bronx', network: 'instagram', username: '@thebronxbarber', url: 'https://instagram.com/thebronxbarber', externalId: null, verified: false, source: 'Garimpo', confidence: 88, lastCheckedAt: isoInDays(-2), createdAt: isoInDays(-8), updatedAt: isoInDays(-2) },
  { id: 'social-diamond-instagram', workspaceId: DEMO_WORKSPACE.id, entityType: 'company', entityId: 'company-diamond', network: 'instagram', username: '@diamondbarbearia', url: 'https://instagram.com/diamondbarbearia', externalId: null, verified: false, source: 'Indicação', confidence: 92, lastCheckedAt: isoInDays(-1), createdAt: isoInDays(-18), updatedAt: isoInDays(-1) },
  { id: 'social-morada-instagram', workspaceId: DEMO_WORKSPACE.id, entityType: 'company', entityId: 'company-morada', network: 'instagram', username: '@moradabarbearia', url: 'https://instagram.com/moradabarbearia', externalId: null, verified: false, source: 'Instagram', confidence: 80, lastCheckedAt: null, createdAt: isoInDays(-2), updatedAt: isoInDays(-2) },
]



export const DEMO_PRODUCTS: ProductRecord[] = [
  { id: 'product-setup', workspaceId: DEMO_WORKSPACE.id, name: 'Implantação RealTalent', sku: 'RT-SETUP', description: 'Configuração inicial, Pipeline, cadências e treinamento da equipe.', category: 'Implantação', active: true, unitPrice: 1800, unitCost: 620, kind: 'service', unitLabel: 'projeto', defaultDiscountPercent: 0, billingType: 'one_time', billingInterval: null, taxRate: 0, createdAt: isoInDays(-30), updatedAt: isoInDays(-4) },
  { id: 'product-crm', workspaceId: DEMO_WORKSPACE.id, name: 'RealTalent CRM Pro', sku: 'RT-CRM-PRO', description: 'Licença mensal do CRM com automações, mapa e execução comercial.', category: 'Software', active: true, unitPrice: 499, unitCost: 95, kind: 'service', unitLabel: 'licença', defaultDiscountPercent: 0, billingType: 'recurring', billingInterval: 'month', taxRate: 0, createdAt: isoInDays(-30), updatedAt: isoInDays(-2) },
]

const proposalItem = (id: string, product: ProductRecord, quantity: number, discountPercent = 0) => {
  const subtotal = product.unitPrice * quantity
  const discount = subtotal * discountPercent / 100
  const taxable = subtotal - discount
  const tax = taxable * product.taxRate / 100
  const total = taxable + tax
  const monthlyFactor = product.billingType === 'recurring' ? product.billingInterval === 'year' ? 1 / 12 : product.billingInterval === 'quarter' ? 1 / 3 : 1 : 0
  return { id, productId: product.id, name: product.name, description: product.description, quantity, unitPrice: product.unitPrice, discountPercent, taxRate: product.taxRate, billingType: product.billingType, billingInterval: product.billingInterval, lineSubtotal: subtotal, lineDiscount: discount, lineTax: tax, lineTotal: total, recurringMonthlyTotal: total * monthlyFactor }
}

const demoProduct = (id: ProductRecord['id']) => {
  const product = DEMO_PRODUCTS.find((item) => item.id === id)
  if (!product) throw new Error(`Produto demo não encontrado: ${id}`)
  return product
}

const proposalAlphaItems = [
  proposalItem('proposal-alpha-item-1', demoProduct('product-setup'), 1),
  proposalItem('proposal-alpha-item-2', demoProduct('product-crm'), 1, 5),
]
const proposalDiamondItems = [
  proposalItem('proposal-diamond-item-1', demoProduct('product-setup'), 1, 10),
  proposalItem('proposal-diamond-item-2', demoProduct('product-crm'), 2, 5),
]
const totals = (items: ReturnType<typeof proposalItem>[], termMonths = 12) => { const recurringMonthlyTotal = items.reduce((sum, item) => sum + item.recurringMonthlyTotal, 0); const oneTimeTotal = items.filter((item) => item.billingType === 'one_time').reduce((sum, item) => sum + item.lineTotal, 0); return { subtotal: items.reduce((sum, item) => sum + item.lineSubtotal, 0), discountTotal: items.reduce((sum, item) => sum + item.lineDiscount, 0), taxTotal: items.reduce((sum, item) => sum + item.lineTax, 0), total: items.reduce((sum, item) => sum + item.lineTotal, 0), recurringMonthlyTotal, oneTimeTotal, annualRecurringTotal: recurringMonthlyTotal * 12, totalContractValue: oneTimeTotal + recurringMonthlyTotal * termMonths } }

export const DEMO_PROPOSALS: ProposalRecord[] = [
  { id: 'proposal-alpha-v1', workspaceId: DEMO_WORKSPACE.id, proposalGroupId: 'proposal-alpha', version: 1, proposalNumber: 'PROP-2026-001', leadId: 'lead-alpha', opportunityId: 'opportunity-alpha', companyId: 'company-alpha', contactId: 'contact-alpha', title: 'Implantação RealTalent — Barbearia Alpha', status: 'sent', forecastCategory: 'commit', probability: 75, currency: 'BRL', ...totals(proposalAlphaItems), isOfficial: true, isCurrentVersion: true, supersededById: null, expectedCloseAt: isoInDays(8).slice(0, 10), contractStartAt: isoInDays(15).slice(0, 10), contractEndAt: isoInDays(380).slice(0, 10), contractTermMonths: 12, autoRenew: true, postSaleStartAt: isoInDays(15).slice(0, 10), postSaleCadenceName: 'Onboarding padrão', closedWonAt: null, validUntil: isoInDays(10).slice(0, 10), sentAt: isoInDays(-1), viewedAt: null, acceptedAt: null, rejectedAt: null, ownerId: DEMO_USER.id, notes: 'Condição válida para uma unidade.', terms: 'Pagamento da implantação na assinatura e mensalidade a partir da ativação.', items: proposalAlphaItems, createdAt: isoInDays(-3), updatedAt: isoInDays(-1) },
  { id: 'proposal-diamond-v1', workspaceId: DEMO_WORKSPACE.id, proposalGroupId: 'proposal-diamond', version: 1, proposalNumber: 'PROP-2026-002', leadId: 'lead-diamond', opportunityId: 'opportunity-diamond', companyId: 'company-diamond', contactId: 'contact-diamond', title: 'RealTalent para duas unidades — Diamond', status: 'draft', forecastCategory: 'best_case', probability: 60, currency: 'BRL', ...totals(proposalDiamondItems), isOfficial: true, isCurrentVersion: true, supersededById: null, expectedCloseAt: isoInDays(10).slice(0, 10), contractStartAt: isoInDays(18).slice(0, 10), contractEndAt: isoInDays(383).slice(0, 10), contractTermMonths: 12, autoRenew: true, postSaleStartAt: isoInDays(18).slice(0, 10), postSaleCadenceName: 'Onboarding padrão', closedWonAt: null, validUntil: isoInDays(12).slice(0, 10), sentAt: null, viewedAt: null, acceptedAt: null, rejectedAt: null, ownerId: DEMO_USER.id, notes: 'Revisar desconto antes do envio.', terms: 'Implantação para duas unidades e cobrança mensal por unidade.', items: proposalDiamondItems, createdAt: isoInDays(-1), updatedAt: isoInDays(-1) },
]

export const DEMO_REVENUE_ENTRIES: RevenueEntry[] = [
  { id: 'revenue-demo-setup', workspaceId: DEMO_WORKSPACE.id, proposalId: null, leadId: null, opportunityId: null, revenueType: 'one_time', status: 'recognized', amount: 3200, recurringMonthlyAmount: 0, recognizedAt: isoInDays(-7), competenceDate: isoInDays(-7).slice(0, 10), servicePeriodStart: null, servicePeriodEnd: null, adjustmentReason: '', description: 'Implantação reconhecida no período', ownerId: DEMO_USER.id, createdAt: isoInDays(-7), updatedAt: isoInDays(-7) },
  { id: 'revenue-demo-mrr', workspaceId: DEMO_WORKSPACE.id, proposalId: null, leadId: null, opportunityId: null, revenueType: 'recurring', status: 'recognized', amount: 0, recurringMonthlyAmount: 998, recognizedAt: isoInDays(-7), competenceDate: isoInDays(-7).slice(0, 10), servicePeriodStart: null, servicePeriodEnd: null, adjustmentReason: '', description: 'Receita recorrente mensal ativa', ownerId: DEMO_USER.id, createdAt: isoInDays(-7), updatedAt: isoInDays(-7) },
]

export const DEMO_ACTIVITIES: ActivityItem[] = [
  {
    id: 'activity-1', workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-alpha', type: 'meeting',
    title: 'Reunião com Barbearia Alpha', description: 'Demonstração do CRM e automação de agenda.',
    dueAt: isoInDays(0, 13), completedAt: null, assignedTo: DEMO_USER.id, sourceType: 'calendar', sourceId: 'event-1', createdAt: isoInDays(-2), updatedAt: isoInDays(-2),
  },
  {
    id: 'activity-2', workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-bronx', type: 'followup',
    title: 'Segundo contato com The Bronx', description: 'Retomar a dor de agendamentos perdidos.',
    dueAt: isoInDays(0, 16), completedAt: null, assignedTo: DEMO_USER.id, sourceType: 'manual', sourceId: null, createdAt: isoInDays(-1), updatedAt: isoInDays(-1),
  },
  {
    id: 'activity-3', workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-diamond', type: 'note',
    title: 'Proposta solicitada', description: 'Ajustar valor para duas unidades.', dueAt: null,
    completedAt: isoInDays(-1), assignedTo: DEMO_USER.id, sourceType: 'manual', sourceId: null, createdAt: isoInDays(-1), updatedAt: isoInDays(-1),
  },
]

export const DEMO_CALLS: CallRecord[] = [
  {
    id: 'call-1', workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-diamond', userId: DEMO_USER.id,
    outcome: 'answered', durationSeconds: 184, notes: 'Solicitou proposta para duas unidades.',
    transcript: 'Lead demonstrou interesse e pediu uma proposta revisada.', recordingPath: null,
    startedAt: isoInDays(-1, 14), endedAt: isoInDays(-1, 14, 3), createdAt: isoInDays(-1, 14, 3),
  },
]

export const DEMO_EVENTS: CalendarEvent[] = [
  {
    id: 'event-1', workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-alpha', title: 'Demonstração — Barbearia Alpha',
    description: 'Apresentar Pipeline, Ligações e Agenda.', startsAt: isoInDays(0, 13), endsAt: isoInDays(0, 13, 45),
    allDay: false, location: 'Google Meet', status: 'confirmed', assignedTo: DEMO_USER.id,
    createdAt: isoInDays(-2), updatedAt: isoInDays(-2),
  },
  {
    id: 'event-2', workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-diamond', title: 'Revisar proposta Diamond',
    description: 'Conferir escopo antes do envio.', startsAt: isoInDays(1, 11), endsAt: isoInDays(1, 11, 30),
    allDay: false, location: '', status: 'tentative', assignedTo: DEMO_USER.id,
    createdAt: isoInDays(-1), updatedAt: isoInDays(-1),
  },
]


const monthStart = new Date(now); monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0)
const monthEnd = new Date(monthStart); monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1); monthEnd.setUTCDate(0); monthEnd.setUTCHours(23,59,59,999)
const dateOnly = (date: Date) => date.toISOString().slice(0, 10)

export const DEMO_GOALS: Goal[] = [
  { id: 'goal-calls', workspaceId: DEMO_WORKSPACE.id, userId: null, userName: 'Equipe', metric: 'calls', targetValue: 30, periodStart: dateOnly(monthStart), periodEnd: dateOnly(monthEnd), createdAt: isoInDays(-10), updatedAt: isoInDays(-1) },
  { id: 'goal-new-leads', workspaceId: DEMO_WORKSPACE.id, userId: null, userName: 'Equipe', metric: 'new_leads', targetValue: 20, periodStart: dateOnly(monthStart), periodEnd: dateOnly(monthEnd), createdAt: isoInDays(-10), updatedAt: isoInDays(-1) },
  { id: 'goal-revenue', workspaceId: DEMO_WORKSPACE.id, userId: null, userName: 'Equipe', metric: 'revenue', targetValue: 18000, periodStart: dateOnly(monthStart), periodEnd: dateOnly(monthEnd), createdAt: isoInDays(-10), updatedAt: isoInDays(-1) },
]

export const DEMO_PLAYBOOKS: Playbook[] = [
  {
    id: 'playbook-first-contact', workspaceId: DEMO_WORKSPACE.id, kind: 'script', title: 'Outbound consultivo — barbearias e salões', category: 'Prospecção',
    guidance: { objectives: ['first_meeting'], temperatures: ['cold', 'warm'], executionModes: ['step_by_step', 'checklist', 'call', 'meeting'], segments: ['Barbearias', 'Salões de beleza'], personas: ['Dono', 'Gerente'], discoveryQuestions: ['Como vocês organizam os agendamentos hoje?', 'Onde vocês mais perdem horários: faltas, cancelamentos ou baixa recorrência?', 'Quem além de você participa de uma decisão sobre processo ou sistema?'], objectionPrompts: ['Já tenho sistema', 'Não tenho tempo agora', 'Me manda no WhatsApp'], meetingAgenda: ['Contexto e processo atual', 'Faltas, horários vazios e retorno de clientes', 'Impacto e prioridade', 'Processo de decisão', 'Próximo passo'], coachingFocus: 'ganhar permissão, diagnosticar antes de apresentar e fechar com próximo passo', successCriteria: ['Permissão para continuar', 'Dor ou contexto atual identificado', 'Próximo passo definido'], avoidPhrases: ['Apresentar produto antes de diagnosticar'] },
    content: `Olá, {{nome}}, tudo bem? Aqui é {{responsavel}}. Posso te explicar em 30 segundos o motivo da ligação e você me diz se vale a pena continuarmos?

Eu trabalho exclusivamente com barbearias e salões de beleza. Ajudamos negócios do setor a reduzir faltas, cancelamentos e horários vazios, além de recuperar clientes que demoram para retornar.

Hoje vocês utilizam algum sistema de agendamento ou concentram a maior parte dos contatos no WhatsApp?`,
    tags: ['barbearia','salão','outbound','primeiro contato'], active: true, createdAt: isoInDays(-8), updatedAt: isoInDays(-1),
  },
  {
    id: 'playbook-no-time', workspaceId: DEMO_WORKSPACE.id, kind: 'objection', title: 'Não tenho tempo agora', category: 'Tempo', guidance: { objectives: ['first_meeting', 'recover_opportunity'], outcomes: ['callback_requested'], coachingFocus: 'preservar respeito ao tempo e sair com horário concreto' },
    content: 'Sem problema. Não quero atrapalhar sua operação. Posso ser objetivo e combinar um horário melhor para uma conversa de 15 minutos. Para você costuma ser mais tranquilo no começo ou no fim do dia?',
    tags: ['tempo','retorno'], active: true, createdAt: isoInDays(-7), updatedAt: isoInDays(-1),
  },
  {
    id: 'playbook-already-system', workspaceId: DEMO_WORKSPACE.id, kind: 'objection', title: 'Já tenho sistema', category: 'Solução atual', guidance: { objectives: ['first_meeting', 'qualify'], coachingFocus: 'não atacar a solução atual; explorar gaps e impacto' },
    content: 'Perfeito. Eu não estou entrando em contato para dizer que você precisa trocar de sistema. Quero entender se, mesmo usando essa ferramenta, ainda existem faltas, clientes que não retornam ou horários difíceis de preencher. Qual é o principal problema que ainda permanece?',
    tags: ['sistema','diagnóstico'], active: true, createdAt: isoInDays(-6), updatedAt: isoInDays(-1),
  },
  {
    id: 'playbook-no-interest', workspaceId: DEMO_WORKSPACE.id, kind: 'objection', title: 'Não tenho interesse', category: 'Interesse', guidance: { objectives: ['first_meeting', 'recover_opportunity'], outcomes: ['not_interested'], coachingFocus: 'diagnosticar se é prioridade, timing ou aderência antes de encerrar' },
    content: 'Tranquilo. Só para eu não insistir em algo que não faça sentido: você não tem interesse porque já está satisfeito com o processo atual ou porque esse assunto não é prioridade agora?',
    tags: ['interesse','qualificação'], active: true, createdAt: isoInDays(-6), updatedAt: isoInDays(-1),
  },
  {
    id: 'playbook-whatsapp', workspaceId: DEMO_WORKSPACE.id, kind: 'objection', title: 'Me manda no WhatsApp', category: 'Canal', guidance: { objectives: ['first_meeting'], coachingFocus: 'usar o canal pedido sem abandonar a qualificação mínima' },
    content: 'Envio sim. Para eu não te mandar uma mensagem genérica, me diga só uma coisa: hoje o maior desafio está em faltas, horários vazios ou retorno dos clientes?',
    tags: ['whatsapp','diagnóstico'], active: true, createdAt: isoInDays(-5), updatedAt: isoInDays(-1),
  },
  {
    id: 'playbook-selling', workspaceId: DEMO_WORKSPACE.id, kind: 'objection', title: 'Vocês querem me vender algo?', category: 'Confiança', guidance: { objectives: ['first_meeting'], coachingFocus: 'reduzir resistência e manter transparência sobre o objetivo da conversa' },
    content: 'Existe uma solução comercial, sim, mas esta ligação não é para forçar uma venda. Primeiro precisamos entender se existe um problema real que justifique uma conversa. Caso não exista, encerramos por ali.',
    tags: ['confiança','transparência'], active: true, createdAt: isoInDays(-5), updatedAt: isoInDays(-1),
  },
  {
    id: 'playbook-partner', workspaceId: DEMO_WORKSPACE.id, kind: 'objection', title: 'Preciso falar com meu sócio', category: 'Decisão', guidance: { objectives: ['identify_decision_maker', 'proposal_followup'], decisionRoles: ['decision_maker', 'economic_buyer'], executionModes: ['call', 'meeting'], personas: ['Dono', 'Sócio', 'Decisor econômico'], discoveryQuestions: ['Como vocês normalmente tomam decisões desse tipo?', 'Quem precisa estar na próxima conversa para evitar retrabalho?'], objectionPrompts: ['Preciso falar com meu sócio'], meetingAgenda: ['Contexto da decisão', 'Critérios de compra', 'Participantes necessários', 'Próximo passo'], coachingFocus: 'mapear processo de decisão e incluir o segundo decisor no próximo passo' },
    content: 'Faz sentido envolver quem participa da decisão. Podemos marcar a conversa em um horário em que vocês dois estejam disponíveis, assim ninguém precisa repassar as informações depois. Qual período costuma funcionar melhor para os dois?',
    tags: ['sócio','decisão'], active: true, createdAt: isoInDays(-4), updatedAt: isoInDays(-1),
  },
]

export const DEMO_AUTOMATION_RULES: AutomationRule[] = [
  {
    id: 'rule-hot-lead', workspaceId: DEMO_WORKSPACE.id, name: 'Priorizar lead quente', enabled: true,
    triggerType: 'lead_created',
    conditions: [{ id: 'condition-hot', field: 'temperature', operator: 'equals', value: 'hot' }],
    actions: [
      { id: 'action-priority', type: 'set_priority', value: 'urgent' },
      { id: 'action-followup', type: 'create_followup', value: 'Contato prioritário com lead quente', delayDays: 0 },
    ],
    createdBy: DEMO_USER.id, createdAt: isoInDays(-6), updatedAt: isoInDays(-2),
  },
  {
    id: 'rule-no-answer', workspaceId: DEMO_WORKSPACE.id, name: 'Retorno após não atender', enabled: true,
    triggerType: 'call_outcome',
    conditions: [{ id: 'condition-no-answer', field: 'call_outcome', operator: 'equals', value: 'no_answer' }],
    actions: [{ id: 'action-return', type: 'create_followup', value: 'Retornar ligação sem atendimento', delayDays: 1 }],
    createdBy: DEMO_USER.id, createdAt: isoInDays(-5), updatedAt: isoInDays(-2),
  },
]

export const DEMO_AUTOMATION_RUNS: AutomationRun[] = [
  {
    id: 'run-demo-1', workspaceId: DEMO_WORKSPACE.id, ruleId: 'rule-no-answer',
    eventKey: 'demo:rule-no-answer:call-demo', status: 'success',
    input: { triggerType: 'call_outcome', leadId: 'lead-bronx', callOutcome: 'no_answer' },
    output: { message: '1 ação executada.', matchedLeadIds: ['lead-bronx'], mutations: [] },
    errorMessage: null, startedAt: isoInDays(-2, 10), finishedAt: isoInDays(-2, 10, 1),
  },
]
