import {describe,it,expect} from 'vitest'
import {guardInvestigationPresentationG55,hasConfirmedInvestigationEvidenceG55} from './prospecting-g55-presentation'

const legacy={
  summary:'A empresa oferece cortes de cabelo',
  hypotheses:['Pode investir em marketing'],
  questions:['Quais serviços oferece?'],
  approach:'Ofereça serviços.',
  pageRead:false,
  quality:'origin_only',
  candidateEvents:[],
  sources:[] as Array<{url:string;reading:'page'|'snippet';identity:'compatible'|'partial'|'unconfirmed'}>,
}
describe('G5.5: apresentação protegida contra respostas antigas',()=>{
  it('oculta hipóteses e perguntas quando o backend retorna apenas cadastro',()=>{
    const result=guardInvestigationPresentationG55(legacy)
    expect(result.summary).toContain('Nenhuma página pública')
    expect(result.hypotheses).toEqual([])
    expect(result.questions).toEqual([])
    expect(result.approach).toBe('')
    expect(legacy.hypotheses).toEqual(['Pode investir em marketing'])
  })
  it('não transforma snippets ou identidade parcial em evidência confirmada',()=>{
    const result=guardInvestigationPresentationG55({...legacy,pageRead:true,quality:'page_reviewed',sources:[
      {url:'https://example.com',reading:'page' as const,identity:'partial' as const},
      {url:'https://example.com/snippet',reading:'snippet' as const,identity:'compatible' as const},
    ]})
    expect(hasConfirmedInvestigationEvidenceG55(result)).toBe(false)
    expect(result.hypotheses).toEqual([])
  })
  it('preserva análise e hipóteses quando há fonte efetivamente confirmada',()=>{
    const original={...legacy,pageRead:true,quality:'page_reviewed',sources:[
      {url:'https://www.furg.br/',reading:'page' as const,identity:'compatible' as const},
    ]}
    expect(hasConfirmedInvestigationEvidenceG55(original)).toBe(true)
    expect(guardInvestigationPresentationG55(original)).toEqual(original)
  })
  it('não promove resultados com status de leitura falso',()=>{
    const result=guardInvestigationPresentationG55({...legacy,quality:'page_reviewed',sources:[
      {url:'https://www.furg.br',reading:'page' as const,identity:'compatible' as const},
    ]})
    expect(result.questions).toEqual([])
  })
})
