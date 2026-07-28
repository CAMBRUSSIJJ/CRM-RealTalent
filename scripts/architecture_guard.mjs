import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const src = path.join(root, 'src')
const failures = []
const allowedDirectInfrastructure = new Set([
  'src/app/app-context.tsx',
  'src/features/auth/auth-context.tsx',
  'src/features/settings/preferences-context.tsx',
  'src/features/commercial-map/commercial-map-page.tsx',
  'src/features/onboarding/local-onboarding.tsx',
  'src/features/leads/lead-form.tsx',
  'src/features/agenda/agenda-reminder-watcher.tsx',
  'src/features/leads/leads-page.tsx',
  'src/features/pipeline/pipeline-preferences.ts',
])

const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const value = path.join(directory, entry.name)
  return entry.isDirectory() ? walk(value) : [value]
})

for (const file of walk(src).filter((value) => /\.(ts|tsx)$/.test(value))) {
  const relative = path.relative(root, file).replaceAll('\\', '/')
  const text = fs.readFileSync(file, 'utf8')
  const imports = [...text.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map((match) => match[2])

  if (relative.startsWith('src/domain/') && imports.some((value) => /react|features|components|repositories|supabase/.test(value))) {
    failures.push(`${relative}: domínio depende de interface ou infraestrutura`)
  }
  if ((relative.startsWith('src/services/') || relative.startsWith('src/repositories/')) && imports.some((value) => /\/features\/|\/components\/|\/app\//.test(value))) {
    failures.push(`${relative}: serviço/repositório depende da camada de interface`)
  }
  if ((relative.startsWith('src/features/') || relative.startsWith('src/components/')) && imports.some((value) => /supabase-crm-repository|local-crm-repository/.test(value)) && !allowedDirectInfrastructure.has(relative)) {
    failures.push(`${relative}: interface importou implementação concreta de repositório`)
  }
  const directInfrastructure = imports.some((value) => /(?:lib\/supabase|lib\/storage|repositories\/)/.test(value))
  if ((relative.startsWith('src/features/') || relative.startsWith('src/components/')) && directInfrastructure && !allowedDirectInfrastructure.has(relative)) {
    failures.push(`${relative}: novo acesso direto à infraestrutura fora da lista homologada`)
  }
}

const factory = fs.readFileSync(path.join(src, 'repositories/create-repository.ts'), 'utf8')
if (!factory.includes('LocalCrmRepository') || !factory.includes('SupabaseCrmRepository')) failures.push('factory de repositórios não centraliza os dois modos de dados')

if (failures.length) {
  console.error(JSON.stringify({ passed: false, failures }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ passed: true, rule: 'domain -> services -> repositories; UI via app context', allowedExceptions: [...allowedDirectInfrastructure] }, null, 2))
