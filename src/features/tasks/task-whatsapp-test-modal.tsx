import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, RefreshCw, Send, ShieldCheck } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { loadCommunicationsGatewayHealth, loadGatewayWhatsAppQrStatus } from '../../services/local-communications-gateway'
import { Modal } from '../../components/ui/modal'
import type { WorkTask } from '../../domain/types'
import {
  checkTaskWhatsAppTestConnection,
  eligibleTaskForOwnTest,
  normalizeTaskTestPhone,
  sendOwnTaskWhatsAppTest,
  type TaskWhatsAppTestReadiness,
  type WhatsAppTaskTestResult,
} from '../../services/task-reminder-whatsapp-test'

interface Props {
  open: boolean
  workspaceId: string
  userId: string | null
  tasks: WorkTask[]
  onClose(): void
}

export function TaskWhatsAppTestModal({ open, workspaceId, userId, tasks, onClose }: Props) {
  const mine = useMemo(() => tasks.filter(task => eligibleTaskForOwnTest(task, userId)), [tasks, userId])
  const [taskId, setTaskId] = useState('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [readiness, setReadiness] = useState<TaskWhatsAppTestReadiness | null>(null)
  const [connectionError, setConnectionError] = useState('')
  const [checking, setChecking] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [result, setResult] = useState<WhatsAppTaskTestResult | null>(null)
  const sendLockRef = useRef(false)
  const task = mine.find(item => item.id === taskId) ?? null

  useEffect(() => {
    if (!open) return
    setTaskId('')
    setPhone('')
    setConsent(false)
    setResult(null)
    setSendError('')
    setReadiness(null)
    setConnectionError('')
  }, [open, workspaceId])

  useEffect(() => {
    if (!open || !workspaceId) return
    let active = true
    setChecking(true)
    void checkTaskWhatsAppTestConnection(workspaceId)
      .then(data => { if (active) { setReadiness(data); setConnectionError('') } })
      .catch(error => {
        if (active) {
          setReadiness(null)
          setConnectionError(error instanceof Error ? error.message : 'Não foi possível consultar a conexão do WhatsApp.')
        }
      })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [open, workspaceId])

  // If the user reconnects from Comunicações while this modal is open,
  // update its readiness automatically; no second QR pairing is needed.
  useEffect(() => {
    if (!open || !workspaceId || readiness?.available || sending) return
    let active = true
    const timer = window.setInterval(() => {
      void checkTaskWhatsAppTestConnection(workspaceId).then(next => {
        if (active) { setReadiness(next); setConnectionError('') }
      }).catch(error => {
        if (active) setConnectionError(error instanceof Error ? error.message : 'Não foi possível consultar o WhatsApp.')
      })
    }, 8000)
    return () => { active = false; window.clearInterval(timer) }
  }, [open, workspaceId, readiness?.available, sending])

  const recheck = async () => {
    setChecking(true)
    setConnectionError('')
    setSendError('')
    setResult(null)
    try {
      setReadiness(await checkTaskWhatsAppTestConnection(workspaceId))
    } catch (error) {
      setReadiness(null)
      setConnectionError(error instanceof Error ? error.message : 'Falha ao consultar o WhatsApp.')
    } finally { setChecking(false) }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!userId || !task || !readiness?.available || !normalizeTaskTestPhone(phone) || !consent || sendLockRef.current) return
    sendLockRef.current = true
    setSending(true)
    setSendError('')
    setResult(null)
    try {
      const response = await sendOwnTaskWhatsAppTest({ workspaceId, userId, task, phone, readiness, explicitConsent: consent })
      setResult(response)
    } catch (error) {
      const description = error instanceof Error ? error.message : 'Não foi possível confirmar o envio.'
      // Read-only diagnosis after an ambiguous failure. Never reissue POST
      // automatically; a message may have been sent before the connection failed.
      const [health, qr] = await Promise.allSettled([
        loadCommunicationsGatewayHealth(),
        loadGatewayWhatsAppQrStatus(workspaceId),
      ])
      const gatewayOnline = health.status === 'fulfilled' && health.value.ok
      const qrState = qr.status === 'fulfilled' ? qr.value.state : null
      const statusNote = gatewayOnline
        ? qrState === 'connected'
          ? 'O gateway continua online e a sessão QR permanece conectada.'
          : `O gateway está online, mas a sessão QR está em estado ${qrState || 'desconhecido'}.`
        : 'O gateway de Comunicações não respondeu à verificação após a falha.'
      setSendError(`${description} ${statusNote} Verifique a conversa antes de permitir outra tentativa.`)
    } finally {
      sendLockRef.current = false
      setSending(false)
    }
  }

  // Recheck is the explicit acknowledgement before attempting a second send.
  const valid = Boolean(task && normalizeTaskTestPhone(phone) && consent && readiness?.available && !checking && !sending && !sendError && !result)
  return <Modal
    open={open}
    size="lg"
    title="Testar lembrete pelo WhatsApp"
    subtitle="Envie uma única mensagem real pelo WhatsApp QR já conectado, apenas para o seu número."
    onClose={() => { if (!sending) onClose() }}
    footer={<>
      <span className="modal__footer-spacer" />
      <Button variant="secondary" disabled={sending} onClick={onClose}>Fechar</Button>
      <Button type="submit" form="task-whatsapp-one-time-test" loading={sending} disabled={!valid}>
        <Send size={16} /> Enviar teste para meu WhatsApp
      </Button>
    </>}
  >
    <div className="work-task-modal work-task-modal--collaborative">
      <section className="work-form-section">
        <header><ShieldCheck size={18}/><div>
          <strong>Conexão de envio</strong>
          <small>A conexão de Comunicações é compartilhada automaticamente. Não é necessário conectar o WhatsApp novamente.</small>
        </div></header>
        <div role="status" aria-live="polite">
          <strong>{checking ? 'Verificando conexão…' : readiness?.available ? 'WhatsApp conectado ao CRM' : 'WhatsApp aguardando conexão ativa'}</strong>
          <p>{connectionError || readiness?.message || 'Verifique o gateway de comunicação do RealTalent.'}</p>
          {readiness?.senderPhone ? <small>Número remetente conectado: +{readiness.senderPhone.replace(/\D/g, '')}</small> : null}
        </div>
        <div><Button type="button" variant="secondary" disabled={checking || sending} onClick={() => void recheck()}><RefreshCw size={15}/> Verificar novamente</Button></div>
      </section>

      <form id="task-whatsapp-one-time-test" onSubmit={(event) => void submit(event)}>
        <section className="work-form-section">
          <header><CheckCircle2 size={18}/><div><strong>Meu teste</strong><small>Crie primeiro uma tarefa atribuída a você e que ainda não esteja concluída.</small></div></header>
          <div className="form-grid">
            <label className="form-field form-field--full">
              <span>Tarefa que será enviada</span>
              <select value={taskId} onChange={event => { setTaskId(event.target.value); setResult(null); setSendError('') }} disabled={sending}>
                <option value="">Selecione uma das minhas tarefas abertas</option>
                {mine.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
              {!mine.length ? <small>Você ainda não tem uma tarefa aberta atribuída ao seu usuário neste workspace.</small> : null}
            </label>
            <label className="form-field form-field--full">
              <span>Meu número pessoal de WhatsApp</span>
              <input type="tel" inputMode="tel" autoComplete="tel" placeholder="+5551999999999" value={phone}
                disabled={sending}
                onChange={event => { setPhone(event.target.value); setResult(null); setSendError('') }}
                onBlur={() => { const normalized = normalizeTaskTestPhone(phone); if (normalized) setPhone(`+${normalized}`) }} />
              {phone.trim() && !normalizeTaskTestPhone(phone)
                ? <small role="alert">Confira o DDD e o número. Exemplo: (53) 99999-9999. O CRM adiciona +55 automaticamente.</small>
                : <small>Digite DDD + número, com ou sem +55. O teste não salva o telefone.</small>}
            </label>
          </div>
          <label className="settings-toggle">
            <input type="checkbox" checked={consent} disabled={sending}
              onChange={event => { setConsent(event.target.checked); setResult(null); setSendError('') }} />
            <span>Confirmo que este WhatsApp é meu e autorizo o envio de uma única mensagem real de teste.</span>
          </label>
          <p className="settings-copy">Envio único pela sessão de Comunicações. Isso não ativa lembretes automáticos nem envia mensagens para outros integrantes da equipe. A conexão QR é não oficial e pode ficar temporariamente indisponível.</p>
        </section>
        {sendError ? <p role="alert" className="settings-copy"><strong>Envio não confirmado:</strong> {sendError} O botão de envio ficará bloqueado até você verificar a conversa e clicar em “Verificar novamente”.</p> : null}
        {result ? <div role="status" aria-live="polite" className="work-assignment-summary">
          <div><strong>{result.status === 'queued' ? 'Mensagem colocada na fila' : 'Mensagem aceita pelo gateway'}</strong>
            <p>{result.status === 'queued'
              ? 'O WhatsApp não confirmou o envio imediato. Verifique o status no chat antes de reenviar.'
              : 'Confira seu celular para confirmar o recebimento. Aceita pelo gateway não significa entregue ou lida.'}</p>
            <small>Evento: {result.eventId}</small>
          </div>
        </div> : null}
      </form>
    </div>
  </Modal>
}
