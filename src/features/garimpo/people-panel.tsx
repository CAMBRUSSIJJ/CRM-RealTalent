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
  const request = useRef<AbortController | null>(null)
  const [error,setError] = useState('')
  const [name,setName] = useState('')
  const [position,setPosition] = useState('')
  const [functionRole,setFunctionRole] = useState<PersonFunction>('decisor')
  const [sourceUrl,setSourceUrl] = useState('')
  const [addError,setAddError] = useState('')
  const people = savedPeople(record)

  useEffect(() => {
    request.current?.abort()
    setQsa(null);setError('');setLoading(false);setAddError('')
    return () => request.current?.abort()
  }, [workspaceId,record.cnpj,record.id])

  async function consult() {
    if (loading || !record.cnpj || !workspaceId) return
    request.current?.abort()
    const controller = new AbortController()
    request.current=controller
    setLoading(true);setError('')
    try {
      const result = await hostedGarimpo.qsa(workspaceId,record.cnpj,controller.signal)
      if (!controller.signal.aborted) setQsa(result)
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

  return <section className="gh-people" aria-label={'Pessoas-chave de '+record.company}>
    <div className="gh-people-heading"><div><span className="gh-eyebrow">INTELIGÊNCIA SOCIETÁRIA</span>
      <h3><Users size={16}/> Sócios, administradores e pessoas-chave</h3>
      <p>O QSA identifica vínculos societários publicados pela Receita; ele não comprova quem decide uma compra.</p></div>
      <button className="gh-secondary" type="button" disabled={!record.cnpj || !workspaceId || loading || !canEdit}
        onClick={() => void consult()}><Search size={14}/>{loading?'Consultando…':'Consultar QSA por CNPJ'}</button>
    </div>
    {!record.cnpj && <p className="gh-help">Informe um CNPJ para consultar o quadro de sócios da Receita.</p>}
    {error && <p className="gh-index-error" role="alert">{error}</p>}
    {qsa && <div className="gh-people-qsa">
      <div className="gh-people-section-title"><h4>Quadro de sócios e administradores (QSA)</h4>
        <span>{qsa.people.length} vínculo(s) neste recorte{qsa.truncated?' · lista limitada':''}</span></div>
      {qsa.people.length ? <ul>{qsa.people.map((person,index)=><li key={person.partner_name+person.role_code+index}>
        <strong>{person.partner_name}</strong>
        <span>{person.role_label} · {person.partner_type}</span>
        <small>{person.joined_on?'Ingresso: '+person.joined_on+' · ':''}Receita Federal, competência {person.source_month?.slice(0,7)||'não informada'}</small>
        {publicUrl(person.source_url) && <a href={publicUrl(person.source_url)!} target="_blank" rel="noopener noreferrer">Ver origem do conjunto <ExternalLink size={12}/></a>}
      </li>)}</ul>:<p className="gh-help">Nenhum integrante encontrado na amostra QSA carregada. Isso não comprova ausência de sócios.</p>}
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
      {canEdit&&<form className="gh-people-form" onSubmit={add}>
        <label>Nome público<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="Nome conforme fonte institucional"/></label>
        <label>Cargo publicado<input required maxLength={120} value={position} onChange={e=>setPosition(e.target.value)} placeholder="Ex.: diretor administrativo"/></label>
        <label>Função na abordagem<select value={functionRole} onChange={e=>setFunctionRole(e.target.value as PersonFunction)}>
          {Object.entries(functions).map(([key,value])=><option key={key} value={key}>{value}</option>)}
        </select></label>
        <label>Fonte institucional pública<input type="url" required maxLength={500} value={sourceUrl}
          onChange={e=>setSourceUrl(e.target.value)} placeholder="https://site-da-empresa/..."/></label>
        <button className="gh-secondary" type="submit"><Plus size={14}/>Adicionar pessoa-chave</button>
        {addError&&<span role="alert" className="gh-index-error">{addError}</span>}
      </form>}
    </div>
  </section>
}
