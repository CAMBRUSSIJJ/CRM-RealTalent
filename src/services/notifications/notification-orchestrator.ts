import type { WorkTask, WorkspaceMember } from '../../domain/types'
import {
  cancelGatewayLocalTaskAuto, reconcileGatewayLocalTaskWorkspace,
  scheduleGatewayLocalTaskAuto, syncGatewayLocalTaskAutoMember,
  type LocalTaskAutoMember,
} from '../local-communications-gateway'
import {
  acknowledgeTaskNotificationIntent, loadWorkManagement,
  pendingTaskNotificationIntents,
} from '../work-management'

/**
 * Local durable notification outbox.
 * Browser task writes and notification intents are committed in the same
 * storage snapshot. Gateway outages do not block task operations.
 *
 * Browser-closed limitation: intents written while offline are replayed when
 * the CRM next reconnects. The server expires stale assignments; it never
 * silently sends old notices after an extended outage.
 */
export type NotificationDomainEvent =
  | {type:'task.assigned';workspaceId:string;entityId:string;recipientId:string}
  | {type:'task.updated';workspaceId:string;entityId:string;recipientId:string}
  | {type:'task.completed';workspaceId:string;entityId:string}
  | {type:'task.deleted';workspaceId:string;entityId:string}

const recipientFor=(workspaceId:string,member:WorkspaceMember):LocalTaskAutoMember=>({
  workspaceId,userId:member.userId,phone:member.whatsappPhone||'',
  consentAt:member.whatsappConsentRecordedAt||null,
  autoEnabledAt:member.whatsappAutoEnabledAt||null,
})

export interface NotificationOutboxResult {
  pending:number
  processed:number
  scheduledTaskIds:string[]
  expiredTaskIds:string[]
  inFlightCancellations:string[]
  error:string | null
}

/** Replay every pending event in original order, stopping at the first
 * network/server error. Each successful acknowledgement removes exactly its
 * own ID, without deleting newer intents created while awaiting the gateway.
 */
export async function flushTaskNotificationIntents(
  workspaceId:string,members:WorkspaceMember[],
):Promise<NotificationOutboxResult> {
  const result:NotificationOutboxResult={
    pending:0,processed:0,scheduledTaskIds:[],expiredTaskIds:[],inFlightCancellations:[],error:null,
  }
  const intents=pendingTaskNotificationIntents(workspaceId)
  if(!intents.length)return result
  const snapshot=await loadWorkManagement('local',workspaceId)
  const tasks=new Map(snapshot.tasks.map(task=>[task.id,task]))
  for(const intent of intents) {
    try {
      const task=tasks.get(intent.taskId)
      if(intent.type==='cancel' || !task || ['completed','cancelled'].includes(task.status)){
        const outcome=await cancelGatewayLocalTaskAuto(workspaceId,intent.taskId)
        if(outcome.inFlight)result.inFlightCancellations.push(intent.taskId)
      }else if(intent.type==='assignment'){
        // If assignment changed again while offline, its obsolete event must
        // never be delivered to the previous teammate.
        if(!intent.recipientId || task.assigneeId!==intent.recipientId){
          acknowledgeTaskNotificationIntent(workspaceId,intent.id)
          result.processed++
          continue
        }
        const response=await scheduleGatewayLocalTaskAuto({
          workspaceId,task,assignmentChanged:true,
          assignmentAt:intent.occurredAt,
          member:members.find(m=>m.userId===task.assigneeId)
            ? recipientFor(workspaceId,members.find(m=>m.userId===task.assigneeId)!)
            : null,
        })
        if(response.assignmentScheduled)result.scheduledTaskIds.push(task.id)
        if(response.reason==='assignment_expired')result.expiredTaskIds.push(task.id)
      }else{
        const member=members.find(m=>m.userId===task.assigneeId)
        await scheduleGatewayLocalTaskAuto({
          workspaceId,task,assignmentChanged:false,
          rearmCancelled:intent.rearmCancelled===true,
          member:member?recipientFor(workspaceId,member):null,
        })
      }
      acknowledgeTaskNotificationIntent(workspaceId,intent.id)
      result.processed++
    }catch(error){
      result.error=error instanceof Error?error.message:'Gateway de notificações indisponível'
      break
    }
  }
  result.pending=pendingTaskNotificationIntents(workspaceId).length
  return result
}

export async function reconcileTaskNotificationWorkspace(
  workspaceId:string,members:WorkspaceMember[],tasks:WorkTask[],
) {
  for(const member of members) {
    await syncGatewayLocalTaskAutoMember({...recipientFor(workspaceId,member),reconcileOnly:true})
  }
  // Do not reconcile a possibly stale browser snapshot while unacknowledged
  // mutations exist. That could resurrect a canceled job or delete a new one.
  const outbox=await flushTaskNotificationIntents(workspaceId,members)
  if(outbox.pending>0)return outbox
  await reconcileGatewayLocalTaskWorkspace(workspaceId,tasks.map(task=>task.id))
  for(const task of tasks){
    const member=members.find(item=>item.userId===task.assigneeId)
    await scheduleGatewayLocalTaskAuto({
      workspaceId,task,member:member?recipientFor(workspaceId,member):null,
      assignmentChanged:false,rearmCancelled:false,
    })
  }
  return outbox
}

// Existing public API remains for other features, but local task mutations
// use flushTaskNotificationIntents rather than direct gateway calls.
export const cancelTaskNotification=(workspaceId:string,taskId:string)=>
  cancelGatewayLocalTaskAuto(workspaceId,taskId)

export async function publishTaskNotificationEvent(
  event:Extract<NotificationDomainEvent,{type:'task.assigned'|'task.updated'}>,
  task:WorkTask|null,members:WorkspaceMember[],
){
  if(!task||event.entityId!==task.id||(task.assigneeId||'')!==event.recipientId)
    throw new Error('notification_task_identity_mismatch')
  const member=members.find(item=>item.userId===task.assigneeId)
  return scheduleGatewayLocalTaskAuto({
    workspaceId:event.workspaceId,task,
    member:member?recipientFor(event.workspaceId,member):null,
    assignmentChanged:event.type==='task.assigned',
  })
}
