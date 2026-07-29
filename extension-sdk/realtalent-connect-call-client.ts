export type ConnectCommandStatus = 'claimed' | 'dialing' | 'connected' | 'completed' | 'failed' | 'cancelled'

export interface ConnectPendingCall {
  id: string
  lead_id: string | null
  phone: string
  lead_name: string
  status: string
  requested_at: string
  expires_at: string
  metadata: Record<string, unknown>
}

interface RpcResult<T> { data: T | null; error: { message: string } | null }
interface SupabaseRpcClient { rpc<T = unknown>(name: string, params: Record<string, unknown>): Promise<RpcResult<T>> }

/**
 * Cliente mínimo para o RealTalent Connect Desktop consumir comandos de chamada
 * criados pelo CRM V100.46.5. O aplicativo deve manter o heartbeat existente e
 * consultar claimPendingCalls em intervalos controlados.
 */
export class RealTalentConnectCallClient {
  constructor(
    private readonly supabase: SupabaseRpcClient,
    private readonly organizationId: string,
    private readonly deviceId: string,
  ) {}

  async claimPendingCalls(limit = 1): Promise<ConnectPendingCall[]> {
    const { data, error } = await this.supabase.rpc<ConnectPendingCall[]>('claim_realtalent_connect_call_commands', {
      p_organization_id: this.organizationId,
      p_device_id: this.deviceId,
      p_limit: Math.max(1, Math.min(limit, 20)),
    })
    if (error) throw new Error(error.message)
    return Array.isArray(data) ? data : []
  }

  async update(commandId: string, status: ConnectCommandStatus, options?: { failureReason?: string; metadata?: Record<string, unknown> }) {
    const { data, error } = await this.supabase.rpc('update_realtalent_connect_call_command', {
      p_organization_id: this.organizationId,
      p_device_id: this.deviceId,
      p_command_id: commandId,
      p_status: status,
      p_failure_reason: options?.failureReason ?? null,
      p_metadata: options?.metadata ?? {},
    })
    if (error) throw new Error(error.message)
    return data
  }

  claimed(commandId: string) { return this.update(commandId, 'claimed') }
  dialing(commandId: string) { return this.update(commandId, 'dialing') }
  connected(commandId: string) { return this.update(commandId, 'connected') }
  completed(commandId: string, metadata?: Record<string, unknown>) { return this.update(commandId, 'completed', { metadata }) }
  failed(commandId: string, failureReason: string) { return this.update(commandId, 'failed', { failureReason }) }
  cancelled(commandId: string) { return this.update(commandId, 'cancelled') }
}
