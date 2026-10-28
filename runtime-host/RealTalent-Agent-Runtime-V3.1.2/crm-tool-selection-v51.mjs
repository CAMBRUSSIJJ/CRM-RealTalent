// Pure policy for V5.1 multi-tool plans. The model proposes; catalog and CRM authorize.
const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const OPERATIONS = /\b(crie|criar|cadastre|cadastrar|agende|agendar|marque|marcar|envie|enviar|mande|mandar|registre|registrar|atualize|atualizar|mova|mover|exclua|excluir|apague|apagar|consulte|consultar|analise|analisar|calcule|calcular|liste|listar|prepare|preparar|busque|buscar|encontre|encontrar|priorize|priorizar|resuma|resumir)\b/g
export function isMultiToolRequest(prompt) {
  const text = normalize(prompt)
  const actions = [...text.matchAll(OPERATIONS)].map(m=>m[0])
  const connective = /\b(e(?:\s+depois|\s+tambem)?|depois|em seguida|alem disso|e tambem)\b|[;,]/.test(text)
  return actions.length >= 2 && connective
}

export function validateToolSelection(raw, catalog, {compound=false}={}) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.capabilityIds)) return null
  const declared = raw.capabilityIds
  if (declared.length<1 || declared.length>8 || declared.some(id=>typeof id!=='string')) return null
  const allowed=new Map(catalog.filter(x=>x && x.execution !== 'guided').map(item=>[item.id,item]))
  const unique=[...new Set(declared)]
  if (unique.length!==declared.length || unique.some(id=>!allowed.has(id))) return null
  if (compound && unique.length<2) return null
  const confidence=Number(raw.confidence)
  if (!Number.isFinite(confidence) || confidence<0.75 || confidence>1) return null
  return {ids:unique,confidence, rationale:String(raw.rationale||'').slice(0,250)}
}

export function verifyModelPlannerCoverage(selection, payload) {
  if (!selection) return {ok:true,reason:'no-selection'}
  if (!payload || payload.ok!==true) return {ok:false,reason:'planner-unavailable'}
  const decision=payload.decision
  if (decision === 'clarify') return {ok:true,reason:'clarification'}
  if (decision !== 'execute') return {ok:false,reason:'planner-not-executable'}
  const raw=payload.plan?.steps
  if (!Array.isArray(raw) || raw.length<selection.ids.length) return {ok:false,reason:'missing-tool-step'}
  const matched=raw.map(s=>s?.capabilityId)
  if (selection.ids.some(id=>!matched.includes(id))) return {ok:false,reason:'missing-selected-capability'}
  if (matched.some(id=>typeof id!=='string' || !selection.ids.includes(id))) return {ok:false,reason:'unexpected-capability'}
  return {ok:true,reason:'complete'}
}

export function validateRunPreflight(steps, catalog) {
  if(!Array.isArray(steps)||!steps.length||steps.length>8)return {ok:false,error:'Plano vazio ou com mais de 8 etapas.'}
  const registered=new Map(catalog.map(x=>[x.id,x]))
  const ids=new Set()
  for(const step of steps){
    const def=registered.get(step?.capabilityId)
    if(!def || def.execution==='guided')return {ok:false,error:'O plano contém ferramenta não permitida.'}
    if(!step.id || ids.has(step.id))return {ok:false,error:'Etapas duplicadas ou sem identificação.'}
    ids.add(step.id)
    if(step.risk!==def.risk)return {ok:false,error:'Risco da operação diverge do catálogo autorizado.'}
  }
  const undo=steps.some(s=>s.capabilityId==='agent.undo_last')
  if(undo&&steps.length>1)return {ok:false,error:'Desfazer deve ser uma operação isolada.'}
  return {ok:true,error:''}
}
