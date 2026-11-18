import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Check, ExternalLink, Search, ShieldCheck } from 'lucide-react'
import type { ProspectRecord } from '../../services/prospecting-workspace'
import { hostedGarimpo } from './hosted-client'
import { formattedCnpj, isValidCnpj, type IdentityCandidate, type IdentitySearchResponse } from './company-identity'
import { publicUrl } from './review'

type Props = {
  record: ProspectRecord
  workspaceId: string
  canEdit: boolean
  canSyncCrm: boolean
  onConfirm: (candidate: IdentityCandidate | string) => Promise<void>
  onRecheck: () => Promise<void>
}

export function IdentifyPanel({record,workspaceId,canEdit,canSyncCrm,onConfirm,onRecheck}:Props) {
  const [result,setResult]=useState<IdentitySearchResponse|null>(null)
  const [manual,setManual]=useState('')
  const [loading,setLoading]=useState(false)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const controller=useRef<AbortController|null>(null)
  const state=String(record.rawData.state || (record.rawData.engine as Record<string,unknown>|undefined)?.uf || 'RS')
  const existing=record.rawData.identityMatch as {method?:string; matchedAt?:string; detail?:string}|undefined
  const canLink=canEdit&&(record.status!=='sent'||canSyncCrm)

  useEffect(()=>{
    controller.current?.abort()
    setResult(null);setError('');setLoading(false);setSaving(false);setManual('')
    return ()=>controller.current?.abort()
  },[record.id,record.cnpj,workspaceId])

  async function investigate() {
    if (!workspaceId||!canEdit||loading||saving) return
    if (record.cnpj) {
      setLoading(true);setError('')
      try { await onRecheck() }
      catch(cause){setError(cause instanceof Error?cause.message:'Falha na revisão da empresa.')}
      finally {setLoading(false)}
      return
    }
    if (!record.company&&!record.name || !record.city || state!=='RS') {
      setError('Para identificar pelo índice RS, informe nome da empresa, município e UF RS.')
      return
    }
    controller.current?.abort()
    const next=new AbortController()
    controller.current=next
    setLoading(true);setError('');setResult(null)
    try{
      const matches=await hostedGarimpo.identify(workspaceId,{
        company:(record.company||record.name).trim(),city:record.city.trim(),
        state,address:record.address,
      },next.signal)
      if(!next.signal.aborted)setResult(matches)
    }catch(cause) {
      if(!next.signal.aborted)setError(cause instanceof Error?cause.message:'Falha na consulta ao índice empresarial.')
    }finally{if(controller.current===next)setLoading(false)}
  }

  async function confirm(candidate:IdentityCandidate|string) {
    if (saving||!canEdit) return
    setSaving(true);setError('')
    try {
      await onConfirm(candidate)
      setResult(null);setManual('')
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Não foi possível vincular o CNPJ.')
    }finally{setSaving(false)}
  }

  function manualSubmit(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    if (!isValidCnpj(manual)){
      setError('O CNPJ informado não passou na verificação dos dígitos.')
      return
    }
    void confirm(manual)
  }

  return <section className="gh-identity" aria-label={'Identificação empresarial '+record.company}>
    <div className="gh-identity-top">
      <div><span className="gh-eyebrow">IDENTIFICAÇÃO EMPRESARIAL</span>
        <h3><ShieldCheck size={15}/> Investigar empresa</h3>
        <p>Localizar o CNPJ por nome e município; confirmar a empresa antes de consultar sócios.</p>
      </div>
      <button type="button" className="gh-primary" onClick={()=>void investigate()}
        disabled={!canEdit||loading||saving||(!record.cnpj&&state!=='RS')}>
        <Search size={15}/>{loading?'Investigando…':record.cnpj?'Revisar dados':'Investigar empresa'}</button>
    </div>
    {record.cnpj&&<div className="gh-identity-linked">
      <strong>CNPJ: {formattedCnpj(record.cnpj)}</strong>
      <small>{existing?.detail || 'CNPJ disponível; confira se corresponde à filial pesquisada.'}</small>
      {record.website&&<a href={publicUrl(record.website)||undefined} target="_blank" rel="noopener noreferrer">Site informado <ExternalLink size={12}/></a>}
    </div>}
    {!record.cnpj&&<p className="gh-help">O Garimpo consultará o índice de empresas do RS. Resultados semelhantes são sugestões, não provas de identidade. Endereço e site precisam de conferência.</p>}
    {error&&<p className="gh-index-error" role="alert">{error}</p>}
    {result&&<div className="gh-identity-results" aria-live="polite">
      <h4>{result.candidates.length?result.candidates.length+' possibilidade(s) de CNPJ':'Nenhuma correspondência segura no recorte importado'}</h4>
      {result.candidates.map(item=><article key={item.cnpj} className="gh-identity-candidate">
        <div><strong>{item.trade_name||item.legal_name}</strong>
          {item.trade_name&&<span>{item.legal_name}</span>}
          <small>{formattedCnpj(item.cnpj)} · {item.city}/{item.uf} · {item.headquarters?'Matriz':'Filial'} · CNAE {item.main_cnae}</small>
          <small>{item.status==='02'?'Ativa':'Não ativa'} · Compatibilidade cadastral: {item.match_score}/100 · Fonte {item.source_month?.slice(0,7)||'não informada'}</small>
          <small>{item.reasons[0]} Município conferido; rua/número não verificados.</small>
        </div>
        <button type="button" className="gh-secondary" disabled={!canLink||saving}
          onClick={()=>void confirm(item)}><Check size={14}/>Confirmar vínculo</button>
      </article>)}
      {result.incomplete&&<p className="gh-help">A busca retornou uma primeira página parcial; podem existir outras empresas semelhantes.</p>}
      <p className="gh-help">Compare nome, município, endereço e filial antes de vincular. Uma classificação elevada não é confirmação de titularidade.</p>
    </div>}
    {!record.cnpj&&<details className="gh-identity-manual">
      <summary>Já tenho o CNPJ — informar manualmente</summary>
      <form onSubmit={manualSubmit}>
        <label>CNPJ completo
          <input inputMode="numeric" maxLength={18} value={manual} onChange={event=>setManual(event.target.value)}
            placeholder="00.000.000/0000-00" aria-label="CNPJ informado manualmente"/></label>
        <button type="submit" className="gh-secondary" disabled={!canLink||saving||!isValidCnpj(manual)}>
          <ArrowRight size={14}/>{saving?'Vinculando…':'Confirmar CNPJ informado'}
        </button>
        <p className="gh-help">O CNPJ informado passa por validação de dígitos, mas não é verificado contra o cadastro oficial até que o índice esteja disponível.</p>
      </form>
    </details>}
    {record.status==='sent'&&!record.cnpj&&!canSyncCrm&&<p className="gh-help">Este registro já está no CRM. A vinculação exige permissão para alterar o cadastro empresarial.</p>}
  </section>
}