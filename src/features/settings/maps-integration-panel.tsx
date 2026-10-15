import { CheckCircle2, Copy, ExternalLink, MapPinned, RefreshCw, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { copyTextToClipboard } from '../../lib/browser-actions'
import { useAppUi } from '../../app/app-context'

type MapsDiagnostic = {
  configured?: boolean
  renderer?: string
  provider?: string
  geocoding?: string
  places?: string
  message?: string
  checkedAt?: string
}

export function MapsIntegrationPanel() {
  const { notify } = useAppUi()
  const [diagnostic, setDiagnostic] = useState<MapsDiagnostic | null>(null)
  const [loading, setLoading] = useState(false)
  const refresh = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/maps/diagnostics', { cache: 'no-store' })
      const data = await response.json() as MapsDiagnostic
      if (!response.ok) throw new Error(data.message || 'Diagnóstico do mapa indisponível.')
      setDiagnostic(data)
    } catch (error) {
      setDiagnostic({ configured: false, renderer: 'OpenStreetMap / Leaflet', provider: 'OpenStreetMap', geocoding: 'local-estimate', places: 'assisted', message: error instanceof Error ? error.message : 'Gateway local indisponível.' })
    } finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])
  const copyCommand = async () => {
    await copyTextToClipboard('./configure-google-maps.sh')
    notify('success', 'Comando copiado.')
  }
  return <div className="page-stack maps-settings-v101">
    <article className="panel maps-settings-v101__hero">
      <div className="panel__heading"><div><span className="eyebrow"><MapPinned size={14}/> Território 3.0 · V101.0</span><h3>Mapa funcional sem chave obrigatória</h3></div><StatusPill tone={diagnostic?.configured ? 'success' : 'info'}>{diagnostic?.configured ? 'Google conectado' : 'OpenStreetMap ativo'}</StatusPill></div>
      <p>O mapa-base usa OpenStreetMap e não depende de chave comercial. A chave Google fica somente no gateway e é usada para Geocoding e Places quando você quiser coordenadas reais e busca direta.</p>
      <div className="maps-settings-v101__status">
        <div><small>Renderização</small><strong>{diagnostic?.renderer || 'OpenStreetMap / Leaflet'}</strong><span>Mapa, marcadores, raio, áreas e clusters.</span></div>
        <div><small>Geocodificação</small><strong>{diagnostic?.configured ? 'Google Geocoding API' : 'Estimativa local'}</strong><span>{diagnostic?.configured ? 'Endereços convertidos em coordenadas reais.' : 'Funciona sem chave e identifica posições aproximadas.'}</span></div>
        <div><small>Garimpo</small><strong>{diagnostic?.configured ? 'Google Places API (New)' : 'Modo assistido'}</strong><span>Uma única chave server-side pode atender Território e Garimpo.</span></div>
      </div>
      <div className="settings-actions"><Button variant="secondary" loading={loading} onClick={() => void refresh()}><RefreshCw size={15}/> Verificar agora</Button><Button variant="secondary" onClick={() => void copyCommand()}><Copy size={15}/> Copiar comando Linux</Button></div>
    </article>
    <article className="panel"><div className="panel__heading"><div><span className="eyebrow"><ShieldCheck size={14}/> Configuração segura</span><h3>Ativar precisão Google</h3></div></div>
      <ol className="maps-settings-v101__steps"><li><span>1</span><div><strong>No Google Cloud, habilite Geocoding API e Places API (New)</strong><p>Use um projeto com faturamento e restrinja a chave às APIs necessárias.</p></div></li><li><span>2</span><div><strong>No Linux, execute o configurador</strong><code>./configure-google-maps.sh</code></div></li><li><span>3</span><div><strong>Reinicie o CRM</strong><p>O gateway lê a chave no servidor local; ela não é enviada ao bundle do navegador.</p></div></li></ol>
      <div className="maps-settings-v101__notice"><CheckCircle2 size={17}/><span><strong>Sem chave o CRM continua operacional.</strong> Território usa OpenStreetMap, coordenadas já salvas e estimativas locais. Nenhum tile mostra “API KEY REQUIRED”.</span></div>
      <a className="text-button maps-settings-v101__external" href="https://console.cloud.google.com/google/maps-apis/apis-list" target="_blank" rel="noreferrer">Abrir Google Maps Platform <ExternalLink size={14}/></a>
    </article>
  </div>
}
