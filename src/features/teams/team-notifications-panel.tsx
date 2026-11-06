import {Bell, BellRing, ShieldCheck, UserRound, UsersRound} from 'lucide-react'
import type {WorkspaceMember} from '../../domain/types'
import {routeToHash} from '../../app/route-state'
import {LocalMemberWhatsAppEditor} from '../settings/local-member-whatsapp-editor'
import {TeamNotificationContacts} from './team-notification-contacts'
import '../../styles/local-member-whatsapp.css'

interface Props{
  workspaceId:string
  mode:'local'|'supabase'
  members:WorkspaceMember[]
  currentUserId:string|null
  canManage:boolean
  leaderId:string|null
  onRefresh():Promise<void>
}

/** The member directory is not an opt-in record. Only explicit verified
 * consent flows in the existing gateway/notification editor can enable sends. */
export function TeamNotificationsPanel({workspaceId,mode,members,currentUserId,canManage,leaderId,onRefresh}:Props){
  return <section className="work-section teams-operation__notifications" aria-label="Notificações da equipe">
    <header>
      <div>
        <span className="eyebrow"><BellRing size={15}/> Notificações de tarefas</span>
        <h3>WhatsApp por integrante</h3>
        <p>Cadastre o contato e confirme a autorização antes de ativar avisos. Um número salvo não autoriza mensagens automaticamente.</p>
      </div>
      <span>{members.length} integrante(s)</span>
    </header>
    <div className="teams-operation__notice" role="note">
      <ShieldCheck size={18}/>
      <div>
        <strong>Envio responsável</strong>
        <p>Somente avisos de tarefas atribuídas e autorizadas. O aceite pelo gateway não comprova entrega ou leitura no WhatsApp.</p>
      </div>
    </div>
    {mode==='local'?<>
      <p className="teams-operation__mode-note">Prévia local: utiliza a ponte WhatsApp do computador quando disponível. O modo local não fornece isolamento de dados entre usuários; não utilize este computador compartilhado para administrar autorizações sensíveis.</p>
      {members.length?<div className="teams-operation__recipient-grid">{members.map(member=>{
        const editable=canManage||member.userId===currentUserId
        return <article key={member.userId} className="teams-operation__recipient">
          <div className="teams-operation__recipient-name">
            <span className="avatar avatar--small"><UserRound size={17}/></span>
            <div><strong>{member.displayName}</strong><small>{leaderId===member.userId?'Liderança':'Integrante'}</small></div>
            <span className="teams-operation__channel-state" title="Estado cadastrado; verifique o gateway">
              <Bell size={14}/>{member.whatsappAutoEnabledAt?'Ativação cadastrada':'Desativado'}
            </span>
          </div>
          {editable?<LocalMemberWhatsAppEditor member={member} workspaceId={workspaceId} onSaved={onRefresh}/>:
            <p className="teams-operation__mode-note">Configuração disponível ao integrante ou ao gestor da equipe.</p>}
        </article>
      })}</div>:<div className="teams-operation__empty"><UsersRound size={21}/><p>Adicione integrantes na equipe para configurar os avisos de trabalho.</p></div>}
    </>:<TeamNotificationContacts workspaceId={workspaceId} mode={mode}
      members={members} currentUserId={currentUserId} canManage={canManage} leaderId={leaderId}/>}
    <footer className="teams-operation__notifications-footer">
      <a href={routeToHash('tasks')}><Bell size={15}/> Consultar avisos nas tarefas</a>
      <a href={routeToHash('settings')}>Configurações de notificações</a>
    </footer>
  </section>
}
