import { useMemo, useState } from 'react'
import { ArrowRight, Download, ExternalLink, Search, X } from 'lucide-react'
import type { ProspectingAgentJob } from '../../services/prospecting-linux-agent'
import type { ProspectRecord } from '../../services/prospecting-workspace'

export type ProspectingInspectorMode = 'found' | 'ready' | 'attention' | 'raw' | 'filtered' | 'duplicates' | 'base' | 'sent'
const choices: Array<[ProspectingInspectorMode,string]> = [['found','Empresas'],['attention','Precisam atenção'],['ready','Prontas'],['raw','Dados brutos'],['filtered','Filtrados'],['duplicates','Duplicidades'],['base','Base total'],['sent','No CRM']]
const text = (v: unknown) => typeof v === 'string' ? v.trim() : ''
const safe = (v: string) => { try { const u = new URL(v); return ['http:','https:'].includes(u.protocol) ? u.href : '' } catch { return '' } }
type Entry = { id: string; name: string; address: string; city: string; phone: string; email: string; website: string; instagram: string; cnpj: string; url: string; provider: string; status: string; reason: string; evidence: Array<{field?: string; value?: string; source?: string}> }
function entry(value: unknown, n: number): Entry {
  const v = (value || {}) as Record<string, unknown>
  const raw = (v.rawData && typeof v.rawData === 'object' ? v.rawData : {}) as Record<string,unknown>
  return {id:text(v.candidateId)||text(v.id)||String(n),name:text(v.company)||text(v.name)||'Registro sem nome',
    address:text(v.address),city:text(v.city),phone:text(v.phone),email:text(v.email),website:text(v.website),instagram:text(v.instagram),cnpj:text(v.cnpj),
    url:text(v.url)||text(v.sourceUrl)||text(raw.sourceUrl)||text(v.website),provider:text(v.provider)||text(raw.provider)||text(v.sourceDetail)||text(v.source)||'Origem não registrada',
    status:text(v.qualityStatus)||text(v.status)||text(v.type)||'Pendente',reason:text(v.reason),
    evidence:Array.isArray(v.evidence)?v.evidence.filter(x=>x&&typeof x==='object') as Entry['evidence']:[]}
}
function exportCsv(rows: Entry[], mode: string) {
  const keys: Array<keyof Entry> = ['name','address','city','phone','email','website','instagram','cnpj','provider','status','reason','url']
  const escaped = (v: string) => '"' + (/^[=+\-@\t\r]/.test(v)?"'"+v:v).replace(/"/g,'""') + '"'
  const csv = '\uFEFF'+[keys.join(';'),...rows.map(row=>keys.map(k=>escaped(String(row[k]||''))).join(';'))].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}))
  const a=document.createElement('a'); a.href=url; a.download='garimpo-'+mode+'.csv'; a.click()
  window.setTimeout(()=>URL.revokeObjectURL(url),500)
}
export function ProspectingEvidenceExplorer({job,prospects,mode,onMode,onClose,onReview}:{job:ProspectingAgentJob|null;prospects:ProspectRecord[];mode:ProspectingInspectorMode;onMode:(m:ProspectingInspectorMode)=>void;onClose:()=>void;onReview:()=>void}) {
  const [query,setQuery]=useState('')
  const rows=useMemo(()=>{
    const candidates=(job?.results||[]).map(entry)
    const stored=prospects.map(entry)
    const logs=(job?.sourceLog||[]).map(entry)
    switch(mode) {
      case 'found':return candidates
      case 'ready':return candidates.filter(v=>v.status==='ready')
      case 'attention':return candidates.filter(v=>v.status!=='ready')
      case 'base':return stored
      case 'sent':return stored.filter(v=>v.status==='sent')
      case 'raw':return logs.filter(v=>v.status==='raw'||v.status==='candidate')
      case 'duplicates':return logs.filter(v=>v.status==='duplicate')
      case 'filtered':return [...(job?.rejections||[]).map(entry),...logs.filter(v=>v.status==='rejected')].filter((v,i,a)=>a.findIndex(w=>w.name===v.name&&w.reason===v.reason&&w.url===v.url)===i)
    }
  },[job,prospects,mode])
  const shown=useMemo(()=>!query.trim()?rows:rows.filter(row=>Object.values(row).some(v=>typeof v==='string'&&v.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')))),[rows,query])
  const count=mode==='raw'?(job?.processing?.raw??job?.stats.discovered??0):mode==='duplicates'?(job?.stats.duplicates??0):mode==='filtered'?(job?.stats.webRejectedDocuments??0)+(job?.stats.scopeRejectedCategory??0)+(job?.stats.scopeRejectedLocation??0):mode==='found'?(job?.stats.unique??0):mode==='base'?prospects.length:mode==='sent'?prospects.filter(v=>v.status==='sent').length:rows.length
  return <section id="prospecting-evidence-explorer" className="prospecting-evidence-explorer">
    <header className="prospecting-evidence-explorer__head"><div><span className="eyebrow">Dados reais e fontes · {job?.id.slice(0,8)||'Base'}</span><h2>{choices.find(c=>c[0]===mode)?.[1]}</h2><p>Consulte empresas e evidências disponíveis. Informações ausentes não são inventadas.</p></div><button type="button" aria-label="Fechar painel" onClick={onClose}><X size={18}/></button></header>
    <nav className="prospecting-evidence-explorer__tabs" aria-label="Tipos de registros">{choices.map(([key,label])=><button type="button" key={key} className={mode===key?'is-active':''} onClick={()=>{setQuery('');onMode(key)}}>{label}</button>)}</nav>
    <div className="prospecting-evidence-explorer__tools"><strong>{rows.length} registro(s) disponível(is) · {count} ocorrência(s) contabilizada(s)</strong><label><Search size={15}/><input aria-label="Buscar empresas e dados" placeholder="Buscar empresa ou contato" value={query} onChange={e=>setQuery(e.target.value)}/></label><button type="button" disabled={!shown.length} onClick={()=>exportCsv(shown,mode)}><Download size={15}/> Exportar CSV</button></div>
    {['raw','filtered','duplicates'].includes(mode)&&count>rows.length?<p className="prospecting-evidence-explorer__notice">Esta execução contou {count} ocorrências, mas só {rows.length} registros individuais estão disponíveis. Buscas antigas não armazenavam cada resultado bruto; novas buscas passam a registrar amostras de origem e duplicidade. Os números não equivalem a empresas.</p>:null}
    {shown.length?<div className="prospecting-evidence-explorer__list">{shown.map((v,i)=><article key={v.id+'-'+i} className="prospecting-evidence-explorer__item"><header><div><strong>{v.name}</strong><small>{v.provider} · {v.status==='attention'?'Requer revisão':v.status}</small></div>{safe(v.url)?<a href={safe(v.url)} rel="noopener noreferrer" target="_blank">Abrir fonte <ExternalLink size={14}/></a>:null}</header>
      <dl><div><dt>Endereço / local</dt><dd>{v.address||v.city||'Não confirmado'}</dd></div><div><dt>Telefone</dt><dd>{v.phone||'Não informado'}</dd></div><div><dt>E-mail</dt><dd>{v.email||'Não informado'}</dd></div><div><dt>Site</dt><dd>{safe(v.website)?<a href={safe(v.website)} target="_blank" rel="noopener noreferrer">{v.website}</a>:v.website||'Não informado'}</dd></div><div><dt>Instagram</dt><dd>{v.instagram||'Não informado'}</dd></div><div><dt>CNPJ</dt><dd>{v.cnpj||'Não informado'}</dd></div></dl>
      {v.reason?<p className="prospecting-evidence-explorer__reason">Motivo: {v.reason}</p>:null}
      {v.evidence.length?<details><summary>{v.evidence.length} evidência(s) coletada(s)</summary><ul>{v.evidence.slice(0,30).map((e,i)=><li key={i}><strong>{e.field||'Dado'}:</strong> {e.value||'—'} <small>{e.source||''}</small></li>)}</ul></details>:null}
    </article>)}</div>:<p className="prospecting-evidence-explorer__empty">Nenhum registro individual disponível neste filtro. {mode==='raw'||mode==='duplicates'?'As buscas antigas guardavam apenas contagens; execute uma nova busca para registrar amostras.':'Abra outra categoria ou aguarde a coleta.'}</p>}
    {['found','ready','attention'].includes(mode)?<footer><button type="button" onClick={onReview}>Abrir revisão e aprovação <ArrowRight size={16}/></button></footer>:null}
  </section>
}

