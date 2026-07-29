import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ActionDialogState } from '../../app/app-context'
import { useApp } from '../../app/app-context'
import { Button } from './button'
import { Modal } from './modal'

export function ActionDialogCenter() {
  const { actionDialog, resolveActionDialog } = useApp()
  const [displayedDialog, setDisplayedDialog] = useState<ActionDialogState | null>(actionDialog)
  const [value, setValue] = useState('')
  const [validation, setValidation] = useState('')

  useEffect(() => {
    if (actionDialog) {
      setDisplayedDialog(actionDialog)
      setValue(actionDialog.initialValue ?? '')
      setValidation('')
      return
    }
    const timer = window.setTimeout(() => setDisplayedDialog(null), 190)
    return () => window.clearTimeout(timer)
  }, [actionDialog])

  const dialog = actionDialog ?? displayedDialog
  if (!dialog) return null
  const isPrompt = dialog.kind === 'prompt'
  const destructive = dialog.tone === 'danger'

  const cancel = () => resolveActionDialog(isPrompt ? null : false)
  const submitDialog = () => {
    if (isPrompt) {
      const next = value.trim()
      if (dialog.required !== false && !next) {
        setValidation('Preencha este campo para continuar.')
        return
      }
      resolveActionDialog(next)
      return
    }
    resolveActionDialog(true)
  }

  return (
    <Modal
      open={Boolean(actionDialog)}
      onClose={cancel}
      size="sm"
      title={dialog.title}
      subtitle={dialog.description}
      footer={<>
        <Button variant="secondary" autoFocus={!isPrompt} onClick={cancel}>{dialog.cancelLabel ?? 'Cancelar'}</Button>
        <Button variant={destructive ? 'danger' : 'primary'} onClick={submitDialog}>{dialog.confirmLabel ?? (destructive ? 'Confirmar ação' : 'Confirmar')}</Button>
      </>}
    >
      <div className={`action-dialog action-dialog--${dialog.tone ?? 'default'}`}>
        <div className="action-dialog__icon" aria-hidden="true">{destructive ? <ShieldAlert size={22} /> : <AlertTriangle size={22} />}</div>
        {dialog.details?.length ? <ul className="action-dialog__details">{dialog.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}
        {isPrompt ? <label className="field action-dialog__field"><span>{dialog.label}</span><input
          autoFocus
          type={dialog.inputType ?? 'text'}
          value={value}
          placeholder={dialog.placeholder}
          aria-invalid={Boolean(validation)}
          onChange={(event) => { setValue(event.target.value); if (validation) setValidation('') }}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submitDialog() } }}
        />{validation ? <small className="field-error" role="alert">{validation}</small> : null}</label> : null}
      </div>
    </Modal>
  )
}
