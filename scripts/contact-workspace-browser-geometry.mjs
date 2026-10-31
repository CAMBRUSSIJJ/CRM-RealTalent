import {readFileSync,mkdirSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'

const main=readFileSync('src/main.tsx','utf8')
const imports=[...main.matchAll(/import ['"]\.\/styles\/([^'"]+\.css)['"]/g)].map(match=>match[1])
const css=imports.map(file=>readFileSync(path.join('src/styles',file),'utf8')).join('\n') + '\n/* Fixture only: evaluate final layout, not initial 24px drawer entrance transform. */\n.lead-drawer-layer > .lead-drawer--sales-workspace{animation:none!important;transform:none!important}'
const chrome=[process.env.CHROMIUM_BIN,'google-chrome','chromium','chromium-browser'].filter(Boolean).find(cmd=>spawnSync(cmd,['--version'],{stdio:'ignore'}).status===0)
if(!chrome)throw Error('Chrome ou Chromium obrigatório para visual QA')

function measure(){
 const one=selector=>document.querySelector(selector)
 const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}}
 const drawer=one('.lead-drawer--sales-workspace'), body=one('.sales-workspace-v1013__body')
 const a=rect(one('.sales-workspace-v1015__strategy-summary-actions'))
 const b=rect(one('.sales-workspace-v1015__strategy-summary>div:first-child'))
 const data={viewport:{width:innerWidth,height:innerHeight},overlay:rect(one('.lead-drawer-layer')),shell:rect(one('.app-shell')),drawer:rect(drawer),
  main:rect(one('.sales-workspace-v1013__main')),context:rect(one('.sales-workspace-v1013__context-panel')),
  button:rect(one('.sales-workspace-v1015__strategy-summary-actions .button')),
  overlap:a.y<b.bottom-2&&a.x<b.right-2&&a.right>b.x+2,
  documentOverflow:document.documentElement.scrollWidth>innerWidth+2,
  drawerOverflow:drawer.scrollWidth>drawer.clientWidth+3,
  columns:getComputedStyle(body).gridTemplateColumns}
 one('#report').textContent=JSON.stringify(data)
}

const html=[
 '<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>',css,'</style></head><body><div class="app-shell"><div class="lead-drawer-layer">',
 '<aside class="lead-drawer lead-drawer--sales-workspace sales-workspace-v1015 sales-workspace-v1015--focus">',
 '<header class="lead-drawer__header sales-workspace-v1013__header"><div class="lead-drawer__identity"><span class="lead-avatar">C</span><div><span class="eyebrow">Contato Workspace</span><h2>CAMILA</h2><p>CAMILA · Novo lead · Marcelo</p></div></div>',
 '<div class="lead-drawer__header-actions sales-workspace-v1015__header-actions"><div class="sales-workspace-v1015__mode-switch"><button class="is-active">Foco</button><button>Completo</button></div><button class="button">Editar</button></div></header>',
 '<div class="lead-drawer__quick-actions sales-workspace-v1015__command-bar"><button class="button">Ligar</button><button class="button">WhatsApp</button><button class="button">E-mail</button><button class="button">Follow-up</button></div>',
 '<div class="lead-drawer__body sales-workspace-v1013__body"><main class="sales-workspace-v1013__main">',
 '<section class="sales-workspace-v1013__primary sales-workspace-v1013__primary--overdue"><div class="sales-workspace-v1013__primary-copy"><span class="eyebrow">Próxima ação comercial</span><h3>Ligar agora</h3><p>A próxima ação venceu há 2 dias.</p><div class="sales-workspace-v1013__signal-row"><span>Score 12/100</span><span>Deal Health 26/100</span></div></div><button class="button">Executar agora</button></section>',
 '<section class="lead-drawer__section sales-workspace-v1013__strategy sales-workspace-v1015__strategy-card"><div class="sales-workspace-v1015__strategy-summary"><div><span class="eyebrow">Preparação da abordagem</span><strong>Sem roteiro</strong><p>Seleção manual</p></div><div class="sales-workspace-v1015__strategy-summary-actions"><button class="button">Ligar com roteiro</button><button class="sales-workspace-v1015__disclosure">Ajustar</button></div></div></section>',
 '<section class="lead-drawer__section sales-workspace-v1013__summary"><h3>Contexto do lead</h3><div class="sales-workspace-v1013__facts"><div>Empresa</div><div>Responsável</div><div>Valor</div><div>Próxima ação</div></div></section>',
 '</main><aside class="sales-workspace-v1013__context-panel"><div class="sales-workspace-v1013__tabs"><button>Contexto</button><button>Histórico</button><button>Notas</button></div><div class="sales-workspace-v1013__context-content"><section><span class="eyebrow">Agora</span><div class="sales-workspace-v1013__context-list"><div><span><small>Próxima ação</small><strong>30/10/2026</strong></span></div></div></section><section>Próximas reuniões</section><section>Conta e decisores</section></div></aside></div>',
 '<footer class="lead-drawer__footer sales-workspace-v1013__footer"><button class="button">Abrir registro completo</button></footer></aside></div></div><pre id="report" style="display:none"></pre>',
 '<script>window.addEventListener("load",(',measure.toString(),'));</script></body></html>'
].join('')

