import { Building2, Check, ChevronDown, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Modal } from '../../components/ui/modal'
import { Button } from '../../components/ui/button'

export function WorkspaceSwitcher() {
  const { workspaces, currentWorkspace, setCurrentWorkspace, createWorkspace } = useApp()
  const [open, setOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const submit = async () => {
    setSaving(true)
    try {
      await createWorkspace(name)
      setName('')
      setModalOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="workspace-switcher" ref={wrapperRef}>
        <button type="button" className="workspace-switcher__trigger" onClick={() => setOpen((value) => !value)}>
          <span className="workspace-switcher__icon"><Building2 size={17} /></span>
          <span><small>Workspace</small><strong>{currentWorkspace?.name ?? 'Carregando...'}</strong></span>
          <ChevronDown size={16} />
        </button>
        {open ? (
          <div className="workspace-switcher__menu">
            <div className="workspace-switcher__heading">Seus workspaces</div>
            {workspaces.map((workspace) => (
              <button key={workspace.id} type="button" onClick={() => { void setCurrentWorkspace(workspace.id); setOpen(false) }}>
                <span className="workspace-switcher__menu-icon"><Building2 size={16} /></span>
                <span><strong>{workspace.name}</strong><small>{workspace.role}</small></span>
                {workspace.id === currentWorkspace?.id ? <Check size={16} /> : null}
              </button>
            ))}
            <button type="button" className="workspace-switcher__new" onClick={() => { setOpen(false); setModalOpen(true) }}>
              <Plus size={17} /> Criar workspace
            </button>
          </div>
        ) : null}
      </div>
      <Modal
        open={modalOpen}
        title="Novo workspace"
        subtitle="Crie uma empresa ou operação separada. As etapas padrão serão adicionadas automaticamente."
        onClose={() => setModalOpen(false)}
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button><Button loading={saving} onClick={() => void submit()}>Criar workspace</Button></>}
      >
        <label className="field"><span>Nome da empresa</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: RealTalent" minLength={2} /></label>
      </Modal>
    </>
  )
}
