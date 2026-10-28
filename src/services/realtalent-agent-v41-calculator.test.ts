import { describe, expect, it } from 'vitest'
import { calculateCommercialRequest, parseCommercialNumber } from './realtalent-agent-v41-calculator'
const calc = (prompt:string)=>calculateCommercialRequest(prompt)
describe('RealTalent Tools Engine V4.1 — cálculos determinísticos',()=>{
  it('entende separadores brasileiros e internacionais',()=>{
    expect(parseCommercialNumber('1.500,50')).toBe(1500.5)
    expect(parseCommercialNumber('1,500.50')).toBe(1500.5)
    expect(parseCommercialNumber('R$ 100,25')).toBe(100.25)
    expect(parseCommercialNumber('abc')).toBeNull()
  })
  it('faz percentual sem usar modelo como calculadora',()=>expect(calc('quanto é 10% de 1500')?.result).toBe('R$ 150,00'))
  it('distingue margem alvo de markup',()=>{
    expect(calc('calcule o preço com custo de R$ 100 e margem de 30%')?.result).toBe('R$ 142,86')
    expect(calc('calcule o preço com custo de 100 e markup de 80%')?.result).toBe('R$ 180,00')
  })
  it('calcula desconto e comissão tomando a base correta, não a porcentagem',()=>{
    expect(calc('calcule desconto de 10% em R$ 1500')?.result).toBe('R$ 1.350,00')
    expect(calc('quanto é a comissão de 5% sobre R$ 5000')?.result).toBe('R$ 250,00')
  })
  it('calcula conversão independente da ordem de quantidade e rótulo',()=>{
    expect(calc('calcule conversão de 50 contatos e 8 vendas')?.result).toBe('16%')
    expect(calc('qual a conversão de 8 vendas e 50 contatos')?.result).toBe('16%')
  })
  it('faz contas simples e evita divisão por zero',()=>{
    expect(calc('12 * 3')?.result).toBe('36')
    expect(calc('quanto é 240 / 3')?.result).toBe('80')
    expect(calc('10 / 0')).toBeNull()
  })
  it('não calcula preço sem dados suficientes',()=>{
    expect(calc('quanto devo cobrar pelo meu serviço')).toBeNull()
    expect(calc('qual margem devo utilizar')).toBeNull()
    expect(calc('calcule preço com custo 100 e margem 100%')).toBeNull()
  })
  it('mostra premissas sem alegar que consultou preços reais',()=>{
    const result=calc('quanto é 25% de 200')
    expect(result?.formula).toContain('×')
    expect(result?.details.join(' ')).toContain('Não foram usadas')
  })
})
