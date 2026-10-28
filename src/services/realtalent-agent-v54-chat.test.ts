import {describe,expect,it,vi} from 'vitest'
import {answerConversationalPrompt,isConversationalPrompt} from './realtalent-agent-v54-chat'
describe('V5.4 — diálogo livre com integridade das operações CRM',()=>{
  it('aceita perguntas livres, inclusive consultoria de serviços',()=>{
    expect(isConversationalPrompt('Como posso abordar jardineiros autônomos?')).toBe(true)
    expect(isConversationalPrompt('Qual a melhor abordagem para um autônomo?')).toBe(true)
    expect(isConversationalPrompt('Me explique a diferença entre serviço e produto')).toBe(true)
  })
  it('não intercepta escrita ou consultas comerciais com dados do CRM',()=>{
    expect(isConversationalPrompt('crie uma tarefa para amanhã')).toBe(false)
    expect(isConversationalPrompt('quais oportunidades estão em risco no meu pipeline?')).toBe(false)
    expect(isConversationalPrompt('salve esse roteiro nos playbooks')).toBe(false)
  })
  it('passa o histórico ao modelo sem alterar CRM',async()=>{
    const provider=vi.fn(async(_prompt:string,_history:string)=>({text:'Uma estratégia é investigar as necessidades antes de recomendar uma solução.',model:'qwen'}))
    const result=await answerConversationalPrompt('Qual a melhor abordagem para jardineiros?',{conversationContext:'Usuário: jardinagem\nRealTalent: contexto'},provider)
    expect(provider).toHaveBeenCalledWith('Qual a melhor abordagem para jardineiros?','Usuário: jardinagem\nRealTalent: contexto')
    expect(result?.text).toContain('investigar as necessidades')
    expect(result?.plan).toBeUndefined()
  })
  it('na ausência de Ollama não inventa uma pesquisa ou resposta do modelo',async()=>{
    const result=await answerConversationalPrompt('Me explique marketing de serviços',{},async()=>null)
    expect(result?.title).toBe('Conversa indisponível')
    expect(result?.text).toContain('Ollama')
  })
})
