import { getSupabaseClient } from '../lib/supabase'

export type MeetStatus = 'scheduled' | 'live' | 'completed' | 'cancelled'
export type MeetMode = 'local' | 'supabase'
export type MeetSettings = { waitingRoom: boolean; chat: boolean; screenShare: boolean; maxPeers: number }
export interface MeetRoom {
  id: string
  workspaceId: string
  createdBy: string
  title: string
  agenda: string
  startsAt: string
  endsAt: string
  status: MeetStatus
  publicToken: string
  hostName: string
  leadId: string | null
  contactId: string | null
  companyId: string | null
  opportunityId: string | null
  settings: MeetSettings
  createdAt: string
  updatedAt: string
}
export interface PublicMeetRoom {
  id: string
  title: string
  agenda: string
  startsAt: string
  endsAt: string
  status: MeetStatus
  publicToken: string
  hostName: string
  settings: MeetSettings
}
export type NewMeetRoom = {
  workspaceId: string
  createdBy: string
  title: string
  agenda: string
  startsAt: string
  endsAt: string
  hostName: string
  leadId?: string | null
  contactId?: string | null
  companyId?: string | null
  opportunityId?: string | null
}
const key = 'realtalent:meet:v1:rooms'
const defaults: MeetSettings = { waitingRoom: false, chat: true, screenShare: true, maxPeers: 4 }
const settingsFor = (input: unknown): MeetSettings => {
  const row = (input || {}) as Partial<MeetSettings>
  return { waitingRoom: Boolean(row.waitingRoom), chat: row.chat !== false, screenShare: row.screenShare !== false, maxPeers: Math.max(2,Math.min(6,Number(row.maxPeers)||4)) }
}
const fromDb = (row: any): MeetRoom => ({
  id: String(row.id), workspaceId: String(row.organization_id), createdBy: String(row.created_by),
  title: String(row.title || 'Reunião'), agenda: String(row.agenda || ''), startsAt: String(row.starts_at),
  endsAt: String(row.ends_at), status: row.status as MeetStatus, publicToken: String(row.public_token),
  hostName: String(row.host_name || 'Anfitrião'), leadId: row.lead_id || null,
  contactId: row.contact_id || null, companyId: row.company_id || null, opportunityId: row.opportunity_id || null,
  settings: settingsFor(row.settings), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
})
const fromLocal = (): MeetRoom[] => {
  try {
    const rows: unknown = JSON.parse(window.localStorage.getItem(key) || '[]')
    return Array.isArray(rows) ? rows as MeetRoom[] : []
  } catch { return [] }
}
const writeLocal = (rooms: MeetRoom[]) => { window.localStorage.setItem(key,JSON.stringify(rooms.slice(0,300))) }
const api = () => {
  const client = getSupabaseClient()
  if (!client) throw new Error('Conexão do Supabase indisponível.')
  return client as any
}
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2,'0')).join('')
export const meetUrl = (token: string) => window.location.origin + '/?rt-meet=' + encodeURIComponent(token)

export async function listMeetRooms(workspaceId: string, mode: MeetMode): Promise<MeetRoom[]> {
  if (mode === 'local') return fromLocal().filter(x => x.workspaceId === workspaceId).sort((a,b)=>b.startsAt.localeCompare(a.startsAt))
  const { data,error } = await api().from('realtalent_meet_rooms').select('*').eq('organization_id',workspaceId).order('starts_at',{ascending:false}).limit(200)
  if (error) throw error
  return (data || []).map(fromDb)
}
export async function createMeetRoom(input: NewMeetRoom, mode: MeetMode): Promise<MeetRoom> {
  if (!input.title.trim()) throw new Error('Informe um título para a reunião.')
  if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) throw new Error('O horário final deve ser posterior ao início.')
  const token = newToken()
  const now = new Date().toISOString()
  if(mode === 'local'){
    const room: MeetRoom = { id: crypto.randomUUID(), workspaceId: input.workspaceId, createdBy: input.createdBy, title: input.title.trim(), agenda: input.agenda.trim(), startsAt: input.startsAt, endsAt: input.endsAt, status: 'scheduled', publicToken: token, hostName: input.hostName, leadId: input.leadId || null, contactId: input.contactId || null, companyId: input.companyId || null, opportunityId: input.opportunityId || null, settings: defaults, createdAt: now, updatedAt: now }
    writeLocal([room,...fromLocal()])
    return room
  }
  const { data,error } = await api().from('realtalent_meet_rooms').insert({
    organization_id: input.workspaceId, created_by: input.createdBy, title: input.title.trim(),
    agenda: input.agenda.trim(), starts_at: input.startsAt, ends_at: input.endsAt,
    public_token: token, host_name: input.hostName, lead_id: input.leadId || null, contact_id: input.contactId || null, company_id: input.companyId || null, opportunity_id: input.opportunityId || null, settings: defaults,
  }).select('*').single()
  if(error) throw error
  return fromDb(data)
}
export async function changeMeetRoom(room: MeetRoom, status: MeetStatus, mode: MeetMode): Promise<MeetRoom> {
  const updatedAt = new Date().toISOString()
  if(mode === 'local'){
    const next = {...room,status,updatedAt}
    writeLocal(fromLocal().map(x => x.id === room.id ? next : x))
    return next
  }
  const { data,error } = await api().from('realtalent_meet_rooms').update({status}).eq('id',room.id).eq('organization_id',room.workspaceId).select('*').single()
  if(error) throw error
  return fromDb(data)
}
export async function deleteMeetRoom(room: MeetRoom, mode: MeetMode): Promise<void> {
  if(mode === 'local'){ writeLocal(fromLocal().filter(x=>x.id!==room.id)); return }
  const { error } = await api().from('realtalent_meet_rooms').delete().eq('id',room.id).eq('organization_id',room.workspaceId)
  if(error) throw error
}
export async function getPublicMeetRoom(publicToken: string): Promise<PublicMeetRoom | null> {
  const local = fromLocal().find(x => x.publicToken === publicToken)
  if(local) return {id:local.id,title:local.title,agenda:local.agenda,startsAt:local.startsAt,endsAt:local.endsAt,status:local.status,publicToken:local.publicToken,hostName:local.hostName,settings:settingsFor(local.settings)}
  const client = getSupabaseClient()
  if(!client)return null
  const {data,error} = await (client as any).rpc('get_public_realtalent_meet_room',{p_token:publicToken})
  if(error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if(!row) return null
  return { id: String(row.id), title:String(row.title || 'Reunião'), agenda:String(row.agenda || ''), startsAt:String(row.starts_at), endsAt:String(row.ends_at),status:row.status as MeetStatus,publicToken:String(row.public_token),hostName:String(row.host_name || 'Anfitrião'),settings:settingsFor(row.settings) }
}
