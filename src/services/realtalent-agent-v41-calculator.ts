/**
 * RealTalent Agent V4.1 — deterministic commercial arithmetic.
 * Read-only: never runs arbitrary model generated code or mutates the CRM.
 * Monetary figures are rounded at the final step (2 decimal places).
 */
export interface SalesCalculation {
  title: string
  result: string
  formula: string
  details: string[]
  category: 'money' | 'percent' | 'number'
}
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const money = (value: number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value)
const percent = (value: number) => new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(value)+'%'
const number = (value: number) => new Intl.NumberFormat('pt-BR',{maximumFractionDigits:4}).format(value)
const round = (value: number) => Math.round((value + Number.EPSILON)*100)/100
export const parseCommercialNumber = (raw: string) => {
  const clean = raw.replace(/\s|R\$/gi,'').trim()
  if (!/^-?\d[\d.,]*$/.test(clean)) return null
  const comma = clean.lastIndexOf(','), dot = clean.lastIndexOf('.')
  let normalized = clean
  if (comma >= 0 && dot >= 0) normalized = comma > dot ? clean.replaceAll('.','').replace(',','.') : clean.replaceAll(',','')
  else if (comma >= 0) normalized = clean.replaceAll('.','').replace(',','.')
  else if ((clean.match(/\./g) || []).length > 1 || /^-?\d{1,3}\.\d{3}$/.test(clean)) normalized = clean.replaceAll('.','')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && Math.abs(parsed) <= 1e12 ? parsed : null
}
const TOKEN = '(-?\\d[\\d.,]*)'
const field = (text: string, label: string) => {
  const pattern = new RegExp('\\b(?:'+label+')\\s*(?:de|do|da|=|:)?\\s*(?:r\\$\\s*)?'+TOKEN+'\\s*(%?)','i')
  const direct = text.match(pattern)
  const reverse = new RegExp(TOKEN+'\\s*(%?)\\s+(?:'+label+')\\b','i')
  const match = direct ?? text.match(reverse)
  const parsed = match ? parseCommercialNumber(match[1]) : null
  return parsed === null ? null : { value:parsed, isPercent:match?.[2]==='%' }
}
const calc = (title:string,result:string,formula:string,details:string[],category:SalesCalculation['category']):SalesCalculation =>
  ({title,result,formula,details,category})

