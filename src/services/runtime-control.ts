import {describeLocalServiceError} from '../lib/integration-availability-s34'

export interface RuntimeCommunicationsStatus {
  ready: boolean
  version: string | null
  portBusy: boolean
  supervisorRunning: boolean
  gatewayRunning: boolean
  recovering: boolean
  logTail: string
}

export interface RuntimeStatus {
  application: string
  version: string
  hotfix?: string
  runtime: string
  platform: string
  pid: number
  ports: { crm: number; connect: number; communications: number; prospecting: number; control: number }
  services: { connect: boolean; communications: boolean; prospecting: boolean }
  ready: boolean
  communications: RuntimeCommunicationsStatus
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  let response: Response
  try {
    response = await fetch(`/__rt/runtime${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    })
  } catch {
    throw new Error('Controle local do RealTalent indisponível. Reinicie o CRM pelo ./start-linux.sh.')
  }
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    const message = typeof payload.error === 'string' && payload.error !== 'unauthorized'
      ? payload.error
      : 'Não foi possível recuperar o serviço do WhatsApp.'
    throw new Error(response.status===502||response.status===503?describeLocalServiceError(response.status,'supervisor'):message)
  }
  return payload as T
}

export const loadRuntimeStatus = () => request<RuntimeStatus>('/status')
export const loadCommunicationsRuntimeDiagnostics = () => request<RuntimeCommunicationsStatus>('/communications-diagnostics')
export const restartCommunicationsRuntime = () => request<{ ok: boolean; recovered: boolean; reason: string; health?: { version?: string }; status: RuntimeStatus }>('/restart-communications', { method: 'POST', body: '{}' })
