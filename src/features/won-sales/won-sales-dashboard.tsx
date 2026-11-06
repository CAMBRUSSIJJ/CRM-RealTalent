import {useEffect,useMemo,useState} from 'react'
import {BookOpen,CalendarDays,CheckCircle2,ClipboardList,Download,ExternalLink,Lightbulb,Plus,Search,ShieldCheck,TrendingUp,TriangleAlert,X} from 'lucide-react'
import type {Lead} from '../../domain/types'
import {Modal} from '../../components/ui/modal'
import {Button} from '../../components/ui/button'
import {
  analyzeWonSales,EVIDENCE_LABELS,listenWonSales,readWonSales,removeWonSale,TRIGGER_CATEGORIES,
  TRIGGER_SUGGESTIONS,upsertWonSale,type WonSalesInput,type WonSalesRecord,type WonTriggerCategory,
} from '../../services/won-sales-analysis'
import './won-sales-analysis.css'

const emptyInput=():WonSalesInput=>({
  category:'transition',trigger:'',happenedAt:'',discoveredAt:'',whyUs:'',
  previousAlternative:'',evidence:'customer_statement',evidenceNote:'',evidenceUrl:''
})
const escapeCsv=(value:unknown)=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,'\u0027$&').replace(/"/g,'""')+'"'
const number=(value:number)=>new Intl.NumberFormat('pt-BR').format(value)
const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value)
const validDate=(raw:string)=>raw&&Number.isFinite(Date.parse(raw))?new Date(raw).toLocaleDateString('pt-BR'):'Não informada'

