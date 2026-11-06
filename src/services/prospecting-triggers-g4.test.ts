import {describe,it,expect} from 'vitest'
import {
  appendTriggerCandidatesG4,getTriggerSourceFromProspectG4,
  readTriggerReviewsG4,reviewTriggerG4,type TriggerCandidateG4,type TriggerSourceG4,
} from './prospecting-triggers-g4'
import type {ProspectRecord} from './prospecting-workspace'

const input:TriggerSourceG4={
  company:'Escola Horizonte',city:'Rio Grande',sector:'Educação',
  sourceUrl:'https://exemplo.org/nota/dir',
  excerpt:'A Escola Horizonte anunciou a nomeação de uma nova diretoria em novembro de 2026, iniciando um plano de expansão.',
}
const candidate:TriggerCandidateG4={
  category:'transition',event:'Nomeação da diretoria',
  quote:'A Escola Horizonte anunciou a nomeação de uma nova diretoria',
  dateQuote:'novembro de 2026',hypothesis:'Possíveis novas demandas de treinamento.',
  rationale:'Mudanças de liderança podem mudar prioridades.',suggestedQuestion:'Há novos objetivos?',
  status:'needs_review',sourceUrl:input.sourceUrl,sourceCheck:'not_verified',investigationPriority:60,
}
const prospect=(id='p1',ws='ws-a')=>({
  id,workspaceId:ws,name:'Escola Horizonte',company:'Escola Horizonte',city:'Rio Grande',rawData:{}
}) as ProspectRecord
const makeStore=()=>{
  const map=new Map<string,string>()
  return {getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>void map.set(k,v)}
}
describe('G4 — revisão humana do Garimpo',()=>{
  it('mantém candidatos por workspace e preserva decisão sem envio ao CRM',()=>{
    const store=makeStore()
    expect(appendTriggerCandidatesG4('ws-a',prospect(),[candidate],input,store)).toHaveLength(1)
    expect(readTriggerReviewsG4('ws-a',store)).toHaveLength(1)
    expect(readTriggerReviewsG4('ws-b',store)).toHaveLength(0)
    expect(appendTriggerCandidatesG4('ws-a',prospect(),[candidate],input,store)).toHaveLength(0)
    const id=readTriggerReviewsG4('ws-a',store)[0].id
    expect(()=>reviewTriggerG4('ws-a','p1',id,'approved',false,'',store))
      .toThrow(/Confira a fonte original/)
    const approved=reviewTriggerG4('ws-a','p1',id,'approved',true,'Fonte conferida na publicação.',store)
    expect(approved.reviewStatus).toBe('approved')
    expect(approved.sourceConfirmed).toBe(true)
    expect(readTriggerReviewsG4('ws-a',store)[0].reviewStatus).toBe('approved')
  })
  it('rejeita alteração com fonte diferente ou citação inventada',()=>{
    const store=makeStore()
    expect(appendTriggerCandidatesG4('ws-a',prospect(),[
      {...candidate,sourceUrl:'https://outro-site.org/fonte'}
    ],input,store)).toEqual([])
    expect(appendTriggerCandidatesG4('ws-a',prospect(),[
      {...candidate,quote:'A empresa fechou três unidades na cidade'}
    ],input,store)).toEqual([])
    expect(()=>appendTriggerCandidatesG4('ws-b',prospect(),[candidate],input,store))
      .toThrow(/fora do workspace/)
  })
  it('rejeição exige justificativa e não pode afetar outra empresa',()=>{
    const store=makeStore()
    appendTriggerCandidatesG4('ws-a',prospect(),[candidate],input,store)
    const id=readTriggerReviewsG4('ws-a',store)[0].id
    expect(()=>reviewTriggerG4('ws-a','p2',id,'rejected',false,'motivo',store)).toThrow()
    expect(()=>reviewTriggerG4('ws-a','p1',id,'rejected',false,'',store))
      .toThrow(/por que o sinal foi rejeitado/)
    const row=reviewTriggerG4('ws-a','p1',id,'rejected',false,'Notícia de outra empresa',store)
    expect(row.reviewStatus).toBe('rejected')
    expect(row.reviewerNote).toBe('Notícia de outra empresa')
  })
  it('extrai apenas URL e trecho vinculados à mesma origem',()=>{
    const withEvidence={...prospect(),rawData:{evidence:[
      {source:'https://fonte.org/noticia',value:'A empresa inaugurou uma segunda unidade comercial na cidade de Rio Grande nesta semana.'}
    ]}} as ProspectRecord
    expect(getTriggerSourceFromProspectG4(withEvidence).sourceUrl).toBe('https://fonte.org/noticia')
    expect(getTriggerSourceFromProspectG4(withEvidence).excerpt).toContain('segunda unidade')
    const vague={...prospect(),website:'https://empresa.org',description:'Empresa com 100 colaboradores'}
    expect(getTriggerSourceFromProspectG4(vague as ProspectRecord).excerpt).toBe('')
    expect(getTriggerSourceFromProspectG4(vague as ProspectRecord).sourceUrl).toBe('')
  })
})
