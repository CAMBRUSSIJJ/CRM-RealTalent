import { readFileSync } from 'node:fs'

const file = new URL('../src/features/pipeline/pipeline-page.tsx', import.meta.url)
const source = readFileSync(file, 'utf8')
const importMatch = source.match(/import\s*\{([\s\S]*?)\}\s*from\s*['"]lucide-react['"]/)
if (!importMatch) {
  console.error('✗ import lucide-react não encontrado em pipeline-page.tsx')
  process.exit(1)
}
const imported = new Set(importMatch[1].split(',').map((item) => item.trim()).filter(Boolean))
if (!source.includes('<Sparkles')) {
  console.error('✗ uso de Sparkles esperado no Pipeline Intelligence não encontrado')
  process.exit(1)
}
if (!imported.has('Sparkles')) {
  console.error('✗ Sparkles é usado, mas não está importado de lucide-react')
  process.exit(1)
}
console.log('✓ Pipeline Intelligence usa Sparkles com import válido')
console.log('V100.70.0 Hotfix Sparkles Audit: aprovado.')
