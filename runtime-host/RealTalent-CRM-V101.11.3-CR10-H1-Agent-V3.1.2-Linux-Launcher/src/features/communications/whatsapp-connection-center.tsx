import { CheckCircle2, Cloud, LoaderCircle, QrCode, RefreshCw, ShieldCheck, Unplug, Wifi } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { StatusPill } from '../../components/ui/status-pill'
import { effectiveDataMode } from '../../lib/env'
import { disconnectGatewayWhatsAppQr, loadGatewayWhatsAppQrStatus, startGatewayWhatsAppQr, type WhatsAppQrStatus } from '../../services/local-communications-gateway'
import { loadCommunicationChannelState } from '../../services/communication-workspace'
import type { ConnectedAccount } from '../../services/integration-framework'

export function WhatsAppConnectionCenter({ open, workspaceId, onClose, onChanged, onError }: {
  open: boolean
  workspaceId: string
  onClose(): void
  onChanged(): void
  onError(message: string): void
}) {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [qrStatus, setQrStatus] = useState<WhatsAppQrStatus | null>(null)
  const [busy, setBusy] = useState('')
  const localGateway = effectiveDataMode === 'local'
  const connected = useMemo(() => accounts.filter((item) => item.status === 'connected'), [accounts])
  const qrAccount = useMemo(() => accounts.find((item) => String(item.metadata?.transport || '').toLowerCase() === 'qr'), [accounts])
  const cloudAccount = useMemo(() => accounts.find((item) => String(item.metadata?.transport || '').toLowerCase() !== 'qr'), [accounts])

  const refresh = async () => {
    try {
      const state = await loadCommunicationChannelState(workspaceId)
      setAccounts(state.whatsappAccounts)
      if (localGateway) setQrStatus(await loadGatewayWhatsAppQrStatus(workspaceId))
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Não foi possível consultar o WhatsApp.')
    }
  }

  useEffect(() => { if (open) void refresh() }, [open, workspaceId])
  useEffect(() => {
    if (!open || !localGateway || !qrStatus || !['starting', 'qr'].includes(qrStatus.state)) return
    let active = true
    const id = window.setInterval(async () => {
      try {
        const next = await loadGatewayWhatsAppQrStatus(workspaceId)
        if (!active) return
        setQrStatus(next)
        if (next.state === 'connected') { await refresh(); onChanged() }
      } catch { /* status polling is best effort */ }
    }, 1500)
    return () => { active = false; window.clearInterval(id) }
  }, [open, localGateway, qrStatus?.state, workspaceId])

  const startQr = async () => {
    setBusy('qr')
    try {
      const next = await startGatewayWhatsAppQr(workspaceId, 'RealTalent WhatsApp')
      setQrStatus(next)
      await refresh()
    } catch (error) { onError(error instanceof Error ? error.message : 'Não foi possível gerar o QR Code.') }
    finally { setBusy('') }
  }

  const disconnectQr = async () => {
    setBusy('disconnect')
    try {
      await disconnectGatewayWhatsAppQr(workspaceId)
      await refresh(); onChanged()
    } catch (error) { onError(error instanceof Error ? error.message : 'Não foi possível remover a sessão do WhatsApp.') }
    finally { setBusy('') }
  }

  return <Modal open={open} title="Conectar WhatsApp" subtitle="Gerencie a conexão sem sair da Central de Comunicação." size="lg" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Fechar</Button><span className="modal__footer-spacer"/><Button variant="ghost" onClick={() => void refresh()}><RefreshCw size={15}/> Atualizar status</Button></>}>
    <div className="wa-connection-center">
      <section className="wa-connection-center__summary">
        <div className="wa-connection-center__icon"><Wifi size={22}/></div>
        <div><span className="eyebrow">Connection Center</span><h3>{connected.length ? 'WhatsApp conectado ao RealTalent' : 'Conecte seu WhatsApp ao workspace'}</h3><p>O canal fica disponível no chat, histórico e sincronização em tempo real sem transformar a tela em um painel técnico.</p></div>
        <StatusPill tone={connected.length ? 'success' : 'warning'}>{connected.length ? `${connected.length} conexão(ões)` : 'Desconectado'}</StatusPill>
      </section>

      <div className="wa-connection-center__grid">
        <section className={`wa-connection-card ${qrAccount?.status === 'connected' || qrStatus?.state === 'connected' ? 'is-connected' : ''}`}>
          <header><div className="wa-connection-card__icon"><QrCode size={20}/></div><div><strong>WhatsApp por QR Code</strong><span>Conexão rápida neste computador</span></div>{qrAccount?.status === 'connected' || qrStatus?.state === 'connected' ? <CheckCircle2 size={18}/> : null}</header>
          {localGateway ? <>
            {qrStatus?.state === 'connected' ? <div className="wa-connection-card__health"><span>Status</span><strong>Conectado</strong><small>{qrStatus.phone ? `+${qrStatus.phone}` : qrStatus.displayName || 'Sessão local'} · {qrStatus.engine || 'WhatsApp Web'}</small></div> : null}
            {qrStatus?.qrDataUrl && qrStatus.state === 'qr' ? <div className="wa-connection-center__qr"><img src={qrStatus.qrDataUrl} alt="QR Code para conectar o WhatsApp"/><div><strong>Escaneie pelo celular</strong><span>WhatsApp → Dispositivos conectados → Conectar dispositivo</span></div></div> : null}
            {qrStatus?.state === 'starting' ? <div className="wa-connection-card__waiting"><LoaderCircle size={18}/><span>Preparando uma sessão segura neste computador…</span></div> : null}
            {qrStatus?.lastError ? <p className="wa-connection-card__error">{qrStatus.lastError}</p> : null}
            <div className="wa-connection-card__actions">
              {qrStatus?.state === 'connected' || qrAccount?.status === 'connected' ? <Button variant="secondary" loading={busy === 'disconnect'} onClick={() => void disconnectQr()}><Unplug size={15}/> Desconectar</Button> : <Button loading={busy === 'qr'} onClick={() => void startQr()}><QrCode size={15}/> {qrStatus?.state === 'qr' ? 'Gerar novo QR' : 'Conectar por QR'}</Button>}
            </div>
          </> : <div className="wa-connection-card__note"><ShieldCheck size={16}/><span>O QR local está disponível no launcher Linux. Neste ambiente, use a conexão oficial.</span></div>}
        </section>

        <section className={`wa-connection-card ${cloudAccount?.status === 'connected' ? 'is-connected' : ''}`}>
          <header><div className="wa-connection-card__icon"><Cloud size={20}/></div><div><strong>WhatsApp Business</strong><span>Cloud API oficial da Meta</span></div>{cloudAccount?.status === 'connected' ? <CheckCircle2 size={18}/> : null}</header>
          {cloudAccount ? <div className="wa-connection-card__health"><span>Conta</span><strong>{cloudAccount.displayName}</strong><small>{cloudAccount.status === 'connected' ? 'Conectada e disponível para envio oficial' : 'Conta cadastrada, requer atenção'}</small></div> : <div className="wa-connection-card__note"><ShieldCheck size={16}/><span>Para operação multiusuário e produção, conecte a Cloud API em Configurações → WhatsApp.</span></div>}
          <div className="wa-connection-card__actions"><Button variant="secondary" onClick={() => { onClose(); window.location.hash = '#/settings' }}><Cloud size={15}/> Configuração avançada</Button></div>
        </section>
      </div>

      <section className="wa-connection-center__footer"><ShieldCheck size={17}/><div><strong>Identidade RealTalent</strong><span>Azul representa ação e navegação. Verde aparece somente para indicar canal conectado, entrega ou sucesso.</span></div></section>
    </div>
  </Modal>
}
