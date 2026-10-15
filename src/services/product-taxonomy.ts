import type { ProductCommercialType } from '../domain/types'

export const PRODUCT_CATEGORIES = [
  'Software', 'Serviços', 'Implantação', 'Consultoria', 'Treinamento', 'Suporte', 'Licenciamento', 'Add-on', 'Pacote / Oferta', 'Outro',
] as const

export const PRODUCT_COMMERCIAL_TYPES: Array<{ value: ProductCommercialType; label: string; description: string }> = [
  { value: 'software', label: 'Software', description: 'Produto digital vendido como solução.' },
  { value: 'service', label: 'Serviço', description: 'Entrega profissional pontual ou contínua.' },
  { value: 'subscription', label: 'Assinatura', description: 'Oferta recorrente por período.' },
  { value: 'license', label: 'Licença', description: 'Direito de uso por licença ou usuário.' },
  { value: 'addon', label: 'Add-on', description: 'Complemento de outro produto.' },
  { value: 'bundle', label: 'Pacote / Oferta', description: 'Combinação reutilizável de itens.' },
  { value: 'implementation', label: 'Implantação', description: 'Setup, configuração e onboarding.' },
  { value: 'training', label: 'Treinamento', description: 'Capacitação comercial ou operacional.' },
  { value: 'consulting', label: 'Consultoria', description: 'Diagnóstico e orientação especializada.' },
  { value: 'support', label: 'Suporte', description: 'Suporte e acompanhamento contratado.' },
  { value: 'other', label: 'Outro', description: 'Classificação comercial personalizada.' },
]

export const inferProductCommercialType = (category: string, kind: 'product' | 'service' = 'service'): ProductCommercialType => {
  const value = category.toLocaleLowerCase('pt-BR')
  if (/implant/.test(value)) return 'implementation'
  if (/trein/.test(value)) return 'training'
  if (/consult/.test(value)) return 'consulting'
  if (/suporte/.test(value)) return 'support'
  if (/licen/.test(value)) return 'license'
  if (/add[ -]?on/.test(value)) return 'addon'
  if (/pacote|oferta|bundle/.test(value)) return 'bundle'
  if (/software|saas|crm/.test(value)) return 'software'
  return kind === 'product' ? 'software' : 'service'
}
