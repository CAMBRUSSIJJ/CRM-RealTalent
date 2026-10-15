import {executeNativeAppTool,crmNativeReadInfo,nativeAppToolCatalog} from './app-tools.mjs'

const norm=(v)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const numberFrom=(text,patterns=[])=>{for(const p of patterns){const m=norm(text).match(p);if(m)return Number(m[1])}return null}
const has=(t,re)=>re.test(norm(t))

export function crmReadToolSelection(message=''){
  const t=norm(message)
  if(/\b(crie|criar|adicione|adicionar|mova|mover|altere|alterar|atualize|atualizar|envie|enviar|exclua|excluir|delete|marque|conclua|atribua|troque)\b/.test(t)) return null
  const days=numberFrom(t,[/(\d+)\s*dias?/,/ha\s+(\d+)\s*dias?/,/mais\s+de\s+(\d+)\s*dias?/])
  if(/(meu dia|prepare meu dia|prioridades? de hoje|o que (eu )?(preciso|devo) fazer hoje|organize meu dia)/.test(t)) return {tool:'crm.myday.read',args:{includeUpcoming:false},reason:'pedido de priorização diária'}
  if(/(pipeline|funil)/.test(t)&&/(analise|resum|vis[aã]o|saude|saúde|como esta|como está|valor|etapas?)/.test(t)) return {tool:'crm.pipeline.summary',args:{},reason:'análise/resumo de pipeline'}
  if(/oportunidade|negocio|negócio|deal/.test(t)){
    const args={}
    if(/risco|em risco/.test(t))args.riskOnly=true
    if(/parad|sem atividade|inativ/.test(t)&&days!=null)args.staleDays=days
    if(/fech(ar|amento)|previs[aã]o/.test(t)&&days!=null)args.closingWithinDays=days
    return {tool:'crm.opportunities.search',args,reason:'consulta de oportunidades'}
  }
  if(/tarefas?/.test(t)){
    const args={}
    if(/vencid|atrasad/.test(t))args.overdue=true
    if(/hoje/.test(t))args.dueToday=true
    if(/urgente/.test(t))args.priority='urgent'
    return {tool:'crm.tasks.search',args,reason:'consulta de tarefas'}
  }
  if(/follow[- ]?ups?|retornos?|acompanhamentos?/.test(t)&&!/(contatos?|leads?)/.test(t)){
    const args={}
    if(/vencid|atrasad/.test(t))args.overdue=true
    if(/hoje/.test(t))args.dueToday=true
    return {tool:'crm.followups.search',args,reason:'consulta de follow-ups'}
  }
  if(/contatos?|leads?/.test(t)||(/pessoas?/.test(t)&&/(mostre|liste|listar|encontre|buscar|busque|quais|quem|sem telefone|sem e-?mail|sem responsavel|sem responsável|no crm|do crm)/.test(t))){
    const args={}
    if(/sem follow[- ]?up|sem contato|esquecid|parad/.test(t)&&days!=null)args.withoutFollowupDays=days
    if(/oportunidade aberta|negocio aberto|negócio aberto/.test(t))args.hasOpenOpportunity=true
    if(/sem telefone/.test(t))args.missingField='phone'
    if(/sem e-?mail/.test(t))args.missingField='email'
    if(/sem responsavel|sem responsável/.test(t))args.missingField='owner'
    return {tool:'crm.contacts.search',args,reason:'consulta de contatos/leads'}
  }
  if(/agenda|reuni(ao|ão)|compromissos?/.test(t))return {tool:'crm.calendar.read',args:{days:1},reason:'consulta de agenda'}
  return null
}

export function runCrmNativeRead({message='',context,argsOverride=null}={}){
  const selection=crmReadToolSelection(message)
  if(!selection)return {ok:false,status:'no_matching_native_read',error:'Nenhuma CRM Native Read Tool correspondeu ao pedido.'}
  const args={...selection.args,...(argsOverride&&typeof argsOverride==='object'?argsOverride:{})}
  const execution=executeNativeAppTool({name:selection.tool,args,context})
  return {...execution,selection:{...selection,args},nativeRead:crmNativeReadInfo}
}

const fmtMoney=(v)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Number(v||0))
const rowLabel=(r)=>r?.companyName||r?.company||r?.title||r?.name||r?.id||'item'

