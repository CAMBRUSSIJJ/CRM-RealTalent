import { ExternalLink, Sparkles } from 'lucide-react'
import { aiFieldLabels, researchForProspect, safeResearchUrl } from '../../services/prospecting-ai'
import type { ProspectRecord } from '../../services/prospecting-workspace'
import { formatDateTime } from '../../domain/formatters'

export function AiResearchCard({ prospect }: { prospect: ProspectRecord }) {
  const research = researchForProspect(prospect)
  if (!research) return null
  return <section className="panel prospecting-ai-research">
    <header><span className="eyebrow"><Sparkles size={14} /> Pesquisa com IA</span><small>{formatDateTime(research.researchedAt)}</small></header>
    <p>Confira as fontes antes de abordar. A pontuação indica completude dos campos.</p>
    {research.opportunity ? <div><strong>Hipótese comercial</strong><p>{research.opportunity}</p></div> : null}
    {research.suggestedApproach ? <div><strong>Sugestão de abordagem</strong><p>{research.suggestedApproach}</p></div> : null}
    <strong>Fontes e dados encontrados</strong>
    {research.sources.map((source) => {
      const url = safeResearchUrl(source.url)
      return url ? <div key={url}><a href={url} target="_blank" rel="noopener noreferrer">{source.title || new URL(url).hostname}<ExternalLink size={13} /></a><small>{research.evidence.filter((fact) => fact.sourceUrl === source.url).map((fact) => aiFieldLabels[fact.field]).join(' · ')}</small></div> : null
    })}
    {research.missingFields.length ? <div><strong>Não encontrados na pesquisa</strong><p>{research.missingFields.map((field) => aiFieldLabels[field]).join(' · ')}</p></div> : null}
  </section>
}
