import { useEffect, useState } from 'react'
import { Save, UsersRound } from 'lucide-react'
import { Modal } from '../../components/ui/modal'
import { Button } from '../../components/ui/button'
import { NativeSelectionSelect } from '../../components/selection'
import type { Team, TeamMembership, WorkspaceMember } from '../../domain/types'
import type { TeamInput } from '../../services/work-management'

interface Props {
  open: boolean
  team: Team | null
  memberships: TeamMembership[]
  members: WorkspaceMember[]
  loading?: boolean
  onClose(): void
  onSubmit(input: TeamInput): Promise<void>
}

export function TeamModal({ open, team, memberships, members, loading = false, onClose, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [leaderId, setLeaderId] = useState('')
  const [color, setColor] = useState('#356AE6')
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setName(team?.name ?? '')
    setDescription(team?.description ?? '')
    setLeaderId(team?.leaderId ?? '')
    setColor(team?.color ?? '#356AE6')
    setSelected(team ? memberships.filter((item) => item.teamId === team.id).map((item) => item.userId) : [])
  }, [memberships, open, team])

  const toggle = (userId: string) => setSelected((items) => items.includes(userId) ? items.filter((item) => item !== userId) : [...items, userId])
  const submit = async () => onSubmit({ id: team?.id, name, description, leaderId: leaderId || null, color, memberIds: selected })

  return <Modal open={open} size="lg" title={team ? 'Editar equipe' : 'Nova equipe'} subtitle="Organize liderança, membros e capacidade operacional do time." onClose={onClose}
    footer={<><span className="modal__footer-spacer"/><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={loading} onClick={() => void submit()}><Save size={16}/> Salvar equipe</Button></>}>
    <div className="work-team-modal">
      <section className="work-form-section"><header><UsersRound size={18}/><div><strong>Identidade da equipe</strong><small>Use um nome claro e uma descrição curta do papel do time.</small></div></header>
        <div className="form-grid"><label className="form-field form-field--full"><span>Nome</span><input value={name} onChange={(event)=>setName(event.target.value)} placeholder="Ex.: Comercial Sul"/></label><label className="form-field form-field--full"><span>Descrição</span><textarea rows={3} value={description} onChange={(event)=>setDescription(event.target.value)} placeholder="Responsabilidades, região ou segmento atendido..."/></label><label className="form-field"><span>Líder</span><NativeSelectionSelect value={leaderId} onChange={(event)=>setLeaderId(event.target.value)}><option value="">Sem líder definido</option>{members.map((member)=><option key={member.userId} value={member.userId}>{member.displayName}</option>)}</NativeSelectionSelect></label><label className="form-field"><span>Cor</span><input type="color" value={color} onChange={(event)=>setColor(event.target.value)}/></label></div>
      </section>
      <section className="work-form-section"><header><UsersRound size={18}/><div><strong>Membros</strong><small>Selecione as pessoas que pertencem a esta equipe.</small></div></header><div className="work-member-picker">{members.map((member)=>{const active=selected.includes(member.userId);return <button type="button" key={member.userId} className={active?'is-selected':''} aria-pressed={active} onClick={()=>toggle(member.userId)}><span className="avatar avatar--small">{member.displayName.slice(0,1).toUpperCase()}</span><div><strong>{member.displayName}</strong><small>{member.email} · {member.role}</small></div><span className="work-member-picker__state">{active?'Selecionado':'Adicionar'}</span></button>})}</div></section>
    </div>
  </Modal>
}
