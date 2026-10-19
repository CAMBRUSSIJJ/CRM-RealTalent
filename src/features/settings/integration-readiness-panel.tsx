import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { probeIntegrationInfrastructure, type IntegrationProbe } from '../../services/integration-runtime-diagnostics'
const labels = { online:'Endpoint responde',protected:'Exige autenticação',missing:'Não implantado',unavailable:'Indisponível',attention:'Requer configuração' } as const
export function IntegrationReadinessPanel() {
  const [rows,setRows] = useState<IntegrationProbe[]>([])
  const [working,setWorking] = useState(false)
  const [ran,setRan] = useState(false)
  const [error,setError] = useState('')
  const check = async () => {
    if (working) return
    setWorking(true);setError('')
    try { setRows(await probeIntegrationInfrastructure());setRan(true) }
    catch (reason) { setError(reason instanceof Error?reason.message:'Falha ao verificar integrações.') }
    finally { setWorking(false) }
  }
  const missing=rows.filter(x=>['missing','unavailable'].includes(x.status)).length
  return <section className="panel integration-readiness-panel" aria-label="Verificação de infraestrutura de integrações">
    <div className="panel__heading"><div><span className="eyebrow">Diagnóstico real · somente leitura</span><h3>Verificar integrações</h3>
      <p>Descubra funções ausentes e serviços desconectados antes de conectar uma conta ou enviar mensagens.</p></div>
      <Button type="button" onClick={()=>void check()} loading={working} disabled={working}><RefreshCw size={15}/> Verificar conexões</Button></div>
    {error && <p role="alert">{error}</p>}
    {ran && <><p role="status" className="settings-copy">{missing?missing+' serviço(s) ausente(s) ou indisponível(is).':'Endpoints responderam; autenticação e envio real ainda exigem teste.'}</p>
      <div className="integration-readiness-panel__grid">{rows.map(item=><article key={item.id} className="integration-readiness-panel__item"><strong>{item.label}</strong>
        <span data-status={item.status}>{labels[item.status]}</span><p>{item.detail}</p><small>{item.action}</small></article>)}</div></>}
    <p className="settings-copy">Teste somente leitura via HEAD: não envia mensagens, executa automações, altera contas nem grava dados.</p>
  </section>
}
