import { AlertTriangle, ArrowLeft, CopyCheck, FileSpreadsheet, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAppActions, useAppWorkspace } from '../../app/app-context'
import { SelectionSelect } from '../../components/selection'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { plural } from '../../domain/formatters'
import { buildLeadsFromCsv, LEAD_CSV_FIELDS, suggestLeadCsvMapping, type LeadCsvField, type LeadCsvMapping, type LeadCsvTable } from '../../services/lead-csv'
import { reviewLeadImport } from '../../services/lead-import-review'
import './lead-import.css'

interface LeadImportModalProps {
  open: boolean
  fileName: string
  table: LeadCsvTable | null
  onClose(): void
}

type ExistingChoice = 'skip' | 'complete'
const IGNORE = '__ignore__'
const PREVIEW_LIMIT = 40

/** Importação de CSV em duas etapas: escolher o campo de cada coluna e revisar duplicados. */
export function LeadImportModal({ open, fileName, table, onClose }: LeadImportModalProps) {
  const { snapshot, currentWorkspace } = useAppWorkspace()
  const { importReviewedLeads } = useAppActions()
  const [mapping, setMapping] = useState<LeadCsvMapping>(() => (table ? suggestLeadCsvMapping(table.headers) : []))
  const [step, setStep] = useState<'map' | 'review'>('map')
  const [existingChoice, setExistingChoice] = useState<ExistingChoice>('skip')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const nameMapped = mapping.includes('name')
  const samples = useMemo(() => (table ? table.headers.map((_, column) => table.rows.map((row) => row[column]?.trim()).filter(Boolean).slice(0, 2).join(' · ')) : []), [table])

  const built = useMemo(() => {
    if (step !== 'review' || !table || !snapshot || !currentWorkspace) return null
    try { return { result: buildLeadsFromCsv(table, mapping, currentWorkspace.id, snapshot.stages), failure: '' } }
    catch (failure) { return { result: null, failure: failure instanceof Error ? failure.message : 'Não foi possível ler o arquivo.' } }
  }, [currentWorkspace, mapping, snapshot, step, table])
  const review = useMemo(() => (built?.result && snapshot ? reviewLeadImport(built.result.leads, snapshot.leads, built.result.rowNumbers) : null), [built, snapshot])

  const setField = (column: number, value: string) => setMapping((current) => current.map((field, index) => {
    if (index === column) return value === IGNORE ? null : value as LeadCsvField
    return field === value ? null : field // cada campo vem de uma coluna só
  }))

  const toImport = review?.fresh.length ?? 0
  const toComplete = existingChoice === 'complete' ? review?.matchesExisting.length ?? 0 : 0
  const confirm = async () => {
    if (!review) return
    setBusy(true); setError('')
    try {
      await importReviewedLeads({
        leads: review.fresh.map((item) => item.lead),
        merges: existingChoice === 'complete' ? review.matchesExisting.map((item) => ({ existingId: item.existing!.id, incoming: item.lead })) : [],
      })
      onClose()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Falha na importação.') }
    finally { setBusy(false) }
  }

  const fieldOptions = [{ value: IGNORE, label: 'Não importar' }, ...LEAD_CSV_FIELDS.map((item) => ({ value: item.field, label: item.label }))]
  const confirmLabel = toImport && toComplete ? `Importar ${toImport} e completar ${toComplete}` : toComplete ? `Completar ${toComplete} ${plural(toComplete, 'contato', 'contatos')}` : `Importar ${toImport} ${plural(toImport, 'contato', 'contatos')}`

  const footer = step === 'map'
    ? <>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button disabled={!nameMapped} onClick={() => setStep('review')}>Revisar importação</Button>
      </>
    : <>
        <Button variant="ghost" onClick={() => setStep('map')} disabled={busy}><ArrowLeft size={15}/> Voltar ao mapeamento</Button>
        <Button loading={busy} disabled={!review || (!toImport && !toComplete)} onClick={() => void confirm()}>{confirmLabel}</Button>
      </>

  return (
    <Modal open={open} size="lg" onClose={busy ? () => undefined : onClose} title="Importar contatos" subtitle={`${fileName} · ${table?.rows.length ?? 0} ${plural(table?.rows.length ?? 0, 'linha', 'linhas')}`} footer={footer}>
      <ol className="lead-import__steps" aria-label="Etapas">
        <li className={step === 'map' ? 'is-active' : 'is-done'}>1. Colunas</li>
        <li className={step === 'review' ? 'is-active' : ''}>2. Revisão</li>
      </ol>

      {step === 'map' && table ? <section className="lead-import__map">
        <p className="lead-import__hint">Escolha o campo do CRM para cada coluna do arquivo. As colunas marcadas como “Não importar” ficam de fora.</p>
        <div className="lead-import__table" role="table" aria-label="Mapeamento de colunas">
          <div className="lead-import__row lead-import__row--head" role="row"><span role="columnheader">Coluna do arquivo</span><span role="columnheader">Exemplo</span><span role="columnheader">Campo no CRM</span></div>
          {table.headers.map((header, column) => (
            <div className={`lead-import__row${mapping[column] ? '' : ' is-ignored'}`} role="row" key={`${header}-${column}`}>
              <strong role="cell">{header || `Coluna ${column + 1}`}</strong>
              <span role="cell" className="lead-import__sample">{samples[column] || '—'}</span>
              <span role="cell"><SelectionSelect ariaLabel={`Campo para ${header}`} size="sm" value={mapping[column] ?? IGNORE} options={fieldOptions} onValueChange={(value) => setField(column, value)} /></span>
            </div>
          ))}
        </div>
        {!nameMapped ? <p className="lead-import__warning"><AlertTriangle size={15}/> Escolha a coluna que tem o nome do contato para continuar.</p> : null}
      </section> : null}

      {step === 'review' ? <section className="lead-import__review">
        {built?.failure ? <p className="lead-import__warning"><AlertTriangle size={15}/> {built.failure}</p> : null}
        {review ? <>
          <div className="lead-import__summary">
            <div className="is-new"><UserPlus size={17}/><strong>{review.fresh.length}</strong><span>{plural(review.fresh.length, 'contato novo', 'contatos novos')}</span></div>
            <div className="is-existing"><CopyCheck size={17}/><strong>{review.matchesExisting.length}</strong><span>já {plural(review.matchesExisting.length, 'existe', 'existem')} no CRM</span></div>
            <div className="is-repeated"><FileSpreadsheet size={17}/><strong>{review.repeatedInFile.length}</strong><span>{plural(review.repeatedInFile.length, 'repetido', 'repetidos')} no arquivo</span></div>
          </div>

          {review.matchesExisting.length ? <fieldset className="lead-import__choice">
            <legend>{review.matchesExisting.length === 1 ? 'O que fazer com o contato que já existe?' : `O que fazer com os ${review.matchesExisting.length} contatos que já existem?`}</legend>
            <label><input type="radio" name="existing" checked={existingChoice === 'skip'} onChange={() => setExistingChoice('skip')}/> <span><strong>Pular</strong> Os contatos do CRM ficam como estão.</span></label>
            <label><input type="radio" name="existing" checked={existingChoice === 'complete'} onChange={() => setExistingChoice('complete')}/> <span><strong>Completar o que estiver vazio</strong> Preenche telefone, e-mail, CNPJ e outros campos vazios e junta tags e observações. Valor, etapa, responsável e próxima ação não mudam.</span></label>
          </fieldset> : null}

          {review.repeatedInFile.length ? <p className="lead-import__hint">Linhas repetidas no arquivo são importadas uma vez só, na primeira vez em que aparecem.</p> : null}

          {review.matchesExisting.length || review.repeatedInFile.length ? <div className="lead-import__dupes">
            <strong>Duplicados encontrados</strong>
            <ul>
              {[...review.matchesExisting, ...review.repeatedInFile].slice(0, PREVIEW_LIMIT).map((item) => (
                <li key={`${item.row}-${item.lead.id}`}>
                  <span className="lead-import__line">Linha {item.row}</span>
                  <span className="lead-import__who">{item.lead.name}</span>
                  <span className="lead-import__why">{item.existing ? `igual a “${item.existing.name}” no CRM` : `igual à linha ${item.repeatsRow}`} · {item.reasons.join(', ')}</span>
                </li>
              ))}
            </ul>
            {review.matchesExisting.length + review.repeatedInFile.length > PREVIEW_LIMIT ? <small>E mais {review.matchesExisting.length + review.repeatedInFile.length - PREVIEW_LIMIT}.</small> : null}
          </div> : null}

          {built?.result?.warnings.length ? <details className="lead-import__notes">
            <summary>{built.result.warnings.length} {plural(built.result.warnings.length, 'aviso', 'avisos')} de leitura</summary>
            <ul>{built.result.warnings.slice(0, PREVIEW_LIMIT).map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </details> : null}
        </> : null}
        {error ? <p className="lead-import__warning"><AlertTriangle size={15}/> {error}</p> : null}
      </section> : null}
    </Modal>
  )
}
