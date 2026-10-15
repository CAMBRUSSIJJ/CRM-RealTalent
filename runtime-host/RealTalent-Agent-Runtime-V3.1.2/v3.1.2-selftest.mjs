import fs from 'node:fs';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import path from 'node:path';import {platformManifest} from './platform-manifest.mjs';import {crmNativeReadInfo,nativeAppToolCatalog} from './app-tools.mjs';import {crmReadToolSelection,crmNativeReadCatalog} from './crm-native-read.mjs'
const here=path.dirname(fileURLToPath(import.meta.url));const pkg=JSON.parse(fs.readFileSync(path.join(here,'package.json'),'utf8'));const checks=[];const t=(n,fn)=>{try{fn();checks.push(1);console.log('PASS',n)}catch(e){checks.push(0);console.error('FAIL',n,e.message)}}
t('package V3.1.2',()=>assert.equal(pkg.version,'3.1.2'))
t('platform V3.1 stable contract preserved',()=>assert.equal(platformManifest().version,'3.1'))
t('capability advertised',()=>assert.ok(platformManifest().capabilities.some(c=>c.id==='crm-native-tools-read-only-v1')))
t('native read manifest',()=>{assert.equal(crmNativeReadInfo.version,'1.0');assert.equal(crmNativeReadInfo.release,'3.1.2');assert.equal(crmNativeReadInfo.mode,'read-only');assert.equal(crmNativeReadInfo.zeroMutation,true)})
t('five business surfaces covered',()=>{for(const x of ['contacts','opportunities','pipeline','tasks','followups','my_day'])assert.ok(crmNativeReadInfo.domains.includes(x))})
t('read catalog no mutations',()=>assert.ok(crmNativeReadCatalog().every(x=>x.capability==='read'&&x.confirmation===false)))
t('general catalog keeps write governance',()=>assert.equal(nativeAppToolCatalog('crm').find(x=>x.name==='crm.contacts.update')?.confirmation,true))
t('natural routing contacts',()=>assert.equal(crmReadToolSelection('contatos sem follow-up há mais de 7 dias')?.tool,'crm.contacts.search'))
t('natural routing my day',()=>assert.equal(crmReadToolSelection('prepare meu dia')?.tool,'crm.myday.read'))
t('mutation language never routed as read',()=>assert.equal(crmReadToolSelection('crie uma tarefa para Ana'),null))

const bundle=path.resolve(here,'..')
t('CRM package current path exists',()=>assert.ok(fs.existsSync(path.join(bundle,'RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher'))))
t('Blue Ocean package current path exists',()=>assert.ok(fs.existsSync(path.join(bundle,'Blue-Ocean-Service-Studio-V1.20.5-H7.24-Agent-V3.1.2-Linux-Source-Launcher'))))
t('CRM launcher points to V3.1.2 package',()=>{const x=fs.readFileSync(path.join(bundle,'abrir-crm-com-agent.sh'),'utf8');assert.ok(x.includes('Agent-V3.1.2-Linux-Launcher'));assert.ok(!x.includes('Agent-V2.9-Linux-Launcher'))})
t('conceptual person question is not hijacked',()=>assert.equal(crmReadToolSelection('Por que uma empresa perde eficiência quando centraliza decisões em uma pessoa?'),null))

const ok=checks.reduce((a,b)=>a+b,0);console.log(`RESULT ${ok}/${checks.length}`);if(ok!==checks.length)process.exit(1)
