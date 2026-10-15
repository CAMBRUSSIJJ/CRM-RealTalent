import { ArrowRight, BookOpenCheck, Bot, Check, CheckCircle2, ChevronRight, Compass, Database, GraduationCap, ListChecks, Play, Search, Sparkles, Target } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppNavigation, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { safeStorage } from '../../lib/storage'
import type { HelpArticle, HelpCategory } from '../../services/help-center'
import { GUIDED_TOURS, HELP_ARTICLES, findHelpArticle, searchHelpArticles } from '../../services/help-center'

interface QuickHelpModalProps { open: boolean; onClose(): void }

type HelpMode = 'journey' | 'screen' | 'library' | 'tours'

interface SellerJourneyStep {
  id: string
  articleId: string
  title: string
  subtitle: string
  sellerGoal: string
}

const categories: Array<'Todos' | HelpCategory> = ['Todos', 'Começando', 'Operação', 'Comunicação', 'Gestão', 'Inteligência', 'Configurações']
const progressKey = 'realtalent-help-seller-journey-v10096'

const SELLER_JOURNEY: SellerJourneyStep[] = [
  { id: 'plan-day', articleId: 'start-day', title: 'Organizar o dia', subtitle: 'Priorizar o que realmente exige ação.', sellerGoal: 'Começar o expediente sabendo exatamente quem merece atenção e por quê.' },
  { id: 'build-list', articleId: 'create-lead', title: 'Preparar a carteira', subtitle: 'Cadastrar, importar ou garimpar contatos úteis.', sellerGoal: 'Trabalhar com contatos identificados, sem duplicidade e com dados suficientes para agir.' },
  { id: 'first-contact', articleId: 'calling-focus', title: 'Fazer o primeiro contato', subtitle: 'Ligar ou abordar com contexto.', sellerGoal: 'Entrar em contato com objetivo claro, roteiro adequado e registro do resultado.' },
  { id: 'qualify', articleId: 'pipeline-work', title: 'Qualificar e avançar', subtitle: 'Mover o negócio somente com critério.', sellerGoal: 'Entender estágio, valor, decisores, risco e próxima ação antes de avançar no pipeline.' },
  { id: 'follow', articleId: 'followup-daily', title: 'Manter follow-up', subtitle: 'Nunca deixar uma oportunidade sem próximo passo.', sellerGoal: 'Garantir que cada negócio ativo tenha responsável, data e ação seguinte claramente definidos.' },
  { id: 'proposal', articleId: 'proposal-create', title: 'Enviar proposta', subtitle: 'Usar catálogo, valor e forecast.', sellerGoal: 'Transformar a oportunidade em uma proposta rastreável e acompanhar resposta, validade e receita.' },
  { id: 'communicate', articleId: 'communications', title: 'Conduzir a conversa', subtitle: 'Centralizar WhatsApp, e-mail e outros canais.', sellerGoal: 'Manter o histórico completo da negociação sem depender da memória do vendedor.' },
  { id: 'manage', articleId: 'revenue-forecast', title: 'Fechar e aprender', subtitle: 'Usar forecast, metas e métricas para ajustar a operação.', sellerGoal: 'Entender o que deve fechar, o que está em risco e onde a rotina comercial precisa melhorar.' },
]