const tmp=mkdtempSync(path.join(tmpdir(),'realtalent-contact-'))
const file=path.join(tmp,'fixture.html')
writeFileSync(file,html)
const output=path.join('artifacts','contact-workspace')
mkdirSync(output,{recursive:true})
let failCount=0
for(const [width,height] of [[1920,1080],[1536,864],[1366,768]]){
 const common=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--hide-scrollbars','--window-size='+width+','+height,'--virtual-time-budget=2000']
 const run=spawnSync(chrome,[...common,'--dump-dom',pathToFileURL(file).href],{encoding:'utf8',maxBuffer:25*1024*1024,timeout:50000})
 if(run.status!==0){console.error('FAIL '+width+'x'+height+' browser: '+run.stderr?.slice(-450));failCount++;continue}
 const match=run.stdout.match(/<pre id="report"[^>]*>([^<]+)<\/pre>/)
 if(!match){console.error('FAIL '+width+'x'+height+': browser não retornou geometria');failCount++;continue}
 let result
 try{result=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'))}catch(err){console.error('FAIL '+width+'x'+height+': '+err);failCount++;continue}
 console.log(width+'x'+height+' => '+JSON.stringify(result))
 const checks=[
  [Math.abs(result.viewport.width-width)<=5,'viewport inesperada'],
  [result.drawer.x>=-2&&result.drawer.right<=width+2,'drawer excede a viewport'],
  [result.drawer.width>=Math.min(1050,width*.90),'largura comercial abaixo do esperado'],
  [result.main.width>=480,'coluna principal espremida'],
  [result.context.width>=280,'contexto espremido'],
  [!result.overlap,'ação sobrepõe a descrição'],
  [result.button.right<=result.drawer.right+2,'botão Ligar com roteiro cortado'],
  [!result.documentOverflow&&!result.drawerOverflow,'overflow horizontal'],
 ]
 for(const [ok,label] of checks)if(!ok){console.error('FAIL '+width+'x'+height+': '+label);failCount++}
 const screenshot=path.join(output,width+'x'+height+'.png')
 const shot=spawnSync(chrome,[...common,'--screenshot='+screenshot,pathToFileURL(file).href],{encoding:'utf8',timeout:50000})
 if(shot.status!==0){console.error('WARN screenshot '+width+'x'+height+': '+shot.stderr?.slice(-200))}
}
rmSync(tmp,{recursive:true,force:true})
if(failCount)process.exit(1)
console.log('PASS: teste visual de geometria em três resoluções')
