import { describe, expect, it } from 'vitest'
import { createProspect } from '../../services/prospecting-workspace'
import { fallbackIdentityResults, formattedCnpj, identityPatch, isValidCnpj } from './company-identity'
import type { IndexedCompany } from './hosted-client'

const original = () => createProspect('workspace',{
  company:'Conceito Barber', city:'Rio Grande', phone:'5391415652',
  source:'maps', sourceDetail:'Motor Python',
  engine:{providerId:'maps:original',qualityScore:45},
}, 'maps')
const candidate = (cnpj='11222333000181',city='Rio Grande',name='CONCEITO BARBER'): IndexedCompany=>({
  cnpj,legal_name:'CONCEITO BARBER LTDA',trade_name:name,city,uf:'RS',
  main_cnae:'9602501',secondary_cnaes:[],status:'02',headquarters:true,
  municipality_code:'8801',opened_on:'2023-01-01',
  source_month:'2026-10-01',source_url:'https://www.gov.br/receitafederal/dados',
})

describe('identificação de CNPJ e origem das sugestões',()=>{
  it('valida dígitos verificadores, não só formato do documento',()=>{
    expect(isValidCnpj('11222333000181')).toBe(true)
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true)
    expect(isValidCnpj('11222333000262')).toBe(true)
    expect(formattedCnpj('11222333000181')).toBe('11.222.333/0001-81')
    expect(isValidCnpj('11222333000180')).toBe(false)
    expect(isValidCnpj('11111111111111')).toBe(false)
    expect(isValidCnpj('abc')).toBe(false)
  })
  it('mantém filiais homônimas em vez de escolher automaticamente uma',()=>{
    const matches=fallbackIdentityResults({company:'Conceito Barber',city:'Rio Grande',state:'RS'},[
      candidate(),candidate('11222333000262'),
      candidate('11222333000180'),
      candidate('11222333000181','Pelotas'),
      candidate('11222333000181','Rio Grande','EMPRESA DIFERENTE'),
    ])
    expect(matches.candidates.map(item=>item.cnpj)).toEqual(['11222333000181','11222333000262'])
    expect(matches.identity_confirmed).toBe(false)
    expect(matches.candidates.every(item=>item.identity_confirmed===false)).toBe(true)
  })
  it('não aceita o nome genérico do segmento como identidade',()=>{
    const matches=fallbackIdentityResults({company:'Barbearia',city:'Rio Grande',state:'RS'},[candidate()])
    expect(matches.candidates).toEqual([])
  })
  it('vincula somente após aprovação e preserva contato, fonte, status e outros metadados',()=>{
    const record=original()
    const found=fallbackIdentityResults({company:'Conceito Barber',city:'Rio Grande',state:'RS'},[candidate()]).candidates[0]
    const patch=identityPatch(record,found)
    const after={...record,...patch}
    expect(record.cnpj).toBe('')
    expect(after.cnpj).toBe('11222333000181')
    expect(after.phone).toBe(record.phone)
    expect(after.source).toBe('maps')
    expect(after.status).toBe(record.status)
    expect((after.rawData.identityMatch as {method:string}).method).toBe('selected_official_candidate')
    expect((after.rawData.engine as {providerId:string}).providerId).toBe('maps:original')
    expect((after.rawData.engine as {legalName:string}).legalName).toBe('CONCEITO BARBER LTDA')
  })
  it('distingue CNPJ digitado manualmente de candidato oficial',()=>{
    const patch=identityPatch(original(),'11.222.333/0001-81')
    expect((patch.rawData?.identityMatch as {method:string}).method).toBe('user_supplied')
    expect((patch.rawData?.engine as {legalName?:string}).legalName).toBeUndefined()
    expect(()=>identityPatch(original(),'11222333000180')).toThrow('inválidos')
    const already={...original(),cnpj:'11222333000181'}
    expect(()=>identityPatch(already,'11222333000262')).toThrow('outro CNPJ')
  })
})
