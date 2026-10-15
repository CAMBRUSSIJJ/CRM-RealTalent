import crypto from 'node:crypto'

const norm=(v='')=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n))
export const isImageAttachment=(a)=>Boolean(a&&(String(a.type||'').startsWith('image/')||a.dataUrl||a.data_url))

const imageBytes=(dataUrl='')=>{
  const m=String(dataUrl).match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/)
  if(!m)return null
  try{return {format:m[1].toLowerCase(),buffer:Buffer.from(m[2],'base64')}}catch{return null}
}

const jpegSize=(b)=>{
  if(b.length<4||b[0]!==0xff||b[1]!==0xd8)return null
  let i=2
  while(i+9<b.length){if(b[i]!==0xff){i++;continue}const marker=b[i+1];i+=2;if(marker===0xd8||marker===0xd9)continue;if(i+2>b.length)break;const len=b.readUInt16BE(i);if(len<2||i+len>b.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){return {height:b.readUInt16BE(i+3),width:b.readUInt16BE(i+5)}}i+=len}
  return null
}
const detectSize=(format,b)=>{
  if(!b)return null
  if((format==='png'||b.subarray(1,4).toString()==='PNG')&&b.length>=24)return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)}
  if((format==='gif'||b.subarray(0,3).toString()==='GIF')&&b.length>=10)return {width:b.readUInt16LE(6),height:b.readUInt16LE(8)}
  if(format.includes('jpeg')||format==='jpg'||(b[0]===0xff&&b[1]===0xd8))return jpegSize(b)
  if(format==='webp'&&b.length>=30&&b.subarray(12,16).toString()==='VP8X')return {width:1+b.readUIntLE(24,3),height:1+b.readUIntLE(27,3)}
  return null
}

export function imageMetadata(attachment,index=0){
  const parsed=imageBytes(attachment?.dataUrl||attachment?.data_url||'')
  const size=parsed?detectSize(parsed.format,parsed.buffer):null
  const bytes=parsed?.buffer?.length||Number(attachment?.size||0)||0
  const hash=parsed?.buffer?.length?crypto.createHash('sha256').update(parsed.buffer).digest('hex').slice(0,16):null
  const width=Number(size?.width||attachment?.width||0)||null,height=Number(size?.height||attachment?.height||0)||null
  const ratio=width&&height?Number((width/height).toFixed(3)):null
  return {id:`image_${index+1}`,name:String(attachment?.name||`imagem-${index+1}`).slice(0,180),type:String(attachment?.type||'image/unknown'),format:parsed?.format||null,bytes,width,height,aspectRatio:ratio,orientation:ratio==null?'unknown':ratio>1.12?'landscape':ratio<.88?'portrait':'square',fingerprint:hash}
}

const UI=/(tela|interface|layout|bot[aã]o|card|modal|sidebar|menu|formul[aá]rio|campo|ui|ux|print|screenshot|erro visual|alinh|espa[cç]amento|responsiv|overflow|clipp|sobrepos)/
const COMPARE=/(compar|diferen[cç]a|antes.*depois|depois.*antes|mudou|vers[aã]o anterior|lado a lado)/
const DOC=/(documento|nota fiscal|contrato|relat[oó]rio|p[aá]gina|texto da imagem|leia|ler|transcrev|ocr)/
const CHART=/(gr[aá]fico|dashboard|m[eé]trica|kpi|tabela|eixo|barra|linha|pizza)/
const REFER=/(esse|essa|este|esta|aqui|ali|bot[aã]o|parte|canto|lado|topo|rodap[eé]|centro|esquerda|direita)/
export function classifyVisualIntent({prompt='',attachments=[]}={}){
  const text=norm(prompt),images=(attachments||[]).filter(isImageAttachment)
  if(!images.length)return {kind:'none',confidence:1,reason:'sem imagem'}
  if(images.length>=2&&COMPARE.test(text))return {kind:'compare',confidence:.99,reason:'múltiplas imagens + comparação explícita'}
  if(UI.test(text))return {kind:'ui_diagnosis',confidence:.96,reason:'pedido sobre interface/tela'}
  if(CHART.test(text))return {kind:'chart_analysis',confidence:.94,reason:'pedido sobre gráfico/KPI'}
  if(DOC.test(text))return {kind:'document_visual',confidence:.94,reason:'pedido sobre documento/texto visual'}
  if(REFER.test(text))return {kind:'visual_reference',confidence:.9,reason:'referência espacial/visual'}
  return {kind:'general_visual',confidence:.88,reason:'imagem anexada'}
}

