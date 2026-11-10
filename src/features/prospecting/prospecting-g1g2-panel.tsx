import {useEffect,useMemo,useRef,useState} from 'react'
import {AlertTriangle,ExternalLink,LoaderCircle,SearchCheck,ShieldCheck,Sparkles} from 'lucide-react'
import {Button} from '../../components/ui/button'
import type {WorkspaceSnapshot} from '../../domain/types'
import type {ProspectRecord} from '../../services/prospecting-workspace'
import {explainProspectScore,prospectDecisionLabel} from '../../services/prospecting-g1g2-intelligence'
import {scoreProspectWithIcp} from '../../services/prospecting-intelligence'
import {env} from '../../lib/env'
import {runtimeFetch} from '../../services/realtalent-runtime-transport'
import {appendTriggerCandidatesG4,type TriggerCandidateG4,type TriggerSourceG4} from '../../services/prospecting-triggers-g4'
import {appendRemoteTriggersG43,isTriggerCloudModeG43} from '../../services/prospecting-triggers-g43-remote'
import {ProspectingCompanyAssistant} from './prospecting-company-assistant'
import {groupInvestigationSourcesG53,type InvestigationSourceG53} from '../../services/prospecting-g53-evidence'
import {guardInvestigationPresentationG55,hasConfirmedInvestigationEvidenceG55} from '../../services/prospecting-g55-presentation'