export function renderCrmNativeRead(result){
  if(!result?.ok)return result?.error||'Não consegui consultar dados autorizados do CRM.'
  const tool=result.tool;const data=result.result
  if(tool==='crm.myday.read'){
    const s=data?.summary||{}
    const top=(data?.opportunities||[]).slice(0,4).map((o,i)=>`${i+1}. **${rowLabel(o)}** — ${fmtMoney(o.value)} · ${o.stageName||'etapa'}${o.daysWithoutActivity!=null?` · ${o.daysWithoutActivity} dias sem atividade`:''}`).join('\n')
    return `## Meu Dia\n\n- Tarefas vencidas: **${s.overdueTasks||0}**\n- Tarefas para hoje: **${s.todayTasks||0}**\n- Follow-ups vencidos: **${s.overdueFollowups||0}**\n- Follow-ups para hoje: **${s.todayFollowups||0}**\n- Reuniões/agenda: **${s.meetings||0}**\n- Oportunidades prioritárias: **${s.priorityOpportunities||0}**${top?`\n\n### Prioridades comerciais\n${top}`:''}`
  }
  if(tool==='crm.pipeline.summary'){
    const stages=(data?.stages||[]).map(s=>`- **${s.name}**: ${s.count} · ${fmtMoney(s.value)}${s.stale7?` · ${s.stale7} parada(s) 7+ dias`:''}`).join('\n')
    return `## Pipeline\n\n**${data?.totalOpen||0} oportunidades abertas** · ${fmtMoney(data?.totalOpenValue)} em valor · ${fmtMoney(data?.weightedValue)} ponderado.\n\n- Paradas 7+ dias: **${data?.stale7||0}**\n- Paradas 14+ dias: **${data?.stale14||0}**\n- Fechamento previsto em 7 dias: **${data?.closing7||0}**\n\n### Por etapa\n${stages||'Sem etapas disponíveis.'}`
  }
  if(Array.isArray(data)){
    const rows=data.slice(0,12)
    if(!rows.length)return 'Não encontrei registros que atendam a esse filtro nos dados autorizados do CRM.'
    const lines=rows.map((r,i)=>{if(tool==='crm.contacts.search')return `${i+1}. **${rowLabel(r)}**${r.daysSinceLastContact!=null?` · ${r.daysSinceLastContact} dias sem contato`:''}${r.openOpportunities?` · ${r.openOpportunities} oportunidade(s) · ${fmtMoney(r.openOpportunityValue)}`:''}`;if(tool==='crm.opportunities.search')return `${i+1}. **${rowLabel(r)}** · ${fmtMoney(r.value)} · ${r.stageName||'etapa'}${r.daysWithoutActivity!=null?` · ${r.daysWithoutActivity} dias sem atividade`:''}`;if(tool==='crm.tasks.search')return `${i+1}. **${r.title||'Tarefa'}** · ${r.priority||'normal'} · ${r.dueAt?new Date(r.dueAt).toLocaleDateString('pt-BR'):'sem prazo'}`;if(tool==='crm.followups.search')return `${i+1}. **${r.companyName||r.leadName||r.title||'Follow-up'}** · ${r.dueAt?new Date(r.dueAt).toLocaleDateString('pt-BR'):'sem prazo'}${r.daysOverdue?` · ${r.daysOverdue} dia(s) atrasado`:''}`;return `${i+1}. **${rowLabel(r)}**`}).join('\n')
    return `Encontrei **${data.length}** resultado(s) nos dados autorizados do CRM.\n\n${lines}${data.length>rows.length?`\n\nMostrando os primeiros ${rows.length}.`:''}`
  }
  if(data&&typeof data==='object')return `Encontrei o registro solicitado no CRM: **${rowLabel(data)}**.`
  return 'Consulta concluída, sem dados adicionais para exibir.'
}

export function crmNativeReadCatalog(){return nativeAppToolCatalog('crm',{readOnly:true}).filter(t=>['crm.contacts.search','crm.contacts.get','crm.opportunities.search','crm.opportunities.get','crm.pipeline.summary','crm.pipeline.list','crm.tasks.search','crm.tasks.get','crm.followups.search','crm.myday.read','crm.calendar.read'].includes(t.name))}