interface EditProps{
  workspaceId:string
  lead:Lead|null
  record:WonSalesRecord|null
  canEdit:boolean
  onClose():void
  onSaved():void
}
export function WonSalesEditor({workspaceId,lead,record,canEdit,onClose,onSaved}:EditProps){
  const [form,setForm]=useState<WonSalesInput>(()=>record||emptyInput())
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    setForm(record?{...record}:emptyInput())
    setError('')
  },[lead?.id,record?.updatedAt])
  const change=(patch:Partial<WonSalesInput>)=>setForm(current=>({...current,...patch}))
  async function save(){
    if(!lead||!canEdit||saving)return
    setSaving(true);setError('')
    try{
      upsertWonSale(workspaceId,lead,form,window.localStorage)
      onSaved();onClose()
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível registrar a análise.')}
    finally{setSaving(false)}
  }
  return <Modal open={Boolean(lead)} size="lg" title={record?'Editar análise da venda ganha':'Analisar venda ganha'}
    subtitle={lead?`${lead.company||lead.name} · Evidências do momento da compra`:''} onClose={onClose}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
      <Button onClick={()=>void save()} disabled={!canEdit||saving||lead?.status!=='won'} loading={saving}>
        <CheckCircle2 size={15}/> Salvar análise
      </Button>
    </>}>
    {lead?<form className="won-sales__form" onSubmit={event=>{event.preventDefault();void save()}}>
      <p className="won-sales__notice">
        Registre o que realmente aconteceu antes da compra, com origem verificável.
        Uma coincidência entre gatilho e venda não comprova causalidade.
      </p>
      {lead.status!=='won'?<p role="status" className="won-sales__warning">
        A oportunidade ainda não está sincronizada como ganha. Aguarde a atualização do Pipeline para registrar o evento.
      </p>:null}
      <div className="won-sales__form-grid">
        <label>Categoria do acontecimento
          <select value={form.category} onChange={e=>change({category:e.target.value as WonTriggerCategory,trigger:''})}>
            {Object.entries(TRIGGER_CATEGORIES).map(([id,label])=><option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label>Acontecimento observado
          <input required maxLength={130} list="won-sales-suggestions" value={form.trigger}
            placeholder="Ex.: Mudança de direção" onChange={e=>change({trigger:e.target.value})}/>
          <datalist id="won-sales-suggestions">{TRIGGER_SUGGESTIONS[form.category].map(item=><option value={item} key={item}/>)}</datalist>
        </label>
        <label>Quando ocorreu?
          <input required type="date" max={new Date().toISOString().slice(0,10)} value={form.happenedAt}
            onChange={e=>change({happenedAt:e.target.value})}/>
        </label>
        <label>Quando soubemos do acontecimento? <small>(opcional)</small>
          <input type="date" value={form.discoveredAt} onChange={e=>change({discoveredAt:e.target.value})}/>
        </label>
        <label className="is-wide">Por que o comprador escolheu nossa solução?
          <textarea required maxLength={700} rows={2} value={form.whyUs}
            placeholder="Registre o motivo informado pelo cliente, sem inventar explicações."
            onChange={e=>change({whyUs:e.target.value})}/>
        </label>
        <label className="is-wide">O que ele usava ou considerava antes? <small>(opcional)</small>
          <input maxLength={420} value={form.previousAlternative}
            placeholder="Fornecedor anterior, equipe interna, ausência de solução..."
            onChange={e=>change({previousAlternative:e.target.value})}/>
        </label>
        <label>Origem da evidência
          <select value={form.evidence} onChange={e=>change({evidence:e.target.value as WonSalesInput['evidence']})}>
            {Object.entries(EVIDENCE_LABELS).map(([id,label])=><option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label>Link HTTPS da fonte <small>{form.evidence==='public_source'?'(obrigatório)':'(opcional)'}</small>
          <input type="url" maxLength={380} value={form.evidenceUrl} placeholder="https://..."
            onChange={e=>change({evidenceUrl:e.target.value})}/>
        </label>
        <label className="is-wide">O que comprova ou indica o gatilho?
          <textarea required maxLength={900} rows={2} value={form.evidenceNote}
            placeholder="Ex.: Cliente relatou a mudança durante a reunião de descoberta."
            onChange={e=>change({evidenceNote:e.target.value})}/>
        </label>
      </div>
      {form.evidence==='hypothesis'?<p className="won-sales__warning">
        Hipóteses serão contadas separadamente; não entram na receita documentada ou nas médias de prazo.
      </p>:null}
      <p className="won-sales__notice">Prévia: o registro fica apenas neste navegador e neste workspace.
        Não é enviado automaticamente ao Garimpo nem à IA.</p>
      {error?<p role="alert" className="won-sales__warning">{error}</p>:null}
    </form>:null}
  </Modal>
}

interface DashboardProps{
  workspaceId:string
  leads:Lead[]
  closedWonDates?:Record<string,string>
  canEdit?:boolean
  onOpenLead?:(lead:Lead)=>void
  heading?:string
  compact?:boolean
}
export function WonSalesDashboard({
  workspaceId,leads,closedWonDates={},canEdit=false,onOpenLead,heading='Análise de Vendas Ganhas',
  compact=false
}:DashboardProps){
  const [records,setRecords]=useState<WonSalesRecord[]>([])
  const [chosen,setChosen]=useState<string|null>(null)
  const [query,setQuery]=useState('')
  const [error,setError]=useState('')
  const refresh=()=>{
    try{setRecords(readWonSales(workspaceId,window.localStorage))}
    catch{setRecords([])}
  }
  useEffect(()=>{
    refresh()
    return listenWonSales(workspaceId,refresh)
  },[workspaceId])
  const won=useMemo(()=>leads.filter(lead=>lead.status==='won'),[leads])
  const byId=useMemo(()=>new Map(won.map(lead=>[lead.id,lead])),[won])
  const analysis=useMemo(()=>analyzeWonSales(won,records,closedWonDates),[won,records,closedWonDates])
  const documentedIds=new Set(records.filter(item=>byId.has(item.leadId)).map(item=>item.leadId))
  const visible=won.filter(lead=>{
    if(!query.trim())return true
    const q=query.trim().toLocaleLowerCase('pt-BR')
    const record=records.find(item=>item.leadId===lead.id)
    return [lead.name,lead.company,record?.trigger].some(value=>value?.toLocaleLowerCase('pt-BR').includes(q))
  })
  const chosenLead=chosen?byId.get(chosen)||null:null
  const chosenRecord=chosen?records.find(item=>item.leadId===chosen)||null:null
  function exportCsv(){
    const headers=['Oportunidade','Empresa','Categoria','Gatilho','Data do evento','Motivo da escolha','Fonte','Descrição da evidência']
    const rows=records.filter(item=>byId.has(item.leadId)).map(item=>[
      byId.get(item.leadId)?.name,byId.get(item.leadId)?.company,TRIGGER_CATEGORIES[item.category],
      item.trigger,item.happenedAt,item.whyUs,EVIDENCE_LABELS[item.evidence],item.evidenceNote
    ])
    const csv='\uFEFF'+[headers,...rows].map(row=>row.map(escapeCsv).join(';')).join('\r\n')
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}))
    const a=document.createElement('a');a.href=url;a.download='realtalent-vendas-ganhas-'+new Date().toISOString().slice(0,10)+'.csv';a.click()
    setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  function remove(record:WonSalesRecord){
    if(!canEdit||!window.confirm('Excluir o registro de evento-gatilho desta venda? A venda continuará no Pipeline.'))return
    try{removeWonSale(workspaceId,record.leadId,window.localStorage);refresh()}
    catch(e){setError(e instanceof Error?e.message:'Falha ao excluir a análise.')}
  }
  return <section className={'won-sales '+(compact?'won-sales--compact':'')} aria-label="Análise de Vendas Ganhas">
    <header className="won-sales__header">
      <div><span className="won-sales__eyebrow"><TrendingUp size={15}/> Inteligência comercial</span>
        <h2>{heading}</h2><p>Descubra acontecimentos comuns às vendas conquistadas, com base nas evidências cadastradas.</p></div>
      <button type="button" className="won-sales__export" onClick={exportCsv} disabled={!analysis.documented}>
        <Download size={15}/> Exportar registros
      </button>
    </header>
    <p className="won-sales__notice"><ShieldCheck size={15}/> Esta é uma análise descritiva de vendas ganhas.
      Frequência não representa probabilidade de compra, e gatilhos não devem ser atribuídos automaticamente a outras empresas.</p>
    <div className="won-sales__kpis">
      <article><span>Vendas ganhas</span><strong>{number(analysis.wonCount)}</strong></article>
      <article><span>Gatilhos registrados</span><strong>{number(analysis.documented)}</strong></article>
      <article><span>Com evidência</span><strong>{number(analysis.confirmed)}</strong></article>
      <article><span>Hipóteses</span><strong>{number(analysis.hypotheses)}</strong></article>
    </div>
    <div className="won-sales__sections">
      <section className="won-sales__patterns">
        <div className="won-sales__section-head"><h3>Padrões observados</h3><small>{analysis.patterns.length} acontecimento(s) distintos</small></div>
        {analysis.patterns.length?<div className="won-sales__pattern-list">{analysis.patterns.map(pattern=><article key={pattern.category+pattern.trigger}>
          <div><strong>{pattern.trigger}</strong><small>{TRIGGER_CATEGORIES[pattern.category]}</small></div>
          <span>{pattern.evidenceCount} evidenciada(s) · {pattern.hypothesisCount} hipótese(s)</span>
          <div className="won-sales__pattern-bar"><i style={{width:(pattern.count/Math.max(1,analysis.documented))*100+'%'}}/></div>
          <small>Receita das vendas documentadas: {money(pattern.revenue)} ·
            {pattern.averageLagDays===null?' intervalo até a compra não confirmado':` intervalo médio: ${pattern.averageLagDays} dia(s)`}</small>
        </article>)}</div>:<div className="won-sales__empty"><Lightbulb size={23}/>
          <strong>Ainda não há acontecimentos documentados</strong>
          <p>Registre os eventos que precederam vendas reais para começar a identificar padrões.</p></div>}
      </section>
      <section className="won-sales__wins">
        <div className="won-sales__section-head"><h3>Vendas conquistadas</h3><small>{analysis.unrecorded} sem análise</small></div>
        <label className="won-sales__search"><Search size={15}/><input placeholder="Buscar venda ou gatilho..."
          value={query} onChange={e=>setQuery(e.target.value)} aria-label="Buscar vendas ganhas"/></label>
        <div className="won-sales__win-list">
          {visible.map(lead=>{
            const record=records.find(item=>item.leadId===lead.id)
            return <article key={lead.id}>
              <div><strong>{lead.company||lead.name}</strong><small>{record?record.trigger:'Evento-gatilho ainda não registrado'}</small>
                {record?<small>{validDate(record.happenedAt)} · {EVIDENCE_LABELS[record.evidence]}</small>:null}</div>
              <div className="won-sales__win-actions">
                {onOpenLead?<button type="button" onClick={()=>onOpenLead(lead)} title="Abrir oportunidade">
                  <ExternalLink size={14}/></button>:null}
                {canEdit?<button type="button" onClick={()=>setChosen(lead.id)}><ClipboardList size={14}/>
                  {record?'Editar':'Analisar'}</button>:null}
                {record&&canEdit?<button type="button" title="Excluir análise" onClick={()=>remove(record)}><X size={14}/></button>:null}
              </div>
            </article>
          })}
          {!visible.length?<p className="won-sales__empty-inline">{won.length?'Nenhuma venda corresponde à pesquisa.':'Ainda não há vendas marcadas como ganhas no Pipeline.'}</p>:null}
        </div>
      </section>
    </div>
    <footer className="won-sales__footer">
      <BookOpen size={15}/>
      <span>{analysis.limitation} Dados armazenados neste navegador, separados por workspace.</span>
    </footer>
    {error?<p role="alert" className="won-sales__warning">{error}</p>:null}
    {chosenLead?<WonSalesEditor workspaceId={workspaceId} lead={chosenLead} record={chosenRecord}
      canEdit={canEdit} onClose={()=>setChosen(null)} onSaved={refresh}/>:null}
  </section>
}
