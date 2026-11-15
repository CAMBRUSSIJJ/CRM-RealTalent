import { ExternalLink } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { StatusPill } from '../../components/ui/status-pill'
import type { ProspectRecord } from '../../services/prospecting-workspace'
import type { AiSearchResult } from '../../services/prospecting-ai'
import { savedResearchResult, savedResearchVersions, localResearchVersion } from '../../services/prospecting-ai'
import { crossSourceReview, savedCrossSourceReview } from '../../services/prospecting-cross-source-review'
import { prospectDataQuality } from '../../services/prospecting-data-layer'
import { commercialReviewActions, unifiedProspectEvidence } from '../../services/prospecting-research-view'
import { researchCompletionStatus } from '../../../supabase/functions/_shared/prospecting-ai'
import { formatDateTime } from '../../domain/formatters'
import './prospecting-research-summary.css'

function ResearchVersionHistory({ prospect }: { prospect: ProspectRecord }) {
  const versions = savedResearchVersions(prospect)
  const [selected, setSelected] = useState<AiSearchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const openVersion = async (id: string) => {
    controller.current?.abort()
    const request = new AbortController(); controller.current = request
    setBusy(true); setError(''); setSelected(null)
    try {
      const result = await localResearchVersion(prospect, id, request.signal)
      if (request.signal.aborted) return
      if (result) setSelected(result)
      else setError('Esta versão não pôde ser consultada no servidor. A investigação atual continua preservada.')
    } catch { if (!request.signal.aborted) setError('Não foi possível consultar essa investigação. Tente novamente.') }
    finally { if (!request.signal.aborted) setBusy(false) }
  }
  if (!versions.length) return null
  return <details><summary>Histórico de investigações ({versions.length})</summary>
    <ul>{[...versions].reverse().map((version) => <li key={version.id}>
      <button className="garimpo-research-summary__history-link" type="button" onClick={() => void openVersion(version.id)} disabled={busy}>{formatDateTime(version.researchedAt)} · {version.sourceCount} fonte(s)</button>
      <p>{version.summary}</p>
    </li>)}</ul>
    {busy ? <p role="status">Consultando a investigação…</p> : null}
    {error ? <p role="status">{error}</p> : null}
    {selected ? <section aria-label="Versão da investigação"><h4>Investigação de {formatDateTime(selected.researchedAt)}</h4>
      <p>{selected.leadIntelligence?.businessSummary || selected.commercialBrief?.summary || 'Veja as evidências registradas nesta execução.'}</p>
      <ul>{selected.leadIntelligence?.questions.map((question, index) => <li key={index}>{question}</li>)}</ul>
      <ul>{selected.leads[0]?.aiResearch.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul>
    </section> : null}
  </details>
}

export function ProspectingResearchSummary({ prospect, result = savedResearchResult(prospect) }: { prospect: ProspectRecord; result?: AiSearchResult | null }) {
  const quality = prospectDataQuality(prospect)
  const review = result ? crossSourceReview(prospect, result) : savedCrossSourceReview(prospect)
  const sources = unifiedProspectEvidence(prospect, result, review)
  const actions = commercialReviewActions(prospect, result)
  const status = result?.stages?.length ? researchCompletionStatus(result.stages, sources.length > 0) : result?.researchStatus
  const facts = [...(result?.leadIntelligence?.offerings || []), ...(result?.leadIntelligence?.positioning || [])].slice(0, 3)
  return <section className="garimpo-research-summary" aria-label="Resumo comercial da empresa">
    <div className="garimpo-research-summary__states">
      <StatusPill tone={quality.registrationSufficient ? 'success' : 'warning'}>Cadastro {quality.registrationSufficient ? 'suficiente' : 'incompleto'}</StatusPill>
      <StatusPill tone={quality.companyVerified ? 'success' : 'warning'}>Empresa {quality.companyVerified ? 'verificada' : 'em verificação'}</StatusPill>
      <StatusPill tone={quality.readyForTransfer ? 'success' : 'neutral'}>{quality.readyForTransfer ? 'Pronta para transferência' : 'Transferência pendente'}</StatusPill>
    </div>
    <header><strong>O que sabemos sobre esta empresa</strong><span>{sources.length} fonte(s) associada(s)</span></header>
    {result ? <small>Última investigação salva: {formatDateTime(result.researchedAt)}</small> : null}
    {result ? <p>{status === 'partial' ? 'Uma etapa essencial não concluiu.' : status === 'limited' ? 'Investigação concluída com limitações em fontes opcionais.' : 'Investigação concluída.'} {result.leadIntelligence?.businessSummary || result.commercialBrief?.summary || 'Consulte os fatos encontrados nas evidências.'}</p>
      : <p>A investigação comercial ainda não foi salva para esta empresa. Os dados cadastrais continuam disponíveis para revisão.</p>}
    {facts.length ? <ul className="garimpo-research-summary__facts">{facts.map((fact, index) => <li key={`${fact.sourceUrl}-${index}`}>{fact.label}</li>)}</ul> : null}
    <div className="garimpo-research-summary__actions" aria-label="Próximas ações comerciais">
      {actions.map((action, index) => <article key={`${action.kind}-${index}`}><small>{action.kind === 'verification' ? 'Verificação pendente' : 'Hipótese para validar'}</small>
        <h4>{action.title}</h4><p>{action.detail}</p><p><strong>Pergunta sugerida:</strong> {action.question}</p>
        {action.sourceUrls.map((url) => <a href={url} key={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/> Conferir evidência</a>)}
      </article>)}
      {!actions.length ? <p>As fontes ainda não sustentam uma oportunidade comercial específica. Confirme os serviços e o contexto antes de propor uma solução.</p> : null}
    </div>
    <details className="garimpo-research-summary__evidence"><summary>Evidências e histórico de fontes ({sources.length})</summary>
      <ul>{sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <ExternalLink size={12}/></a>
        <small>{source.origins.map((origin) => origin === 'discovery' ? 'Descoberta' : 'Investigação').join(' e ')} · {source.status === 'blocked' ? 'Bloqueada' : source.status === 'unavailable' ? 'Indisponível' : source.status === 'read' ? 'Lida' : 'Observada'} · {source.verification === 'confirmed' ? 'Corroborada entre domínios' : source.verification === 'divergent' ? 'Divergente' : 'Fonte única'} · {formatDateTime(source.collectedAt)}</small>
        {source.facts.length ? <ul>{source.facts.slice(0, 5).map((fact) => <li key={fact}>{fact}</li>)}</ul> : null}</li>)}</ul>
      {!sources.length ? <p>Nenhuma fonte pública foi associada a esta empresa.</p> : null}
    </details>
    <ResearchVersionHistory key={prospect.id} prospect={prospect} />
    <details><summary>Diagnóstico técnico da investigação</summary>
      <p>CRM: contrato G8 · Conector: {result?.runtime?.version || 'versão não informada'} · Modelo: {result?.runtime?.model || 'não informado'}</p>
      <p>{result?.contractVersion || 'Resultado anterior ao contrato G8; atualize o conector Linux para obter o diagnóstico de execução.'}</p>
      {result?.providers?.length ? <ul>{result.providers.map((provider) => <li key={provider.name}>{provider.name}: {!provider.configured ? 'desativado' : provider.used ? 'utilizado' : 'configurado, sem execução'} · {provider.succeeded} sucesso(s) · {provider.failed} falha(s)</li>)}</ul> : null}
      <p>SearXNG: a execução interna do servidor Firecrawl não é informada por este conector.</p>
      {result?.adaptiveResearch ? <p>Pesquisa adaptativa: {result.adaptiveResearch.queriesExecuted} consulta(s). Lacunas priorizadas: {result.adaptiveResearch.gaps.join(', ') || 'nenhuma lacuna inicial identificada'}.</p> : null}
      <p>Domínios distintos não comprovam independência editorial. Limitações de fontes opcionais não significam falha de toda a investigação.</p>
      <p>O resultado atual é preservado junto à empresa; as referências do histórico são compactas e as versões completas ficam no servidor.</p>
    </details>
  </section>
}
