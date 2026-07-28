import { Building2, CheckCircle2, Plus, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'

export function WorkspaceOnboarding() {
  const { createWorkspace } = useApp()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setSaving(true); setError('')
    try { await createWorkspace(name) }
    catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Não foi possível criar o workspace.') }
    finally { setSaving(false) }
  }

  return <main className="workspace-onboarding"><section className="workspace-onboarding__card"><div className="workspace-onboarding__icon"><Building2 size={30} /></div><span className="eyebrow">Primeiro acesso</span><h1>Crie o workspace da sua empresa</h1><p>Leads, equipe, Pipeline, metas e arquivos serão isolados dentro deste workspace.</p><div className="workspace-onboarding__benefits"><span><CheckCircle2 /> Etapas padrão criadas automaticamente</span><span><ShieldCheck /> RLS e permissões aplicadas</span></div><label className="field"><span>Nome da empresa</span><input autoFocus minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: RealTalent" /></label>{error ? <div className="form-error">{error}</div> : null}<Button size="lg" loading={saving} disabled={name.trim().length < 2} onClick={() => void submit()}><Plus size={18} /> Criar workspace</Button></section></main>
}