/** null => not a supported request (route to the semantic Agent instead). */
export function calculateCommercialRequest(input: string): SalesCalculation | null {
  const text = normalize(input).trim()
  if (!/\b(quanto|calcule|calcular|calcula|conta|somar|soma|divida|multiplique|desconto|margem|markup|precificacao|preco|custo|comissao|comissoes|conversao|meta|porcentagem|percentual|falta|restante)\b|^\s*-?\d[\d.,]*\s*[+*\/×÷-]\s*-?\d/.test(text)) return null

  const contacts = field(text, 'contatos?|leads?|prospectos?')
  const sales = field(text, 'vendas?|negocios?\\s+fechados?')
  if (/\b(conversao|converteram|taxa de vendas)\b/.test(text) && contacts && sales && contacts.value>0 && sales.value>=0) {
    const rate=sales.value/contacts.value*100
    return calc('Taxa de conversão',percent(rate),`${number(sales.value)} ÷ ${number(contacts.value)} × 100`,[
      'Numerador: vendas informadas pelo usuário. Denominador: contatos informados pelo usuário.',
      sales.value>contacts.value?'A quantidade de vendas supera a de contatos; confira se as duas métricas são comparáveis.':'Cálculo baseado somente nos valores fornecidos, não nos registros históricos do CRM.',
    ],'percent')
  }

  const target = field(text,'meta|objetivo|alvo')
  const achieved = field(text,'vendid[oa]s?|realizad[oa]s?|atingid[oa]s?|faturad[oa]s?|atual')
  if (target && achieved && /\b(falta|resta|restante|atingir|alcancar|meta)\b/.test(text) && target.value>=0 && achieved.value>=0) {
    const diff=round(Math.max(0,target.value-achieved.value))
    const currency=/\b(receita|fatur|r\$|reais|valor|vendas em reais)\b/.test(text)
    return calc('Saldo da meta',currency?money(diff):number(diff),
      `${number(target.value)} − ${number(achieved.value)} = ${number(diff)}`,[
        `Realizado: ${currency?money(achieved.value):number(achieved.value)} de ${currency?money(target.value):number(target.value)}.`,
        target.value>0?`Atingimento: ${percent(achieved.value/target.value*100)}.`:'Meta zero: não é possível obter percentual de atingimento.',
      ],currency?'money':'number')
  }

  const cost = field(text,'custo|custos|custa')
  const margin = field(text,'margem(?:\\s+(?:desejada|alvo|bruta))?')
  const markup = field(text,'markup')
  const salePrice = field(text,'(?:preco|valor)(?:\\s+de\\s+venda)?|vendid[oa]\\s+a|venda\\s+por')
  if (cost && margin?.isPercent && /\b(preco|cobr|precific|margem|vender)\b/.test(text) && cost.value>=0) {
    if (margin.value>=100 || margin.value<0) return null
    const price=round(cost.value/(1-margin.value/100))
    return calc('Preço para margem desejada',money(price),`Preço = ${money(cost.value)} ÷ (1 − ${percent(margin.value)})`,[
      `Custo informado: ${money(cost.value)}. Margem sobre o preço de venda: ${percent(margin.value)}.`,
      `Lucro bruto estimado (sem impostos e demais despesas): ${money(round(price-cost.value))}.`,
      'Margem é diferente de markup; impostos e taxas não informados não foram presumidos.',
    ],'money')
  }
  if (cost && markup?.isPercent && cost.value>=0 && markup.value>=0) {
    const price=round(cost.value*(1+markup.value/100))
    return calc('Preço com markup',money(price),`Preço = ${money(cost.value)} × (1 + ${percent(markup.value)})`,[
      `Acréscimo nominal: ${money(round(price-cost.value))}.`,
      'Markup é aplicado ao custo; a margem sobre venda resultante é diferente.',
    ],'money')
  }
  if (cost && salePrice && /\b(margem|lucro bruto|rentabilidade)\b/.test(text) && !margin?.isPercent && salePrice.value>0) {
    const amount=round(salePrice.value-cost.value)
    return calc('Margem bruta estimada',percent(amount/salePrice.value*100),
      `Margem = (${money(salePrice.value)} − ${money(cost.value)}) ÷ ${money(salePrice.value)} × 100`,[
        `Diferença bruta: ${money(amount)}.`,'O resultado não desconta impostos e despesas não informados.',
      ],'percent')
  }

  const discount=field(text,'desconto')
  const commission=field(text,'comissao|comissoes')
  const amount=field(text,'(?:sobre|em|de|valor|venda|preco)\\s*(?:total)?')
  const genericAmount = (()=>{
    const m=text.match(/(?:de|em|sobre)\s+(?:r\$\s*)?(-?\d[\d.,]*)\s*(?:reais)?\b/)
    return m?parseCommercialNumber(m[1]):null
  })()
  const afterPercent = text.match(/%\s*(?:de|em|sobre)\s+(?:r\$\s*)?(-?\d[\d.,]*)/)
  const explicitBase = afterPercent ? parseCommercialNumber(afterPercent[1]) : null
  const principal = salePrice?.value ?? explicitBase ?? amount?.value ?? genericAmount
  if (discount?.isPercent && principal!==null && principal!==undefined && principal>=0 && discount.value>=0 && discount.value<=100) {
    const saved=round(principal*discount.value/100), final=round(principal-saved)
    return calc('Preço após desconto',money(final),`${money(principal)} × (1 − ${percent(discount.value)})`,[
      `Valor do desconto: ${money(saved)}.`,'Valor final antes de eventuais impostos e taxas.',
    ],'money')
  }
  if (commission?.isPercent && principal!==null && principal!==undefined && principal>=0 && commission.value>=0 && commission.value<=100) {
    return calc('Comissão comercial',money(round(principal*commission.value/100)),
      `${money(principal)} × ${percent(commission.value)}`,['Comissão bruta, sem retenções ou regras adicionais de remuneração.'],'money')
  }

  const percentage=text.match(new RegExp(TOKEN+'\\s*%\\s+(?:de|sobre)\\s+(?:r\\$\\s*)?'+TOKEN))
  if (percentage) {
    const rate=parseCommercialNumber(percentage[1]), base=parseCommercialNumber(percentage[2])
    if (rate!==null && base!==null && rate>=0 && base>=0) {
      return calc('Cálculo percentual',money(round(base*rate/100)),`${money(base)} × ${percent(rate)}`,[
        'Percentual aplicado ao valor informado.', 'Não foram usadas informações do banco de dados.',
      ],'money')
    }
  }

  const expression=text.match(/^\s*(?:(?:calcule|calcular|quanto e|resolva)\s+)?(-?\d[\d.,]*)\s*([+*\/×÷-])\s*(-?\d[\d.,]*)\s*\??\s*$/)
  if (expression) {
    const left=parseCommercialNumber(expression[1]),right=parseCommercialNumber(expression[3]),operator=expression[2]
    if (left===null || right===null || (['/','÷'].includes(operator) && right===0)) return null
    const result= operator==='+'?left+right:operator==='-'?left-right:operator==='*'||operator==='×'?left*right:left/right
    if (!Number.isFinite(result)||Math.abs(result)>1e12) return null
    return calc('Calculadora',number(result),`${number(left)} ${operator} ${number(right)} = ${number(result)}`,[
      'Resultado calculado por operação matemática, não estimado por modelo de linguagem.',
    ],'number')
  }
  return null
}
