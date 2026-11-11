import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ExternalLink, LoaderCircle, SearchCheck, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '../../components/ui/button'
import type { WorkspaceSnapshot } from '../../domain/types'
import type { ProspectRecord } from '../../services/prospecting-workspace'
import { explainProspectScore, prospectDecisionLabel } from '../../services/prospecting-g1g2-intelligence'
import { scoreProspectWithIcp } from '../../services/prospecting-intelligence'
import { getLocalConnectorStatus, searchProspectsWithAi, recentLocalResearch, type LocalResearchProgress, type AiSearchResult } from '../../services/prospecting-ai'
import { confirmedEnrichmentResult, reviewEnrichmentResult, researchOnlyEnrichmentResult, crossSourceReview, savedCrossSourceReview, type CrossSourceField } from '../../services/prospecting-cross-source-review'
import './prospecting-cross-source-review.css'

interface Props {
  prospect: ProspectRecord
  snapshot: WorkspaceSnapshot
  workspaceId: string
  readOnly: boolean
  onEnriched(result: AiSearchResult): void
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

export function ProspectingG1G2Panel({ prospect, snapshot, workspaceId, readOnly, onEnriched }: Props) {
  const base = useMemo(() => scoreProspectWithIcp(prospect, snapshot), [prospect, snapshot])
  const score = useMemo(() => explainProspectScore(prospect, snapshot, base), [prospect, snapshot, base])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AiSearchResult | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<LocalResearchProgress | null>(null)
  const [persistedStatus, setPersistedStatus] = useState('')
  const phaseTitles: Record<LocalResearchProgress['stage'], string> = {
    discover: 'Preparando investigação', website: 'Lendo site cadastrado',
    web: 'Pesquisando outras páginas', instagram: 'Buscando publicações públicas',
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
    let mounted = true
    const restore = async () => {
      const job = await recentLocalResearch(workspaceId, prospect.company, prospect.city).catch(() => null)
      if (!mounted || !job) return
      setPersistedStatus(job.status)
      if (job.progress) setProgress(job.progress)
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
  }, [prospect.id, prospect.updatedAt, workspaceId])

  const run = async () => {
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
      const hints = [
        safeSite(safeWebsite) ? 'SITE_URL=' + encodeURIComponent(safeWebsite) : '',
        prospect.instagram.trim() ? 'INSTAGRAM=' + encodeURIComponent(prospect.instagram.trim()) : '',
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
        instagram: prospect.instagram.trim() || undefined,
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

  const labels: Array<[string, number]> = [
    ['Aderência ao ICP', score.fit],
    ['Potencial comercial', score.opportunity],
    ['Cobertura de dados do cadastro', score.evidenceConfidence],
  ]
  return <section className="prospecting-g1g2" aria-label="Investigação e qualificação explicável">
    <header className="prospecting-g1g2__header">
      <div><span className="eyebrow"><Sparkles size={14} /> Garimpo Inteligente · G1 + G2</span>
        <h4>Por que investigar esta empresa?</h4>
        <p>Uma leitura comercial, sem confundir presença digital com intenção de compra.</p>
      </div>
      <span className={'prospecting-g1g2__decision is-' + score.decision}>{prospectDecisionLabel(score.decision)}</span>
    </header>
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

    <div className="prospecting-g1g2__investigate garimpo-cross-source__action">
      <div><strong>Verificação cruzada · Firecrawl + Ollama</strong>
        <small>Lê o site cadastrado, procura outras fontes e posts públicos do Instagram. Ollama identifica evidências e possíveis eventos-gatilho. O preenchimento exige fonte; a decisão continua humana.</small>
      </div>
      <Button variant="secondary" disabled={busy || readOnly || persistedStatus === 'processing' || persistedStatus === 'queued'} onClick={() => void run()}>
        {busy ? <LoaderCircle size={15} className="spin"/> : <SearchCheck size={15}/>}
        {busy || persistedStatus === 'processing' || persistedStatus === 'queued'
          ? 'Investigando no Linux…' : result ? 'Investigar novamente' : 'Investigar automaticamente'}
      </Button>
    </div>
    {progress ? <div className="garimpo-cross-source__stage-status" role="status">
      <strong>{phaseTitles[progress.stage]} · {progress.phaseStatus === 'running' ? 'em andamento' : progress.phaseStatus === 'failed' ? 'etapa indisponível' : 'concluída'}</strong>
      <span>{progress.sourceCount} fonte(s) coletada(s) · {progress.leadCount} empresa(s) analisada(s).</span>
      <small>As etapas finalizadas são preservadas no Linux. Você pode sair desta página; a investigação continuará enquanto o conector estiver aberto.</small>
    </div> : busy ? <p className="garimpo-cross-source__progress" role="status">Preparando pesquisa em etapas. Mantenha o conector Linux aberto.</p> : null}
    {error ? <p className="prospecting-g1g2__error" role="alert">{error}</p> : null}

    {review ? <div className="garimpo-cross-source" aria-live="polite">
      {review.matched ? <>
        <div className="garimpo-cross-source__counts">
          <span className="is-confirmed"><strong>{review.confirmed}</strong> Confirmados</span>
          <span className="is-divergent"><strong>{review.divergent}</strong> Divergentes</span>
          <span className="is-observed"><strong>{review.observed}</strong> Uma fonte</span>
          <span className="is-pending"><strong>{review.pending}</strong> Pendentes</span>
        </div>
        <p className="garimpo-cross-source__note">Resultados referentes somente a <strong>{prospect.company}</strong>. Os links permitem conferir as evidências antes de qualquer alteração.</p>
        {groups.map((group) => {
          const found = review.fields.filter((field) => field.status === group.status)
          return found.length ? <section className={'garimpo-cross-source__group is-' + group.status} key={group.status}>
            <h5>{group.title} ({found.length})</h5>
            <ul>{found.map((field) => <EvidenceRow key={field.field} field={field}/>)}</ul>
          </section> : null
        })}
        <section className="garimpo-cross-source__triggers" aria-label="Conteúdo público e eventos-gatilho">
          <header><strong>Conteúdo público e eventos-gatilho</strong><small>Publicações, eventos, contratações, expansão e outros sinais comerciais observáveis. Sinal não significa intenção de compra.</small></header>
          {review.signals.length ? <ul>
            {review.signals.map((signal, index) => <li key={signal.sourceUrl + index}>
              <div><strong>{signal.title}</strong><small>{signal.channel === 'instagram' ? 'Instagram público' : signal.channel === 'website' ? 'Website / notícia' : 'Fonte pública'}{signal.eventDate ? ' · ' + signal.eventDate : ' · Data não confirmada'}</small></div>
              <p>{signal.excerpt}</p>
              {safeSite(signal.sourceUrl) ? <a href={safeSite(signal.sourceUrl)!} target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/> Abrir publicação ou fonte</a> : null}
            </li>)}
          </ul> : <p>Nenhum evento-gatilho foi comprovado nas publicações acessíveis desta pesquisa. Isso não significa que a empresa não tenha publicado conteúdo.</p>}
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
          <small>O preenchimento não aprova a empresa nem altera campos existentes. Confirme os dados de uma única fonte antes de enviar ao CRM.</small>
        </footer>
      </> : <p role="status">A pesquisa terminou, mas não encontrou evidências que identifiquem com segurança <strong>{prospect.company}</strong>. Nenhuma informação foi atribuída a esta empresa.</p>}
      {review.warnings.length ? <details className="garimpo-cross-source__pending"><summary>Limitações da pesquisa ({review.warnings.length})</summary>
        <ul>{review.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>
      </details> : null}
    </div> : null}
  </section>
}
