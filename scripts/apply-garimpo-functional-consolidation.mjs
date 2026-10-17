import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const write = (path, content) => fs.writeFileSync(path, content)
const replaceRequired = (source, from, to, label) => {
  if (!source.includes(from)) throw new Error(`Garimpo consolidation: missing ${label}`)
  return source.replace(from, to)
}

// 1) Redesign: remove fake SVG map and host the canonical real territory controls.
{
  const path = 'src/features/prospecting/prospecting-redesign.tsx'
  let s = read(path)
  s = replaceRequired(s,
    "import { ArrowRight, Building2, CheckCircle2, MapPinned, Pause, Play, Plus, Search, ShieldCheck, Sparkles, Upload, X } from 'lucide-react'",
    "import { ArrowRight, CheckCircle2, MapPinned, Pause, Play, Plus, Search, ShieldCheck, Sparkles, Upload, X } from 'lucide-react'",
    'redesign icon import')
  s = replaceRequired(s,
    "import { useMemo, useState, type ReactNode } from 'react'",
    "import { useState, type ReactNode } from 'react'",
    'redesign react import')
  s = replaceRequired(s, '  attentionCount: number\n', '  attentionCount: number\n  mapPanel: ReactNode\n', 'mapPanel prop')
  s = replaceRequired(s,
    "  const coverage = props.job?.coverage?.successfulTerritoryPercent ?? props.job?.coverage?.territoryPercent\n  const progress = Math.max(0, Math.min(100, Math.round(coverage ?? (props.job?.status === 'completed' ? 100 : (found / Math.max(1, target)) * 100))))",
    "  const coverage = props.job?.coverage?.successfulTerritoryPercent ?? props.job?.coverage?.territoryPercent\n  const executionFinished = Boolean(props.job && ['completed', 'failed', 'cancelled'].includes(props.job.status))\n  const progress = executionFinished ? 100 : Math.max(0, Math.min(99, Math.round((found / Math.max(1, target)) * 100)))\n  const coverageLabel = coverage == null ? 'não medida' : `${Math.round(coverage)}%`\n  const coverageFailed = Number(props.job?.coverage?.failedCells ?? 0) > 0",
    'execution progress')
  s = s.replace("const sourceLabel = props.job?.runtime?.currentSource || props.job?.progress.currentSource || 'OpenStreetMap + Web'", "const sourceLabel = props.job?.runtime?.currentSource || props.job?.progress.currentSource || 'Web pública + OpenStreetMap'")
  s = s.replace(/\n  const markers = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[props\.job\]\)\n/, '\n')
  s = s.replace("props.agentHealth?.ok ? `Motor local ativo · V${props.agentHealth.version}` : 'Motor local será verificado ao iniciar'", "props.agentHealth?.ok ? `Serviço do Garimpo ativo · V${props.agentHealth.version}` : 'Serviço do Garimpo será verificado ao iniciar'")
  s = s.replace('<strong>{found}</strong><span>Encontradas</span>', '<strong>{found}</strong><span>Encontradas agora</span>')
  s = s.replace('<strong>{ready}</strong><span>Prontas</span>', '<strong>{ready}</strong><span>Prontas agora</span>')
  s = s.replace('<small>{raw} bruto(s) · {rejected} filtrado(s) · {duplicates} duplicidade(s) · Base total {props.baseTotal} · {props.sentCount} enviadas ao CRM</small>', '<small>{raw} bruto(s) · {rejected} filtrado(s) · {duplicates} duplicidade(s) · <span aria-label="Base total">Base total {props.baseTotal}</span> · {props.sentCount} enviadas ao CRM</small>')

  const start = s.indexOf('    <section className="prospecting-redesign-v4__map"')
  const endMarker = '    </section>\n  </div>\n}'
  const endStart = s.indexOf(endMarker, start)
  if (start < 0 || endStart < 0) throw new Error('Garimpo consolidation: fake map section not found')
  const end = endStart + '    </section>'.length
  const realMap = `    <section className="prospecting-redesign-v4__map prospecting-redesign-v4__map-live" aria-label={\`Território da execução em \${sessionCity || 'sua região'}\`}>
      <div className="prospecting-redesign-v4__map-live-content">{props.mapPanel}</div>
      <div className={\`prospecting-redesign-v4__map-status \${coverageFailed ? 'is-warning' : ''}\`}>
        {props.job ? <><CheckCircle2 size={17}/><strong>{found} empresa(s) identificada(s).</strong><span> Execução {executionFinished ? 'encerrada' : 'em andamento'} · cobertura territorial {coverageLabel}{coverageFailed ? ' · fonte territorial com falha parcial' : ''}.</span></> : <><MapPinned size={17}/><strong>Defina a área real da busca.</strong><span> Carregue a cidade e ajuste o raio ou desenhe o território diretamente no mapa.</span></>}
      </div>
    </section>`
  s = s.slice(0, start) + realMap + s.slice(end)
  write(path, s)
}

