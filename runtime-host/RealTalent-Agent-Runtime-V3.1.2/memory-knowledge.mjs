import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const STATE_DIR = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'realtalent-agent')
const KNOWLEDGE_FILE = path.join(STATE_DIR, 'knowledge-index-v2.4.json')
const SEMANTIC_MEMORY_FILE = path.join(STATE_DIR, 'semantic-memory-v2.4.json')
const OLLAMA_URL = String(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'
const EMBED_TIMEOUT_MS = Math.max(800, Number(process.env.REALTALENT_EMBED_TIMEOUT_MS || 4500))
const HASH_DIM = 256
const MAX_CHUNK_CHARS = 2200
const CHUNK_WORDS = 300
const CHUNK_OVERLAP = 55
const SUPPORTED_PRODUCTS = new Set(['crm','blue_ocean','global'])

const nowIso = () => new Date().toISOString()
const clean = (v, n = 10000) => String(v ?? '').replace(/\u0000/g, '').replace(/\r/g, '').trim().slice(0, n)
const normalize = (v='') => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9_+#.\-/\s]/g,' ').replace(/\s+/g,' ').trim()
const STOP = new Set('a o os as um uma uns umas de da do das dos em no na nos nas por para pra com sem e ou que como qual quais quem onde quando porque por isso esse essa estes estas isto eu voce você tu ele ela eles elas meu minha meus minhas seu sua seus suas me te se ao aos mais menos muito muita muitos muitas'.split(/\s+/))
const tokens = (v='') => normalize(v).split(/\s+/).filter((x)=>x.length>2&&!STOP.has(x))
const safeJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file,'utf8')) } catch { return fallback } }
const writeAtomic = (file, value) => { fs.mkdirSync(path.dirname(file),{recursive:true}); const tmp=`${file}.${process.pid}.tmp`; fs.writeFileSync(tmp,JSON.stringify(value,null,2),{encoding:'utf8',mode:0o600}); fs.renameSync(tmp,file); try{fs.chmodSync(file,0o600)}catch{} }
const clamp = (n,min=0,max=1)=>Math.max(min,Math.min(max,n))

function hash32(s){
  let h=2166136261
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
  return h>>>0
}
function normalizeVector(v){
  let sum=0;for(const x of v)sum+=x*x
  const d=Math.sqrt(sum)||1
  return v.map((x)=>Number((x/d).toFixed(7)))
}
export function hashEmbedding(text, dim=HASH_DIM){
  const vector=new Array(dim).fill(0)
  const ts=tokens(text)
  const grams=[]
  for(const t of ts){grams.push(t); if(t.length>=5){grams.push(t.slice(0,4));grams.push(t.slice(-4))}}
  for(let i=0;i<ts.length-1;i++)grams.push(`${ts[i]}_${ts[i+1]}`)
  for(const g of grams){const h=hash32(g);const idx=h%dim;const sign=(h&0x80000000)?-1:1;vector[idx]+=sign*(g.includes('_')?1.35:1)}
  return normalizeVector(vector)
}
export function cosine(a,b){
  if(!Array.isArray(a)||!Array.isArray(b)||!a.length||a.length!==b.length)return 0
  let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){const x=Number(a[i]||0),y=Number(b[i]||0);dot+=x*y;aa+=x*x;bb+=y*y}
  return aa&&bb?dot/(Math.sqrt(aa)*Math.sqrt(bb)):0
}
function lexicalScore(query,text){
  const q=[...new Set(tokens(query))], d=tokens(text);if(!q.length||!d.length)return 0
  const freq=new Map();for(const t of d)freq.set(t,(freq.get(t)||0)+1)
  let hit=0;for(const t of q){const f=freq.get(t)||0;if(f)hit+=1+Math.log1p(f)*.15}
  return clamp(hit/Math.max(1,q.length))
}
function phraseBoost(query,text){const q=normalize(query),d=normalize(text);if(q.length>=8&&d.includes(q))return 1;const qs=q.split(' ').filter(Boolean);if(qs.length>=3){const p=qs.slice(0,Math.min(6,qs.length)).join(' ');if(d.includes(p))return .65}return 0}

