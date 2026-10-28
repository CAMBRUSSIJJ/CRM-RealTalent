import {describe,it,expect} from 'vitest'
import type {AgentWorkDocument} from './realtalent-agent-v53-work'
import {
  agentMemoryScope,emptyAgentMemory,newMemoryThread,
  saveMemoryTurn,removeMemoryThread,saveMemoryPreference,removeMemoryPreference,
  archiveMemoryDocument,removeMemoryDocument,relevantAgentMemory,
  loadAgentMemory,persistAgentMemory,
} from './realtalent-agent-v64-memory'
const store=()=>{
  const map=new Map<string,string>()
  return {getItem:(key:string)=>map.get(key)||null,
    setItem:(key:string,val:string)=>{map.set(key,val)},removeItem:(key:string)=>{map.delete(key)}}
}
describe('Agent V6.4 local opt-in memory and scoped history',()=>{
  it('does not store history for anonymous, unknown or unauthenticated users',()=>{
    expect(agentMemoryScope('w','u')).toContain('agent-memory:v64')
    expect(agentMemoryScope('w',null)).toBeNull()
    expect(agentMemoryScope('unknown','u')).toBeNull()
    expect(persistAgentMemory(null,emptyAgentMemory(),store())).toBe(false)
  })
  it('stores threads durably per workspace and user and allows deletion',()=>{
    const s=store(),thread=newMemoryThread()
    const mem=saveMemoryTurn(emptyAgentMemory(),thread.id,[
      {user:'Crie uma estratégia para jardinagem',assistant:'Uma estratégia consultiva começa com diagnóstico.'},
      {user:'Agora mais detalhado',assistant:'Considere segmentação e proposta de valor.'}])
    expect(persistAgentMemory(agentMemoryScope('w1','u1'),mem,s)).toBe(true)
    expect(loadAgentMemory(agentMemoryScope('w1','u1'),s).threads[0].turns).toHaveLength(2)
    expect(loadAgentMemory(agentMemoryScope('w2','u1'),s).threads).toHaveLength(0)
    expect(loadAgentMemory(agentMemoryScope('w1','u2'),s).threads).toHaveLength(0)
    const cleared=removeMemoryThread(mem,thread.id)
    persistAgentMemory(agentMemoryScope('w1','u1'),cleared,s)
    expect(loadAgentMemory(agentMemoryScope('w1','u1'),s).threads).toHaveLength(0)
  })
  it('saves preferences only after explicit user confirmation; rejects likely credentials',()=>{
    const base=emptyAgentMemory()
    expect(base.preferences).toEqual([])
    const saved=saveMemoryPreference(base,'Prefiro respostas curtas e consultivas')!
    expect(saved.preferences).toHaveLength(1)
    expect(relevantAgentMemory('escreva um roteiro',saved)).toContain('respostas curtas')
    expect(saveMemoryPreference(saved,'Prefiro respostas curtas e consultivas')).toBeNull()
    expect(saveMemoryPreference(saved,'API key = abcdefgpassword')).toBeNull()
    expect(removeMemoryPreference(saved,saved.preferences[0].id).preferences).toHaveLength(0)
  })
  it('recovers relevant older chats without mixing an unrelated conversation',()=>{
    const old=saveMemoryTurn(emptyAgentMemory(),'old',[{user:'Precificação de jardinagem e margem',
      assistant:'Margem de contribuição considera impostos e custos variáveis.'}])
    const other=saveMemoryTurn(old,'current',[{user:'Vamos falar de equipes',
      assistant:'Acompanhamento de tarefas'}])
    const retrieved=relevantAgentMemory('precificação jardinagem',other,'current')
    expect(retrieved).toContain('Margem de contribuição')
    expect(retrieved).not.toContain('Acompanhamento de tarefas')
  })
  it('archives revisions of a document, finds them and supports deletion',()=>{
    const doc:AgentWorkDocument={
      id:'doc-1',title:'Plano de jardinagem',kind:'script',channel:'meeting',leadId:null,
      body:'Plano comercial para jardinagem e condomínios.',updatedAt:new Date().toISOString(),
      revisions:[{id:'r1',requested:'crie plano',body:'Plano comercial para jardinagem e condomínios.',createdAt:new Date().toISOString()}]
    }
    const archived=archiveMemoryDocument(emptyAgentMemory(),doc)
    expect(archived.documents).toHaveLength(1)
    expect(relevantAgentMemory('jardinagem condomínios',archived)).toContain('Plano comercial')
    expect(removeMemoryDocument(archived,doc.id).documents).toHaveLength(0)
  })
  it('ignores corrupted saved data',()=>{
    const s=store(),scope=agentMemoryScope('a','b')!
    s.setItem(scope,'{invalid')
    expect(loadAgentMemory(scope,s)).toEqual(emptyAgentMemory())
  })
})
