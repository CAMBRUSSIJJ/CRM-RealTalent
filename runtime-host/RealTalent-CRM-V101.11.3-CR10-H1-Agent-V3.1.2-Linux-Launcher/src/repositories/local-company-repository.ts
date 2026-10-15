import type { CompanyRecord } from '../domain/types'
import { createId } from '../lib/id'
import type { NewCompanyInput, UpdateCompanyInput } from './crm-repository'
import { clone, readDatabase, writeDatabase } from './local-repository-core'

const compactCnpj = (value: string) => value.replace(/\D/g, '').slice(0, 14)
const cleanDomain = (value: string) => value.trim().toLocaleLowerCase('pt-BR')

export const createLocalCompany = (input: NewCompanyInput): CompanyRecord => {
  const db = readDatabase()
  const name = input.name.trim()
  if (!name) throw new Error('Informe o nome da empresa.')
  const cnpj = compactCnpj(input.cnpj)
  if (cnpj.length === 14 && db.companies.some((item) => item.workspaceId === input.workspaceId && compactCnpj(item.cnpj) === cnpj)) {
    throw new Error('Já existe uma empresa com este CNPJ no workspace.')
  }
  const now = new Date().toISOString()
  const company: CompanyRecord = {
    ...input,
    id: createId('company'),
    name,
    legalName: input.legalName.trim(),
    cnpj: input.cnpj.trim(),
    domain: cleanDomain(input.domain),
    website: input.website.trim(),
    segment: input.segment.trim(),
    phone: input.phone.trim(),
    city: input.city.trim(),
    state: input.state.trim(),
    leadIds: Array.from(new Set(input.leadIds ?? [])),
    createdAt: now,
    updatedAt: now,
  }
  db.companies.unshift(company)
  writeDatabase(db)
  return clone(company)
}

export const updateLocalCompany = (companyId: string, input: UpdateCompanyInput): CompanyRecord => {
  const db = readDatabase()
  const index = db.companies.findIndex((item) => item.id === companyId)
  if (index < 0) throw new Error('Empresa não encontrada.')
  const current = db.companies[index]
  const cnpj = compactCnpj(input.cnpj === undefined ? current.cnpj : input.cnpj)
  if (cnpj.length === 14 && db.companies.some((item, itemIndex) => itemIndex !== index && item.workspaceId === current.workspaceId && compactCnpj(item.cnpj) === cnpj)) {
    throw new Error('Já existe outra empresa com este CNPJ no workspace.')
  }
  const next: CompanyRecord = {
    ...current,
    ...input,
    ...(input.name !== undefined ? { name: input.name.trim() || current.name } : {}),
    ...(input.legalName !== undefined ? { legalName: input.legalName.trim() } : {}),
    ...(input.domain !== undefined ? { domain: cleanDomain(input.domain) } : {}),
    ...(input.website !== undefined ? { website: input.website.trim() } : {}),
    ...(input.segment !== undefined ? { segment: input.segment.trim() } : {}),
    ...(input.phone !== undefined ? { phone: input.phone.trim() } : {}),
    ...(input.city !== undefined ? { city: input.city.trim() } : {}),
    ...(input.state !== undefined ? { state: input.state.trim() } : {}),
    ...(input.leadIds !== undefined ? { leadIds: Array.from(new Set(input.leadIds)) } : {}),
    updatedAt: new Date().toISOString(),
  }
  db.companies[index] = next
  writeDatabase(db)
  return clone(next)
}
