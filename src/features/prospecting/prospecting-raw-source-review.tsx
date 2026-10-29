import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ExternalLink, Filter, Search, X } from 'lucide-react'
import type { ProspectingAgentJob } from '../../services/prospecting-linux-agent'
import type { CaptureDraft, ProspectRecord } from '../../services/prospecting-workspace'

export type RawSourceDecision = 'ignored' | 'promoted'
type RawSource = NonNullable<ProspectingAgentJob['sourceLog']>[number]
type ReviewSource = RawSource & { key: string }
export type RawSourceScope = 'all' | 'raw' | 'filtered' | 'duplicates'
const sourceScope = (row: ReviewSource): Exclude<RawSourceScope, 'all'> =>
  row.type === 'rejected' ? 'filtered' : row.type === 'duplicate' ? 'duplicates' : 'raw'

const clean = (value: string | undefined) => String(value || '').trim()
const httpUrl = (value: string) => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : ''
  } catch { return '' }
}
export const rawSourceKey = (jobId: string, row: Pick<RawSource, 'url' | 'name' | 'provider'>) =>
  jobId + '::' + (clean(row.url).toLowerCase().replace(/\/$/, '') || (clean(row.name) + ':' + clean(row.provider)).toLowerCase())

const uniqueSources = (job: ProspectingAgentJob | null): ReviewSource[] => {
  if (!job) return []
  const indexed = new Map<string, ReviewSource>()
  // Também incluir rejeições armazenadas fora do sourceLog. Algumas buscas registram
  // somente a rejeição estruturada e antes elas ficavam invisíveis na triagem.
  const sources: RawSource[] = [
    ...(job.sourceLog || []),
    ...(job.rejections || [])
      .filter((rejection) => !(job.sourceLog || []).some((row) =>
        row.type === 'rejected' && row.name === rejection.name && row.provider === rejection.source))
      .map((rejection) => ({ type: 'rejected' as const, name: rejection.name,
        provider: rejection.source, reason: rejection.reason, at: rejection.at })),
  ]
  for (const row of sources) {
    if (!['raw', 'candidate', 'rejected', 'duplicate'].includes(row.type)) continue
    const key = rawSourceKey(job.id, row)
    const before = indexed.get(key)
    indexed.set(key, {
      ...row,
      reason: row.type === 'rejected' ? row.reason : before?.reason || row.reason,
      type: before?.type === 'candidate' ? 'candidate' : row.type === 'candidate' ? 'candidate' : before?.type === 'raw' ? 'raw' : row.type,
      key,
    })
  }
  return [...indexed.values()]
}
export const rawSourceReviewCount = (job: ProspectingAgentJob | null) => uniqueSources(job).length

const EMPTY_DRAFT = { company: '', city: '', address: '', phone: '', email: '', website: '', instagram: '', cnpj: '', description: '', notes: '' }
type ReviewDraft = typeof EMPTY_DRAFT
const normalizeName = (value: string | undefined) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, ' ').trim()
const normalizeUrl = (value: string | undefined) => httpUrl(clean(value)).replace(/\/$/, '').toLowerCase()
const genericSourceTitle = (name: string) =>
  /\b(?:melhores|lista|listagem|diret[oó]rio|guia|op[cç][oõ]es|ranking|encontre|top\s*\d+|perto de mim)\b/i.test(name)
  || /^(?:barbearias(?:\s*\/\s*barbeiros)?|barbeiros|empresas|profissionais|sal[oõ]es|servi[cç]os)\b/i.test(name)
  || /^barbearia\s+(?:em|no|na|de|para)\b/i.test(name)
  || /^\d+\s+(?:op[cç][oõ]es|resultados|melhores)\b/i.test(name)

export function suggestBusinessNameFromTitle(source: Pick<RawSource, 'name' | 'type'>): string {
  if (source.type === 'rejected' || source.type === 'duplicate') return ''
  const title = clean(source.name)
  if (!title || genericSourceTitle(title)) return ''
  // Remover somente sufixos editoriais e handles sociais; nunca tomar URL de diretório como website oficial.
  const first = title
    .replace(/\s*\(@[\w.]+\)/g, '')
    .split(/\s+(?:[-–|])\s+/)[0]
    .replace(/\s+em\s+Rio Grande(?:\s*[-/]\s*RS)?$/i, '')
    .trim()
  return first.length >= 4 && first.length <= 90 && !genericSourceTitle(first) ? first : ''
}

