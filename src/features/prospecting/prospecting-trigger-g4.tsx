import {useEffect,useMemo,useState} from 'react'
import {AlertTriangle,ArrowUpRight,BookOpen,CheckCircle2,ClipboardCheck,ExternalLink,LoaderCircle,SearchCheck,ShieldCheck,Sparkles} from 'lucide-react'
import type {ProspectRecord} from '../../services/prospecting-workspace'
import {env} from '../../lib/env'
import {runtimeFetch} from '../../services/realtalent-runtime-transport'
import {readWonSales} from '../../services/won-sales-analysis'
import {
  appendTriggerCandidatesG4,getTriggerSourceFromProspectG4,readTriggerReviewsG4,reviewTriggerG4,
  triggerLabelsG4,type TriggerCandidateG4,type TriggerReviewRecordG4,type TriggerSourceG4,
} from '../../services/prospecting-triggers-g4'
import './prospecting-trigger-g4.css'
import {appendRemoteTriggersG43,isTriggerCloudModeG43,linkRemoteTriggerLeadG43,readRemoteTriggerReviewsG43,reviewRemoteTriggerG43} from '../../services/prospecting-triggers-g43-remote'

interface Props{prospect:ProspectRecord;readOnly:boolean}
type G4Response={ok:boolean;events?:TriggerCandidateG4[];error?:string;caveat?:string;model?:string}
const sourceUrl=(value:string)=>{
  try{
    const u=new URL(value)
    return u.protocol==='https:'&&u.hostname.includes('.')?u.href:''
  }catch{return ''}
}
export function ProspectingTriggerIntelligenceG4({prospect,readOnly}:Props){
  const workspaceId=prospect.workspaceId
  const cloud=isTriggerCloudModeG43()
  const preset=useMemo(()=>getTriggerSourceFromProspectG4(prospect),[prospect.id,prospect.updatedAt,prospect.workspaceId])
  const [source,setSource]=useState<TriggerSourceG4>(preset)
  const [items,setItems]=useState<TriggerReviewRecordG4[]>([])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [confirmed,setConfirmed]=useState<Record<string,boolean>>({})
  const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({})
  const [winningPatterns,setWinningPatterns]=useState<Record<string,number>>({})
  useEffect(()=>{
    let cancelled=false
    setSource(preset);setBusy(false);setError('');setMessage('');setConfirmed({});setReviewNotes({})
    if(cloud){
      setItems([])
      void readRemoteTriggerReviewsG43(workspaceId,prospect.id).then(rows=>{
        if(!cancelled)setItems(rows)
      }).catch(err=>{if(!cancelled)setError(err instanceof Error?err.message:'Erro de sincronização G4.3')})
    }
    try{
      if(!cloud)setItems(readTriggerReviewsG4(workspaceId,window.localStorage).filter(x=>x.prospectId===prospect.id))
      const won=readWonSales(workspaceId,window.localStorage)
      const confirmed=won.filter(x=>x.evidence!=='hypothesis')
      setWinningPatterns(confirmed.reduce<Record<string,number>>((result,x)=>{
        result[x.category]=(result[x.category]||0)+1;return result
      },{}))
    }catch{setItems([]);setWinningPatterns({})}
    return ()=>{cancelled=true}
  },[workspaceId,prospect.id,preset,cloud])
  const refresh=async()=>{
    if(cloud){
      const records=await readRemoteTriggerReviewsG43(workspaceId,prospect.id)
      setItems(records)
      return
    }
    try{setItems(readTriggerReviewsG4(workspaceId,window.localStorage).filter(x=>x.prospectId===prospect.id))}
    catch{setItems([])}
  }
  async function analyze(){
    if(readOnly||busy)return
    if(!sourceUrl(source.sourceUrl)||source.excerpt.trim().length<35){
      setError('Informe a URL HTTPS e um trecho real da página (mínimo de 35 caracteres).')
      return
    }
    setBusy(true);setError('');setMessage('')
    const ctrl=new AbortController()
    const timeout=setTimeout(()=>ctrl.abort(),68000)
    try{
      // Source text and company context only. No contacts, emails, phones, notes or CRM secrets.
      const response=await runtimeFetch(env.agentGatewayUrl+'/tools/trigger-events',{
        method:'POST',signal:ctrl.signal,headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          company:source.company,city:source.city,sector:source.sector,
          sourceUrl:source.sourceUrl,excerpt:source.excerpt,
        })
      })
      if(!response.ok)throw Error(response.status===429?'Ollama ocupado; tente novamente.':
        response.status===400?'A fonte ou o trecho são inválidos.':
        'O Qwen local não respondeu. Verifique o Agent e o Ollama.')
      const data=await response.json() as G4Response
      if(!data.ok||!Array.isArray(data.events))throw Error('Resposta incompleta do classificador.')
      const added=cloud
        ?await appendRemoteTriggersG43(workspaceId,prospect,data.events,source)
        :appendTriggerCandidatesG4(workspaceId,prospect,data.events,source,window.localStorage)
      await refresh()
      setMessage(added.length
        ?added.length+' sinal(is) preparado(s) para a conferência humana. Nenhum foi enviado automaticamente ao Pipeline.'
        :data.events.length
          ?'Os sinais retornados não passaram na validação de citação ou já foram cadastrados.'
          :'Nenhum evento-gatilho explícito foi identificado nesse trecho. O sistema não criou hipóteses artificiais.')
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível analisar a fonte.')
    }finally{clearTimeout(timeout);setBusy(false)}
  }
  async function review(row:TriggerReviewRecordG4,decision:'approved'|'rejected'){
    if(readOnly||busy)return
    setBusy(true);setError('')
    try{
      if(cloud)await reviewRemoteTriggerG43(workspaceId,prospect.id,row.id,decision,
        Boolean(confirmed[row.id]),reviewNotes[row.id]||'')
      else reviewTriggerG4(workspaceId,prospect.id,row.id,decision,
        Boolean(confirmed[row.id]),reviewNotes[row.id]||'',window.localStorage)
      await refresh()
      setMessage(decision==='approved'
        ?'Sinal revisado e aprovado. Só será mostrado no Pipeline se existir vínculo confirmado com uma oportunidade.'
        :'Sinal rejeitado e decisão registrada.')
    }catch(e){setError(e instanceof Error?e.message:'Falha ao revisar o sinal.')}
    finally{setBusy(false)}
  }
  async function linkToDeal(){
    const leadId=prospect.rawData?.crmLeadId
    if(!cloud||readOnly||busy||typeof leadId!=='string')return
    setBusy(true);setError('')
    try{
      const count=await linkRemoteTriggerLeadG43(workspaceId,prospect.id,leadId)
      await refresh()
      setMessage(count?'Sinais associados à oportunidade confirmada do Garimpo.':'Nenhum sinal pendente de vínculo com essa oportunidade.')
    }catch(e){setError(e instanceof Error?e.message:'Vínculo com o Pipeline não permitido.')}
    finally{setBusy(false)}
  }
  return <section className="prospecting-trigger-g4" aria-label="Eventos-gatilho e evidências">
    <header className="prospecting-trigger-g4__head">
      <div><span><Sparkles size={15}/> G4 · Trigger Intelligence</span>
        <h3>Eventos-gatilho da empresa</h3>
        <p>Classifique acontecimentos reais, separe necessidades hipotéticas e aprove somente após conferir a fonte.</p></div>
      <span className="prospecting-trigger-g4__count">{items.filter(x=>x.reviewStatus==='approved').length} aprovado(s) · {cloud?'Supabase':'Local'}</span>
    </header>
    <div className="prospecting-trigger-g4__notice"><ShieldCheck size={17}/>
      <span>A IA identifica citações no trecho fornecido. <strong>Ela não verifica a página original, a identidade da empresa nem interesse em comprar.</strong></span>
    </div>
    <div className="prospecting-trigger-g4__source">
      <label>URL da fonte pública
        <input type="url" value={source.sourceUrl} disabled={busy}
          placeholder="https://site-oficial.exemplo/noticia"
          onChange={e=>setSource(old=>({...old,sourceUrl:e.target.value}))}/>
      </label>
      <label>Trecho publicado sobre o acontecimento
        <textarea rows={3} maxLength={5400} disabled={busy}
          placeholder="Cole aqui um trecho da página original. Descrições genéricas não devem ser tratadas como eventos."
          value={source.excerpt} onChange={e=>setSource(old=>({...old,excerpt:e.target.value}))}/>
      </label>
      <div className="prospecting-trigger-g4__controls">
        {sourceUrl(source.sourceUrl)?<a href={sourceUrl(source.sourceUrl)} target="_blank" rel="noopener noreferrer">
          Abrir fonte original <ExternalLink size={13}/></a>:null}
        <button type="button" disabled={busy||readOnly||!sourceUrl(source.sourceUrl)||source.excerpt.trim().length<35}
          onClick={()=>void analyze()}>{busy?<LoaderCircle className="is-loading" size={15}/>:<SearchCheck size={15}/>}
          {busy?'Analisando com Ollama...':'Analisar com Qwen local'}</button>
      </div>
      {!source.excerpt&&!items.length?<small>Nenhum trecho de origem foi encontrado automaticamente neste registro. Abra uma página pública e cole a passagem relevante para investigar.</small>:null}
    </div>
    {cloud&&typeof prospect.rawData?.crmLeadId==='string'&&items.some(row=>!row.crmLeadId)&&!readOnly?
      <button type="button" disabled={busy} onClick={()=>void linkToDeal()} className="prospecting-trigger-g4__cloud-link">
        Associar sinais à oportunidade vinculada ao Garimpo
      </button>:null}
    {error?<p className="prospecting-trigger-g4__error" role="alert">{error}</p>:null}
    {message?<p className="prospecting-trigger-g4__message" role="status">{message}</p>:null}
    {items.length?<div className="prospecting-trigger-g4__list">
      <h4><ClipboardCheck size={15}/> Histórico de revisão · {items.length} sinal(is)</h4>
      {items.map(row=><article key={row.id} className={'prospecting-trigger-g4__card is-'+row.reviewStatus}>
        <div className="prospecting-trigger-g4__cardtop"><span>{triggerLabelsG4[row.category]}</span>
          <b>{row.reviewStatus==='approved'?'Conferido':row.reviewStatus==='rejected'?'Rejeitado':'Aguardando revisão'}</b></div>
        <h5>{row.event}</h5>
        <blockquote>“{row.quote}”</blockquote>
        <div className="prospecting-trigger-g4__facts">
          {row.dateQuote?<span>Data citada na fonte: {row.dateQuote}</span>:<span>Data do evento: não identificada</span>}
          <span>Citação localizada no trecho fornecido · verificação externa pendente</span>
          {winningPatterns[row.category]?<span>Histórico local: {winningPatterns[row.category]} venda(s) ganhas documentadas nesta categoria</span>:null}
        </div>
        <p><strong>Possível necessidade (hipótese):</strong> {row.hypothesis}</p>
        <p><strong>Motivo para investigar:</strong> {row.rationale}</p>
        <p><strong>Pergunta consultiva:</strong> {row.suggestedQuestion}</p>
        <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">Conferir URL original <ArrowUpRight size={13}/></a>
        {row.reviewStatus==='needs_review'&&!readOnly?<div className="prospecting-trigger-g4__review">
          <label className="prospecting-trigger-g4__checkbox"><input type="checkbox"
            checked={Boolean(confirmed[row.id])}
            onChange={e=>setConfirmed(old=>({...old,[row.id]:e.target.checked}))}/>
            Conferi a publicação, o trecho e a empresa correspondente.</label>
          <label>Observação da revisão (obrigatória para rejeitar)
            <input maxLength={450} value={reviewNotes[row.id]||''} placeholder="Ex.: comunicado publicado no site institucional"
              onChange={e=>setReviewNotes(old=>({...old,[row.id]:e.target.value}))}/>
          </label>
          <div><button type="button" className="is-reject" disabled={busy} onClick={()=>void review(row,'rejected')}>Rejeitar</button>
            <button type="button" className="is-approve" disabled={busy||!confirmed[row.id]} onClick={()=>void review(row,'approved')}>
              <CheckCircle2 size={14}/> Aprovar sinal</button></div>
        </div>:row.reviewStatus==='approved'?<small><CheckCircle2 size={13}/> Fonte conferida pelo revisor · {row.reviewedAt?.slice(0,10)}</small>:
          <small><AlertTriangle size={13}/> Rejeitado: {row.reviewerNote}</small>}
      </article>)}
    </div>:<div className="prospecting-trigger-g4__empty"><BookOpen size={17}/> Nenhum sinal classificado nesta empresa.</div>}
    <footer>{cloud
      ?'G4.3 usa Supabase com políticas de workspace e histórico de decisões. Registros antigos do navegador não são importados nem aprovados automaticamente.'
      :'Prévia local: rascunhos e decisões G4 ficam neste navegador. Para sincronizar entre usuários, a migração G4.3 precisa estar validada no Supabase.'}
      Nenhum sinal cria oportunidade, envia mensagens ou altera o estado do Pipeline automaticamente.</footer>
  </section>
}