export async function embedTexts(texts,{kind='document',forceHash=false}={}){
  const values=(Array.isArray(texts)?texts:[texts]).map((x)=>clean(x,12000))
  if(!forceHash && values.some(Boolean)){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),EMBED_TIMEOUT_MS)
    try{
      const prefixed=values.map((x)=>`${kind==='query'?'search_query':'search_document'}: ${x}`)
      const response=await fetch(`${OLLAMA_URL}/api/embed`,{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({model:EMBED_MODEL,input:prefixed})})
      if(response.ok){const data=await response.json();const embeddings=Array.isArray(data?.embeddings)?data.embeddings:[];if(embeddings.length===values.length&&embeddings.every((v)=>Array.isArray(v)&&v.length)){return {provider:'ollama',model:EMBED_MODEL,embeddings:embeddings.map(normalizeVector)}}}
    } catch {} finally {clearTimeout(timer)}
  }
  return {provider:'hash',model:`realtalent-hash-${HASH_DIM}`,embeddings:values.map((x)=>hashEmbedding(x))}
}

function chunkText(text){
  const raw=clean(text,2_000_000);if(!raw)return []
  const paragraphs=raw.split(/\n{2,}/).map((p)=>p.trim()).filter(Boolean)
  const chunks=[];let buffer=[]
  const pushBuffer=()=>{if(!buffer.length)return;let words=buffer.join('\n\n').split(/\s+/);while(words.length){const part=words.slice(0,CHUNK_WORDS).join(' ').slice(0,MAX_CHUNK_CHARS);if(part.trim())chunks.push(part.trim());if(words.length<=CHUNK_WORDS)break;words=words.slice(Math.max(1,CHUNK_WORDS-CHUNK_OVERLAP))}buffer=[]}
  for(const p of paragraphs){const wc=p.split(/\s+/).length;if(wc>CHUNK_WORDS){pushBuffer();let words=p.split(/\s+/);while(words.length){const part=words.slice(0,CHUNK_WORDS).join(' ').slice(0,MAX_CHUNK_CHARS);if(part.trim())chunks.push(part.trim());if(words.length<=CHUNK_WORDS)break;words=words.slice(Math.max(1,CHUNK_WORDS-CHUNK_OVERLAP))}}else{const next=[...buffer,p].join('\n\n');if(next.split(/\s+/).length>CHUNK_WORDS)pushBuffer();buffer.push(p)}}
  pushBuffer();return chunks.slice(0,4000)
}
function knowledgeStore(){const raw=safeJson(KNOWLEDGE_FILE,{version:'2.4',documents:[],chunks:[]});return {version:'2.4',documents:Array.isArray(raw.documents)?raw.documents:[],chunks:Array.isArray(raw.chunks)?raw.chunks:[]}}
function semanticStore(){const raw=safeJson(SEMANTIC_MEMORY_FILE,{version:'2.4',items:[]});return {version:'2.4',items:Array.isArray(raw.items)?raw.items:[]}}

