// A conservative byte-based estimate, not the model's tokenizer. Reserve room
// for the chat template and output; never truncate the current request or JSON.
export function ollamaContextBudget(outputLimit=750,configured=process.env.OLLAMA_CONTEXT_LENGTH){
  const parsed=Number(configured)
  const numCtx=Number.isInteger(parsed)&&parsed>=2048&&parsed<=16384?parsed:4096
  const numPredict=Math.min(outputLimit,Math.floor(numCtx/4))
  return {numCtx,numPredict,maxInputBytes:2*(numCtx-numPredict-256)}
}

export function fitOllamaJsonMessages({system,input,trimGroups=[],budget}){
  const data=JSON.parse(JSON.stringify(input))
  const systemBytes=Buffer.byteLength(system,'utf8')
  const size=()=>systemBytes+Buffer.byteLength(JSON.stringify(data),'utf8')
  const fieldAt=path=>{
    let parent=data
    for(const part of path.slice(0,-1))parent=parent?.[part]
    const key=path.at(-1)
    return parent&&typeof parent[key]==='string'?{parent,key}:null
  }
  for(const group of trimGroups){
    while(size()>budget.maxInputBytes){
      const candidates=group.map(({path,minLength=0})=>{
        const field=fieldAt(path)
        return field?{...field,minLength}:null
      }).filter(item=>item&&item.parent[item.key].length>item.minLength)
        .sort((a,b)=>(b.parent[b.key].length-b.minLength)-(a.parent[a.key].length-a.minLength))
      if(!candidates.length)break
      const {parent,key,minLength}=candidates[0]
      const reduction=Math.max(1,Math.ceil((size()-budget.maxInputBytes)/2))
      parent[key]=parent[key].slice(0,Math.max(minLength,parent[key].length-reduction))
        .replace(/[\uD800-\uDBFF]$/,'')
    }
    if(size()<=budget.maxInputBytes)break
  }
  if(size()>budget.maxInputBytes)return null
  return [{role:'system',content:system},{role:'user',content:JSON.stringify(data)}]
}
