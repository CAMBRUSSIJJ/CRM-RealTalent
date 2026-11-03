import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { taskNotificationEvent } from './notifications/notification-event-contract.mjs'

const isId = value => typeof value === 'string' && value.length > 0 && value.length <= 170 && /^[a-zA-Z0-9:_-]+$/.test(value)
const phoneValid = value => typeof value === 'string' && /^\+55[1-9][0-9]{9,10}$/.test(value)
const active = status => ['todo','in_progress','blocked'].includes(status)
const identity = (workspaceId,userId) => workspaceId + '|' + userId
const taskKey = (workspaceId,taskId) => workspaceId + '|' + taskId
const hash = text => crypto.createHash('sha256').update(text).digest('hex')
const initial = () => ({ version:1, members:{}, tasks:{}, jobs:[] })

/** Persistent local-only reminder queue. Never reads browser localStorage.
 * A server-side worker can run with the browser closed, while the local gateway is running.
 * A send attempt is durably claimed BEFORE transport, with no blind automatic retry.
 */
export function createLocalTaskWhatsAppScheduler({ file, send, accountFor, clock = () => Date.now() }) {
  let state
  try { state = JSON.parse(fs.readFileSync(file,'utf8')); if (!state || state.version !== 1) state = initial() }
  catch { state = initial() }
  state.members ||= {}
  state.tasks ||= {}
  state.jobs ||= []
  for (const job of state.jobs) if (job.status === 'processing') { job.status = 'unknown'; job.error = 'interrupted_after_transport_claim' }
  // The durable gateway record is the authority for automatic sending.
  // Browser reconciliation can discover members but cannot grant an opt-in
  // or override a revoked/changed phone. Explicit edits are gateway-first.
  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive:true, mode:0o700 })
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(state), { mode:0o600 })
    fs.renameSync(tmp,file)
    try { fs.chmodSync(file,0o600) } catch {}
  }
  save()
  const pendingFor = (workspaceId,taskId) => state.jobs.filter(j => j.workspaceId === workspaceId && j.taskId === taskId && j.status === 'pending')

  const updateMember = (input) => {
    const workspaceId=String(input?.workspaceId||''),userId=String(input?.userId||'')
    if (!isId(workspaceId)||!isId(userId)) throw new Error('invalid_member_identity')
    const phone=String(input?.phone||'')
    if (phone && !phoneValid(phone)) throw new Error('invalid_member_phone')
    const consentAt = input?.consentAt && Number.isFinite(Date.parse(input.consentAt)) ? String(input.consentAt) : null
    const autoEnabledAt = consentAt && phone && input?.autoEnabledAt && Number.isFinite(Date.parse(input.autoEnabledAt)) ? String(input.autoEnabledAt) : null
    const key=identity(workspaceId,userId)
    const existing=state.members[key]
    if (input?.reconcileOnly === true && existing) {
      return { active:Boolean(existing.autoEnabledAt),phoneConfigured:Boolean(existing.phone),
        consentRecorded:Boolean(existing.consentAt),needsExplicitSave: Boolean(autoEnabledAt && !existing.autoEnabledAt) }
    }
    // An old browser opt-in may not be mirrored in the durable gateway yet:
    // never enable it during background reconciliation.
    const member={workspaceId,userId,phone,consentAt,
      autoEnabledAt:input?.reconcileOnly === true ? null : autoEnabledAt,
      updatedAt:new Date(clock()).toISOString()}
    state.members[key]=member
    if (!existing || existing.phone !== phone || existing.consentAt !== consentAt || existing.autoEnabledAt !== autoEnabledAt) {
      for (const job of state.jobs) {
        if (job.workspaceId === workspaceId && job.userId === userId && job.status === 'pending') {
          if (!autoEnabledAt || job.phone !== phone || job.consentAt !== consentAt) job.status='cancelled'
        }
      }
    }
    save()
    return { active:Boolean(member.autoEnabledAt),phoneConfigured:Boolean(phone),consentRecorded:Boolean(consentAt),
      needsExplicitSave:Boolean(input?.reconcileOnly===true && autoEnabledAt) }
  }

  const schedule = (input) => {
    const workspaceId=String(input?.workspaceId||'')
    const task=input?.task||{}
    const taskId=String(task.id||'')
    const userId=String(task.assigneeId||'')
    if (!isId(workspaceId)||!isId(taskId)) throw new Error('invalid_task_identity')
    if (userId && !isId(userId)) throw new Error('invalid_assignee_identity')
    // Scheduling never changes the recipient's consent/phone. Only /member
    // with explicit confirmation can update that sensitive server-side record.
    const key=taskKey(workspaceId,taskId)
    const old=state.tasks[key]
    const data={
      workspaceId,taskId,userId,
      title:String(task.title||'Tarefa').slice(0,140),
      status:String(task.status||'todo'),
      dueAt:task.dueAt||null,
      priority:String(task.priority||'normal'),
      reminderEnabled:task.reminderEnabled === true,
      reminderOnAssignment:task.reminderOnAssignment === true,
      reminderChannels:Array.isArray(task.reminderChannels)?task.reminderChannels:[],
    }
    state.tasks[key]=data
    const member=state.members[identity(workspaceId,userId)]
    const eligible=Boolean(member?.autoEnabledAt && member?.consentAt && member?.phone && active(data.status)
      && data.reminderEnabled && data.reminderChannels.includes('whatsapp'))
    const now=clock(), desired=new Map()
    const add=(eventType,at,uniqueSuffix) => {
      if(!Number.isFinite(at)||at<now||at>now+90*24*60*60*1000)return
      // Generate one provider-neutral domain event; execution remains in
      // the gateway adapter and never executes in the browser.
      taskNotificationEvent(task,workspaceId,eventType==='assigned'?'task.assigned':'task.due_soon',new Date(at).toISOString())
      const id=hash(workspaceId+'|'+taskId+'|'+userId+'|'+eventType+'|'+uniqueSuffix)
      desired.set(id,{
        id,workspaceId,taskId,userId,eventType,at:new Date(at).toISOString(),
        dueAt:data.dueAt,title:data.title,priority:data.priority,
        phone:member.phone,consentAt:member.consentAt,status:'pending',error:null,createdAt:new Date(now).toISOString(),
      })
    }
    if (eligible) {
      const assignmentNew = Boolean(input.assignmentChanged && userId && (!old || old.userId !== userId || input.assignmentChanged))
      const revision=String(task.updatedAt||'')
      if(assignmentNew && data.reminderOnAssignment && now-Date.parse(revision)<2*60_000 && now>=Date.parse(revision)-5_000)
        add('assigned',now+8_000,'assigned:'+revision)
      if(data.dueAt && Number.isFinite(Date.parse(data.dueAt)) && Date.parse(data.dueAt)>now){
        const offsets=new Set((Array.isArray(task.reminderOffsetsMinutes)?task.reminderOffsetsMinutes:[]).filter(n=>Number.isInteger(n)&&n>=5&&n<=10080))
        if (Number.isInteger(task.reminderCustomMinutes) && task.reminderCustomMinutes>=5 && task.reminderCustomMinutes<=10080) offsets.add(task.reminderCustomMinutes)
        for(const minutes of offsets) add('due_soon',Date.parse(data.dueAt)-minutes*60_000,'due:'+data.dueAt+':'+minutes)
      }
      // Preserve an already-queued assignment when an unrelated task field changes.
      if (!input.assignmentChanged && data.reminderOnAssignment) for (const j of pendingFor(workspaceId,taskId))
        if(j.eventType==='assigned' && j.userId===userId && j.phone===member.phone && j.consentAt===member.consentAt)
          desired.set(j.id,j)
    }
    for(const job of pendingFor(workspaceId,taskId)) if (!desired.has(job.id)) job.status='cancelled'
    for(const [id,job] of desired) if (!state.jobs.some(j=>j.id===id)) state.jobs.push(job)
    // Retain all pending work and recent terminal history, cap old history only.
    const history=state.jobs.filter(j=>j.status!=='pending').sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))
    const pending=state.jobs.filter(j=>j.status==='pending')
    state.jobs=[...pending,...history.slice(0,2000)]
    save()
    return { scheduled:pendingFor(workspaceId,taskId).length,automaticEnabled:eligible }
  }

  const cancel = ({workspaceId,taskId}) => {
    if(!isId(workspaceId)||!isId(taskId)) throw new Error('invalid_task_identity')
    delete state.tasks[taskKey(workspaceId,taskId)]
    for(const job of pendingFor(workspaceId,taskId)) job.status='cancelled'
    save()
    return { cancelled:true }
  }

  const status = ({workspaceId,taskId}) => {
    if(!isId(workspaceId)) throw new Error('invalid_workspace_identity')
    const records = state.jobs.filter(j=>j.workspaceId===workspaceId&&(!taskId||j.taskId===taskId))
    const counts={pending:0,sent:0,failed:0,unknown:0,cancelled:0,expired:0,blocked:0,processing:0}
    for(const job of records) if(Object.hasOwn(counts,job.status))counts[job.status]++
    return {
      counts,total:records.length,
      lastActivityAt:records.length ? records.reduce((latest,job)=> {
        const when=job.processedAt||job.claimedAt||job.createdAt
        return when && (!latest||when>latest) ? when : latest
      },null) : null,
      diagnostics: taskId ? [diagnose({workspaceId,taskId})]
        : Object.values(state.tasks).filter(task=>task.workspaceId===workspaceId)
          .map(task=>diagnose({workspaceId,taskId:task.taskId})),
      jobs:[...records].sort((a,b)=>Date.parse(b.createdAt||b.at)-Date.parse(a.createdAt||a.at))
        .slice(0,100).map(j=>({
        id:j.id,taskId:j.taskId,eventType:j.eventType,at:j.at,status:j.status,
        error:j.error||null,processedAt:j.processedAt||null,
      })),
    }
  }

  const diagnose = ({workspaceId,taskId}) => {
    if(!isId(workspaceId)||!isId(taskId))throw new Error('invalid_task_identity')
    const task=state.tasks[taskKey(workspaceId,taskId)]
    if(!task) return { code:'task_not_synced',state:'attention',canRequest:false,
      taskId,reason:'Esta tarefa ainda não está sincronizada com o agendador local.' }
    const jobs=state.jobs.filter(j=>j.workspaceId===workspaceId&&j.taskId===taskId)
    const pending=jobs.filter(j=>j.status==='pending'||j.status==='processing')
    const latest=jobs.sort((a,b)=>Date.parse(b.createdAt||b.at)-Date.parse(a.createdAt||a.at))[0]
    const current=clock()
    const member=state.members[identity(workspaceId,task.userId)]
    const respond=(code,state,reason,canRequest=false)=>({
      code,state,reason,taskId,canRequest,
      scheduled:pending.length,
      latestStatus:latest?.status||null,
      nextAt:pending.length ? [...pending].sort((a,b)=>a.at.localeCompare(b.at))[0].at : null,
    })
    if(!active(task.status))return respond('task_closed','inactive','A tarefa está concluída ou cancelada.')
    if(!task.userId)return respond('assignee_missing','attention','Selecione um responsável pela tarefa.')
    if(!member)return respond('member_not_confirmed','attention','O responsável ainda não confirmou seus contatos no Communications Gateway.')
    if(!member.phone)return respond('phone_missing','attention','Cadastre o WhatsApp do responsável em Equipe e permissões.')
    if(!member.consentAt)return respond('consent_missing','attention','A autorização do colaborador ainda não foi registrada.')
    if(!member.autoEnabledAt)return respond('automatic_off','attention','Ative a automação deste colaborador em Equipe e permissões.')
    if(!task.reminderEnabled)return respond('task_reminders_off','attention','Ative os lembretes desta tarefa.')
    if(!task.reminderChannels.includes('whatsapp'))return respond('channel_off','attention','Selecione o canal WhatsApp QR nos lembretes da tarefa.')
    if(pending.length)return respond('scheduled','scheduled','O WhatsApp possui aviso programado para esta tarefa.')
    if(latest&&['unknown','failed','blocked'].includes(latest.status))return respond('review_required','attention',
      'Já houve uma tentativa sem confirmação. Confira a conversa antes de solicitar outra.',false)
    if(latest?.status==='sent')return respond('accepted','history','A mensagem foi aceita pelo gateway; a entrega não foi confirmada.',false)
    if(jobs.some(job=>job.eventType==='requested')) return respond('already_requested','history',
      'Já houve uma solicitação de aviso único. Verifique o histórico antes de criar outra tarefa.')
    if(latest?.status==='expired')return respond('expired','attention','O aviso anterior expirou enquanto a conexão estava indisponível.',true)
    const hasDeadline=Boolean(task.dueAt&&Date.parse(task.dueAt)>current)
    return respond(hasDeadline?'no_future_reminder':'assignment_already_happened','none',
      hasDeadline
        ? 'Nenhum aviso futuro foi programado. Revise os intervalos de lembrete desta tarefa.'
        : 'A atribuição já aconteceu e esta tarefa não tem um aviso futuro. Você pode solicitar um aviso agora.',
      true)
  }

  const requestOneOff = ({workspaceId,taskId}) => {
    const diagnostic=diagnose({workspaceId,taskId})
    if(!diagnostic.canRequest)throw Object.assign(new Error('notification_not_eligible:'+diagnostic.code),{statusCode:409})
    const task=state.tasks[taskKey(workspaceId,taskId)]
    const member=state.members[identity(workspaceId,task.userId)]
    const now=clock()
    // One human-requested message per task/recipient. Prevents repeated
    // clicking, browser retries and gateway restarts from sending duplicates.
    const id=hash('requested-once|'+workspaceId+'|'+taskId+'|'+task.userId)
    if(state.jobs.some(j=>j.id===id))throw Object.assign(new Error('notification_already_requested'),{statusCode:409})
    taskNotificationEvent({ id:task.taskId,assigneeId:task.userId,title:task.title,dueAt:task.dueAt },
      workspaceId,'task.reminder_requested',new Date(now).toISOString())
    state.jobs.push({
      id,workspaceId,taskId,userId:task.userId,eventType:'requested',
      at:new Date(now+8_000).toISOString(),dueAt:task.dueAt,title:task.title,
      priority:task.priority,phone:member.phone,consentAt:member.consentAt,
      status:'pending',error:null,createdAt:new Date(now).toISOString(),
    })
    save()
    return {scheduled:1,jobId:id}
  }

  const memberStatus = ({workspaceId,userId}) => {
    if(!isId(workspaceId)||!isId(userId))throw new Error('invalid_member_identity')
    const member=state.members[identity(workspaceId,userId)]
    return { present:Boolean(member),active:Boolean(member?.autoEnabledAt),
      consentRecorded:Boolean(member?.consentAt),phoneConfigured:Boolean(member?.phone),
      updatedAt:member?.updatedAt||null }
  }

  const reconcileWorkspace = ({workspaceId,taskIds}) => {
    if(!isId(workspaceId)||!Array.isArray(taskIds) || taskIds.length>10000 ||
      taskIds.some(id=>!isId(id))) throw new Error('invalid_workspace_snapshot')
    const known=new Set(taskIds)
    let cancelled=0
    for(const job of state.jobs) {
      if(job.workspaceId===workspaceId&&job.status==='pending'&&!known.has(job.taskId)) {
        job.status='cancelled'
        job.error='removed_from_workspace_snapshot'
        cancelled++
      }
    }
    for(const key of Object.keys(state.tasks)) {
      const task=state.tasks[key]
      if(task.workspaceId===workspaceId&&!known.has(task.taskId))delete state.tasks[key]
    }
    if(cancelled)save()
    return {cancelled,tracked:known.size}
  }

  let running=false
  const tick = async () => {
    if(running)return
    running=true
    try{
      const current=clock()
      const jobs=state.jobs.filter(j=>j.status==='pending'&&Date.parse(j.at)<=current).sort((a,b)=>a.at.localeCompare(b.at)).slice(0,12)
      for(const job of jobs){
        const memberKey=identity(job.workspaceId,job.userId)
        const member=state.members[memberKey]
        const task=state.tasks[taskKey(job.workspaceId,job.taskId)]
        if(!member?.autoEnabledAt||!member.consentAt||!phoneValid(member.phone)||
          member.phone!==job.phone||member.consentAt!==job.consentAt||
          !task||task.userId!==job.userId||!active(task.status)||!task.reminderEnabled||!task.reminderChannels.includes('whatsapp')){
          job.status='cancelled';save();continue
        }
        if (current-Date.parse(job.at)>20*60_000){job.status='expired';save();continue}
        // Durable opt-in already accepted by gateway; safe across restart
        // even with the browser closed. Changes require acknowledged edits.
        // Rate-limit before any outbound call, including after a restart.
        const sentDay=state.jobs.filter(j=>j.workspaceId===job.workspaceId&&j.userId===job.userId&&j.status==='sent'&&Date.parse(j.processedAt||0)>current-24*60*60*1000).length
        if(sentDay>=20){job.status='blocked';job.error='member_daily_limit';save();continue}
        const account=await accountFor(job.workspaceId)
        if (!account) continue // Stay pending until QR reconnects, then expire.
        job.status='processing';job.claimedAt=new Date(clock()).toISOString()
        save() // A crash here must NOT cause another send attempt.
        try{
          const event=await send(job,account)
          job.status=event?.status==='failed'?'failed':'sent'
          job.eventId=event?.id||null
          if(job.status==='failed')job.error='provider_failed'
        }catch(error){
          job.status='unknown'
          job.error='provider_outcome_unknown_requires_review'
        }
        job.processedAt=new Date(clock()).toISOString()
        save()
      }
    } finally { running=false }
  }
  return { updateMember,schedule,cancel,status,diagnose,requestOneOff,memberStatus,reconcileWorkspace,tick }
}
