// G4.8: bounded multi-batch analysis for publicly indexed Instagram posts.
// Offline Ollama does the interpretation, not collection; no Meta API,
// unauthorized scraping, publishing or automatic G4 approval.
import {collectInstagramPostEvidenceG47,analyzeInstagramPostsG47} from './crm-instagram-post-analysis-g47.mjs'

const topicNames=new Set(['services','positioning','promotion','call_to_action','partnership',
  'expansion','hiring','customer_experience','other'])
export function summarizeInstagramBatchG48(posts,indexedCount,batchResults){
  const topics={}
  for(const item of posts){
    if(!topicNames.has(item.topic))continue
    topics[item.topic]=(topics[item.topic]||0)+1
  }
  const patterns=Object.entries(topics).sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([topic,count])=>({topic,count}))
  const failures=batchResults.filter(x=>!['analyzed','insufficient_evidence','no_indexed_posts'].includes(x.status))
  const successCount=batchResults.filter(x=>x.status==='analyzed').length
  return {status:posts.length?'analyzed':failures.length?'partial_or_unavailable':'insufficient_evidence',
    posts,patterns,indexedPosts:indexedCount,analyzedPosts:posts.length,
    batchesProcessed:batchResults.length,successfulBatches:successCount,
    failures:failures.map(x=>x.status).slice(0,3),
    message:posts.length
      ?'Análise de '+posts.length+' de '+indexedCount+' publicação(ões) indexada(s), por texto disponível; nenhuma mídia bloqueada foi acessada.'
      :failures.length
        ?'Alguns lotes não puderam ser concluídos no Ollama; nenhuma conclusão foi criada sem evidências.'
        :'Nenhum post tinha informação textual suficiente para gerar uma interpretação confirmável.'}
}
export async function analyzeInstagramPostBatchesG48(input,{
  analyzeBatch=analyzeInstagramPostsG47,fetcher=fetch,ollamaUrl='http://127.0.0.1:11434',
  model='qwen3:8b',maxPosts=12,batchSize=6,
}={}){
  const sources=Array.isArray(input?.sources)?input.sources:[]
  const evidence=collectInstagramPostEvidenceG47(sources,{limit:Math.min(12,Math.max(1,maxPosts))})
  if(!evidence.length)return {status:'no_indexed_posts',posts:[],indexedPosts:0,
    analyzedPosts:0,patterns:[],batchesProcessed:0,successfulBatches:0,failures:[],
    message:'Nenhuma publicação pública indexada com trecho aproveitável foi encontrada.'}
  const size=Math.min(6,Math.max(1,batchSize))
  const outputs=[]
  const batchResults=[]
  for(let i=0;i<evidence.length;i+=size){
    const ids=new Set(evidence.slice(i,i+size).map(x=>x.id))
    const slice=sources.filter(x=>ids.has(Number(x.id)))
    const result=await analyzeBatch({...input,sources:slice},{fetcher,ollamaUrl,model})
    batchResults.push({status:result?.status||'unavailable'})
    if(Array.isArray(result?.posts))outputs.push(...result.posts.filter(post=>ids.has(Number(post.id))))
    // Respect the local machine: sequential model requests, stop when unavailable,
    // never enqueue repeated calls after Ollama reports a failure.
    if(['model_unavailable','model_invalid_response'].includes(result?.status))break
  }
  return summarizeInstagramBatchG48(outputs,evidence.length,batchResults)
}
