import { getSupabaseClient } from '../lib/supabase'

// Modelos de e-mail com variáveis (Fase 2 · Comunicação, PRD P1).
// Texto como "Olá {{primeiro_nome}}, ..." vira "Olá Ana, ..." para cada contato.

export interface EmailTemplate {
  id: string
  name: string
  category: string
  subject: string
  body: string
  shared: boolean
  createdBy: string | null
  updatedAt: string
}

export interface TemplateContext {
  name?: string | null
  company?: string | null
  jobTitle?: string | null
  city?: string | null
  stage?: string | null
  sellerName?: string | null
  sellerEmail?: string | null
}

export const TEMPLATE_VARIABLES: Array<{ key: string; label: string }> = [
  { key: 'primeiro_nome', label: 'Primeiro nome' },
  { key: 'nome', label: 'Nome completo' },
  { key: 'empresa', label: 'Empresa' },
  { key: 'cargo', label: 'Cargo' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'etapa', label: 'Etapa do Pipeline' },
  { key: 'vendedor', label: 'Seu nome' },
  { key: 'meu_email', label: 'Seu e-mail' },
]

const valuesFor = (context: TemplateContext): Record<string, string> => {
  const name = String(context.name || '').trim()
  return {
    primeiro_nome: name.split(/\s+/)[0] || '',
    nome: name,
    empresa: String(context.company || '').trim(),
    cargo: String(context.jobTitle || '').trim(),
    cidade: String(context.city || '').trim(),
    etapa: String(context.stage || '').trim(),
    vendedor: String(context.sellerName || '').trim(),
    meu_email: String(context.sellerEmail || '').trim(),
  }
}

const VARIABLE = /\{\{\s*([a-z_]+)\s*\}\}/gi

// Troca as variáveis e devolve as que ficaram sem valor, para avisar antes do envio.
export function renderTemplate(text: string, context: TemplateContext): { text: string; missing: string[] } {
  const values = valuesFor(context)
  const missing = new Set<string>()
  const rendered = text.replace(VARIABLE, (whole, rawKey: string) => {
    const key = rawKey.toLowerCase()
    if (!(key in values)) return whole
    if (!values[key]) { missing.add(key); return '' }
    return values[key]
  })
  return { text: rendered.replace(/[ \t]+([,.!?;:])/g, '$1'), missing: [...missing] }
}

export const variableLabel = (key: string) => TEMPLATE_VARIABLES.find((item) => item.key === key)?.label ?? key

type TemplateRow = { id: string; name: string; category: string; subject_template: string; body_text_template: string; shared: boolean; created_by: string | null; updated_at: string }
const mapRow = (row: TemplateRow): EmailTemplate => ({
  id: row.id, name: row.name, category: row.category || 'Geral', subject: row.subject_template || '', body: row.body_text_template || '',
  shared: Boolean(row.shared), createdBy: row.created_by, updatedAt: row.updated_at,
})
// email_templates ainda não está nos tipos gerados do Supabase.
const table = () => {
  const client = getSupabaseClient()
  if (!client) throw new Error('Modelos de e-mail exigem o CRM hospedado.')
  return (client as unknown as { from(name: string): any }).from('email_templates')
}

export async function listEmailTemplates(workspaceId: string): Promise<EmailTemplate[]> {
  if (!getSupabaseClient()) return []
  const { data, error } = await table().select('id,name,category,subject_template,body_text_template,shared,created_by,updated_at')
    .eq('organization_id', workspaceId).eq('active', true).order('category').order('name')
  if (error) throw new Error(`Não foi possível carregar os modelos: ${error.message}`)
  return ((data || []) as TemplateRow[]).map(mapRow)
}

export interface SaveTemplateInput { workspaceId: string; id?: string; name: string; category?: string; subject: string; body: string; shared: boolean; userId: string | null }

export async function saveEmailTemplate(input: SaveTemplateInput): Promise<EmailTemplate> {
  const name = input.name.trim()
  if (!name) throw new Error('Dê um nome ao modelo.')
  if (!input.body.trim()) throw new Error('O modelo precisa de texto.')
  const values = {
    organization_id: input.workspaceId, name: name.slice(0, 120), category: (input.category || 'Geral').trim().slice(0, 60) || 'Geral',
    subject_template: input.subject.slice(0, 500), body_text_template: input.body.slice(0, 50000), body_html_template: '',
    shared: input.shared, active: true, updated_by: input.userId, updated_at: new Date().toISOString(),
  }
  const query = input.id
    ? table().update(values).eq('id', input.id).eq('organization_id', input.workspaceId)
    : table().insert({ ...values, created_by: input.userId })
  const { data, error } = await query.select('id,name,category,subject_template,body_text_template,shared,created_by,updated_at').single()
  if (error) throw new Error(error.code === '23505' ? 'Já existe um modelo com esse nome.' : `Não foi possível salvar o modelo: ${error.message}`)
  return mapRow(data as TemplateRow)
}

export async function deleteEmailTemplate(workspaceId: string, id: string) {
  const { error } = await table().delete().eq('id', id).eq('organization_id', workspaceId)
  if (error) throw new Error(`Não foi possível excluir o modelo: ${error.message}`)
}
