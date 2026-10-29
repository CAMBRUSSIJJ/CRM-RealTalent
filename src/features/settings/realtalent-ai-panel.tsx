import { BrainCircuit, Database, Eraser, LockKeyhole, ShieldCheck, Sparkles, Wrench, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { listRealTalentAiAudit, clearRealTalentAiAudit } from '../../services/realtalent-ai-audit'
import { buildRealTalentAiContext } from '../../services/realtalent-ai-context'
import { REALTALENT_AI_TOOLS } from '../../services/realtalent-ai-tools'
import { getAgentRuntimeHealth, type AgentRuntimeHealth } from '../../services/realtalent-agent-v56-health'

export function RealTalentAiPanel() {
  const { snapshot, currentWorkspace } = useAppWorkspace()
  const workspaceId = currentWorkspace?.id ?? snapshot?.workspace.id ?? 'local'
  const [refreshKey, setRefreshKey] = useState(0)
  const [runtime,setRuntime]=useState<AgentRuntimeHealth|null>(null)
  const [healthBusy,setHealthBusy]=useState(false)
  const checkRuntime=async()=>{
    setHealthBusy(true)
    try{setRuntime(await getAgentRuntimeHealth())}
    finally{setHealthBusy(false)}
  }
  useEffect(()=>{
    let disposed=false
    const refresh=async()=>{const data=await getAgentRuntimeHealth();if(!disposed)setRuntime(data)}
    void refresh()
    const timer=window.setInterval(()=>void refresh(),45000)
    return ()=>{disposed=true;window.clearInterval(timer)}
  },[])
  const audit = useMemo(() => listRealTalentAiAudit(workspaceId), [workspaceId, refreshKey])
  const context = useMemo(() => snapshot ? buildRealTalentAiContext(snapshot) : null, [snapshot])
  const enabledTools = REALTALENT_AI_TOOLS.filter((tool) => tool.enabled)
  const writeTools = REALTALENT_AI_TOOLS.filter((tool) => tool.permission === 'write')

  return <div className="page-stack realtalent-ai-settings">
    <article className="panel">
      <div className="panel__heading"><div><span className="eyebrow">RealTalent AI</span><h3>Camada proprietária de inteligência comercial</h3><p>Contexto, memória, tools, permissões e auditoria ficam sob controle do CRM. O Agent Runtime usa IA Local via Ollama por padrão. OpenAI é opcional e pode ser habilitada apenas quando você quiser.</p></div><BrainCircuit size={24}/></div>
      <div className="settings-health-grid">
        <div><span>Modelo local</span><strong>{runtime===null?'Verificando…':runtime.connected&&runtime.modelInstalled?runtime.model:'Não disponível'}</strong><small>{runtime?.modelInstalled?'Modelo confirmado pelo gateway.':'Disponibilidade do Qwen ainda não confirmada.'}</small></div>
        <div><span>Ollama e gateway</span><strong>{runtime===null?'Verificando…':runtime.connected?'Conectado':'Indisponível'}</strong><small>{runtime?.connected?'Healthcheck real respondendo.':'Inicie o Agent Runtime e verifique a porta do gateway.'}</small></div>
        <div><span>Tools habilitadas</span><strong>{enabledTools.length}</strong><small>{writeTools.filter((tool) => tool.enabled).length} ferramenta(s) de escrita ativa(s), todas com confirmação.</small></div>
        <div><span>Trilha local</span><strong>{audit.length} execução(ões)</strong><small>Metadados técnicos; o prompt completo não é persistido.</small></div>
      </div>
      <div className="settings-actions"><Button variant="secondary" loading={healthBusy} onClick={()=>void checkRuntime()}><RefreshCw size={16}/> Verificar modelo e gateway</Button>
      <StatusPill tone={runtime?.connected&&runtime.modelInstalled?'success':'warning'}>{runtime?.connected&&runtime.modelInstalled?'Modelo disponível':'Disponibilidade não confirmada'}</StatusPill></div>
    </article>

    <article className="panel">
      <div className="panel__heading"><div><span className="eyebrow">Context Engine</span><h3>O que entra no contexto</h3><p>A memória comercial é derivada do CRM como fonte de verdade, evitando uma memória paralela silenciosamente desatualizada.</p></div><Database size={22}/></div>
      <div className="settings-check-list">
        <div><ShieldCheck size={17}/><div><strong>Fonte de verdade: snapshot do CRM</strong><small>{context ? `${context.counts.leads} leads · ${context.counts.contacts} contatos · ${context.counts.activities} atividades · ${context.counts.proposals} propostas` : 'Aguardando workspace.'}</small></div></div>
        <div><LockKeyhole size={17}/><div><strong>Sem autoridade de escrita</strong><small>O gateway pode ler e propor ações. Persistência ocorre somente no fluxo explícito do aplicativo.</small></div></div>
        <div><Sparkles size={17}/><div><strong>Memória por conta</strong><small>Etapa, notas, stakeholders, atividades, ligações, reuniões e propostas são reconstruídos a partir dos dados atuais.</small></div></div>
      </div>
    </article>

    <article className="panel">
      <div className="panel__heading"><div><span className="eyebrow">Tools & permissões</span><h3>Catálogo controlado de ferramentas</h3><p>Uma IA nunca recebe uma conexão genérica ao banco. Cada capacidade é declarada e recebe uma política de execução.</p></div><Wrench size={22}/></div>
      <div className="integration-list">
        {REALTALENT_AI_TOOLS.map((tool) => <div className="integration-list__row" key={tool.id}>
          <div><strong>{tool.label}</strong><small>{tool.description}</small></div>
          <div className="settings-actions"><StatusPill tone={tool.enabled ? 'success' : 'neutral'}>{tool.enabled ? 'Habilitada' : 'Reservada'}</StatusPill><StatusPill tone={tool.mutatesCrm ? 'warning' : 'info'}>{tool.permission}</StatusPill>{tool.requiresConfirmation ? <StatusPill tone="warning">Confirmação</StatusPill> : null}</div>
        </div>)}
      </div>
    </article>

    <article className="panel">
      <div className="panel__heading"><div><span className="eyebrow">Auditoria</span><h3>Execuções recentes do RealTalent AI</h3><p>A trilha guarda provider, intenção, tools, foco, duração e resultado. O texto integral das perguntas não é armazenado.</p></div><ShieldCheck size={22}/></div>
      {audit.length ? <div className="integration-list">{audit.slice(0, 12).map((entry) => <div className="integration-list__row" key={entry.id}><div><strong>{entry.intent.replaceAll('_', ' ')}</strong><small>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(entry.generatedAt))} · {entry.providerId} · {entry.durationMs} ms</small></div><div className="settings-actions"><StatusPill tone={entry.outcome === 'success' ? 'success' : entry.outcome === 'blocked' ? 'warning' : 'danger'}>{entry.outcome}</StatusPill><span className="settings-copy">{entry.toolIds.join(', ') || 'sem tool'}</span></div></div>)}</div> : <div className="empty-copy">Nenhuma execução registrada neste dispositivo.</div>}
      <div className="settings-actions"><Button variant="secondary" disabled={!audit.length} onClick={() => { clearRealTalentAiAudit(workspaceId); setRefreshKey((value) => value + 1) }}><Eraser size={16}/> Limpar trilha local</Button></div>
    </article>
  </div>
}
