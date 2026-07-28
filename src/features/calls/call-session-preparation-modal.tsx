import { AlertCircle, CheckCircle2, Clock3, ListOrdered, PhoneCall, Play, RefreshCw, Settings2, Smartphone, Target, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { StatusPill } from '../../components/ui/status-pill'
import { formatDateTime } from '../../domain/formatters'
import {
  listRealTalentConnectDevices,
  readDefaultConnectDevice,
  saveDefaultConnectDevice,
  type RealTalentConnectDevice,
} from '../../services/realtalent-connect'
import { CallDisplayPreferencesModal } from './call-display-preferences-modal'
import { readCallDisplayPreferences, saveCallDisplayPreferences, type CallDisplayPreferences } from '../../services/call-display-preferences'
import type { CallSessionConfig } from './call-session-config'

type QueueOrder = 'smart' | 'name' | 'next_action'

export function CallSessionPreparationModal({ open, leadIds, initialLeadId, onClose, onStart }: {
  open: boolean
  leadIds: string[]
  initialLeadId?: string
  onClose(): void
  onStart(config: CallSessionConfig): void
}) {
  const { snapshot, currentWorkspace, repositoryMode, notify } = useApp()
  const workspaceId = currentWorkspace?.id ?? snapshot?.workspace.id ?? 'default'
  const [devices, setDevices] = useState<RealTalentConnectDevice[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [playbookId, setPlaybookId] = useState('')
  const [goal, setGoal] = useState(10)
  const [limit, setLimit] = useState(20)
  const [order, setOrder] = useState<QueueOrder>('smart')
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [display, setDisplay] = useState<CallDisplayPreferences>(() => readCallDisplayPreferences(workspaceId))
  const [displayOpen, setDisplayOpen] = useState(false)

  const availableLeads = useMemo(() => {
    const uniqueIds = [...new Set(leadIds)]
    const leads = uniqueIds.map((id) => snapshot?.leads.find((lead) => lead.id === id)).filter((lead): lead is NonNullable<typeof lead> => Boolean(lead?.phone && lead.status === 'active'))
    const sorted = [...leads]
    if (order === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    if (order === 'next_action') sorted.sort((a, b) => (a.nextActionAt ?? '9999').localeCompare(b.nextActionAt ?? '9999'))
    return sorted.slice(0, Math.max(1, Math.min(limit, 100)))
  }, [leadIds, limit, order, snapshot?.leads])

  const activeDevices = useMemo(() => devices.filter((device) => device.live), [devices])
  const selectedDevice = devices.find((device) => device.id === deviceId) ?? null
  const estimatedMinutes = Math.max(5, Math.round(availableLeads.length * 2.5))

  const refreshDevices = async () => {
    if (!workspaceId) return
    setLoadingDevices(true)
    try {
      const next = await listRealTalentConnectDevices(workspaceId)
      setDevices(next)
      const saved = readDefaultConnectDevice(workspaceId)
      const chosen = next.find((item) => item.id === saved && item.live) ?? next.find((item) => item.live) ?? next[0]
      setDeviceId((current) => next.some((item) => item.id === current) ? current : chosen?.id ?? '')
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Não foi possível consultar o RealTalent Connect.')
    } finally { setLoadingDevices(false) }
  }

  useEffect(() => {
    if (!open) return
    setDisplay(readCallDisplayPreferences(workspaceId))
    setLimit(Math.max(1, Math.min(leadIds.length || 1, 20)))
    setGoal(Math.max(1, Math.min(leadIds.length || 10, 50)))
    setPlaybookId(snapshot?.playbooks.find((item) => item.kind === 'script' && item.active)?.id ?? '')
    void refreshDevices()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId])

  const start = () => {
    if (!availableLeads.length) { notify('error', 'Não há leads com telefone nesta sessão.'); return }
    if (deviceId) saveDefaultConnectDevice(workspaceId, deviceId)
    saveCallDisplayPreferences(workspaceId, display)
    const preferred = initialLeadId && availableLeads.some((lead) => lead.id === initialLeadId) ? initialLeadId : availableLeads[0].id
    onStart({ leadIds: availableLeads.map((lead) => lead.id), initialLeadId: preferred, deviceId, playbookId, sessionGoal: goal, display })
  }

  return <>
    <Modal
      open={open}
      onClose={onClose}
      title="Preparar sessão de ligações"
      subtitle="Defina fila, dispositivo e visualização antes de começar."
      size="xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><span className="modal__footer-spacer" /><Button onClick={start} disabled={!availableLeads.length}><Play size={17} /> Começar sessão</Button></>}
    >
      <div className="call-preparation-grid">
        <section className="call-preparation-card call-preparation-card--summary">
          <div className="call-preparation-card__title"><ListOrdered size={19} /><div><strong>Fila da sessão</strong><span>Escolha quantos contatos serão trabalhados.</span></div></div>
          <div className="call-preparation-kpis"><div><strong>{availableLeads.length}</strong><span>leads</span></div><div><strong>{estimatedMinutes} min</strong><span>estimativa</span></div><div><strong>{goal}</strong><span>meta de conversas</span></div></div>
          <div className="call-preparation-fields">
            <label><span>Quantidade</span><input type="number" min={1} max={100} value={limit} onChange={(event) => setLimit(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} /></label>
            <label><span>Ordenação</span><select value={order} onChange={(event) => setOrder(event.target.value as QueueOrder)}><option value="smart">Prioridade inteligente</option><option value="next_action">Próxima ação</option><option value="name">Nome do lead</option></select></label>
            <label><span>Meta de conversas</span><input type="number" min={1} max={100} value={goal} onChange={(event) => setGoal(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} /></label>
          </div>
          <div className="call-preparation-preview">{availableLeads.slice(0, 5).map((lead, index) => <div key={lead.id}><span>{index + 1}</span><div><strong>{lead.name}</strong><small>{lead.company || 'Empresa não informada'} · {lead.phone}</small></div></div>)}{availableLeads.length > 5 ? <p>+ {availableLeads.length - 5} contatos na sessão</p> : null}</div>
        </section>

        <section className="call-preparation-card">
          <div className="call-preparation-card__title"><Smartphone size={19} /><div><strong>RealTalent Connect</strong><span>Envie a chamada para o dispositivo escolhido.</span></div><Button size="sm" variant="ghost" loading={loadingDevices} onClick={() => void refreshDevices()}><RefreshCw size={15} /> Atualizar</Button></div>
          {repositoryMode === 'local' ? <div className="call-connect-warning"><AlertCircle size={17} /><span>Modo local: o Connect funciona apenas como simulação. Para comandos reais, publique a migration V100.46.5 no Supabase.</span></div> : null}
          {devices.length ? <div className="call-device-list">{devices.map((device) => <button type="button" key={device.id} className={deviceId === device.id ? 'is-selected' : ''} onClick={() => setDeviceId(device.id)} disabled={!device.live}><span className={`call-device-icon ${device.live ? 'is-live' : ''}`}>{device.live ? <Wifi size={18} /> : <WifiOff size={18} />}</span><div><strong>{device.deviceName}</strong><small>{device.platform} · app {device.appVersion} · visto {formatDateTime(device.lastSeenAt)}</small></div><StatusPill tone={device.live ? 'success' : device.status === 'error' ? 'danger' : 'neutral'}>{device.live ? 'Disponível' : device.status === 'connected' ? 'Offline' : device.status}</StatusPill></button>)}</div> : <div className="call-device-empty"><WifiOff size={24} /><strong>Nenhum dispositivo encontrado</strong><span>Abra o RealTalent Connect, entre na mesma organização e aguarde o heartbeat.</span></div>}
          {selectedDevice?.live ? <div className="call-connect-ready"><CheckCircle2 size={17} /><span>Chamadas serão enviadas para <strong>{selectedDevice.deviceName}</strong>.</span></div> : null}
        </section>

        <section className="call-preparation-card">
          <div className="call-preparation-card__title"><PhoneCall size={19} /><div><strong>Roteiro e execução</strong><span>Selecione o material principal da sessão.</span></div></div>
          <label className="field"><span>Roteiro da equipe</span><select value={playbookId} onChange={(event) => setPlaybookId(event.target.value)}><option value="">Roteiro outbound padrão</option>{snapshot?.playbooks.filter((item) => item.kind === 'script' && item.active).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <div className="call-preparation-info"><Target size={17} /><div><strong>Objetivo da sessão</strong><span>Trabalhar a fila sem alternar entre páginas e registrar um próximo passo obrigatório.</span></div></div>
          <div className="call-preparation-info"><Clock3 size={17} /><div><strong>Wrap-up progressivo</strong><span>O formulário de resultado aparece somente depois que a tentativa for encerrada.</span></div></div>
        </section>

        <section className="call-preparation-card call-preparation-card--display">
          <div className="call-preparation-card__title"><Settings2 size={19} /><div><strong>Sua visualização</strong><span>Mostre somente o que ajuda durante a conversa.</span></div></div>
          <div className="call-display-summary"><span>{display.showQueueSidebar ? 'Fila lateral' : 'Sem fila lateral'}</span><span>{display.showObjections ? 'Objeções' : 'Sem objeções'}</span><span>{display.showNotes ? 'Notas' : 'Sem notas'}</span><span>{display.showRecording ? 'Gravação' : 'Sem gravação'}</span></div>
          <Button variant="secondary" onClick={() => setDisplayOpen(true)}><Settings2 size={16} /> Escolher o que quero ver</Button>
        </section>
      </div>
    </Modal>
    <CallDisplayPreferencesModal open={displayOpen} value={display} onClose={() => setDisplayOpen(false)} onSave={(next) => { setDisplay(next); setDisplayOpen(false) }} />
  </>
}
