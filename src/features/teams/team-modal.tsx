import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, CalendarDays, Check, CheckCircle2, Clock3, Crown, ListTodo, Plus, Save, Search, UserRound, UsersRound, X } from 'lucide-react'
import { Modal } from '../../components/ui/modal'
import { Button } from '../../components/ui/button'
import type { Team, TeamMembership, WorkTask, WorkspaceMember } from '../../domain/types'
import type { TeamInput } from '../../services/work-management'
import { routeToHash } from '../../app/route-state'
import '../../styles/team-editor-drawer.css'

const DEFAULT_COLOR = '#356AE6'
const COLORS = ['#356AE6','#237DB7','#169C83','#4F9F52','#8256D0','#C06A98','#E98A36','#66788A']
type Draft = { name:string;description:string;leaderId:string;color:string;selected:string[] }

function initialDraft(team:Team|null,memberships:TeamMembership[]):Draft {
  return {
    name:team?.name??'',description:team?.description??'',leaderId:team?.leaderId??'',
    color:team?.color??DEFAULT_COLOR,
    selected:team? [...new Set(memberships.filter(m=>m.teamId===team.id).map(m=>m.userId))]:[],
  }
}
function serialize(d:Draft):string {
  return JSON.stringify({
    name:d.name.trim(),description:d.description.trim(),leaderId:d.leaderId,
    color:d.color.toLowerCase(),selected:[...d.selected].sort()
  })
}

interface Props {
  open:boolean
  team:Team|null
  memberships:TeamMembership[]
  members:WorkspaceMember[]
  tasks?:WorkTask[]
  loading?:boolean
  onClose():void
  onSubmit(input:TeamInput):Promise<void>
}

