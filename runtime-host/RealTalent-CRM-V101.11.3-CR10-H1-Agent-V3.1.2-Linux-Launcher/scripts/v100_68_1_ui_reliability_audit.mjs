import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const exists = (file) => fs.existsSync(path.join(root, file))
const pkg = JSON.parse(read('package.json'))
const health = JSON.parse(read('public/health.json'))
const checks = []
const check = (label, condition) => checks.push({ label, ok: Boolean(condition) })
const semverAtLeast = (value, target) => {
  const a = value.split('.').map(Number), b = target.split('.').map(Number)
  for (let i=0;i<3;i++) { if ((a[i]??0) > (b[i]??0)) return true; if ((a[i]??0) < (b[i]??0)) return false }
  return true
}

const browser = read('src/lib/browser-actions.ts')
const overlay = read('src/app/overlay-manager.ts')
const hook = read('src/app/use-overlay-dialog.ts')
const topbar = read('src/components/layout/topbar.tsx')
const expCss = read('src/styles/experience-system.css')
const assistant = read('src/features/assistant/assistant-drawer.tsx')
const notifications = read('src/features/experience/notification-center.tsx')
const customization = read('src/features/experience/page-customization-drawer.tsx')
const leadDrawer = read('src/features/leads/lead-details-drawer.tsx')
const buyer = read('src/features/proposals/buyer-room-modal.tsx')
const settings = read('src/features/settings/settings-page.tsx')
const playbooks = read('src/features/playbooks/playbooks-page.tsx')
const automations = read('src/features/automations/automations-page.tsx')
const salesMessage = read('src/features/pipeline/sales-message-modal.tsx')
const whatsappWorkspace = read('src/services/whatsapp-workspace.ts')
const calls = read('src/features/calls/call-workspace-modal.tsx')
const allSrc = []
const walk = (dir) => {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(entry.name)) allSrc.push(fs.readFileSync(full, 'utf8'))
  }
}
walk(path.join(root, 'src'))
const allSourceText = allSrc.join('\n')
const directClipboard = [...allSourceText.matchAll(/navigator\.clipboard\.writeText/g)].length
const directWindowOpen = [...allSourceText.matchAll(/window\.open\(/g)].length

check('versão inclui V100.68.1', semverAtLeast(pkg.version, '100.68.1'))
check('APP_VERSION acompanha pacote', read('src/lib/app-version.ts').includes(`APP_VERSION = '${pkg.version}'`))
check('health acompanha pacote', health.version === pkg.version && (pkg.version === '100.68.1' ? health.module === 'ui-reliability' : Boolean(health.module)))
check('title identifica versão atual do RealTalent', read('index.html').includes(`V${pkg.version}`) && read('index.html').includes('RealTalent CRM'))
check('bridge acompanha pacote', read('src/features/commercial-map/commercial-map-page.tsx').includes('version: APP_VERSION'))
check('sem migration V100.68.1', !fs.readdirSync(path.join(root, 'supabase/migrations')).some((name) => /100[_-]?68[_-]?1/i.test(name)))
check('browser actions centralizado', exists('src/lib/browser-actions.ts'))
check('clipboard usa secure context', browser.includes('window.isSecureContext') && browser.includes('navigator.clipboard?.writeText'))
check('clipboard possui fallback', browser.includes('fallbackCopy') && browser.includes("document.execCommand('copy')"))
check('clipboard relata bloqueio', browser.includes('O navegador bloqueou o acesso à área de transferência'))
check('normalização de URL existe', browser.includes('normalizeExternalUrl'))
check('URL sem protocolo recebe https', browser.includes('`https://${raw}`'))
check('abertura externa detecta bloqueio', browser.includes('O navegador bloqueou a abertura da nova janela'))
check('window.open centralizado', directWindowOpen === 1)
check('clipboard direto centralizado', directClipboard === 1)
check('overlay manager move re-registro ao topo', overlay.includes('overlays.delete(id)') && overlay.includes('overlays.set(id'))
check('overlay manager identifica top overlay', overlay.includes('export function isTopOverlay'))
check('hook compartilhado de dialog existe', exists('src/app/use-overlay-dialog.ts'))
check('hook registra overlay', hook.includes('registerOverlay(id'))
check('hook fecha somente overlay do topo', hook.includes('isTopOverlay(id)'))
check('hook aplica scroll lock', hook.includes("classList.add('overlay-open')"))
check('hook restaura foco', hook.includes('previous?.isConnected'))
check('Assistant usa overlay hook', assistant.includes("useOverlayDialog(open, 'assistant-drawer'"))
check('Assistant expõe data overlay id', assistant.includes('data-overlay-id="assistant-drawer"'))
check('Notificações usam overlay hook', notifications.includes("useOverlayDialog(open, 'notification-center'"))
check('Personalização usa overlay hook', customization.includes('useOverlayDialog(open, `experience-drawer:${route}`'))
check('Assistant fica acima do lead drawer', expCss.includes('.assistant-layer { z-index: 9500; }'))
check('Modais ficam acima do Assistant', expCss.includes('.modal-backdrop { z-index: 13000; }'))
check('Toasts ficam acima dos modais', expCss.includes('.toast-region { z-index: 14000; }'))
check('drawers auxiliares têm camada intermediária', expCss.includes('z-index: 9200'))
check('topbar possui grupo de utilidades', topbar.includes('topbar__utility-actions') || topbar.includes('global-appbar-v10162__right'))
check('topbar possui ação primária controlada', topbar.includes('topbar__primary-actions') || topbar.includes('Criar novo contato'))
check('topbar mobile usa duas colunas estáveis', expCss.includes('grid-template-columns:minmax(0,1fr) auto !important'))
check('topbar mobile permite scroll de utilidades', expCss.includes('.topbar__utility-actions') && expCss.includes('overflow-x:auto'))
check('atalho Assistant respeita modal aberto', topbar.includes("classList.contains('modal-open')"))
check('abertura Assistant fecha drawers concorrentes', topbar.includes('setCustomizationOpen(false); setNotificationsOpen(false)'))
check('Buyer Room usa clipboard resiliente', buyer.includes('copyTextToClipboard(shareUrl)'))
check('Buyer Room detecta popup bloqueado', buyer.includes('openExternalUrl(shareUrl)'))
check('Equipe usa clipboard resiliente', settings.includes('copyTextToClipboard(link)'))
check('Playbooks usam clipboard resiliente', playbooks.includes('copyTextToClipboard(content)'))
const copyDraftBlock = automations.slice(automations.indexOf('const copyDraft'), automations.indexOf('const save =', automations.indexOf('const copyDraft')))
check('Automação só marca rascunho após copiar', copyDraftBlock.includes('const copied = await copyTextToClipboard(message)') && copyDraftBlock.indexOf('if (!copied.ok)') < copyDraftBlock.indexOf('markContactDraft'))
check('Mensagem assistida usa clipboard resiliente', salesMessage.includes('copyTextToClipboard(content)'))
check('Mensagem assistida detecta WhatsApp bloqueado', salesMessage.includes('openExternalUrl(`https://wa.me/') || (salesMessage.includes('openAssistedWhatsApp') && whatsappWorkspace.includes('openExternalUrl(url)')))
check('Call Workspace usa clipboard resiliente', calls.includes('copyTextToClipboard(content)'))
check('Ficha normaliza URLs sociais', leadDrawer.includes('normalizeExternalUrl(lead.instagramUrl)') && leadDrawer.includes('normalizeExternalUrl(lead.website)'))
check('Ficha detecta WhatsApp bloqueado', leadDrawer.includes('openExternalUrl(`https://wa.me/') || (leadDrawer.includes('SalesMessageModal') && whatsappWorkspace.includes('openExternalUrl(url)')))
check('Lead Drawer fecha por Esc somente quando está no topo', leadDrawer.includes('useOverlayDialog(Boolean(lead)') && hook.includes('isTopOverlay(id)'))
check('release notes existem', exists('RELEASE_NOTES_V100.68.1.md'))
check('documentação UI reliability existe', exists('docs/V100.68.1-UI-RELIABILITY.md'))
check('npm check inclui QA V100.68.1', String(pkg.scripts['check:legacy']).includes('qa:v100.68.1'))

for (const item of checks) console.log(`${item.ok ? 'OK' : 'FAIL'} ${item.label}`)
const failed = checks.filter((item) => !item.ok)
if (failed.length) {
  console.error(`\nV100.68.1 UI Reliability Audit falhou: ${checks.length - failed.length}/${checks.length}.`)
  process.exit(1)
}
console.log(`\nV100.68.1 UI Reliability Audit: ${checks.length}/${checks.length} contratos aprovados.`)
