import { useEffect, useRef, useState } from 'react'
import { Download, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react'
import { useAppUi } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { disconnectLocalConnector, downloadLocalConnectorInstaller, getLocalConnectorStatus, searchProspectsWithAi, type AiSearchResult } from '../../services/prospecting-ai'
import type { ProspectRecord } from '../../services/prospecting-workspace'
import './firecrawl-local-panel.css'

export function FirecrawlLocalPanel({ workspaceId, readOnly, canConfigure, segment, city, onSegment, onCity, onComplete, prospect }: {
  workspaceId: string; readOnly: boolean; canConfigure: boolean; segment: string; city: string
  onSegment?(value: string): void; onCity?(value: string): void
  onComplete(result: AiSearchResult): void; prospect?: ProspectRecord
}) {
  const { confirmAction, notify } = useAppUi()
  const [limit, setLimit] = useState(5)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [configuring, setConfiguring] = useState(false)
  const [error, setError] = useState('')
  const [online, setOnline] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const completeRef = useRef(onComplete)
  completeRef.current = onComplete
  const refresh = async () => { try { const status = await getLocalConnectorStatus(workspaceId); setOnline(Boolean(status?.online)) } catch { setOnline(false) } }

  useEffect(() => {
    let active = true
    const check = async () => { try { const value = await getLocalConnectorStatus(workspaceId); if (active) setOnline(Boolean(value?.online)) } catch { if (active) setOnline(false) } }
    void check()
    const timer = window.setInterval(() => void check(), 10_000)
    return () => { active = false; window.clearInterval(timer); controller.current?.abort(); controller.current = null }
  }, [workspaceId, readOnly])

  const configure = async (disconnect: boolean) => {
    if (!canConfigure || configuring) return
    const confirmed = await confirmAction({ title: disconnect ? 'Desconectar seu Linux?' : 'Gerar acesso para seu Linux?',
      description: disconnect ? 'O conector deixará de receber pesquisas deste workspace.' : 'Será baixado um instalador pessoal com a credencial deste workspace. Não compartilhe esse arquivo. Uma nova conexão substitui a credencial anterior.',
      confirmLabel: disconnect ? 'Desconectar' : 'Baixar instalador',
    })
    if (!confirmed) return
    setConfiguring(true); setError('')
    try {
      if (disconnect) await disconnectLocalConnector(workspaceId)
      else await downloadLocalConnectorInstaller(workspaceId)
      notify('success', disconnect ? 'Computador desconectado.' : 'Instalador baixado. Execute bash ~/Downloads/CONECTAR-GARIMPO-LINUX.sh no seu computador.')
      await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível configurar o conector.') }
    finally { setConfiguring(false) }
  }

  const search = async () => {
    if (readOnly || controller.current) return
    const task = new AbortController()
    controller.current = task; setBusy(true); setError('')
    try {
      const result = await searchProspectsWithAi({ organizationId: workspaceId, segment: prospect?.company || segment, city: prospect?.city || city,
        query: prospect ? `Somente esta empresa: ${JSON.stringify({ company: prospect.company, city: prospect.city, website: prospect.website, cnpj: prospect.cnpj, phone: prospect.phone })}` : query,
        limit: prospect ? 1 : limit, source: prospect?.source || 'manual', execution: 'local', ...(prospect ? { prospectId: prospect.id } : {}),
      }, task.signal)
      if (task.signal.aborted) return
      if (!result.leads.length) { setError(result.warnings.join(' ') || 'Nenhuma empresa com fontes foi encontrada. Ajuste o perfil e a região.'); return }
      completeRef.current(result)
    } catch (reason) { if (!task.signal.aborted) setError(reason instanceof Error ? reason.message : 'A pesquisa não foi concluída.') }
    finally { if (controller.current === task) { controller.current = null; setBusy(false) } }
  }

  return <section className="panel firecrawl-local-panel" aria-label={prospect ? 'Enriquecimento com Firecrawl' : 'Firecrawl no Linux'}>
    <header><div><span className="eyebrow"><Sparkles size={14} /> Firecrawl no seu Linux</span><h3>{prospect ? 'Completar dados com IA local' : 'Buscar empresas e trazer os contatos'}</h3><p>{prospect ? 'Preencha os campos que faltam mantendo sua revisão.' : 'Defina o perfil. Seu computador pesquisa os sites e devolve os dados com suas fontes para revisão.'}</p></div><StatusPill tone={online ? 'success' : 'neutral'}>{online ? 'Linux conectado' : 'Conector offline'}</StatusPill></header>
    {!prospect && !online ? <div className="firecrawl-local-panel__connection">
      <div><strong>Conectar seu computador</strong><p>O instalador já traz o acesso deste CRM. Não precisa criar nem procurar garimpo.env.</p></div>
      {canConfigure ? <>
        <Button disabled={configuring} onClick={() => void configure(false)}><Download size={16} />{configuring ? 'Preparando instalador…' : 'Conectar meu Linux'}</Button>
        <span className="firecrawl-local-panel__command-label">Depois de baixar, execute no terminal:</span>
        <code>bash ~/Downloads/CONECTAR-GARIMPO-LINUX.sh</code>
        <small>Arquivo pessoal: não compartilhe. O modelo 3B é selecionado automaticamente quando instalado.</small>
      </> : <small>Um administrador do workspace precisa autorizar este computador.</small>}
    </div> : null}
    {!prospect ? <div className="prospecting-form-grid">
      <label><span>Segmento</span><input value={segment} disabled={readOnly || busy} onChange={(event) => onSegment?.(event.target.value)} placeholder="Ex.: Barbearias" /></label>
      <label><span>Cidade ou região</span><input value={city} disabled={readOnly || busy} onChange={(event) => onCity?.(event.target.value)} placeholder="Ex.: Canoas, RS" /></label>
      <label className="is-wide"><span>Perfil e critérios adicionais</span><textarea value={query} disabled={readOnly || busy} maxLength={1000} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: priorizar telefone comercial, site e link de agendamento." /></label>
      <label><span>Limite por pesquisa</span><select value={limit} disabled={readOnly || busy} onChange={(event) => setLimit(Number(event.target.value))}><option value={1}>1 empresa — teste inicial</option><option value={3}>3 empresas</option><option value={5}>5 empresas</option><option value={10}>10 empresas</option></select></label>
    </div> : null}
    <p className="firecrawl-local-panel__hint">Empresa, telefone, e-mail, localização, CNPJ, site, Instagram e WhatsApp publicado, quando encontrados. Os dados acompanham fontes; oportunidades e abordagens são sugestões da IA.</p>
    {error ? <p className="firecrawl-local-panel__error" role="alert">{error}</p> : null}
    {busy ? <div className="firecrawl-local-panel__progress" role="status"><LoaderCircle size={17} /><span>Seu Linux está pesquisando. Mantenha o conector aberto.</span><Button variant="ghost" onClick={() => { controller.current?.abort(); controller.current = null; setBusy(false) }}>Cancelar</Button></div> : <Button disabled={readOnly || !online || !(prospect?.company || segment).trim() || !(prospect?.city || city).trim()} onClick={() => void search()}><Sparkles size={17} />{prospect ? 'Enriquecer com Firecrawl' : 'Buscar leads com Firecrawl'}</Button>}
    {!prospect ? <details><summary>Verificar conexão ou desconectar</summary>
      <p>O conector trabalha somente enquanto o Linux estiver ligado e o instalador estiver em execução. O status é atualizado automaticamente.</p>
      <div className="firecrawl-local-panel__setup">
        <Button variant="secondary" onClick={() => void refresh()}><RefreshCw size={15} /> Verificar conexão</Button>
        {canConfigure && online ? <Button variant="secondary" disabled={configuring} onClick={() => void configure(false)}>Gerar novo instalador</Button> : null}
        {canConfigure ? <Button variant="ghost" disabled={configuring} onClick={() => void configure(true)}>Desconectar Linux</Button> : null}
      </div></details> : null}
  </section>
}
