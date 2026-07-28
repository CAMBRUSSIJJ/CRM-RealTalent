import { describe, expect, it } from 'vitest'
import { renderTemplateVariables, validateEmailAttachments, type EmailAttachmentDraft } from './communications'

describe('Google e Microsoft V100.46', () => {
  it('substitui variáveis comerciais em assunto, texto e HTML', () => {
    expect(renderTemplateVariables('Olá {{ nome }} da {{empresa}}', { nome: 'Ana', empresa: 'Acme' })).toBe('Olá Ana da Acme')
  })
  it('remove variáveis sem valor em vez de expor o marcador', () => {
    expect(renderTemplateVariables('Telefone: {{telefone}}', {})).toBe('Telefone: ')
  })
  it('aceita anexos dentro dos limites operacionais', () => {
    const files: EmailAttachmentDraft[] = [{ id: '1', fileName: 'proposta.pdf', contentType: 'application/pdf', sizeBytes: 1024, base64: 'YQ==', disposition: 'attachment' }]
    expect(validateEmailAttachments(files)).toBe(1024)
  })
  it('bloqueia anexos individuais acima de 5 MB', () => {
    const files: EmailAttachmentDraft[] = [{ id: '1', fileName: 'grande.pdf', contentType: 'application/pdf', sizeBytes: 5 * 1024 * 1024 + 1, base64: '', disposition: 'attachment' }]
    expect(() => validateEmailAttachments(files)).toThrow('ultrapassa 5 MB')
  })
  it('bloqueia o total de anexos acima de 10 MB', () => {
    const files: EmailAttachmentDraft[] = Array.from({ length: 3 }, (_, index) => ({ id: String(index), fileName: `arquivo-${index}.pdf`, contentType: 'application/pdf', sizeBytes: 4 * 1024 * 1024, base64: '', disposition: 'attachment' as const }))
    expect(() => validateEmailAttachments(files)).toThrow('ultrapassa 10 MB')
  })
})
