import { AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Lead } from '../../domain/types'
import { useApp } from '../../app/app-context'
import type { NewLeadInput } from '../../repositories/crm-repository'
import { usePreferences, type CrmPreferences } from '../settings/preferences-context'
import { useAuth } from '../auth/auth-context'
import type { UserProfile } from '../../domain/types'

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
  name: '', company: '', phone: '', email: '', city: '', source: 'Manual', stageId,
  status: 'active', temperature: preferences.commercial.defaultLeadTemperature, priority: preferences.commercial.defaultLeadPriority, ownerId: user?.id ?? null, ownerName: user?.displayName ?? 'Equipe',
  value: 0, nextActionAt: nextCommercialAction(preferences), expectedCloseAt: null, notes: '', tags: [],
})
const fromLead = (lead: Lead): LeadFormValue => ({
  name: lead.name, company: lead.company, phone: lead.phone, email: lead.email, city: lead.city, source: lead.source,
  stageId: lead.stageId, status: lead.status, temperature: lead.temperature, priority: lead.priority, ownerId: lead.ownerId,
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
  const applyCommercialDefaults = () => setValue((current) => ({
    ...current,
    company: current.company.trim() || current.name.trim(),
    priority: preferences.commercial.defaultLeadPriority,
    temperature: preferences.commercial.defaultLeadTemperature,
    nextActionAt: current.nextActionAt || nextCommercialAction(preferences),
    tags: current.tags.length ? current.tags : preferences.commercial.tags.slice(0, 1),
  }))

  return (
    <form id={formId} className="form-grid" onSubmit={(event) => { event.preventDefault(); void onSubmit({ ...value, name: value.name.trim(), company: value.company.trim() || value.name.trim(), ownerName: value.ownerName.trim() || 'Equipe' }) }}>
      {possibleDuplicate ? <div className="duplicate-warning field--span-2"><AlertTriangle size={18} /><div><strong>Possível lead duplicado</strong><span>{possibleDuplicate.name} já possui o mesmo telefone ou e-mail. Você ainda pode salvar caso sejam oportunidades diferentes.</span></div></div> : null}
      {!lead ? <div className="seller-ready-fill field--span-2"><span className="seller-ready-fill__icon"><Sparkles size={18} /></span><div><strong>Cadastro assistido</strong><span>{completion}% pronto · prioridade, temperatura e retorno usam o padrão comercial.</span><i><b style={{ width: `${completion}%` }} /></i></div><button type="button" onClick={applyCommercialDefaults}><Sparkles size={15} /> Aplicar padrão</button></div> : completion === 100 ? <div className="seller-ready-complete field--span-2"><CheckCircle2 size={17} /> Cadastro com informações essenciais completas.</div> : null}
      <label className="field"><span>Nome do contato/lead *</span><input autoFocus required value={value.name} onChange={(event) => update('name', event.target.value)} placeholder="Nome do contato" /></label>
      <label className="field"><span>Empresa</span><input value={value.company} onChange={(event) => update('company', event.target.value)} placeholder="Nome da empresa ou barbearia" /></label>
      <label className="field"><span>Telefone</span><input value={value.phone} onChange={(event) => update('phone', event.target.value)} onBlur={() => update('phone', formatPhone(value.phone))} placeholder="(51) 99999-9999" inputMode="tel" autoComplete="tel" /></label>
      <label className="field"><span>E-mail</span><input value={value.email} onChange={(event) => update('email', event.target.value)} placeholder="contato@empresa.com" type="email" /></label>
      <label className="field"><span>Cidade</span><input value={value.city} onChange={(event) => update('city', event.target.value)} placeholder="Canoas" /></label>
      <label className="field"><span>Origem</span><select value={value.source} onChange={(event) => update('source', event.target.value)}><option>Manual</option><option>Instagram</option><option>Garimpo</option><option>Indicação</option><option>Evento</option><option>Importação CSV</option><option>Importação V99</option></select></label>
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
