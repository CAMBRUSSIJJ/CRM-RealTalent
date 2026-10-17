import fs from 'node:fs/promises'

// Preview-only cloud + Fast Discovery adjustments. Production/local source behavior is left untouched.
if (process.env.VERCEL_ENV !== 'preview') process.exit(0)

const file = new URL('../src/features/prospecting/prospecting-page.tsx', import.meta.url)
let source = await fs.readFile(file, 'utf8')

const replacements = [
  [
    'Motor local desconectado. Inicie o CRM pelo start-linux.sh ou instale o serviço do Agent e tente novamente.',
    'Serviço do Garimpo indisponível. Verifique a conexão com o runtime em nuvem e tente novamente.',
  ],
  ["agentOnline ? 'Garimpo pronto' : 'Motor local desconectado'", "agentOnline ? 'Garimpo pronto' : 'Serviço do Garimpo indisponível'"],
  ['O motor local não está conectado.', 'O serviço do Garimpo está indisponível.'],
  ['Abra o CRM pelo <code>start-linux.sh</code> ou mantenha o serviço <code>realtalent-prospecting-agent</code> ativo.', 'Tente reconectar. Se persistir, verifique o runtime em nuvem do Preview.'],
  [
    '<Button variant="secondary" onClick={() => openExternalUrl(\'http://127.0.0.1:4319/\')}><ExternalLink size={16}/> Abrir diagnóstico</Button>',
    '<Button variant="secondary" onClick={props.onAgentRefresh}><RefreshCw size={16}/> Verificar serviço</Button>',
  ],
  ["const [searchMode, setSearchMode] = useState<ProspectingSearchMode>('coverage')", "const [searchMode, setSearchMode] = useState<ProspectingSearchMode>('fast')"],
  ["const [targetMode, setTargetMode] = useState<ProspectingTargetMode>('max')", "const [targetMode, setTargetMode] = useState<ProspectingTargetMode>('quantity')"],
  ['enrichWeb: true, enrichCnpj: true, browserFallback: true', "enrichWeb: searchMode !== 'fast', enrichCnpj: searchMode !== 'fast', browserFallback: searchMode !== 'fast'"],
  ['Garimpo enviado para o motor local. A busca começou no Linux.', 'Garimpo iniciado. No modo Captura rápida, as primeiras empresas aparecem antes do enriquecimento completo.'],
  ["props.searchMode === 'coverage' ? 'Máxima cobertura' : props.searchMode === 'fast' ? 'Mais rápida' : 'Menor consumo'", "props.searchMode === 'coverage' ? 'Máxima cobertura' : props.searchMode === 'fast' ? 'Captura rápida' : 'Menor consumo'"],
  ["{ value: 'fast', label: 'Mais rápida', description: 'Reduz consultas e células' }", "{ value: 'fast', label: 'Captura rápida', description: 'Web e captura primeiro; mostra empresas antes da varredura profunda' }"],
  ['O motor local combina OpenStreetMap e web pública.', 'No modo Captura rápida, o Garimpo consulta web pública primeiro e mostra empresas assim que chegam; OpenStreetMap fica como apoio para território e cobertura.'],
  ['<strong>+ Adicionar empresas por outras fontes</strong><span>Google Maps assistido, Instagram, CNPJ, navegador ou entrada manual</span>', '<strong>Capturar do navegador / Google Maps</strong><span>Use a captura assistida para trazer os resultados visíveis para o Garimpo e enriquecer depois.</span>'],
]

for (const [from, to] of replacements) {
  if (!source.includes(from)) {
    throw new Error(`Preview Fast Discovery patch failed: expected text not found: ${from}`)
  }
  source = source.replaceAll(from, to)
}

const liveResultsMarker = 'prospecting-fast-results-v101113'
const liveResultsAnchor = '    <div className="prospecting-campaign-v101106__actions">'
if (!source.includes(liveResultsMarker)) {
  if (!source.includes(liveResultsAnchor)) throw new Error('Preview Fast Discovery patch failed: live results anchor not found')
  const liveResults = '    {job.results.length ? <div className="prospecting-campaign-v101106__facts prospecting-fast-results-v101113">{job.results.slice(-4).reverse().map((item, index) => <span key={(item.candidateId || item.company || item.name || \'prospect\') + \'-\' + index}><small>Chegando agora</small><strong>{item.company || item.name}</strong></span>)}</div> : null}\n'
  source = source.replace(liveResultsAnchor, liveResults + liveResultsAnchor)
}

await fs.writeFile(file, source, 'utf8')
console.log('[preview-cloud] Garimpo ajustado para runtime em nuvem + Fast Discovery + resultados progressivos')
