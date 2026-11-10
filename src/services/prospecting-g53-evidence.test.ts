import {describe,expect,it} from 'vitest'
import {groupInvestigationSourcesG53,type InvestigationSourceG53} from './prospecting-g53-evidence'
const source=(url:string,overrides:Partial<InvestigationSourceG53>={}):InvestigationSourceG53=>({
  title:'Instituição',url,reading:'page',identity:'compatible',origin:'pesquisa',excerpt:'Texto público.',...overrides,
})
describe('G5.3 — agrupamento de fontes na revisão',()=>{
  it('agrupa variantes da mesma instituição sem contar domínios repetidos',()=>{
    const grouped=groupInvestigationSourcesG53([
      source('https://www.furg.br/?v=1.0.24',{engine:'legacy'}),
      source('https://www.furg.br/',{engine:'crawl4ai'}),
      source('https://www.furg.br/en/',{engine:'legacy'}),
      source('https://pt.wikipedia.org/wiki/Universidade_Federal_do_Rio_Grande',{engine:'legacy'}),
    ])
    expect(grouped).toHaveLength(2)
    expect(grouped[0].domain).toBe('furg.br')
    expect(grouped[0].count).toBe(3)
    expect(grouped[0].primary.engine).toBe('crawl4ai')
    expect(grouped[0].urls).toHaveLength(3)
  })
  it('prioriza leitura compatível sobre snippet ou identidade não confirmada',()=>{
    const grouped=groupInvestigationSourcesG53([
      source('https://www.furg.br/',{reading:'snippet',identity:'unconfirmed',engine:'legacy'}),
      source('https://www.furg.br/noticia',{reading:'page',identity:'compatible',engine:'crawl4ai'}),
    ])
    expect(grouped).toHaveLength(1)
    expect(grouped[0].primary.url).toContain('/noticia')
  })
  it('não aceita links inválidos nem altera a classificação original',()=>{
    const unverified=source('https://example.org/',{identity:'unconfirmed'})
    const grouped=groupInvestigationSourcesG53([unverified,source('http://localhost/')])
    expect(grouped).toHaveLength(1)
    expect(grouped[0].primary.identity).toBe('unconfirmed')
    expect(unverified.identity).toBe('unconfirmed')
  })
})
