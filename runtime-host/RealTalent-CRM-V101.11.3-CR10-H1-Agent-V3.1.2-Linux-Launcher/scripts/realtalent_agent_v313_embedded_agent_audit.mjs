import fs from 'node:fs'
const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8')
const drawer=read('src/features/assistant/assistant-drawer.tsx')
const css=read('src/styles/realtalent-assistant-v10067.css')
const checks=[
 ['Agent permanece dentro do CRM', drawer.includes('V3.1.3 Embedded Agent') && drawer.includes('assistant-drawer')],
 ['Sem abertura do /chat no fluxo principal', !drawer.includes("window.open('http://127.0.0.1:8791/chat") && !drawer.includes('chat?product=crm')],
 ['Explicar tela executa no drawer', drawer.includes('explainCurrentScreen') && drawer.includes('Explique esta tela do CRM')],
 ['Expandir/Recolher sem nova aba', drawer.includes('setExpanded') && drawer.includes("'Expandir'") && drawer.includes("'Recolher'")],
 ['Contexto acompanha rota', drawer.includes('routeLabel') && drawer.includes('contextDescription') && drawer.includes('currentRoute: route')],
 ['Entidade selecionada vence contexto anterior', drawer.includes('if (routeFocusLead) return [routeFocusLead.id]') && drawer.indexOf('if (routeFocusLead) return [routeFocusLead.id]') < drawer.indexOf('if (answer?.items.length) return uniqueLeadIds(answer)')],
 ['Sugestões por rota', drawer.includes('routePrompts') && drawer.includes("leads: ['Quais contatos") && drawer.includes("pipeline: ['Quais oportunidades")],
 ['Sessão preservada por workspace', drawer.includes('sessionStorage') && drawer.includes('sessionKey') && drawer.includes("currentWorkspace?.id")],
 ['Modo técnico recolhido', drawer.includes('<details className="assistant-technical">') && drawer.includes('Monitoramento') && drawer.includes('Avaliação')],
 ['UI normal mostra CRM conectado/read-only', drawer.includes('CRM conectado') && drawer.includes('Native Tools somente leitura')],
 ['Painel docked não bloqueia CRM', !drawer.includes('useOverlayDialog') && drawer.includes('role="complementary"') && css.includes('pointer-events:none') && css.includes('.assistant-drawer{pointer-events:auto}')],
 ['Navegação mantém painel aberto', !drawer.includes("navigate('communications', { leadId: answer.draft.leadId, action: answer.draft.channel === 'whatsapp' ? 'whatsapp' : 'email' })\n    onClose()") && !drawer.includes("else navigate('leads', { leadId: item.leadId, ...(item.action === 'map_stakeholder' ? { action: 'account360' } : {}) })\n    onClose()")],
 ['Painel expandido responsivo', css.includes('.assistant-drawer.is-expanded') && css.includes('820px')],
 ['Modo técnico estilizado', css.includes('.assistant-technical')],
]
let ok=0
for(const [label,pass] of checks){console.log(`${pass?'OK  ':'FAIL'} ${label}`);if(pass)ok++}
console.log(`\nCRM Agent V3.1.3 Embedded Experience: ${ok}/${checks.length} PASS`)
if(ok!==checks.length)process.exit(1)