export function matchingCandidate(source: Pick<RawSource, 'name' | 'url' | 'type'>, job: ProspectingAgentJob | null): (CaptureDraft & { candidateId?: string }) | null {
  if (!job || source.type === 'rejected' || source.type === 'duplicate') return null
  const sourceName = normalizeName(source.name)
  const sourceUrl = normalizeUrl(source.url)
  const matches = job.results.filter((candidate) => {
    const candidateName = normalizeName(String(candidate.company || candidate.name || ''))
    const candidateUrl = normalizeUrl(String(candidate.sourceUrl || candidate.website || ''))
    return (sourceName && candidateName && sourceName === candidateName)
      || (sourceUrl && candidateUrl && sourceUrl === candidateUrl)
  })
  return matches.length === 1 ? matches[0] : null
}

export function prepareSourceReview(source: Pick<RawSource, 'name' | 'url' | 'type' | 'reason'>, candidate: CaptureDraft | null, region = ''): ReviewDraft {
  const suggested = candidate?.company || candidate?.name || suggestBusinessNameFromTitle(source)
  return {
    company: clean(String(suggested || '')), city: clean(String(candidate?.city || region)),
    address: clean(String(candidate?.address || '')), phone: clean(String(candidate?.phone || '')),
    email: clean(String(candidate?.email || '')), website: clean(String(candidate?.website || '')),
    instagram: clean(String(candidate?.instagram || '')), cnpj: clean(String(candidate?.cnpj || '')),
    description: clean(String(candidate?.description || '')), notes: clean(source.reason),
  }
}

