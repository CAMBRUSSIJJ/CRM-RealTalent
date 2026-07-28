import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { Playbook } from '../../domain/types'

export function PlaybookModal({ open, playbook, onClose }: { open: boolean; playbook?: Playbook | null; onClose(): void }) {
  const { createPlaybook, updatePlaybook } = useApp()
  const [kind, setKind] = useState<Playbook['kind']>('script')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [active, setActive] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setKind(playbook?.kind ?? 'script'); setTitle(playbook?.title ?? ''); setCategory(playbook?.category ?? '')
    setContent(playbook?.content ?? ''); setTags(playbook?.tags.join(', ') ?? ''); setActive(playbook?.active ?? true)
  }, [open, playbook])

  const save = async () => {
    setBusy(true)
    try {
      const input = { kind, title, category, content, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), active }
      if (playbook) await updatePlaybook(playbook.id, input); else await createPlaybook(input)
      onClose()
    } finally { setBusy(false) }
  }

  return <Modal open={open} onClose={onClose} title={playbook ? 'Editar playbook' : 'Novo playbook'} subtitle="Scripts e respostas reutilizáveis por toda a equipe." size="lg" footer={<><span className="modal__footer-spacer" /><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={() => void save()}><Save size={16} /> Salvar</Button></>}>
    <div className="form-grid">
      <label className="field"><span>Tipo</span><select value={kind} onChange={(event) => setKind(event.target.value as Playbook['kind'])}><option value="script">Script</option><option value="objection">Objeção</option></select></label>
      <label className="field"><span>Categoria</span><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Prospecção, fechamento, objeções..." /></label>
      <label className="field field--span-2"><span>Título</span><input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Primeiro contato agressivo" /></label>
      <label className="field field--span-2"><span>Conteúdo</span><textarea rows={10} required value={content} onChange={(event) => setContent(event.target.value)} placeholder="Texto completo que poderá ser copiado ou usado no modo ligação" /></label>
      <label className="field field--span-2"><span>Tags</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="barbearia, primeiro contato, reunião" /></label>
      <label className="toggle-field field--span-2"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><strong>Disponível para a equipe</strong><small>Playbooks inativos permanecem salvos, mas não aparecem como sugestão na ligação.</small></span></label>
    </div>
  </Modal>
}
