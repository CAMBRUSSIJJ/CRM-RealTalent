import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
const target = new URL('./.env', import.meta.url)
try {
  await writeFile(target, [
    '# Somente no computador local; NUNCA publique no Git, Vercel ou no chat.',
    'POSTGRES_PASSWORD=' + randomBytes(32).toString('hex'),
    'EVOLUTION_API_KEY=' + randomBytes(32).toString('hex'),
    'SUPABASE_URL=',
    '# Chave legada service_role JWT, exclusivamente no Docker local.',
    'SUPABASE_SERVICE_ROLE_KEY=',
    'ORGANIZATION_ID=',
    'CRM_PUBLIC_URL=https://crm-real-talent.vercel.app',
    '',
  ].join('\n'), { flag: 'wx', mode: 0o600 })
  console.log('Arquivo .env criado com segurança. Edite os campos Supabase e Workspace.')
} catch (error) {
  console.error(error.code === 'EEXIST' ? 'Arquivo .env existente preservado.' : 'Falha ao gerar .env.')
  process.exitCode = 1
}
