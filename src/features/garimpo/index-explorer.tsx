import { plural } from '../../domain/formatters'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bookmark, Check, ChevronLeft, ChevronRight, Search, Trash2 } from 'lucide-react'
import type { CaptureDraft } from '../../services/prospecting-workspace'
import { safeStorage } from '../../lib/storage'
import { createUuid } from '../../lib/id'
import { hostedGarimpo, type IndexedCompany, type CompanyIndexSearch } from './hosted-client'

type Props = {
  workspaceId: string
  canImport: boolean
  onImport: (items: CaptureDraft[]) => void
}

const label = (row: IndexedCompany) => row.trade_name || row.legal_name
type SearchPreset = { id: string; label: string; input: Omit<CompanyIndexSearch, 'limit' | 'offset'> }
const presetKey = (workspaceId: string) => `garimpo-index-searches-v2:${workspaceId}`
function readPresets(workspaceId: string): SearchPreset[] {
  if (!workspaceId) return []
  try {
    const payload = JSON.parse(safeStorage.getItem(presetKey(workspaceId)) || '[]') as unknown
    if (!Array.isArray(payload)) return []
    return payload.slice(0,10).filter((preset): preset is SearchPreset =>
      Boolean(preset && typeof preset === 'object' && typeof preset.id === 'string'
        && typeof preset.label === 'string' && preset.label.length <= 60
        && preset.input && typeof preset.input.city === 'string'
        && typeof preset.input.cnae === 'string'
        && typeof preset.input.name === 'string' && typeof preset.input.active_only === 'boolean'
        && ['all','yes','no'].includes(preset.input.headquarters)
        && ['any','main','secondary'].includes(preset.input.cnae_scope)
        && (!('has_qsa' in preset.input) || ['all','yes','no'].includes(preset.input.has_qsa))
        && typeof preset.input.opened_after === 'string'
        && typeof preset.input.opened_before === 'string')) as SearchPreset[]
  } catch { return [] }
}
const sourceMonth = (value: string) => /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : 'não informada'

function toDraft(item: IndexedCompany): CaptureDraft {
  const name = label(item)
  return {
    name, company: name, cnpj: item.cnpj, city: item.city, source: 'cnpj',
    sourceDetail: 'Receita Federal · CNPJ (base pública)',
    notes: `CNAE principal: ${item.main_cnae}. Razão social: ${item.legal_name}. Situação cadastral: ${item.status === '02' ? 'ativa' : item.status}. Origem: Receita Federal, competência ${sourceMonth(item.source_month)}. Contatos e atividade comercial ainda não verificados.`,
    description: `CNAE principal: ${item.main_cnae}; ${item.headquarters ? 'matriz' : 'filial'}`,
    engine: {
      version: 'intelligence-index-rs-1', providerId: `cnpj:${item.cnpj}`,
      dataset: { source: 'Receita Federal / CNPJ', month: item.source_month },
      legalName: item.legal_name, tradeName: item.trade_name,
      mainCnae: item.main_cnae, registrationStatus: item.status,
      openedOn: item.opened_on || '', uf: item.uf,
      qualityScore: 30, relevanceScore: 0, relevanceReasons: ['Filtro cadastral CNAE/município'],
      // Dataset provenance is not a per-company URL or contact verification.
      evidence: [{
        field: 'Proveniência do conjunto CNPJ', value: `Receita Federal, ${sourceMonth(item.source_month)}`,
        source: 'Receita Federal', url: item.source_url,
        observed_at: new Date().toISOString(), status: 'published',
      }],
      warnings: ['Dados cadastrais. Telefone, e-mail e interesse de compra não verificados.'],
    },
  }
}

