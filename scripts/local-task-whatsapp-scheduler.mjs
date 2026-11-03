import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

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
  // After a gateway restart, do not send using a possibly stale localStorage opt-in.
  // The CRM must re-confirm current contact/consent in this process first.
  const reconciledMembers = new Set()
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
    const member={workspaceId,userId,phone,consentAt,autoEnabledAt}
    state.members[key]=member
    reconciledMembers.add(key)
    if (!existing || existing.phone !== phone || existing.consentAt !== consentAt || existing.autoEnabledAt !== autoEnabledAt) {
      for (const job of state.jobs) {
        if (job.workspaceId === workspaceId && job.userId === userId && job.status === 'pending') {
          if (!autoEnabledAt || job.phone !== phone || job.consentAt !== consentAt) job.status='cancelled'
        }
      }
    }
    save()
    return { active:Boolean(autoEnabledAt),phoneConfigured:Boolean(phone),consentRecorded:Boolean(consentAt) }
  }

  const schedule = (input) => {
    const workspaceId=String(input?.workspaceId||'')
    const task=input?.task||{}
    const taskId=String(task.id||'')
    const userId=String(task.assigneeId||'')
    if (!isId(workspaceId)||!isId(taskId)) throw new Error('invalid_task_identity')
    if (userId && !isId(userId)) throw new Error('invalid_assignee_identity')
    if (input.member) updateMember({ ...input.member,workspaceId })
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

  const status = ({workspaceId,taskId}) => ({
    jobs:state.jobs.filter(j=>j.workspaceId===workspaceId&&(!taskId||j.taskId===taskId))
      .slice(-50).map(j=>({id:j.id,taskId:j.taskId,eventType:j.eventType,at:j.at,status:j.status,error:j.error||null})),
  })

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
        if(!reconciledMembers.has(memberKey)) continue // Fail closed after restart until CRM reconciles consent.
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
  return { updateMember,schedule,cancel,status,tick }
}
