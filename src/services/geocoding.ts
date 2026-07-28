import type { GeocodePrecision, GeocodeStatus, Lead } from '../domain/types'
import type { UpdateLeadInput } from '../repositories/crm-repository'

const CITY_COORDINATES: Record<string, [number, number]> = {
  canoas: [-29.9177, -51.1834],
  'porto alegre': [-30.0346, -51.2177],
  esteio: [-29.8614, -51.1793],
  sapucaia: [-29.8333, -51.15],
  'sapucaia do sul': [-29.8333, -51.15],
  'sao leopoldo': [-29.7604, -51.1472],
  'novo hamburgo': [-29.6875, -51.1328],
  gravatai: [-29.9441, -50.9919],
  cachoeirinha: [-29.9472, -51.0939],
  viamao: [-30.0819, -51.0233],
  guaiba: [-30.1139, -51.325],
  alvorada: [-29.9914, -51.0809],
  'campo bom': [-29.6742, -51.0619],
  sapiranga: [-29.6381, -51.0067],
  pelotas: [-31.7654, -52.3376],
  'rio grande': [-32.035, -52.0986],
  'caxias do sul': [-29.1678, -51.1794],
  caxias: [-29.1678, -51.1794],
  'santa maria': [-29.6842, -53.8069],
  'santa cruz do sul': [-29.7175, -52.4258],
  'bento goncalves': [-29.1717, -51.5189],
  farroupilha: [-29.225, -51.3478],
  lajeado: [-29.4669, -51.9614],
  'novo santa rita': [-29.8525, -51.2744],
  'eldorado do sul': [-30.0847, -51.6181],
}

const normalize = (value: string | undefined | null) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR')
const stableHash = (value: string) => Array.from(value).reduce((hash, character) => ((hash << 5) - hash + character.charCodeAt(0)) | 0, 0)
const clean = (value: string | undefined | null) => String(value ?? '').trim()

export const hasLeadCoordinates = (lead: Pick<Lead, 'latitude' | 'longitude'>) => Number.isFinite(Number(lead.latitude)) && Number.isFinite(Number(lead.longitude))

export const buildLeadAddress = (lead: Pick<Lead, 'street' | 'addressNumber' | 'complement' | 'district' | 'city' | 'state' | 'postalCode' | 'country'>) => {
  const street = [clean(lead.street), clean(lead.addressNumber)].filter(Boolean).join(', ')
  return [street, clean(lead.complement), clean(lead.district), clean(lead.city), clean(lead.state), clean(lead.postalCode), clean(lead.country) || 'Brasil'].filter(Boolean).join(' · ')
}

export const addressStatusForLead = (lead: Pick<Lead, 'street' | 'addressNumber' | 'city' | 'state'>): GeocodeStatus => {
  if (!clean(lead.city)) return 'incomplete'
  if (clean(lead.street) && clean(lead.addressNumber) && clean(lead.state)) return 'pending'
  return 'approximate'
}

export const geocodeStatusLabel: Record<GeocodeStatus, string> = {
  exact: 'Localização exata',
  manual: 'Posição corrigida',
  approximate: 'Localização aproximada',
  pending: 'Aguardando geocodificação',
  incomplete: 'Endereço incompleto',
  not_found: 'Endereço não encontrado',
}

export const geocodePrecisionLabel: Record<GeocodePrecision, string> = {
  rooftop: 'Número do imóvel',
  range_interpolated: 'Trecho da rua',
  street: 'Rua',
  district: 'Bairro',
  city: 'Cidade',
  manual: 'Ajuste manual',
  unknown: 'Não informada',
}

export const estimateLeadGeocode = (lead: Lead): UpdateLeadInput => {
  if (hasLeadCoordinates(lead)) return {}
  const city = CITY_COORDINATES[normalize(lead.city)]
  if (!city) {
    return {
      geocodeStatus: clean(lead.city) ? 'not_found' : 'incomplete',
      geocodePrecision: 'unknown',
      geocodeProvider: 'city_fallback',
      geocodeError: clean(lead.city) ? 'Cidade ainda não reconhecida no modo local.' : 'Informe pelo menos a cidade do lead.',
      geocodedAt: new Date().toISOString(),
    }
  }
  const hash = Math.abs(stableHash(`${lead.id}:${buildLeadAddress(lead) || lead.city}`))
  const spread = clean(lead.street) ? 12500 : 7000
  const latitude = city[0] + ((hash % 101) - 50) / spread
  const longitude = city[1] + (((Math.floor(hash / 101)) % 101) - 50) / spread
  const precision: GeocodePrecision = clean(lead.street) ? 'street' : clean(lead.district) ? 'district' : 'city'
  return {
    latitude,
    longitude,
    formattedAddress: buildLeadAddress(lead) || clean(lead.city),
    geocodeStatus: 'approximate',
    geocodePrecision: precision,
    geocodeProvider: 'city_fallback',
    geocodeError: 'Estimativa local. Conecte a Edge Function para obter a posição real do endereço.',
    geocodedAt: new Date().toISOString(),
  }
}
