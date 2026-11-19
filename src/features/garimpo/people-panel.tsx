import { plural } from '../../domain/formatters'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ExternalLink, Plus, Search, Trash2, Users } from 'lucide-react'
import { createUuid } from '../../lib/id'
import type { ProspectRecord } from '../../services/prospecting-workspace'
import { hostedGarimpo, type QsaResponse } from './hosted-client'
import { publicUrl } from './review'

export type PersonFunction = 'decisor' | 'diretor' | 'administrador' | 'outro'
export interface KeyPerson {
  id: string
  name: string
  position: string
  function: PersonFunction
  sourceUrl: string
  recordedAt: string
  verification: 'informada_pelo_usuario'
}
type Props = {
  record: ProspectRecord
  workspaceId: string
  canEdit: boolean
  onPatch: (patch: Partial<ProspectRecord>) => void
}

const functions: Record<PersonFunction,string> = {
  decisor: 'Responsável pela contratação', diretor: 'Direção',
  administrador: 'Administração', outro: 'Outro papel profissional',
}
export function savedPeople(record: ProspectRecord): KeyPerson[] {
  const data = record.rawData?.keyPeople
  return Array.isArray(data) ? data.filter((item): item is KeyPerson =>
    Boolean(item && typeof item.id === 'string' && typeof item.name === 'string'
      && typeof item.position === 'string' && typeof item.sourceUrl === 'string'
      && Boolean(publicUrl(item.sourceUrl))
      && ['decisor','diretor','administrador','outro'].includes(item.function))).slice(0,30) : []
}

