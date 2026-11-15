import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProspectingResearchSummary } from './prospecting-research-summary'
import { createProspect, refreshProspectAnalysis } from '../../services/prospecting-workspace'

it('apresenta cadastro, verificação e transferência como estados separados', () => {
  const prospect = refreshProspectAnalysis(createProspect('workspace', { company: 'Fainer Barber', phone: '51999990000', city: 'Canoas', website: 'https://fainer.com.br' }), [])
  const html = renderToStaticMarkup(<ProspectingResearchSummary prospect={prospect} result={null} />)
  expect(html).toContain('Cadastro suficiente')
  expect(html).toContain('Empresa em verificação')
  expect(html).toContain('Transferência pendente')
  expect(html).toContain('Confirmar identidade e localização')
  expect(html).toContain('Evidências e histórico de fontes')
  expect(html).toContain('<details')
  expect(html).not.toContain('Firecrawl + Crawl4AI + Ollama')
})
