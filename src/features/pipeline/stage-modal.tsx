import { ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { PipelineStage } from '../../domain/types'
import { effectiveStagePolicy, recommendedStagePolicy } from '../../services/pipeline-intelligence'
import { usePreferences } from '../settings/preferences-context'
import { DEFAULT_STAGE_CONFIG, loadPipelinePreferences, savePipelinePreferences, type PipelineStageConfig } from './pipeline-preferences'

interface StageFormValue {
  name: string
  color: string
  probability: number
  outcome: 'active' | 'won' | 'lost'
  config: PipelineStageConfig
}
const emptyValue: StageFormValue = { name: '', color: '#4361ee', probability: 20, outcome: 'active', config: DEFAULT_STAGE_CONFIG }

export function StageModal({ open, stage, leadCount, workspaceId, stageIndex, stageTotal, onClose }: { open: boolean; stage: PipelineStage | null; leadCount: number; workspaceId: string; stageIndex: number; stageTotal: number; onClose(): void }) {
  const { createStage, updateStage, deleteStage, notify } = useApp()
  const { preferences: crmPreferences, savePreferences: saveCrmPreferences } = usePreferences()
  const [value, setValue] = useState<StageFormValue>(emptyValue)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const preferences = loadPipelinePreferences(workspaceId)
    setValue(stage ? {
      name: stage.name,
      color: stage.color,
      probability: stage.probability,
      outcome: stage.isWon ? 'won' : stage.isLost ? 'lost' : 'active',
      config: effectiveStagePolicy(recommendedStagePolicy(stage, stageIndex, stageTotal), preferences.stageConfigs[stage.id], crmPreferences.commercial.pipelineStagePolicies[stage.id]),
    } : { ...emptyValue, config: recommendedStagePolicy(undefined, stageIndex, stageTotal) })
  }, [crmPreferences.commercial.pipelineStagePolicies, open, stage, stageIndex, stageTotal, workspaceId])

  const submit = async () => {
    if (!value.name.trim()) return
    setSaving(true)
    try {
      const input = { name: value.name.trim(), color: value.color, probability: value.probability, isWon: value.outcome === 'won', isLost: value.outcome === 'lost' }
      const savedStage = stage ? await updateStage(stage.id, input) : await createStage(input)
      const preferences = loadPipelinePreferences(workspaceId)
      preferences.stageConfigs[savedStage.id] = value.config
      savePipelinePreferences(workspaceId, preferences)
      saveCrmPreferences({ ...crmPreferences, commercial: { ...crmPreferences.commercial, pipelineStagePolicies: { ...crmPreferences.commercial.pipelineStagePolicies, [savedStage.id]: value.config } } })
      onClose()
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Falha ao salvar etapa.') }
    finally { setSaving(false) }
  }

  const remove = async () => {
    if (!stage || leadCount > 0) return
    if (!window.confirm(`Excluir a etapa “${stage.name}”?`)) return
    setSaving(true)
    try {
      await deleteStage(stage.id)
      const preferences = loadPipelinePreferences(workspaceId)
      delete preferences.stageConfigs[stage.id]
      preferences.collapsedStageIds = preferences.collapsedStageIds.filter((id) => id !== stage.id)
      savePipelinePreferences(workspaceId, preferences)
      const pipelineStagePolicies = { ...crmPreferences.commercial.pipelineStagePolicies }
      delete pipelineStagePolicies[stage.id]
      saveCrmPreferences({ ...crmPreferences, commercial: { ...crmPreferences.commercial, pipelineStagePolicies } })
      onClose()
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Falha ao excluir etapa.') }
    finally { setSaving(false) }
  }

  const updateConfig = <K extends keyof PipelineStageConfig>(key: K, next: PipelineStageConfig[K]) => setValue((current) => ({ ...current, config: { ...current.config, [key]: next } }))

  return <Modal
    open={open}
    title={stage ? 'Configurar etapa' : 'Nova etapa'}
    subtitle={stage ? 'Defina aparência, prazo, critérios e regras de movimentação.' : 'Crie uma coluna com critérios comerciais claros.'}
    onClose={onClose}
    size="lg"
    footer={<>
      {stage ? <Button variant="danger" disabled={saving || leadCount > 0} onClick={() => void remove()} title={leadCount > 0 ? 'Mova os leads antes de excluir' : undefined}><Trash2 size={16} /> Excluir</Button> : null}
      <span className="modal__footer-spacer" />
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      <Button loading={saving} onClick={() => void submit()}>Salvar etapa</Button>
    </>}
  >
    <div className="form-grid stage-professional-form">
      <label className="field field--span-2"><span>Nome da etapa *</span><input autoFocus value={value.name} onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Reunião marcada" /></label>
      <label className="field"><span>Cor</span><div className="color-field"><input type="color" value={value.color} onChange={(event) => setValue((current) => ({ ...current, color: event.target.value }))} /><code>{value.color}</code></div></label>
      <label className="field"><span>Probabilidade (%)</span><input type="number" min="0" max="100" value={value.probability} onChange={(event) => setValue((current) => ({ ...current, probability: Math.max(0, Math.min(100, Number(event.target.value))) }))} /></label>
      <label className="field"><span>Resultado da etapa</span><select value={value.outcome} onChange={(event) => setValue((current) => ({ ...current, outcome: event.target.value as StageFormValue['outcome'] }))}><option value="active">Em andamento</option><option value="won">Venda ganha</option><option value="lost">Oportunidade perdida</option></select></label>
      <label className="field"><span>Prazo saudável na etapa</span><div className="field-with-suffix"><input type="number" min="1" max="365" value={value.config.maxDays} onChange={(event) => updateConfig('maxDays', Math.max(1, Math.min(365, Number(event.target.value) || 1)))} /><span>dias</span></div></label>

      <div className="stage-rules-heading field--span-2"><ShieldCheck size={18} /><div><strong>Critérios para entrar nesta etapa</strong><span>As regras evitam avanços sem dados mínimos e ajudam a manter o Pipeline confiável.</span></div></div>
      <label className="stage-rule-check"><input type="checkbox" checked={value.config.requirePhone} onChange={(event) => updateConfig('requirePhone', event.target.checked)} /><span><strong>Exigir telefone</strong><small>Impede a movimentação quando o contato não está preenchido.</small></span></label>
      <label className="stage-rule-check"><input type="checkbox" checked={value.config.requireValue} onChange={(event) => updateConfig('requireValue', event.target.checked)} /><span><strong>Exigir valor</strong><small>Garante que oportunidades avançadas tenham estimativa financeira.</small></span></label>
      <label className="stage-rule-check"><input type="checkbox" checked={value.config.requireNextAction} onChange={(event) => updateConfig('requireNextAction', event.target.checked)} /><span><strong>Exigir próxima ação</strong><small>Evita negócios avançados sem um próximo passo agendado.</small></span></label>
      <label className="stage-rule-check"><input type="checkbox" checked={value.config.preventSkipping} onChange={(event) => updateConfig('preventSkipping', event.target.checked)} /><span><strong>Impedir salto de etapas</strong><small>Permite entrar somente a partir da etapa imediatamente anterior.</small></span></label>
      <label className="stage-rule-check field--span-2"><input type="checkbox" checked={value.config.confirmBackward} onChange={(event) => updateConfig('confirmBackward', event.target.checked)} /><span><strong>Confirmar movimentação para trás</strong><small>Solicita confirmação antes de retroceder uma oportunidade.</small></span></label>
      <label className="field field--span-2"><span>Orientação comercial da etapa</span><textarea rows={3} value={value.config.instructions} onChange={(event) => updateConfig('instructions', event.target.value)} placeholder="Ex.: validar decisor, confirmar necessidade e registrar próximo passo antes de avançar." /></label>
      {stage && leadCount > 0 ? <div className="warning-box field--span-2"><strong>Esta etapa possui {leadCount} lead(s).</strong><span>Mova os cards para outra etapa antes de excluí-la.</span></div> : null}
    </div>
  </Modal>
}
