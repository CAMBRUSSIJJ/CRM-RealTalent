import {describe,expect,it} from 'vitest'
import type {Lead} from '../domain/types'
import {analyzeWonSales,readWonSales,upsertWonSale,validateWonSalesInput,type WonSalesInput} from './won-sales-analysis'

const lead=(id:string,workspaceId='ws-A',status:'won'|'active'='won',value=15000)=>({
  id,workspaceId,status,value,name:'Cliente '+id,company:'Empresa '+id,
  updatedAt:'2026-06-10T10:00:00.000Z',
}) as Lead
const input:WonSalesInput={
  category:'transition',trigger:'Mudança de liderança',
  happenedAt:'2026-03-11',discoveredAt:'2026-04-15',
  whyUs:'O comprador valorizou o diagnóstico e o plano de desenvolvimento.',
  previousAlternative:'Treinamento interno',
  evidence:'customer_statement',evidenceNote:'Informado pelo comprador durante a reunião.',
  evidenceUrl:'',
}
const storage=()=>{const data=new Map<string,string>();return {
  getItem:(key:string)=>data.get(key)??null,
  setItem:(key:string,value:string)=>{data.set(key,value)},
}}
describe('Won Sales Analysis — histórico verificável',()=>{
  it('impede registros de venda não ganha e vazamento entre workspaces',()=>{
    const store=storage()
    expect(()=>upsertWonSale('ws-A',lead('1','ws-A','active'),input,store)).toThrow(/Somente vendas ganhas/)
    expect(()=>upsertWonSale('ws-B',lead('1','ws-A'),input,store)).toThrow(/workspace/)
    expect(readWonSales('ws-A',store)).toHaveLength(0)
  })
  it('mantém uma análise por negócio, inclusive depois de editar',()=>{
    const store=storage()
    upsertWonSale('ws-A',lead('1'),input,store)
    upsertWonSale('ws-A',lead('1'),{...input,trigger:'Abertura de filial'},store)
    expect(readWonSales('ws-A',store)).toHaveLength(1)
    expect(readWonSales('ws-A',store)[0].trigger).toBe('Abertura de filial')
    expect(readWonSales('ws-B',store)).toHaveLength(0)
  })
  it('trata hipóteses separadamente da receita documentada',()=>{
    const store=storage()
    upsertWonSale('ws-A',lead('1'),input,store)
    upsertWonSale('ws-A',lead('2'),{...input,evidence:'hypothesis',trigger:'Nova exigência regulatória'},store)
    const result=analyzeWonSales([lead('1'),lead('2'),lead('3')],readWonSales('ws-A',store))
    expect(result).toMatchObject({wonCount:3,documented:2,confirmed:1,hypotheses:1,unrecorded:1,totalDocumentedRevenue:15000})
    expect(result.patterns.find(p=>p.trigger==='Nova exigência regulatória')?.revenue).toBe(0)
    expect(result.patterns.find(p=>p.trigger==='Mudança de liderança')?.averageLagDays).toBeNull()
  })
  it('não confunde data de edição com data de fechamento',()=>{
    const store=storage()
    upsertWonSale('ws-A',lead('1'),input,store)
    const date='2026-04-10T09:00:00.000Z'
    expect(analyzeWonSales([lead('1')],readWonSales('ws-A',store),{'1':date}).patterns[0].averageLagDays).toBe(30)
  })
  it('exige acontecimento, data e evidência e rejeita fonte interna disfarçada de pública',()=>{
    expect(()=>validateWonSalesInput({...input,happenedAt:'2036-04-10'})).toThrow(/futuro/)
    expect(()=>validateWonSalesInput({...input,evidence:'public_source',evidenceUrl:'https://localhost/admin'})).toThrow()
    expect(()=>validateWonSalesInput({...input,evidence:'public_source',evidenceUrl:'http://empresa.example'})).toThrow()
    expect(validateWonSalesInput({...input,evidence:'public_source',evidenceUrl:'https://example.org/comunicado'}).trigger).toBe('Mudança de liderança')
    expect(()=>validateWonSalesInput({...input,discoveredAt:'2025-01-01'})).toThrow(/anterior/)
    expect(()=>validateWonSalesInput({...input,whyUs:'  '})).toThrow()
  })
  it('ignora registros de vendas que não estão mais ganhas',()=>{
    const store=storage()
    upsertWonSale('ws-A',lead('1'),input,store)
    const result=analyzeWonSales([lead('1','ws-A','active')],readWonSales('ws-A',store))
    expect(result).toMatchObject({wonCount:0,documented:0,confirmed:0})
  })
})
