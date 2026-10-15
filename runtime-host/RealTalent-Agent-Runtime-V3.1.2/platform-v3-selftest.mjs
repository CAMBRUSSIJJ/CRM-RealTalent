import assert from 'node:assert/strict'
import { platformKernelInfo,capabilityRegistry,appAdapterRegistry,modelRoleRegistry,executionProfiles,platformContracts,evaluatePlatformPolicy,platformV3Snapshot } from './platform-kernel.mjs'
let ok=0;const t=(name,fn)=>{try{fn();ok++;console.log('OK  '+name)}catch(e){console.log('FAIL '+name+' — '+e.message)}}
t('kernel V3.1 / contract V3',()=>assert.equal(platformKernelInfo.version,'3.1'))
t('capability registry discoverable',()=>{const c=capabilityRegistry();assert.ok(c.length>=50);assert.ok(c.every(x=>x.discoverable===true));assert.ok(c.some(x=>x.id==='long-horizon-autonomy'))})
t('app adapters centralizados',()=>{const a=appAdapterRegistry();assert.deepEqual(a.map(x=>x.id).sort(),['blue_ocean','crm']);assert.ok(a.find(x=>x.id==='crm').tools.some(t=>t.name==='crm.contacts.search'))})
t('model roles completos',()=>assert.deepEqual(modelRoleRegistry({}).map(x=>x.role),['fast','general','reasoning','coder','vision','embedding']))
t('profiles sem silent write',()=>{const p=executionProfiles();assert.equal(p.length,4);assert.ok(p.every(x=>x.maxSilentWrites===0))})
t('stable contracts',()=>{const c=platformContracts();assert.equal(c.version,'3.0');assert.equal(c.safety.maxSilentWrites,0);assert.match(c.appAdapter.completionProof,/receipt/ )})
t('read policy allow',()=>assert.equal(evaluatePlatformPolicy({capability:'read',profile:'instant'}).decision,'allow'))
t('write policy checkpoint',()=>{const x=evaluatePlatformPolicy({capability:'write',risk:'medium',role:'operator'});assert.equal(x.decision,'checkpoint');assert.equal(x.requiresConfirmation,true)})
t('critical write requires admin',()=>assert.equal(evaluatePlatformPolicy({capability:'write',risk:'critical',role:'manager'}).decision,'deny'))
t('snapshot V3',()=>{const x=platformV3Snapshot();assert.equal(x.version,'3.1');assert.equal(x.apps.count,2);assert.ok(x.capabilities.count>=50)})
console.log(`\nRealTalent Intelligence Platform V3.1: ${ok}/10 PASS`);if(ok!==10)process.exit(1)
