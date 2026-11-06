import {useEffect,useMemo,useState} from 'react'
import {ArrowUpRight,BookOpen,SearchCheck,ShieldCheck} from 'lucide-react'
import type {Lead} from '../../domain/types'
import {analyzeWonSales,listenWonSales,readWonSales,type WonSalesRecord} from '../../services/won-sales-analysis'
import './won-sales-analysis.css'

interface Props{
  workspaceId:string
  wins:Lead[]
  onInvestigate:(prompt:string)=>void
}
export function WonSalesProspectingSignals({workspaceId,wins,onInvestigate}:Props){
  const [records,setRecords]=useState<WonSalesRecord[]>([])
  useEffect(()=>{
    const refresh=()=>{
      try{setRecords(readWonSales(workspaceId,window.localStorage))}
      catch{setRecords([])}
    }
    refresh()
    return listenWonSales(workspaceId,refresh)
  },[workspaceId])
  const patterns=useMemo(()=>analyzeWonSales(wins,records).patterns.filter(pattern=>pattern.evidenceCount>0),
    [wins,records])
  if(!patterns.length)return <section className="won-sales-signals" aria-label="Pesquisa por eventos-gatilho">
    <span><BookOpen size={16}/> Sinais comerciais a partir das vendas</span>
    <p>Registre os acontecimentos confirmados de algumas vendas ganhas em Métricas → Vendas ganhas.
      Depois, use esses padrões como hipóteses de pesquisa no Garimpo.</p>
  </section>
  return <section className="won-sales-signals" aria-label="Sinais comerciais fundamentados nas vendas">
    <header><div><span><SearchCheck size={16}/> Sinais observados nas vendas ganhas</span>
      <p>Use os padrões históricos apenas para orientar novas pesquisas. Eles não comprovam eventos em outras empresas.</p></div>
      <ShieldCheck size={18}/></header>
    <div className="won-sales-signals__cards">{patterns.slice(0,3).map(pattern=><article key={pattern.category+pattern.trigger}>
      <div><strong>{pattern.trigger}</strong><small>{pattern.evidenceCount} venda(s) com evidência</small></div>
      <button type="button" onClick={()=>onInvestigate(
        'Pesquise empresas reais, com fontes públicas e datas verificáveis, que tenham apresentado recentemente o evento: "'+
        pattern.trigger+'". Não invente empresas nem fatos. Restrinja a busca ao território configurado no Garimpo, se houver. '+
        'Para cada resultado mostre empresa, fonte, data do evento, link da evidência e nível de confiança. '+
        'Se não houver fontes verificáveis, informe que não encontrou evidências e não gere oportunidades automaticamente.'
      )}>Investigar sinal <ArrowUpRight size={14}/></button>
    </article>)}</div>
    <small>O RealTalent só propõe a pesquisa; nenhum resultado é aceito ou enviado ao CRM sem revisão humana.</small>
  </section>
}
