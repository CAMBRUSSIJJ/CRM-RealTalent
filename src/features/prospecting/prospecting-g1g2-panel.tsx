import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ExternalLink, LoaderCircle, SearchCheck, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '../../components/ui/button'
import type { WorkspaceSnapshot } from '../../domain/types'
import type { ProspectRecord } from '../../services/prospecting-workspace'
import { explainProspectScore, prospectDecisionLabel } from '../../services/prospecting-g1g2-intelligence'
import { scoreProspectWithIcp } from '../../services/prospecting-intelligence'
import { getLocalConnectorStatus, searchProspectsWithAi, recentLocalResearch, reviewedInstagramProfile, type LocalResearchProgress, type AiSearchResult } from '../../services/prospecting-ai'
import { confirmedEnrichmentResult, reviewEnrichmentResult, researchOnlyEnrichmentResult, crossSourceReview, savedCrossSourceReview, type CrossSourceField } from '../../services/prospecting-cross-source-review'
import './prospecting-cross-source-review.css'

interface Props {
  prospect: ProspectRecord
  snapshot: WorkspaceSnapshot
  workspaceId: string
  readOnly: boolean
  onEnriched(result: AiSearchResult): void
  onConfirmInstagram(profileUrl: string): void
}
const safeSite = (value: string): string | null => {
  try {
    const parsed = new URL(value)
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password
      && !['localhost', '127.0.0.1'].includes(parsed.hostname) ? parsed.href : null
  } catch { return null }
}
const cadastroSignalLabel = (reason: string) => reason
  .replace(/Empresa real confirmada por múltiplos sinais/i, 'Cadastro apresenta indícios de empresa real; a confirmação depende de fontes externas')
  .replace(/Presença digital própria confirmada/i, 'Presença digital indicada no cadastro; autoria a verificar')

const groups = [
  { status: 'divergent', title: 'Divergências — precisam de decisão' },
  { status: 'confirmed', title: 'Corroborados em domínios distintos' },
  { status: 'observed', title: 'Encontrados em apenas uma fonte' },
] as const

function EvidenceRow({ field }: { field: CrossSourceField }) {
  return <li className={'garimpo-cross-source__field is-' + field.status}>
    <strong>{field.label}</strong>
    {field.currentValue ? <small>Cadastro: {field.currentValue}</small> : <small>Não consta no cadastro</small>}
    {field.candidates.map((candidate) => <div className="garimpo-cross-source__candidate" key={candidate.value}>
      <span>{candidate.value} <small>· {candidate.independentPublishers} domínio(s) distinto(s)</small></span>
      <span className="garimpo-cross-source__links">
        {candidate.urls.slice(0, 6).map((url) => safeSite(url) ?
          <a key={url} href={safeSite(url)!} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={12} />{new URL(url).hostname}
          </a> : null)}
      </span>
    </div>)}
  </li>
}

