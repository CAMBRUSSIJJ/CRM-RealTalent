import { useEffect, useMemo, useState } from 'react'
import { Bell, Save, UsersRound } from 'lucide-react'
import type { WorkspaceMember } from '../../domain/types'
import { Button } from '../../components/ui/button'
import { getSupabaseClient } from '../../lib/supabase'
import '../../styles/team-notification-contacts.css'

interface Props {
  workspaceId: string
  members: WorkspaceMember[]
  currentUserId: string | null
  canManage: boolean
  mode: 'local' | 'supabase'
  leaderId: string | null
}

type ContactRow = { user_id: string; phone_e164: string | null }

/** A team-directory number is never treated as consent or proof of ownership. */
export function normalizeTeamWhatsApp(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  if (/[^\d+\s().-]/.test(value) || (value.match(/\+/g) || []).length > 1 || (value.includes('+') && !value.startsWith('+'))) return null
  const digits = value.replace(/\D/g, '')
  const e164 = value.startsWith('+') || digits.startsWith('55') ? '+' + digits
    : digits.length === 10 || digits.length === 11 ? '+55' + digits : ''
  return /^\+[1-9][0-9]{7,14}$/.test(e164) ? e164 : null
}

export function TeamNotificationContacts({ workspaceId, members, currentUserId, canManage, mode, leaderId }: Props) {
  const [stored, setStored] = useState<Record<string,string>>({})
  const [drafts, setDrafts] = useState<Record<string,string>>({})
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const ids = useMemo(() => members.map(member => member.userId).join('|'), [members])

  useEffect(() => {
    if (mode !== 'supabase' || !workspaceId || !ids) {
      setStored({}); setDrafts({}); setMessage(''); return
    }
    const client = getSupabaseClient()
    if (!client) return
    let mounted = true
    setLoading(true)
    void (client as any).from('team_member_notification_contacts')
      .select('user_id,phone_e164').eq('organization_id', workspaceId)
      .then(({ data, error }: {data: ContactRow[] | null; error: unknown}) => {
        if (!mounted) return
        if (error) { setMessage('Cadastro de contatos indisponível. É necessário aplicar a migração do diretório de Equipes.'); return }
        const values: Record<string,string> = {}
        for (const contact of data ?? []) values[contact.user_id] = contact.phone_e164 || ''
        setStored(values); setDrafts(values); setMessage('')
      }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [workspaceId, mode, ids])

  const save = async (userId: string) => {
    if (!workspaceId || !(canManage || userId === currentUserId) || mode !== 'supabase') return
    const text = drafts[userId]?.trim() || ''
    const phone = normalizeTeamWhatsApp(text)
    if (text && !phone) { setMessage('Informe o telefone brasileiro com DDD ou o número internacional em formato +5511999999999.'); return }
    const client = getSupabaseClient()
    if (!client) { setMessage('Supabase indisponível.'); return }
    setSavingId(userId); setMessage('')
    try {
      const { error } = await (client as any).from('team_member_notification_contacts').upsert({
        organization_id: workspaceId, user_id: userId,
        phone_e164: phone, updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,user_id' })
      if (error) throw error
      setStored(previous => ({ ...previous, [userId]: phone ?? '' }))
      setDrafts(previous => ({ ...previous, [userId]: phone ?? '' }))
      setMessage('Contato salvo em Equipes. O destinatário ainda precisa autorizar o canal e verificar seu telefone em Configurações → Notificações. O cadastro não envia mensagens.')
    } catch {
      setMessage('Falha ao salvar o contato. Confira suas permissões e a migração do banco.')
    } finally { setSavingId(null) }
  }

  return <section className="work-section team-notification-directory">
    <header><div><span className="eyebrow"><UsersRound size={14}/> Pessoas</span>
      <h3>Integrantes e comunicação</h3>
      <p className="team-notification-directory__subtitle">Número cadastrado uma vez por integrante, reutilizado pelas tarefas atribuídas. O envio exige autorização e telefone verificado.</p>
    </div><span>{members.length} membro(s)</span></header>
    {mode === 'local' ? <p role="status">Modo local: contatos de notificação exigem o workspace conectado ao Supabase.</p> : null}
    <div className="team-people-grid-h14">{members.map(member => {
      const editable = (canManage || member.userId === currentUserId) && mode === 'supabase'
      const existing = stored[member.userId] ?? ''
      const changed = (drafts[member.userId] ?? '') !== existing
      return <article key={member.userId} className="team-notification-directory__person">
        <span className="avatar">{member.displayName.slice(0,1).toUpperCase()}</span>
        <div className="team-notification-directory__body">
          <strong>{member.displayName}</strong><small>{member.email}</small>
          {editable ? <label className="team-notification-directory__field">
            <span>WhatsApp para avisos de trabalho</span>
            <input type="tel" inputMode="tel" autoComplete="off" placeholder="+55 DDD número"
              value={drafts[member.userId] ?? ''} disabled={loading || savingId !== null}
              onChange={event => setDrafts(previous => ({ ...previous, [member.userId]: event.target.value }))} />
          </label> : <small>Contato disponível somente para o próprio integrante ou gestor.</small>}
          {editable && changed ? <Button variant="secondary" size="sm" disabled={savingId !== null || loading}
            onClick={() => void save(member.userId)}><Save size={14}/> Salvar número</Button> : null}
          <small className="team-notification-directory__state"><Bell size={13}/>
            {existing ? 'Contato cadastrado · envio condicionado à autorização e verificação' : 'WhatsApp não cadastrado'}
          </small>
        </div>
        <span className="team-notification-directory__role">{leaderId===member.userId ? 'Gestor' : 'Membro'}</span>
      </article>
    })}</div>
    {message ? <p className="team-notification-directory__feedback" role="status">{message}</p> : null}
  </section>
}
