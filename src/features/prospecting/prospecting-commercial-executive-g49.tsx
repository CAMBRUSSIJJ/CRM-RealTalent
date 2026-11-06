import {ArrowUpRight,CheckCircle2,Compass,FileSearch,Lightbulb,ShieldAlert} from 'lucide-react'
import './prospecting-commercial-executive-g49.css'

export interface CommercialFindingG49 {
  id:string;sourceId:number;url:string;category:string;
  priority:'alta'|'média'|'contexto';priorityMeaning:string;
  fact:string;reading:'page'|'metadata'|'snippet';
  interpretation:string;hypothesis:string;diagnosticQuestion:string
}
export interface CommercialExecutiveG49 {
  version:string;status:'findings'|'insufficient_evidence';
  company:string;checkedAt:string;executive:string;
  discoveries:CommercialFindingG49[];
  actions:Array<{question:string;sourceId:number;url:string;reason:string}>;
  coverage:{indexed:number;analyzed:number;selected:number};
  limitations:string[];sourceUrls:string[]
}
export interface SourceComparisonG49 {added:number;removed:number}
const readingLabels:Record<CommercialFindingG49['reading'],string>={
  page:'Texto de página pública',metadata:'Metadados públicos',snippet:'Prévia indexada',
}
const sourceLink=(url:string)=>{
  try{
    const parsed=new URL(url)
    return parsed.protocol==='https:'&&['instagram.com','www.instagram.com'].includes(parsed.hostname)
      ?parsed.toString():null
  }catch{return null}
}
export function ProspectingCommercialExecutiveG49({
  report,comparison,
}:{report:CommercialExecutiveG49;comparison?:SourceComparisonG49}){
  const findings=report.discoveries.slice(0,3)
  const actions=report.actions.slice(0,2)
  return <section className="prospecting-executive-g49" aria-label="Resumo executivo da inteligência comercial">
    <header>
      <div className="prospecting-executive-g49__badge"><Compass size={14}/> Síntese executiva · G4.9</div>
      <h3>O que realmente importa nesta investigação?</h3>
      <p>{report.executive}</p>
      <div className="prospecting-executive-g49__coverage">
        <span><b>{report.coverage.analyzed}</b> publicações analisadas</span>
        <span><b>{report.coverage.selected}</b> descobertas destacadas</span>
        <span><b>{report.coverage.indexed}</b> publicações indexadas</span>
      </div>
      {comparison?<p className="prospecting-executive-g49__compare">
        {comparison.added>0
          ?String(comparison.added)+' resultado(s) indexado(s) novo(s) em relação à consulta anterior nesta tela.'
          :'Nenhum link indexado novo em relação à consulta anterior nesta tela.'}
        {comparison.removed>0?' '+comparison.removed+' link(s) deixaram de aparecer.':''}
        {' '}Isso não comprova uma publicação recente nem uma mudança na empresa.
      </p>:null}
    </header>
    {findings.length?<div className="prospecting-executive-g49__findings">
      <h4><Lightbulb size={16}/> Descobertas para investigar</h4>
      {findings.map((finding,index)=><article key={finding.id} className="prospecting-executive-g49__finding">
        <div className="prospecting-executive-g49__finding-header">
          <strong>{index+1}. {finding.category}</strong>
          <span className={'is-'+(finding.priority==='alta'?'high':finding.priority==='média'?'medium':'context')}>
            {finding.priority==='contexto'?'Contexto':'Prioridade '+finding.priority}
          </span>
        </div>
        <p><b>Evidência:</b> {finding.fact}</p>
        {finding.interpretation?<p><b>Leitura comercial:</b> {finding.interpretation}</p>:null}
        {finding.hypothesis?<p className="prospecting-executive-g49__hypothesis">
          <b>Hipótese a validar:</b> {finding.hypothesis}</p>:null}
        <footer>
          <small><FileSearch size={12}/>{readingLabels[finding.reading]}</small>
          {sourceLink(finding.url)?<a href={sourceLink(finding.url)!} target="_blank" rel="noopener noreferrer">
            Conferir fonte <ArrowUpRight size={13}/></a>:null}
        </footer>
      </article>)}
    </div>:<div className="prospecting-executive-g49__empty">
      <ShieldAlert size={18}/>
      <p>Não há descobertas comerciais suficientemente sustentadas para destacar.
        A ausência de sinal não significa que a empresa não tenha oportunidades.</p>
    </div>}
    {actions.length?<div className="prospecting-executive-g49__actions">
      <h4><CheckCircle2 size={16}/> Próximos passos sugeridos</h4>
      {actions.map((action,i)=><p key={action.sourceId}>
        <span>{i+1}</span><span>{action.question}
          <small>Hipótese relacionada a: {action.reason}. Validar com a empresa antes de agir.</small>
        </span>
      </p>)}
    </div>:null}
    <small className="prospecting-executive-g49__warning">
      Prioridade indica utilidade para investigação, não chance de compra. Todas as hipóteses exigem validação humana.
    </small>
  </section>
}
