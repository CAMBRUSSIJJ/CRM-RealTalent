import { useEffect, useState } from 'react'
import { Bell, Clock3, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { loadGatewayLocalTaskAutoHistory, type LocalTaskAutoJob } from '../../services/local-communications-gateway'
import type { TaskStatus, WorkTask } from '../../domain/types'
import {
  loadTaskReminderHistory, reminderChannelLabel, reminderHistoryStatusLabel,
  type TaskReminderHistory,
} from '../../services/task-reminder-history'
import '../../styles/task-reminders.css'

export type TaskReminderDraft = {
  enabled: boolean
  onAssignment: boolean
  channels: Array<'in_app' | 'email' | 'whatsapp'>
  offsets: number[]
  customMinutes: number | null
}
export const defaultTaskReminders = (): TaskReminderDraft => ({
  enabled: true, onAssignment: true, channels: ['in_app'], offsets: [60], customMinutes: null,
})
export const draftTaskReminders = (task: WorkTask | null): TaskReminderDraft => ({
  enabled: task?.reminderEnabled ?? true,
  onAssignment: task?.reminderOnAssignment ?? true,
  channels: task?.reminderChannels ?? ['in_app'],
  offsets: task?.reminderOffsetsMinutes ?? [60],
  customMinutes: task?.reminderCustomMinutes ?? null,
})

type Props = {
  value: TaskReminderDraft
  onChange(value: TaskReminderDraft): void
  assigneeId: string
  assigneeName: string | null
  dueAt: string
  status: TaskStatus
  taskId: string | null
  workspaceId: string
  repositoryMode: 'local' | 'supabase'
  open: boolean
}

const localJobStatusLabel: Record<LocalTaskAutoJob['status'],string> = {
  pending:'Programado', processing:'Processando', sent:'Aceito pelo gateway', failed:'Falhou',
  unknown:'Resultado incerto — conferir conversa', cancelled:'Cancelado', blocked:'Bloqueado', expired:'Expirado',
}
const dateLabel = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

export function TaskReminderEditor({ value, onChange, assigneeId, assigneeName, dueAt, status, taskId, workspaceId, repositoryMode, open }: Props) {
  const [history, setHistory] = useState<TaskReminderHistory[]>([])
  const [localJobs, setLocalJobs] = useState<LocalTaskAutoJob[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const activeTask = ['todo', 'in_progress', 'blocked'].includes(status)
  const canSchedule = activeTask && Boolean(assigneeId)
  useEffect(() => {
    if (!open || !taskId || !workspaceId || repositoryMode !== 'supabase') {
      setHistory([])
      setHistoryError('')
      return
    }
    let active = true
    setLoadingHistory(true)
    void loadTaskReminderHistory(workspaceId, taskId).then(rows => {
      if (active) { setHistory(rows); setHistoryError('') }
    }).catch(err => {
      if (active) setHistoryError(err instanceof Error ? err.message : 'Histórico indisponível.')
    }).finally(() => { if (active) setLoadingHistory(false) })
    return () => { active = false }
  }, [open, taskId, workspaceId, repositoryMode, historyRefresh])

  useEffect(() => {
    if (!open || repositoryMode !== 'local' || !taskId || !workspaceId) { setLocalJobs([]); return }
    let live = true
    void loadGatewayLocalTaskAutoHistory(workspaceId, taskId).then(response => {
      if (live) { setLocalJobs(response.jobs || []); setHistoryError('') }
    }).catch(() => {
      if (live) { setLocalJobs([]); setHistoryError('Não foi possível consultar a fila local de WhatsApp.') }
    })
    return () => { live = false }
  }, [open, taskId, workspaceId, repositoryMode, historyRefresh])

  const toggleChannel = (channel: TaskReminderDraft['channels'][number]) => {
    onChange({ ...value, channels: value.channels.includes(channel)
      ? value.channels.filter(item => item !== channel) : [...value.channels, channel] })
  }
  const toggleOffset = (offset: number) => {
    onChange({ ...value, offsets: value.offsets.includes(offset)
      ? value.offsets.filter(item => item !== offset) : [...value.offsets, offset] })
  }
  const noDestination = !canSchedule && value.enabled
  return <section className="work-form-section task-reminders">
    <header><Bell size={18}/><div><strong>Notificações e lembretes</strong>
      <small>Defina quando avisar o responsável. O sistema respeita suas permissões e os canais autorizados.</small>
    </div></header>
    <label className="task-reminders__toggle">
      <input type="checkbox" checked={value.enabled} onChange={e => onChange({ ...value, enabled: e.target.checked })} />
      <span><strong>Ativar lembretes desta tarefa</strong><small>O aviso interno é o canal padrão. Mensagens externas dependem de configuração.</small></span>
    </label>
    {value.enabled ? <div className="task-reminders__body">
      {noDestination ? <p className="task-reminders__notice">Escolha um responsável e mantenha a tarefa aberta para programar lembretes.</p> : null}
      {canSchedule ? <p className="task-reminders__notice" role="status">
        Destinatário automático: <strong>{assigneeName || 'Integrante selecionado'}</strong>. O CRM utiliza a identidade do responsável para consultar seus contatos e preferências cadastrados, sem solicitar um número nesta tarefa. A programação não confirma envio; consulte o histórico e o estado da integração.
      </p> : null}
      <div className="task-reminders__columns">
        <div>
          <strong className="task-reminders__label">Onde notificar</strong>
          <div className="task-reminders__choices">
            {([
              ['in_app','No CRM'],['email','E-mail'],['whatsapp',repositoryMode === 'local' ? 'WhatsApp QR experimental' : 'WhatsApp oficial'],
            ] as const).map(([channel,label]) => <label key={channel} className="task-reminders__choice">
              <input type="checkbox" checked={value.channels.includes(channel)} onChange={() => toggleChannel(channel)} />
              <span>{label}</span>
            </label>)}
          </div>
          {value.channels.some(c => c !== 'in_app') ? <p className="task-reminders__notice">
            {repositoryMode === 'local'
              ? 'O WhatsApp QR pode enviar automaticamente se o integrante autorizou e ativou a automação em Equipe e permissões. A conexão por QR precisa estar ativa no gateway local; não é a API oficial. E-mail automático não está disponível no modo local.'
              : 'E-mail e WhatsApp oficial ficam programados até que o funcionário autorize o canal e o servidor esteja homologado. A conexão por QR de Comunicações não ativa mensagens automáticas na nuvem.'}
          </p> : null}
        </div>
        <div>
          <strong className="task-reminders__label">Quando notificar</strong>
          <label className="task-reminders__choice">
            <input type="checkbox" checked={value.onAssignment} onChange={e => onChange({ ...value, onAssignment: e.target.checked })} />
            <span>Ao atribuir a tarefa</span>
          </label>
          <div className="task-reminders__choices">
            {[{ minutes:1440, label:'1 dia antes' },{ minutes:60,label:'1 hora antes' },{ minutes:15,label:'15 minutos antes' }]
              .map(item => <label className="task-reminders__choice" key={item.minutes}>
                <input type="checkbox" checked={value.offsets.includes(item.minutes)} disabled={!dueAt} onChange={() => toggleOffset(item.minutes)} />
                <span>{item.label}</span>
              </label>)}
          </div>
          <label className="task-reminders__custom"><span>Antecedência personalizada adicional (minutos)</span>
            <input type="number" inputMode="numeric" min={5} max={10080} step={1}
              disabled={!dueAt} value={value.customMinutes ?? ''}
              onChange={e => onChange({ ...value, customMinutes: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Ex.: 120" />
          </label>
        </div>
      </div>
      {!dueAt ? <p className="task-reminders__notice">Sem prazo, o sistema só poderá avisar quando a tarefa for atribuída.</p> : null}
      {!value.channels.length ? <p className="task-reminders__notice">Nenhum canal selecionado. Não haverá envios.</p> : null}
      {repositoryMode === 'local'
        ? <p className="task-reminders__notice">Modo local: WhatsApp QR automático experimental exige integrante autorizado, automação ativada na Equipe, e Communications Gateway h14 rodando. Os avisos persistem no serviço enquanto ele permanecer ligado; para notificações oficiais em nuvem, o envio automático exige Supabase e integração da Meta.</p>
        : <p className="task-reminders__notice">A regra é gravada no Supabase. O envio depende de um agendador ativo e, para e-mail ou WhatsApp, de autorização e integração oficial. Confira Configurações → Notificações antes de confiar no lembrete.</p>}
    </div> : null}
    {taskId ? <div className="task-reminders__history">
      <div className="task-reminders__history-heading"><strong>Histórico de notificações</strong>
        <Button variant="secondary" size="sm" onClick={() => setHistoryRefresh(x => x+1)} disabled={loadingHistory}><RefreshCw size={14}/> Atualizar</Button>
      </div>
      {historyError ? <p className="task-reminders__notice" role="status">{historyError}</p> : null}
      {repositoryMode === 'local' ? (!localJobs.length
          ? <p className="task-reminders__muted">Ainda não há agendamentos automáticos registrados neste gateway para esta tarefa.</p>
          : <ol className="task-reminders__timeline">{[...localJobs].reverse().map(job => <li key={job.id}>
              <span className={`task-reminders__dot is-${job.status}`} aria-hidden="true" />
              <div><strong>WhatsApp QR · {job.eventType === 'assigned' ? 'Atribuição' : 'Antes do prazo'}</strong>
                <small><Clock3 size={12}/>{dateLabel(job.at)} · {localJobStatusLabel[job.status]}</small>
              </div>
            </li>)}</ol>)
        : loadingHistory ? <p className="task-reminders__muted">Consultando histórico…</p>
        : !history.length ? <p className="task-reminders__muted">Sem eventos registrados para esta tarefa.</p>
        : <ol className="task-reminders__timeline">{history.map(item => <li key={item.id}>
          <span className={`task-reminders__dot is-${item.status}`} aria-hidden="true" />
          <div><strong>{reminderChannelLabel[item.channel]} · {item.eventType === 'assigned' ? 'Atribuição' : 'Antes do prazo'}</strong>
            <small><Clock3 size={12}/>{dateLabel(item.scheduledAt)} · {reminderHistoryStatusLabel[item.status]}</small>
          </div>
        </li>)}</ol>}
      <small className="task-reminders__muted">“Enviado” significa aceito pelo provedor, não necessariamente entregue ou lido.</small>
    </div> : null}
  </section>
}