type InvestigationSource=InvestigationSourceG53
interface Investigation {
  ok:boolean;summary:string;hypotheses:string[];questions:string[];
  approach:string;caveats:string[];pageRead:boolean;readUrl:string|null;
  readTitle:string|null;quality:string;
  searchStatus?:'done'|'no_results'|'unavailable';
  modelStatus?:string;modelEvidenceCount?:number;modelElapsedMs?:number;
  searchDiagnostics?:{resultsReturned:number;eligibleUrls:number;verifiedPages:number;socialProfiles?:number};
  sources?:InvestigationSource[]
  candidateEvents?:TriggerCandidateG4[]
}
interface Props {prospect:ProspectRecord;snapshot:WorkspaceSnapshot;readOnly:boolean}
const safeSite=(url:string|null)=>{
  try{
    if(!url)return null
    const parsed=new URL(url)
    return parsed.protocol==='https:'?parsed.href:null
  }catch{return null}
}
export function ProspectingG1G2Panel({prospect,snapshot,readOnly}:Props){
  const base=useMemo(()=>scoreProspectWithIcp(prospect,snapshot),[prospect,snapshot])
  const score=useMemo(()=>explainProspectScore(prospect,snapshot,base),[prospect,snapshot,base])
  const [busy,setBusy]=useState(false)
  const [result,setResult]=useState<Investigation|null>(null)
  const [error,setError]=useState('')
  const [signalNotice,setSignalNotice]=useState('')
  const [publicSourceUrl,setPublicSourceUrl]=useState('')
  const abortRef=useRef<AbortController|null>(null)
  useEffect(()=>{
    abortRef.current?.abort();abortRef.current=null
    setResult(null);setError('');setSignalNotice('');setPublicSourceUrl('');setBusy(false)
    return ()=>{abortRef.current?.abort()}
  },[prospect.id,prospect.updatedAt])
  const run=async()=>{
    abortRef.current?.abort()
    const ctrl=new AbortController()
    abortRef.current=ctrl
    // Discovery (up to 30s) + public-page reading + local Qwen (up to 90s).
    const timer=setTimeout(()=>ctrl.abort(),175000)
    setBusy(true);setError('');setSignalNotice('');setResult(null)
    try{
      const response=await runtimeFetch(env.agentGatewayUrl+'/tools/prospect-investigate',{
        method:'POST',signal:ctrl.signal,
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          company:prospect.company||prospect.name,city:prospect.city,
          segment:String(prospect.rawData?.category||'').slice(0,100),
          description:prospect.description,
          website:prospect.website,
          publicSourceUrl:publicSourceUrl.trim(),
        })
      })
      if(!response.ok)throw Error(response.status===429?'Ollama ocupado. Tente novamente.':'A investigação local não respondeu.')
      const rawData=await response.json() as Investigation
      if(!rawData.ok)throw Error('O modelo não conseguiu verificar esta empresa.')
      const data=guardInvestigationPresentationG55(rawData)
      let created=0
      const issues:string[]=[]
      if(!readOnly&&Array.isArray(data.candidateEvents)&&data.candidateEvents.length){
        const cloud=isTriggerCloudModeG43()
        for(const item of data.sources||[]){
          const relevant=data.candidateEvents.filter(candidate=>candidate.sourceUrl===item.url)
          if(!relevant.length||item.reading!=='page'||item.identity==='unconfirmed'||item.excerpt.length<35)continue
          const source:TriggerSourceG4={
            company:prospect.company||prospect.name,city:prospect.city,
            sector:String(prospect.rawData?.category||'').slice(0,100),
            sourceUrl:item.url,excerpt:item.excerpt,
          }
          try{
            const added=cloud
              ?await appendRemoteTriggersG43(prospect.workspaceId,prospect,relevant,source)
              :appendTriggerCandidatesG4(prospect.workspaceId,prospect,relevant,source,window.localStorage)
            created+=added.length
          }catch(e){
            issues.push(e instanceof Error?e.message:'Falha ao gravar sinal em revisão.')
          }
        }
        if(created)window.dispatchEvent(new CustomEvent('realtalent:garimpo:g4:change',{
          detail:{workspaceId:prospect.workspaceId,prospectId:prospect.id},
        }))
      }
      if(!ctrl.signal.aborted){
        setResult(data)
        setSignalNotice(!hasConfirmedInvestigationEvidenceG55(data)
          ?'Pesquisa sem evidências públicas verificáveis. As hipóteses e recomendações sem fontes foram ocultadas.'
          :readOnly
          ?'Investigação concluída em modo de leitura. Nenhum sinal foi gravado no G4.'
          :issues.length
          ?'A análise foi concluída, mas houve falha ao sincronizar os sinais no G4: '+issues.slice(0,2).join(' · ')
          :created
            ?created+' sinal(is) criado(s) como PENDENTE no G4. Verifique a fonte antes de aprovar.'
            :Array.isArray(data.candidateEvents)&&data.candidateEvents.length
              ?'Os acontecimentos já estavam cadastrados ou não passaram na validação de evidências.'
              :'Nenhum acontecimento explícito e verificável foi classificado nesta investigação.')
      }
    }catch(e){
      if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:'Não foi possível analisar.')
    }finally{
      clearTimeout(timer)
      if(abortRef.current===ctrl){setBusy(false);abortRef.current=null}
    }
  }
  const prepareSourceForG4=(source:InvestigationSource)=>{
    if(readOnly||source.reading!=='page'||source.identity==='unconfirmed'||!safeSite(source.url)||source.excerpt.length<35)return
    window.dispatchEvent(new CustomEvent('realtalent:garimpo:g4:source-from-investigation',{
      detail:{workspaceId:prospect.workspaceId,prospectId:prospect.id,sourceUrl:source.url,excerpt:source.excerpt},
    }))
    document.querySelector('.prospecting-trigger-g4')?.scrollIntoView({behavior:'smooth',block:'start'})
  }
  const groundedReport=Boolean(result&&hasConfirmedInvestigationEvidenceG55(result))
  const groupedSources=useMemo(()=>groupInvestigationSourcesG53(result?.sources||[]),[result])
  const confirmedDomains=groupedSources.filter(group=>group.primary.reading==='page'&&group.primary.identity!=='unconfirmed').length
  const labels:[string,number][]=[
    ['Aderência ao ICP',score.fit],
    ['Potencial comercial',score.opportunity],
    ['Confiança das evidências',score.evidenceConfidence],
  ]
  return <section className="prospecting-g1g2" aria-label="Investigação e qualificação explicável">
    <ProspectingCompanyAssistant prospect={prospect}/>
    <details className="prospecting-g1g2__score-disclosure">
      <summary><span><ShieldCheck size={15}/> Indicadores, pendências e origem dos dados</span>
        <span>ICP {score.fit}/100 · evidências {score.evidenceConfidence}/100</span></summary>
    <header className="prospecting-g1g2__header">
      <div><span className="eyebrow"><Sparkles size={14}/> Garimpo Inteligente · G1 + G2</span>
        <h4>Por que investigar esta empresa?</h4>
        <p>Uma leitura comercial, sem confundir presença digital com intenção de compra.</p></div>
      <span className={'prospecting-g1g2__decision is-'+score.decision}>{prospectDecisionLabel(score.decision)}</span>
    </header>
    <div className="prospecting-g1g2__dimensions">
      {labels.map(([label,value])=><div key={label} className="prospecting-g1g2__dimension">
        <span>{label}</span><strong>{value}<small>/100</small></strong>
        <div className="prospecting-g1g2__meter" aria-label={label+' '+value+' de 100'}><i style={{width:value+'%'}}/></div>
      </div>)}
    </div>
    <p className="prospecting-g1g2__note">Pontuações determinísticas baseadas no ICP e na qualidade dos dados. Não são probabilidades de compra. Score anterior: {score.existingScore}/100.</p>
    {score.reasons.length?<div className="prospecting-g1g2__detail"><strong><ShieldCheck size={14}/> Sinais observados</strong>
      <ul>{score.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul></div>:null}
    {score.uncertainties.length?<div className="prospecting-g1g2__detail is-warning"><strong><AlertTriangle size={14}/> O que ainda não sabemos</strong>
      <ul>{score.uncertainties.map((reason,i)=><li key={i}>{reason}</li>)}</ul></div>:null}
    <details className="prospecting-g1g2__evidence"><summary>Ver origem das evidências ({score.evidence.length})</summary>
      <ul>{score.evidence.map((e,i)=><li key={i}><strong>{e.type==='gap'?'Pendente':e.type==='inference'?'Inferência':'Informado'}</strong> · {e.label} <small>({e.source})</small></li>)}</ul>
    </details>
    </details>
    <div className="prospecting-g1g2__investigate">
      <div><strong>Investigação com Qwen3 8B</strong>
      <small>Pesquisa o nome e a cidade em fontes públicas, lê páginas compatíveis e analisa as evidências. Não aprova nem envia empresas.</small></div>
      <Button variant="secondary" disabled={busy} onClick={()=>void run()}>
        {busy?<LoaderCircle size={15} className="spin"/>:<SearchCheck size={15}/>}
        {busy?'Investigando…':result?'Investigar novamente':'Investigar com IA'}
      </Button>
    </div>
    <details className="prospecting-g1g2__manual-source">
      <summary>Informar site ou perfil público para conferir (opcional)</summary>
      <label htmlFor="garimpo-public-source-url">URL pública da empresa</label>
      <input id="garimpo-public-source-url" type="url" inputMode="url" value={publicSourceUrl}
        onChange={event=>setPublicSourceUrl(event.target.value)} placeholder="https://exemplo.com.br/empresa"
        maxLength={1100} autoComplete="off" />
      <small>Esta URL será verificada durante a próxima investigação. Não altera o cadastro. Perfis sociais podem exigir conferência manual; resultados de busca não são evidências confirmadas.</small>
    </details>
    {error?<p className="prospecting-g1g2__error" role="alert">{error}</p>:null}
    {signalNotice?<p className="prospecting-g1g2__signal-notice" role="status">{signalNotice}</p>:null}
    {result?<div className="prospecting-g1g2__report" aria-live="polite">
      <div className="prospecting-g1g2__report-source">
        <span>{groundedReport?'Fonte pública compatível lida':'Sem evidência pública compatível confirmada'}</span>
        {groundedReport&&safeSite(result.readUrl)?<a href={safeSite(result.readUrl)!} rel="noopener noreferrer" target="_blank"><ExternalLink size={13}/> Conferir fonte</a>:null}
      </div>
      <p>{result.summary}</p>
      {!groundedReport
        ?<p className="prospecting-g1g2__evidence-empty" role="status">
          Sem evidências externas suficientes. Confira o site ou perfil oficial e atualize o cadastro antes de repetir a pesquisa.
        </p>
        :result.modelStatus&&result.modelStatus!=='completed'
          ?<p className="prospecting-g1g2__error" role="status">A leitura foi preservada, mas a análise local não foi concluída ({result.modelStatus}).</p>
          :null}
      <section className="prospecting-g1g2__public-sources">
        <strong>Pesquisa e evidências públicas</strong>
        <small>{confirmedDomains} domínio(s) com páginas compatíveis · {result.modelEvidenceCount??0} fonte(s) enviada(s) ao Qwen.</small>
        {result.searchDiagnostics
          ?<small>{result.searchDiagnostics.resultsReturned} resultado(s) da pesquisa · {result.searchDiagnostics.eligibleUrls} URL(s) analisadas · {result.searchDiagnostics.verifiedPages} página(s) verificadas · {result.searchDiagnostics.socialProfiles??0} perfil(is) público(s) sugerido(s).</small>
          :null}
        <small>{result.searchStatus==='unavailable'
          ?'Busca indisponível. Verifique o Garimpo na porta 4319.'
          :result.searchStatus==='no_results'
            ?'A pesquisa não encontrou resultados; não foram criados fatos artificiais.'
            :'Os links são sugestões para conferência; páginas lidas não equivalem à validação definitiva da empresa.'}</small>
        {groupedSources.length
          ?<ul>{groupedSources.map(group=><li key={group.domain}>
            <a href={safeSite(group.primary.url)||undefined} target="_blank" rel="noopener noreferrer">{group.primary.title||group.domain} <ExternalLink size={12}/></a>
            <small>{group.domain} · {group.primary.sourceKind==='social_profile'?'Perfil público sugerido (conferir manualmente)':group.primary.reading==='page'?'Página lida':'Somente resultado de busca'} · {group.primary.identity==='compatible'
              ?'Nome e cidade compatíveis':group.primary.identity==='partial'?'Nome compatível; localidade a conferir':'Identidade não confirmada'}
              {group.count>1?' · '+group.count+' URLs deste domínio':''}
              {group.primary.reading==='page'&&group.primary.engine?' · '+group.primary.engine:''}</small>
            {!readOnly&&group.primary.reading==='page'&&group.primary.identity!=='unconfirmed'&&group.primary.excerpt.length>=35
              ?<button type="button" onClick={()=>prepareSourceForG4(group.primary)}>Usar fonte no G4</button>:null}
          </li>)}</ul>
          :<p>Nenhuma fonte pública compatível disponível nesta investigação.</p>}
        {(result.sources||[]).length>groupedSources.length
          ?<details><summary>Conferir todas as URLs ({result.sources?.length})</summary>
            <ul>{(result.sources||[]).map((source,index)=><li key={source.url+'-'+index}>
              <a href={safeSite(source.url)||undefined} target="_blank" rel="noopener noreferrer">{source.url}</a>
              <small>{source.reading==='page'?'Lida':'Não lida'} · {source.identity==='unconfirmed'?'Identidade não confirmada':'Identidade compatível ou parcial'}</small>
              {!readOnly&&source.reading==='page'&&source.identity!=='unconfirmed'&&source.excerpt.length>=35
                ?<button type="button" onClick={()=>prepareSourceForG4(source)}>Usar fonte no G4</button>:null}
            </li>)}</ul>
          </details>:null}
      </section>
      {groundedReport&&result.hypotheses.length?<section><strong>Hipóteses para investigar</strong><ul>{result.hypotheses.map((h,i)=><li key={i}>{h}</li>)}</ul></section>:null}
      {groundedReport&&result.questions.length?<section><strong>Perguntas de diagnóstico</strong><ul>{result.questions.map((q,i)=><li key={i}>{q}</li>)}</ul></section>:null}
      {groundedReport&&result.approach?<section><strong>Abordagem sugerida</strong><p>{result.approach}</p></section>:null}
      {result.caveats.length?<small>{result.caveats.join(' · ')}</small>:null}
    </div>:null}
  </section>
}
