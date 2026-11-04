import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BellRing, Clock3, Mail, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import type { WorkTask } from '../../domain/types'
import { Button } from '../../components/ui/button'
import {
  loadCloudReminderReadiness, loadCloudTaskNotificationHistory,
  reminderChannelLabel, reminderErrorLabel, reminderStatusLabel,
  type CloudReminderReadiness, type CloudTaskNotification,
} from '../../services/notifications/cloud-task-notification-history'
import '../../styles/communication-automation-center.css'

type Filter = 'pending' | 'attention' | 'history' | 'diagnostics'
interface Props {
  workspaceId: string
  tasks: WorkTask[]
  onOpenTask(task: WorkTask): void
}
const category = (row: CloudTaskNotification, filter: Filter) =>
  filter === 'pending' ? ['pending', 'processing'].includes(row.status) :
  filter === 'attention' ? ['failed', 'blocked', 'skipped'].includes(row.status) :
  filter === 'history' ? ['sent', 'cancelled'].includes(row.status) : false

const readableTime = (timestamp: string | null) => {
  if (!timestamp) return 'Não informado'
  const date = new Date(timestamp)
  return Number.isFinite(date.valueOf())
    ? date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Data indisponível'
}

export function CloudTaskAutomationCenter({ workspaceId, tasks, onOpenTask }: Props) {
  const [filter, setFilter] = useState<Filter>('pending')
  const [records, setRecords] = useState<CloudTaskNotification[]>([])
  const [readiness, setReadiness] = useState<CloudReminderReadiness | null>(null)
  const [readinessError, setReadinessError] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  const visibleIds = tasks.map(task => task.id).sort().join('|')
  const knownTasks = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks])
  const activeTaskIds = useMemo(() => visibleIds.split('|').filter(Boolean), [visibleIds])

  useEffect(() => {
    if (!workspaceId) return
    let active = true
    let busy = false
    const fetchStatus = async () => {
      if (busy) return
      busy = true
      if (active) setLoading(true)
      try {
        const result = await loadCloudTaskNotificationHistory(workspaceId, activeTaskIds)
        if (active) { setRecords(result); setError('') }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Histórico de notificações indisponível.')
      } finally {
        busy = false
        if (active) setLoading(false)
      }
    }
    void fetchStatus()
    const interval = window.setInterval(() => void fetchStatus(), 30_000)
    return () => { active = false; window.clearInterval(interval) }
  }, [workspaceId, visibleIds, revision])

  useEffect(() => {
    let active = true
    if (!workspaceId) return
    void loadCloudReminderReadiness(workspaceId).then(result => {
      if (active) { setReadiness(result); setReadinessError(false) }
    }).catch(() => { if (active) setReadinessError(true) })
    return () => { active = false }
  }, [workspaceId, revision])

  const visible = useMemo(() => records.filter(row => category(row, filter)), [records, filter])
  const count = (statuses: CloudTaskNotification['status'][]) =>
    records.filter(row => statuses.includes(row.status)).length
  const missing = tasks.filter(task => task.assigneeId && task.reminderEnabled !== false &&
    !records.some(row => row.taskId === task.id))
  const channels = readiness?.deliveryEnabled
    ? 'O envio externo está habilitado, mas a entrega depende das credenciais, preferências e verificações do destinatário.'
    : 'E-mail e WhatsApp estão desativados no servidor ou pendentes de homologação. O CRM não tentará envios externos sem essa configuração.'

  return <section className="communication-automation-console" aria-label="Notificações e automações hospedadas">
    <div className="communication-automation-console__intro">
      <div>
        <strong><BellRing size={17}/> Notificações da equipe · CRM online</strong>
        <p>Histórico real do Supabase. Uma regra configurada não é prova de que o aviso foi enviado.</p>
      </div>
      <Button variant="secondary" size="sm" disabled={loading} onClick={() => setRevision(value => value + 1)}>
        <RefreshCw size={14}/> Atualizar
      </Button>
    </div>

    <div className="communication-automation-console__tabs" role="group" aria-label="Situação das notificações">
      {([
        ['pending', 'Programados', count(['pending', 'processing'])],
        ['attention', 'Precisam atenção', count(['failed', 'blocked', 'skipped'])],
        ['history', 'Histórico', count(['sent', 'cancelled'])],
        ['diagnostics', 'Diagnóstico', missing.length],
      ] as const).map(([key, label, total]) =>
        <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
          {label}<span>{total}</span>
        </button>)}
    </div>

    {error ? <p className="communication-automation-console__alert" role="alert">
      <AlertTriangle size={16}/> {error}
    </p> : null}
    {loading && !records.length ? <p className="communication-automation-console__hint">
      Consultando fila de notificações do Supabase…
    </p> : null}

    {filter === 'diagnostics'
      ? <div className="communication-automation-console__records">
        <article className="communication-automation-console__record">
          <div className="communication-automation-console__mark"><ShieldCheck size={16}/></div>
          <div className="communication-automation-console__body">
            <strong>Avisos internos</strong>
            <small>{readiness?.databaseReady === false ? 'Banco de notificações não preparado.'
              : 'O servidor registra as atribuições e processa os avisos no CRM pelo agendador do banco.'}</small>
            <small>O histórico mostra eventos criados depois da atribuição ou reatribuição, sem reenviar avisos antigos.</small>
          </div>
        </article>
        <article className="communication-automation-console__record">
          <div className="communication-automation-console__mark"><Mail size={16}/></div>
          <div className="communication-automation-console__body">
            <strong>Entrega externa · e-mail e WhatsApp</strong>
            <small>{channels}</small>
            <small>E-mail: {readiness?.emailCredentialsPresent ? 'credenciais cadastradas; entrega não comprovada' : 'provedor não configurado'}.
              {' '}WhatsApp oficial: {readiness?.whatsappCredentialsPresent ? 'credenciais cadastradas; modelo/entrega não comprovados' : 'provedor não configurado'}.</small>
            {readinessError ? <small>Não foi possível confirmar a configuração do servidor.</small> : null}
          </div>
        </article>
        {missing.map(task => <article className="communication-automation-console__record" key={task.id}>
          <div className="communication-automation-console__mark"><Clock3 size={16}/></div>
          <div className="communication-automation-console__body">
            <strong>{task.title}</strong>
            <small>Não há eventos recentes no histórico consultado. Avisos são registrados quando uma tarefa é atribuída, reatribuída ou quando um lembrete futuro é configurado.</small>
          </div>
          <Button variant="secondary" size="sm" onClick={() => onOpenTask(task)}>Abrir tarefa</Button>
        </article>)}
      </div>
      : <div className="communication-automation-console__records">
        {!loading && !error && !visible.length ? <p className="communication-automation-console__hint">
          {filter === 'pending' ? 'Nenhuma notificação aguardando processamento. Veja o histórico ou diagnóstico.'
            : filter === 'history' ? 'Ainda não há notificações processadas para as tarefas visíveis.'
              : 'Nenhum erro registrado para as tarefas visíveis.'}
        </p> : null}
        {visible.map(item => {
          const task = knownTasks.get(item.taskId)
          if (!task) return null
          const Icon = item.channel === 'email' ? Mail : item.channel === 'whatsapp' ? MessageCircle : BellRing
          return <article className="communication-automation-console__record" key={item.id}>
            <div className="communication-automation-console__mark"><Icon size={16}/></div>
            <div className="communication-automation-console__body">
              <strong>{task.title}</strong>
              <small>{reminderChannelLabel[item.channel]} · {item.eventType === 'assigned' ? 'Atribuição' : 'Antes do prazo'}
                {' · '}{readableTime(item.scheduledAt)} · {reminderStatusLabel[item.status]}</small>
              {item.status === 'sent' ? <small>
                {item.channel === 'in_app' ? 'Aviso criado na Central de Notificações do responsável.'
                  : 'Aceito pelo provedor; entrega e leitura não verificadas.'}
              </small> : null}
              {item.lastError ? <small>{reminderErrorLabel(item.lastError)}</small> : null}
            </div>
            <Button variant="secondary" size="sm" onClick={() => onOpenTask(task)}>Abrir tarefa</Button>
          </article>
        })}
      </div>}
    <footer className="communication-automation-console__footer">
      <ShieldCheck size={15}/> O histórico é consultado com as permissões do usuário. Nenhum aviso é enviado ao abrir esta tela.
    </footer>
  </section>
}