export function ProspectingG1G2Panel({ prospect, snapshot, workspaceId, readOnly, onEnriched, onConfirmInstagram }: Props) {
  const base = useMemo(() => scoreProspectWithIcp(prospect, snapshot), [prospect, snapshot])
  const score = useMemo(() => explainProspectScore(prospect, snapshot, base), [prospect, snapshot, base])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AiSearchResult | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<LocalResearchProgress | null>(null)
  const [persistedStatus, setPersistedStatus] = useState('')
  const [suggestedInstagram, setSuggestedInstagram] = useState<{ profileUrl: string; evidenceUrl?: string; discoveredAt: string } | null>(null)
  const [confirmedInstagram, setConfirmedInstagram] = useState('')
  const failureTitles: Record<string, string> = {
    model_timeout: 'O Ollama excedeu o prazo deste lote.',
    model_out_of_memory: 'Memória insuficiente para o modelo neste lote.',
    model_invalid_output: 'O modelo não retornou dados no formato esperado.',
    model_unavailable: 'Ollama ou o modelo não estavam acessíveis.',
    model_failed: 'O modelo não concluiu a análise deste lote.',
    stage_timeout: 'A leitura dessa fonte excedeu o prazo.',
    stage_unavailable: 'A fonte ou serviço estava indisponível.',
    company_sources_unmatched: 'As páginas não foram associadas com segurança à empresa.',
    instagram_login_required: 'O Instagram exigiu login ou restringiu a leitura pública do perfil.',
    instagram_profile_unavailable: 'A tentativa direta de leitura do perfil não retornou conteúdo útil.',
    instagram_posts_unavailable: 'O perfil foi identificado, mas não foi possível ler textos de publicações.',
  }
  const completionPartial = result?.researchStatus === 'partial' ||
    Boolean(result?.stages?.some((step) => step.phaseStatus === 'failed')) ||
    (progress?.stage === 'completed' && progress.phaseStatus === 'failed')
  const phaseTitles: Record<LocalResearchProgress['stage'], string> = {
    discover: 'Preparando investigação', website: 'Lendo site cadastrado',
    web: 'Pesquisando outras páginas', instagram: 'Localizando perfil e publicações públicas',
    facts: 'Ollama analisando dados e contatos', signals: 'Ollama identificando eventos-gatilho',
    completed: 'Investigação concluída',
  }
  const abortRef = useRef<AbortController | null>(null)
  const review = useMemo(() => result ? crossSourceReview(prospect, result) : savedCrossSourceReview(prospect), [prospect, result])
  const applicable = useMemo(() => result ? confirmedEnrichmentResult(prospect, result) : null, [prospect, result])
  const observedApplicable = useMemo(() => result ? reviewEnrichmentResult(prospect, result, 'observed') : null, [prospect, result])
  const foundCount = review?.fields.filter((field) => !field.currentValue && (field.status === 'confirmed' || field.status === 'observed')).length ?? 0

  useEffect(() => {
    // Closing the review screen cancels only the browser polling; the Linux
    // worker keeps researching and the Supabase job keeps the stage checkpoints.
    abortRef.current?.abort()
    abortRef.current = null
    setResult(null)
    setError('')
    setProgress(null)
    setBusy(false)
    setPersistedStatus('')
    setSuggestedInstagram(null)
    setConfirmedInstagram('')
    let mounted = true
    const restore = async () => {
      const job = await recentLocalResearch(workspaceId, prospect.company, prospect.city).catch(() => null)
      if (!mounted || !job || abortRef.current) return
      setSuggestedInstagram(job.priorInstagramCandidate)
      setPersistedStatus(job.status)
      setProgress(job.progress ?? null)
      if (job.result) { setResult(job.result); setError('') }
      if (job.status === 'failed') {
        setError(job.errorCode === 'local_stage_timeout'
          ? 'Uma etapa excedeu o prazo. As fontes coletadas foram preservadas no Linux para nova tentativa.'
          : 'A investigação foi interrompida. Confira o terminal do conector Linux.')
      }
    }
    void restore()
    const interval = window.setInterval(() => void restore(), 7000)
    return () => { mounted = false; window.clearInterval(interval); abortRef.current?.abort() }
  }, [prospect.id, workspaceId])

  const run = async (instagramOverride?: string) => {
    if (busy || readOnly || persistedStatus === 'processing' || persistedStatus === 'queued') return
    if (!prospect.city.trim()) {
      setError('Confirme primeiro a cidade da empresa para pesquisar fontes da região correta.')
      return
    }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setBusy(true)
    setError('')
    setResult(null)
    setProgress(null)
    setPersistedStatus('queued')
    try {
      const status = await getLocalConnectorStatus(workspaceId)
      if (!status?.online) throw new Error('Conector Linux indisponível. Inicie o Garimpo local e verifique a conexão na aba Buscar.')
      // A batch of 5 gives Firecrawl up to 10 distinct web sources.
      // The output is filtered to the selected company, never to other leads.
      const name = prospect.company || prospect.name
      // Search engines receive short keywords, not model instructions or a full
      // company profile. Identity controls remain enforced when reviewing hits.
      const knownSite = prospect.website.trim()
      const safeWebsite = knownSite.startsWith('https://') ? knownSite
        : /^(?:www\.)?[a-z0-9-]+\.[a-z]{2,}/i.test(knownSite) ? 'https://' + knownSite : ''
      // The existing production queue forwards 'query' but strips unknown
      // fields. Preserve these optional hints until the backend is upgraded.
      const selectedInstagram = instagramOverride || confirmedInstagram || prospect.instagram.trim()
      const hints = [
        safeSite(safeWebsite) ? 'SITE_URL=' + encodeURIComponent(safeWebsite) : '',
        selectedInstagram ? 'INSTAGRAM=' + encodeURIComponent(selectedInstagram) : '',
      ].filter(Boolean)
      const query = ['endereço telefone site Instagram CNPJ cadastro empresarial', ...hints].join(' ').slice(0, 950)
      const response = await searchProspectsWithAi({
        organizationId: workspaceId,
        segment: name,
        city: prospect.city,
        query,
        source: 'manual',
        website: (() => {
          const site = prospect.website.trim()
          if (!site) return undefined
          const prepared = site.startsWith('https://') ? site : /^(?:www\.)?[a-z0-9-]+\.[a-z]{2,}/i.test(site) ? 'https://' + site : ''
          return safeSite(prepared) || undefined
        })(),
        instagram: selectedInstagram || undefined,
        limit: 5,
        execution: 'local',
      }, ctrl.signal, {
        keepRunningOnClose: true,
        onProgress: (value) => { if (!ctrl.signal.aborted) { setProgress(value); setPersistedStatus('processing') } },
      })
      if (!ctrl.signal.aborted) { setResult(response); setPersistedStatus('completed') }
    } catch (reason) {
      if (!ctrl.signal.aborted) {
        setError(reason instanceof Error ? reason.message : 'Não foi possível pesquisar domínios distintos.')
        setPersistedStatus('failed')
      }
    } finally {
      if (abortRef.current === ctrl) {
        abortRef.current = null
        setBusy(false)
      }
    }
  }

  const confirmAndInvestigate = async (rawUrl: string) => {
    if (readOnly || busy || persistedStatus === 'queued' || persistedStatus === 'processing') return
    const profile = reviewedInstagramProfile(rawUrl)
    if (!profile) { setError('O perfil encontrado não possui um endereço público válido do Instagram.'); return }
    const current = prospect.instagram.trim()
    const currentUrl = current.startsWith('@')
      ? reviewedInstagramProfile('https://www.instagram.com/' + current.slice(1) + '/')
      : reviewedInstagramProfile(current)
    if (current && currentUrl !== profile) {
      setError('O cadastro já possui outro Instagram. Confira primeiro em Editar dados para evitar substituir o perfil incorreto.')
      return
    }
    try {
      onConfirmInstagram(profile)
      setConfirmedInstagram(profile)
      setError('')
      await run(profile)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível confirmar o perfil Instagram.')
    }
  }

  const apply = (mode: 'confirmed' | 'observed' | 'research') => {
    const selected = mode === 'confirmed' ? applicable : mode === 'observed' ? observedApplicable
      : result ? researchOnlyEnrichmentResult(prospect, result) : null
    if (!selected || readOnly) return
    try {
      onEnriched(selected)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível registrar os campos encontrados.')
    }
  }

  const approvedInstagram = prospect.rawData.approvedInstagram as { profileUrl?: string } | undefined
  const currentInstagram = prospect.instagram.trim()
  const currentInstagramUrl = reviewedInstagramProfile(currentInstagram.startsWith('@')
    ? 'https://www.instagram.com/' + currentInstagram.slice(1) + '/'
    : currentInstagram)
  const reviewerConfirmedInstagram = Boolean(currentInstagramUrl && currentInstagramUrl === approvedInstagram?.profileUrl)

  const labels: Array<[string, number]> = [
    ['Aderência ao ICP', score.fit],
    ['Potencial comercial', score.opportunity],
    ['Cobertura de dados do cadastro', score.evidenceConfidence],
  ]
  return <section className="prospecting-g1g2" aria-label="Investigação e qualificação explicável">
    <header className="prospecting-g1g2__header">
      <div><span className="eyebrow"><Sparkles size={14} /> Garimpo Inteligente · G1 + G2</span>
        <h4>Análise comercial</h4>
        <p>Fontes, oportunidades e próximos passos para sua decisão.</p>
      </div>
      <span className={'prospecting-g1g2__decision is-' + score.decision}>{prospectDecisionLabel(score.decision)}</span>
    </header>
    <details className="garimpo-review__score-details">
      <summary><span><ShieldCheck size={14}/> Indicadores de qualificação</span>
        <span>Aderência <b>{score.fit}</b> · Potencial <b>{score.opportunity}</b> · Dados <b>{score.evidenceConfidence}</b></span></summary>
      <div className="prospecting-g1g2__dimensions">
      {labels.map(([label, value]) => <div key={label} className="prospecting-g1g2__dimension">
        <span>{label}</span><strong>{value}<small>/100</small></strong>
        <div className="prospecting-g1g2__meter" aria-label={label + ' ' + value + ' de 100'}><i style={{ width: value + '%' }} /></div>
      </div>)}
    </div>
    <p className="prospecting-g1g2__note">Pontuações baseadas no ICP e na qualidade do cadastro; não são probabilidades de compra. Score anterior: {score.existingScore}/100. Não equivalem a confirmação externa.</p>
    {score.reasons.length ? <div className="prospecting-g1g2__detail"><strong><ShieldCheck size={14}/> Sinais do cadastro</strong>
      <ul>{score.reasons.map((reason, i) => <li key={i}>{cadastroSignalLabel(reason)}</li>)}</ul>
    </div> : null}
    {score.uncertainties.length ? <div className="prospecting-g1g2__detail is-warning"><strong><AlertTriangle size={14}/> O que ainda não sabemos</strong>
      <ul>{score.uncertainties.map((reason, i) => <li key={i}>{reason}</li>)}</ul>
    </div> : null}
    <details className="prospecting-g1g2__evidence"><summary>Ver origem dos dados cadastrados ({score.evidence.length})</summary>
      <ul>{score.evidence.map((e, i) => <li key={i}><strong>{e.type === 'gap' ? 'Pendente' : e.type === 'inference' ? 'Inferência' : 'Informado'}</strong> · {e.label} <small>({e.source})</small></li>)}</ul>
    </details>
    </details>

    <div className="prospecting-g1g2__investigate garimpo-cross-source__action">
      <div><strong>Verificação cruzada · Firecrawl + Ollama</strong>
        <small>Investiga fontes públicas e tenta analisar publicações acessíveis. Dados sem comprovação permanecem para revisão.</small>
      </div>
      <Button variant="secondary" disabled={busy || readOnly || persistedStatus === 'processing' || persistedStatus === 'queued'} onClick={() => void run()}>
        {busy ? <LoaderCircle size={15} className="spin"/> : <SearchCheck size={15}/>}
        {busy || persistedStatus === 'processing' || persistedStatus === 'queued'
          ? 'Investigando no Linux…' : result ? 'Investigar novamente' : 'Investigar automaticamente'}
      </Button>
    </div>
    {progress ? <div className="garimpo-cross-source__stage-status" role="status">
      <strong>{progress.stage === 'completed' && completionPartial
        ? 'Investigação concluída parcialmente'
        : phaseTitles[progress.stage] + ' · ' +
          (progress.phaseStatus === 'running' ? 'em andamento' : progress.phaseStatus === 'failed' ? 'etapa indisponível' : 'concluída')}</strong>
      <span>{progress.sourceCount} fonte(s) coletada(s) · {progress.leadCount} empresa(s) analisada(s).</span>
      {progress.phaseStatus === 'running' ? <small>O conector Linux continua processando enquanto estiver aberto.</small> : null}
    </div> : busy ? <p className="garimpo-cross-source__progress" role="status">Preparando pesquisa em etapas. Mantenha o conector Linux aberto.</p> : null}
    {result?.commercialBrief ? <section className="garimpo-g6-brief" aria-label="Diagnóstico comercial do Garimpo G6">
      <div className="garimpo-g6-brief__top">
        <strong><Sparkles size={15}/> Diagnóstico comercial</strong>
        <small>{result.commercialBrief.status === 'evidence_based'
          ? result.commercialBrief.knownFacts.length + ' fato(s) com fonte' : 'Evidência insuficiente'}</small>
      </div>
      <p>{result.commercialBrief.summary}</p>
      {result.commercialBrief.hypotheses.length ? <div className="garimpo-g6-brief__hypothesis">
        <strong>Hipótese para validar</strong>
        <p>{result.commercialBrief.hypotheses[0]}</p>
      </div> : null}
      {result.commercialBrief.questions.length ? <div className="garimpo-g6-brief__questions">
        <strong>Perguntas sugeridas</strong>
        <ul>{result.commercialBrief.questions.slice(0, 3).map((question, i) =>
          <li key={i}>{question}</li>)}</ul>
      </div> : null}
      <div className="garimpo-g6-brief__next">
        <strong>Próxima ação</strong>
        <p>{result.commercialBrief.recommendedAction}</p>
      </div>
      <details className="garimpo-g6-brief__details">
        <summary>Plano de investigação, lacunas e fontes</summary>
        {result.researchPlan ? <div>
          <strong>Pesquisa por segmento: {result.researchPlan.segment}</strong>
          <small>{result.researchPlan.strategy === 'ollama_bounded'
            ? 'Prioridades ordenadas pelo Ollama; consultas delimitadas e verificáveis.'
            : 'Plano setorial seguro, sem depender da resposta da IA.'}</small>
          <ul>{result.researchPlan.queries.map((query, i) => <li key={i}>{query}</li>)}</ul>
        </div> : null}
        {result.commercialBrief.missing.length ? <p><strong>Campos pendentes:</strong> {result.commercialBrief.missing.join(' · ')}</p> : null}
        {result.commercialBrief.knownFacts.length ? <ul>{result.commercialBrief.knownFacts.map((fact, i) => <li key={i}>
          <strong>{fact.label}:</strong> {fact.value}
          {safeSite(fact.sourceUrl) ? <a href={fact.sourceUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={12}/> fonte</a> : null}
        </li>)}</ul> : null}
        {result.commercialBrief.researchLimits.map((limitation, i) =>
          <small key={i}>{limitation}</small>)}
      </details>
    </section> : null}
    {result?.stages?.some((step) => step.phaseStatus === 'failed') ? <details className="garimpo-cross-source__partial-detail">
      <summary>Etapas que precisam de atenção ({result.stages.filter((step) => step.phaseStatus === 'failed').length})</summary>
      <ul>{result.stages.filter((step) => step.phaseStatus === 'failed').map((step, index) =>
        <li key={step.stage + index}><strong>{phaseTitles[step.stage] || step.stage}:</strong> {failureTitles[step.errorCode || ''] || 'Falha técnica não classificada. Os dados coletados foram preservados.'}</li>)}</ul>
    </details> : null}
    {!prospect.instagram.trim() && suggestedInstagram?.profileUrl && <section className="garimpo-cross-source__instagram-approval" aria-label="Confirmar Instagram encontrado">
      <div>
        <strong>Perfil do Instagram encontrado em uma pesquisa anterior</strong>
        <p>O Garimpo havia encontrado <strong>@{suggestedInstagram.profileUrl.split('/').filter(Boolean).at(-1)}</strong>. Uma nova busca sem resultado não descarta esse candidato. Confirme apenas se você reconhece que a conta pertence à empresa.</p>
        <a href={suggestedInstagram.profileUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/> Abrir o perfil para conferir</a>
        {suggestedInstagram.evidenceUrl && safeSite(suggestedInstagram.evidenceUrl) ?
          <a href={suggestedInstagram.evidenceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/> Fonte da descoberta</a> : null}
      </div>
      <Button variant="primary" disabled={readOnly || busy || persistedStatus === 'queued' || persistedStatus === 'processing'}
        onClick={() => void confirmAndInvestigate(suggestedInstagram.profileUrl)}>
        <ShieldCheck size={15}/> Confirmar perfil e investigar
      </Button>
      <small>O aceite salva o Instagram no cadastro e inicia uma nova pesquisa. Ele confirma sua escolha, não garante acesso às publicações privadas ou bloqueadas.</small>
    </section>}
    {prospect.instagram.trim() && <p className="garimpo-cross-source__instagram-saved">
      <ShieldCheck size={14}/> {reviewerConfirmedInstagram ? 'Instagram confirmado nesta revisão:' : 'Instagram registrado no cadastro:'} <strong>{prospect.instagram}</strong>
    </p>}
    {result?.instagramDiscovery ? <section className="garimpo-cross-source__instagram garimpo-review__instagram-compact" aria-label="Descoberta do perfil Instagram">
      <div className="garimpo-review__instagram-heading">
        <strong>Instagram · {result.instagramDiscovery.postCount > 0 ? 'Publicações analisáveis' : 'Perfil identificado'}</strong>
        <small>{result.instagramDiscovery.postCount} post(s) lido(s) · {result.instagramDiscovery.profileAccess === 'blocked' ? 'Acesso restrito' : result.instagramDiscovery.profileAccess === 'bio_only' ? 'Somente bio acessível' : result.instagramDiscovery.profileAccess === 'readable' ? 'Perfil acessado' : 'Acesso parcial ou não verificado'}</small>
      </div>
      {result.instagramDiscovery.profileUrl && safeSite(result.instagramDiscovery.profileUrl) ? <a href={result.instagramDiscovery.profileUrl} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={13}/> Abrir Instagram da empresa
      </a> : null}
      <details className="garimpo-review__instagram-details"><summary>Ver diagnóstico da leitura</summary>
      <p>{result.instagramDiscovery.status === 'linked'
        ? 'Perfil vinculado a uma página conhecida da empresa; confira se é realmente o perfil utilizado pelo negócio.'
        : result.instagramDiscovery.status === 'candidate'
          ? 'Encontramos um possível perfil pelos buscadores. A identidade ainda precisa ser conferida.'
          : result.instagramDiscovery.status === 'provided'
            ? (reviewerConfirmedInstagram
              ? 'Perfil associado à empresa por confirmação humana; publicações dependem de acesso público.'
              : 'Perfil informado no cadastro; ainda não confirmado por fonte independente.')
            : result.instagramDiscovery.status === 'unavailable'
              ? 'A busca pelo perfil não respondeu. O sistema preservou os demais resultados.'
              : suggestedInstagram?.profileUrl
              ? 'A busca mais recente não encontrou um perfil novo. Mantivemos acima o candidato de uma pesquisa anterior para sua confirmação.'
              : 'Nenhum perfil foi associado com segurança à empresa. Não atribuímos contas apenas por semelhança de nomes.'}</p>
      {result.instagramDiscovery.profileUrl && safeSite(result.instagramDiscovery.profileUrl) ? <a href={result.instagramDiscovery.profileUrl} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={13}/> Ver perfil encontrado
      </a> : <small>Você pode informar o endereço do perfil em “Editar dados” e repetir a investigação. É opcional.</small>}
      <div className="garimpo-cross-source__instagram-access">
        <strong>{result.instagramDiscovery.profileAccess === 'readable' ? 'Perfil público acessado'
          : result.instagramDiscovery.profileAccess === 'bio_only' ? 'Bio acessível; posts não recuperados'
          : result.instagramDiscovery.profileAccess === 'blocked' ? 'Instagram exigiu login ou restringiu o acesso'
          : result.instagramDiscovery.profileAccess === 'unavailable' ? 'Tentativa de leitura sem conteúdo utilizável'
          : 'Leitura direta do perfil ainda não verificada'}</strong>
        <span>{result.instagramDiscovery.postLinksFound ?? 0} link(s) de postagem · {result.instagramDiscovery.postCount} publicação(ões) com texto realmente lido.</span>
        {result.instagramDiscovery.profileAccess === 'blocked' ? <small>O Garimpo não tenta contornar o login ou restrições de acesso. As outras fontes continuam disponíveis.</small> : null}
      </div>
      {result.instagramDiscovery.profileExcerpt ? <details><summary>Ver trecho público do perfil</summary>
        <p className="garimpo-cross-source__instagram-excerpt">{result.instagramDiscovery.profileExcerpt}</p>
      </details> : null}
      {result.instagramDiscovery.contentSummary && result.instagramDiscovery.postCount > 0 ? <div className="garimpo-cross-source__instagram-summary">
        <strong>Resumo comercial das publicações acessíveis</strong>
        <p>{result.instagramDiscovery.contentSummary}</p>
        <small>Síntese textual sugerida pelo Ollama. Imagens e vídeos não foram analisados; confirme o conteúdo nas fontes.</small>
        <div className="garimpo-cross-source__links">
          {(result.instagramDiscovery.readablePostUrls || []).filter((url) => safeSite(url)).map((url) =>
            <a href={url} key={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/> Publicação fonte</a>)}
        </div>
      </div> : null}
      {result.instagramDiscovery.readablePostExcerpts?.length ? <details className="garimpo-cross-source__instagram-excerpts">
        <summary>Ver textos públicos realmente coletados ({result.instagramDiscovery.readablePostExcerpts.length})</summary>
        <ul>{result.instagramDiscovery.readablePostExcerpts.map((post) =>
          <li key={post.url}><p>{post.excerpt}</p>
            {safeSite(post.url) ? <a href={post.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={13}/> Abrir publicação original</a> : null}
          </li>)}</ul>
      </details> : null}
      {!result.instagramDiscovery.postCount ? <small>Nenhuma legenda ou texto de publicação foi recuperado. A confirmação do perfil não libera posts restritos.</small> : null}
      </details>
      {result.instagramDiscovery.contentSummary && result.instagramDiscovery.postCount > 0 ?
        <p className="garimpo-review__ig-insight">{result.instagramDiscovery.contentSummary}</p> : null}
    </section> : null}
    {error ? <p className="prospecting-g1g2__error" role="alert">{error}</p> : null}

    {review ? <div className="garimpo-cross-source" aria-live="polite">
      {review.matched ? <>
        <div className="garimpo-cross-source__counts">
          <span className="is-confirmed"><strong>{review.confirmed}</strong> Confirmados</span>
          <span className="is-divergent"><strong>{review.divergent}</strong> Divergentes</span>
          <span className="is-observed"><strong>{review.observed}</strong> Uma fonte</span>
          <span className="is-pending"><strong>{review.pending}</strong> Pendentes</span>
        </div>
        <p className="garimpo-cross-source__note">Evidências de <strong>{prospect.company}</strong>; dados divergentes exigem decisão antes de alterar o cadastro.</p>
        {groups.map((group) => {
          const found = review.fields.filter((field) => field.status === group.status)
          if (!found.length) return null
          const content = <ul>{found.map((field) => <EvidenceRow key={field.field} field={field}/>)}</ul>
          return group.status === 'divergent'
            ? <section className="garimpo-cross-source__group is-divergent" key={group.status}>
                <h5>{group.title} ({found.length})</h5>{content}
              </section>
            : <details className={'garimpo-cross-source__group garimpo-review__evidence-details is-' + group.status} key={group.status}>
                <summary>{group.title} ({found.length})</summary>{content}
              </details>
        })}
        <section className="garimpo-cross-source__triggers garimpo-review__triggers" aria-label="Conteúdo público e eventos-gatilho">
          <header><strong>Eventos e oportunidades</strong>{review.signals.length ? <small>{review.signals.length} sinal(is) com fonte para conferir.</small> : null}</header>
          {review.signals.length ? <ul>
            {review.signals.map((signal, index) => <li key={signal.sourceUrl + index}>
              <div><strong>{signal.title}</strong><small>{signal.channel === 'instagram' ? 'Instagram público' : signal.channel === 'website' ? 'Website / notícia' : 'Fonte pública'}{signal.eventDate ? ' · ' + signal.eventDate : ' · Data não confirmada'}</small></div>
              <p>{signal.excerpt}</p>
              {safeSite(signal.sourceUrl) ? <a href={safeSite(signal.sourceUrl)!} target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/> Abrir publicação ou fonte</a> : null}
            </li>)}
          </ul> : <p>Sem eventos-gatilho comprovados nesta pesquisa.</p>}
        </section>
        {review.pending ? <details className="garimpo-cross-source__pending"><summary>Dados ainda não verificados ({review.pending})</summary>
          <p>{review.fields.filter((field) => field.status === 'pending').map((field) => field.label).join(' · ')}</p>
        </details> : null}
        {review.sources.length ? <details className="garimpo-cross-source__pending"><summary>Fontes utilizadas como evidência ({review.sources.length})</summary>
          <ul>{review.sources.map((source) => safeSite(source.url) ? <li key={source.url}><a href={safeSite(source.url)!} target="_blank" rel="noopener noreferrer"><ExternalLink size={12}/>{source.title || new URL(source.url).hostname}</a></li> : null)}</ul>
        </details> : null}
        <footer className="garimpo-cross-source__footer">
          {result && !readOnly ? <Button variant="secondary" onClick={() => apply('research')}>Salvar análise e sinais no cadastro (sem alterar os campos)</Button> : null}
          {applicable && !readOnly ? <Button variant="secondary" onClick={() => apply('confirmed')}>
            Preencher {review.importable.length} campo(s) corroborados
          </Button> : null}
          {observedApplicable && !readOnly ? <Button variant="secondary" onClick={() => apply('observed')}>
            Preencher {foundCount} dado(s) com fonte (ainda sem confirmação independente)
          </Button> : <small>Nenhum novo campo seguro para preenchimento. Os dados já cadastrados foram preservados.</small>}
          <small>Alterações no cadastro exigem sua confirmação.</small>
        </footer>
      </> : <p role="status">A pesquisa terminou, mas não encontrou evidências que identifiquem com segurança <strong>{prospect.company}</strong>. Nenhuma informação foi atribuída a esta empresa.</p>}
      {review.warnings.length ? <details className="garimpo-cross-source__pending"><summary>Limitações da pesquisa ({review.warnings.length})</summary>
        <ul>{review.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>
      </details> : null}
    </div> : null}
  </section>
}
