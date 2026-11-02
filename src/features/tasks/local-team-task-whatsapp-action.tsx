import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, RefreshCw, Send } from 'lucide-react'
import type { WorkTask, WorkspaceMember } from '../../domain/types'
import { Button } from '../../components/ui/button'
import { safeStorage } from '../../lib/storage'
import { sendGatewayCommunication } from '../../services/local-communications-gateway'
import { checkTaskWhatsAppTestConnection, normalizeTaskTestPhone, type TaskWhatsAppTestReadiness } from '../../services/task-reminder-whatsapp-test'

type Props = { workspaceId: string; task: WorkTask; member: WorkspaceMember | null }
const validState = (task: WorkTask) => ['todo','in_progress','blocked'].includes(task.status)
const attemptKey = (task: WorkTask, member: WorkspaceMember) =>
  `realtalent:task-team-whatsapp:v1:${task.workspaceId}:${task.id}:${member.userId}:${task.updatedAt}`

/** Manual single-send for a non-login teammate.
 * Automatic QR dispatch is deliberately not enabled: a browser cannot
 * reliably schedule outbound messages when closed and QR is not an official API.
 */
export function LocalTeamTaskWhatsAppAction({ workspaceId, task, member }: Props) {
  const [readiness, setReadiness] = useState<TaskWhatsAppTestReadiness | null>(null)
  const [checking, setChecking] = useState(false)
  const [sending, setSending] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState('')
  const [attempted, setAttempted] = useState(false)
  const key = useMemo(() => member ? attemptKey(task, member) : '', [member, task])

  useEffect(() => { setAttempted(Boolean(key && safeStorage.getItem(key))); setConfirmed(false); setMessage(''); setReadiness(null) }, [key])

  const recipient = member?.whatsappPhone || ''
  const consent = Boolean(member?.whatsappConsentRecordedAt)
  const eligible = Boolean(member && member.userId === task.assigneeId && task.workspaceId === workspaceId && validState(task) &&
    normalizeTaskTestPhone(recipient) && consent)

  const checkConnection = async () => {
    setChecking(true)
    try {
      const next = await checkTaskWhatsAppTestConnection(workspaceId)
      setReadiness(next)
      setMessage(next.available ? 'WhatsApp conectado. Confira o número e confirme o envio manual.' : next.message)
    } catch { setReadiness(null); setMessage('Não foi possível consultar o WhatsApp conectado em Comunicações.') }
    finally { setChecking(false) }
  }

  const send = async () => {
    if (!member || !eligible || !confirmed || attempted || !readiness?.available || !readiness.accountId || sending) return
    setSending(true)
    try {
      const current = await checkTaskWhatsAppTestConnection(workspaceId)
      if (!current.available || current.accountId !== readiness.accountId)
        throw new Error('A sessão do WhatsApp mudou. Verifique a conexão novamente.')
      const to = normalizeTaskTestPhone(recipient)
      if (!to) throw new Error('Número inválido. Corrija em Configurações → Equipe e permissões.')
      if (normalizeTaskTestPhone(current.senderPhone) === to)
        throw new Error('O WhatsApp do colaborador não pode ser igual ao número que envia. Use um destinatário distinto.')
      // Block a second click before hitting the gateway: a timeout may mean
      // that the first request was accepted despite the missing response.
      safeStorage.setItem(key, new Date().toISOString())
      setAttempted(true)
      const due = task.dueAt ? new Date(task.dueAt).toLocaleString('pt-BR') : 'Sem prazo'
      const body = [
        'RealTalent — aviso de tarefa (envio manual)',
        '',
        `Olá, ${member.displayName}!`,
        `Tarefa: ${task.title.slice(0,140)}`,
        `Prazo: ${due}`,
        '',
        'Consulte o responsável pelo CRM para mais informações.',
      ].join('\n')
      const event = await sendGatewayCommunication({
        workspaceId,
        accountId: current.accountId!,
        channel: 'whatsapp',
        recipient: to,
        body,
        idempotencyKey: `manual-local-task:${task.id}:${member.userId}:${task.updatedAt}`,
      })
      if (event.status === 'failed') setMessage('O gateway retornou falha. Confira a conversa antes de tentar qualquer novo envio; este teste não será repetido automaticamente.')
      else setMessage(event.status === 'queued'
        ? 'Mensagem colocada na fila. Confira a conversa antes de considerar a notificação enviada.'
        : 'Solicitação aceita pelo gateway. Confira o recebimento no WhatsApp; isso ainda não comprova entrega.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Resultado do envio desconhecido. Confira a conversa antes de tentar novamente.')
    } finally { setSending(false); setConfirmed(false) }
  }

  return <section className="work-form-section local-team-wa-action">
    <header><MessageCircle size={18}/><div><strong>WhatsApp do responsável</strong>
      <small>Utiliza o contato cadastrado em Configurações → Equipe e permissões, sem pedir o número novamente.</small>
    </div></header>
    <p className="local-team-wa-action__recipient">Destinatário: <strong>{member?.displayName || 'Não encontrado'}</strong>
      {' · '}{recipient || 'Sem WhatsApp cadastrado'}
      {' · '}{consent ? 'Autorização registrada' : 'Autorização pendente'}</p>
    {!eligible ? <p className="local-team-wa-action__hint">
      {member && task.assigneeId === member.userId
        ? 'Para avisar este colaborador, cadastre um número válido e registre a autorização recebida em Configurações → Equipe e permissões.'
        : 'Atribua a tarefa a um integrante existente da equipe local para identificar seu WhatsApp.'}
    </p> : <>
      <p className="local-team-wa-action__hint">O teste envia uma mensagem real pela sessão QR conectada, apenas após confirmação manual. Não ativa lembretes automáticos.</p>
      {attempted ? <p role="status" className="local-team-wa-action__hint">Já houve uma tentativa para esta versão da tarefa. Confira a conversa antes de criar outro aviso para evitar duplicidade.</p> : <>
        <Button type="button" variant="secondary" size="sm" disabled={checking || sending} onClick={() => void checkConnection()}>
          <RefreshCw size={14}/>{checking ? 'Verificando…' : 'Verificar WhatsApp conectado'}
        </Button>
        {readiness?.available ? <label className="local-team-wa-action__confirm">
          <input type="checkbox" checked={confirmed} disabled={sending} onChange={event => setConfirmed(event.target.checked)}/>
          <span>Confirmo que este colaborador autorizou o aviso e quero enviar uma única mensagem real para {recipient}.</span>
        </label> : null}
        {readiness?.available ? <Button type="button" size="sm" onClick={() => void send()} loading={sending} disabled={!confirmed || sending}>
          <Send size={14}/> Enviar aviso agora
        </Button> : null}
      </>}
    </>}
    {message ? <p role="status" className="local-team-wa-action__hint">{message}</p> : null}
  </section>
}