const regionHints=(text='')=>{
  const low=norm(text),out=[]
  const map=[['left',/(esquerda|lado esquerdo)/],['right',/(direita|lado direito)/],['top',/(topo|parte superior|em cima)/],['bottom',/(rodape|parte inferior|embaixo)/],['center',/(centro|meio)/],['top_left',/(canto superior esquerdo)/],['top_right',/(canto superior direito)/],['bottom_left',/(canto inferior esquerdo)/],['bottom_right',/(canto inferior direito)/]]
  for(const [id,re] of map)if(re.test(low))out.push(id)
  return [...new Set(out)]
}

export function buildMultimodalPlan({prompt='',attachments=[],visionAvailable=false}={}){
  const images=(attachments||[]).filter(isImageAttachment).slice(0,4)
  const intent=classifyVisualIntent({prompt,attachments:images})
  const metadata=images.map(imageMetadata)
  const regions=regionHints(prompt)
  const comparison=intent.kind==='compare'||images.length>1&&COMPARE.test(norm(prompt))
  return {
    version:'2.5',qualityLayer:'3.1',enabled:images.length>0,visionAvailable:Boolean(visionAvailable),intent,images:metadata,comparison,regionHints:regions,
    pipeline:visionAvailable?['image-normalization','visual-perception','grounding','reasoning-synthesis','visual-verification']:['image-normalization','vision-unavailable-guard'],
    evidencePolicy:{pixelsRequired:true,noPixelClaimsWithoutVision:true,distinguishVisibleFromInference:true,regionsUseNormalizedCoordinates:true,minimumFindingConfidence:.45},
    synthesis:{mode:comparison?'cross-image':intent.kind==='ui_diagnosis'?'ui-diagnostic-2':'grounded-visual',requireEvidence:true,qualityGeneration:'Vision Understanding 2.0',prioritizeActionableUiFindings:intent.kind==='ui_diagnosis'}
  }
}

export function normalizedRegion(region={}){
  const x=clamp(Number(region.x||0)),y=clamp(Number(region.y||0)),w=clamp(Number(region.w||0)),h=clamp(Number(region.h||0))
  return {x:Number(x.toFixed(3)),y:Number(y.toFixed(3)),w:Number(w.toFixed(3)),h:Number(h.toFixed(3))}
}

const severityRank={critical:5,high:4,medium:3,low:2,info:1}
const spatialLabel=(r={})=>{const x=Number(r.x||0)+Number(r.w||0)/2,y=Number(r.y||0)+Number(r.h||0)/2;const h=x<.34?'esquerda':x>.66?'direita':'centro',v=y<.34?'superior':y>.66?'inferior':'central';return `${v}-${h}`}
export function validateVisualPerception(value,plan={}){
  const out={...value}
  out.images=Array.isArray(value?.images)?value.images.slice(0,4):[]
  out.findings=(Array.isArray(value?.findings)?value.findings:[]).slice(0,24).map((f)=>{const region=normalizedRegion(f?.region||{}),confidence=clamp(Number(f?.confidence||0));const salience=clamp(confidence*.72+(severityRank[String(f?.severity||'info')]||1)/5*.28);return {...f,confidence,region,spatialLabel:spatialLabel(region),salience:Number(salience.toFixed(3)),evidenceKind:'visible-pixels'}}).filter((f)=>f.confidence>=Number(plan?.evidencePolicy?.minimumFindingConfidence||.45)).sort((a,b)=>b.salience-a.salience)
  out.visibleText=(Array.isArray(value?.visibleText)?value.visibleText:[]).slice(0,80).map((x)=>String(x).slice(0,280))
  out.uncertainties=(Array.isArray(value?.uncertainties)?value.uncertainties:[]).slice(0,12).map((x)=>String(x).slice(0,400))
  out.version='2.5';out.qualityLayer='3.1';out.grounded=true;out.quality={generation:'Vision Understanding 2.0',findingCount:out.findings.length,highConfidence:out.findings.filter(x=>x.confidence>=.8).length,uncertaintyCount:out.uncertainties.length}
  return out
}

export function visualUnavailableMessage(plan={}){
  const count=plan?.images?.length||1
  return `Recebi ${count===1?'a imagem':`${count} imagens`}, mas o modelo visual não está configurado neste runtime. Para não inventar o que existe nos pixels, não vou fazer afirmações visuais sem evidência. Configure OLLAMA_VISION_MODEL (recomendado pelo perfil de hardware) ou use um provider com visão e envie novamente.`
}

export const multimodalIntelligenceInfo=Object.freeze({version:'2.5',name:'Multimodal Intelligence',features:{twoPassVision:true,structuredPerception:true,normalizedRegionGrounding:true,multiImageComparison:true,uiDiagnosis:true,visualReferenceResolution:true,noVisionHallucinationGuard:true,imageFingerprinting:true,visionUnderstanding2:true,salienceRanking:true,spatialLabels:true,uncertaintyAccounting:true}})
