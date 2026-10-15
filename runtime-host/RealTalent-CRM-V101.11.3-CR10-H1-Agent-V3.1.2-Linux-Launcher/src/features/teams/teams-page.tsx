import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Gauge, Pencil, Plus, ShieldCheck, Target, TrendingUp, Trash2, UserRound, UsersRound } from 'lucide-react'
import { useAppActions, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { StatusPill } from '../../components/ui/status-pill'
import { WorkspacePageHeader, WorkspaceViewStrip } from '../../components/workspace/workspace-shell'
import type { Goal, Team, WorkspaceMember } from '../../domain/types'
import { deleteTeam, loadWorkManagement, saveTeam, type WorkManagementSnapshot } from '../../services/work-management'
import { TeamModal } from './team-modal'
import { getMetricValue, goalMetricLabels, goalMetricUnits } from '../../services/metrics'
import { formatCurrency } from '../../domain/formatters'
import { TeamAccessPanel } from './team-access-panel'

const openStatuses = new Set(['todo','in_progress','blocked'])
const priorityWeight: Record<string, number> = { low: 1, normal: 2, high: 3, urgent: 4 }

export function TeamsPage() {
  const { currentWorkspace, repositoryMode, can, canWrite, snapshot } = useAppWorkspace()
  const { listWorkspaceMembers } = useAppActions()
  const { notify, confirmAction } = useAppUi()
  const [data, setData] = useState<WorkManagementSnapshot>({ teams: [], memberships: [], tasks: [], relations: [], checklistItems: [], comments: [] })
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Team | null>(null)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<'overview'|'goals'|'people'|'performance'|'access'>('overview')
  const workspaceId = currentWorkspace?.id ?? ''
  const canManage = can('manage','workspace')

  const reload = async () => { if (!workspaceId) return; try { const next = await loadWorkManagement(repositoryMode, workspaceId); setData(next); if (!selectedId && next.teams[0]) setSelectedId(next.teams[0].id) } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível carregar as equipes.') } }
  useEffect(()=>{ void reload() },[repositoryMode,workspaceId])
  useEffect(()=>{ let active=true; void listWorkspaceMembers().then((items)=>{if(active)setMembers(items)}).catch(()=>{if(active)setMembers([])}); return()=>{active=false}},[listWorkspaceMembers,workspaceId])

  const memberById = useMemo(()=>new Map(members.map((member)=>[member.userId,member])),[members])
  const selected = data.teams.find((team)=>team.id===selectedId) ?? data.teams[0] ?? null
  const teamMembers = selected ? data.memberships.filter((item)=>item.teamId===selected.id).map((item)=>memberById.get(item.userId)).filter((item):item is WorkspaceMember=>Boolean(item)) : []
  const openTasks = data.tasks.filter((task)=>openStatuses.has(task.status))
  const teamOpenTasks = selected ? openTasks.filter((task)=>task.teamId===selected.id) : []
  const overdue = teamOpenTasks.filter((task)=>task.dueAt && new Date(task.dueAt).getTime()<Date.now()).length
  const completed = selected ? data.tasks.filter((task)=>task.teamId===selected.id && task.status==='completed').length : 0
  const teamMemberIds = selected ? data.memberships.filter((item)=>item.teamId===selected.id).map((item)=>item.userId) : []
  const teamGoals = selected && snapshot ? snapshot.goals.filter((goal)=>goal.scope==='team' && goal.teamId===selected.id) : []
  const teamGoalRows = snapshot ? teamGoals.map((goal)=>{ const value=getMetricValue(snapshot,goal.metric,goal.periodStart,goal.periodEnd,null,teamMemberIds); const pct=goal.targetValue>0?Math.round(value/goal.targetValue*100):0; return {goal,value,pct} }) : []
  const teamGoalAverage = teamGoalRows.length ? Math.round(teamGoalRows.reduce((sum,row)=>sum+Math.min(100,row.pct),0)/teamGoalRows.length) : 0
  const activePipeline = snapshot ? snapshot.leads.filter((lead)=>lead.status==='active' && lead.ownerId && teamMemberIds.includes(lead.ownerId)).reduce((sum,lead)=>sum+lead.value,0) : 0
  const wins = snapshot ? snapshot.leads.filter((lead)=>lead.status==='won' && lead.ownerId && teamMemberIds.includes(lead.ownerId)).length : 0
  const calls30 = snapshot ? getMetricValue(snapshot,'calls',new Date(Date.now()-29*86400000).toISOString().slice(0,10),new Date().toISOString().slice(0,10),null,teamMemberIds) : 0

  const workload = useMemo(()=>teamMembers.map((member)=>{
    const tasks = openTasks.filter((task)=>task.assigneeId===member.userId && (!selected || task.teamId===selected.id))
    const points = tasks.reduce((total,task)=>total+(priorityWeight[task.priority]??2)+(task.dueAt&&new Date(task.dueAt).getTime()<Date.now()?2:0),0)
    const capacity = Math.min(140, Math.round(points/12*100))
    return { member, tasks, points, capacity }
  }).sort((a,b)=>b.capacity-a.capacity),[openTasks,selected,teamMembers])

  const save = async (input: Parameters<typeof saveTeam>[2]) => { if(!workspaceId)return; setSaving(true); try { const saved=await saveTeam(repositoryMode,workspaceId,input); await reload(); setSelectedId(saved.id); setModalOpen(false);setEditing(null);notify('success',input.id?'Equipe atualizada.':'Equipe criada.') } catch(error){notify('error',error instanceof Error?error.message:'Não foi possível salvar a equipe.')} finally{setSaving(false)} }
  const remove = async (team: Team) => { if(!workspaceId||!await confirmAction({title:'Excluir equipe?',description:`A equipe “${team.name}” será removida. As tarefas permanecem no CRM, mas ficarão sem equipe.`,confirmLabel:'Excluir',tone:'danger'}))return; try{await deleteTeam(repositoryMode,workspaceId,team.id);setSelectedId(null);await reload();notify('success','Equipe excluída.')}catch(error){notify('error',error instanceof Error?error.message:'Falha ao excluir a equipe.')} }

  return <div className="workspace-page teams-page-v101112">
    <WorkspacePageHeader className="teams-page-header-h223h1" eyebrow="Gestão operacional" icon={UsersRound} title="Equipes" description="Organize pessoas, liderança e carga de trabalho da operação comercial." actions={canManage?<Button onClick={()=>{setEditing(null);setModalOpen(true)}}><Plus size={17}/> Nova equipe</Button>:null} />
    <section className="teams-layout">
      <aside className="teams-directory"><header><div><strong>Suas equipes</strong><span>{data.teams.length}</span></div><small>Selecione uma equipe para analisar capacidade e execução.</small></header><div>{data.teams.map((team)=>{const count=data.memberships.filter((item)=>item.teamId===team.id).length;const tasks=openTasks.filter((task)=>task.teamId===team.id).length;return <button type="button" key={team.id} className={selected?.id===team.id?'is-active':''} onClick={()=>setSelectedId(team.id)}><i style={{background:team.color}}/><div><strong>{team.name}</strong><small>{count} membro(s) · {tasks} tarefa(s) aberta(s)</small></div></button>})}</div>{!data.teams.length?<EmptyState icon={UsersRound} title="Nenhuma equipe criada" description="Crie a primeira equipe para distribuir tarefas e acompanhar carga de trabalho."/>:null}</aside>
      <main className="team-detail">{selected?<>
        <section className="team-hero"><div className="team-hero__identity"><span style={{background:selected.color}}><UsersRound/></span><div><small>Equipe</small><h2>{selected.name}</h2><p>{selected.description||'Sem descrição.'}</p></div></div><div className="team-hero__actions">{canManage?<><Button variant="secondary" onClick={()=>{setEditing(selected);setModalOpen(true)}}><Pencil size={16}/> Editar</Button><Button variant="ghost" onClick={()=>void remove(selected)}><Trash2 size={16}/> Excluir</Button></>:null}</div></section>
        <WorkspaceViewStrip value={view} onChange={setView} ariaLabel="Visão da equipe" items={[{id:'overview',label:'Visão geral'},{id:'goals',label:'Metas',icon:Target},{id:'people',label:'Pessoas',icon:UsersRound},{id:'performance',label:'Performance',icon:TrendingUp},...(canManage?[{id:'access' as const,label:'Perfis e acesso',icon:ShieldCheck}]:[])]} />
        {view==='overview'?<><section className="work-metric-grid team-metric-grid team-commercial-grid"><article><span><Target/></span><div><small>Metas</small><strong>{teamGoalAverage}%</strong><em>{teamGoals.length} meta(s) ativa(s)</em></div></article><article><span><TrendingUp/></span><div><small>Pipeline</small><strong>{formatCurrency(activePipeline)}</strong><em>Carteira da equipe</em></div></article><article><span><Activity/></span><div><small>Ligações · 30d</small><strong>{calls30}</strong><em>Produção dos membros</em></div></article><article><span><CheckCircle2/></span><div><small>Ganhos</small><strong>{wins}</strong><em>Negócios da equipe</em></div></article></section>
        <section className="work-metric-grid team-metric-grid"><article><span><UsersRound/></span><div><small>Membros</small><strong>{teamMembers.length}</strong><em>{selected.leaderId?`Líder: ${memberById.get(selected.leaderId)?.displayName??'Definido'}`:'Sem líder'}</em></div></article><article><span><Activity/></span><div><small>Tarefas abertas</small><strong>{teamOpenTasks.length}</strong><em>Na fila da equipe</em></div></article><article className={overdue?'is-danger':''}><span><AlertTriangle/></span><div><small>Atrasadas</small><strong>{overdue}</strong><em>Precisam de atenção</em></div></article><article><span><CheckCircle2/></span><div><small>Concluídas</small><strong>{completed}</strong><em>Histórico da equipe</em></div></article></section>
        </>:null}
        {view==='goals'?<section className="work-section team-goals-360"><header><div><span className="eyebrow"><Target size={14}/> Metas da equipe</span><h3>Resultado e ritmo</h3></div><span>{teamGoals.length} meta(s)</span></header>{teamGoalRows.length?<div className="team-goal-cards-h14">{teamGoalRows.map(({goal,value,pct})=><article key={goal.id}><div><strong>{goalMetricLabels[goal.metric]}</strong><small>{goal.periodStart} — {goal.periodEnd}</small></div><div className="team-goal-progress-h14"><span><i style={{width:`${Math.min(100,pct)}%`}}/></span><strong>{pct}%</strong></div><footer><span>Realizado {goalMetricUnits[goal.metric]==='currency'?formatCurrency(value):value}</span><span>Meta {goalMetricUnits[goal.metric]==='currency'?formatCurrency(goal.targetValue):goal.targetValue}</span></footer></article>)}</div>:<EmptyState icon={Target} title="Sem metas para esta equipe" description="Crie uma meta na aba Metas e selecione esta equipe como responsável."/>}</section>:null}
        {view==='people'?<section className="work-section"><header><div><span className="eyebrow"><UsersRound size={14}/> Pessoas</span><h3>Membros e papéis</h3></div><span>{teamMembers.length} membro(s)</span></header><div className="team-people-grid-h14">{teamMembers.map(member=><article key={member.userId}><span className="avatar">{member.displayName.slice(0,1).toUpperCase()}</span><div><strong>{member.displayName}</strong><small>{member.email}</small></div><span>{selected?.leaderId===member.userId?'Gestor':'Membro'}</span></article>)}</div></section>:null}
        {view==='performance'?<section className="work-section"><header><div><span className="eyebrow"><TrendingUp size={14}/> Performance</span><h3>Produção comercial</h3></div></header><div className="team-performance-grid-h14"><article><small>Ligações · 30 dias</small><strong>{calls30}</strong></article><article><small>Pipeline ativo</small><strong>{formatCurrency(activePipeline)}</strong></article><article><small>Negócios ganhos</small><strong>{wins}</strong></article><article><small>Atingimento médio</small><strong>{teamGoalAverage}%</strong></article></div></section>:null}
        {view==='access'&&canManage?<TeamAccessPanel mode={repositoryMode} workspaceId={workspaceId} teamId={selected?.id??null} members={members} memberships={data.memberships} tasks={data.tasks} snapshot={snapshot} canManage={canManage}/>:null}
        {view==='overview'?<><section className="work-section"><header><div><span className="eyebrow"><Gauge size={14}/> Carga de trabalho</span><h3>Capacidade por pessoa</h3></div><span>{workload.length} pessoa(s)</span></header>{workload.length?<div className="workload-list">{workload.map(({member,tasks,capacity})=><article key={member.userId}><div className="workload-owner"><span className="avatar avatar--small">{member.displayName.slice(0,1).toUpperCase()}</span><div><strong>{member.displayName}</strong><small>{tasks.length} tarefa(s) aberta(s)</small></div></div><div className="workload-bar"><div><span style={{width:`${Math.min(100,capacity)}%`}}/></div><strong className={capacity>100?'is-danger':capacity>80?'is-warning':''}>{capacity}%</strong></div><StatusPill tone={capacity>100?'danger':capacity>80?'warning':'success'}>{capacity>100?'Sobrecarregado':capacity>80?'Atenção':'Disponível'}</StatusPill></article>)}</div>:<EmptyState icon={UserRound} title="Nenhum membro nesta equipe" description="Edite a equipe e selecione as pessoas que fazem parte dela."/>}</section>
        <section className="work-section"><header><div><span className="eyebrow"><Activity size={14}/> Execução</span><h3>Tarefas da equipe</h3></div><span>{teamOpenTasks.length} abertas</span></header>{teamOpenTasks.length?<div className="team-task-summary">{teamOpenTasks.slice(0,8).map((task)=><article key={task.id}><span className={`team-task-priority is-${task.priority}`}/><div><strong>{task.title}</strong><small>{task.assigneeName||'Sem responsável'} · {task.dueAt?new Date(task.dueAt).toLocaleDateString('pt-BR'):'Sem prazo'}</small></div><StatusPill tone={task.status==='blocked'?'danger':task.status==='in_progress'?'info':'warning'}>{task.status==='blocked'?'Bloqueada':task.status==='in_progress'?'Em andamento':'A fazer'}</StatusPill></article>)}</div>:<EmptyState icon={CheckCircle2} title="Sem tarefas abertas" description="Esta equipe está sem pendências atribuídas no momento."/>}</section></>:null}
      </>:<EmptyState icon={UsersRound} title="Crie uma equipe para começar" description="Depois você poderá acompanhar liderança, membros, carga de trabalho e tarefas relacionadas."/>}</main>
    </section>
    <TeamModal open={canManage&&modalOpen} team={editing} memberships={data.memberships} members={members} loading={saving} onClose={()=>{setModalOpen(false);setEditing(null)}} onSubmit={save}/>
  </div>
}