// 2) Canonical page: cloud copy, fast defaults, real map injection, honest readiness and new-search reset.
{
  const path = 'src/features/prospecting/prospecting-page.tsx'
  let s = read(path)
  const originAnchor = "const prospectPlaceConfidence = (prospect: ProspectRecord) => Math.max(0, Math.min(100, rawNumber(prospect.rawData, 'placeConfidence') ?? (prospectGeoPoint(prospect) ? 100 : 55)))\n"
  const originHelper = `${originAnchor}const prospectOriginLabel = (prospect: ProspectRecord) => {\n  const provider = rawText(prospect.rawData, 'provider').toLocaleLowerCase('pt-BR')\n  if (provider.includes('openstreetmap') || provider.startsWith('osm') || rawText(prospect.rawData, 'osmId')) return 'OpenStreetMap'\n  if (provider.startsWith('web')) return 'Web pública'\n  if (prospect.source === 'extension') return 'RT Capture Browser'\n  return prospectSourceLabels[prospect.source]\n}\n`
  s = replaceRequired(s, originAnchor, originHelper, 'origin helper anchor')
  s = s.replace("    && Boolean(prospectGeoPoint(prospect) || prospect.city)\n", "    && Boolean(prospectGeoPoint(prospect))\n")
  s = s.replace("  if (!prospectGeoPoint(prospect) && !prospect.city) reasons.push('Localização não confirmada')\n", "  if (!prospectGeoPoint(prospect)) reasons.push('Coordenadas não confirmadas no território')\n")
  s = s.replace("const [searchMode, setSearchMode] = useState<ProspectingSearchMode>('coverage')", "const [searchMode, setSearchMode] = useState<ProspectingSearchMode>('fast')")
  s = s.replace("const [targetMode, setTargetMode] = useState<ProspectingTargetMode>('max')", "const [targetMode, setTargetMode] = useState<ProspectingTargetMode>('quantity')")
  s = s.replace("notify('warning', 'Motor local desconectado. Inicie o CRM pelo start-linux.sh ou instale o serviço do Agent e tente novamente.')", "notify('warning', 'Serviço do Garimpo indisponível. Verifique a conexão com o runtime em nuvem e tente novamente.')")
  s = s.replaceAll('enrichWeb: true, enrichCnpj: true, browserFallback: true', "enrichWeb: searchMode !== 'fast', enrichCnpj: searchMode !== 'fast', browserFallback: searchMode !== 'fast'")
  s = s.replace("notify('success', 'Garimpo enviado para o motor local. A busca começou no Linux.')", "notify('success', 'Garimpo iniciado. No modo Captura rápida, as primeiras empresas aparecem antes do enriquecimento completo.')")
  s = s.replaceAll('`Garimpo · ${prospectSourceLabels[prospect.source]}`', '`Garimpo · ${prospectOriginLabel(prospect)}`')

  const cityAnchor = "  const changeProspectingCity = (value: string) => {\n"
  const reset = `  const resetProspectingSearch = () => {\n    setTab('search')\n    setSegment('')\n    setCity('')\n    setQuery('')\n    setQuantity(40)\n    setAreaMode('radius')\n    setRadiusKm(15)\n    setSearchMode('fast')\n    setTargetMode('quantity')\n    setCategoryMode('exact')\n    setMapPreview(null)\n    setSearchCenter(null)\n    setMapPolygon([])\n    setAgentJob(null)\n    setShowTechnical(false)\n    setSelectedIds(new Set())\n  }\n\n`
  s = replaceRequired(s, cityAnchor, reset + cityAnchor, 'new search reset')
  s = replaceRequired(s,
    "        onNewSearch={() => {\n          setTab('search')\n          window.setTimeout(() => document.getElementById('prospecting-linux-segment')?.focus(), 0)\n        }}",
    "        onNewSearch={() => {\n          resetProspectingSearch()\n          window.setTimeout(() => document.getElementById('prospecting-linux-segment')?.focus(), 0)\n        }}",
    'new search handler')
  const mapNeedle = '            attentionCount={metrics.attention}\n'
  const mapProp = `            attentionCount={metrics.attention}
            mapPanel={areaMode === 'map' ? <TerritoryAreaSelector
              preview={mapPreview}
              polygon={mapPolygon}
              busy={mapPreviewBusy}
              disabled={!canWrite || Boolean(agentJob && ['queued', 'running', 'paused'].includes(agentJob.status))}
              onLoad={() => void loadMapTerritory()}
              onPolygon={setMapPolygon}
            /> : <SearchTerritoryPlanner
              preview={mapPreview}
              center={searchCenter}
              areaMode={areaMode}
              radiusKm={radiusKm}
              polygon={mapPolygon}
              busy={mapPreviewBusy}
              disabled={!canWrite || Boolean(agentJob && ['queued', 'running', 'paused'].includes(agentJob.status))}
              searchMode={searchMode}
              onLoad={() => void loadMapTerritory()}
              onRadiusKm={setRadiusKm}
              onCenter={setSearchCenter}
            />}
`
  s = replaceRequired(s, mapNeedle, mapProp, 'real map panel injection')
  s = s.replaceAll("props.searchMode === 'coverage' ? 'Máxima cobertura' : props.searchMode === 'fast' ? 'Mais rápida' : 'Menor consumo'", "props.searchMode === 'coverage' ? 'Máxima cobertura' : props.searchMode === 'fast' ? 'Captura rápida' : 'Menor consumo'")
  s = s.replaceAll("{ value: 'fast', label: 'Mais rápida', description: 'Reduz consultas e células' }", "{ value: 'fast', label: 'Captura rápida', description: 'Web e captura primeiro; mostra empresas antes da varredura profunda' }")
  s = s.replace('<strong>+ Adicionar empresas por outras fontes</strong><span>Google Maps assistido, Instagram, CNPJ, navegador ou entrada manual</span>', '<strong>Capturar do navegador / Google Maps</strong><span>Use a captura assistida para trazer os resultados visíveis para o Garimpo e enriquecer depois.</span>')
  s = s.replaceAll('{prospectSourceLabels[prospect.source]}', '{prospectOriginLabel(prospect)}')
  s = s.replace("  const readyCount = prospects.filter((item) => prospectDataQuality(item).readiness === 'ready').length\n", "  const readyCount = prospects.filter(prospectIsAutoValidatable).length\n")
  s = s.replace("  const smartEligible = selectableProspects.filter((item) => prospectDataQuality(item).readiness === 'ready' && item.duplicateLevel === 'none' && prospectPlaceConfidence(item) >= 65 && Boolean(prospectGeoPoint(item) || item.city))\n", "  const smartEligible = selectableProspects.filter(prospectIsAutoValidatable)\n")
  write(path, s)
}

