import type { Lead, LeadPriority, LeadStatus, LeadTemperature, PipelineStage } from '../domain/types'
import { createId } from '../lib/id'

const normalize = (value: string) => value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const parseTable = (content: string, separator: string) => {
  const rows: string[][] = []
  let cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]
    if (character === '"') {
      if (quoted && content[index + 1] === '"') { current += '"'; index += 1 }
      else quoted = !quoted
    } else if (character === separator && !quoted) { cells.push(current.trim()); current = '' }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && content[index + 1] === '\n') index += 1
      cells.push(current.trim())
      if (cells.some((cellValue) => cellValue.length > 0)) rows.push(cells)
      cells = []
      current = ''
    }
    else current += character
  }
  cells.push(current.trim())
  if (cells.some((cellValue) => cellValue.length > 0)) rows.push(cells)
  return rows
}

const firstRecord = (content: string) => {
  let quoted = false
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '"') {
      if (quoted && content[index + 1] === '"') index += 1
      else quoted = !quoted
    }
    if (!quoted && (content[index] === '\n' || content[index] === '\r')) return content.slice(0, index)
  }
  return content
}

const headerAliases: Record<string, string[]> = {
  name: ['nome', 'lead', 'contato', 'nome do lead', 'empresa'],
  company: ['empresa', 'companhia', 'barbearia', 'negocio', 'negócio', 'razao social', 'nome fantasia'],
  phone: ['telefone', 'fone', 'whatsapp', 'celular', 'zap', 'whats'],
  email: ['email', 'e-mail'],
  city: ['cidade', 'local', 'municipio', 'município'],
  source: ['origem', 'fonte', 'source'],
  stage: ['etapa', 'pipeline', 'fase', 'status pipeline'],
  temperature: ['temperatura', 'temperatura lead'],
  priority: ['prioridade'],
  status: ['status', 'situacao', 'situação'],
  ownerName: ['responsavel', 'responsável', 'vendedor', 'owner'],
  value: ['valor', 'valor estimado', 'ticket'],
  nextActionAt: ['proxima acao', 'próxima ação', 'retorno', 'data retorno'],
  tags: ['tags', 'etiquetas'],
  notes: ['observacoes', 'observações', 'notas', 'descricao', 'descrição'],
  cnpj: ['cnpj', 'documento', 'cpf/cnpj', 'cnpj/cpf'],
  website: ['site', 'website', 'url', 'pagina', 'página'],
}

export type LeadCsvField = keyof typeof headerAliases
export const LEAD_CSV_FIELDS: Array<{ field: LeadCsvField; label: string }> = [
  { field: 'name', label: 'Nome' }, { field: 'company', label: 'Empresa' }, { field: 'cnpj', label: 'CNPJ' },
  { field: 'phone', label: 'Telefone' }, { field: 'email', label: 'E-mail' }, { field: 'city', label: 'Cidade' },
  { field: 'website', label: 'Site' }, { field: 'source', label: 'Origem' }, { field: 'stage', label: 'Etapa' },
  { field: 'status', label: 'Status' }, { field: 'temperature', label: 'Temperatura' }, { field: 'priority', label: 'Prioridade' },
  { field: 'ownerName', label: 'Responsável' }, { field: 'value', label: 'Valor' }, { field: 'nextActionAt', label: 'Próxima ação' },
  { field: 'tags', label: 'Tags' }, { field: 'notes', label: 'Observações' },
]
/** Uma entrada por coluna do arquivo: o campo do CRM que ela preenche, ou null para ignorar. */
export type LeadCsvMapping = Array<LeadCsvField | null>
export interface LeadCsvTable { headers: string[]; rows: string[][] }

const cell = (row: string[], index: number) => index >= 0 ? (row[index] ?? '').trim() : ''
const parseMoney = (value: string) => {
  const normalized = value.replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}
const parseDate = (value: string) => {
  if (!value) return null
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/)
  const date = br ? new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), Number(br[4] ?? 9), Number(br[5] ?? 0)) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
const temperature = (value: string): LeadTemperature => normalize(value).includes('quente') || normalize(value) === 'hot' ? 'hot' : normalize(value).includes('frio') || normalize(value) === 'cold' ? 'cold' : 'warm'
const priority = (value: string): LeadPriority => {
  const item = normalize(value)
  if (item.includes('urgent')) return 'urgent'
  if (item.includes('alta') || item === 'high') return 'high'
  if (item.includes('baixa') || item === 'low') return 'low'
  return 'medium'
}
const status = (value: string): LeadStatus => {
  const item = normalize(value)
  if (item.includes('ganh') || item.includes('fech') || item === 'won') return 'won'
  if (item.includes('perd') || item === 'lost') return 'lost'
  if (item.includes('arquiv') || item === 'archived') return 'archived'
  return 'active'
}

export interface CsvImportResult { leads: Lead[]; warnings: string[]; rowNumbers?: number[] }

