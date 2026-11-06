import {describe,expect,it} from 'vitest'
import {addTeamMember,initialTeamDraft,removeTeamMember,teamDraftKey,toggleTeamLeader,validTeamDraft} from './team-editor-state'
import type {Team,TeamMembership} from '../../domain/types'

const team={id:'team-a',workspaceId:'ws-1',name:'Comercial Sul',description:'Vendas',leaderId:'user-1',
  color:'#356AE6',active:true,createdAt:'2026-01-01',updatedAt:'2026-01-01'} as Team
const memberships=[
  {id:'m1',teamId:'team-a',userId:'user-1'},
  {id:'m2',teamId:'team-a',userId:'user-2'},
  {id:'m3',teamId:'team-b',userId:'user-3'}
] as TeamMembership[]

describe('Editor de Equipes — estados operacionais',()=>{
  it('carrega somente integrantes da equipe e mantém sua liderança',()=>{
    const draft=initialTeamDraft(team,memberships)
    expect(draft.selected).toEqual(['user-1','user-2'])
    expect(draft.leaderId).toBe('user-1')
    expect(validTeamDraft(draft)).toBe(true)
  })
  it('evita líder fora da equipe e revoga liderança quando ele é removido',()=>{
    const draft=initialTeamDraft(team,memberships)
    expect(toggleTeamLeader(draft,'user-3')).toBe(draft)
    const next=removeTeamMember(draft,'user-1')
    expect(next.leaderId).toBe('')
    expect(next.selected).toEqual(['user-2'])
    expect(validTeamDraft(next)).toBe(true)
    const promoted=toggleTeamLeader(next,'user-2')
    expect(promoted.leaderId).toBe('user-2')
    expect(toggleTeamLeader(promoted,'user-2').leaderId).toBe('')
    expect(validTeamDraft({...next,leaderId:'user-3'})).toBe(false)
  })
  it('a seleção é idempotente e não exibe alterações por reordenar membros',()=>{
    const draft=initialTeamDraft(team,memberships)
    expect(addTeamMember(draft,'user-2').selected).toHaveLength(2)
    const chosen=addTeamMember(draft,'user-4')
    expect(chosen.selected).toHaveLength(3)
    expect(teamDraftKey({...draft,selected:[...draft.selected].reverse()})).toBe(teamDraftKey(draft))
  })
  it('identidade vazia impede envio; descrição aparada não acusa mudança inexistente',()=>{
    const draft=initialTeamDraft(null,[])
    expect(validTeamDraft(draft)).toBe(false)
    expect(validTeamDraft({...draft,name:'Equipe de Projetos'})).toBe(true)
    expect(teamDraftKey({...draft,name:' Equipe ',description:'   '})).toBe(
      teamDraftKey({...draft,name:'Equipe',description:''}))
  })
})
