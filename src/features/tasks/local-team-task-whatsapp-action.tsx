import { useEffect, useState } from 'react'
import { BellRing, MessageCircle, RefreshCw } from 'lucide-react'
import { useAppUi } from '../../app/app-context'
import type { WorkTask, WorkspaceMember } from '../../domain/types'
import { Button } from '../../components/ui/button'
import {
  diagnoseGatewayLocalTaskNotification, requestGatewayLocalTaskNotice,
  type LocalTaskAutoDiagnostic,
} from '../../services/local-communications-gateway'

type Props = { workspaceId: string; task: WorkTask; member: WorkspaceMember | null }

/** Task notifications are always handled by the central queue.
 * The independent QR transport test remains in Settings → Notifications.
 * This avoids duplicate send mechanisms for the same task.
 */
export function LocalTeamTaskWhatsAppAction({workspaceId,task,member}:Props){
  const {notify,confirmAction}=useAppUi()
  const [diagnostic,setDiagnostic]=useState<LocalTaskAutoDiagnostic|null>(null)
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  const [requesting,setRequesting]=useState(false)
  const [revision,setRevision]=useState(0)
  useEffect(()=>{
    if(!workspaceId||!task.id)return
    let active=true
    setLoading(true);setError('')
    void diagnoseGatewayLocalTaskNotification(workspaceId,task.id).then(result=>{
      if(active)setDiagnostic(result)
    }).catch(()=>{
      if(active){setDiagnostic(null);setError('Não foi possível confirmar o agendamento com o Communications Gateway.')}
    }).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[workspaceId,task.id,task.updatedAt,member?.whatsappAutoEnabledAt,revision])

  const request=async()=>{
    if(!diagnostic?.canRequest||requesting)return
    const approved=await confirmAction({
      title:'Programar um aviso único?',
      description:`O RealTalent programará um aviso para ${member?.displayName||'o responsável'} referente à tarefa “${task.title}”. O WhatsApp QR e o gateway precisam estar conectados; não haverá reenvio automático.`,
      confirmLabel:'Programar aviso',
    })
    if(!approved)return
    setRequesting(true);setError('')
    try{
      await requestGatewayLocalTaskNotice(workspaceId,task.id)
      notify('success','Aviso único programado. O histórico mostrará o resultado.')
      setRevision(n=>n+1)
    }catch(failure){
      setError(failure instanceof Error?failure.message:'Não foi possível programar este aviso.')
    }finally{setRequesting(false)}
  }

  const masked=member?.whatsappPhone? `•••• ${member.whatsappPhone.slice(-4)}`:'WhatsApp não cadastrado'
  return <section className="work-form-section local-team-wa-action" aria-label="Comunicação automática do responsável">
    <header><MessageCircle size={18}/><div><strong>Comunicação do responsável</strong>
      <small>{member?.displayName||'Sem responsável'} · {masked}</small>
    </div></header>
    <p className="local-team-wa-action__hint" role="status">
      {loading?'Consultando situação do aviso…':error||diagnostic?.reason||
        'Aguardando sincronização com o Communications Gateway.'}
    </p>
    {diagnostic?.nextAt ? <p className="local-team-wa-action__hint"><BellRing size={13}/>
      Próximo aviso: {new Date(diagnostic.nextAt).toLocaleString('pt-BR')}
    </p>:null}
    <div className="local-team-wa-action__buttons">
      {diagnostic?.canRequest ? <Button size="sm" type="button" disabled={requesting||loading}
        onClick={()=>void request()}><BellRing size={14}/>{requesting?'Programando…':'Programar aviso único'}</Button>:null}
      <Button variant="secondary" size="sm" type="button" disabled={loading||requesting}
        onClick={()=>setRevision(n=>n+1)}><RefreshCw size={14}/> Atualizar situação</Button>
    </div>
    <small className="local-team-wa-action__hint">
      O envio usa o motor central, não faz disparos duplicados e exige autorização no cadastro de Equipes.
      O teste manual de conexão continua disponível em Configurações → Notificações.
    </small>
  </section>
}
