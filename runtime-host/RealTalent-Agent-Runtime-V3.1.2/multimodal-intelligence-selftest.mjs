import { buildMultimodalPlan, classifyVisualIntent, imageMetadata, validateVisualPerception, visualUnavailableMessage } from './multimodal-intelligence.mjs'
const fakePng=(w,h)=>{const b=Buffer.alloc(32);b[0]=0x89;b.write('PNG',1,'ascii');b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);return `data:image/png;base64,${b.toString('base64')}`}
const a1={name:'crm.png',type:'image/png',dataUrl:fakePng(1440,900)}
const a2={name:'crm-2.png',type:'image/png',dataUrl:fakePng(1440,900)}
let ok=0,total=0;const check=(n,p)=>{total++;console.log(`${p?'OK  ':'FAIL'} ${n}`);if(p)ok++}
let m=imageMetadata(a1,0);check('extrai dimensões e fingerprint',m.width===1440&&m.height===900&&m.orientation==='landscape'&&m.fingerprint?.length===16)
let i=classifyVisualIntent({prompt:'analise essa tela e veja o botão',attachments:[a1]});check('classifica diagnóstico de UI',i.kind==='ui_diagnosis')
i=classifyVisualIntent({prompt:'compare antes e depois',attachments:[a1,a2]});check('classifica comparação multi-imagem',i.kind==='compare')
let p=buildMultimodalPlan({prompt:'veja o canto superior direito dessa tela',attachments:[a1],visionAvailable:true});check('plano inclui grounding regional',p.enabled&&p.regionHints.includes('top_right')&&p.pipeline.includes('visual-perception'))
p=buildMultimodalPlan({prompt:'analise',attachments:[a1],visionAvailable:false});check('sem vision ativa guard anti-alucinação',p.pipeline.includes('vision-unavailable-guard')&&p.evidencePolicy.noPixelClaimsWithoutVision)
const v=validateVisualPerception({images:[{image_id:'image_1'}],findings:[{image_id:'image_1',category:'layout',severity:'high',description:'sobreposição',evidence:'CTA cobre texto',confidence:.9,region:{x:-1,y:.2,w:2,h:.3}},{image_id:'image_1',category:'x',severity:'low',description:'incerto',evidence:'',confidence:.2,region:{}}],visibleText:['Contato'],uncertainties:['ícone pequeno']},p)
check('validador filtra baixa confiança e normaliza região',v.findings.length===1&&v.findings[0].region.x===0&&v.findings[0].region.w===1)
check('mensagem de indisponibilidade não inventa pixels',visualUnavailableMessage(p).includes('não vou fazer afirmações visuais sem evidência'))
console.log(`\nMultimodal Intelligence V2.5: ${ok}/${total} testes aprovados.`);if(ok!==total)process.exit(1)