export function TeamModal({open,team,memberships,members,tasks=[],loading=false,onClose,onSubmit}:Props){
  const [draft,setDraft]=useState<Draft>(()=>initialDraft(team,memberships))
  const baseline=useRef(serialize(initialDraft(team,memberships)))
  const [search,setSearch]=useState('')
  const [adding,setAdding]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    if(!open)return
    const initial=initialDraft(team,memberships)
    setDraft(initial);baseline.current=serialize(initial)
    setSearch('');setAdding(false);setError('')
    // Deliberately reset only when a form is opened for another team.
    // Async membership refresh must not discard unsaved edits.
  },[open,team?.id])

  const dirty=serialize(draft)!==baseline.current
  const canSave=dirty && Boolean(draft.name.trim()) && !loading
    && (!draft.leaderId||draft.selected.includes(draft.leaderId))
  const selectedMembers=useMemo(()=>{
    const byId=new Map(members.map(member=>[member.userId,member]))
    return draft.selected.map(id=>byId.get(id)).filter((m):m is WorkspaceMember=>Boolean(m))
  },[members,draft.selected])
  const missingMemberCount=draft.selected.length-selectedMembers.length
  const candidates=useMemo(()=>{
    const query=search.trim().toLocaleLowerCase('pt-BR')
    return members.filter(m=>!draft.selected.includes(m.userId)&&
      (!query||[m.displayName,m.email].some(v=>v.toLocaleLowerCase('pt-BR').includes(query))))
  },[members,draft.selected,search])
  const activeTasks=tasks.filter(t=>['todo','in_progress','blocked'].includes(t.status))
  const overdue=activeTasks.filter(t=>t.dueAt && Number.isFinite(Date.parse(t.dueAt)) &&
    new Date(t.dueAt).getTime()<Date.now()).length
  const completed=tasks.filter(t=>t.status==='completed').length

  const patch=(value:Partial<Draft>)=>setDraft(d=>({...d,...value}))
  const chooseLeader=(userId:string)=>patch({leaderId:draft.leaderId===userId?'':userId})
  const removeMember=(userId:string)=>setDraft(d=>({
    ...d,selected:d.selected.filter(id=>id!==userId),
    leaderId:d.leaderId===userId?'':d.leaderId
  }))
  const addMember=(userId:string)=>setDraft(d=>({
    ...d,selected:d.selected.includes(userId)?d.selected:[...d.selected,userId]
  }))
  const close=()=>{
    if(loading)return
    if(dirty&&!window.confirm('Existem alterações não salvas nesta equipe. Deseja descartá-las?'))return
    onClose()
  }
  const submit=async()=>{
    if(!canSave)return
    setError('')
    try{
      await onSubmit({
        id:team?.id,name:draft.name.trim(),description:draft.description.trim(),
        leaderId:draft.leaderId||null,color:draft.color,memberIds:draft.selected
      })
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar a equipe.')}
  }
  const destination=team?routeToHash('tasks',{filter:'team:'+team.id}):''
  const newTask=team?routeToHash('tasks',{filter:'team:'+team.id,action:'new'}):''
  const preventDiscard=(event:React.MouseEvent<HTMLAnchorElement>)=>{
    if(loading || dirty&&!window.confirm('Descartar alterações não salvas para abrir Tarefas?'))event.preventDefault()
  }

  return <Modal open={open} size="xl" className="rt-team-edit-drawer"
    title={team?'Editar equipe':'Nova equipe'}
    subtitle={team?'Pessoas, liderança e atividades em um só lugar.':'Configure a identidade e os integrantes da nova equipe.'}
    onClose={close}
    footer={<div className="team-editor__footer">
      <span className="team-editor__save-state" role="status">
        {loading?'Salvando...':dirty?'Alterações não salvas':'Nenhuma alteração pendente'}
      </span>
      <Button type="button" variant="secondary" disabled={loading} onClick={close}>Cancelar</Button>
      <Button type="button" loading={loading} disabled={!canSave} onClick={()=>void submit()}>
        <Save size={16}/>{team?'Salvar alterações':'Criar equipe'}
      </Button>
    </div>}>
    <div className="team-editor">
      <section className="team-editor__section" aria-labelledby="team-editor-identity">
        <header><div><h3 id="team-editor-identity">Identidade da equipe</h3>
          <p>Informações visíveis para quem trabalha com a equipe.</p></div></header>
        <label className="team-editor__field"><span>Nome da equipe</span>
          <input data-autofocus autoFocus maxLength={120} value={draft.name}
            onChange={e=>patch({name:e.target.value})} placeholder="Ex.: Comercial Sul"/>
        </label>
        <label className="team-editor__field"><span>Descrição <small>opcional</small></span>
          <textarea rows={2} maxLength={850} value={draft.description}
            onChange={e=>patch({description:e.target.value})}
            placeholder="Responsabilidades, região ou segmento atendido..."/>
        </label>
        <div className="team-editor__palette" role="group" aria-label="Cor de identificação da equipe">
          <span>Cor de identificação</span>
          <div>{COLORS.map(c=><button type="button" key={c} aria-label={'Cor '+c}
            aria-pressed={draft.color.toLowerCase()===c.toLowerCase()}
            className={draft.color.toLowerCase()===c.toLowerCase()?'is-selected':''}
            style={{backgroundColor:c}} onClick={()=>patch({color:c})}>
            {draft.color.toLowerCase()===c.toLowerCase()?<Check size={15}/>:null}
          </button>)}
          <label className="team-editor__custom-color" title="Escolher cor personalizada">
            <span>Personalizar cor</span><input type="color" value={/^#[\da-f]{6}$/i.test(draft.color)?draft.color:DEFAULT_COLOR}
              onChange={e=>patch({color:e.target.value})}/>
          </label></div>
        </div>
        <div className="team-editor__leader-info">
          <Crown size={16}/><span><strong>Liderança:</strong> {selectedMembers.find(m=>m.userId===draft.leaderId)?.displayName??'Não definida'}
            <small>Defina ou altere o líder diretamente na lista de integrantes.</small></span>
        </div>
      </section>

      <section className="team-editor__section" aria-labelledby="team-editor-members">
        <header className="team-editor__members-head">
          <div><h3 id="team-editor-members">Integrantes <em>{draft.selected.length}</em></h3>
            <p>Selecione pessoas do workspace; liderança não altera o papel de acesso.</p>
          </div>
          <Button type="button" variant="secondary" onClick={()=>{setAdding(v=>!v);setSearch('')}}>
            {adding?<X size={15}/>:<Plus size={15}/>} {adding?'Fechar':'Adicionar'}
          </Button>
        </header>
        {selectedMembers.length?<div className="team-editor__members">
          {selectedMembers.map(member=><div key={member.userId} className="team-editor__member">
            <span className="team-editor__avatar" aria-hidden="true">{member.displayName.slice(0,1).toUpperCase()}</span>
            <div className="team-editor__member-info"><strong>{member.displayName}</strong><small>{member.email}</small>
              <span className="team-editor__role">{draft.leaderId===member.userId?'Líder da equipe':'Integrante'}</span>
            </div>
            <div className="team-editor__member-actions">
              <button type="button" aria-label={(draft.leaderId===member.userId?'Remover liderança de ':'Definir como líder ')+member.displayName}
                className={draft.leaderId===member.userId?'is-leader':''}
                onClick={()=>chooseLeader(member.userId)} title={draft.leaderId===member.userId?'Remover liderança':'Definir como líder'}>
                <Crown size={15}/><span>{draft.leaderId===member.userId?'Líder':'Tornar líder'}</span>
              </button>
              <button type="button" className="team-editor__remove" title="Remover integrante"
                aria-label={'Remover '+member.displayName+' da equipe'} onClick={()=>removeMember(member.userId)}><X size={16}/></button>
            </div>
          </div>)}
        </div>:<div className="team-editor__empty"><UsersRound size={19}/><span>Nenhum integrante selecionado. Adicione pessoas para organizar o trabalho.</span></div>}
        {missingMemberCount>0?<p className="team-editor__warning" role="status">
          {missingMemberCount} integrante(s) não estão disponíveis na lista atual do workspace.
          Suas vinculações foram preservadas para evitar remoção acidental.
        </p>:null}
        {adding?<div className="team-editor__picker">
          <label className="team-editor__search"><Search size={16}/>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              autoFocus placeholder="Buscar por nome ou e-mail..." aria-label="Buscar integrantes"/>
          </label>
          <div className="team-editor__picker-list">
            {candidates.map(member=><button type="button" key={member.userId}
              onClick={()=>addMember(member.userId)}>
              <span className="team-editor__avatar"><UserRound size={16}/></span>
              <span><strong>{member.displayName}</strong><small>{member.email}</small></span>
              <Plus size={17}/>
            </button>)}
            {!candidates.length?<div className="team-editor__empty">
              {members.length===draft.selected.length?'Todas as pessoas disponíveis já estão na equipe.':'Nenhuma pessoa encontrada.'}
            </div>:null}
          </div>
          <small>Não encontrou alguém? Cadastre ou convide a pessoa no workspace antes de adicioná-la à equipe.</small>
        </div>:null}
      </section>

      {team?<section className="team-editor__section team-editor__activities" aria-labelledby="team-editor-activities">
        <header><div><h3 id="team-editor-activities">Atividades da equipe</h3>
          <p>Resumo atual das tarefas vinculadas à equipe.</p></div></header>
        <div className="team-editor__stats">
          <div><ListTodo size={17}/><strong>{activeTasks.length}</strong><span>Abertas</span></div>
          <div><Clock3 size={17}/><strong>{overdue}</strong><span>Atrasadas</span></div>
          <div><CheckCircle2 size={17}/><strong>{completed}</strong><span>Concluídas</span></div>
        </div>
        <div className="team-editor__links">
          <a href={destination} onClick={preventDiscard}><ListTodo size={15}/> Ver tarefas <ArrowUpRight size={14}/></a>
          <a href={newTask} onClick={preventDiscard}><CalendarDays size={15}/> Criar tarefa <ArrowUpRight size={14}/></a>
        </div>
      </section>:null}
      {error?<p className="team-editor__warning" role="alert">{error}</p>:null}
    </div>
  </Modal>
}
