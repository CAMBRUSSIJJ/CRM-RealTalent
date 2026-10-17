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
  ["openExternalUrl('http://127.0.0.1:4319/')", "openExternalUrl('/api/runtime/prospecting/health')"],
  ['<ExternalLink size={16}/> Abrir diagnóstico', '<ExternalLink size={16}/> Ver status do serviço'],
  ["const [searchMode, setSearchMode] = useState<ProspectingSearchMode>('coverage')", "const [searchMode, setSearchMode] = useState<ProspectingSearchMode>('fast')"],
  ["const [targetMode, setTargetMode] = useState<ProspectingTargetMode>('max')", "const [targetMode, setTargetMode] = useState<ProspectingTargetMode>('quantity')"],
  ['enrichWeb: true, enrichCnpj: true, browserFallback: true', "enrichWeb: searchMode !== 'fast', enrichCnpj: searchMode !== 'fast', browserFallback: searchMode !== 'fast'"],
  ['Garimpo enviado para o motor local. A busca começou no Linux.', "Garimpo iniciado. No modo Rápido, as primeiras empresas aparecem antes do enriquecimento completo."],
]

for (const [from, to] of replacements) {
  if (!source.includes(from)) {
    throw new Error(`Preview Fast Discovery patch failed: expected text not found: ${from}`)
  }
  source = source.replaceAll(from, to)
}

await fs.writeFile(file, source, 'utf8')
console.log('[preview-cloud] Garimpo ajustado para runtime em nuvem + Fast Discovery')