// 3) Frontend sanitizer: directory pages are evidence; geometry is required for radius/polygon readiness.
{
  const path = 'src/services/prospecting-linux-agent.ts'
  let s = read(path)
  s = replaceRequired(s,
    "const AGENT_CONTENT_NOISE = /\\b(?:the\\s+best(?:\\s+\\d+)?|top\\s*\\d+|best\\s+\\d+|melhores|ranking|lista\\s+de|guia\\s+de|reviews?|directory|diret[oó]rio|artigo|blog|curso|vaga|emprego|near\\s+me|perto\\s+de\\s+mim)\\b/i",
    "const AGENT_CONTENT_NOISE = /\\b(?:the\\s+best(?:\\s+\\d+)?|top\\s*\\d+|best\\s+\\d+|encontre\\s+(?:a|o)\\s+melhor|melhor(?:es)?|ranking|lista\\s+de|guia\\s+de|reviews?|directory|diret[oó]rio|artigo|blog|curso|vaga|emprego|near\\s+me|perto\\s+de\\s+mim)\\b/i",
    'content noise filter')
  s = replaceRequired(s,
    "const AGENT_DIRECTORY_HOST = /(^|\\.)(?:yelp\\.|tripadvisor\\.|foursquare\\.com|guiamais\\.com\\.br|telelistas\\.net|solutudo\\.com\\.br|apontador\\.com\\.br|listamais\\.com\\.br)/i",
    "const AGENT_DIRECTORY_HOST = /(^|\\.)(?:yelp\\.|tripadvisor\\.|foursquare\\.com|guiamais\\.com\\.br|telelistas\\.net|solutudo\\.com\\.br|apontador\\.com\\.br|listamais\\.com\\.br|locaisdobrasil\\.com\\.br|brasillocais\\.com)/i",
    'directory hosts')
  s = s.replace("function sanitizeAgentCandidate<T extends ProspectingAgentJob['results'][number]>(candidate: T): T | null {", "function sanitizeAgentCandidate<T extends ProspectingAgentJob['results'][number]>(candidate: T, areaMode?: ProspectingAreaMode): T | null {")
  s = replaceRequired(s,
    "  if (AGENT_CONTENT_NOISE.test(name) || AGENT_DIRECTORY_HOST.test(host) || ['directory', 'content', 'web_document'].includes(placeType) || provider === 'web_coverage_hint') return null\n",
    "  if (AGENT_CONTENT_NOISE.test(name) || ['directory', 'content', 'web_document'].includes(placeType) || provider === 'web_coverage_hint') return null\n  if (AGENT_DIRECTORY_HOST.test(host)) {\n    sanitized.website = ''\n    sanitized.sourceDetail = sanitized.sourceDetail || 'Diretório público usado como evidência de descoberta'\n    sanitized.qualityStatus = 'attention'\n    sanitized.reviewReason = 'directory_evidence'\n  }\n",
    'directory evidence handling')
  s = replaceRequired(s,
    "  if (sanitized.qualityStatus === 'ready' && (!hasIdentity || geoScore < 68 || placeType === 'unknown')) {\n    sanitized.qualityStatus = 'attention'\n    sanitized.reviewReason = geoScore < 68 ? 'location_not_confirmed' : 'business_identity_not_confirmed'\n  }",
    "  const geometryRequired = areaMode === 'radius' || areaMode === 'map'\n  if (sanitized.qualityStatus === 'ready' && (!hasIdentity || geoScore < 68 || placeType === 'unknown' || (geometryRequired && !hasCoordinates))) {\n    sanitized.qualityStatus = 'attention'\n    sanitized.reviewReason = geometryRequired && !hasCoordinates ? 'coordinates_not_confirmed' : geoScore < 68 ? 'location_not_confirmed' : 'business_identity_not_confirmed'\n  }",
    'geometry readiness')
  s = s.replace('rawResults.map((candidate) => sanitizeAgentCandidate(candidate))', 'rawResults.map((candidate) => sanitizeAgentCandidate(candidate, job.input.areaMode))')
  write(path, s)
}

