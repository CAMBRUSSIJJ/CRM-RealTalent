import type { WorkTask, WorkspaceMember } from '../../domain/types'
import {
  cancelGatewayLocalTaskAuto, reconcileGatewayLocalTaskWorkspace,
  scheduleGatewayLocalTaskAuto, syncGatewayLocalTaskAutoMember,
  type LocalTaskAutoMember,
} from '../local-communications-gateway'

/** Provider-neutral CRM intent adapter. Task UI does not know about QR,
 * idempotency or delivery statuses. The gateway is the local execution
 * adapter; Supabase/Railway will later implement this interface for cloud.
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

export async function reconcileTaskNotificationWorkspace(workspaceId:string,members:WorkspaceMember[],tasks:WorkTask[]) {
  for(const member of members) {
    await syncGatewayLocalTaskAutoMember({...recipientFor(workspaceId,member),reconcileOnly:true})
  }
  // Reconcile actual task existence before allowing any resumed pending jobs.
  await reconcileGatewayLocalTaskWorkspace(workspaceId,tasks.map(task=>task.id))
  for(const task of tasks){
    const member=members.find(item=>item.userId===task.assigneeId)
    await scheduleGatewayLocalTaskAuto({
      workspaceId,task,member:member?recipientFor(workspaceId,member):null,
      assignmentChanged:false,
    })
  }
}

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
