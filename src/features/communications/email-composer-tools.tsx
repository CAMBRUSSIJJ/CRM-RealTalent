import { Bookmark, FileText, ListOrdered, Plus, Settings2, Square, Trash2, Workflow } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppUi, useAppWorkspace } from '../../app/app-context'
import { NativeSelectionSelect } from '../../components/selection'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { formatDateTime } from '../../domain/formatters'
import type { Lead } from '../../domain/types'
import { useAuth } from '../auth/auth-context'
import {
  deleteEmailTemplate, listEmailTemplates, renderTemplate, saveEmailTemplate, TEMPLATE_VARIABLES, variableLabel,
  type EmailTemplate, type TemplateContext,
} from '../../services/email-templates'
import {
  cumulativeDays, deleteEmailSequence, enrollLeadInSequence, enrollmentStatusLabel, listEmailSequences, listLeadEnrollments,
  saveEmailSequence, stopSequenceEnrollment, validateSequence, type EmailSequence, type EmailSequenceStep, type SequenceEnrollment,
} from '../../services/email-sequences'

// Contexto das variáveis {{...}} para o contato aberto e quem está escrevendo.
export function useTemplateContext(lead: Lead | null): TemplateContext {
  const { snapshot } = useAppWorkspace()
  const { user } = useAuth()
  return useMemo(() => ({
    name: lead?.name, company: lead?.company, jobTitle: lead?.jobTitle, city: lead?.city,
    stage: lead ? snapshot?.stages.find((item) => item.id === lead.stageId)?.name : '',
    sellerName: user?.displayName, sellerEmail: user?.email,
  }), [lead, snapshot?.stages, user?.displayName, user?.email])
}

const VariableChips = ({ onInsert }: { onInsert(token: string): void }) => <div className="email-tools__variables" aria-label="Variáveis disponíveis">
  {TEMPLATE_VARIABLES.map((item) => <button type="button" key={item.key} onClick={() => onInsert(`{{${item.key}}}`)} title={`Insere {{${item.key}}}`}>{item.label}</button>)}
</div>

