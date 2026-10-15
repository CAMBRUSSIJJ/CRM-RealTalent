import { NativeSelectionSelect } from '../../components/selection'
import { useEffect, useMemo, useState } from 'react'
import { Save } from 'lucide-react'
import { useAppActions, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { CallOutcome, DecisionRole, LeadTemperature, Playbook, PlaybookExecutionMode, PlaybookKind, PlaybookObjective } from '../../domain/types'
import { decisionRoleLabels } from '../../services/account-intelligence'
import { CALL_SESSION_OBJECTIVES } from '../../services/call-session-intelligence'
import { executionModeLabels } from '../../services/playbook-execution'
import { outcomeLabel } from '../../services/call-workspace'

const kindLabels: Record<PlaybookKind, string> = { script: 'Script', objection: 'Objeção', battlecard: 'Battlecard', checklist: 'Checklist' }
const temperatureLabels: Record<LeadTemperature, string> = { cold: 'Frio', warm: 'Morno', hot: 'Quente' }
const selectableRoles: DecisionRole[] = ['decision_maker', 'economic_buyer', 'champion', 'influencer', 'finance', 'procurement', 'gatekeeper', 'blocker', 'user', 'operational']
const selectableOutcomes: CallOutcome[] = ['answered', 'callback_requested', 'interested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'not_interested', 'sale_completed']
const executionModes: PlaybookExecutionMode[] = ['step_by_step', 'checklist', 'call', 'meeting']

function toggleValue<T extends string>(current: T[], value: T) { return current.includes(value) ? current.filter((item) => item !== value) : [...current, value] }
function lines(value: string) { return value.split('\n').map((item) => item.trim()).filter(Boolean) }
function commaList(value: string) { return value.split(',').map((item) => item.trim()).filter(Boolean) }

export function PlaybookModal({ open, playbook, onClose }: { open: boolean; playbook?: Playbook | null; onClose(): void }) {
  const { snapshot } = useAppWorkspace()
  const { createPlaybook, updatePlaybook } = useAppActions()
  const [kind, setKind] = useState<PlaybookKind>('script')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [active, setActive] = useState(true)
  const [objectives, setObjectives] = useState<PlaybookObjective[]>([])
  const [stageIds, setStageIds] = useState<string[]>([])
  const [decisionRoles, setDecisionRoles] = useState<DecisionRole[]>([])
  const [outcomes, setOutcomes] = useState<CallOutcome[]>([])
  const [temperatures, setTemperatures] = useState<LeadTemperature[]>([])
  const [selectedModes, setSelectedModes] = useState<PlaybookExecutionMode[]>(['step_by_step'])
  const [segments, setSegments] = useState('')
  const [personas, setPersonas] = useState('')
  const [discoveryQuestions, setDiscoveryQuestions] = useState('')
  const [objectionPrompts, setObjectionPrompts] = useState('')
  const [meetingAgenda, setMeetingAgenda] = useState('')
  const [coachingFocus, setCoachingFocus] = useState('')
  const [successCriteria, setSuccessCriteria] = useState('')
  const [avoidPhrases, setAvoidPhrases] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const guidance = playbook?.guidance ?? {}
    setKind(playbook?.kind ?? 'script'); setTitle(playbook?.title ?? ''); setCategory(playbook?.category ?? '')
    setContent(playbook?.content ?? ''); setTags(playbook?.tags.join(', ') ?? ''); setActive(playbook?.active ?? true)
    setObjectives(guidance.objectives ?? []); setStageIds(guidance.stageIds ?? []); setDecisionRoles(guidance.decisionRoles ?? [])
    setOutcomes(guidance.outcomes ?? []); setTemperatures(guidance.temperatures ?? []); setCoachingFocus(guidance.coachingFocus ?? '')
    setSuccessCriteria((guidance.successCriteria ?? []).join('\n')); setAvoidPhrases((guidance.avoidPhrases ?? []).join('\n'))
    setSelectedModes(guidance.executionModes?.length ? guidance.executionModes : ['step_by_step'])
    setSegments((guidance.segments ?? []).join(', ')); setPersonas((guidance.personas ?? []).join(', '))
    setDiscoveryQuestions((guidance.discoveryQuestions ?? []).join('\n')); setObjectionPrompts((guidance.objectionPrompts ?? []).join('\n'))
    setMeetingAgenda((guidance.meetingAgenda ?? []).join('\n'))
  }, [open, playbook])

  const contextualCount = useMemo(() => objectives.length + stageIds.length + decisionRoles.length + outcomes.length + temperatures.length + commaList(segments).length + commaList(personas).length, [decisionRoles.length, objectives.length, outcomes.length, personas, segments, stageIds.length, temperatures.length])

  const save = async () => {
    if (!title.trim() || !content.trim()) return
    setBusy(true)
    try {
      const guidance = {
        objectives, stageIds, decisionRoles, outcomes, temperatures, coachingFocus: coachingFocus.trim(),
        successCriteria: lines(successCriteria), avoidPhrases: lines(avoidPhrases),
        executionModes: selectedModes.length ? selectedModes : ['step_by_step'] as PlaybookExecutionMode[],
        segments: commaList(segments), personas: commaList(personas),
        discoveryQuestions: lines(discoveryQuestions), objectionPrompts: lines(objectionPrompts), meetingAgenda: lines(meetingAgenda),
        conversationGraph: playbook?.guidance?.conversationGraph,
      }
      const input = { kind, title, category, content, tags: commaList(tags), guidance, active }
      if (playbook) await updatePlaybook(playbook.id, input); else await createPlaybook(input)
      onClose()
    } finally { setBusy(false) }
  }

  return <Modal open={open} onClose={onClose} title={playbook ? 'Editar roteiro / playbook' : 'Novo roteiro / playbook'} subtitle="Conteúdo comercial executável, com contexto, discovery, objeções e critérios de coaching." size="xl" footer={<><span className="modal__footer-spacer" /><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!title.trim() || !content.trim()} onClick={() => void save()}><Save size={16} /> Salvar</Button></>}>
    <div className="playbook-editor-grid">
      <section className="playbook-editor-section">
        <div className="playbook-editor-section__heading"><div><span className="eyebrow">Conteúdo</span><h3>Material da equipe</h3></div><span className="playbook-context-count">{contextualCount ? `${contextualCount} regras contextuais` : 'Uso geral'}</span></div>
        <div className="form-grid">
          <label className="field"><span>Tipo</span><NativeSelectionSelect value={kind} onChange={(event) => setKind(event.target.value as PlaybookKind)}>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelectionSelect></label>
          <label className="field"><span>Categoria</span><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Prospecção, discovery, fechamento..." /></label>
          <label className="field field--span-2"><span>Título</span><input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Discovery de serviços recorrentes" /></label>
          <label className="field field--span-2"><span>Conteúdo principal</span><textarea rows={9} required value={content} onChange={(event) => setContent(event.target.value)} placeholder="Separe etapas por linhas em branco para melhorar o modo Passo a passo." /></label>
          <label className="field field--span-2"><span>Tags</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="barbearia, discovery, concorrente" /></label>
        </div>
      </section>

      <section className="playbook-editor-section">
        <div className="playbook-editor-section__heading"><div><span className="eyebrow">Modo de uso</span><h3>Como a equipe executa este roteiro?</h3></div></div>
        <div className="playbook-rule-group"><strong>Visualizações disponíveis</strong><div className="playbook-chip-picker">{executionModes.map((mode) => <button type="button" key={mode} className={selectedModes.includes(mode) ? 'is-selected' : ''} onClick={() => setSelectedModes((current) => toggleValue(current, mode))}>{executionModeLabels[mode]}</button>)}</div></div>
        <div className="form-grid">
          <label className="field"><span>Segmentos · separados por vírgula</span><input value={segments} onChange={(event) => setSegments(event.target.value)} placeholder="Barbearias, Salões, Clínicas" /></label>
          <label className="field"><span>Personas · separadas por vírgula</span><input value={personas} onChange={(event) => setPersonas(event.target.value)} placeholder="Dono, Gerente, Financeiro" /></label>
          <label className="field"><span>Perguntas de discovery · uma por linha</span><textarea rows={6} value={discoveryQuestions} onChange={(event) => setDiscoveryQuestions(event.target.value)} placeholder={'Como vocês fazem isso hoje?\nQual impacto isso gera?\nQuem participa da decisão?'} /></label>
          <label className="field"><span>Objeções para preparar · uma por linha</span><textarea rows={6} value={objectionPrompts} onChange={(event) => setObjectionPrompts(event.target.value)} placeholder={'Já tenho sistema\nNão tenho tempo\nPreciso falar com meu sócio'} /></label>
          <label className="field field--span-2"><span>Agenda de reunião · um tópico por linha</span><textarea rows={5} value={meetingAgenda} onChange={(event) => setMeetingAgenda(event.target.value)} placeholder={'Contexto atual\nImpactos e prioridades\nCritérios de decisão\nPróximo passo'} /></label>
        </div>
      </section>

      <section className="playbook-editor-section">
        <div className="playbook-editor-section__heading"><div><span className="eyebrow">Recomendação adaptativa</span><h3>Quando este roteiro deve aparecer?</h3></div></div>
        <div className="playbook-rule-group"><strong>Objetivo da ligação</strong><div className="playbook-chip-picker">{CALL_SESSION_OBJECTIVES.map((item) => <button type="button" key={item.id} className={objectives.includes(item.id) ? 'is-selected' : ''} onClick={() => setObjectives((current) => toggleValue(current, item.id))}>{item.shortLabel}</button>)}</div></div>
        <div className="playbook-rule-group"><strong>Etapa do pipeline</strong><div className="playbook-chip-picker">{(snapshot?.stages ?? []).map((stage) => <button type="button" key={stage.id} className={stageIds.includes(stage.id) ? 'is-selected' : ''} onClick={() => setStageIds((current) => toggleValue(current, stage.id))}>{stage.name}</button>)}{!snapshot?.stages.length ? <span className="activity-empty">Nenhuma etapa disponível.</span> : null}</div></div>
        <div className="playbook-rule-group"><strong>Persona / papel na decisão</strong><div className="playbook-chip-picker">{selectableRoles.map((role) => <button type="button" key={role} className={decisionRoles.includes(role) ? 'is-selected' : ''} onClick={() => setDecisionRoles((current) => toggleValue(current, role))}>{decisionRoleLabels[role]}</button>)}</div></div>
        <div className="playbook-rule-group"><strong>Resultado da conversa</strong><div className="playbook-chip-picker">{selectableOutcomes.map((result) => <button type="button" key={result} className={outcomes.includes(result) ? 'is-selected' : ''} onClick={() => setOutcomes((current) => toggleValue(current, result))}>{outcomeLabel(result)}</button>)}</div></div>
        <div className="playbook-rule-group"><strong>Temperatura</strong><div className="playbook-chip-picker">{(Object.keys(temperatureLabels) as LeadTemperature[]).map((temperature) => <button type="button" key={temperature} className={temperatures.includes(temperature) ? 'is-selected' : ''} onClick={() => setTemperatures((current) => toggleValue(current, temperature))}>{temperatureLabels[temperature]}</button>)}</div></div>
      </section>

      <section className="playbook-editor-section">
        <div className="playbook-editor-section__heading"><div><span className="eyebrow">Coaching</span><h3>Critérios de execução</h3></div></div>
        <div className="form-grid">
          <label className="field field--span-2"><span>Foco do coaching</span><input value={coachingFocus} onChange={(event) => setCoachingFocus(event.target.value)} placeholder="Ex.: diagnosticar impacto antes de apresentar produto" /></label>
          <label className="field"><span>Critérios de sucesso · um por linha</span><textarea rows={5} value={successCriteria} onChange={(event) => setSuccessCriteria(event.target.value)} placeholder={'Dor confirmada\nDecisor identificado\nPróximo passo com data'} /></label>
          <label className="field"><span>Evitar · um por linha</span><textarea rows={5} value={avoidPhrases} onChange={(event) => setAvoidPhrases(event.target.value)} placeholder={'Prometer resultado sem contexto\nAtacar concorrente\nFalar de preço cedo demais'} /></label>
        </div>
      </section>

      <label className="toggle-field"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><strong>Disponível para a equipe</strong><small>Roteiros inativos permanecem no histórico, mas deixam de ser recomendados no fluxo comercial.</small></span></label>
    </div>
  </Modal>
}
