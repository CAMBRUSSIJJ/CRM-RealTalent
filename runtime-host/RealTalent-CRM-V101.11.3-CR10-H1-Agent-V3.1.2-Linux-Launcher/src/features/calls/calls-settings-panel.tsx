import '../../styles/calls-focus-simplification-v100731.css'
import { Headphones, Mic, PhoneCall, RefreshCw, Settings2, ShieldCheck, SlidersHorizontal, Smartphone, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { discoverVoiceDevices, fetchRealTalentConnectHealth, fetchRealTalentPhoneDevices, probeVoiceProviders, providerLabel, readVoiceSettings, voiceProviderStateLabel, type RealTalentConnectHealth, type RealTalentPhoneDevice, type VoiceDevice, type VoiceProviderStatus, type VoiceSettings } from '../../services/voice-dialer'
import { VoiceDialerSettingsModal } from './voice-dialer-settings-modal'

export function CallsSettingsPanel({ workspaceId, onOpenDisplay }: { workspaceId: string; onOpenDisplay(): void }) {
  const [settings, setSettings] = useState<VoiceSettings>(() => readVoiceSettings(workspaceId))
  const [providers, setProviders] = useState<VoiceProviderStatus[]>([])
  const [devices, setDevices] = useState<VoiceDevice[]>([])
  const [phones, setPhones] = useState<RealTalentPhoneDevice[]>([])
  const [health, setHealth] = useState<RealTalentConnectHealth | null>(null)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [checking, setChecking] = useState(false)

  const refresh = async (value = readVoiceSettings(workspaceId)) => {
    setChecking(true)
    try {
      setSettings(value)
      const [nextProviders, nextHealth, nextPhones] = await Promise.all([probeVoiceProviders(value), fetchRealTalentConnectHealth(value), fetchRealTalentPhoneDevices(value, workspaceId)])
      setProviders(nextProviders); setHealth(nextHealth); setPhones(nextPhones)
      setDevices(await discoverVoiceDevices(nextProviders, value, workspaceId))
    } finally { setChecking(false) }
  }

  useEffect(() => { void refresh(readVoiceSettings(workspaceId)) }, [workspaceId])

  const activeProvider = providers.find((item) => item.id === settings.defaultProviderId)
  const selectedDevice = devices.find((item) => item.id === settings.selectedDeviceId)
  const selectedIdentity = settings.outboundIdentities.find((item) => item.id === settings.selectedCallerId)
  const speechSupported = typeof window !== 'undefined' && Boolean((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)
  const recordingSupported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  const readyProviders = useMemo(() => providers.filter((item) => item.state === 'available').length, [providers])
  const onlinePhones = phones.filter((item) => item.available)
  const bridgeReady = Boolean(health?.ok)
  const connectReady = bridgeReady && onlinePhones.length > 0 && settings.defaultProviderId === 'realtalent_connect' && Boolean(selectedDevice?.available)
  const otherProviders = providers.filter((item) => item.id !== 'realtalent_connect')

  return <>
    <section className="calls-settings-v731" aria-label="Configurações de ligações">
      <div className="calls-settings-v731__hero">
        <div><span className="eyebrow">Configurações de ligações</span><h3>Prepare a telefonia antes de entrar no Modo Foco</h3><p>O fluxo principal agora é RealTalent Connect → celular → discador nativo. SIP, Browser Voice e PSTN ficam como opções avançadas.</p></div>
        <Button variant="secondary" loading={checking} onClick={() => void refresh()}><RefreshCw size={16}/> Verificar agora</Button>
      </div>

      <section className={`connect-v10181__settings-card ${connectReady ? 'is-ready' : bridgeReady ? 'is-bridge' : ''}`}>
        <div className="connect-v10181__settings-icon">{bridgeReady ? <Wifi size={21}/> : <WifiOff size={21}/>}</div>
        <div><span className="eyebrow">RealTalent Connect</span><h3>{connectReady ? 'Celular conectado e pronto' : bridgeReady ? 'Bridge ativo · falta parear o celular' : 'Connect não encontrado'}</h3><p>{connectReady ? `${selectedDevice?.label || onlinePhones[0]?.label || 'RealTalent Phone'} receberá as chamadas do CRM.` : bridgeReady ? 'O serviço local está funcionando. Abra a configuração para gerar o QR e conectar o celular.' : 'Inicie o CRM pelo start-linux.sh para subir o bridge local na porta 3001.'}</p></div>
        <div className="connect-v10181__settings-actions"><StatusPill tone={connectReady ? 'success' : bridgeReady ? 'warning' : 'neutral'}>{connectReady ? 'Pronto' : bridgeReady ? 'Bridge ativo' : 'Offline'}</StatusPill><Button onClick={() => setVoiceOpen(true)}><Smartphone size={16}/>{connectReady ? 'Gerenciar Connect' : 'Configurar RealTalent Connect'}</Button></div>
      </section>

      <div className="calls-settings-v731__grid">
        <article className="calls-settings-v731__card calls-settings-v731__card--primary">
          <header><span><PhoneCall size={19}/></span><div><small>Telefonia ativa</small><strong>{providerLabel(settings.defaultProviderId)}</strong></div><StatusPill tone={activeProvider?.state === 'available' || settings.defaultProviderId === 'external_tel' ? 'success' : 'warning'}>{settings.defaultProviderId === 'external_tel' ? 'Pronto' : voiceProviderStateLabel(activeProvider?.state ?? 'not_configured')}</StatusPill></header>
          <dl><div><dt>Dispositivo</dt><dd>{selectedDevice?.label ?? 'Padrão do provedor'}</dd></div><div><dt>Número de saída</dt><dd>{selectedIdentity ? `${selectedIdentity.label} · ${selectedIdentity.number}` : settings.defaultProviderId === 'realtalent_connect' ? 'Número do próprio celular' : 'Padrão do provedor'}</dd></div></dl>
          <Button variant="secondary" onClick={() => setVoiceOpen(true)}><Settings2 size={16}/> Abrir configuração</Button>
        </article>
        <article className="calls-settings-v731__card"><header><span><SlidersHorizontal size={19}/></span><div><small>Modo Foco</small><strong>Visual e ferramentas</strong></div></header><p>Defina fila lateral, roteiro, coaching, objeções, notas, histórico, gravação, transcrição e materiais complementares.</p><Button variant="secondary" onClick={onOpenDisplay}><SlidersHorizontal size={16}/> Personalizar Modo Foco</Button></article>
        <article className="calls-settings-v731__card"><header><span><ShieldCheck size={19}/></span><div><small>Status operacional</small><strong>Recursos locais</strong></div></header><div className="calls-settings-v731__status-list"><div><Mic size={16}/><span><strong>Gravação local</strong><small>Microfone do navegador via MediaRecorder</small></span><StatusPill tone={recordingSupported ? 'success' : 'warning'}>{recordingSupported ? 'Disponível' : 'Indisponível'}</StatusPill></div><div><Headphones size={16}/><span><strong>Transcrição no navegador</strong><small>Depende de SpeechRecognition do navegador</small></span><StatusPill tone={speechSupported ? 'success' : 'warning'}>{speechSupported ? 'Disponível' : 'Indisponível'}</StatusPill></div></div></article>
      </div>

      <details className="connect-v10181__other-telephony">
        <summary><div><span className="eyebrow">Telefonia avançada</span><strong>Outras opções de telefonia</strong><small>{readyProviders} de {providers.length || 4} canais disponíveis.</small></div></summary>
        <div className="calls-settings-v731__provider-grid">{otherProviders.map((provider) => <article key={provider.id} className={provider.state === 'available' ? 'is-ready' : ''}><span className="calls-settings-v731__provider-icon">{provider.state === 'available' ? <Wifi size={17}/> : <WifiOff size={17}/>}</span><div><strong>{provider.label}</strong><small>{provider.detail}</small></div><StatusPill tone={provider.state === 'available' ? 'success' : provider.state === 'reachable_incompatible' ? 'warning' : 'neutral'}>{voiceProviderStateLabel(provider.state)}</StatusPill></article>)}</div>
      </details>
    </section>

    <VoiceDialerSettingsModal open={voiceOpen} workspaceId={workspaceId} value={settings} onClose={() => setVoiceOpen(false)} onSave={(next) => { setVoiceOpen(false); void refresh(next) }} />
  </>
}
