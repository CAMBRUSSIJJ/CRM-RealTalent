import test from 'node:test'
import assert from 'node:assert/strict'
import {analyzeInstagramPostBatchesG48,summarizeInstagramBatchG48} from './crm-instagram-batch-g48.mjs'

const posts=Array.from({length:17},(_,i)=>({
  id:i+1,url:'https://www.instagram.com/p/SLNT'+String(i+1).padStart(5,'0')+'/',
  title:'Salento Barbearia · publicação '+(i+1),
  snippet:'Salento Barbearia em Rio Grande RS apresenta o serviço público número '+(i+1),
  reading:'snippet',
}))
test('G4.8 divides at most 12 indexed posts into two bounded sequential Ollama batches',async()=>{
  let concurrent=0,maxConcurrent=0
  const batches=[]
  const result=await analyzeInstagramPostBatchesG48({
    company:'Salento Barbearia',city:'Rio Grande, RS',question:'Analise as publicações',sources:posts,
  },{batchSize:6,maxPosts:12,analyzeBatch:async input=>{
    concurrent++;maxConcurrent=Math.max(maxConcurrent,concurrent)
    batches.push(input.sources.map(x=>x.id))
    const output=input.sources.map(x=>({id:x.id,title:x.title,url:x.url,quote:x.snippet,
      observation:x.snippet,topic:'services',strategicReading:'Divulga serviços',
      commercialHypothesis:'Investigar gestão de capacidade',diagnosticQuestion:'Como lidam com a demanda?',
      evidenceLevel:'snippet',reviewStatus:'analysis_only'}))
    concurrent--
    return {status:'analyzed',posts:output}
  }})
  assert.equal(result.status,'analyzed')
  assert.equal(result.indexedPosts,12)
  assert.equal(result.analyzedPosts,12)
  assert.equal(result.batchesProcessed,2)
  assert.equal(result.successfulBatches,2)
  assert.deepEqual(batches.map(x=>x.length),[6,6])
  assert.equal(maxConcurrent,1)
  assert.deepEqual(result.patterns,[{topic:'services',count:12}])
  assert.ok(result.posts.every(x=>x.reviewStatus==='analysis_only'))
})
test('if Ollama is unavailable, stop further batches instead of hammering the local model',async()=>{
  let calls=0
  const result=await analyzeInstagramPostBatchesG48({company:'Salento Barbearia',sources:posts},{
    analyzeBatch:async()=>{calls++;return {status:'model_unavailable',posts:[]}},
  })
  assert.equal(calls,1)
  assert.equal(result.batchesProcessed,1)
  assert.equal(result.status,'partial_or_unavailable')
  assert.equal(result.analyzedPosts,0)
  assert.deepEqual(result.failures,['model_unavailable'])
})
test('empty source set never calls Ollama and never produces fictional topics',async()=>{
  let count=0
  const result=await analyzeInstagramPostBatchesG48({
    company:'Salento Barbearia',sources:[{url:'https://www.instagram.com/salentobarbearia/',
      title:'Perfil Salento Barbearia',snippet:'Rio Grande RS',id:12}],
  },{analyzeBatch:async()=>{count++}})
  assert.equal(count,0)
  assert.equal(result.indexedPosts,0)
  assert.equal(result.status,'no_indexed_posts')
  assert.deepEqual(result.patterns,[])
})
test('patterns come solely from analyzed posts rather than unverified snippets',()=>{
  const sum=summarizeInstagramBatchG48([
    {topic:'positioning'},{topic:'positioning'},{topic:'partnership'},
  ],12,[{status:'analyzed'},{status:'insufficient_evidence'}])
  assert.equal(sum.analyzedPosts,3)
  assert.equal(sum.indexedPosts,12)
  assert.deepEqual(sum.patterns,[{topic:'positioning',count:2},{topic:'partnership',count:1}])
  assert.equal(sum.status,'analyzed')
})
test('batches never include more than two sequential requests regardless of overrides',async()=>{
  let calls=0
  const result=await analyzeInstagramPostBatchesG48({company:'Salento Barbearia',sources:posts},{
    maxPosts:999,batchSize:999,analyzeBatch:async()=>{calls++;return {status:'insufficient_evidence',posts:[]}},
  })
  assert.equal(calls,2)
  assert.equal(result.indexedPosts,12)
})
