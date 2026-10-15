const cleanText=(v,max=4000)=>String(v??'').slice(0,max)
const cleanId=(v)=>v==null?null:cleanText(v,240)
const allowedProduct=(v)=>['crm','blue_ocean'].includes(v)?v:null

const normalizeSelected=(selected)=>{
  if(!selected||typeof selected!=='object')return null
  return {
    type:cleanText(selected.type||selected.kind||selected.entityType||'',80)||null,
    id:cleanId(selected.id||selected.entityId),
    label:cleanText(selected.label||selected.name||selected.title||'',240)||null,
    data:selected.data&&typeof selected.data==='object'?selected.data:null,
  }
}

export function normalizeAppContext(input={}, {product=null,source='app'}={}){
  const inferred=allowedProduct(product)||allowedProduct(input.product)||allowedProduct(input.productId)
  if(!inferred)throw new Error('App Context Bridge exige product=crm ou blue_ocean.')
  const workspace=input.workspace&&typeof input.workspace==='object'?input.workspace:{}
  const user=input.user&&typeof input.user==='object'?input.user:{}
  const route=cleanText(input.route||input.currentRoute||input.path||'',600)||null
  const screenState=input.screenState&&typeof input.screenState==='object'?input.screenState:(input.screen_state&&typeof input.screen_state==='object'?input.screen_state:null)
  const errors=Array.isArray(input.errors)?input.errors.slice(0,30).map((e)=>typeof e==='string'?cleanText(e,1200):e):[]
  const actions=Array.isArray(input.actionsAllowed||input.allowedActions)?(input.actionsAllowed||input.allowedActions).slice(0,80).map((x)=>cleanText(x,180)):[]
  return {
    version:'2.2', product:inferred, source:cleanText(source||input.source||'app',80),
    workspace:{id:cleanId(workspace.id),name:cleanText(workspace.name||'',240)||null},
    user:{id:cleanId(user.id),role:cleanText(user.role||input.userRole||'',120)||null,displayName:cleanText(user.displayName||user.name||'',240)||null},
    route, selected:normalizeSelected(input.selected||input.selectedEntity||input.selection),
    ids:input.ids&&typeof input.ids==='object'?input.ids:{},
    screenState, errors, actionsAllowed:actions,
    data:input.data&&typeof input.data==='object'?input.data:(input.snapshot&&typeof input.snapshot==='object'?input.snapshot:null),
    rawContext:input.rawContext&&typeof input.rawContext==='object'?input.rawContext:null,
    capturedAt:new Date().toISOString(),
  }
}

export function inferAppContextFromLegacy(product, context={}){
  const workspace=context.workspace&&typeof context.workspace==='object'?context.workspace:{}
  if(product==='crm'){
    const selectedId=context.focusLeadId||context.focusProposalId||null
    const selectedType=context.focusLeadId?'contact_lead':context.focusProposalId?'proposal':null
    return normalizeAppContext({
      product,workspace,route:context.route||null,
      selected:selectedId?{type:selectedType,id:selectedId}:null,
      ids:{focusLeadId:context.focusLeadId||null,focusProposalId:context.focusProposalId||null},
      data:{stages:context.stages||[],leads:context.leads||[],contacts:context.contacts||[],openActivities:context.openActivities||[],opportunities:context.opportunities||[],products:context.products||[],proposals:context.proposals||[],goals:context.goals||[]},
      rawContext:context,
    },{product,source:'legacy-agent-context'})
  }
  return normalizeAppContext({
    product,workspace:{id:context.service?.id||workspace.id,name:context.service?.name||workspace.name},route:context.route||null,
    selected:context.selected||null,
    data:{service:context.service||null,discovery:context.discovery||null,journeys:context.journeys||[],stages:context.stages||[],problems:context.problems||[],opportunities:context.opportunities||[],blueprintDraft:context.blueprintDraft||null},
    rawContext:context,
  },{product,source:'legacy-agent-context'})
}

export function appContextIsFresh(ctx, maxAgeMs=30*60*1000){
  const ts=Date.parse(ctx?.capturedAt||'');return Number.isFinite(ts)&&Date.now()-ts<=maxAgeMs
}

export function appContextPublic(ctx){
  if(!ctx)return null
  return {version:ctx.version,product:ctx.product,source:ctx.source,workspace:ctx.workspace,user:ctx.user,route:ctx.route,selected:ctx.selected,ids:ctx.ids,screenState:ctx.screenState,errors:ctx.errors,actionsAllowed:ctx.actionsAllowed,capturedAt:ctx.capturedAt,data:ctx.data}
}
