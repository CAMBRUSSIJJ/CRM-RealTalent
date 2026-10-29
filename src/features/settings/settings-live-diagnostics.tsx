import {useCallback,useEffect,useState} from 'react'
import {BrainCircuit,MapPinned,MessageCircle,RefreshCw,Search,ArrowRight} from 'lucide-react'
import {Button} from '../../components/ui/button'
import {getAgentRuntimeHealth} from '../../services/realtalent-agent-v56-health'
import {getProspectingAgentHealth} from '../../services/prospecting-linux-agent'
import {loadCommunicationsGatewayHealth} from '../../services/local-communications-gateway'
import type {SettingsSectionId} from './settings-guides'

type State='checking'|'ready'|'attention'|'offline'
type Reading={id:'ai'|'garimpo'|'whatsapp'|'maps';state:State;description:string;at:string}
const initial:Reading[]=[
  {id:'ai',state:'checking',description:'Verificando Ollama e o modelo instalado…',at:''},
  {id:'garimpo',state:'checking',description:'Verificando o motor territorial…',at:''},
  {id:'whatsapp',state:'checking',description:'Verificando o gateway de comunicação…',at:''},
  {id:'maps',state:'checking',description:'Verificando o gateway de mapas…',at:''},
]
const titles={ai:'RealTalent AI',garimpo:'Garimpo',whatsapp:'WhatsApp',maps:'Mapa e território'}
const icons={ai:BrainCircuit,garimpo:Search,whatsapp:MessageCircle,maps:MapPinned}
const sections:Record<Reading['id'],SettingsSectionId>={ai:'ai',garimpo:'maps',whatsapp:'whatsapp',maps:'maps'}
export function SettingsLiveDiagnostics({onNavigate}:{
  onNavigate:(tab:SettingsSectionId)=>void
}){
  const [results,setResults]=useState(initial)
  const [busy,setBusy]=useState(false)
  const check=useCallback(async()=>{
    setBusy(true)
    const at=new Date().toISOString()
    const probes:Array<Promise<Reading>>=[
      getAgentRuntimeHealth().then(x=>({
        id:'ai',state:x.connected&&x.modelInstalled?'ready':x.connected?'attention':'offline',
        description:x.connected?x.modelInstalled?'Modelo '+x.model+' confirmado.':'Gateway disponível, mas modelo não confirmado.':'Ollama não respondeu ao healthcheck.',at
      } as Reading)).catch(()=>({id:'ai',state:'offline',description:'Ollama indisponível.',at} as Reading)),
      getProspectingAgentHealth().then(x=>({
        id:'garimpo',state:x?.ok?'ready':'offline',
        description:x?.ok?'Motor territorial versão '+x.version+' respondendo.':'Motor territorial não respondeu.',at
      } as Reading)).catch(()=>({id:'garimpo',state:'offline',description:'Serviço do Garimpo indisponível.',at} as Reading)),
      loadCommunicationsGatewayHealth().then(x=>({
        id:'whatsapp',state:x.ok?'ready':'attention',
        description:x.ok?'Gateway de comunicação '+x.version+' respondendo. QR/Cloud exigem verificação da conta.':'Gateway respondeu com atenção.',at
      } as Reading)).catch(()=>({id:'whatsapp',state:'offline',description:'Gateway de comunicação indisponível.',at} as Reading)),
      fetch('/api/maps/diagnostics',{cache:'no-store',signal:AbortSignal.timeout(6000)}).then(async response=>{
        if(!response.ok)throw Error('gateway unavailable')
        const data=await response.json() as {configured?:boolean;renderer?:string}
        return {id:'maps',state:data.configured?'ready':'attention',description:data.configured?
          'Gateway Google configurado. Renderização: '+(data.renderer||'a verificar')+'.':
          'Gateway respondeu, mas Google não está configurado; OpenStreetMap pode servir como alternativa.',at} as Reading
      }).catch(()=>({id:'maps',state:'offline',description:'Diagnóstico do gateway de mapas não disponível; o mapa-base pode continuar funcional.',at} as Reading)),
    ]
    // Each item resolves to a confirmed state (or an explicit failure).
    const resolved=await Promise.all(probes)
    setResults(resolved)
    setBusy(false)
  },[])
  useEffect(()=>{void check()},[check])
  return <section className="settings-live-diagnostics" aria-label="Diagnóstico real dos serviços">
    <header><div><strong>Serviços em tempo real</strong><p>Verificação de disponibilidade: não significa que uma pesquisa, mensagem ou sincronização já foi executada.</p></div>
      <Button variant="secondary" size="sm" loading={busy} onClick={()=>void check()}><RefreshCw size={15}/> Verificar agora</Button>
    </header>
    <div className="settings-live-diagnostics__grid">
      {results.map(item=>{
        const Icon=icons[item.id]
        return <article className={'settings-live-diagnostics__card is-'+item.state} key={item.id}>
          <div><Icon size={19}/><strong>{titles[item.id]}</strong><span>{item.state==='ready'?'Respondendo':item.state==='checking'?'Verificando':item.state==='attention'?'Atenção':'Indisponível'}</span></div>
          <p>{item.description}</p>
          <Button variant="ghost" size="sm" onClick={()=>onNavigate(sections[item.id])}>Abrir configurações <ArrowRight size={14}/></Button>
        </article>
      })}
    </div>
  </section>
}