export function IndexExplorer({ workspaceId, canImport, onImport }: Props) {
  const [city, setCity] = useState('Rio Grande')
  const [name, setName] = useState('')
  const [cnae, setCnae] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [headquarters, setHeadquarters] = useState<CompanyIndexSearch['headquarters']>('all')
  const [openedAfter, setOpenedAfter] = useState('')
  const [openedBefore, setOpenedBefore] = useState('')
  const [cnaeScope, setCnaeScope] = useState<CompanyIndexSearch['cnae_scope']>('any')
  const [hasQsa, setHasQsa] = useState<CompanyIndexSearch['has_qsa']>('all')
  const [savedName, setSavedName] = useState('')
  const [presets, setPresets] = useState<SearchPreset[]>([])
  const activeQuery = useRef<CompanyIndexSearch | null>(null)
  const [items, setItems] = useState<IndexedCompany[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const pageSize = 25

  useEffect(() => {
    controller.current?.abort()
    setItems([]); setSelected([]); setPage(0); setSearched(false)
    setError(''); setLoading(false)
    activeQuery.current = null
    setPresets(readPresets(workspaceId))
    return () => controller.current?.abort()
  }, [workspaceId])

  const filters = (): CompanyIndexSearch => ({
    city: city.trim(), name: name.trim(), cnae: cnae.trim(), active_only: activeOnly,
    headquarters, opened_after: openedAfter, opened_before: openedBefore,
    cnae_scope: cnaeScope, has_qsa: hasQsa, limit: pageSize, offset: 0,
  })
  function saveSearch() {
    const label = savedName.trim()
    if (!workspaceId || label.length < 2 || label.length > 60) return
    const next = [...presets.filter(item => item.label.toLowerCase() !== label.toLowerCase()),
      { id: createUuid(), label, input: filters() }].slice(-10).map(item => ({
      ...item, input: (({city,cnae,name,active_only,headquarters,opened_after,opened_before,cnae_scope,has_qsa}) =>
        ({city,cnae,name,active_only,headquarters,opened_after,opened_before,cnae_scope,has_qsa:has_qsa || 'all'}))(item.input),
    }))
    setPresets(next); safeStorage.setItem(presetKey(workspaceId),JSON.stringify(next)); setSavedName('')
  }
  function loadSearch(item: SearchPreset) {
    setCity(item.input.city);setName(item.input.name);setCnae(item.input.cnae)
    setActiveOnly(item.input.active_only);setHeadquarters(item.input.headquarters)
    setOpenedAfter(item.input.opened_after);setOpenedBefore(item.input.opened_before)
    setCnaeScope(item.input.cnae_scope);setHasQsa(item.input.has_qsa || 'all')
    setItems([]);setSearched(false);setSelected([]);setPage(0);activeQuery.current=null
  }
  function removeSearch(id: string) {
    const next = presets.filter(item => item.id !== id)
    setPresets(next);safeStorage.setItem(presetKey(workspaceId),JSON.stringify(next))
  }

  async function search(event?: FormEvent<HTMLFormElement>, offset = 0) {
    event?.preventDefault()
    if (!workspaceId || loading) return
    if (openedAfter && openedBefore && openedAfter > openedBefore) {
      setError('A data inicial precisa ser anterior à data final.')
      return
    }
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    setLoading(true); setError('')
    try {
      const query = offset === 0 || !activeQuery.current
        ? filters() : activeQuery.current
      const requested = { ...query, offset }
      const result = await hostedGarimpo.index(workspaceId, requested, next.signal)
      if (next.signal.aborted) return
      setItems(result.items); setHasMore(result.has_more)
      setPage(result.offset); setSelected([]); setSearched(true)
      activeQuery.current = { ...query, offset: 0 }
    } catch (cause) {
      if (!next.signal.aborted) {
        setItems([]); setHasMore(false); setSearched(true)
        setError(cause instanceof Error ? cause.message : 'Não foi possível consultar a base CNPJ.')
      }
    } finally {
      if (controller.current === next) setLoading(false)
    }
  }

  const chosen = items.filter(item => selected.includes(item.cnpj))
  return <section className="gh-card gh-index" aria-label="Índice empresarial CNPJ">
    <div className="gh-index-heading">
      <div><span className="gh-eyebrow">Base cadastral · Rio Grande do Sul</span>
        <h2>Buscar por atividade (CNAE) ou CNPJ</h2>
        <p>Use quando você já sabe o ramo ou a empresa. Consulta os dados da Receita, sem buscar no Maps.</p>
      </div>
      <span className="gh-index-tag">Receita Federal</span>
    </div>
    <form className="gh-index-filters" onSubmit={event => void search(event)}>
      <label>Cidade (opcional)
        <input maxLength={100} value={city} onChange={e => setCity(e.target.value)} placeholder="Todas as cidades do RS" />
      </label>
      <label>CNAE principal ou secundário
        <input inputMode="numeric" pattern="[0-9]{2,7}" title="De 2 a 7 números" maxLength={7}
          value={cnae} onChange={e => setCnae(e.target.value.replace(/\D/g, ''))} placeholder="Ex.: 85 (educação)" />
      </label>
      <label>Nome da empresa ou CNPJ
        <input maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Nome, fantasia ou CNPJ" />
      </label>
      <label className="gh-index-check"><input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} />
        Apenas situação cadastral ativa</label>
      <details className="gh-index-more">
        <summary>Mais filtros · abertura, matriz/filial, tipo de CNAE e QSA</summary>
        <div className="gh-index-advanced">
          <label>Tipo de estabelecimento
            <select value={headquarters} onChange={e => setHeadquarters(e.target.value as CompanyIndexSearch['headquarters'])}>
              <option value="all">Matrizes e filiais</option><option value="yes">Somente matriz</option><option value="no">Somente filial</option>
            </select>
          </label>
          <label>Correspondência CNAE
            <select value={cnaeScope} onChange={e => setCnaeScope(e.target.value as CompanyIndexSearch['cnae_scope'])}>
              <option value="any">Principal ou secundário</option><option value="main">Somente principal</option>
              <option value="secondary">Somente secundário</option>
            </select>
          </label>
          <label>Quadro de sócios e administradores
            <select value={hasQsa} onChange={event => setHasQsa(event.target.value as CompanyIndexSearch['has_qsa'])}>
              <option value="all">Não filtrar por QSA</option>
              <option value="yes">Com integrante identificado no QSA</option>
              <option value="no">Sem integrante no recorte carregado</option>
            </select>
          </label>
          <label>Aberta a partir de
            <input type="date" value={openedAfter} onChange={e => setOpenedAfter(e.target.value)} /></label>
          <label>Aberta até
            <input type="date" value={openedBefore} onChange={e => setOpenedBefore(e.target.value)} /></label>
        </div>
      </details>
      <button type="submit" className="gh-primary" disabled={!workspaceId || loading}><Search size={15} />
        {loading ? 'Consultando…' : 'Consultar índice'}</button>
    </form>
    <div className="gh-saved-searches">
      <label>Salvar filtros neste navegador
        <input maxLength={60} value={savedName} onChange={e => setSavedName(e.target.value)}
          placeholder="Ex.: Escolas ativas de Porto Alegre" />
      </label>
      <button type="button" className="gh-secondary" disabled={savedName.trim().length < 2}
        onClick={saveSearch}><Bookmark size={14} />Salvar busca</button>
      {presets.length > 0 && <div className="gh-saved-list" aria-label="Buscas salvas">
        {presets.map(item => <div key={item.id}>
          <button type="button" className="gh-secondary" onClick={() => loadSearch(item)}>{item.label}</button>
          <button type="button" aria-label={`Excluir busca ${item.label}`} onClick={() => removeSearch(item.id)}
            className="gh-icon"><Trash2 size={13} /></button>
        </div>)}
      </div>}
    </div>
    {error && <p className="gh-index-error" role="alert">{error}</p>}
    {searched && !error && <div className="gh-index-results">
      <div className="gh-index-results-heading"><strong>{items.length} {plural(items.length, 'empresa', 'empresas')} nesta página</strong>
        <button className="gh-secondary" disabled={!canImport || !chosen.length} onClick={() => {
          onImport(chosen.map(toDraft)); setSelected([])
        }}><Check size={14} />Adicionar {chosen.length} à revisão</button>
      </div>
      {items.length ? <div className="gh-table-wrap"><table>
        <thead><tr><th><input type="checkbox" aria-label="Selecionar empresas da página" checked={selected.length === items.length}
          onChange={e => setSelected(e.target.checked ? items.map(row => row.cnpj) : [])} /></th>
          <th>Empresa</th><th>CNPJ</th><th>Município</th><th>CNAE</th><th>Situação</th></tr></thead>
        <tbody>{items.map(row => <tr key={row.cnpj}>
          <td><input type="checkbox" aria-label={`Selecionar ${label(row)}`} checked={selected.includes(row.cnpj)}
            onChange={e => setSelected(current => e.target.checked ? [...current, row.cnpj] : current.filter(id => id !== row.cnpj))} /></td>
          <td><strong>{label(row)}</strong>{row.trade_name && <small>{row.legal_name}</small>}</td>
          <td>{row.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}</td>
          <td>{row.city} / RS</td><td>{row.main_cnae}</td>
          <td>{row.status === '02' ? 'Ativa' : 'Não ativa'}</td>
        </tr>)}</tbody>
      </table></div> : <p className="gh-help">Não há empresas para os filtros nesta base importada. Isso não indica ausência de empresas no município.</p>}
      <div className="gh-index-pagination">
        <span>Registros {page + (items.length ? 1 : 0)}–{page + items.length} · competência: {items[0] ? sourceMonth(items[0].source_month) : '—'}</span>
        <button className="gh-secondary" disabled={loading || page === 0} onClick={() => void search(undefined, Math.max(0, page - pageSize))}>
          <ChevronLeft size={14} />Anterior</button>
        <button className="gh-secondary" disabled={loading || !hasMore} onClick={() => void search(undefined, page + pageSize)}>
          Próxima<ChevronRight size={14} /></button>
      </div>
    </div>}
    <p className="gh-help">O filtro QSA utiliza somente os dados oficiais já importados. “Sem integrante” significa ausência no recorte disponível, não ausência real de sócios ou responsáveis.</p>
    <p className="gh-help">O índice precisa ser carregado com os ZIPs oficiais da Receita. Dados cadastrais não comprovam telefone ativo, interesse comercial ou existência de site.</p>
  </section>
}
