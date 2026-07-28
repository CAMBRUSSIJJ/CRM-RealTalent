import { KeyRound, Save, Send, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { AutomationWebhook, WebhookInput, WebhookMethod } from '../../services/automation-webhooks'
import { maskSecret, validateWebhookInput } from '../../services/automation-webhooks'

interface WebhookModalProps {
  open: boolean
  webhook: AutomationWebhook | null
  loading?: boolean
  testing?: boolean
  onClose(): void
  onSave(input: WebhookInput): Promise<void>
  onTest(input: WebhookInput): Promise<void>
}

const EMPTY_HEADERS = [{ key: '', value: '' }]

export function WebhookModal({ open, webhook, loading = false, testing = false, onClose, onSave, onTest }: WebhookModalProps) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [method, setMethod] = useState<WebhookMethod>('POST')
  const [enabled, setEnabled] = useState(true)
  const [secretToken, setSecretToken] = useState('')
  const [timeoutSeconds, setTimeoutSeconds] = useState(10)
  const [maxAttempts, setMaxAttempts] = useState(3)
  const [headers, setHeaders] = useState(EMPTY_HEADERS)

  useEffect(() => {
    if (!open) return
    setName(webhook?.name ?? '')
    setUrl(webhook?.url ?? '')
    setMethod(webhook?.method ?? 'POST')
    setEnabled(webhook?.enabled ?? true)
    setSecretToken('')
    setTimeoutSeconds(webhook?.timeoutSeconds ?? 10)
    setMaxAttempts(webhook?.maxAttempts ?? 3)
    const entries = Object.entries(webhook?.headers ?? {}).map(([key, value]) => ({ key, value }))
    setHeaders(entries.length ? entries : EMPTY_HEADERS)
  }, [open, webhook])

  const input = useMemo<WebhookInput>(() => ({
    name, url, method, enabled, secretToken, timeoutSeconds, maxAttempts,
    headers: Object.fromEntries(headers.filter((item) => item.key.trim()).map((item) => [item.key.trim(), item.value.trim()])),
  }), [enabled, headers, maxAttempts, method, name, secretToken, timeoutSeconds, url])
  const errors = useMemo(() => validateWebhookInput(input), [input])

  return <Modal open={open} title={webhook ? 'Editar webhook' : 'Novo webhook'} subtitle="Cadastre o destino, assine a entrega e teste antes de utilizá-lo em uma automação." size="lg" onClose={onClose}
    footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="secondary" loading={testing} disabled={Boolean(errors.length)} onClick={() => void onTest(input)}><Send size={16} /> Testar entrega</Button><Button loading={loading} disabled={Boolean(errors.length)} onClick={() => void onSave(input)}><Save size={16} /> Salvar webhook</Button></>}>
    <div className="webhook-builder">
      <div className="form-grid">
        <label className="form-field"><span>Nome</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Make — novo lead" /></label>
        <label className="toggle-field"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span><strong>Webhook ativo</strong><small>Regras reais só enviam para destinos ativos.</small></span></label>
        <label className="form-field form-field--full"><span>URL segura</span><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://hooks.exemplo.com/realtalent" /></label>
        <label className="form-field"><span>Método</span><select value={method} onChange={(event) => setMethod(event.target.value as WebhookMethod)}><option>POST</option><option>PUT</option><option>PATCH</option></select></label>
        <label className="form-field"><span>Timeout</span><select value={timeoutSeconds} onChange={(event) => setTimeoutSeconds(Number(event.target.value))}><option value="5">5 segundos</option><option value="10">10 segundos</option><option value="15">15 segundos</option><option value="30">30 segundos</option></select></label>
        <label className="form-field"><span>Tentativas</span><select value={maxAttempts} onChange={(event) => setMaxAttempts(Number(event.target.value))}><option value="1">1 tentativa</option><option value="3">3 tentativas</option><option value="5">5 tentativas</option><option value="8">8 tentativas</option></select></label>
        <label className="form-field"><span>Segredo de assinatura</span><div className="webhook-secret-field"><KeyRound size={15} /><input value={secretToken} onChange={(event) => setSecretToken(event.target.value)} placeholder={webhook?.hasSecret ? 'Deixe vazio para manter o segredo atual' : 'token compartilhado'} /></div><small>{secretToken ? `Será exibido como ${maskSecret(secretToken)}` : webhook?.hasSecret ? 'Já existe uma assinatura configurada. Deixe vazio para mantê-la.' : 'O envio incluirá a assinatura HMAC no cabeçalho X-RealTalent-Signature.'}</small></label>
      </div>

      <section className="builder-section"><header><div><span className="eyebrow">Opcional</span><h3>Cabeçalhos personalizados</h3></div><Button size="sm" variant="secondary" onClick={() => setHeaders((current) => [...current, { key: '', value: '' }])}>Adicionar</Button></header>
        <div className="webhook-header-list">{headers.map((header, index) => <div key={`${index}-${header.key}`}><input aria-label="Nome do cabeçalho" value={header.key} onChange={(event) => setHeaders((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))} placeholder="X-Custom-Header" /><input aria-label="Valor do cabeçalho" value={header.value} onChange={(event) => setHeaders((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} placeholder="valor" /><button className="icon-button icon-button--danger" aria-label="Remover cabeçalho" onClick={() => setHeaders((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button></div>)}</div>
      </section>

      <section className="webhook-security-note"><ShieldCheck size={18} /><div><strong>Envio protegido pelo backend</strong><span>No Supabase, a Edge Function assina o corpo, aplica timeout e registra resposta. No HTML local, o teste é simulado e nenhum dado sai do navegador.</span></div></section>
      {errors.length ? <section className="automation-validation automation-validation--error"><div>{errors.map((error) => <strong key={error}>{error}</strong>)}</div></section> : null}
    </div>
  </Modal>
}
