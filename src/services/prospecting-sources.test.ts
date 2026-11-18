import { describe, expect, it } from 'vitest'
import {
  applyWebsiteSignals, buildSearchQuery, emptyDraft, extractCnpjs, extractWebsiteSignals, isPublicHttpUrl, isValidCnpj, mapBrasilApiCompany, mapGooglePlace, mergeDraft,
} from '../../supabase/functions/_shared/prospecting-sources'

const brasilApiPayload = {
  cnpj: '11222333000181', razao_social: 'BARBEARIA ALPHA LTDA', nome_fantasia: 'BARBEARIA ALPHA', descricao_situacao_cadastral: 'ATIVA',
  cnae_fiscal: 9602501, cnae_fiscal_descricao: 'Cabeleireiros, manicure e pedicure', porte: 'MICRO EMPRESA', natureza_juridica: 'Sociedade Empresária Limitada',
  capital_social: 50000, data_inicio_atividade: '2019-03-12', opcao_pelo_simples: true, opcao_pelo_mei: false,
  descricao_tipo_de_logradouro: 'RUA', logradouro: 'DAS FLORES', numero: '100', complemento: 'SALA 2', bairro: 'CENTRO', municipio: 'CANOAS', uf: 'RS', cep: '92010000',
  ddd_telefone_1: '5134567890', ddd_telefone_2: '51999991001', email: 'CONTATO@ALPHA.COM.BR',
  qsa: [{ nome_socio: 'JOAO DA SILVA', qualificacao_socio: 'Sócio-Administrador', data_entrada_sociedade: '2019-03-12' }],
}

describe('garimpo · fontes reais', () => {
  it('valida dígitos verificadores de CNPJ', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true)
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false)
    expect(isValidCnpj('11111111111111')).toBe(false)
    expect(extractCnpjs('CNPJ: 11.222.333/0001-81 · inválido 12.345.678/0001-00')).toEqual(['11222333000181'])
  })

  it('mapeia a resposta da Receita (BrasilAPI) com sócios, CNAE e contatos', () => {
    const company = mapBrasilApiCompany(brasilApiPayload)!
    expect(company).toMatchObject({
      cnpj: '11.222.333/0001-81', legalName: 'Barbearia Alpha Ltda', tradeName: 'Barbearia Alpha', registrationStatus: 'ATIVA',
      cnae: '9602-5/01', companySize: 'MICRO EMPRESA', shareCapital: 50000, city: 'Canoas', state: 'RS', email: 'contato@alpha.com.br', phone: '(51) 3456-7890',
    })
    expect(company.phones).toEqual(['(51) 3456-7890', '(51) 99999-1001'])
    expect(company.partners?.[0]).toMatchObject({ name: 'Joao Da Silva', role: 'Sócio-Administrador' })
    expect(company.address).toContain('Rua Das Flores, 100')
  })

  it('mapeia um resultado do Google Places', () => {
    const draft = mapGooglePlace({
      id: 'abc', displayName: { text: 'Barbearia Alpha' }, formattedAddress: 'R. das Flores, 100 - Centro, Canoas - RS, 92010-000',
      addressComponents: [{ longText: 'Canoas', shortText: 'Canoas', types: ['administrative_area_level_2', 'political'] }, { longText: 'Rio Grande do Sul', shortText: 'RS', types: ['administrative_area_level_1'] }],
      nationalPhoneNumber: '(51) 99999-1001', websiteUri: 'https://alpha.com.br/', googleMapsUri: 'https://maps.google.com/?cid=1', rating: 4.8, userRatingCount: 212,
      primaryTypeDisplayName: { text: 'Barbearia' }, businessStatus: 'OPERATIONAL',
    }, 'barbearias em Canoas')!
    expect(draft).toMatchObject({ company: 'Barbearia Alpha', city: 'Canoas', state: 'RS', phone: '(51) 99999-1001', whatsapp: '(51) 99999-1001', website: 'https://alpha.com.br/', rating: 4.8, reviewsCount: 212, category: 'Barbearia' })
    expect(mapGooglePlace({ displayName: {} }, 'x')).toBeNull()
  })

  it('extrai e-mail, WhatsApp, Instagram, CNPJ e sistema de agendamento do site', () => {
    const html = `<html><head><title>Alpha</title><meta name="description" content="Barbearia premium em Canoas"></head><body>
      <a href="mailto:contato@alpha.com.br">E-mail</a> <img src="logo@2x.png">
      <a href="https://wa.me/5551999991001">WhatsApp</a> <a href="tel:+555134567890">Ligar</a>
      <a href="https://www.instagram.com/p/xyz">post</a><a href="https://instagram.com/barbearia.alpha/">Insta</a>
      <a href="https://www.facebook.com/sharer/sharer.php">share</a><a href="https://facebook.com/barbeariaalpha">fb</a>
      <a href="https://www.trinks.com/barbearia-alpha">Agende</a> <a href="/contato">Contato</a>
      <footer>CNPJ 11.222.333/0001-81</footer><script>var x = "sentry@abc.ingest.sentry.io"</script></body></html>`
    const signals = extractWebsiteSignals(html, 'https://alpha.com.br/')
    expect(signals.emails).toEqual(['contato@alpha.com.br'])
    expect(signals.whatsapp).toBe('(51) 99999-1001')
    expect(signals.phones).toContain('(51) 3456-7890')
    expect(signals.instagram).toBe('@barbearia.alpha')
    expect(signals.socials.facebook).toBe('https://facebook.com/barbeariaalpha')
    expect(signals.cnpjs).toEqual(['11222333000181'])
    expect(signals).toMatchObject({ systemName: 'Trinks', bookingUrl: 'https://www.trinks.com/barbearia-alpha', description: 'Barbearia premium em Canoas' })
    expect(signals.contactPages).toEqual(['https://alpha.com.br/contato'])
  })

  it('mescla sem sobrescrever dados já confirmados', () => {
    const base = { ...emptyDraft('maps'), company: 'Alpha', phone: '(51) 99999-1001', phones: ['(51) 99999-1001'] }
    const merged = mergeDraft(base, mapBrasilApiCompany(brasilApiPayload)!)
    expect(merged.company).toBe('Alpha')
    expect(merged.phone).toBe('(51) 99999-1001')
    expect(merged.phones).toEqual(['(51) 99999-1001', '(51) 3456-7890'])
    expect(merged.legalName).toBe('Barbearia Alpha Ltda')
    const withSite = applyWebsiteSignals(merged, extractWebsiteSignals('<a href="https://instagram.com/alpha">i</a>', 'https://alpha.com.br'))
    expect(withSite.instagram).toBe('@alpha')
  })

  it('bloqueia URLs internas antes de buscar sites', () => {
    expect(isPublicHttpUrl('https://alpha.com.br')).toBe(true)
    for (const url of ['http://localhost/x', 'http://127.0.0.1', 'http://169.254.169.254/latest', 'http://[::1]/', 'file:///etc/passwd', 'http://db.internal', 'https://alpha.com.br:5432', 'http://user:pw@alpha.com.br']) {
      expect(isPublicHttpUrl(url)).toBe(false)
    }
  })

  it('monta a consulta de busca por segmento e cidade', () => {
    expect(buildSearchQuery('Barbearias', 'Canoas, RS', '')).toBe('Barbearias em Canoas, RS')
    expect(buildSearchQuery('Barbearias', 'Canoas', 'barbearia infantil')).toBe('barbearia infantil em Canoas')
  })
})
