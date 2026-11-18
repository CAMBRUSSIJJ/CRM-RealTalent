import { describe, expect, it } from 'vitest'
import { createProspect } from '../../services/prospecting-workspace'
import { savedPeople } from './people-panel'
import { proposeRecheck, readPending, recheckHistory, resolveRecheck, stageRecheck,
  type RecheckResult } from './recheck'

const make = () => createProspect('workspace', {
  company: 'Escola Referência', city: 'Rio Grande', cnpj:'11222333000181',
  phone:'53999990000', website:'https://escola.example.org',
  source:'cnpj',
  engine:{ legalName:'ESCOLA REFERÊNCIA LTDA', mainCnae:'8513900', status:'02' },
}, 'cnpj')
const observation = (field:string,value:string,kind:'website'|'register'='website') => ({
  field,value,kind,source:kind==='website'?'Site institucional':'CNPJ / Receita Federal',
  url:kind==='website'?'https://escola.example.org':'https://www.gov.br/receitafederal/dados',
  observed_at:'2026-11-18T13:20:00Z',
})
const response = (observations: ReturnType<typeof observation>[]): RecheckResult => ({
  checked_at:'2026-11-18T13:30:00Z',cnpj:'11222333000181',company:'Escola Referência',
  observations, warnings:[],sources:['Site institucional'],no_changes_applied:true,
})

describe('inteligência de pessoas-chave', () => {
  it('retém apenas fontes públicas seguras e tipos permitidos no cadastro manual', () => {
    const company = make()
    const linked = {...company,rawData:{...company.rawData,keyPeople:[
      {id:'1',name:'Diretora Exemplo',position:'Diretora',function:'diretor',
        sourceUrl:'https://site-oficial.example.org/equipe',
        recordedAt:'2026-11-18T14:30:00Z',verification:'informada_pelo_usuario'},
      {id:'2',name:'Pessoa não verificada',position:'Cargo',function:'decisor',
        sourceUrl:'javascript:alert(1)',recordedAt:'2026-11-18T14:30:00Z'},
      {id:'3',name:'Cargo inválido',position:'Outro',function:'admin-geral',
        sourceUrl:'https://site-oficial.example.org/equipe',recordedAt:'2026-11-18T14:30:00Z'},
    ]}}
    expect(savedPeople(linked).map(person=>person.name)).toEqual(['Diretora Exemplo'])
    expect(savedPeople(company)).toEqual([])
  })
})

describe('revisão 2.0 — propostas verificadas e histórico', () => {
  it('não altera contatos existentes antes da aprovação', () => {
    const original = make()
    const patch = stageRecheck(original,response([observation('phone','+5553999991234')]))
    expect(original.phone).toBe('53999990000')
    const reviewed = {...original,...patch}
    expect(reviewed.phone).toBe(original.phone)
    expect(readPending(reviewed)?.proposals[0]).toMatchObject({
      field:'phone',before:'53999990000',after:'+5553999991234',
    })
    const accepted = resolveRecheck(reviewed,['phone'])
    expect(accepted.phone).toBe('+5553999991234')
    expect(readPending({...reviewed,...accepted})).toBeNull()
    expect(recheckHistory({...reviewed,...accepted})[0].appliedFields).toEqual(['phone'])
  })
  it('preserva manualmente alterados após a consulta', () => {
    const original = make()
    const reviewed = {...original,...stageRecheck(original,response([observation('phone','+5553999991234')]))}
    const changedAfterReview = {...reviewed,phone:'53988887777'}
    const result = resolveRecheck(changedAfterReview,['phone'])
    expect(result.phone).toBeUndefined()
    expect(changedAfterReview.phone).toBe('53988887777')
  })
  it('não escolhe entre telefones conflitantes',() => {
    const original = make()
    const run = response([observation('phone','+5553999991234'),observation('phone','+5553999995678')])
    expect(proposeRecheck(original,run).ambiguousFields).toEqual(['phone'])
    const staged = {...original,...stageRecheck(original,run)}
    expect(readPending(staged)).toBeNull()
    expect(recheckHistory(staged)[0].warnings[0]).toContain('Mais de um valor')
  })
  it('mantém dados cadastrais separados de contatos e respeita o estado no CRM',() => {
    const original = {...make(),status:'sent' as const}
    const run = response([observation('legal_name','ESCOLA NOVA LTDA','register'),
      observation('main_cnae','8599699','register'),
      observation('email','comercial@escola.example.org','register')])
    const staged = {...original,...stageRecheck(original,run)}
    expect(staged.status).toBe('sent')
    expect(readPending(staged)?.proposals.map(item=>item.field)).toEqual(['legal_name','main_cnae'])
    const approved = resolveRecheck(staged,['legal_name','main_cnae'])
    const registered = approved.rawData?.engine as Record<string,string>
    expect(registered.legalName).toBe('ESCOLA NOVA LTDA')
    expect(registered.mainCnae).toBe('8599699')
    expect(approved.email).toBeUndefined()
  })
  it('registra revisões sem novidades e mantém histórico limitado',() => {
    let original = make()
    for (let index=0;index<13;index++) {
      original={...original,...stageRecheck(original,{...response([]),
        checked_at:new Date(Date.UTC(2026,10,18,13,index)).toISOString()})}
    }
    expect(readPending(original)).toBeNull()
    expect(recheckHistory(original).length).toBeLessThanOrEqual(10)
    expect(original.phone).toBe('53999990000')
  })
  it('descarta dados sem fonte compatível',() => {
    const run=response([
      {...observation('phone','+5553999991234'),kind:'register'},
      {...observation('legal_name','FAKE CORP','website'),url:'javascript:fake'},
    ])
    expect(proposeRecheck(make(),run).proposals).toEqual([])
  })
})
