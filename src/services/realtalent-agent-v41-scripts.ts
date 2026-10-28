import type { AssistantContext } from './realtalent-assistant'
import type { Lead, WorkspaceSnapshot } from '../domain/types'
import { buildSalesCoachingPlan } from './realtalent-sales-coaching'

export interface GeneratedCommercialScript {
  title: string
  body: string
  kind: 'call' | 'meeting' | 'whatsapp' | 'email'
  leadId: string | null
  grounded: boolean
  rationale: string
}
const normalize=(input:string)=>input.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
export const isCommercialScriptRequest = (prompt:string) => {
  const text=normalize(prompt)
  if (/\b(python|javascript|typescript|codigo|programacao|powershell|bash|sql|api)\b/.test(text)) return false
  return /\b(roteiro|script(?:\s+(?:de|para)\s+(?:venda|ligacao|prospeccao|atendimento))?|texto de prospeccao|modelo de ligacao)\b/.test(text)
    && /\b(crie|criar|monte|montar|prepare|preparar|gere|gerar|escreva|escrever|faca|faz|elabore|elaborar|quero|preciso|me de|me ajude)\b/.test(text)
}
const oneLine=(s:string,limit=250)=>s.replace(/\s+/g,' ').trim().slice(0,limit)
const safeFocusedLead=(snapshot: WorkspaceSnapshot,context:AssistantContext):Lead|null=>{
  const id=context.focusLeadId ?? (context.previousLeadIds?.length===1?context.previousLeadIds[0]:null)
  if(!id)return null
  const lead=snapshot.leads.find(item=>item.id===id)
  if(!lead)return null
  const role=snapshot.workspace.role
  if(role!=='owner' && role!=='admin' && (!context.currentUserId || lead.ownerId!==context.currentUserId))return null
  return lead
}
const lines=(items:string[])=>items.map((item,index)=>`${index+1}. ${oneLine(item,220)}`).join('\n')
export function createCommercialScript(prompt:string,snapshot:WorkspaceSnapshot,context:AssistantContext={}):GeneratedCommercialScript|null {
  if(!isCommercialScriptRequest(prompt))return null
  const normalized=normalize(prompt)
  const kind:GeneratedCommercialScript['kind']=/\bwhatsapp\b/.test(normalized)?'whatsapp':/\b(e-mail|email)\b/.test(normalized)?'email':/\b(reuniao|apresentacao presencial)\b/.test(normalized)?'meeting':'call'
  const lead=safeFocusedLead(snapshot,context)
  const plan=lead?buildSalesCoachingPlan(lead,snapshot,kind==='meeting'?'meeting':'call',context.now??new Date()):null
  const first=lead?oneLine(lead.name.split(/\s+/)[0],70):'[Nome do cliente]'
  const title=`Roteiro de ${kind==='whatsapp'?'WhatsApp':kind==='email'?'e-mail':kind==='meeting'?'reunião':'ligação'}${lead?` · ${oneLine(lead.company||lead.name,80)}`:''}`
  const objective=plan?.objective || (kind==='meeting'?'Entender o cenário e definir o próximo passo.':'Iniciar uma conversa de diagnóstico, sem presumir necessidades.')
  const opening=kind==='whatsapp'
    ? `Olá, ${first}! Sou [Seu nome], da [Sua empresa]. Gostaria de entender como vocês estão trabalhando [tema do serviço] e verificar se faz sentido conversarmos. Você teria alguns minutos esta semana?`
    :kind==='email'
    ? `Assunto: Conversa sobre [tema] — [Sua empresa]\nOlá, ${first}! Sou [Seu nome], da [Sua empresa]. Estou entrando em contato para compreender melhor como vocês lidam com [tema]. Se fizer sentido, podemos conversar brevemente e avaliar possibilidades.`
    :plan?.opening || `Olá, ${first}! Aqui é [Seu nome], da [Sua empresa]. Posso fazer duas perguntas rápidas para entender o contexto de vocês antes de apresentar alguma solução?`
  const questions=plan?.questions?.length?plan.questions.slice(0,4):[
    'Como vocês resolvem hoje essa necessidade?',
    'Qual dificuldade tem maior impacto no resultado ou na operação?',
    'O que seria importante melhorar nos próximos meses?',
    'Quais critérios vocês utilizariam para avaliar uma solução?',
  ]
  const objections=plan?.objections?.length
    ? plan.objections.slice(0,3).map(item=>`${oneLine(item.label,90)} → ${oneLine(item.responseAngle,210)}`)
    :['Preço/Orçamento → Entendo. Antes de falarmos sobre investimento, quais resultados seriam relevantes para justificar uma mudança?',
      'Já temos fornecedor → Faz sentido. O que funciona bem hoje e o que ainda poderia melhorar?',
      'Sem tempo agora → Sem problemas. Qual seria um momento adequado para uma conversa de dez minutos?']
  const proof=plan?.proofPoints?.length?`Provas cadastradas no CRM: ${plan.proofPoints.slice(0,3).map(x=>oneLine(x)).join(' | ')}.`
    :'Não afirmar números de resultados, cases ou diferenciais sem evidências verificáveis.'
  const body=[
    `ROTEIRO COMERCIAL — ${title}`,
    `Objetivo: ${oneLine(objective)}`,
    `\n1. ABERTURA\n${opening}`,
    `\n2. DIAGNÓSTICO\n${lines(questions)}`,
    `\n3. CONEXÃO COM O VALOR\n“Pelo que você descreveu, o principal ponto parece ser [resuma a necessidade com as palavras do cliente]. Podemos avaliar uma alternativa orientada a [resultado desejado], sem antecipar uma proposta.”`,
    `\n4. OBJEÇÕES — RESPOSTAS PARA ADAPTAR\n${lines(objections)}`,
    `\n5. PRÓXIMO PASSO\n“Faz sentido marcarmos [reunião/demonstração/retorno] para aprofundar [necessidade validada]? Qual dia funciona melhor?”`,
    `\n6. CRITÉRIOS DE QUALIDADE\n${proof}\nNão inventar dores, cargos, conversas anteriores ou condições comerciais. Registrar objeções e próximo passo real no CRM.`,
  ].join('\n')
  return {
    title,body,kind,leadId:lead?.id??null,grounded:Boolean(lead),
    rationale:lead?'Adaptado ao registro comercial visível, usando a estrutura de coaching e Playbooks cadastrados. Revise antes de apresentar.':'Modelo editável sem cliente vinculado. Personalize as partes entre colchetes antes de utilizar.',
  }
}
