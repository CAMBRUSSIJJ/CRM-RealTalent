import { CheckCircle2, ChevronLeft, ChevronRight, GraduationCap, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppNavigation } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { GUIDED_TOURS } from '../../services/help-center'

const STORAGE_KEY = 'realtalent.crm.help.tour.v10091'
const PENDING_KEY = 'realtalent.crm.help.tour.pending.v10091'

type TourState = { tourId: string; stepIndex: number }

function readState(): TourState | null {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) as TourState : null } catch { return null }
}
function persist(state: TourState | null) {
  try { if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); else localStorage.removeItem(STORAGE_KEY) } catch { /* storage unavailable */ }
}

export function GuidedTourOverlay() {
  const { setRoute } = useAppNavigation()
  const [state, setState] = useState<TourState | null>(() => readState())
  const tour = useMemo(() => GUIDED_TOURS.find((item) => item.id === state?.tourId) ?? null, [state?.tourId])
  const step = tour && state ? tour.steps[state.stepIndex] : null

  useEffect(() => {
    const start = (event: Event) => {
      const detail = (event as CustomEvent<{ tourId?: string }>).detail
      const selected = GUIDED_TOURS.find((item) => item.id === detail?.tourId) ?? GUIDED_TOURS[0]
      if (!selected) return
      const next = { tourId: selected.id, stepIndex: 0 }
      setState(next); persist(next); setRoute(selected.steps[0].route)
    }
    window.addEventListener('crm:help-start-tour', start)
    try {
      if (!state && localStorage.getItem(PENDING_KEY) === '1') {
        localStorage.removeItem(PENDING_KEY)
        const selected = GUIDED_TOURS[0]
        if (selected) { const next = { tourId: selected.id, stepIndex: 0 }; setState(next); persist(next); setRoute(selected.steps[0].route) }
      }
    } catch { /* storage unavailable */ }
    return () => window.removeEventListener('crm:help-start-tour', start)
  }, [setRoute, state])

  useEffect(() => { if (step) setRoute(step.route) }, [setRoute, step])

  if (!tour || !state || !step) return null
  const last = state.stepIndex === tour.steps.length - 1
  const go = (index: number) => {
    if (index < 0 || index >= tour.steps.length) return
    const next = { ...state, stepIndex: index }; setState(next); persist(next)
  }
  const close = (completed = false) => {
    if (completed) {
      try { localStorage.setItem(`realtalent.crm.help.tour.completed.${tour.id}`, new Date().toISOString()) } catch { /* storage unavailable */ }
    }
    setState(null); persist(null)
  }

  return <aside className="guided-tour-v10091" role="dialog" aria-label={`Tour guiado: ${tour.title}`}>
    <header><span><GraduationCap size={18}/></span><div><small>{tour.title}</small><strong>{state.stepIndex + 1} de {tour.steps.length} · {step.title}</strong></div><button type="button" aria-label="Encerrar tour" onClick={() => close(false)}><X size={17}/></button></header>
    <div className="guided-tour-v10091__progress"><span style={{ width: `${((state.stepIndex + 1) / tour.steps.length) * 100}%` }}/></div>
    <p>{step.description}</p>
    <div className="guided-tour-v10091__action"><CheckCircle2 size={16}/><span>{step.action}</span></div>
    <footer>
      <Button variant="secondary" size="sm" disabled={state.stepIndex === 0} onClick={() => go(state.stepIndex - 1)}><ChevronLeft size={15}/> Anterior</Button>
      {last ? <Button size="sm" onClick={() => close(true)}>Concluir <CheckCircle2 size={15}/></Button> : <Button size="sm" onClick={() => go(state.stepIndex + 1)}>Próximo <ChevronRight size={15}/></Button>}
    </footer>
  </aside>
}