// 4) Both runtime copies: fast web-first is canonical instead of an untracked hot patch.
const applyWebFirst = (path) => {
  let s = read(path)
  s = s.replaceAll("searchMode: ['coverage', 'fast', 'economy'].includes(job.input?.searchMode) ? job.input.searchMode : 'coverage'", "searchMode: ['coverage', 'fast', 'economy'].includes(job.input?.searchMode) ? job.input.searchMode : 'fast'")
  s = s.replaceAll("searchMode: ['coverage', 'fast', 'economy'].includes(input.searchMode) ? input.searchMode : 'coverage'", "searchMode: ['coverage', 'fast', 'economy'].includes(input.searchMode) ? input.searchMode : 'fast'")
  s = s.replaceAll("searchMode: ['coverage','fast','economy'].includes(body.searchMode) ? body.searchMode : 'coverage'", "searchMode: ['coverage','fast','economy'].includes(body.searchMode) ? body.searchMode : 'fast'")
  const anchor = "    if (!job.plan?.plannedAt || !Array.isArray(job.plan.cells) || !job.plan.cells.length) await buildSearchPlan(job)\n\n    let cursor = 0\n"
  const block = "    if (!job.plan?.plannedAt || !Array.isArray(job.plan.cells) || !job.plan.cells.length) await buildSearchPlan(job)\n\n    let fastWebAttempted = false\n    if (job.input.searchMode === 'fast' && WEB_SEARCH_ENABLED && job.input.areaMode !== 'map' && !shouldStopForTarget(job)) {\n      fastWebAttempted = true\n      setRuntimePhase(job, 'discovering_web', 'Busca rápida: procurando empresas na web pública primeiro…')\n      const beforeFastWeb = job.plan.providerRuns.length\n      await runWebPlanner(job, seen)\n      const fastWebRuns = job.plan.providerRuns.slice(beforeFastWeb).filter((item) => item.provider === 'web')\n      const completedFastWebRuns = fastWebRuns.filter((item) => item.status === 'completed')\n      const failedFastWebRuns = fastWebRuns.filter((item) => item.status === 'failed')\n      if (completedFastWebRuns.length) successfulProviders += 1\n      job.coverage.validRuns = Number(job.coverage.validRuns || 0) + completedFastWebRuns.length\n      job.coverage.failedRuns = Number(job.coverage.failedRuns || 0) + failedFastWebRuns.length\n      providerErrors.push(...failedFastWebRuns.map((item) => item.error))\n      finishRuntimeSource(job, 'web', completedFastWebRuns.length > 0 || failedFastWebRuns.length === 0)\n      if (shouldStopForTarget(job)) appendRuntimeEvent(job, 'fast_target', `Busca rápida atingiu a meta com ${job.results.length} empresa(s) antes da varredura territorial pesada.`, { unique: job.results.length })\n    }\n\n    let cursor = 0\n"
  s = replaceRequired(s, anchor, block, `${path} fast-first anchor`)
  s = replaceRequired(s, "    if (!shouldStopForTarget(job) && WEB_SEARCH_ENABLED && job.input.areaMode !== 'map') {", "    if (!fastWebAttempted && !shouldStopForTarget(job) && WEB_SEARCH_ENABLED && job.input.areaMode !== 'map') {", `${path} web second pass`)
  write(path, s)
}
applyWebFirst('scripts/realtalent-prospecting-agent.mjs')
applyWebFirst('runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/scripts/realtalent-prospecting-agent.mjs')