export function PeoplePanel({record,workspaceId,canEdit,onPatch}: Props) {
  const [qsa,setQsa] = useState<QsaResponse | null>(null)
  const [loading,setLoading] = useState(false)
  const [expanded,setExpanded] = useState(false)
  const request = useRef<AbortController | null>(null)
  const [error,setError] = useState('')
  const [name,setName] = useState('')
  const [position,setPosition] = useState('')
  const [functionRole,setFunctionRole] = useState<PersonFunction>('decisor')
  const [sourceUrl,setSourceUrl] = useState('')
  const [addError,setAddError] = useState('')
  const people = savedPeople(record)
  const linkedIdentity = record.rawData.identityMatch as {matchedAt?:string;method?:string}|undefined
  const identityAt = linkedIdentity?.method !== 'user_supplied' ? linkedIdentity?.matchedAt : undefined

  useEffect(() => {
    request.current?.abort()
    setQsa(null);setError('');setLoading(false);setAddError('')
    setExpanded(people.length > 0)
    return () => request.current?.abort()
  }, [workspaceId,record.cnpj,record.id])

  // A CNPJ selected from search now unlocks one automatic QSA consultation.
  // No QSA data is fabricated if the registry snapshot has not been loaded.
  useEffect(() => {
    if (!record.cnpj || !identityAt || !workspaceId || !canEdit) return
    const next = new AbortController()
    request.current?.abort();request.current=next
    setLoading(true);setError('')
    void hostedGarimpo.qsa(workspaceId,record.cnpj,next.signal)
      .then(data=>{if (!next.signal.aborted) {setQsa(data);setExpanded(data.people.length>0)}})
      .catch(cause=>{if (!next.signal.aborted) {
        setError(cause instanceof Error?cause.message:'O QSA não respondeu à consulta.')
        setExpanded(true)
      }})
      .finally(()=>{if (request.current===next) setLoading(false)})
    return ()=>next.abort()
  }, [workspaceId,record.id,record.cnpj,identityAt,canEdit])

  async function consult() {
    if (loading || !record.cnpj || !workspaceId) return
    request.current?.abort()
    const controller = new AbortController()
    request.current=controller
    setLoading(true);setError('')
    try {
      const result = await hostedGarimpo.qsa(workspaceId,record.cnpj,controller.signal)
      if (!controller.signal.aborted) {setQsa(result);setExpanded(true)}
    } catch (cause) {
      if (!controller.signal.aborted) {
        setQsa(null)
        setError(cause instanceof Error ? cause.message : 'Não foi possível consultar a Receita.')
      }
    } finally {
      if (request.current===controller) setLoading(false)
    }
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEdit) return
    if (people.length >= 30) {setAddError('Limite de 30 pessoas-chave nesta ficha.');return}
    const url=publicUrl(sourceUrl.trim())
    if (!name.trim() || !position.trim() || !url || name.length>160 || position.length>120) {
      setAddError('Informe nome, cargo e o endereço público da fonte institucional.')
      return
    }
    const next: KeyPerson={id:createUuid(),name:name.trim(),position:position.trim(),
      function:functionRole,sourceUrl:url,recordedAt:new Date().toISOString(),
      verification:'informada_pelo_usuario'}
    onPatch({rawData:{...record.rawData,keyPeople:[...people,next]}})
    setName('');setPosition('');setSourceUrl('');setAddError('')
  }

  function remove(id:string) {
    if (!canEdit) return
    onPatch({rawData:{...record.rawData,keyPeople:people.filter(item=>item.id!==id)}})
  }

  return <details className="gh-people" open={expanded}
      onToggle={event=>setExpanded(event.currentTarget.open)}
      aria-label={'Pessoas-chave de '+record.company}>
    <summary className="gh-people-heading"><div><span className="gh-eyebrow">INTELIGÊNCIA SOCIETÁRIA</span>
      <h3><Users size={16}/> Sócios e pessoas-chave</h3>
      <p>{!record.cnpj?'CNPJ não identificado — use Investigar empresa acima.'
        :loading?'Consultando o quadro societário…'
        :qsa?`${qsa.people.length} ${plural(qsa.people.length, 'vínculo', 'vínculos')} ${plural(qsa.people.length, 'societário', 'societários')} no recorte · ${people.length} ${plural(people.length, 'pessoa', 'pessoas')}-chave manual(is)`
        :`CNPJ disponível · ${people.length} ${plural(people.length, 'pessoa', 'pessoas')}-chave manual(is)`}</p>
    </div><span className="gh-people-summary-action">Detalhes ▾</span></summary>
    <div className="gh-people-content">
      <div className="gh-people-actions"><p className="gh-help">O QSA identifica vínculos societários, não necessariamente quem decide uma contratação.</p>
        {record.cnpj&&<button className="gh-secondary" type="button"
          disabled={!workspaceId||loading||!canEdit} onClick={()=>void consult()}>
          <Search size={14}/>{loading?'Consultando…':'Consultar novamente o QSA'}</button>}
      </div>
    {!record.cnpj && <p className="gh-help">Informe ou identifique um CNPJ para consultar os vínculos societários disponíveis.</p>}
    {error && <p className="gh-index-error" role="alert">{error}</p>}
    {qsa && <div className="gh-people-qsa">
      <div className="gh-people-section-title"><h4>Quadro de sócios e administradores (QSA)</h4>
        <span>{qsa.people.length} {plural(qsa.people.length, 'vínculo', 'vínculos')} neste recorte{qsa.truncated?' · lista limitada':''}</span></div>
      {qsa.people.length ? <ul>{qsa.people.map((person,index)=><li key={person.partner_name+person.role_code+index}>
        <strong>{person.partner_name}</strong>
        <span>{person.role_label} · {person.partner_type}</span>
        <small>{person.joined_on?'Ingresso: '+person.joined_on+' · ':''}{qsa.source}, {person.source_month?'competência '+person.source_month.slice(0,7):'competência não informada'}</small>
        {publicUrl(person.source_url) && <a href={publicUrl(person.source_url)!} target="_blank" rel="noopener noreferrer">Ver origem do conjunto <ExternalLink size={12}/></a>}
      </li>)}</ul>:<p className="gh-help">Nenhum integrante retornado pela fonte consultada. Isso não comprova ausência de sócios.</p>}
      {qsa.note&&<p className="gh-help">{qsa.note}</p>}
      <p className="gh-help">Não são exibidos CPF, idade, dados privados ou contatos pessoais. Um sócio não é automaticamente um decisor comercial.</p>
    </div>}
    <div className="gh-people-manual"><h4>Decisores e responsáveis profissionais</h4>
      <p className="gh-help">Cadastre somente nomes e cargos pertinentes divulgados por fonte institucional. O vínculo é informado manualmente e não recebe selo automático de verificação.</p>
      {people.length ? <ul>{people.map(person=><li key={person.id}>
        <div><strong>{person.name}</strong><span>{person.position} · {functions[person.function]}</span>
          <small>Fonte informada pelo usuário em {new Date(person.recordedAt).toLocaleDateString('pt-BR')}</small>
          <a href={publicUrl(person.sourceUrl)!} target="_blank" rel="noopener noreferrer">Conferir fonte <ExternalLink size={12}/></a></div>
        {canEdit&&<button className="gh-icon" type="button" aria-label={'Excluir pessoa-chave '+person.name} onClick={()=>remove(person.id)}><Trash2 size={14}/></button>}
      </li>)}</ul>:<p className="gh-help">Nenhum decisor profissional foi cadastrado. Não inferimos nomes a partir do QSA.</p>}
      {canEdit&&<details className="gh-people-add"><summary><Plus size={14}/> Adicionar pessoa-chave</summary>
      <form className="gh-people-form" onSubmit={add}>
        <label>Nome público<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="Nome conforme fonte institucional"/></label>
        <label>Cargo publicado<input required maxLength={120} value={position} onChange={e=>setPosition(e.target.value)} placeholder="Ex.: diretor administrativo"/></label>
        <label>Função na abordagem<select value={functionRole} onChange={e=>setFunctionRole(e.target.value as PersonFunction)}>
          {Object.entries(functions).map(([key,value])=><option key={key} value={key}>{value}</option>)}
        </select></label>
        <label>Fonte institucional pública<input type="url" required maxLength={500} value={sourceUrl}
          onChange={e=>setSourceUrl(e.target.value)} placeholder="https://site-da-empresa/..."/></label>
        <button className="gh-secondary" type="submit"><Plus size={14}/>Adicionar pessoa-chave</button>
        {addError&&<span role="alert" className="gh-index-error">{addError}</span>}
      </form></details>}
    </div>
    </div>
  </details>
}
