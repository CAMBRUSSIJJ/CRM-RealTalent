import { ArrowRight, CheckCircle2, Construction, Database, Layers3 } from 'lucide-react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import type { AppRoute } from '../../domain/types'
import { routeTitles } from '../../components/layout/navigation'

const plans: Record<Exclude<AppRoute, 'dashboard' | 'leads' | 'pipeline' | 'followups' | 'calls' | 'agenda' | 'goals' | 'automations' | 'metrics' | 'prospecting' | 'settings'>, string[]> = {
  playbooks: ['Scripts editáveis', 'Objeções e respostas', 'Versionamento por workspace'],
}

export function ModulePlaceholder({ route }: { route: keyof typeof plans }) {
  const { setRoute } = useApp()
  const meta = routeTitles[route]
  return (
    <section className="module-placeholder">
      <div className="module-placeholder__icon"><Construction size={30} /></div>
      <span className="eyebrow">Fundação preparada</span>
      <h2>{meta.title}</h2>
      <p>Esta rota já existe na nova arquitetura e será migrada sem reutilizar os controladores globais da V99.</p>
      <div className="module-placeholder__plan">
        {plans[route].map((item) => <div key={item}><CheckCircle2 size={18} /><span>{item}</span></div>)}
      </div>
      <div className="module-placeholder__architecture"><span><Layers3 size={18} /> Componente isolado</span><ArrowRight size={18} /><span><Database size={18} /> Repositório tipado</span></div>
      <Button onClick={() => setRoute('dashboard')}>Voltar ao Painel</Button>
    </section>
  )
}