/** Lê o arquivo (vírgula ou ponto e vírgula, com aspas) sem decidir ainda o que cada coluna significa. */
export function readLeadCsv(content: string): LeadCsvTable {
  const clean = content.replace(/^\uFEFF/, '').trim()
  if (!clean) throw new Error('O arquivo CSV está vazio.')
  const headerRecord = firstRecord(clean)
  const separator = (headerRecord.match(/;/g)?.length ?? 0) > (headerRecord.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows = parseTable(clean, separator)
  if (rows.length < 2) throw new Error('O CSV precisa conter cabeçalho e ao menos uma linha.')
  return { headers: rows[0], rows: rows.slice(1) }
}

/** Sugere o campo de cada coluna pelo nome do cabeçalho. Cada campo fica com a primeira coluna livre que combina; Nome é resolvido antes de Empresa. */
export function suggestLeadCsvMapping(headers: string[]): LeadCsvMapping {
  const mapping: LeadCsvMapping = headers.map(() => null)
  for (const field of Object.keys(headerAliases) as LeadCsvField[]) {
    const index = headers.findIndex((header, position) => mapping[position] === null && headerAliases[field].includes(normalize(header)))
    if (index >= 0) mapping[index] = field
  }
  return mapping
}

export function buildLeadsFromCsv(table: LeadCsvTable, mapping: LeadCsvMapping, workspaceId: string, stages: PipelineStage[]): CsvImportResult {
  const indexes = Object.fromEntries((Object.keys(headerAliases) as LeadCsvField[]).map((field) => [field, mapping.indexOf(field)])) as Record<LeadCsvField, number>
  if (indexes.name < 0) throw new Error('Não encontrei uma coluna de nome/lead no CSV.')
  const warnings: string[] = []
  const rowNumbers: number[] = []
  const fallback = stages.find((stage) => !stage.isWon && !stage.isLost) ?? stages[0]
  if (!fallback) throw new Error('O workspace precisa ter ao menos uma etapa.')
  const now = new Date().toISOString()
  const leads = table.rows.reduce<Lead[]>((result, row, rowIndex) => {
    const name = cell(row, indexes.name)
    if (!name) { warnings.push(`Linha ${rowIndex + 2}: ignorada por não possuir nome.`); return result }
    const stageText = normalize(cell(row, indexes.stage))
    const resolvedStage = stages.find((stage) => normalize(stage.name) === stageText) ?? fallback
    if (stageText && resolvedStage === fallback && normalize(fallback.name) !== stageText) warnings.push(`Linha ${rowIndex + 2}: etapa “${cell(row, indexes.stage)}” não encontrada; usada “${fallback.name}”.`)
    const importedStatus = status(cell(row, indexes.status))
    const finalStatus: LeadStatus = resolvedStage.isWon ? 'won' : resolvedStage.isLost ? 'lost' : importedStatus
    const cnpj = cell(row, indexes.cnpj)
    const website = cell(row, indexes.website)
    result.push({
      id: createId('lead'), workspaceId, name,
      company: cell(row, indexes.company) || name,
      phone: cell(row, indexes.phone), email: cell(row, indexes.email), city: cell(row, indexes.city),
      source: cell(row, indexes.source) || 'Importação CSV', stageId: resolvedStage.id, status: finalStatus,
      temperature: temperature(cell(row, indexes.temperature)), priority: priority(cell(row, indexes.priority)),
      ownerId: null, ownerName: cell(row, indexes.ownerName) || 'Equipe', value: parseMoney(cell(row, indexes.value)),
      nextActionAt: parseDate(cell(row, indexes.nextActionAt)), notes: cell(row, indexes.notes),
      tags: cell(row, indexes.tags).split(/[|,]/).map((tag) => tag.trim()).filter(Boolean), createdAt: now, updatedAt: now,
      ...(cnpj ? { cnpj } : {}), ...(website ? { website } : {}),
    })
    rowNumbers.push(rowIndex + 2)
    return result
  }, [])
  return { leads, warnings, rowNumbers }
}

/** Importação direta, com o mapeamento sugerido pelos cabeçalhos. */
export function parseLeadCsv(content: string, workspaceId: string, stages: PipelineStage[]): CsvImportResult {
  const table = readLeadCsv(content)
  return buildLeadsFromCsv(table, suggestLeadCsvMapping(table.headers), workspaceId, stages)
}

export function leadsToCsv(leads: Lead[], stages: PipelineStage[]) {
  const rows = [['Nome','Empresa','Telefone','E-mail','Cidade','Origem','Etapa','Status','Temperatura','Prioridade','Responsável','Valor','Próxima ação','Tags','Observações']]
  leads.forEach((lead) => rows.push([
    lead.name, lead.company, lead.phone, lead.email, lead.city, lead.source,
    stages.find((stage) => stage.id === lead.stageId)?.name ?? '', lead.status, lead.temperature, lead.priority,
    lead.ownerName, String(lead.value), lead.nextActionAt ?? '', lead.tags.join('|'), lead.notes,
  ]))
  const safeCell = (value: unknown) => {
    const text = String(value)
    // Evita que Excel/LibreOffice interpretem dados de usuário como fórmula.
    const neutralized = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text
    return `"${neutralized.replaceAll('"', '""')}"`
  }
  return `\uFEFF${rows.map((row) => row.map(safeCell).join(';')).join('\r\n')}`
}
