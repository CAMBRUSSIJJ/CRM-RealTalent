import { describe, expect, it } from 'vitest'
import { createProspect, type ProspectingState } from '../../services/prospecting-workspace'
import { evidenceFor, mergeResults, publicUrl, sameBusiness } from './review'

const draft = {company:'Barbearia Alpha',city:'Rio Grande',phone:'53999991234',engine:{providerId:'maps:alpha',evidence:[{field:'phone',value:'53999991234',url:'https://maps.google.com/?cid=1',observed_at:'2026-11-18T00:00:00Z'}]}}
const blank = (): ProspectingState => ({prospects:[],history:[],lastExtensionSyncAt:null})

describe('hosted Garimpo review',() => {
  it('imports progressive results once with Maps source and evidence',() => {
    const first=mergeResults(blank(),[draft],'org','user',[])
    const next=mergeResults(first,[draft,draft],'org','user',[])
    expect(next.prospects).toHaveLength(1)
    expect(next.prospects[0]).toMatchObject({source:'maps',status:'review',createdBy:'user'})
    expect(evidenceFor(next.prospects[0])).toHaveLength(1)
  })
  it('enriches blanks without undoing manual data or CRM receipts',() => {
    const original={...createProspect('org',draft,'maps'),status:'sent' as const,phone:'53988887777',rawData:{...draft,hostedCrmCompanyId:'company'}}
    const result=mergeResults({...blank(),prospects:[original]},[{...draft,email:'oi@alpha.test'}],'org','user',[]).prospects[0]
    expect(result).toMatchObject({id:original.id,status:'sent',phone:'53988887777',email:'oi@alpha.test',rawData:{hostedCrmCompanyId:'company'}})
  })
  it('does not merge different branches just because they share a phone',() => {
    expect(sameBusiness(draft,{...draft,company:'Barbearia Beta',engine:{providerId:'maps:beta'}})).toBe(false)
  })
  it('imports official CNPJ records without falsely labeling them as Maps leads',() => {
    const indexed = {company:'Escola Exemplo',city:'Porto Alegre',cnpj:'12.345.678/0001-95',
      source:'cnpj',sourceDetail:'Receita Federal · índice CNPJ',
      engine:{providerId:'cnpj:12345678000195',dataset:{source:'RFB'}}}
    const saved = mergeResults(blank(),[indexed],'org','user',[])
    expect(saved.prospects[0]).toMatchObject({
      source:'cnpj',cnpj:'12.345.678/0001-95',status:'review',
      sourceDetail:'Receita Federal · índice CNPJ',
    })
    expect(mergeResults(saved,[indexed],'org','user',[]).prospects).toHaveLength(1)
  })
  it('merges source records by exact CNPJ, not name-only or a shared domain',() => {
    const first = {company:'Escola Matriz',city:'Rio Grande',cnpj:'12345678000195',
      engine:{providerId:'cnpj:12345678000195'}}
    const same = {company:'Escola Nova',city:'Rio Grande',cnpj:'12.345.678/0001-95',
      engine:{providerId:'maps:new'}}
    const another = {...same,cnpj:'12345678000276'}
    expect(sameBusiness(first,same)).toBe(true)
    expect(sameBusiness(first,another)).toBe(false)
  })
  it('does not render executable URLs from source data',() => {
    expect(publicUrl('javascript:alert(1)')).toBeNull()
    expect(publicUrl('https://user:password@example.com')).toBeNull()
    expect(publicUrl('https://example.com')).toBe('https://example.com/')
  })
})
