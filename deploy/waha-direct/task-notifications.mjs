import path from 'node:path'
import {createLocalTaskWhatsAppScheduler} from './local-task-whatsapp-scheduler.mjs'

// Reuse the durable, opt-in, idempotent task scheduler with WAHA GOWS as sole
// transport. No separate QR login. No consent inferred from task snapshots.
const phoneValid=p=>typeof p==='string'&&/^\+55[1-9][0-9]{9,10}$/.test(p)
const chatValid=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{5,70}@(c\.us|lid)$/.test(v)
export function taskText(job){
  const due=job.dueAt&&Number.isFinite(Date.parse(job.dueAt))
    ?new Date(job.dueAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})
    :'Sem prazo'
  const action=job.eventType==='assigned'?'Nova tarefa atribuída.':
    job.eventType==='requested'?'Aviso solicitado pelo gestor.':'O prazo está próximo.'
  const title=String(job.title||'Tarefa').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,140)
  return ['RealTalent | Notificação de tarefa','','Tarefa: '+title,'Prazo: '+due,
    action,'','Consulte o CRM para mais detalhes.'].join('\n')
}
export function createWahaTaskNotifications({dataDir,session,upstream,clock=()=>Date.now()}){
  if(typeof dataDir!=='string'||!dataDir||typeof session!=='string'||typeof upstream!=='function')
    throw new Error('WAHA task-notifications configuration invalid')
  const file=path.join(dataDir,'task-notification-outbox.json')
  const scheduler=createLocalTaskWhatsAppScheduler({
    file,clock,
    accountFor:async()=>{
      const s=await upstream('/api/sessions/'+encodeURIComponent(session))
      return s?.status==='WORKING'?{id:'waha-gows-local'}:null
    },
    send:async job=>{
      if(!phoneValid(job.phone))throw Error('invalid_recipient')
      // Resolve the real chat via authenticated WAHA before sending.
      const lookup=await upstream('/api/contacts/check-exists?phone='+job.phone.slice(1)+
        '&session='+encodeURIComponent(session))
      if(lookup?.numberExists!==true||!chatValid(lookup?.chatId))
        throw Error('recipient_not_available_on_waha')
      const delivered=await upstream('/api/sendText','POST',{
        session,chatId:lookup.chatId,text:taskText(job)
      })
      // API acceptance is not proof of handset delivery.
      return {id:typeof delivered?.id==='string'?delivered.id:null,status:'sent'}
    },
  })
  let running=false
  async function tick(){
    if(running)return
    running=true
    try{await scheduler.tick()}finally{running=false}
  }
  async function route(action,input){
    const v=input||{}
    if(action==='member')return {ok:true,...scheduler.updateMember(v)}
    if(action==='member-status')return {ok:true,...scheduler.memberStatus(v)}
    if(action==='schedule')return {ok:true,...scheduler.schedule(v)}
    if(action==='cancel')return {ok:true,...scheduler.cancel(v)}
    if(action==='status')return {ok:true,...scheduler.status(v)}
    if(action==='diagnose')return {ok:true,...scheduler.diagnose(v)}
    if(action==='request')return {ok:true,...scheduler.requestOneOff(v)}
    if(action==='reconcile')return {ok:true,...scheduler.reconcileWorkspace(v)}
    const err=new Error('unknown_task_notification_action');err.status=404;throw err
  }
  return {route,tick,storeFile:file,transport:'waha-gows'}
}