// 5) Layout styles for the real map inside the redesign.
{
  const path = 'src/styles/prospecting-workspace.css'
  let s = read(path)
  const marker = '/* Garimpo functional consolidation: the redesign now hosts the real OSM territory controls. */'
  if (!s.includes(marker)) s += `\n${marker}\n.prospecting-redesign-v4__map-live{display:flex;flex-direction:column;min-height:640px;background:var(--workspace-surface,#fff);overflow:hidden}\n.prospecting-redesign-v4__map-live-content{position:relative;flex:1;min-height:560px;padding:12px}\n.prospecting-redesign-v4__map-live-content>.prospecting-radius-planner-v101104,.prospecting-redesign-v4__map-live-content>.prospecting-territory-selector-v101103-h1{height:100%;min-height:536px}\n.prospecting-redesign-v4__map-live .prospecting-redesign-v4__map-status{position:static;border-radius:0;border:0;border-top:1px solid #e4e7ec;box-shadow:none;margin:0}\n.prospecting-redesign-v4__map-live .prospecting-redesign-v4__map-status.is-warning{background:#fff8e8;color:#8a4b08}\n`
  write(path, s)
}

// 6) Vercel source is canonical: no build-time patch.
{
  const path = 'vercel.json'
  const v = JSON.parse(read(path))
  v.buildCommand = 'npm run typecheck && npm run build'
  write(path, JSON.stringify(v, null, 2) + '\n')
  if (fs.existsSync('scripts/patch-preview-cloud-prospecting-ui.mjs')) fs.unlinkSync('scripts/patch-preview-cloud-prospecting-ui.mjs')
}

