/** Cliente de comandos de chamada para RealTalent Connect Desktop V100.46.5. */
export class RealTalentConnectCallClient {
  constructor(supabase, organizationId, deviceId) {
    this.supabase = supabase
    this.organizationId = organizationId
    this.deviceId = deviceId
  }
  async claimPendingCalls(limit = 1) {
    const { data, error } = await this.supabase.rpc('claim_realtalent_connect_call_commands', {
      p_organization_id: this.organizationId,
      p_device_id: this.deviceId,
      p_limit: Math.max(1, Math.min(limit, 20)),
    })
    if (error) throw new Error(error.message)
    return Array.isArray(data) ? data : []
  }
  async update(commandId, status, options = {}) {
    const { data, error } = await this.supabase.rpc('update_realtalent_connect_call_command', {
      p_organization_id: this.organizationId,
      p_device_id: this.deviceId,
      p_command_id: commandId,
      p_status: status,
      p_failure_reason: options.failureReason ?? null,
      p_metadata: options.metadata ?? {},
    })
    if (error) throw new Error(error.message)
    return data
  }
  claimed(id) { return this.update(id, 'claimed') }
  dialing(id) { return this.update(id, 'dialing') }
  connected(id) { return this.update(id, 'connected') }
  completed(id, metadata) { return this.update(id, 'completed', { metadata }) }
  failed(id, failureReason) { return this.update(id, 'failed', { failureReason }) }
  cancelled(id) { return this.update(id, 'cancelled') }
}
