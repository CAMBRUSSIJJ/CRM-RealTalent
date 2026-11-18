import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import type { CaptureDraft } from '../../services/prospecting-workspace'
import { hostedGarimpo, type IndexedCompany } from './hosted-client'

type Props = {
  workspaceId: string
  canImport: boolean
  onImport: (items: CaptureDraft[]) => void
}

const label = (row: IndexedCompany) => row.trade_name || row.legal_name
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
    return () => controller.current?.abort()
  }, [workspaceId])

  async function search(event?: FormEvent<HTMLFormElement>, offset = 0) {
    event?.preventDefault()
    if (!workspaceId || loading) return
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    setLoading(true); setError('')
    try {
      const result = await hostedGarimpo.index(workspaceId, {
        city: city.trim(), name: name.trim(), cnae: cnae.trim(),
        active_only: activeOnly, limit: pageSize, offset,
      }, next.signal)
      if (next.signal.aborted) return
      setItems(result.items); setHasMore(result.has_more)
      setPage(result.offset); setSelected([]); setSearched(true)
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
      <div><span className="gh-eyebrow">REALTALENT INTELLIGENCE · PILOTO RS</span>
        <h2>Explorar empresas por CNPJ e CNAE</h2>
        <p>Busque em uma base cadastral própria, sem executar uma coleta no Maps.</p>
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
      <button type="submit" className="gh-primary" disabled={!workspaceId || loading}><Search size={15} />
        {loading ? 'Consultando…' : 'Consultar índice'}</button>
    </form>
    {error && <p className="gh-index-error" role="alert">{error}</p>}
    {searched && !error && <div className="gh-index-results">
      <div className="gh-index-results-heading"><strong>{items.length} empresa(s) nesta página</strong>
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
    <p className="gh-help">O índice precisa ser carregado com os ZIPs oficiais da Receita. Dados cadastrais não comprovam telefone ativo, interesse comercial ou existência de site.</p>
  </section>
}
