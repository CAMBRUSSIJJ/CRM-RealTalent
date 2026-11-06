import type { Team, TeamMembership } from '../../domain/types'

export const DEFAULT_TEAM_COLOR = '#356AE6'
export const TEAM_COLORS = ['#356AE6','#237DB7','#169C83','#4F9F52','#8256D0','#C06A98','#E98A36','#66788A']

export type TeamDraft = {
  name:string
  description:string
  leaderId:string
  color:string
  selected:string[]
}
export function initialTeamDraft(team:Team|null,memberships:TeamMembership[]):TeamDraft {
  return {
    name:team?.name??'',description:team?.description??'',leaderId:team?.leaderId??'',
    color:team?.color??DEFAULT_TEAM_COLOR,
    selected:team?[...new Set(memberships.filter(item=>item.teamId===team.id).map(item=>item.userId))]:[],
  }
}
export function teamDraftKey(d:TeamDraft):string{
  return JSON.stringify({
    name:d.name.trim(),
    description:d.description.trim(),
    leaderId:d.leaderId,
    color:d.color.toLowerCase(),
    selected:[...d.selected].sort(),
  })
}
export function addTeamMember(d:TeamDraft,id:string):TeamDraft{
  return {...d,selected:d.selected.includes(id)?d.selected:[...d.selected,id]}
}
export function removeTeamMember(d:TeamDraft,id:string):TeamDraft{
  return {...d,selected:d.selected.filter(memberId=>memberId!==id),
    leaderId:d.leaderId===id?'':d.leaderId}
}
export function toggleTeamLeader(d:TeamDraft,id:string):TeamDraft{
  if(!d.selected.includes(id))return d
  return {...d,leaderId:d.leaderId===id?'':id}
}
export function validTeamDraft(d:TeamDraft):boolean{
  return Boolean(d.name.trim()) && (!d.leaderId || d.selected.includes(d.leaderId))
}
