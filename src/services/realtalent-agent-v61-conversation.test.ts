import {describe,expect,it} from 'vitest'
import {isCommercialScriptRequest} from './realtalent-agent-v41-scripts'
import {isConversationalPrompt} from './realtalent-agent-v54-chat'
import {appendAgentConversationTurn,parseAgentConversationTurns} from './realtalent-agent-v4-conversation'
describe('Agent V6.1 — no repeated generic script and fluid writing',()=>{
  it('normal consultations about sales approaches should not trigger Script Studio',()=>{
    expect(isCommercialScriptRequest('Me ajude a entender qual abordagem é melhor para jardineiros')).toBe(false)
    expect(isCommercialScriptRequest('Quero conversar sobre uma abordagem comercial')).toBe(false)
    expect(isConversationalPrompt('Quero conversar sobre uma abordagem comercial')).toBe(true)
  })
  it('creative content is allowed in chat, but real CRM mutations are excluded',()=>{
    expect(isConversationalPrompt('Crie uma abordagem mais humana para jardinagem')).toBe(true)
    expect(isConversationalPrompt('crie uma tarefa no CRM')).toBe(false)
    expect(isCommercialScriptRequest('Crie um roteiro de ligação para jardinagem')).toBe(true)
  })
  it('preserves newlines from multi-paragraph answers during session recovery',()=>{
    const one=appendAgentConversationTurn([],'Qual a melhor estratégia?','Primeira etapa.\n\nSegunda etapa.')
    expect(one[0].assistant).toBe('Primeira etapa.\n\nSegunda etapa.')
    expect(parseAgentConversationTurns(JSON.parse(JSON.stringify(one)))[0].assistant).toContain('\n\n')
  })
})
