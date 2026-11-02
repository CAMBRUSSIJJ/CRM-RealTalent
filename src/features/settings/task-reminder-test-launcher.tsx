import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import type { WorkTask } from '../../domain/types'
import { loadWorkManagement } from '../../services/work-management'
import { TaskWhatsAppTestModal } from '../tasks/task-whatsapp-test-modal'

interface Props { workspaceId: string | null; userId: string | null }
export function TaskReminderTestLauncher({ workspaceId, userId }: Props) {
  const { repositoryMode } = useAppWorkspace()
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<WorkTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const launch = async () => {
    if (!workspaceId || !userId) return
    setLoading(true)
    setError('')
    try {
      const data = await loadWorkManagement(repositoryMode, workspaceId)
      setTasks(data.tasks)
      setOpen(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível carregar suas tarefas.')
    } finally { setLoading(false) }
  }
  return <div className="settings-copy">
    <strong>Diagnóstico e teste manual</strong>
    <p>Use o WhatsApp por QR Code já conectado em Comunicações para testar uma tarefa, sem ativar envios automáticos.</p>
    <Button variant="secondary" disabled={!workspaceId || !userId || loading} loading={loading} onClick={() => void launch()}>
      <MessageCircle size={16}/> Testar envio para meu WhatsApp
    </Button>
    {error ? <p role="alert">{error}</p> : null}
    <TaskWhatsAppTestModal open={open} workspaceId={workspaceId ?? ''} userId={userId} tasks={tasks} onClose={() => setOpen(false)} />
  </div>
}
