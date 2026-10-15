import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const exists = (file) => fs.existsSync(path.join(root, file))
const checks = []
const check = (label, ok) => checks.push({ label, ok: Boolean(ok) })

const pkg = JSON.parse(read('package.json'))
const version = read('src/lib/app-version.ts')
const health = JSON.parse(read('public/health.json'))
const page = read('src/features/followups/followups-page.tsx')
const css = read('src/styles/followups.css')
const main = read('src/main.tsx')
const audit = read('src/services/functional-capability-audit.ts')
const map = read('src/features/commercial-map/commercial-map-page.tsx')
const TARGET_VERSION = '100.77.0'
const atLeastTarget = (() => {
  const current = pkg.version.split('.').map(Number)
  const target = TARGET_VERSION.split('.').map(Number)
  for (let index = 0; index < Math.max(current.length, target.length); index += 1) {
    const left = current[index] ?? 0
    const right = target[index] ?? 0
    if (left !== right) return left > right
  }
  return true
})()

check('versão inclui ou sucede 100.77.0', atLeastTarget && version.includes(`APP_VERSION = '${pkg.version}'`))
check('VERSION acompanha pacote', read('VERSION').trim() === `V${pkg.version}`)
check('backup schema preservado', version.includes("BACKUP_SCHEMA_VERSION = '100.54'"))
check('health acompanha pacote', health.version === pkg.version)
check('bridge do Território acompanha pacote', map.includes('version: APP_VERSION'))
check('estado de reagendamento tipado', page.includes("type QuickRescheduleMode = 'later' | 'tomorrow' | 'next-business'"))
check('reagendamento +2h existe', page.includes("onReschedule('later')") && page.includes('+2 horas'))
check('reagendamento amanhã útil existe', page.includes("onReschedule('tomorrow')") && page.includes('Amanhã útil'))
check('reagendamento próximo útil existe', page.includes("onReschedule('next-business')") && page.includes('Próximo dia útil'))
check('janela comercial respeitada', page.includes('preferences.commercial.businessDays') && page.includes('preferences.commercial.businessStart') && page.includes('preferences.commercial.businessEnd'))
check('feedback de reagendamento existe', page.includes("notify('success', `Follow-up reagendado"))
check('filtro por responsável existe', page.includes("const [owner, setOwner]") && page.includes('Todos os responsáveis'))
check('filtro por responsável aplicado', page.includes("!owner || item.lead?.ownerName === owner"))
check('timing relativo existe', page.includes('followupTimingLabel') && page.includes('Atrasado há') && page.includes('Amanhã'))
check('cards mostram responsável', page.includes("<UsersRound size={14} /> {item.lead?.ownerName || 'Não atribuído'}"))
check('cards mostram etapa', page.includes('<Target size={14} /> {item.stageName}'))
check('cards mostram canal textual', page.includes('Canal: {channelLabel[item.channel]}'))
check('cards mostram empresa', page.includes("item.lead?.company ? ` · ${item.lead.company}`"))
check('cards mostram cadência', page.includes('followup-cadence-chip') && page.includes('item.cadenceName'))
check('painel lateral mostra prazo', page.includes('Prazo desta atividade') && page.includes('followup-context-timing'))
check('painel lateral possui reagendamento', page.includes('followup-context-reschedule'))
check('quadro mostra timing', page.includes('followup-board__timing'))
check('quadro mostra responsável', page.includes("<UsersRound size={13} /> {item.lead?.ownerName || 'Não atribuído'}"))
check('quadro mostra cadência', page.includes('followup-board__cadence'))
check('calendário mostra responsável', page.includes('followup-calendar__owner'))
check('CSS novo importado', (main.includes("./styles/followups.css")||main.includes("./styles/followups.css")))
check('CSS diferencia vencido', css.includes('.followup-row--professional.followup-row--overdue'))
check('CSS diferencia hoje', css.includes('.followup-row--professional.followup-row--today'))
check('CSS diferencia sem data', css.includes('.followup-row--professional.followup-row--unscheduled'))
check('CSS menu reagendar existe', css.includes('.followup-reschedule-menu'))
check('CSS painel de timing existe', css.includes('.followup-context-timing'))
check('CSS responsivo existe', css.includes('@media (max-width: 760px)'))
check('auditoria funcional atualizada', audit.includes('cards agora destacam prazo, atraso, canal, responsável, etapa e cadência'))
check('sem nova migration V100.77', !fs.readdirSync(path.join(root, 'supabase/migrations')).some((name) => /100[_-]?77/i.test(name)))
check('release notes existem', exists('RELEASE_NOTES_V100.77.0.md'))
check('documentação existe', exists('docs/V100.77.0-FOLLOWUPS-2.0.md'))
check('npm check inclui V100.77', String(pkg.scripts['check:legacy']).includes('qa:v100.77.0'))

const failed = checks.filter((item) => !item.ok)
for (const item of checks) console.log(`${item.ok ? '✓' : '✗'} ${item.label}`)
if (failed.length) {
  console.error(`\nV100.77.0 Follow-ups 2.0 audit falhou: ${checks.length - failed.length}/${checks.length}.`)
  process.exit(1)
}
console.log(`\nV100.77.0 Follow-ups 2.0: ${checks.length}/${checks.length} contratos aprovados.`)
