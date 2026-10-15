import { AlertTriangle, CheckCircle2, ChevronDown, Copy, Headphones, Link2, PhoneCall, Plus, Radio, RefreshCw, ShieldCheck, Smartphone, Trash2, Wifi, XCircle, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/button'
import { copyTextToClipboard } from '../../lib/browser-actions'
import { Modal } from '../../components/ui/modal'
import { StatusPill } from '../../components/ui/status-pill'
import {
  discoverVoiceDevices,
  fetchRealTalentConnectDiagnostics,
  fetchRealTalentConnectHealth,
  fetchRealTalentPhoneDevices,
  fetchRealTalentPhonePairing,
  probeVoiceProviders,
  providerLabel,
  regenerateRealTalentPhonePairing,
  revokeRealTalentPhoneDevice,
  saveVoiceSettings,
  setRealTalentPhoneNetworkAccess,
  startOutboundVoiceCall,
  voiceProviderStateLabel,
  type RealTalentConnectDiagnostics,
  type RealTalentConnectHealth,
  type RealTalentPhoneDevice,
  type RealTalentPhonePairingInfo,
  type VoiceDevice,
  type VoiceOutboundIdentity,
  type VoiceProviderId,
  type VoiceProviderStatus,
  type VoiceSettings,
} from '../../services/voice-dialer'

// Compatibility markers for historical QA: Device Manager · Celular pareado ao Connect · Código de pareamento · selectedDeviceId: device.id
const toneForState = (state: VoiceProviderStatus['state']) => state === 'available' ? 'success' : state === 'reachable_incompatible' ? 'warning' : state === 'unavailable' ? 'danger' : 'neutral'
const relativeSeen = (value?: string) => {
  if (!value) return 'Nunca'
  const delta = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(delta)) return '—'
  if (delta < 20_000) return 'Agora'
  if (delta < 60_000) return `${Math.max(1, Math.round(delta / 1000))}s atrás`
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}min atrás`
  return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
const phoneUrlForHost = (pairing: RealTalentPhonePairingInfo, host: string) => {
  try { const url = new URL(pairing.phoneUrl); url.hostname = host; return url.toString() } catch { return pairing.phoneUrl }
}
const qrUrlForHost = (pairing: RealTalentPhonePairingInfo, host: string) => {
  try {
    const relative = pairing.qrUrl.startsWith('/')
    const url = new URL(pairing.qrUrl, window.location.origin)
    url.searchParams.set('host', host)
    return relative ? `${url.pathname}${url.search}` : url.toString()
  } catch { return pairing.qrUrl }
}

export function VoiceDialerSettingsModal({ open, workspaceId, value, onClose, onSave }: { open: boolean; workspaceId: string; value: VoiceSettings; onClose(): void; onSave(value: VoiceSettings): void }) {
  const [draft, setDraft] = useState(value)
  const [statuses, setStatuses] = useState<VoiceProviderStatus[]>([])
  const [devices, setDevices] = useState<VoiceDevice[]>([])
  const [phones, setPhones] = useState<RealTalentPhoneDevice[]>([])
  const [health, setHealth] = useState<RealTalentConnectHealth | null>(null)
  const [diagnostics, setDiagnostics] = useState<RealTalentConnectDiagnostics | null>(null)
  const [checking, setChecking] = useState(false)
  const [networkBusy, setNetworkBusy] = useState(false)
  const [pairing, setPairing] = useState<RealTalentPhonePairingInfo | null>(null)
  const [selectedLanHost, setSelectedLanHost] = useState('')
  const [label, setLabel] = useState('Comercial')
  const [number, setNumber] = useState('')
  const [copied, setCopied] = useState<'code' | 'url' | null>(null)
  const [testNumber, setTestNumber] = useState('')
  const [testMessage, setTestMessage] = useState('')
  const [testBusy, setTestBusy] = useState(false)

  useEffect(() => { if (open) setDraft(value) }, [open, value])

  const refresh = async (settings = draft, host = selectedLanHost) => {
    setChecking(true)
    try {
      const [nextStatuses, nextHealth, nextPairing, nextPhones, nextDiagnostics] = await Promise.all([
        probeVoiceProviders(settings),
        fetchRealTalentConnectHealth(settings),
        fetchRealTalentPhonePairing(settings, workspaceId, host),
        fetchRealTalentPhoneDevices(settings, workspaceId),
        fetchRealTalentConnectDiagnostics(settings, workspaceId),
      ])
      setStatuses(nextStatuses)
      setHealth(nextHealth)
      setPairing(nextPairing)
      setPhones(nextPhones)
      setDiagnostics(nextDiagnostics)
      if (!selectedLanHost && nextPairing?.selectedLanHost) setSelectedLanHost(nextPairing.selectedLanHost)
      const nextDevices = await discoverVoiceDevices(nextStatuses, settings, workspaceId)
      setDevices(nextDevices)
      const online = nextPhones.filter((item) => item.available)
      if (online.length === 1) {
        const only = online[0]
        setDraft((current) => ({ ...current, defaultProviderId: 'realtalent_connect', selectedDeviceId: `connect:phone:${only.id}` }))
      }
    } finally { setChecking(false) }
  }

  useEffect(() => { if (open) void refresh(value, '') /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const syncPhonePresence = async () => {
      const [nextHealth, nextPhones, nextDiagnostics] = await Promise.all([
        fetchRealTalentConnectHealth(draft),
        fetchRealTalentPhoneDevices(draft, workspaceId),
        fetchRealTalentConnectDiagnostics(draft, workspaceId),
      ])
      if (cancelled) return
      setHealth(nextHealth)
      setPhones(nextPhones)
      setDiagnostics(nextDiagnostics)
      const nextDevices = await discoverVoiceDevices(statuses, draft, workspaceId)
      if (!cancelled) setDevices(nextDevices)
    }
    const timer = window.setInterval(() => { void syncPhonePresence() }, 3000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [open, workspaceId, draft.connectBaseUrl, statuses])

  const providerOptions = useMemo(() => ['external_tel', 'realtalent_connect', 'browser_webrtc', 'sip'] as VoiceProviderId[], [])
  const onlinePhones = phones.filter((item) => item.available)
  const selectedDevice = devices.find((item) => item.id === draft.selectedDeviceId)
  const bridgeReady = Boolean(health?.ok)
  const pairingReady = Boolean(pairing?.code && pairing.phoneUrl)
  const lanEnabled = Boolean(diagnostics?.networkAccess?.enabled || pairing?.networkAccess?.enabled || health?.networkAccess?.enabled)
  const phoneReady = onlinePhones.length > 0
  const dialerReady = draft.defaultProviderId === 'realtalent_connect' && Boolean(selectedDevice?.available)
  const ready = bridgeReady && phoneReady && dialerReady
  const activePhoneUrl = lanEnabled && pairing && selectedLanHost ? phoneUrlForHost(pairing, selectedLanHost) : lanEnabled ? pairing?.phoneUrl ?? '' : ''
  const activeQrUrl = pairing && selectedLanHost ? qrUrlForHost(pairing, selectedLanHost) : pairing?.qrUrl ?? ''

  const addIdentity = () => {
    const cleaned = number.trim()
    if (!cleaned) return
    const identity: VoiceOutboundIdentity = { id: `caller-${Date.now()}`, providerId: draft.defaultProviderId, label: label.trim() || 'Número comercial', number: cleaned, active: true }
    setDraft((current) => ({ ...current, outboundIdentities: [...current.outboundIdentities, identity], selectedCallerId: current.selectedCallerId || identity.id }))
    setNumber('')
  }
  const usePhone = (phone: RealTalentPhoneDevice) => setDraft((current) => ({ ...current, defaultProviderId: 'realtalent_connect', selectedDeviceId: `connect:phone:${phone.id}` }))
  const chooseLanHost = async (host: string) => {
    setSelectedLanHost(host)
    const next = await fetchRealTalentPhonePairing(draft, workspaceId, host)
    if (next) setPairing(next)
  }
  const regeneratePairing = async () => {
    setChecking(true)
    try { setPairing(await regenerateRealTalentPhonePairing(draft, workspaceId, selectedLanHost)) }
    finally { setChecking(false) }
  }
  const toggleLanAccess = async () => {
    const nextEnabled = !lanEnabled
    const preferredHost = selectedLanHost || pairing?.selectedLanHost || pairing?.lanInterfaces?.find((item) => item.preferred)?.address || pairing?.lanInterfaces?.[0]?.address || ''
    if (nextEnabled && !preferredHost) return
    setNetworkBusy(true)
    try {
      const result = await setRealTalentPhoneNetworkAccess(draft, workspaceId, nextEnabled, preferredHost)
      if (result) await refresh(draft, preferredHost)
    } finally { setNetworkBusy(false) }
  }
  const revokePhone = async (phone: RealTalentPhoneDevice) => {
    if (!window.confirm(`Desconectar “${phone.label}” do RealTalent CRM?`)) return
    if (await revokeRealTalentPhoneDevice(draft, phone.id)) {
      if (draft.selectedDeviceId === `connect:phone:${phone.id}`) setDraft((current) => ({ ...current, selectedDeviceId: 'connect:default' }))
      await refresh()
    }
  }
  const copy = async (kind: 'code' | 'url', text: string) => {
    const result = await copyTextToClipboard(text)
    if (result.ok) { setCopied(kind); window.setTimeout(() => setCopied((value) => value === kind ? null : value), 1800) }
  }
  const runTestCall = async () => {
    if (!ready || !testNumber.trim()) return
    setTestBusy(true); setTestMessage('')
    try {
      await startOutboundVoiceCall({ settings: draft, providerId: 'realtalent_connect', deviceId: draft.selectedDeviceId, phone: testNumber, workspaceId, leadId: 'realtalent-connect-test', contactId: null, displayName: 'Chamada de teste', companyName: 'RealTalent Connect', playbookName: 'Teste de conexão', objective: 'Validar envio CRM → celular', sessionId: `setup-${Date.now()}`, fastDial: true })
      setTestMessage('Solicitação enviada em Fast Dial. Se o One-Tap estiver pronto, o iPhone deve abrir a confirmação da chamada; se o navegador bloquear, o botão “Ligar agora” aparece como fallback.')
    } catch (error) { setTestMessage(error instanceof Error ? error.message : 'Não foi possível enviar a chamada de teste.') }
    finally { setTestBusy(false) }
  }
  const save = () => { const normalized = saveVoiceSettings(workspaceId, draft); onSave(normalized) }

  return <Modal open={open} title="RealTalent Connect One-Tap" subtitle="Pareie o iPhone uma vez, deixe o RealTalent Phone pronto e reduza cada chamada a CRM → confirmação final do iOS." size="lg" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><span className="modal__footer-spacer"/><Button onClick={save} disabled={!ready}>Salvar configuração</Button></>}>
    <div className="connect-v1018 connect-v10181">
      <section className={`connect-v1018__summary ${ready ? 'is-ready' : bridgeReady ? 'is-bridge-ready' : ''}`}>
        <div className="connect-v1018__summary-icon">{ready ? <CheckCircle2 size={22}/> : bridgeReady ? <Wifi size={22}/> : <XCircle size={22}/>}</div>
        <div><span className="eyebrow">RealTalent Connect · V101.10.7</span><h3>{ready ? 'Pronto para One-Tap' : bridgeReady ? 'Bridge ativo · falta concluir o celular' : 'Bridge offline'}</h3><p>{ready ? `${selectedDevice?.label || 'RealTalent Phone'} está conectado e selecionado. Fast Dial pode enviar a chamada diretamente para o iPhone.` : bridgeReady ? (pairingReady ? (lanEnabled ? 'A rede local foi liberada explicitamente. Escaneie o QR no celular para concluir.' : 'O bridge está protegido e acessível apenas neste computador. Libere a rede local somente quando quiser conectar o celular.') : 'O bridge respondeu, mas a API de pareamento não respondeu. Use o diagnóstico abaixo.') : `Nenhuma resposta em ${draft.connectBaseUrl}. Inicie pelo start-linux.sh.`}</p></div>
        <Button size="sm" variant="secondary" loading={checking} onClick={() => void refresh()}><RefreshCw size={15}/> Verificar agora</Button>
      </section>

      {bridgeReady ? <section className={`connect-v101107__network-access ${lanEnabled ? 'is-enabled' : ''}`}>
        <div className="connect-v101107__network-copy">
          <span className="connect-v101107__network-status"><ShieldCheck size={17}/>{lanEnabled ? 'Celular liberado na rede local' : 'Apenas este computador'}</span>
          <div><strong>{lanEnabled ? 'Acesso LAN temporariamente habilitado' : 'Connect protegido por padrão'}</strong><p>{lanEnabled ? `Somente a interface ${diagnostics?.networkAccess?.host || selectedLanHost || 'selecionada'} aceita o RealTalent Phone. Você pode bloquear novamente após o uso.` : 'A porta de controle permanece em 127.0.0.1. Nenhum outro dispositivo da rede consegue acessar o Connect até você liberar explicitamente.'}</p></div>
        </div>
        <Button type="button" variant={lanEnabled ? 'ghost' : 'secondary'} loading={networkBusy} disabled={!lanEnabled && !(selectedLanHost || pairing?.selectedLanHost || pairing?.lanInterfaces?.length)} onClick={() => void toggleLanAccess()}>
          {lanEnabled ? <><ShieldCheck size={15}/> Bloquear rede local</> : <><Wifi size={15}/> Permitir celular na rede local</>}
        </Button>
      </section> : null}

      <section className="connect-v1018__steps">
        <article className={bridgeReady ? 'is-done' : 'is-pending'}><span>1</span><div><small>Connect</small><strong>{bridgeReady ? 'Executando neste computador' : 'Não encontrado'}</strong><p>{health ? `Porta 3001 · tempo real ${health.realtime ? 'ativo' : 'indisponível'}` : 'O launcher inicia o bridge automaticamente.'}</p></div>{bridgeReady ? <CheckCircle2/> : <XCircle/>}</article>
        <article className={phoneReady ? 'is-done' : 'is-pending'}><span>2</span><div><small>Celular</small><strong>{phoneReady ? `${onlinePhones.length} conectado(s)` : pairingReady ? 'Aguardando pareamento' : 'Pareamento indisponível'}</strong><p>{phoneReady ? `${onlinePhones[0].label} · visto ${relativeSeen(onlinePhones[0].lastSeenAt)}` : 'Use o QR ou o endereço LAN abaixo.'}</p></div>{phoneReady ? <CheckCircle2/> : <Smartphone/>}</article>
        <article className={dialerReady ? 'is-done' : 'is-pending'}><span>3</span><div><small>Discador</small><strong>{dialerReady ? selectedDevice?.label : phoneReady ? 'Selecionando automaticamente' : 'Aguardando celular'}</strong><p>{dialerReady ? 'As chamadas serão enviadas para este aparelho; com One-Tap pronto, o companion tenta abrir o discador imediatamente.' : 'Com um único celular online, ele vira padrão automaticamente.'}</p></div>{dialerReady ? <CheckCircle2/> : <PhoneCall/>}</article>
        <article className={ready ? 'is-done' : 'is-pending'}><span>4</span><div><small>One-Tap</small><strong>{phones.some((item) => item.oneTapReady) ? 'Pronto no iPhone' : ready ? 'Conectado · mantenha a tela visível' : 'Aguardando configuração'}</strong><p>{ready ? 'Fast Dial tenta abrir o discador sem botão intermediário; o iOS mantém a confirmação final.' : 'Conclua as etapas anteriores.'}</p></div>{phones.some((item) => item.oneTapReady) ? <Zap/> : ready ? <ShieldCheck/> : <Radio/>}</article>
      </section>

      {!phoneReady ? <section className="connect-v1018__pairing">
        <header><div><span className="eyebrow">Parear celular</span><h3>Conecte o RealTalent Phone</h3><p>Para parear, escolha a rede e clique em “Permitir celular na rede local”. Computador e iPhone precisam estar na mesma rede. Depois do pareamento, você pode adicionar o RealTalent Phone à Tela de Início e não precisa ler o QR novamente a cada sessão.</p></div><Smartphone size={20}/></header>
        {pairing ? <>
          {pairing.lanInterfaces?.length ? <div className="connect-v10181__network-picker"><strong>Rede detectada</strong><div>{pairing.lanInterfaces.map((item) => <button type="button" key={`${item.name}-${item.address}`} className={selectedLanHost === item.address ? 'is-selected' : ''} onClick={() => void chooseLanHost(item.address)}><Wifi size={15}/><span><b>{item.label}</b><small>{item.name} · {item.address}</small></span>{selectedLanHost === item.address ? <CheckCircle2 size={16}/> : null}</button>)}</div></div> : <div className="connect-v1018__empty"><AlertTriangle size={20}/><div><strong>Nenhuma rede LAN utilizável detectada</strong><span>Conecte o computador ao Wi‑Fi/Ethernet e teste novamente. Interfaces Docker, VPN e virtuais são ignoradas automaticamente.</span></div></div>}
          <div className="connect-v1018__pairing-grid">
            <div className="connect-v1018__qr">{lanEnabled && pairing.lanReady ? <img src={activeQrUrl} alt="QR Code para parear o RealTalent Phone"/> : <div className="connect-v1018__qr-empty"><ShieldCheck size={26}/><span>{pairing.lanInterfaces?.length ? 'Rede local bloqueada por segurança.' : 'Nenhum endereço LAN detectado.'}</span></div>}</div>
            <div className="connect-v1018__pairing-copy">
              <div className="connect-v1018__code"><small>Código</small><strong>{pairing.code}</strong><button type="button" aria-label="Copiar código" onClick={() => void copy('code', pairing.code)}><Copy size={15}/>{copied === 'code' ? 'Copiado' : 'Copiar'}</button></div>
              <label><span>Endereço para abrir no celular</span><div><input readOnly value={activePhoneUrl} placeholder={lanEnabled ? '' : 'Ative “Permitir celular na rede local”'}/><button type="button" aria-label="Copiar endereço" onClick={() => void copy('url', activePhoneUrl)}><Copy size={15}/></button></div></label>
              <p>{lanEnabled ? 'Acesso LAN ativo. ' : 'O código só poderá ser usado depois que a rede local for liberada. '}Válido até {new Date(pairing.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Abra este endereço ou leia o QR no celular e confirme o código.</p>
              <div className="connect-v1018__pairing-actions"><Button type="button" variant="ghost" loading={checking} onClick={() => void regeneratePairing()}><RefreshCw size={15}/> Gerar novo código</Button></div>
            </div>
          </div>
        </> : <div className="connect-v1018__empty"><XCircle size={20}/><div><strong>API de pareamento indisponível</strong><span>O bridge pode estar ativo, mas o navegador não conseguiu acessar /api/phone/v1/pairing. Use “Verificar agora” e o diagnóstico.</span></div></div>}
      </section> : null}

      {phones.length ? <section className="connect-v1018__phones">
        <header><div><span className="eyebrow">RealTalent Phone</span><h3>Celulares pareados</h3><p>Com apenas um aparelho online, ele é selecionado automaticamente.</p></div><Headphones size={20}/></header>
        <div>{phones.map((phone) => { const deviceId = `connect:phone:${phone.id}`; const selected = draft.selectedDeviceId === deviceId; const phoneKind = phone.platformKind === 'ios' ? 'iPhone' : phone.platformKind === 'android' ? 'Android' : 'Celular'; return <article key={phone.id} className={`${selected ? 'is-selected' : ''} ${phone.oneTapReady ? 'is-one-tap-ready' : ''}`}><span className={`connect-v1018__device-dot ${phone.available ? 'is-online' : ''}`}/><div><strong>{phone.label}</strong><small>{phone.available ? (phone.oneTapReady ? 'One-Tap pronto agora' : phone.visibility === 'hidden' ? 'Conectado · abra o RealTalent Phone' : 'Conectado agora') : `Offline · último contato ${relativeSeen(phone.lastSeenAt)}`}</small><span>{phoneKind}{phone.standalone ? ' · Tela de Início' : ''}{phone.realtime ? ' · tempo real' : ''}</span>{phone.oneTapEnabled ? <em className={`connect-v10183__one-tap-badge ${phone.oneTapReady ? 'is-ready' : ''}`}><Zap size={12}/>{phone.oneTapReady ? 'One-Tap pronto' : 'One-Tap ativo'}</em> : null}</div><div className="connect-v1018__device-actions">{phone.available ? <Button size="sm" variant={selected ? 'secondary' : 'ghost'} onClick={() => usePhone(phone)}>{selected ? 'Selecionado' : 'Usar como padrão'}</Button> : <StatusPill tone="neutral">Offline</StatusPill>}<button type="button" className="icon-button call-icon-button call-icon-button--danger" aria-label={`Desconectar ${phone.label}`} onClick={() => void revokePhone(phone)}><Trash2 size={15}/></button></div></article> })}</div>
      </section> : null}

      <section className="connect-v10181__diagnostics">
        <header><div><span className="eyebrow">Diagnóstico</span><h3>O que está funcionando</h3></div></header>
        <div className="connect-v10181__diagnostic-grid">
          <div className={bridgeReady ? 'is-ok' : 'is-bad'}><span>{bridgeReady ? '✓' : '×'}</span><b>Bridge local</b><small>{bridgeReady ? 'Porta 3001 respondendo' : 'Sem resposta'}</small></div>
          <div className={pairingReady ? 'is-ok' : 'is-bad'}><span>{pairingReady ? '✓' : '×'}</span><b>API de pareamento</b><small>{pairingReady ? 'CORS e endpoint OK' : 'Indisponível'}</small></div>
          <div className={diagnostics?.realtime ? 'is-ok' : 'is-bad'}><span>{diagnostics?.realtime ? '✓' : '×'}</span><b>Tempo real</b><small>{diagnostics?.realtime ? 'WebSocket pronto' : 'Indisponível'}</small></div>
          <div className={lanEnabled ? 'is-ok' : 'is-warn'}><span>{lanEnabled ? '✓' : '🔒'}</span><b>Rede LAN</b><small>{lanEnabled ? diagnostics?.networkAccess?.host || diagnostics?.lan.selectedHost : 'Apenas este computador'}</small></div>
          <div className={phoneReady ? 'is-ok' : 'is-warn'}><span>{phoneReady ? '✓' : '—'}</span><b>Celular</b><small>{phoneReady ? `${onlinePhones.length} online` : 'Aguardando pareamento'}</small></div>
          <div className={dialerReady ? 'is-ok' : 'is-warn'}><span>{dialerReady ? '✓' : '—'}</span><b>Discador</b><small>{dialerReady ? 'RealTalent Phone pronto' : 'Aguardando celular'}</small></div><div className={(diagnostics?.phone.oneTapReadyCount ?? 0) > 0 ? 'is-ok' : phoneReady ? 'is-warn' : 'is-warn'}><span>{(diagnostics?.phone.oneTapReadyCount ?? 0) > 0 ? '✓' : '—'}</span><b>One-Tap</b><small>{(diagnostics?.phone.oneTapReadyCount ?? 0) > 0 ? 'iPhone visível + tempo real' : phoneReady ? 'Abra o RealTalent Phone e deixe One-Tap ativo' : 'Aguardando celular'}</small></div>
        </div>
        {diagnostics?.firewall.hint ? <p className="connect-v10181__firewall"><AlertTriangle size={15}/>{diagnostics.firewall.hint}</p> : null}
      </section>

      {ready ? <section className="connect-v10181__test">
        <div><span className="eyebrow">Teste One-Tap</span><h3>Envie uma chamada para o iPhone</h3><p>Com o RealTalent Phone visível e One-Tap ativo, o companion tenta abrir o discador imediatamente. Se o iOS bloquear, aparece um único botão de fallback.</p></div>
        <div className="connect-v10181__test-form"><input value={testNumber} onChange={(event) => setTestNumber(event.target.value)} placeholder="(51) 99999-0000"/><Button loading={testBusy} disabled={!testNumber.trim()} onClick={() => void runTestCall()}><PhoneCall size={15}/> Enviar teste</Button></div>
        {testMessage ? <p className="connect-v10181__test-message">{testMessage}</p> : null}
      </section> : null}

      <details className="connect-v1018__advanced">
        <summary><div><span className="eyebrow">Configuração avançada</span><strong>Endpoint, outros providers e Caller ID</strong></div><ChevronDown size={18}/></summary>
        <div className="connect-v1018__advanced-body">
          <section className="voice-settings-v73__connection"><div><span className="eyebrow">Bridge local</span><h3>Endpoint</h3><p>O modo padrão usa o serviço iniciado automaticamente pelo launcher.</p></div><label><span>Endpoint local</span><div className="voice-settings-v73__url"><Link2 size={16}/><input value={draft.connectBaseUrl} onChange={(event) => setDraft((current) => ({ ...current, connectBaseUrl: event.target.value }))} placeholder="http://localhost:3001" /></div></label></section>
          <section className="voice-settings-v73__providers"><header><div><span className="eyebrow">Outras opções de telefonia</span><h3>Providers avançados</h3></div></header><div className="voice-settings-v73__provider-grid">{providerOptions.map((id) => { const status = statuses.find((item) => item.id === id); return <article key={id} className={draft.defaultProviderId === id ? 'is-selected' : ''}><div className="voice-settings-v73__provider-title"><span><PhoneCall size={17}/></span><div><strong>{providerLabel(id)}</strong><small>{status?.detail ?? 'Ainda não verificado.'}</small></div></div><div className="voice-settings-v73__provider-footer"><StatusPill tone={status ? toneForState(status.state) : 'neutral'}>{id === 'realtalent_connect' && bridgeReady && status?.state !== 'available' ? 'Bridge ativo' : status ? voiceProviderStateLabel(status.state) : 'Não verificado'}</StatusPill><button type="button" onClick={() => setDraft((current) => ({ ...current, defaultProviderId: id, selectedDeviceId: id === 'external_tel' ? 'external:system-dialer' : id === 'realtalent_connect' ? (devices.find((device) => device.providerId === 'realtalent_connect' && device.available)?.id ?? 'connect:default') : current.selectedDeviceId }))}>Usar como padrão</button></div></article> })}</div></section>
          <section className="voice-settings-v73__caller-id"><header><div><span className="eyebrow">Caller ID Manager</span><h3>Números de saída</h3><p>Usados somente por providers PSTN. O RealTalent Phone usa o próprio número do celular.</p></div></header><div className="voice-settings-v73__caller-form"><label><span>Nome</span><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Comercial RS"/></label><label><span>Número</span><input value={number} onChange={(event) => setNumber(event.target.value)} placeholder="+55 51 3000-0000"/></label><Button type="button" variant="secondary" onClick={addIdentity} disabled={!number.trim()}><Plus size={15}/> Adicionar</Button></div><div className="voice-settings-v73__identity-list">{draft.outboundIdentities.length ? draft.outboundIdentities.map((identity) => <label key={identity.id}><input type="radio" name="caller-id" checked={draft.selectedCallerId === identity.id} onChange={() => setDraft((current) => ({ ...current, selectedCallerId: identity.id }))}/><span><strong>{identity.label}</strong><small>{identity.number} · {providerLabel(identity.providerId)}</small></span><button type="button" className="icon-button call-icon-button call-icon-button--danger" aria-label="Remover número" onClick={(event) => { event.preventDefault(); setDraft((current) => ({ ...current, outboundIdentities: current.outboundIdentities.filter((item) => item.id !== identity.id), selectedCallerId: current.selectedCallerId === identity.id ? '' : current.selectedCallerId })) }}><Trash2 size={15}/></button></label>) : <p className="activity-empty">Nenhum Caller ID cadastrado.</p>}</div></section>
        </div>
      </details>
    </div>
  </Modal>
}
