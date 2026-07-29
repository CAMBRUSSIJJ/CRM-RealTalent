import { AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { GeocodeStatus, Lead } from '../../domain/types'
import { useApp } from '../../app/app-context'
import type { NewLeadInput } from '../../repositories/crm-repository'
import { usePreferences, type CrmPreferences } from '../settings/preferences-context'
import { useAuth } from '../auth/auth-context'
import type { UserProfile } from '../../domain/types'
import { addressStatusForLead, buildLeadAddress, geocodeStatusLabel } from '../../services/geocoding'

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
const formatPhone = (value: string) => {
  const digits = normalizePhone(value).slice(0, 13)
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return value.trim()
}

export function LeadForm({ lead, initialStageId, formId, onSubmit }: { lead?: Lead; initialStageId?: string; formId: string; onSubmit(value: LeadFormValue): Promise<void> }) {
  const { snapshot } = useApp()
  const { user } = useAuth()
  const { preferences } = usePreferences()
  const fallbackStageId = initialStageId ?? snapshot?.stages[0]?.id ?? ''
  const [value, setValue] = useState<LeadFormValue>(() => lead ? fromLead(lead) : defaultValue(fallbackStageId, preferences, user))

  useEffect(() => { setValue(lead ? fromLead(lead) : defaultValue(initialStageId ?? snapshot?.stages[0]?.id ?? '', preferences, user)) }, [initialStageId, lead, preferences, snapshot?.stages, user])
  const update = <K extends keyof LeadFormValue>(key: K, nextValue: LeadFormValue[K]) => setValue((current) => ({ ...current, [key]: nextValue }))

  const possibleDuplicate = useMemo(() => {
    const phone = normalizePhone(value.phone)
    const email = value.email.trim().toLowerCase()
    return snapshot?.leads.find((item) => item.id !== lead?.id && ((phone.length >= 8 && normalizePhone(item.phone) === phone) || (email && item.email.trim().toLowerCase() === email))) ?? null
  }, [lead?.id, snapshot?.leads, value.email, value.phone])
  const completion = useMemo(() => {
    const checks = [Boolean(value.name.trim()), Boolean(value.company.trim()), Boolean(value.phone.trim() || value.email.trim()), Boolean(value.city.trim()), Boolean(value.ownerName.trim()), Boolean(value.nextActionAt)]
    return Math.round(checks.filter(Boolean).length / checks.length * 100)
  }, [value.city, value.company, value.email, value.name, value.nextActionAt, value.ownerName, value.phone])
  const currentGeocodeStatus = (value.geocodeStatus ?? addressStatusForLead(value)) as GeocodeStatus
  const addressChanged = lead ? ['postalCode', 'street', 'addressNumber', 'complement', 'district', 'city', 'state', 'country'].some((key) => String(value[key as keyof LeadFormValue] ?? '').trim() !== String(lead[key as keyof Lead] ?? '').trim()) : true
  const submitValue = () => {
    const normalized = {
      ...value,
      name: value.name.trim(), company: value.company.trim() || value.name.trim(), ownerName: value.ownerName.trim() || 'Equipe',
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
  const applyCommercialDefaults = () => setValue((current) => ({
    ...current,
    company: current.company.trim() || current.name.trim(),
    priority: preferences.commercial.defaultLeadPriority,
    temperature: preferences.commercial.defaultLeadTemperature,
    nextActionAt: current.nextActionAt || nextCommercialAction(preferences),
    tags: current.tags.length ? current.tags : preferences.commercial.tags.slice(0, 1),
  }))

  return (
    <form id={formId} className="form-grid" onSubmit={(event) => { event.preventDefault(); void onSubmit(submitValue()) }}>
      {possibleDuplicate ? <div className="duplicate-warning field--span-2"><AlertTriangle size={18} /><div><strong>Possível lead duplicado</strong><span>{possibleDuplicate.name} já possui o mesmo telefone ou e-mail. Você ainda pode salvar caso sejam oportunidades diferentes.</span></div></div> : null}
      {!lead ? <div className="seller-ready-fill field--span-2"><span className="seller-ready-fill__icon"><Sparkles size={18} /></span><div><strong>Cadastro assistido</strong><span>{completion}% pronto · prioridade, temperatura e retorno usam o padrão comercial.</span><i><b style={{ width: `${completion}%` }} /></i></div><button type="button" onClick={applyCommercialDefaults}><Sparkles size={15} /> Aplicar padrão</button></div> : completion === 100 ? <div className="seller-ready-complete field--span-2"><CheckCircle2 size={17} /> Cadastro com informações essenciais completas.</div> : null}
      <label className="field"><span>Nome do contato/lead *</span><input autoFocus required value={value.name} onChange={(event) => update('name', event.target.value)} placeholder="Nome do contato" /></label>
      <label className="field"><span>Empresa</span><input value={value.company} onChange={(event) => update('company', event.target.value)} placeholder="Nome da empresa ou barbearia" /></label>
      <label className="field"><span>Telefone</span><input value={value.phone} onChange={(event) => update('phone', event.target.value)} onBlur={() => update('phone', formatPhone(value.phone))} placeholder="(51) 99999-9999" inputMode="tel" autoComplete="tel" /></label>
      <label className="field"><span>E-mail</span><input value={value.email} onChange={(event) => update('email', event.target.value)} placeholder="contato@empresa.com" type="email" /></label>
      <div className="lead-address-heading field--span-2"><div><strong>Endereço comercial</strong><span>Os dados estruturados permitem localizar o lead com precisão e preparar rotas.</span></div><span className={`lead-geocode-state lead-geocode-state--${currentGeocodeStatus}`}>{geocodeStatusLabel[currentGeocodeStatus]}</span></div>
      <label className="field"><span>CEP</span><input value={value.postalCode ?? ''} onChange={(event) => update('postalCode', event.target.value)} placeholder="92000-000" inputMode="numeric" autoComplete="postal-code" /></label>
      <label className="field"><span>Rua</span><input value={value.street ?? ''} onChange={(event) => update('street', event.target.value)} placeholder="Avenida ou rua" autoComplete="address-line1" /></label>
      <label className="field"><span>Número</span><input value={value.addressNumber ?? ''} onChange={(event) => update('addressNumber', event.target.value)} placeholder="123" inputMode="numeric" /></label>
      <label className="field"><span>Complemento</span><input value={value.complement ?? ''} onChange={(event) => update('complement', event.target.value)} placeholder="Sala, loja ou bloco" autoComplete="address-line2" /></label>
      <label className="field"><span>Bairro</span><input value={value.district ?? ''} onChange={(event) => update('district', event.target.value)} placeholder="Centro" /></label>
      <label className="field"><span>Cidade</span><input value={value.city} onChange={(event) => update('city', event.target.value)} placeholder="Canoas" autoComplete="address-level2" /></label>
      <label className="field"><span>Estado</span><input value={value.state ?? ''} onChange={(event) => update('state', event.target.value.slice(0, 2))} placeholder="RS" maxLength={2} autoComplete="address-level1" /></label>
      <label className="field"><span>País</span><input value={value.country ?? ''} onChange={(event) => update('country', event.target.value)} placeholder="Brasil" autoComplete="country-name" /></label>
      <label className="field"><span>Origem</span><select value={value.source} onChange={(event) => update('source', event.target.value)}><option>Manual</option><option>Instagram</option><option>Garimpo</option><option>Indicação</option><option>Evento</option><option>Importação CSV</option><option>Importação V99</option></select></label>
      <div className="lead-address-heading field--span-2"><div><strong>Identidade comercial e origem</strong><span>Esses dados evitam duplicidade e preparam o CRM para Prospecção Social.</span></div></div>
      <label className="field"><span>CNPJ</span><input value={value.cnpj ?? ''} onChange={(event) => update('cnpj', event.target.value)} placeholder="00.000.000/0001-00" /></label>
      <label className="field"><span>Site</span><input value={value.website ?? ''} onChange={(event) => update('website', event.target.value)} placeholder="https://empresa.com.br" type="url" /></label>
      <label className="field"><span>Cargo</span><input value={value.jobTitle ?? ''} onChange={(event) => update('jobTitle', event.target.value)} placeholder="Proprietário, gerente..." /></label>
      <label className="field"><span>Papel na decisão</span><select value={value.decisionRole ?? 'unknown'} onChange={(event) => update('decisionRole', event.target.value as LeadFormValue['decisionRole'])}><option value="unknown">Não identificado</option><option value="decision_maker">Decisor</option><option value="influencer">Influenciador</option><option value="user">Usuário</option></select></label>
      <label className="field"><span>Influência na decisão (%)</span><input type="number" min="0" max="100" value={value.influenceLevel ?? 0} onChange={(event) => update('influenceLevel', Number(event.target.value))} /></label>
      <label className="field"><span>Base de contato</span><select value={value.consentStatus ?? 'unknown'} onChange={(event) => update('consentStatus', event.target.value as LeadFormValue['consentStatus'])}><option value="unknown">Não revisada</option><option value="legitimate_interest">Interesse legítimo revisado</option><option value="consented">Consentimento registrado</option><option value="opted_out">Solicitou bloqueio</option></select></label>
      <label className="field"><span>Detalhe da origem</span><input value={value.sourceDetail ?? ''} onChange={(event) => update('sourceDetail', event.target.value)} placeholder="Perfil empresarial, Lead Ads, evento..." /></label>
      <label className="field"><span>URL da origem</span><input value={value.sourceUrl ?? ''} onChange={(event) => update('sourceUrl', event.target.value)} placeholder="Link do perfil, formulário ou página" type="url" /></label>
      <label className="field"><span>Data de captura</span><input type="datetime-local" value={value.capturedAt ? value.capturedAt.slice(0, 16) : ''} onChange={(event) => update('capturedAt', event.target.value ? new Date(event.target.value).toISOString() : null)} /></label>
      <label className="field"><span>Instagram</span><input value={value.instagramUrl ?? ''} onChange={(event) => update('instagramUrl', event.target.value)} placeholder="https://instagram.com/empresa" type="url" /></label>
      <label className="field"><span>LinkedIn</span><input value={value.linkedinUrl ?? ''} onChange={(event) => update('linkedinUrl', event.target.value)} placeholder="https://linkedin.com/in/..." type="url" /></label>
      <label className="field"><span>Facebook</span><input value={value.facebookUrl ?? ''} onChange={(event) => update('facebookUrl', event.target.value)} placeholder="https://facebook.com/empresa" type="url" /></label>
      <label className="field field--span-2 form-check data-consent-block"><input className="form-check-input" type="checkbox" checked={Boolean(value.doNotContact)} onChange={(event) => update('doNotContact', event.target.checked)} /><span className="form-check-label">Bloquear qualquer contato comercial e automação</span></label>
      {value.doNotContact ? <label className="field field--span-2"><span>Motivo do bloqueio</span><input value={value.doNotContactReason ?? ''} onChange={(event) => update('doNotContactReason', event.target.value)} placeholder="Solicitação do contato, política interna..." /></label> : null}
      <label className="field"><span>Etapa</span><select required value={value.stageId} onChange={(event) => update('stageId', event.target.value)}>{snapshot?.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
      <label className="field"><span>Valor estimado</span><input type="number" min="0" step="100" value={value.value} onChange={(event) => update('value', Number(event.target.value))} /></label>
      <label className="field"><span>Temperatura</span><select value={value.temperature} onChange={(event) => update('temperature', event.target.value as LeadFormValue['temperature'])}><option value="cold">Frio</option><option value="warm">Morno</option><option value="hot">Quente</option></select></label>
      <label className="field"><span>Prioridade</span><select value={value.priority} onChange={(event) => update('priority', event.target.value as LeadFormValue['priority'])}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
      <label className="field"><span>Responsável</span><input value={value.ownerName} onChange={(event) => update('ownerName', event.target.value)} placeholder="Equipe ou vendedor" /></label>
      <label className="field"><span>Próxima ação</span><input type="datetime-local" value={value.nextActionAt ? value.nextActionAt.slice(0, 16) : ''} onChange={(event) => update('nextActionAt', event.target.value ? new Date(event.target.value).toISOString() : null)} /></label>
      <label className="field"><span>Previsão de fechamento</span><input type="date" value={value.expectedCloseAt?.slice(0, 10) ?? ''} onChange={(event) => update('expectedCloseAt', event.target.value || null)} /><small>Usada no forecast comercial; não é a data da próxima tarefa.</small></label>
      <label className="field field--span-2"><span>Tags</span><input list={`${formId}-tag-options`} value={value.tags.join(', ')} onChange={(event) => update('tags', event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean))} placeholder="barbearia, quente, evento" /><datalist id={`${formId}-tag-options`}>{preferences.commercial.tags.map((tag) => <option value={tag} key={tag} />)}</datalist><small>Separe por vírgulas. Sugestões seguem as etiquetas configuradas.</small></label>
      <label className="field field--span-2"><span>Observações</span><textarea value={value.notes} onChange={(event) => update('notes', event.target.value)} rows={4} placeholder="Contexto, necessidade e próximos passos" /></label>
    </form>
  )
}