export async function indexKnowledgeText({product='global',title='Documento',text='',source='manual',metadata={}}={}){
  const scope=SUPPORTED_PRODUCTS.has(product)?product:'global';const body=clean(text,2_000_000);if(!body)throw new Error('Texto vazio.')
  const store=knowledgeStore();const id=`kb_${crypto.randomUUID()}`;const parts=chunkText(body);if(!parts.length)throw new Error('Nenhum trecho indexável.')
  const embedded=await embedTexts(parts,{kind:'document'});const createdAt=nowIso();const doc={id,product:scope,title:clean(title,240)||'Documento',source:clean(source,500)||'manual',createdAt,updatedAt:createdAt,chunkCount:parts.length,embeddingProvider:embedded.provider,embeddingModel:embedded.model,metadata:metadata&&typeof metadata==='object'?metadata:{}}
  store.documents.push(doc)
  for(let i=0;i<parts.length;i++)store.chunks.push({id:`${id}_c${i+1}`,documentId:id,product:scope,title:doc.title,source:doc.source,index:i,text:parts[i],embedding:embedded.embeddings[i],embeddingProvider:embedded.provider,embeddingModel:embedded.model,createdAt})
  store.documents=store.documents.slice(-500);const allowed=new Set(store.documents.map((d)=>d.id));store.chunks=store.chunks.filter((c)=>allowed.has(c.documentId)).slice(-40000);writeAtomic(KNOWLEDGE_FILE,store);return doc
}

export function deleteKnowledgeDocument(id){const store=knowledgeStore();const before=store.documents.length;store.documents=store.documents.filter((d)=>d.id!==id);store.chunks=store.chunks.filter((c)=>c.documentId!==id);writeAtomic(KNOWLEDGE_FILE,store);return store.documents.length<before}
export function clearKnowledge({product=null}={}){const store=knowledgeStore();if(product&&SUPPORTED_PRODUCTS.has(product)){const ids=new Set(store.documents.filter((d)=>d.product===product).map((d)=>d.id));store.documents=store.documents.filter((d)=>!ids.has(d.id));store.chunks=store.chunks.filter((c)=>!ids.has(c.documentId))}else{store.documents=[];store.chunks=[]}writeAtomic(KNOWLEDGE_FILE,store);return {documents:store.documents.length,chunks:store.chunks.length}}
export function listKnowledge({product=null,limit=100}={}){return knowledgeStore().documents.filter((d)=>!product||d.product===product||d.product==='global').slice(-Math.max(1,Math.min(500,limit))).reverse()}

function recencyScore(at){const t=Date.parse(at||'');if(!Number.isFinite(t))return 0;const days=Math.max(0,(Date.now()-t)/86400000);return Math.exp(-days/180)}
function publicResult(item,scoreParts){return {id:item.id,documentId:item.documentId||null,evidenceId:`evidence:${item.documentId||item.id}`,product:item.product,kind:item.kind||null,title:item.title||item.kind||'Memória',source:item.source||'memory',text:item.text,createdAt:item.createdAt||item.at||null,status:item.status||'active',conflictsWith:Array.isArray(item.conflictsWith)?item.conflictsWith:[],score:Number(scoreParts.final.toFixed(4)),semantic:Number(scoreParts.semantic.toFixed(4)),lexical:Number(scoreParts.lexical.toFixed(4)),rerank:Number(scoreParts.rerank.toFixed(4)),embeddingProvider:item.embeddingProvider,embeddingModel:item.embeddingModel}}

