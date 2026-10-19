import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
const root=path.resolve(import.meta.dirname,'..')
const read=p=>fs.readFileSync(path.join(root,p),'utf8')
const test=(ok,label)=>{if(!ok){console.error('FAIL',label);process.exitCode=1}else console.log('OK',label)}
const items=['integration-oauth-start','integration-account-test','integration-calendar-catalog','official-communication-send','automation-webhook-dispatch']
for(const s of items){test(fs.existsSync(path.join(root,'supabase/functions',s,'index.ts')),'Fonte backend '+s);test(read('src/services/integration-runtime-diagnostics.ts').includes(s),'Diagnóstico '+s)}
const panel=read('src/features/settings/integration-framework-panel.tsx')
test(panel.includes('<IntegrationReadinessPanel />'),'Botão de verificação em Configurações')
const files=['src/services/integration-framework.ts','src/services/calendar-integration.ts','src/services/communication-workspace-core.ts','src/services/whatsapp-workspace-core.ts','src/services/automation-webhooks.ts']
for(const f of files)test(read(f).includes('describeIntegrationBackendError'),'Falhas acionáveis em '+f)
const names=[];function walk(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory())walk(p);else if(p.endsWith('.tsx'))names.push(p)}}walk(path.join(root,'src/features'))
let total=0;const missing=[]
for(const p of names){const s=fs.readFileSync(p,'utf8'),ast=ts.createSourceFile(p,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
const visit=n=>{if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){const tag=n.tagName.getText(ast);if(['button','Button','IconButton'].includes(tag)){
  total++;const attrs=n.attributes.properties.filter(ts.isJsxAttribute);const keys=new Set(attrs.map(a=>a.name.text))
  const submit=attrs.some(a=>a.name.text==='type'&&a.initializer?.getText(ast).includes('submit'))
  if(!['onClick','onMouseDown','onPointerDown','onAction','asChild','href','to','form'].some(k=>keys.has(k))&&!submit)missing.push(path.relative(root,p))
}}ts.forEachChild(n,visit)}
visit(ast)}
console.log('Buttons scanned:',total,'Components:',names.length)
test(missing.length===0,'Botões sem handler: '+missing.slice(0,10).join(', '))
