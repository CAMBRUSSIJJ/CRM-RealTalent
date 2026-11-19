import { plural } from '../../domain/formatters'
import { useEffect, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import type { ProspectRecord } from '../../services/prospecting-workspace'
import { publicUrl } from './review'
import { currentValue, readPending, recheckHistory, RECHECK_LABELS, type RecheckField } from './recheck'

type Props = {
  record: ProspectRecord
  canEdit: boolean
  onRecheck: () => Promise<void>
  canSyncCrm: boolean
  onResolve: (fields: RecheckField[], syncCrm: boolean) => Promise<void>
}

const format = (value: string) => value || 'Não informado'
export function RecheckPanel({record,canEdit,canSyncCrm,onRecheck,onResolve}: Props) {
  const [running,setRunning] = useState(false)
  const [applying,setApplying] = useState(false)
  const [syncCrm,setSyncCrm] = useState(false)
  const [error,setError] = useState('')
  const [selected,setSelected] = useState<RecheckField[]>([])
  const pending = readPending(record)
  const history = recheckHistory(record)
  useEffect(() => { setSelected([]);setError('') }, [pending?.checkedAt,record.id])
  async function run() {
    if (running || !canEdit || (!record.cnpj && !record.website) || pending) return
    setRunning(true);setError('')
    try { await onRecheck() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível revisar esta empresa.') }
    finally { setRunning(false) }
  }
  async function resolve(fields: RecheckField[]) {
    if (!canEdit || applying) return
    setApplying(true);setError('')
    try { await onResolve(fields, Boolean(fields.length && syncCrm));setSelected([]);setSyncCrm(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível aplicar as propostas.') }
    finally { setApplying(false) }
  }
  const existing = [
    ['Razão social',currentValue(record,'legal_name')], ['CNAE principal',currentValue(record,'main_cnae')],
    ['Situação cadastral',currentValue(record,'status')],['CNPJ',record.cnpj],
    ['Site',record.website],['Telefone',record.phone],['E-mail',record.email],
  ]
  return <details className="gh-recheck-fold" open={Boolean(pending)}
    aria-label={`Histórico e alterações de ${record.company}`}>
    <summary>Comparação de dados e histórico da revisão ({history.length}){pending ? ' · alterações aguardando aprovação' : ''}</summary>
    <section className="gh-recheck" aria-label={`Revisar novamente ${record.company}`}>
    <div className="gh-recheck-heading"><div>
      <span className="gh-eyebrow">REVISÃO DE EMPRESAS 2.0</span>
      <h3>Investigar novamente</h3>
      <p>Verifique dados cadastrais e contatos publicados no site. As alterações dependem da sua aprovação.</p>
    </div>
      <button type="button" className="gh-secondary" disabled={running || !canEdit || Boolean(pending) || (!record.cnpj && !record.website)}
        onClick={() => void run()}><RefreshCw size={14} className={running ? 'gh-spin' : ''} />
        {running ? 'Verificando fontes…' : 'Revisar novamente'}</button>
    </div>
    {!record.cnpj && !record.website && <p className="gh-help">Informe primeiro o CNPJ ou o site oficial para reanalisar esta empresa.</p>}
    {error && <p className="gh-index-error" role="alert">{error}</p>}
    <details className="gh-recheck-baseline"><summary>Dados atuais da empresa</summary>
      <dl>{existing.map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{format(value)}</dd></div>)}</dl>
    </details>
    {pending && <div className="gh-recheck-proposals">
      <h4>Novas informações para conferir</h4>
      <p className="gh-help">Comparação com o cadastro atual. Escolha quais atualizações aceitar. Nada é aplicado automaticamente.</p>
      {pending.proposals.map(item => <label key={item.field} className="gh-recheck-diff">
        <input type="checkbox" disabled={!canEdit} checked={selected.includes(item.field)} onChange={event =>
          setSelected(previous => event.target.checked ? [...previous,item.field] : previous.filter(field => field !== item.field))} />
        <div><strong>{RECHECK_LABELS[item.field]}</strong>
          <p><span>Anterior:</span> {format(item.before)}</p>
          <p><span>Encontrado:</span> <b>{item.after}</b></p>
          <small>{item.kind === 'register' ? 'Cadastro oficial · ' : 'Site verificado · '}{item.source}</small>
          {publicUrl(item.url) && <a href={publicUrl(item.url)!} target="_blank" rel="noopener noreferrer">
            Conferir origem <ExternalLink size={12}/></a>}
        </div>
      </label>)}
      {canSyncCrm && <label className="gh-recheck-crm-optin">
        <input type="checkbox" checked={syncCrm} onChange={event => setSyncCrm(event.target.checked)} disabled={!canEdit || applying} />
        Atualizar também os campos compatíveis do cadastro principal no CRM (com verificação de conflitos).
      </label>}
      <div className="gh-actions"><button className="gh-primary" type="button" disabled={!canEdit || !selected.length || applying}
        onClick={() => void resolve(selected)}>{applying ? 'Aplicando…' : `Aplicar ${selected.length} ${plural(selected.length, 'atualização', 'atualizações')}`}</button>
        <button className="gh-secondary" type="button" disabled={!canEdit || applying} onClick={() => void resolve([])}>Descartar sugestões</button></div>
      {record.status === 'sent' && <p className="gh-help">Empresas enviadas continuam na revisão. O CRM só será alterado se você marcar explicitamente a opção acima; dados sem campo compatível permanecerão apenas na ficha de revisão.</p>}
    </div>}
    <details className="gh-recheck-history" open={Boolean(history.length && !pending)}>
      <summary>Histórico das verificações ({history.length})</summary>
      {history.length ? <ol>{history.map((entry,index) => <li key={`${entry.checkedAt}:${index}`}>
        <strong>{new Date(entry.checkedAt).toLocaleString('pt-BR')}</strong>
        <span>Fontes: {entry.sources.join(', ') || 'Nenhuma disponível'} · {entry.suggested} {plural(entry.suggested, 'sugestão', 'sugestões')}
          {entry.resolvedAt ? ` · ${entry.appliedFields?.length || 0} ${plural(entry.appliedFields?.length || 0, 'aceita', 'aceitas')}` : ''}</span>
        {entry.warnings.map((warning,j) => <small key={j}>{warning}</small>)}
      </li>)}</ol> : <p className="gh-help">Esta empresa ainda não foi investigada novamente.</p>}
    </details>
    </section>
  </details>
}