export function RawSourceReview({
  job, prospects, decisions, disabled, onDecision, onPromote, onShowCompanies, onOpenProspect, initialScope = 'all',
}: {
  job: ProspectingAgentJob | null
  prospects: ProspectRecord[]
  initialScope?: RawSourceScope
  decisions: Record<string, RawSourceDecision>
  disabled: boolean
  onDecision: (key: string, decision: RawSourceDecision | null) => void
  onPromote: (source: ReviewSource, data: CaptureDraft) => boolean
  onShowCompanies: () => void
  onOpenProspect: (id: string) => void
}) {
  const sources = useMemo(() => uniqueSources(job), [job])
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<RawSourceScope>(initialScope)
  useEffect(() => { setScope(initialScope) }, [initialScope])
  const [includeIgnored, setIncludeIgnored] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [visible, setVisible] = useState(24)
  const results = useMemo(() => sources.filter((row) => {
    if (scope !== 'all' && sourceScope(row) !== scope) return false
    if (!includeIgnored && decisions[row.key]) return false
    const text = [row.name, row.url, row.provider, row.reason].join(' ').toLocaleLowerCase('pt-BR')
    return text.includes(query.trim().toLocaleLowerCase('pt-BR'))
  }), [sources, decisions, includeIgnored, query, scope])
  const ignored = sources.filter((row) => decisions[row.key] === 'ignored').length
  const promoted = sources.filter((row) => decisions[row.key] === 'promoted').length
  const current = sources.find((source) => source.key === selected) || null
  const candidates = useMemo(() => new Map(sources.map(source => [source.key, matchingCandidate(source, job)])), [sources, job])
  const currentCandidate = current ? candidates.get(current.key) ?? null : null
  const findStored = (source: ReviewSource) => {
    const candidate = candidates.get(source.key)
    if (!candidate) return null
    const sameJob = prospects.filter(prospect => String(prospect.rawData.agentJobId || '') === job?.id)
    const matching = sameJob.filter(prospect =>
      (candidate.candidateId && String(prospect.rawData.candidateId || '') === candidate.candidateId)
      || normalizeName(prospect.company) === normalizeName(String(candidate.company || candidate.name || '')))
    return matching.length === 1 && ['new', 'analyzing', 'review', 'approved'].includes(matching[0].status) ? matching[0] : null
  }
  const openReview = (source: ReviewSource) => {
    const existing = findStored(source)
    if (existing) { onOpenProspect(existing.id); return }
    setSelected(source.key)
    setDraft(prepareSourceReview(source, candidates.get(source.key) ?? null, job?.input?.regions?.[0] || ''))
  }
  const submit = () => {
    if (!current || !draft.company.trim()) return
    const data: CaptureDraft = {
      company: draft.company.trim(),
      name: draft.company.trim(),
      city: draft.city.trim(),
      address: draft.address.trim(),
      instagram: draft.instagram.trim(),
      cnpj: draft.cnpj.trim(),
      description: draft.description.trim(),
      phone: draft.phone.trim(),
      email: draft.email.trim(),
      website: draft.website.trim(),
      notes: [draft.notes.trim(), 'Título público consultado: ' + current.name, 'URL de origem: ' + (current.url || 'não disponível')].filter(Boolean).join('\n'),
      source: 'manual',
      sourceDetail: 'Fonte pública conferida, aguardando validação comercial',
      evidence: currentCandidate?.evidence || [],
      provider: 'web_discovery',
      sourceUrl: current.url,
      sourceTitle: current.name,
      sourceReviewKey: current.key,
      sourceReviewJobId: job?.id,
      placeType: 'unknown',
      placeConfidence: 0,
      locationVerified: false,
    }
    if (onPromote(current, data)) {
      setSelected(null)
      setDraft(EMPTY_DRAFT)
    }
  }
  return <section className="prospecting-raw-review" aria-label="Triagem humana das fontes brutas">
    <header className="prospecting-raw-review__header">
      <div>
        <span className="eyebrow">Revisar · fontes e evidências da execução</span>
        <h3>Triagem das fontes coletadas</h3>
        <p>Resultados brutos, candidatos, documentos filtrados e duplicidades ficam aqui para conferência. Uma fonte só vira empresa em revisão depois da sua confirmação; nada é enviado automaticamente ao CRM.</p>
      </div>
      <button type="button" onClick={onShowCompanies}>Ver empresas revisadas <ArrowRight size={15}/></button>
    </header>
    <div className="prospecting-raw-review__summary">
      <span><strong>{sources.length}</strong> fontes individuais disponíveis</span>
      <span><strong>{ignored}</strong> ignoradas</span>
      <span><strong>{promoted}</strong> adicionadas à revisão</span>
      <span><strong>{results.length}</strong> no filtro atual</span>
    </div>
    {job && Number(job.stats.webDocuments || job.stats.discovered || 0) > sources.length ? <p className="prospecting-raw-review__notice">Esta execução contabilizou mais ocorrências do que fontes individuais armazenadas. Buscas antigas podem ter apenas os totais; o histórico de fontes é limitado e não é equivalente à contagem de empresas.</p> : null}
    <div className="prospecting-raw-review__tools">
      <div role="group" aria-label="Tipo de fonte" className="prospecting-raw-review__scope">
        {([['all', 'Todas as fontes'], ['raw', 'Dados brutos'], ['filtered', 'Filtrados'], ['duplicates', 'Duplicidades']] as Array<[RawSourceScope, string]>).map(([value, label]) =>
          <button type="button" key={value} aria-pressed={scope === value} className={scope === value ? 'is-active' : ''} onClick={() => { setScope(value); setVisible(24) }}>{label} <span>{sources.filter(row => value === 'all' || sourceScope(row) === value).length}</span></button>
        )}
      </div>
      <label><Search size={16}/><input aria-label="Buscar nas fontes brutas" placeholder="Buscar nome, site, Instagram ou motivo" value={query} onChange={(e) => { setQuery(e.target.value); setVisible(24) }}/></label>
      <label className="prospecting-raw-review__toggle"><input type="checkbox" checked={includeIgnored} onChange={(e) => setIncludeIgnored(e.target.checked)}/><Filter size={14}/> Mostrar já analisadas</label>
    </div>
    {!sources.length ? <p className="prospecting-raw-review__empty">Não há fontes individuais registradas nesta execução. Em pesquisas antigas, o motor pode ter salvo apenas as contagens; uma nova pesquisa registrará as fontes disponíveis.</p> : !results.length ? <p className="prospecting-raw-review__empty">Nenhuma fonte corresponde ao filtro. Ative “Mostrar já analisadas” para ver também as decisões anteriores.</p> : <div className="prospecting-raw-review__grid">
      {results.slice(0, visible).map((row) => <article key={row.key} className="prospecting-raw-review__card">
        <div className="prospecting-raw-review__card-top">
          <strong>{row.name || 'Fonte sem título'}</strong>
          {httpUrl(clean(row.url)) ? <a href={httpUrl(clean(row.url))} target="_blank" rel="noopener noreferrer">Ver origem <ExternalLink size={13}/></a> : null}
        </div>
        <small>{row.provider || 'Web pública'} · {row.type === 'rejected' ? 'Filtrada automaticamente' : row.type === 'duplicate' ? 'Possível repetição · confira a empresa original' : row.type === 'candidate' ? 'Candidato da busca · conferir na lista de empresas' : 'Documento bruto · empresa não confirmada'}</small>
        {row.reason ? <p className="prospecting-raw-review__reason">{row.type === 'rejected' ? 'Filtro: ' : 'Motivo: '}{row.reason}</p> : null}
        <footer>
          {decisions[row.key] ? <button type="button" disabled={disabled} onClick={() => onDecision(row.key, null)}>Desfazer decisão ({decisions[row.key] === 'ignored' ? 'ignorada' : 'adicionada'})</button> : <>
            <button type="button" disabled={disabled} onClick={() => onDecision(row.key, 'ignored')}>Ignorar fonte</button>
            <button type="button" className="is-primary" disabled={disabled && !findStored(row)} onClick={() => openReview(row)}>{findStored(row) ? 'Abrir empresa na revisão' : 'Conferir e enviar à revisão'}</button>
          </>}
        </footer>
      </article>)}
    </div>}
    {results.length > visible ? <button className="prospecting-raw-review__more" type="button" onClick={() => setVisible(v => v + 24)}>Mostrar mais {Math.min(24, results.length - visible)} fontes</button> : null}
    {current ? <div className="prospecting-raw-review__dialog" role="dialog" aria-modal="true" aria-label="Confirmar empresa a partir da fonte">
      <div className="prospecting-raw-review__dialog-card">
        <header><div><h3>Revisar fonte e criar candidato</h3><p>{current.name}</p></div><button type="button" aria-label="Fechar revisão da fonte" onClick={() => setSelected(null)}><X size={18}/></button></header>
        <p className="prospecting-raw-review__notice">{currentCandidate
          ? 'Informações recuperadas do candidato encontrado. Confira os dados antes de adicionar à revisão.'
          : draft.company
            ? 'Nome sugerido a partir do título público. Confira se é uma empresa real. A cidade é apenas a região pesquisada, não uma localização confirmada.'
            : 'Esta fonte pode ser uma lista ou diretório. Identifique a empresa real antes de adicionar um candidato pendente.'}</p>
        {httpUrl(clean(current.url)) ? <a href={httpUrl(clean(current.url))} target="_blank" rel="noopener noreferrer">Abrir a fonte original para conferir <ExternalLink size={13}/></a> : null}
        <div className="prospecting-raw-review__form">
          <label>Nome da empresa (confirme) *<input autoFocus value={draft.company} onChange={e => setDraft(d => ({...d,company:e.target.value}))} placeholder="Nome real da empresa" /></label>
          <label>Cidade (a confirmar)<input value={draft.city} onChange={e => setDraft(d => ({...d,city:e.target.value}))} placeholder="Ex.: Rio Grande, RS"/></label>
          <label>Telefone<input value={draft.phone} onChange={e => setDraft(d => ({...d,phone:e.target.value}))} placeholder="Opcional"/></label>
          <label>E-mail<input value={draft.email} onChange={e => setDraft(d => ({...d,email:e.target.value}))} placeholder="Opcional"/></label>
          <label className="is-wide">Endereço (a confirmar)<input value={draft.address} onChange={e => setDraft(d => ({...d,address:e.target.value}))} placeholder="Endereço disponível na busca" /></label>
          <label>Website oficial (não é o diretório)<input value={draft.website} onChange={e => setDraft(d => ({...d,website:e.target.value}))} placeholder="https://..."/></label>
          <details className="is-wide"><summary>Mais dados disponíveis</summary>
            <label>Instagram<input value={draft.instagram} onChange={e => setDraft(d => ({...d,instagram:e.target.value}))} /></label>
            <label>CNPJ<input value={draft.cnpj} onChange={e => setDraft(d => ({...d,cnpj:e.target.value}))} /></label>
            <label>Descrição<input value={draft.description} onChange={e => setDraft(d => ({...d,description:e.target.value}))} /></label>
          </details>
          <label className="is-wide">Observações<textarea value={draft.notes} onChange={e => setDraft(d => ({...d,notes:e.target.value}))}/></label>
        </div>
        <footer><button type="button" onClick={() => setSelected(null)}>Cancelar</button><button className="is-primary" type="button" disabled={disabled || !draft.company.trim()} onClick={submit}>Adicionar à fila Revisar</button></footer>
      </div>
    </div> : null}
  </section>
}