// 7) Existing H21 audit follows the redesign location of current-run metrics.
{
  const path = 'scripts/v101_11_3_h21_1_garimpo_coverage_runtime_truth_audit.mjs'
  let s = read(path)
  s = replaceRequired(s, "const page=read('src/features/prospecting/prospecting-page.tsx')\n", "const page=read('src/features/prospecting/prospecting-page.tsx')\nconst redesign=read('src/features/prospecting/prospecting-redesign.tsx')\n", 'H21 redesign source')
  s = replaceRequired(s,
    "ok('topo distingue execução atual de base total',page.includes(\"'Encontradas agora'\")&&page.includes(\"'Prontas agora'\")&&page.includes('label=\"Base total\"'))",
    "ok('topo distingue execução atual de base total',(page.includes(\"'Encontradas agora'\")||redesign.includes('Encontradas agora'))&&(page.includes(\"'Prontas agora'\")||redesign.includes('Prontas agora'))&&(page.includes('label=\"Base total\"')||redesign.includes('aria-label=\"Base total\"')))",
    'H21 current/base metrics')
  write(path, s)
}

// 8) Dedicated regression gate.
{
  const qa = `import fs from 'node:fs'\n\nconst read = (path) => fs.readFileSync(new URL(\`../\${path}\`, import.meta.url), 'utf8')\nconst exists = (path) => fs.existsSync(new URL(\`../\${path}\`, import.meta.url))\nconst page = read('src/features/prospecting/prospecting-page.tsx')\nconst redesign = read('src/features/prospecting/prospecting-redesign.tsx')\nconst service = read('src/services/prospecting-linux-agent.ts')\nconst vercel = JSON.parse(read('vercel.json'))\nconst checks = []\nconst ok = (name, value) => { checks.push([name, Boolean(value)]); console.log(\`\${value ? 'OK  ' : 'FAIL'} \${name}\`) }\n\nok('redesign recebe mapa funcional canônico', redesign.includes('mapPanel: ReactNode') && redesign.includes('{props.mapPanel}'))\nok('mapa ilustrativo removido', !redesign.includes('prospecting-redesign-v4__map-ground') && !redesign.includes('prospecting-redesign-v4__map-water') && !redesign.includes('prospecting-redesign-v4__zoom'))\nok('tela nova usa seletor real de raio e polígono', page.includes(\"mapPanel={areaMode === 'map' ? <TerritoryAreaSelector\") && page.includes(': <SearchTerritoryPlanner'))\nok('desenho exige polígono real', page.includes(\"areaMode === 'map' && mapPolygon.length < 3\"))\nok('nova busca limpa sessão anterior', page.includes('const resetProspectingSearch') && page.includes(\"setSegment('')\") && page.includes(\"setCity('')\") && page.includes('setAgentJob(null)') && page.includes('setMapPolygon([])'))\nok('captura rápida é padrão canônico', page.includes(\"useState<ProspectingSearchMode>('fast')\") && page.includes(\"useState<ProspectingTargetMode>('quantity')\"))\nok('build não muta código-fonte', vercel.buildCommand === 'npm run typecheck && npm run build' && !exists('scripts/patch-preview-cloud-prospecting-ui.mjs'))\nok('pronta exige coordenada confirmada', page.includes('&& Boolean(prospectGeoPoint(prospect))') && page.includes('prospects.filter(prospectIsAutoValidatable)'))\nok('diretórios são evidência e não site canônico', service.includes('directory_evidence') && service.includes(\"sanitized.website = ''\") && service.includes('locaisdobrasil') && service.includes('brasillocais'))\nok('raio/área desenhada exigem geometria para ready', service.includes(\"areaMode === 'radius' || areaMode === 'map'\") && service.includes('coordinates_not_confirmed'))\nok('origem automática não aparece como Manual', page.includes('const prospectOriginLabel') && page.includes(\"return 'Web pública'\") && page.includes(\"return 'OpenStreetMap'\"))\nok('execução concluída não usa cobertura como progresso', redesign.includes('executionFinished ? 100') && redesign.includes('coverageLabel'))\n\nconst failed = checks.filter(([, value]) => !value)\nconsole.log(\`\\nGarimpo Functional Consolidation: \${checks.length - failed.length}/\${checks.length}\`)\nif (failed.length) process.exit(1)\n`
  write('scripts/prospecting-functional-consolidation-audit.mjs', qa)
  const pkg = JSON.parse(read('package.json'))
  pkg.scripts['qa:prospecting:functional'] = 'node scripts/prospecting-functional-consolidation-audit.mjs'
  write('package.json', JSON.stringify(pkg, null, 2) + '\n')
}

console.log('Garimpo functional consolidation applied.')