export function rag2Thresholds(query=''){
  const q=clean(query,12000),ts=tokens(q),identifierLike=ts.some(t=>t.includes('_')||t.includes('.')||t.includes('/')||/\d/.test(t))
  const short=ts.length<=3,exact=identifierLike||/["'`]/.test(q)
  return {knowledge:exact?.14:short?.24:.18,memory:exact?.16:short?.27:.20,identifierLike,short,exact}
}
function kindWeight(item){const k=normalize(item?.kind||'');if(/decision|regra|constraint|preference/.test(k))return 1;if(/incident|error|erro|temporary|temporario/.test(k))return .86;return .94}
async function hybridRank(items,{query,product=null,limit=8}={}){
  const q=clean(query,12000);if(!q)return []
  const qEmbedded=await embedTexts([q],{kind:'query'});const qv=qEmbedded.embeddings[0];const scored=[]
  for(const item of items){if(product&&item.product!==product&&item.product!=='global')continue;if(item.status&&item.status!=='active')continue
    let semantic=0
    if(Array.isArray(item.embedding)&&item.embedding.length===qv.length)semantic=Math.max(0,cosine(qv,item.embedding))
    else semantic=Math.max(0,cosine(hashEmbedding(q),hashEmbedding(item.text)))
    const lexical=lexicalScore(q,item.text);const phrase=phraseBoost(q,item.text);const recency=recencyScore(item.createdAt||item.at);const scope=product&&item.product===product?1:item.product==='global'?.65:.2;const kind=kindWeight(item)
    const initial=(semantic*.54+lexical*.29+phrase*.09+scope*.05+recency*.03)*kind
    scored.push({item,semantic,lexical,phrase,recency,scope,kind,initial})
  }
  const candidates=scored.sort((a,b)=>b.initial-a.initial).slice(0,Math.max(limit*6,30))
  for(const x of candidates){const mixed=x.lexical>0&&x.semantic>.15?.07:0;const rerank=clamp((x.semantic*.46+x.lexical*.34+x.phrase*.11+x.scope*.05+x.recency*.04+mixed)*x.kind);x.rerank=rerank;x.final=x.initial*.42+rerank*.58}
  const ranked=candidates.sort((a,b)=>b.final-a.final)
  const out=[],perDoc=new Map(),perKind=new Map()
  for(const x of ranked){const doc=x.item.documentId||x.item.id,kind=x.item.kind||'knowledge';const dc=perDoc.get(doc)||0,kc=perKind.get(kind)||0;if(dc>=2||(!x.item.documentId&&kc>=3))continue;out.push(publicResult(x.item,x));perDoc.set(doc,dc+1);perKind.set(kind,kc+1);if(out.length>=Math.max(1,Math.min(30,limit)))break}
  return out
}

export async function searchKnowledge({query,product=null,limit=8}={}){return hybridRank(knowledgeStore().chunks,{query,product,limit})}

const negationSignature=(v='')=>{const low=normalize(v);return /(\bnao\b|\bnunca\b|\bsem\b|remover|desativar|proib|evitar)/.test(low)?'negative':'affirmative'}
export async function detectSemanticMemoryConflicts({product='global',kind='decision',text='',limit=5}={}){
  const scope=SUPPORTED_PRODUCTS.has(product)?product:'global',value=clean(text,10000);if(!value)return []
  const candidates=await hybridRank(semanticStore().items.filter(x=>x.product===scope||x.product==='global'),{query:value,product:scope,limit:Math.max(5,limit)})
  const sign=negationSignature(value),sameKind=normalize(kind)
  return candidates.filter(x=>x.score>=.48).map(x=>({...x,conflict:Boolean(normalize(x.kind||'')===sameKind&&x.score>=.58&&negationSignature(x.text)!==sign),duplicate:Boolean(x.score>=.91&&normalize(x.text)===normalize(value))})).slice(0,limit)
}
export async function rememberSemantic({product='global',kind='decision',text='',source='explicit',metadata={}}={}){
  const scope=SUPPORTED_PRODUCTS.has(product)?product:'global';const value=clean(text,10000);if(!value)throw new Error('Memória vazia.')
  const conflicts=await detectSemanticMemoryConflicts({product:scope,kind,text:value,limit:5});const duplicate=conflicts.find(x=>x.duplicate)
  if(duplicate)return {...duplicate,deduplicated:true,conflicts:conflicts.filter(x=>x.conflict).map(x=>x.id)}
  const embedded=await embedTexts([value],{kind:'document'});const store=semanticStore();const item={id:`sm_${crypto.randomUUID()}`,product:scope,kind:clean(kind,80)||'decision',text:value,source:clean(source,200)||'explicit',status:'active',at:nowIso(),createdAt:nowIso(),embedding:embedded.embeddings[0],embeddingProvider:embedded.provider,embeddingModel:embedded.model,conflictsWith:conflicts.filter(x=>x.conflict).map(x=>x.id),metadata:metadata&&typeof metadata==='object'?metadata:{}}
  store.items.push(item);store.items=store.items.slice(-3000);writeAtomic(SEMANTIC_MEMORY_FILE,store);return {...item,embedding:undefined,conflicts:conflicts.filter(x=>x.conflict)}
}
export function forgetSemantic(id){const store=semanticStore();const before=store.items.length;store.items=store.items.filter((x)=>x.id!==id);writeAtomic(SEMANTIC_MEMORY_FILE,store);return store.items.length<before}
export function clearSemantic({product=null,source=null}={}){const store=semanticStore();if(!product&&!source)store.items=[];else store.items=store.items.filter((x)=>{const productMatch=!product||x.product===product;const sourceMatch=!source||x.source===source;return !(productMatch&&sourceMatch)});writeAtomic(SEMANTIC_MEMORY_FILE,store);return {items:store.items.length}}
export function listSemantic({product=null,limit=100}={}){return semanticStore().items.filter((x)=>!product||x.product===product||x.product==='global').slice(-Math.max(1,Math.min(500,limit))).reverse().map(({embedding,...x})=>x)}
export async function searchSemanticMemory({query,product=null,limit=6}={}){return hybridRank(semanticStore().items,{query,product,limit})}

export async function retrieveMemoryKnowledge({query,product=null,knowledgeLimit=6,memoryLimit=5}={}){
  const thresholds=rag2Thresholds(query)
  const [knowledge,memory]=await Promise.all([searchKnowledge({query,product,limit:knowledgeLimit}),searchSemanticMemory({query,product,limit:memoryLimit})])
  const acceptedKnowledge=knowledge.filter((x)=>x.score>=thresholds.knowledge);const acceptedMemory=memory.filter((x)=>x.score>=thresholds.memory)
  const sources=[...new Set(acceptedKnowledge.map(x=>x.documentId||x.id))]
  const conflicts=acceptedMemory.filter(x=>Array.isArray(x.conflictsWith)&&x.conflictsWith.length)
  return {version:'2.4',qualityLayer:'3.1',query:clean(query,1000),product:product||'global',knowledge:acceptedKnowledge,memory:acceptedMemory,evidenceCount:acceptedKnowledge.length+acceptedMemory.length,sourceCoverage:sources.length,conflictAware:true,conflicts:conflicts.map(x=>({id:x.id,conflictsWith:x.conflictsWith})),retrieval:{generation:'RAG 2.0',strategy:'hybrid-semantic-lexical-rerank+source-diversity+dynamic-thresholds',embeddingModel:EMBED_MODEL,fallback:'realtalent-hash-256',knowledgeThreshold:thresholds.knowledge,memoryThreshold:thresholds.memory,identifierAware:thresholds.identifierLike}}
}

export function memoryKnowledgeStatus(){const k=knowledgeStore(),m=semanticStore();return {version:'2.4',qualityLayer:'3.1',knowledge:{documents:k.documents.length,chunks:k.chunks.length,file:KNOWLEDGE_FILE},semanticMemory:{items:m.items.length,conflictAware:true,file:SEMANTIC_MEMORY_FILE},embedding:{ollamaUrl:OLLAMA_URL,model:EMBED_MODEL,fallback:`realtalent-hash-${HASH_DIM}`},rag:{generation:'2.0',dynamicThresholds:true,sourceDiversity:true},policy:{durableMemory:'explicit-only',chatAutoPersistence:false,knowledgeIngestion:'explicit'}}}

export const memoryKnowledgeInfo={version:'2.4',capabilities:['local-embeddings','deterministic-embedding-fallback','semantic-memory','semantic-conflict-awareness','rag','rag-2-dynamic-thresholds','source-diversity','hybrid-retrieval','reranking','knowledge-index','explicit-memory-controls'],knowledgeFile:KNOWLEDGE_FILE,semanticMemoryFile:SEMANTIC_MEMORY_FILE,embeddingModel:EMBED_MODEL}