const readProgress = () => {
  try {
    const parsed = JSON.parse(safeStorage.getItem(progressKey) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch { return [] }
}

export function QuickHelpModal({ open, onClose }: QuickHelpModalProps) {
  const { repositoryMode } = useAppWorkspace()
  const { route, setRoute } = useAppNavigation()
  const [mode, setMode] = useState<HelpMode>('journey')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'Todos' | HelpCategory>('Todos')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [journeyId, setJourneyId] = useState(SELLER_JOURNEY[0].id)
  const [completed, setCompleted] = useState<string[]>(readProgress)

  useEffect(() => {
    if (!open) return
    if (query.trim()) setMode('library')
  }, [open, query])

  const results = useMemo(() => searchHelpArticles(query, route, 40).filter((article) => category === 'Todos' || article.category === category), [category, query, route])
  const selected = useMemo<HelpArticle | null>(() => results.find((article) => article.id === selectedId) ?? results[0] ?? null, [results, selectedId])
  const contextual = useMemo(() => HELP_ARTICLES.filter((article) => article.route === route).slice(0, 6), [route])
  const journeyStep = SELLER_JOURNEY.find((item) => item.id === journeyId) ?? SELLER_JOURNEY[0]
  const journeyArticle = findHelpArticle(journeyStep.articleId)
  const progress = Math.round(completed.filter((id) => SELLER_JOURNEY.some((step) => step.id === id)).length / SELLER_JOURNEY.length * 100)

  const navigateArticle = (article: HelpArticle) => {
    if (!article.route) return
    setRoute(article.route)
    onClose()
  }
  const startTour = (tourId: string) => {
    window.dispatchEvent(new CustomEvent('crm:help-start-tour', { detail: { tourId } }))
    onClose()
  }
  const askAssistant = (article?: HelpArticle, override?: string) => {
    const prompt = override ?? (article ? `Como faço ${article.title.toLowerCase()} no CRM e qual é o objetivo comercial dessa etapa?` : query.trim() ? `Como faço ${query.trim()} no CRM?` : 'Me ensine o fluxo comercial ideal dentro do RealTalent CRM.')
    window.dispatchEvent(new CustomEvent('crm:assistant-open', { detail: { prompt } }))
    onClose()
  }
  const toggleJourneyComplete = (id: string) => {
    setCompleted((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      safeStorage.setItem(progressKey, JSON.stringify(next))
      return next
    })
  }
  const openContextual = (article: HelpArticle) => {
    setSelectedId(article.id)
    setMode('library')
  }

  return <Modal open={open} onClose={onClose} size="xl" title="Central de Ajuda" subtitle="Aprenda o fluxo comercial, entenda cada tela e execute a próxima ação sem sair do contexto.">
    <div className="help-academy-v10096">
      <section className="help-academy-v10096__hero">
        <div><span className="eyebrow"><GraduationCap size={15}/> V100.96 · Guided Selling & Help</span><h2>Aprenda o processo, não apenas os botões.</h2><p>A Central de Ajuda agora explica como o vendedor deve trabalhar no CRM, conecta cada etapa à tela correta e mantém acesso direto ao RealTalent Assistant.</p></div>
        <div className="help-academy-v10096__hero-actions"><Button variant="secondary" onClick={() => setMode('screen')}><Compass size={16}/> Ajuda desta tela</Button><Button onClick={() => askAssistant()}><Bot size={16}/> Perguntar ao Assistant</Button></div>
      </section>

      <nav className="help-academy-v10096__mode" aria-label="Seções da Central de Ajuda">
        <button type="button" className={mode === 'journey' ? 'is-active' : ''} onClick={() => setMode('journey')}>Jornada do vendedor</button>
        <button type="button" className={mode === 'screen' ? 'is-active' : ''} onClick={() => setMode('screen')}>Ajuda desta tela</button>
        <button type="button" className={mode === 'library' ? 'is-active' : ''} onClick={() => setMode('library')}>Biblioteca</button>
        <button type="button" className={mode === 'tours' ? 'is-active' : ''} onClick={() => setMode('tours')}>Tours guiados</button>
      </nav>

      {mode === 'journey' ? <section className="help-academy-v10096__journey">
        <aside className="help-academy-v10096__journey-nav">
          <div className="help-academy-v10096__progress"><header><strong>Seu roteiro comercial</strong><span>{completed.length}/{SELLER_JOURNEY.length} concluído(s)</span></header><div className="help-academy-v10096__progress-bar"><i style={{ width: `${progress}%` }}/></div></div>
          <div className="help-academy-v10096__steps">{SELLER_JOURNEY.map((step, index) => {
            const done = completed.includes(step.id)
            return <button key={step.id} type="button" className={`help-academy-v10096__step ${journeyId === step.id ? 'is-active' : ''} ${done ? 'is-done' : ''}`} onClick={() => setJourneyId(step.id)}><span className="help-academy-v10096__step-number">{done ? <Check size={14}/> : index + 1}</span><span className="help-academy-v10096__step-copy"><strong>{step.title}</strong><span>{step.subtitle}</span></span><ChevronRight size={15}/></button>
          })}</div>
        </aside>
        <article className="help-academy-v10096__journey-detail">
          <header><span>Etapa {SELLER_JOURNEY.findIndex((item) => item.id === journeyStep.id) + 1} de {SELLER_JOURNEY.length}</span><h3>{journeyStep.title}</h3><p>{journeyArticle?.summary ?? journeyStep.subtitle}</p></header>
          <div className="help-academy-v10096__seller-goal"><Target size={19}/><div><strong>Objetivo do vendedor</strong><p>{journeyStep.sellerGoal}</p></div></div>
          {journeyArticle ? <div className="help-academy-v10096__checklist">{journeyArticle.steps.map((step, index) => <div key={step}><span>{index + 1}</span><p>{step}</p></div>)}</div> : null}
          {journeyArticle?.tips?.[0] ? <div className="help-academy-v10096__tip"><Sparkles size={17}/><p>{journeyArticle.tips[0]}</p></div> : null}
          <div className="help-academy-v10096__detail-actions">
            {journeyArticle?.route ? <Button onClick={() => navigateArticle(journeyArticle)}>Ir para a função <ArrowRight size={16}/></Button> : null}
            <Button variant="secondary" onClick={() => askAssistant(journeyArticle ?? undefined, `Me ensine a etapa "${journeyStep.title}" do processo comercial e diga o que devo fazer agora no CRM.`)}><Bot size={16}/> Perguntar ao Assistant</Button>
            <Button variant="secondary" onClick={() => toggleJourneyComplete(journeyStep.id)}>{completed.includes(journeyStep.id) ? <CheckCircle2 size={16}/> : <ListChecks size={16}/>} {completed.includes(journeyStep.id) ? 'Concluído' : 'Marcar como concluído'}</Button>
          </div>
        </article>
      </section> : null}

      {mode === 'screen' ? <section className="help-academy-v10096__library">
        <div className="help-academy-v10096__seller-goal"><Compass size={19}/><div><strong>Você está em: {route}</strong><p>Os guias abaixo são específicos para a tela atual. Escolha um para entender o objetivo, o passo a passo e abrir a função correta.</p></div></div>
        <div className="help-academy-v10096__context-grid">{contextual.length ? contextual.map((article) => <button key={article.id} type="button" className="help-academy-v10096__context-card" onClick={() => openContextual(article)}><strong>{article.title}</strong><p>{article.summary}</p><ChevronRight size={16}/></button>) : <button type="button" className="help-academy-v10096__context-card" onClick={() => askAssistant(undefined, `Explique como devo usar a tela ${route} e qual é o objetivo comercial dela.`)}><strong>Entender esta tela</strong><p>O Assistant pode explicar o papel desta área no processo comercial.</p><Bot size={16}/></button>}</div>
      </section> : null}

      {mode === 'library' ? <section className="help-academy-v10096__library">
        <div className="help-academy-v10096__search"><Search size={18}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: configurar WhatsApp, criar proposta, preparar ligação..."/><span>{results.length}</span></div>
        <div className="help-academy-v10096__categories">{categories.map((item) => <button key={item} type="button" className={category === item ? 'is-active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
        <div className="help-academy-v10096__library-workspace">
          <div className="help-academy-v10096__library-results">{results.map((article) => <button key={article.id} type="button" className={`help-academy-v10096__article-button ${selected?.id === article.id ? 'is-active' : ''}`} onClick={() => setSelectedId(article.id)}><small>{article.category}</small><strong>{article.title}</strong><p>{article.summary}</p><ChevronRight size={15}/></button>)}</div>
          <article className="help-academy-v10096__library-detail">{selected ? <><header><span className="eyebrow"><BookOpenCheck size={14}/> {selected.category}</span><h3>{selected.title}</h3><p>{selected.summary}</p></header><div className="help-academy-v10096__checklist">{selected.steps.map((step, index) => <div key={step}><span>{index + 1}</span><p>{step}</p></div>)}</div>{selected.tips?.[0] ? <div className="help-academy-v10096__tip"><Sparkles size={17}/><p>{selected.tips[0]}</p></div> : null}<div className="help-academy-v10096__detail-actions">{selected.route ? <Button onClick={() => navigateArticle(selected)}>Ir para a função <ArrowRight size={16}/></Button> : null}<Button variant="secondary" onClick={() => askAssistant(selected)}><Bot size={16}/> Perguntar ao Assistant</Button></div></> : <div><strong>Nenhum guia encontrado</strong><p>Tente buscar por pipeline, WhatsApp, proposta, ligação, forecast ou automação.</p></div>}</article>
        </div>
      </section> : null}

      {mode === 'tours' ? <section className="help-academy-v10096__tours">{GUIDED_TOURS.map((tour) => <div className="help-academy-v10096__tour" key={tour.id}><span>{tour.audience}</span><strong>{tour.title}</strong><p>{tour.description}</p><small>{tour.steps.length} etapas</small><Button variant="secondary" size="sm" onClick={() => startTour(tour.id)}><Play size={14}/> Iniciar tour</Button></div>)}</section> : null}

      <aside className="help-academy-v10096__storage"><Database size={19}/><div><strong>{repositoryMode === 'local' ? 'Modo local' : 'Modo online'}</strong><p>{repositoryMode === 'local' ? 'Seu progresso de aprendizagem e os dados deste ambiente ficam neste navegador. Faça backup antes de trocar de computador ou limpar dados.' : 'Os dados pertencem ao workspace autorizado. Permissões e integrações seguem a configuração do ambiente.'}</p></div><CheckCircle2 size={18}/></aside>
    </div>
  </Modal>
}