// ---------- Modelos ----------
export function EmailTemplatePicker({ workspaceId, lead, subject, body, disabled, onApply }: {
  workspaceId: string; lead: Lead | null; subject: string; body: string; disabled?: boolean
  onApply(next: { subject: string; body: string; templateId: string; missing: string[] }): void
}) {
  const { notify, confirmAction } = useAppUi()
  const { user } = useAuth()
  const context = useTemplateContext(lead)
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [selected, setSelected] = useState('')
  const [managing, setManaging] = useState(false)
  const [editing, setEditing] = useState<{ id?: string; name: string; category: string; subject: string; body: string; shared: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => { try { setTemplates(await listEmailTemplates(workspaceId)) } catch (error) { notify('error', error instanceof Error ? error.message : 'Modelos indisponíveis.') } }
  useEffect(() => { void load() }, [workspaceId])

  const apply = (id: string) => {
    setSelected(id)
    const template = templates.find((item) => item.id === id)
    if (!template) return
    const renderedSubject = renderTemplate(template.subject, context)
    const renderedBody = renderTemplate(template.body, context)
    onApply({ subject: renderedSubject.text, body: renderedBody.text, templateId: template.id, missing: [...new Set([...renderedSubject.missing, ...renderedBody.missing])] })
  }
  const save = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await saveEmailTemplate({ workspaceId, id: editing.id, name: editing.name, category: editing.category, subject: editing.subject, body: editing.body, shared: editing.shared, userId: user?.id ?? null })
      notify('success', 'Modelo salvo.'); setEditing(null); await load()
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar.') }
    finally { setSaving(false) }
  }
  const remove = async (template: EmailTemplate) => {
    if (!await confirmAction({ title: `Excluir o modelo “${template.name}”?`, description: 'E-mails já enviados com ele não mudam.', confirmLabel: 'Excluir', tone: 'danger' })) return
    try { await deleteEmailTemplate(workspaceId, template.id); await load() } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível excluir.') }
  }
  const categories = [...new Set(templates.map((item) => item.category))]
  const canEdit = (template: EmailTemplate) => template.createdBy === user?.id

  return <>
    <div className="email-tools__templates">
      <FileText size={15} aria-hidden="true"/>
      <NativeSelectionSelect aria-label="Usar modelo" value={selected} disabled={disabled || !templates.length} onChange={(event) => apply(event.target.value)}>
        <option value="">{templates.length ? 'Usar um modelo…' : 'Nenhum modelo ainda'}</option>
        {categories.map((category) => <optgroup key={category} label={category}>{templates.filter((item) => item.category === category).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}
      </NativeSelectionSelect>
      <Button size="sm" variant="ghost" disabled={disabled || !body.trim()} onClick={() => setEditing({ name: '', category: 'Geral', subject, body, shared: true })} title="Salva o texto atual como modelo"><Bookmark size={15}/> Salvar como modelo</Button>
      <Button size="sm" variant="ghost" onClick={() => setManaging(true)} aria-label="Gerenciar modelos"><Settings2 size={15}/></Button>
    </div>

    <Modal open={managing && !editing} title="Modelos de e-mail" subtitle="Use {{primeiro_nome}}, {{empresa}} e outras variáveis: o CRM troca pelos dados de cada contato." size="lg" onClose={() => setManaging(false)}
      footer={<><Button variant="secondary" onClick={() => setManaging(false)}>Fechar</Button><span className="modal__footer-spacer"/><Button onClick={() => setEditing({ name: '', category: 'Geral', subject: '', body: '', shared: true })}><Plus size={15}/> Novo modelo</Button></>}>
      <div className="email-tools__list">
        {templates.length ? templates.map((template) => <div key={template.id} className="email-tools__row">
          <span><strong>{template.name}</strong><small>{template.category} · {template.shared ? 'Compartilhado com a equipe' : 'Só você'}{template.subject ? ` · ${template.subject}` : ''}</small></span>
          {canEdit(template) ? <span className="email-tools__row-actions">
            <Button size="sm" variant="secondary" onClick={() => setEditing({ id: template.id, name: template.name, category: template.category, subject: template.subject, body: template.body, shared: template.shared })}>Editar</Button>
            <Button size="sm" variant="ghost" aria-label={`Excluir ${template.name}`} onClick={() => void remove(template)}><Trash2 size={15}/></Button>
          </span> : <small>Criado por outra pessoa</small>}
        </div>) : <p className="email-tools__empty">Crie o primeiro modelo para não reescrever as mesmas mensagens.</p>}
      </div>
    </Modal>

    <Modal open={Boolean(editing)} title={editing?.id ? 'Editar modelo' : 'Novo modelo'} size="lg" onClose={() => setEditing(null)}
      footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button><span className="modal__footer-spacer"/><Button loading={saving} onClick={() => void save()}>Salvar modelo</Button></>}>
      {editing ? <div className="email-tools__form">
        <div className="email-tools__form-row">
          <label className="field"><span>Nome</span><input value={editing.name} maxLength={120} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder="Ex.: Primeiro contato"/></label>
          <label className="field"><span>Categoria</span><input value={editing.category} maxLength={60} onChange={(event) => setEditing({ ...editing, category: event.target.value })} placeholder="Geral"/></label>
        </div>
        <label className="field"><span>Assunto</span><input value={editing.subject} onChange={(event) => setEditing({ ...editing, subject: event.target.value })} placeholder="Ex.: {{empresa}} + RealTalent"/></label>
        <label className="field"><span>Mensagem</span><textarea rows={9} value={editing.body} onChange={(event) => setEditing({ ...editing, body: event.target.value })} placeholder="Olá {{primeiro_nome}}, ..."/></label>
        <VariableChips onInsert={(token) => setEditing({ ...editing, body: `${editing.body}${editing.body && !/\s$/.test(editing.body) ? ' ' : ''}${token}` })}/>
        <label className="email-tools__check"><input type="checkbox" checked={editing.shared} onChange={(event) => setEditing({ ...editing, shared: event.target.checked })}/> Compartilhar com a equipe</label>
      </div> : null}
    </Modal>
  </>
}

export const missingVariablesMessage = (missing: string[]) => missing.length
  ? `Sem dado no cadastro para: ${missing.map(variableLabel).join(', ')}. Revise o texto antes de enviar.`
  : ''

// ---------- Sequências ----------
const emptyStep = (index: number): EmailSequenceStep => ({ position: index + 1, delayDays: index === 0 ? 0 : 3, subject: '', body: '' })

export function LeadSequenceStrip({ workspaceId, lead, accountId, readOnly }: { workspaceId: string; lead: Lead; accountId: string; readOnly?: boolean }) {
  const { notify, confirmAction } = useAppUi()
  const { user } = useAuth()
  const [enrollments, setEnrollments] = useState<SequenceEnrollment[]>([])
  const [sequences, setSequences] = useState<EmailSequence[]>([])
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState('')
  const [track, setTrack] = useState(true)
  const [busy, setBusy] = useState('')
  const [editor, setEditor] = useState<{ id?: string; name: string; shared: boolean; steps: EmailSequenceStep[] } | null>(null)

  const loadEnrollments = async () => { try { setEnrollments(await listLeadEnrollments(lead.id)) } catch { setEnrollments([]) } }
  const loadSequences = async () => { try { const list = await listEmailSequences(workspaceId); setSequences(list); setChoice((current) => list.some((item) => item.id === current) ? current : list[0]?.id ?? '') } catch (error) { notify('error', error instanceof Error ? error.message : 'Sequências indisponíveis.') } }
  useEffect(() => { void loadEnrollments() }, [lead.id])
  useEffect(() => { if (open) void loadSequences() }, [open, workspaceId])

  const active = enrollments.find((item) => item.status === 'active')
  const lastFinished = !active ? enrollments[0] : undefined
  const selectedSequence = sequences.find((item) => item.id === choice)

  const enroll = async () => {
    if (!choice || !accountId) return
    setBusy('enroll')
    try { await enrollLeadInSequence(choice, lead.id, accountId, track); notify('success', `${lead.name} entrou na sequência. Ela para sozinha se o contato responder.`); setOpen(false); await loadEnrollments() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível inscrever.') }
    finally { setBusy('') }
  }
  const stop = async (enrollment: SequenceEnrollment) => {
    if (!await confirmAction({ title: 'Parar a sequência?', description: 'Os próximos e-mails não serão enviados. O que já saiu continua no histórico.', confirmLabel: 'Parar sequência', tone: 'danger' })) return
    setBusy('stop')
    try { await stopSequenceEnrollment(enrollment.id); await loadEnrollments() } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível parar.') }
    finally { setBusy('') }
  }
  const saveSequence = async () => {
    if (!editor) return
    const problem = validateSequence(editor.name, editor.steps)
    if (problem) { notify('error', problem); return }
    setBusy('save')
    try { const id = await saveEmailSequence({ workspaceId, id: editor.id, name: editor.name, shared: editor.shared, steps: editor.steps, userId: user?.id ?? null }); notify('success', 'Sequência salva.'); setEditor(null); await loadSequences(); setChoice(id) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar.') }
    finally { setBusy('') }
  }
  const removeSequence = async (sequence: EmailSequence) => {
    if (!await confirmAction({ title: `Excluir “${sequence.name}”?`, description: 'Contatos que estão nela param de receber os próximos e-mails.', confirmLabel: 'Excluir', tone: 'danger' })) return
    try { await deleteEmailSequence(sequence.id); await loadSequences() } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível excluir.') }
  }
  const updateStep = (index: number, patch: Partial<EmailSequenceStep>) => editor && setEditor({ ...editor, steps: editor.steps.map((step, i) => i === index ? { ...step, ...patch } : step) })

  return <div className="email-tools__sequence">
    <Workflow size={15} aria-hidden="true"/>
    {active ? <span className="email-tools__sequence-status"><strong>{active.sequenceName}</strong> · e-mail {Math.min(active.currentPosition + 1, active.totalSteps)} de {active.totalSteps}{active.nextRunAt ? ` · próximo em ${formatDateTime(active.nextRunAt)}` : ''}</span>
      : <span className="email-tools__sequence-status">{lastFinished ? `${lastFinished.sequenceName}: ${enrollmentStatusLabel[lastFinished.status]}` : 'Nenhuma sequência'}</span>}
    {active && (active.enrolledBy === user?.id) ? <Button size="sm" variant="ghost" loading={busy === 'stop'} onClick={() => void stop(active)}><Square size={14}/> Parar</Button> : null}
    {!active && !readOnly ? <Button size="sm" variant="ghost" disabled={!lead.email || lead.doNotContact || !accountId} onClick={() => setOpen(true)}><ListOrdered size={15}/> Colocar em sequência</Button> : null}

    <Modal open={open && !editor} title="Colocar em sequência" subtitle={`${lead.name} · ${lead.email}`} size="lg" onClose={() => setOpen(false)}
      footer={<><Button variant="secondary" onClick={() => setEditor({ name: '', shared: true, steps: [emptyStep(0), emptyStep(1)] })}><Plus size={15}/> Nova sequência</Button><span className="modal__footer-spacer"/><Button loading={busy === 'enroll'} disabled={!choice} onClick={() => void enroll()}>Iniciar sequência</Button></>}>
      <div className="email-tools__form">
        {sequences.length ? <>
          <label className="field"><span>Sequência</span><NativeSelectionSelect value={choice} onChange={(event) => setChoice(event.target.value)}>{sequences.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.steps.length} e-mails</option>)}</NativeSelectionSelect></label>
          {selectedSequence ? <ol className="email-tools__timeline">{selectedSequence.steps.map((step, index) => <li key={step.position}><b>Dia {cumulativeDays(selectedSequence.steps)[index]}</b><span>{step.subject || 'Responde no mesmo assunto'}</span></li>)}</ol> : null}
          {selectedSequence && selectedSequence.createdBy === user?.id ? <div className="email-tools__row-actions"><Button size="sm" variant="secondary" onClick={() => setEditor({ id: selectedSequence.id, name: selectedSequence.name, shared: selectedSequence.shared, steps: selectedSequence.steps })}>Editar sequência</Button><Button size="sm" variant="ghost" onClick={() => void removeSequence(selectedSequence)}><Trash2 size={15}/> Excluir</Button></div> : null}
          <label className="email-tools__check"><input type="checkbox" checked={track} onChange={(event) => setTrack(event.target.checked)}/> Rastrear abertura e cliques</label>
          <p className="email-tools__hint">Os e-mails saem da sua conta conectada. A sequência para sozinha se {lead.name.split(' ')[0]} responder, for marcado para não receber contato ou sair do funil.</p>
        </> : <p className="email-tools__empty">Nenhuma sequência ainda. Crie uma com 2 ou 3 e-mails de acompanhamento.</p>}
      </div>
    </Modal>

    <Modal open={Boolean(editor)} title={editor?.id ? 'Editar sequência' : 'Nova sequência'} subtitle="Cada e-mail sai depois do intervalo indicado. Assunto em branco responde no mesmo assunto do primeiro." size="xl" onClose={() => setEditor(null)}
      footer={<><Button variant="secondary" onClick={() => setEditor(null)}>Cancelar</Button><span className="modal__footer-spacer"/><Button loading={busy === 'save'} onClick={() => void saveSequence()}>Salvar sequência</Button></>}>
      {editor ? <div className="email-tools__form">
        <div className="email-tools__form-row">
          <label className="field"><span>Nome</span><input value={editor.name} maxLength={120} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="Ex.: Prospecção 3 toques"/></label>
          <label className="email-tools__check"><input type="checkbox" checked={editor.shared} onChange={(event) => setEditor({ ...editor, shared: event.target.checked })}/> Compartilhar com a equipe</label>
        </div>
        {editor.steps.map((step, index) => <fieldset key={index} className="email-tools__step">
          <legend>E-mail {index + 1} · dia {cumulativeDays(editor.steps)[index]}</legend>
          <div className="email-tools__form-row">
            <label className="field email-tools__delay"><span>{index === 0 ? 'Enviar após (dias)' : 'Dias após o anterior'}</span><input type="number" min={index === 0 ? 0 : 1} max={60} value={step.delayDays} onChange={(event) => updateStep(index, { delayDays: Math.max(index === 0 ? 0 : 1, Math.min(60, Number(event.target.value) || 0)) })}/></label>
            <label className="field"><span>Assunto</span><input value={step.subject} onChange={(event) => updateStep(index, { subject: event.target.value })} placeholder={index === 0 ? 'Obrigatório no primeiro e-mail' : 'Em branco: Re: assunto do primeiro'}/></label>
          </div>
          <label className="field"><span>Mensagem</span><textarea rows={5} value={step.body} onChange={(event) => updateStep(index, { body: event.target.value })} placeholder="Olá {{primeiro_nome}}, ..."/></label>
          <div className="email-tools__step-footer"><VariableChips onInsert={(token) => updateStep(index, { body: `${step.body}${step.body && !/\s$/.test(step.body) ? ' ' : ''}${token}` })}/>
            {editor.steps.length > 1 ? <Button size="sm" variant="ghost" onClick={() => setEditor({ ...editor, steps: editor.steps.filter((_, i) => i !== index) })}><Trash2 size={14}/> Remover</Button> : null}</div>
        </fieldset>)}
        {editor.steps.length < 20 ? <Button variant="secondary" onClick={() => setEditor({ ...editor, steps: [...editor.steps, emptyStep(editor.steps.length)] })}><Plus size={15}/> Adicionar e-mail</Button> : null}
      </div> : null}
    </Modal>
  </div>
}
