import type { ProspectRecord } from '../../services/prospecting-workspace'
import type { IndexedCompany } from './hosted-client'

export interface IdentityCandidate {
  cnpj: string
  legal_name: string
  trade_name: string
  city: string
  uf: string
  main_cnae: string
  status: string
  headquarters: boolean
  source_month: string
  source_url: string
  match_score: number
  reasons: string[]
  identity_confirmed: false
}
export interface IdentitySearchResponse {
  checked_at: string
  name: string
  city: string
  state: string
  searched_terms: string[]
  candidates: IdentityCandidate[]
  incomplete: boolean
  identity_confirmed: false
  warnings: string[]
}

export const cnpjDigits = (value: string) => value.replace(/\D/g, '')
export function isValidCnpj(value: string): boolean {
  const digits = cnpjDigits(value)
  if (!/^[0-9]{14}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false
  for (const length of [12, 13]) {
    const weights = [...Array.from({length:length-8},(_,i)=>length-7-i),
      ...Array.from({length:8},(_,i)=>9-i)]
    const rem = [...digits.slice(0,length)].reduce((sum,n,i)=>sum+Number(n)*weights[i],0)%11
    if (Number(digits[length]) !== (rem < 2 ? 0 : 11-rem)) return false
  }
  return true
}
export const formattedCnpj = (value:string) =>
  cnpjDigits(value).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')
export const normalizedName = (value:string) => value.normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')
const stopwords = new Set('de da do das dos e a o na no empresa empresas ltda mei me eireli sa s comercio servicos servico industria grupo cia barbearia barbershop barber salao clinica escola loja restaurante consultoria educacao profissional estabelecimento filial matriz'.split(' '))
const meaningful = (value:string) =>
  normalizedName(value).split(' ').filter(word=>word.length>=3&&!stopwords.has(word))
export function fallbackIdentityResults(input: {
  company:string; city:string; state:string
}, rows: IndexedCompany[], incomplete=false): IdentitySearchResponse {
  const full=normalizedName(input.company)
  const important=[...new Set(meaningful(input.company))]
  const candidates:IdentityCandidate[]=[]
  if (full.length>=3 && important.length) {
    for(const row of rows.slice(0,120)) {
      if (!isValidCnpj(row.cnpj) || normalizedName(row.city)!==normalizedName(input.city)
        || row.uf!==input.state.toUpperCase()) continue
      const trade=normalizedName(row.trade_name||'')
      const legal=normalizedName(row.legal_name||'')
      const combined = [trade,legal].filter(Boolean)
      const exactTrade=trade===full
      const exactLegal=legal===full
      const distinctMatch=combined.some(name=>{
        const tokens=new Set(meaningful(name))
        return important.every(token=>tokens.has(token))
      })
      if (!exactTrade&&!exactLegal&&!distinctMatch) continue
      const score=exactTrade?96:exactLegal?94:(combined.some(n=>n.includes(full))?83:72)
      candidates.push({
        cnpj:cnpjDigits(row.cnpj),legal_name:row.legal_name,
        trade_name:row.trade_name,city:row.city,uf:row.uf,main_cnae:row.main_cnae,
        status:row.status,headquarters:row.headquarters,
        source_month:row.source_month,source_url:row.source_url,
        match_score:row.status==='02'?score:Math.max(35,score-16),
        reasons:['Nome semelhante em cadastro da Receita.',
          'Município e UF coincidem.','Endereço e domínio não foram confirmados.'],
        identity_confirmed:false,
      })
    }
  }
  const bestByCnpj = new Map<string, IdentityCandidate>()
  for (const item of candidates) {
    const previous = bestByCnpj.get(item.cnpj)
    if (!previous || item.match_score > previous.match_score) bestByCnpj.set(item.cnpj, item)
  }
  const unique=[...bestByCnpj.values()]
    .sort((a,b)=>b.match_score-a.match_score||a.cnpj.localeCompare(b.cnpj)).slice(0,7)
  return { checked_at:new Date().toISOString(),name:input.company,
    city:input.city,state:input.state,searched_terms:[full],
    candidates:unique,incomplete,identity_confirmed:false,
    warnings:['O motor encontrou possibilidades cadastrais, não identidades comprovadas.',
      'Confirme manualmente a empresa/filial antes de vincular o CNPJ.',
      ...(incomplete?['A lista representa apenas a primeira página consultada.']:[])] }
}
export interface IdentityMatch {
  method: 'selected_official_candidate' | 'user_supplied'
  matchedAt: string
  candidateCnpj: string
  originalName: string
  city: string
  sourceMonth: string
  sourceUrl: string
  score: number | null
  detail: string
}
export function identityPatch(record: ProspectRecord, candidate: IdentityCandidate | string): Partial<ProspectRecord> {
  const official=typeof candidate!=='string'
  const cnpj=cnpjDigits(official?candidate.cnpj:candidate)
  if (!isValidCnpj(cnpj)) throw new Error('O CNPJ possui dígitos verificadores inválidos.')
  if (record.cnpj && cnpjDigits(record.cnpj)!==cnpj)
    throw new Error('O registro já tem outro CNPJ. Revise o vínculo existente antes de substituí-lo.')
  const previousEngine=(record.rawData.engine||{}) as Record<string,unknown>
  const match:IdentityMatch={
    method:official?'selected_official_candidate':'user_supplied',
    matchedAt:new Date().toISOString(),candidateCnpj:cnpj,
    originalName:record.company||record.name,city:record.city,
    sourceMonth:official?candidate.source_month:'',
    sourceUrl:official?candidate.source_url:'',
    score:official?candidate.match_score:null,
    detail:official
      ? 'Candidato cadastral selecionado pelo usuário; nome e município coincidem, rua e domínio não confirmados.'
      : 'CNPJ informado manualmente; ainda não corroborado por fonte cadastral.',
  }
  return {cnpj,rawData:{
    ...record.rawData,
    identityMatch:match,
    engine:{
      ...previousEngine,
      ...(official?{
        legalName:previousEngine.legalName||candidate.legal_name,
        tradeName:previousEngine.tradeName||candidate.trade_name,
        mainCnae:previousEngine.mainCnae||candidate.main_cnae,
        uf:previousEngine.uf||candidate.uf,
        registrationStatus:candidate.status,
        sourceMonth:candidate.source_month,
      }:{}),
    },
  }}
}
