import {Activity, BrainCircuit, Database, Eraser, LockKeyhole, RefreshCw, ShieldCheck, Sparkles, Wrench} from 'lucide-react'
import {useEffect,useMemo,useState} from 'react'
import {useAppWorkspace} from '../../app/app-context'
import {Button} from '../../components/ui/button'
import {StatusPill} from '../../components/ui/status-pill'
import {listRealTalentAiAudit,clearRealTalentAiAudit} from '../../services/realtalent-ai-audit'
import {buildRealTalentAiContext} from '../../services/realtalent-ai-context'
import {REALTALENT_AI_TOOLS} from '../../services/realtalent-ai-tools'
import {getAgentRuntimeHealth,type AgentRuntimeHealth} from '../../services/realtalent-agent-v56-health'

export function RealTalentAiPanel(){
  const {snapshot,currentWorkspace}=useAppWorkspace()
  const workspaceId=currentWorkspace?.id??snapshot?.workspace.id??'local'
  const [refreshKey,setRefreshKey]=useState(0)
  const [runtime,setRuntime]=useState<AgentRuntimeHealth|null>(null)
  const [lastChecked,setLastChecked]=useState<string|null>(null)
  const [healthBusy,setHealthBusy]=useState(false)
  const [toolsQuery,setToolsQuery]=useState('')
  const [toolsFilter,setToolsFilter]=useState<'all'|'enabled'|'restricted'>('all')
  const [showAllAudit,setShowAllAudit]=useState(false)
  const audit=useMemo(()=>listRealTalentAiAudit(workspaceId),[workspaceId,refreshKey])
  const context=useMemo(()=>snapshot?buildRealTalentAiContext(snapshot):null,[snapshot])
  const enabledTools=REALTALENT_AI_TOOLS.filter(tool=>tool.enabled)
  const writeTools=enabledTools.filter(tool=>tool.permission==='write')
  const visibleTools=useMemo(()=>REALTALENT_AI_TOOLS.filter(tool=>{
    const q=toolsQuery.trim().toLocaleLowerCase('pt-BR')
    return (!q||(tool.label+' '+tool.description).toLocaleLowerCase('pt-BR').includes(q))&&
      (toolsFilter==='all'||(toolsFilter==='enabled'?tool.enabled:!tool.enabled))
  }),[toolsQuery,toolsFilter])
  const ready=runtime?.connected===true&&runtime.modelInstalled===true
  const healthText=runtime===null?'Verificando…':ready?'Disponível':runtime.connected?'Modelo indisponível':'Desconectado'
  const checkRuntime=async()=>{
    setHealthBusy(true)
    try{
      const result=await getAgentRuntimeHealth()
      setRuntime(result)
      setLastChecked(new Date().toISOString())
    }finally{setHealthBusy(false)}
  }
  useEffect(()=>{
    let disposed=false
    const refresh=async()=>{
      const result=await getAgentRuntimeHealth()
      if(!disposed){setRuntime(result);setLastChecked(new Date().toISOString())}
    }
    void refresh()
    const timer=window.setInterval(()=>void refresh(),45000)
    return ()=>{disposed=true;window.clearInterval(timer)}
  },[])
  const lastCheckedLabel=lastChecked?
    'Última verificação: '+new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(lastChecked)):
    'Aguardando primeira verificação'

  return <div className="rt-ai-s3" aria-label="Centro de controle RealTalent AI">
    <section className="panel rt-ai-s3__hero">
      <div className="rt-ai-s3__heading">
        <span className="rt-ai-s3__symbol"><BrainCircuit size={22}/></span>
        <div><h3>Estado do Agent</h3><p>Disponibilidade verificada do modelo local; executar uma ferramenta exige validação separada.</p></div>
        <StatusPill tone={ready?'success':runtime?.connected?'warning':'neutral'}>{healthText}</StatusPill>
      </div>
      <div className="rt-ai-s3__status-grid">
        <div className="rt-ai-s3__metric"><span>Modelo local</span><strong title={runtime?.model||''}>{ready?runtime?.model??'Modelo confirmado':runtime===null?'Verificando…':'Não confirmado'}</strong><small>{runtime?.modelInstalled?'Instalação confirmada':'Não foi possível confirmar a instalação'}</small></div>
        <div className="rt-ai-s3__metric"><span>Gateway / Ollama</span><strong>{runtime===null?'Verificando…':runtime.connected?'Respondendo':'Sem resposta'}</strong><small>{runtime?.connected?'Healthcheck operacional':'Confira o inicializador do Agent Runtime'}</small></div>
        <div className="rt-ai-s3__metric"><span>Ferramentas habilitadas</span><strong>{enabledTools.length}</strong><small>{writeTools.length} com capacidade de escrita; regras de autorização preservadas</small></div>
        <div className="rt-ai-s3__metric"><span>Auditoria local</span><strong>{audit.length}</strong><small>Execuções registradas neste dispositivo</small></div>
      </div>
      <footer className="rt-ai-s3__hero-actions">
        <Button variant="secondary" loading={healthBusy} onClick={()=>void checkRuntime()}><RefreshCw size={16}/> Verificar conexão</Button>
        <span><Activity size={14}/>{lastCheckedLabel}</span>
      </footer>
    </section>

    <section className="panel rt-ai-s3__section">
      <header className="rt-ai-s3__section-title"><Database size={19}/><div><h3>Contexto utilizado</h3><p>Dados atuais do CRM, sem criar uma segunda base de informações.</p></div></header>
      <div className="rt-ai-s3__context-list">
        <div><ShieldCheck size={18}/><span><strong>Dados de referência</strong><small>{context?`${context.counts.leads} leads · ${context.counts.contacts} contatos · ${context.counts.activities} atividades · ${context.counts.proposals} propostas`:'Aguardando workspace.'}</small></span></div>
        <div><LockKeyhole size={18}/><span><strong>Permissão para executar</strong><small>O gateway propõe ferramentas; ações de escrita dependem das permissões e confirmações do CRM.</small></span></div>
        <div><Sparkles size={18}/><span><strong>Continuidade comercial</strong><small>Contexto reconstruído dos dados atuais da conta, e não de pesquisas hipotéticas.</small></span></div>
      </div>
    </section>

    <section className="panel rt-ai-s3__section">
      <header className="rt-ai-s3__section-title"><Wrench size={19}/><div><h3>Ferramentas do Agent</h3><p>Disponibilidade declarada no catálogo, diferente da execução confirmada.</p></div></header>
      <div className="rt-ai-s3__toolbar">
        <label className="rt-ai-s3__search"><span className="sr-only">Filtrar ferramentas</span><input value={toolsQuery} onChange={event=>setToolsQuery(event.target.value)} placeholder="Buscar ferramenta ou capacidade…"/></label>
        <div className="rt-ai-s3__filters" role="group" aria-label="Filtrar ferramentas">
          {(['all','enabled','restricted'] as const).map(filter=><button key={filter} type="button" className={toolsFilter===filter?'is-active':''} aria-pressed={toolsFilter===filter} onClick={()=>setToolsFilter(filter)}>{filter==='all'?'Todas':filter==='enabled'?'Habilitadas':'Reservadas'}</button>)}
        </div>
      </div>
      <div className="rt-ai-s3__tool-list" role="list" aria-label="Catálogo de ferramentas">
        {visibleTools.map(tool=><div className="rt-ai-s3__tool" role="listitem" key={tool.id}>
          <div className="rt-ai-s3__tool-description"><strong>{tool.label}</strong><p>{tool.description}</p></div>
          <div className="rt-ai-s3__tool-states"><StatusPill tone={tool.enabled?'success':'neutral'}>{tool.enabled?'Habilitada':'Reservada'}</StatusPill><StatusPill tone={tool.mutatesCrm?'warning':'info'}>{tool.permission==='write'?'Escrita':'Leitura'}</StatusPill>{tool.requiresConfirmation?<span className="rt-ai-s3__confirmation">Requer confirmação</span>:null}</div>
        </div>)}
        {!visibleTools.length?<p className="rt-ai-s3__empty">Nenhuma ferramenta corresponde ao filtro.</p>:null}
      </div>
    </section>

    <section className="panel rt-ai-s3__section">
      <header className="rt-ai-s3__section-title"><ShieldCheck size={19}/><div><h3>Execuções registradas</h3><p>Metadados locais de uso; o texto integral das conversas não é persistido aqui.</p></div></header>
      {audit.length?<div className="rt-ai-s3__audit">
        {(showAllAudit?audit.slice(0,50):audit.slice(0,6)).map(entry=><div className="rt-ai-s3__audit-row" key={entry.id}>
          <div><strong>{entry.intent.replaceAll('_',' ')}</strong><small>{new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(entry.generatedAt))} · {entry.providerId} · {entry.durationMs} ms</small><small>{entry.toolIds.join(', ')||'Sem ferramenta'}</small></div>
          <StatusPill tone={entry.outcome==='success'?'success':entry.outcome==='blocked'?'warning':'danger'}>{entry.outcome}</StatusPill>
        </div>)}
      </div>:<div className="rt-ai-s3__empty">Nenhuma execução registrada neste dispositivo.</div>}
      <footer className="rt-ai-s3__audit-actions">
        {audit.length>6?<Button variant="secondary" onClick={()=>setShowAllAudit(value=>!value)}>{showAllAudit?'Mostrar menos':'Ver mais execuções'}</Button>:null}
        <Button variant="ghost" disabled={!audit.length} onClick={()=>{clearRealTalentAiAudit(workspaceId);setRefreshKey(value=>value+1)}}><Eraser size={16}/> Limpar trilha local</Button>
      </footer>
    </section>
  </div>
}
