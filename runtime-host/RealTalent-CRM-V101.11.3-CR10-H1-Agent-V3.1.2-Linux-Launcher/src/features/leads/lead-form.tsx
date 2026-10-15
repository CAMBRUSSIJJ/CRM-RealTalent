import { AlertTriangle, Building2, CheckCircle2, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { GeocodeStatus, Lead, WorkspaceMember } from '../../domain/types'
import { useAppActions, useAppWorkspace } from '../../app/app-context'
import { OwnerPicker, SelectionCheckbox, SelectionSelect } from '../../components/selection'
import type { NewLeadInput } from '../../repositories/crm-repository'
import { usePreferences, type CrmPreferences } from '../settings/preferences-context'
import { useAuth } from '../auth/auth-context'
import type { UserProfile } from '../../domain/types'
import { addressStatusForLead, buildLeadAddress, geocodeStatusLabel } from '../../services/geocoding'
import { decisionRoleLabels } from '../../services/account-intelligence'

export interface LeadFormValue extends Omit<NewLeadInput, 'workspaceId'> {}

const nextCommercialAction = (preferences: CrmPreferences) => {
  const next = new Date()
  let remaining = Math.max(0, preferences.commercial.defaultFollowupDays)
  do {
    if (remaining > 0) next.setDate(next.getDate() + 1)
    if (preferences.commercial.businessDays.includes(next.getDay())) remaining -= 1
  } while (remaining > 0)
  const [hour, minute] = preferences.commercial.businessStart.split(':').map(Number)
  next.setHours(Number.isFinite(hour) ? hour : 9, Number.isFinite(minute) ? minute : 0, 0, 0)
  return next.toISOString()
}

const defaultValue = (stageId: string, preferences: CrmPreferences, user: UserProfile | null): LeadFormValue => ({
  name: '', company: '', phone: '', email: '', city: '', postalCode: '', street: '', addressNumber: '', complement: '', district: '', state: 'RS', country: 'Brasil',
  formattedAddress: '', latitude: null, longitude: null, geocodeStatus: 'incomplete', geocodePrecision: 'unknown', geocodeProvider: null, geocodePlaceId: null, geocodedAt: null, geocodeError: null,
  source: 'Manual', sourceDetail: 'Cadastro manual', sourceUrl: '', capturedAt: new Date().toISOString(), consentStatus: 'unknown', doNotContact: false, doNotContactReason: '', companyId: null, primaryContactId: null, opportunityId: null, cnpj: '', website: '', instagramUrl: '', linkedinUrl: '', facebookUrl: '', jobTitle: '', decisionRole: 'unknown', influenceLevel: 0, stageId, status: 'active', temperature: preferences.commercial.defaultLeadTemperature, priority: preferences.commercial.defaultLeadPriority, ownerId: user?.id ?? null, ownerName: user?.displayName ?? 'Equipe',
  value: 0, nextActionAt: nextCommercialAction(preferences), expectedCloseAt: null, notes: '', tags: [],
})

const fromLead = (lead: Lead): LeadFormValue => ({
  name: lead.name, company: lead.company, phone: lead.phone, email: lead.email, city: lead.city,
  postalCode: lead.postalCode ?? '', street: lead.street ?? '', addressNumber: lead.addressNumber ?? '', complement: lead.complement ?? '', district: lead.district ?? '', state: lead.state ?? '', country: lead.country ?? 'Brasil',
  formattedAddress: lead.formattedAddress ?? '', latitude: lead.latitude ?? null, longitude: lead.longitude ?? null, geocodeStatus: lead.geocodeStatus ?? (lead.city ? 'approximate' : 'incomplete'), geocodePrecision: lead.geocodePrecision ?? 'unknown', geocodeProvider: lead.geocodeProvider ?? null, geocodePlaceId: lead.geocodePlaceId ?? null, geocodedAt: lead.geocodedAt ?? null, geocodeError: lead.geocodeError ?? null,
  source: lead.source, sourceDetail: lead.sourceDetail ?? '', sourceUrl: lead.sourceUrl ?? '', capturedAt: lead.capturedAt ?? lead.createdAt, consentStatus: lead.consentStatus ?? 'unknown', doNotContact: lead.doNotContact ?? false, doNotContactReason: lead.doNotContactReason ?? '', companyId: lead.companyId ?? null, primaryContactId: lead.primaryContactId ?? null, opportunityId: lead.opportunityId ?? null, cnpj: lead.cnpj ?? '', website: lead.website ?? '', instagramUrl: lead.instagramUrl ?? '', linkedinUrl: lead.linkedinUrl ?? '', facebookUrl: lead.facebookUrl ?? '', jobTitle: lead.jobTitle ?? '', decisionRole: lead.decisionRole ?? 'unknown', influenceLevel: lead.influenceLevel ?? 0, stageId: lead.stageId, status: lead.status, temperature: lead.temperature, priority: lead.priority, ownerId: lead.ownerId,
  ownerName: lead.ownerName, value: lead.value, nextActionAt: lead.nextActionAt, expectedCloseAt: lead.expectedCloseAt ?? null, notes: lead.notes, tags: lead.tags,
})

const normalizePhone = (value: string) => value.replace(/\D/g, '')
const normalizeText = (value: string) => value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const formatPhone = (value: string) => {
  const digits = normalizePhone(value).slice(0, 13)
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return value.trim()
}

export function LeadForm({ lead, initialStageId, formId, onSubmit, defaultExpanded = Boolean(lead), mode = 'contact' }: { lead?: Lead; initialStageId?: string; formId: string; onSubmit(value: LeadFormValue): Promise<void>; defaultExpanded?: boolean; mode?: 'contact' | 'opportunity' }) {
  const { snapshot } = useAppWorkspace()
  const { listWorkspaceMembers } = useAppActions()
  const { user } = useAuth()
  const { preferences } = usePreferences()
  const fallbackStageId = initialStageId ?? snapshot?.stages[0]?.id ?? ''
  const [value, setValue] = useState<LeadFormValue>(() => lead ? fromLead(lead) : defaultValue(fallbackStageId, preferences, user))
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [ownerOptions, setOwnerOptions] = useState<WorkspaceMember[]>([])

  useEffect(() => {
    setValue(lead ? fromLead(lead) : defaultValue(initialStageId ?? snapshot?.stages[0]?.id ?? '', preferences, user))
    setExpanded(defaultExpanded)
  }, [defaultExpanded, initialStageId, lead, preferences, snapshot?.stages, user])

  useEffect(() => {
    void listWorkspaceMembers()
      .then(setOwnerOptions)
      .catch(() => setOwnerOptions(user ? [{ workspaceId: snapshot?.workspace.id ?? '', userId: user.id, displayName: user.displayName, email: user.email, avatarUrl: user.avatarUrl ?? null, role: 'owner', joinedAt: new Date().toISOString() }] : []))
  }, [listWorkspaceMembers, snapshot?.workspace.id, user])

  const update = <K extends keyof LeadFormValue>(key: K, nextValue: LeadFormValue[K]) => setValue((current) => ({ ...current, [key]: nextValue }))

  const possibleDuplicate = useMemo(() => {
    const phone = normalizePhone(value.phone)
    const email = value.email.trim().toLowerCase()
    return snapshot?.leads.find((item) => item.id !== lead?.id && ((phone.length >= 8 && normalizePhone(item.phone) === phone) || (email && item.email.trim().toLowerCase() === email))) ?? null
  }, [lead?.id, snapshot?.leads, value.email, value.phone])

  const companyMatch = useMemo(() => {
    if (!snapshot || value.company.trim().length < 3 || value.companyId) return null
    const wanted = normalizeText(value.company)
    return snapshot.companies.find((company) => normalizeText(company.name) === wanted || normalizeText(company.legalName) === wanted) ?? null
  }, [snapshot, value.company, value.companyId])

  const ready = Boolean(value.name.trim() && (value.phone.trim() || value.email.trim()))
  const currentGeocodeStatus = (value.geocodeStatus ?? addressStatusForLead(value)) as GeocodeStatus
  const addressChanged = lead ? ['postalCode', 'street', 'addressNumber', 'complement', 'district', 'city', 'state', 'country'].some((key) => String(value[key as keyof LeadFormValue] ?? '').trim() !== String(lead[key as keyof Lead] ?? '').trim()) : true
  const submitValue = () => {
    const normalized = {
      ...value,
      name: value.name.trim(), company: value.company.trim() || value.name.trim(),
      ownerName: ownerOptions.find((member) => member.userId === value.ownerId)?.displayName ?? (value.ownerId === user?.id ? user?.displayName ?? 'Equipe' : 'Equipe'),
      postalCode: value.postalCode?.trim() ?? '', street: value.street?.trim() ?? '', addressNumber: value.addressNumber?.trim() ?? '', complement: value.complement?.trim() ?? '', district: value.district?.trim() ?? '',
      city: value.city.trim(), state: value.state?.trim().toUpperCase() ?? '', country: value.country?.trim() || 'Brasil',
    }
    if (!addressChanged) return normalized
    const status = addressStatusForLead(normalized)
    return {
      ...normalized,
      formattedAddress: buildLeadAddress(normalized), latitude: null, longitude: null, geocodeStatus: status,
      geocodePrecision: status === 'approximate' ? 'city' as const : 'unknown' as const, geocodeProvider: status === 'approximate' ? 'city_fallback' : null,
      geocodePlaceId: null, geocodedAt: null, geocodeError: null,
    }
  }
  const applyCompany = () => {
    if (!companyMatch) return
    setValue((current) => ({
      ...current, companyId: companyMatch.id, company: companyMatch.name, cnpj: companyMatch.cnpj || current.cnpj,
      website: companyMatch.website || current.website, city: companyMatch.city || current.city, state: companyMatch.state || current.state,
    }))
  }
  const applyCommercialDefaults = () => setValue((current) => ({
    ...current, company: current.company.trim() || current.name.trim(), priority: preferences.commercial.defaultLeadPriority,
    temperature: preferences.commercial.defaultLeadTemperature, nextActionAt: current.nextActionAt || nextCommercialAction(preferences),
    tags: current.tags.length ? current.tags : preferences.commercial.tags.slice(0, 1),
  }))

  return (
    <form id={formId} className={`form-grid lead-form lead-form--${expanded ? 'complete' : 'quick'}`} onSubmit={(event) => { event.preventDefault(); void onSubmit(submitValue()) }}>
      {possibleDuplicate ? <div className="duplicate-warning field--span-2"><AlertTriangle size={18} /><div><strong>Possível contato duplicado</strong><span>{possibleDuplicate.name} já possui o mesmo telefone ou e-mail. Abra o cadastro existente antes de criar outro registro.</span></div></div> : null}
      {!lead ? <div className={`seller-ready-fill seller-ready-fill--v10060 field--span-2 ${ready ? 'is-ready' : ''}`}><span className="seller-ready-fill__icon">{ready ? <CheckCircle2 size={18} /> : <Sparkles size={18} />}</span><div><strong>{ready ? 'Pronto para prospectar' : 'Cadastro rápido'}</strong><span>{ready ? 'Já há informação suficiente para o vendedor começar a trabalhar.' : 'Preencha o essencial agora. Dados administrativos continuam opcionais.'}</span></div><button type="button" onClick={applyCommercialDefaults}><Sparkles size={15} /> Aplicar padrão</button></div> : null}

      {mode === 'opportunity' && !lead ? <div className="opportunity-create-steps-v10168 field--span-2" aria-label="Fluxo de criação da oportunidade"><span><i>1</i><b>Conta e contato</b></span><span><i>2</i><b>Negócio e Pipeline</b></span><span><i>3</i><b>Próxima ação</b></span></div> : null}

      {mode === 'opportunity' ? <div className="lead-form__section field--span-2 lead-form__section--primary"><span>1 · Conta e contato principal</span><small>Identifique quem está sendo trabalhado antes de criar o negócio.</small></div> : null}
      <label className="field"><span>Nome / contato *</span><input autoFocus data-autofocus required value={value.name} onChange={(event) => update('name', event.target.value)} placeholder="Nome da pessoa" /></label>
      <label className="field"><span>Empresa</span><input list={`${formId}-company-options`} value={value.company} onChange={(event) => update('company', event.target.value)} placeholder="Empresa ou negócio" /><datalist id={`${formId}-company-options`}>{snapshot?.companies.map((company) => <option key={company.id} value={company.name} />)}</datalist></label>
      <label className="field"><span>Telefone</span><input value={value.phone} onChange={(event) => update('phone', event.target.value)} onBlur={() => update('phone', formatPhone(value.phone))} placeholder="(51) 99999-9999" inputMode="tel" autoComplete="tel" /></label>
      <label className="field"><span>E-mail</span><input value={value.email} onChange={(event) => update('email', event.target.value)} placeholder="contato@empresa.com" type="email" /></label>

      {companyMatch ? <div className="lead-company-match field--span-2"><Building2 size={18} /><div><strong>Empresa já existente</strong><span>{companyMatch.name}{companyMatch.city ? ` · ${companyMatch.city}` : ''}. Reutilize o cadastro para evitar duplicidade no Account 360.</span></div><button type="button" onClick={applyCompany}>Usar empresa</button></div> : null}

      {mode === 'opportunity' ? <>
        <div className="lead-form__section field--span-2 lead-form__section--primary"><span>2 · Negócio e Pipeline</span><small>Defina etapa, valor, responsável e previsão sem abrir configurações avançadas.</small></div>
        <label className="field"><span>Etapa *</span><SelectionSelect value={value.stageId} onValueChange={(next) => update('stageId', next)} options={(snapshot?.stages ?? []).map((stage) => ({ value: stage.id, label: stage.name, description: `${stage.probability}% de probabilidade` }))} /></label>
        <label className="field"><span>Valor estimado</span><input type="number" min="0" step="100" value={value.value} onChange={(event) => update('value', Number(event.target.value))} /></label>
        <label className="field"><span>Responsável</span><OwnerPicker value={value.ownerId ?? ''} members={ownerOptions} onValueChange={(ownerId) => { update('ownerId', ownerId || null); update('ownerName', ownerOptions.find((member) => member.userId === ownerId)?.displayName ?? 'Equipe') }} /></label>
        <label className="field"><span>Previsão de fechamento</span><input type="date" value={value.expectedCloseAt?.slice(0, 10) ?? ''} onChange={(event) => update('expectedCloseAt', event.target.value || null)} /></label>
        <div className="lead-form__section field--span-2 lead-form__section--primary"><span>3 · Próxima ação</span><small>Nenhuma oportunidade deve nascer sem um próximo movimento comercial claro.</small></div>
        <label className="field"><span>Próxima ação *</span><input type="datetime-local" required value={value.nextActionAt ? value.nextActionAt.slice(0, 16) : ''} onChange={(event) => update('nextActionAt', event.target.value ? new Date(event.target.value).toISOString() : null)} /></label>
        <label className="field"><span>Prioridade</span><SelectionSelect value={value.priority} onValueChange={(next) => update('priority', next as LeadFormValue['priority'])} options={[{ value: 'low', label: 'Baixa' }, { value: 'medium', label: 'Média' }, { value: 'high', label: 'Alta' }, { value: 'urgent', label: 'Urgente' }]} /></label>
      </> : <>
        <label className="field"><span>Responsável</span><OwnerPicker value={value.ownerId ?? ''} members={ownerOptions} onValueChange={(ownerId) => { update('ownerId', ownerId || null); update('ownerName', ownerOptions.find((member) => member.userId === ownerId)?.displayName ?? 'Equipe') }} /></label>
        <label className="field"><span>Próxima ação</span><input type="datetime-local" value={value.nextActionAt ? value.nextActionAt.slice(0, 16) : ''} onChange={(event) => update('nextActionAt', event.target.value ? new Date(event.target.value).toISOString() : null)} /></label>
      </>}

      <button className="lead-form__expand field--span-2" type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>{expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}<span><strong>{expanded ? 'Ocultar informações adicionais' : 'Mais informações'}</strong><small>{mode === 'opportunity' ? 'Qualificação, localização, origem, presença digital e forecast detalhado.' : 'Qualificação, empresa, localização, origem, redes sociais e forecast.'}</small></span></button>

      {expanded ? <>
        <div className="lead-form__section field--span-2"><span>{mode === 'opportunity' ? 'Qualificação comercial' : 'Oportunidade'}</span><small>{mode === 'opportunity' ? 'Sinais adicionais para priorização e contexto do negócio.' : 'Dados comerciais usados no Pipeline e no forecast.'}</small></div>
        {mode !== 'opportunity' ? <><label className="field"><span>Etapa</span><SelectionSelect value={value.stageId} onValueChange={(next) => update('stageId', next)} options={(snapshot?.stages ?? []).map((stage) => ({ value: stage.id, label: stage.name, description: `${stage.probability}% de probabilidade` }))} /></label><label className="field"><span>Valor estimado</span><input type="number" min="0" step="100" value={value.value} onChange={(event) => update('value', Number(event.target.value))} /></label></> : null}
        <label className="field"><span>Temperatura</span><SelectionSelect value={value.temperature} onValueChange={(next) => update('temperature', next as LeadFormValue['temperature'])} options={[{ value: 'cold', label: 'Frio' }, { value: 'warm', label: 'Morno' }, { value: 'hot', label: 'Quente' }]} /></label>
        {mode !== 'opportunity' ? <label className="field"><span>Prioridade</span><SelectionSelect value={value.priority} onValueChange={(next) => update('priority', next as LeadFormValue['priority'])} options={[{ value: 'low', label: 'Baixa' }, { value: 'medium', label: 'Média' }, { value: 'high', label: 'Alta' }, { value: 'urgent', label: 'Urgente' }]} /></label> : null}
        {mode !== 'opportunity' ? <label className="field"><span>Previsão de fechamento</span><input type="date" value={value.expectedCloseAt?.slice(0, 10) ?? ''} onChange={(event) => update('expectedCloseAt', event.target.value || null)} /></label> : null}
        <label className="field"><span>Origem</span><SelectionSelect value={value.source} onValueChange={(next) => update('source', next)} options={['Manual','Instagram','Garimpo','Indicação','Evento','Importação CSV','Importação V99'].map((label) => ({ value: label, label }))} /></label>

        <div className="lead-form__section field--span-2"><span>Empresa e localização</span><small>CNPJ, site e endereço pertencem à identidade da empresa.</small></div>
        <label className="field"><span>CNPJ</span><input value={value.cnpj ?? ''} onChange={(event) => update('cnpj', event.target.value)} placeholder="00.000.000/0001-00" /></label>
        <label className="field"><span>Site</span><input value={value.website ?? ''} onChange={(event) => update('website', event.target.value)} placeholder="https://empresa.com.br" type="url" /></label>
        <div className="lead-address-heading field--span-2"><div><strong>Endereço comercial</strong><span>Usado para mapa, rota e enriquecimento da conta.</span></div><span className={`lead-geocode-state lead-geocode-state--${currentGeocodeStatus}`}>{geocodeStatusLabel[currentGeocodeStatus]}</span></div>
        <label className="field"><span>CEP</span><input value={value.postalCode ?? ''} onChange={(event) => update('postalCode', event.target.value)} placeholder="92000-000" inputMode="numeric" autoComplete="postal-code" /></label>
        <label className="field"><span>Rua</span><input value={value.street ?? ''} onChange={(event) => update('street', event.target.value)} placeholder="Avenida ou rua" autoComplete="address-line1" /></label>
        <label className="field"><span>Número</span><input value={value.addressNumber ?? ''} onChange={(event) => update('addressNumber', event.target.value)} placeholder="123" inputMode="numeric" /></label>
        <label className="field"><span>Complemento</span><input value={value.complement ?? ''} onChange={(event) => update('complement', event.target.value)} placeholder="Sala, loja ou bloco" autoComplete="address-line2" /></label>
        <label className="field"><span>Bairro</span><input value={value.district ?? ''} onChange={(event) => update('district', event.target.value)} placeholder="Centro" /></label>
        <label className="field"><span>Cidade</span><input value={value.city} onChange={(event) => update('city', event.target.value)} placeholder="Canoas" autoComplete="address-level2" /></label>
        <label className="field"><span>Estado</span><input value={value.state ?? ''} onChange={(event) => update('state', event.target.value.slice(0, 2))} placeholder="RS" maxLength={2} autoComplete="address-level1" /></label>
        <label className="field"><span>País</span><input value={value.country ?? ''} onChange={(event) => update('country', event.target.value)} placeholder="Brasil" autoComplete="country-name" /></label>

        <div className="lead-form__section field--span-2"><span>Pessoa e buying committee</span><small>Qualificação do contato principal e regras de contato.</small></div>
        <label className="field"><span>Cargo</span><input value={value.jobTitle ?? ''} onChange={(event) => update('jobTitle', event.target.value)} placeholder="Proprietário, gerente..." /></label>
        <label className="field"><span>Papel na decisão</span><SelectionSelect value={value.decisionRole ?? 'unknown'} onValueChange={(next) => update('decisionRole', next as LeadFormValue['decisionRole'])} options={Object.entries(decisionRoleLabels).map(([role, label]) => ({ value: role, label }))} /></label>
        <label className="field"><span>Influência na decisão (%)</span><input type="number" min="0" max="100" value={value.influenceLevel ?? 0} onChange={(event) => update('influenceLevel', Number(event.target.value))} /></label>
        <label className="field"><span>Base de contato</span><SelectionSelect value={value.consentStatus ?? 'unknown'} onValueChange={(next) => update('consentStatus', next as LeadFormValue['consentStatus'])} options={[{ value: 'unknown', label: 'Não revisada' }, { value: 'legitimate_interest', label: 'Interesse legítimo revisado' }, { value: 'consented', label: 'Consentimento registrado' }, { value: 'opted_out', label: 'Solicitou bloqueio' }]} /></label>
        <div className="field field--span-2 data-consent-block"><SelectionCheckbox checked={Boolean(value.doNotContact)} onCheckedChange={(checked) => update('doNotContact', checked)} label="Bloquear qualquer contato comercial e automação" /></div>
        {value.doNotContact ? <label className="field field--span-2"><span>Motivo do bloqueio</span><input value={value.doNotContactReason ?? ''} onChange={(event) => update('doNotContactReason', event.target.value)} placeholder="Solicitação do contato, política interna..." /></label> : null}

        <div className="lead-form__section field--span-2"><span>Origem e presença digital</span><small>Ajuda o garimpo, a atribuição e o enriquecimento do contato.</small></div>
        <label className="field"><span>Detalhe da origem</span><input value={value.sourceDetail ?? ''} onChange={(event) => update('sourceDetail', event.target.value)} placeholder="Perfil empresarial, Lead Ads, evento..." /></label>
        <label className="field"><span>URL da origem</span><input value={value.sourceUrl ?? ''} onChange={(event) => update('sourceUrl', event.target.value)} placeholder="Link do perfil, formulário ou página" type="url" /></label>
        <label className="field"><span>Data de captura</span><input type="datetime-local" value={value.capturedAt ? value.capturedAt.slice(0, 16) : ''} onChange={(event) => update('capturedAt', event.target.value ? new Date(event.target.value).toISOString() : null)} /></label>
        <label className="field"><span>Instagram</span><input value={value.instagramUrl ?? ''} onChange={(event) => update('instagramUrl', event.target.value)} placeholder="https://instagram.com/empresa" type="url" /></label>
        <label className="field"><span>LinkedIn</span><input value={value.linkedinUrl ?? ''} onChange={(event) => update('linkedinUrl', event.target.value)} placeholder="https://linkedin.com/in/..." type="url" /></label>
        <label className="field"><span>Facebook</span><input value={value.facebookUrl ?? ''} onChange={(event) => update('facebookUrl', event.target.value)} placeholder="https://facebook.com/empresa" type="url" /></label>
        <label className="field field--span-2"><span>Tags</span><input list={`${formId}-tag-options`} value={value.tags.join(', ')} onChange={(event) => update('tags', event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean))} placeholder="barbearia, quente, evento" /><datalist id={`${formId}-tag-options`}>{preferences.commercial.tags.map((tag) => <option value={tag} key={tag} />)}</datalist></label>
        <label className="field field--span-2"><span>Observações</span><textarea value={value.notes} onChange={(event) => update('notes', event.target.value)} rows={4} placeholder="Contexto, necessidade e próximos passos" /></label>
      </> : null}
    </form>
  )
}
