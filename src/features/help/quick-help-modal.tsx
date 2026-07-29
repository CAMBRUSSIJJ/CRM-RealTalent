import { CalendarDays, Database, KanbanSquare, ListChecks, PhoneCall, Plus, UsersRound } from 'lucide-react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'

interface QuickHelpModalProps { open: boolean; onClose(): void }

const steps = [
  { route: 'leads' as const, icon: UsersRound, title: '1. Cadastre ou importe os leads', copy: 'Centralize contatos, responsáveis, prioridades, origem e próxima ação.' },
  { route: 'pipeline' as const, icon: KanbanSquare, title: '2. Organize o Pipeline', copy: 'Mova as oportunidades conforme o avanço da conversa comercial.' },
  { route: 'followups' as const, icon: ListChecks, title: '3. Programe o próximo passo', copy: 'Nenhum lead deve ficar sem ligação, retorno, reunião ou tarefa.' },
  { route: 'calls' as const, icon: PhoneCall, title: '4. Execute a rotina', copy: 'Trabalhe um contato por vez e registre obrigatoriamente o resultado.' },
  { route: 'agenda' as const, icon: CalendarDays, title: '5. Confirme os compromissos', copy: 'Reuniões e retornos ficam ligados ao histórico de cada oportunidade.' },
]

export function QuickHelpModal({ open, onClose }: QuickHelpModalProps) {
  const { repositoryMode, setRoute } = useApp()
  const navigate = (route: typeof steps[number]['route']) => { setRoute(route); onClose() }
  return <Modal open={open} onClose={onClose} size="lg" title="Guia rápido do CRM" subtitle="O fluxo recomendado para uma pessoa que está usando o produto pela primeira vez.">
    <div className="quick-help">
      <div className="quick-help__steps">{steps.map(({ route, icon: Icon, title, copy }) => <button type="button" key={route} onClick={() => navigate(route)}><span><Icon size={20} /></span><span><strong>{title}</strong><small>{copy}</small></span></button>)}</div>
      <aside className="quick-help__aside"><Database size={22} /><div><strong>{repositoryMode === 'local' ? 'Você está no modo local' : 'Você está no modo online'}</strong><p>{repositoryMode === 'local' ? 'Os dados ficam neste navegador. Exporte um backup antes de limpar o navegador ou trocar de computador.' : 'Os dados são carregados do workspace autorizado no Supabase.'}</p></div><Button size="sm" onClick={() => navigate('leads')}><Plus size={16} /> Abrir Leads</Button></aside>
    </div>
  </Modal>
}
