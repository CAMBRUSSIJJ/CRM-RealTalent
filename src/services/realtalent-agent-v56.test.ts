import {describe,expect,it,vi} from 'vitest'
import {requestsExternalResearch,requestsFormatting} from './realtalent-agent-v56-intents'
import {formatWorkDocument} from './realtalent-agent-v56-format'
import {answerExternalResearch} from './realtalent-agent-v56-research'
import {reviseAgentWork} from './realtalent-agent-v53-editor'
import {workFromAnswer} from './realtalent-agent-v53-work'
import type {AssistantAnswer} from './realtalent-assistant'
import type {WorkspaceSnapshot} from '../domain/types'
const base:AssistantAnswer={
  id:'test',intent:'crm_capability',title:'Script',text:'',items:[],facts:[],suggestedPrompts:[],
  generatedAt:new Date().toISOString(),toolOutput:{kind:'script',title:'Script',
    body:'ABERTURA\nPerguntar sobre serviço e objetivo\n\nDIAGNÓSTICO\nEntender a dor e escutar\n\nPRÓXIMO PASSO\nConfirmar retorno',
    channel:'call',leadId:null,grounded:false},
}
const work=workFromAnswer(base,'crie o roteiro')!
const snap={workspace:{id:'test',role:'member'},leads:[],playbooks:[]} as unknown as WorkspaceSnapshot
describe('Agent V5.6 pesquisa, reformatação e contexto',()=>{
  it('pedido por scripts Thiago Reis é pesquisa, não revisão do script antigo',()=>{
    expect(requestsExternalResearch('tu consegue copiar o script do Thiago Reis para vendas')).toBe(true)
    expect(requestsExternalResearch('pesquise materiais da Growth Machine')).toBe(true)
    expect(requestsExternalResearch('crie tarefa para o Thiago Reis')).toBe(false)
  })
  it('transformação em tabela não necessita de LLM e preserva documento',()=>{
    expect(requestsFormatting('mude o formato do texto para tabela')).toBe('table')
    const a=formatWorkDocument('transforme em tabela',work)
    expect(a?.toolOutput?.kind==='script'?a.toolOutput.body:'').toContain('| --- | --- |')
    expect(work.body).toContain('ABERTURA')
    expect(a?.id).toContain('work-edit:')
  })
  it('lista e texto corrido independem do serviço de revisão',()=>{
    expect(formatWorkDocument('coloque em tópicos',work)?.toolOutput?.kind).toBe('script')
    expect(formatWorkDocument('transforme em texto corrido',work)?.toolOutput?.kind).toBe('script')
  })
  it('aceita resposta curta válida de edição via modelo',async()=>{
    const fake=vi.fn(async()=>({ok:true,json:async()=>({ok:true,body:'Mensagem curta de jardinagem.'})} as Response))
    const result=await reviseAgentWork('resuma para WhatsApp',work,snap,{},fake)
    expect(result.id.startsWith('work-edit:')).toBe(true)
    expect(result.toolOutput?.kind==='script'&&result.toolOutput.body).toBe('Mensagem curta de jardinagem.')
  })
  it('pesquisa sem SearXNG retorna indisponível em vez de atribuir texto a autor',async()=>{
    const fake=vi.fn(async()=>({ok:false,json:async()=>({ok:false,error:'search_not_configured'})} as Response))
    const a=await answerExternalResearch('busque scripts Thiago Reis',{},fake)
    expect(a?.title).toBe('Pesquisa indisponível')
    expect(a?.researchSources).toBeUndefined()
  })
  it('pesquisa com fontes retorna urls verificadas e nunca fake localhost',async()=>{
    const fake=vi.fn(async()=>({ok:true,json:async()=>({ok:true,
      answer:'Uma abordagem consultiva [1] pode ser adaptada.',sources:[
        {title:'Fonte pública',url:'https://example.com/guia',excerpt:'Métodos'},
        {title:'Inválida',url:'http://127.0.0.1/admin'},
      ]})} as Response))
    const a=await answerExternalResearch('pesquise scripts do Thiago Reis',{},fake)
    expect(a?.researchSources).toHaveLength(1)
    expect(a?.researchSources?.[0].url).toBe('https://example.com/guia')
  })
})
