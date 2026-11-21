import { getSupabaseClient } from '../lib/supabase'

// Sequências automáticas de e-mail: série de passos com intervalo em dias, enviada pela conta
// de quem inscreveu o contato. O banco para a sequência quando o contato responde.

export interface EmailSequenceStep { position: number; delayDays: number; subject: string; body: string }
export interface EmailSequence { id: string; name: string; shared: boolean; createdBy: string | null; steps: EmailSequenceStep[] }
export type EnrollmentStatus = 'active' | 'completed' | 'replied' | 'stopped' | 'failed'
export interface SequenceEnrollment {
  id: string; sequenceId: string; sequenceName: string; leadId: string; status: EnrollmentStatus; currentPosition: number
  totalSteps: number; nextRunAt: string | null; startedAt: string; finishedAt: string | null; lastError: string | null; enrolledBy: string
}

export const enrollmentStatusLabel: Record<EnrollmentStatus, string> = {
  active: 'Em andamento', completed: 'Concluída', replied: 'Parou: contato respondeu', stopped: 'Parada', failed: 'Falhou',
}

const db = () => {
  const client = getSupabaseClient()
  if (!client) throw new Error('Sequências exigem o CRM hospedado.')
  // Tabelas novas ainda não estão nos tipos gerados do Supabase.
  return client as unknown as { from(name: string): any; rpc(name: string, args: Record<string, unknown>): any }
}

// Regras do editor: ao menos um passo com texto; o primeiro precisa de assunto (os seguintes podem responder no mesmo assunto).
export function validateSequence(name: string, steps: EmailSequenceStep[]): string | null {
  if (!name.trim()) return 'Dê um nome à sequência.'
  if (!steps.length) return 'Adicione pelo menos um e-mail.'
  if (steps.length > 20) return 'Uma sequência pode ter até 20 e-mails.'
  if (!steps[0].subject.trim()) return 'O primeiro e-mail precisa de assunto.'
  const empty = steps.findIndex((step) => !step.body.trim())
  if (empty >= 0) return `O e-mail ${empty + 1} está sem texto.`
  if (steps.some((step) => step.delayDays < 0 || step.delayDays > 60)) return 'O intervalo entre e-mails deve ser de 0 a 60 dias.'
  return null
}

// Dias corridos desde a inscrição até cada passo, para mostrar "dia 0, dia 3, dia 7".
export const cumulativeDays = (steps: Pick<EmailSequenceStep, 'delayDays'>[]) => steps.reduce<number[]>((acc, step) => [...acc, (acc.at(-1) ?? 0) + step.delayDays], [])

export async function listEmailSequences(workspaceId: string): Promise<EmailSequence[]> {
  if (!getSupabaseClient()) return []
  const { data, error } = await db().from('email_sequences').select('id,name,shared,created_by,email_sequence_steps(position,delay_days,subject,body)')
    .eq('organization_id', workspaceId).eq('active', true).order('name')
  if (error) throw new Error(`Não foi possível carregar as sequências: ${error.message}`)
  return (data || []).map((row: any) => ({
    id: row.id, name: row.name, shared: Boolean(row.shared), createdBy: row.created_by,
    steps: [...(row.email_sequence_steps || [])].sort((a: any, b: any) => a.position - b.position)
      .map((step: any) => ({ position: step.position, delayDays: step.delay_days, subject: step.subject || '', body: step.body || '' })),
  }))
}

export async function saveEmailSequence(input: { workspaceId: string; id?: string; name: string; shared: boolean; steps: EmailSequenceStep[]; userId: string | null }) {
  const problem = validateSequence(input.name, input.steps)
  if (problem) throw new Error(problem)
  const client = db()
  let id = input.id
  if (id) {
    const { error } = await client.from('email_sequences').update({ name: input.name.trim(), shared: input.shared, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(error.code === '23505' ? 'Já existe uma sequência com esse nome.' : error.message)
    const { error: deleteError } = await client.from('email_sequence_steps').delete().eq('sequence_id', id)
    if (deleteError) throw new Error(deleteError.message)
  } else {
    const { data, error } = await client.from('email_sequences').insert({ organization_id: input.workspaceId, name: input.name.trim(), shared: input.shared, created_by: input.userId }).select('id').single()
    if (error) throw new Error(error.code === '23505' ? 'Já existe uma sequência com esse nome.' : error.message)
    id = data.id as string
  }
  const { error: stepsError } = await client.from('email_sequence_steps').insert(input.steps.map((step, index) => ({
    organization_id: input.workspaceId, sequence_id: id, position: index + 1, delay_days: index === 0 ? Math.max(0, step.delayDays) : Math.max(1, step.delayDays),
    subject: step.subject.slice(0, 500), body: step.body.slice(0, 50000),
  })))
  if (stepsError) throw new Error(`Não foi possível salvar os e-mails da sequência: ${stepsError.message}`)
  return id as string
}

export async function deleteEmailSequence(id: string) {
  const { error } = await db().from('email_sequences').update({ active: false, name: `excluída ${new Date().toISOString()} ${id.slice(0, 8)}`, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(`Não foi possível excluir a sequência: ${error.message}`)
}

export async function enrollLeadInSequence(sequenceId: string, leadId: string, accountId: string, track: boolean) {
  const { data, error } = await db().rpc('enroll_lead_in_email_sequence', { p_sequence_id: sequenceId, p_lead_id: leadId, p_account_id: accountId, p_track: track })
  if (error) throw new Error(error.message)
  return String(data)
}

export async function stopSequenceEnrollment(enrollmentId: string) {
  const { error } = await db().rpc('stop_email_sequence_enrollment', { p_enrollment_id: enrollmentId })
  if (error) throw new Error(error.message)
}

export async function listLeadEnrollments(leadId: string): Promise<SequenceEnrollment[]> {
  if (!getSupabaseClient()) return []
  const { data, error } = await db().from('email_sequence_enrollments')
    .select('id,sequence_id,lead_id,status,current_position,next_run_at,started_at,finished_at,last_error,enrolled_by,email_sequences(name,email_sequence_steps(position))')
    .eq('lead_id', leadId).order('started_at', { ascending: false }).limit(10)
  if (error) throw new Error(`Não foi possível carregar as sequências do contato: ${error.message}`)
  return (data || []).map((row: any) => ({
    id: row.id, sequenceId: row.sequence_id, sequenceName: row.email_sequences?.name || 'Sequência', leadId: row.lead_id, status: row.status,
    currentPosition: row.current_position, totalSteps: (row.email_sequences?.email_sequence_steps || []).length, nextRunAt: row.next_run_at,
    startedAt: row.started_at, finishedAt: row.finished_at, lastError: row.last_error, enrolledBy: row.enrolled_by,
  }))
}
